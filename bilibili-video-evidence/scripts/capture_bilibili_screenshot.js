#!/usr/bin/env node

// This file is both:
// 1. a reusable module that other scripts can import
// 2. a standalone CLI that can directly save one Bilibili frame to a PNG file
//
// The goal is to make this skill self-sufficient: a caller should be able to
// provide only a video URL plus a timestamp and get a real PNG back, without
// first wiring a repo-local `/api/bilibili/screenshot` endpoint.

const crypto = require('crypto')
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const { spawn } = require('child_process')

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
const BILIBILI_ORIGIN = 'https://www.bilibili.com'
const FFMPEG_TIMEOUT_MS = 45_000
const MAX_SCREENSHOT_WIDTH = 1280

function normalizeCookie(rawCookie = '') {
  return rawCookie.replace(/^Cookie:\s*/i, '').trim()
}

function pickSessionToken(rawValue = '') {
  return String(rawValue)
    .split(',')
    .map((item) => item.trim())
    .find(Boolean)
}

async function readCookieFile(cookieFile) {
  if (!cookieFile) {
    return ''
  }

  const fileContent = await fsp.readFile(cookieFile, 'utf8')
  return normalizeCookie(fileContent)
}

function getBilibiliCookie(rawCookie = '') {
  const normalizedCookie = normalizeCookie(rawCookie || process.env.BILIBILI_COOKIE || '')
  if (normalizedCookie) {
    return normalizedCookie
  }

  const sessionToken = pickSessionToken(process.env.BILIBILI_SESSION_TOKEN || '')
  return sessionToken ? `SESSDATA=${sessionToken}` : undefined
}

function createBilibiliHeaders(referer, rawCookie = '') {
  const cookie = getBilibiliCookie(rawCookie)

  return {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Origin: BILIBILI_ORIGIN,
    Referer: referer,
    'User-Agent': DEFAULT_USER_AGENT,
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

function extractScriptJson(html, variableName) {
  const scriptPattern = new RegExp(`<script>window\\.${variableName}=([\\s\\S]*?)<\\/script>`)
  const match = html.match(scriptPattern)
  if (!match || !match[1]) {
    throw new Error(`Bilibili page is missing ${variableName}`)
  }

  const scriptContent = match[1]

  try {
    return JSON.parse(scriptContent)
  } catch {
    const trailingScriptIndex = scriptContent.indexOf(';(function')
    if (trailingScriptIndex < 0) {
      throw new Error(`Bilibili page contains invalid ${variableName}`)
    }

    return JSON.parse(scriptContent.slice(0, trailingScriptIndex))
  }
}

function getStreamUrl(video) {
  return video.baseUrl || video.base_url || video.backupUrl?.[0] || video.backup_url?.[0]
}

function selectBestDashVideo(videos = []) {
  if (videos.length < 1) {
    throw new Error('No playable Bilibili video stream found')
  }

  const avcVideos = videos.filter((video) => video.codecs?.startsWith('avc1'))
  const candidates = avcVideos.length > 0 ? avcVideos : videos

  return [...candidates].sort((left, right) => (right.id || 0) - (left.id || 0))[0]
}

function buildFfmpegHeaders(headers) {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}\r\n`)
    .join('')
}

function getSafeScreenshotSecond(seconds, durationSeconds) {
  if (durationSeconds <= 0) {
    return seconds
  }

  const endBufferSeconds = durationSeconds > 1 ? 0.25 : 0
  return Math.max(0, Math.min(seconds, Math.max(durationSeconds - endBufferSeconds, 0)))
}

function parseNumericTimestamp(value) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('Timestamp must be a non-negative number')
  }

  return seconds
}

function parseTimestampToSeconds(timestamp) {
  if (typeof timestamp === 'number') {
    return parseNumericTimestamp(String(timestamp))
  }

  const normalized = String(timestamp || '')
    .trim()
    .replace(/s$/i, '')

  if (!normalized) {
    throw new Error('Timestamp is required')
  }

  if (/^\d+(\.\d+)?$/.test(normalized)) {
    return parseNumericTimestamp(normalized)
  }

  const parts = normalized.split(':')
  if (parts.length < 2 || parts.length > 3) {
    throw new Error('Timestamp must look like 83, 01:23 or 01:02:03')
  }

  const numericParts = parts.map((part) => Number(part))
  if (numericParts.some((part) => !Number.isFinite(part) || part < 0)) {
    throw new Error('Timestamp contains invalid time parts')
  }

  if (parts.length === 2) {
    const [minutes, seconds] = numericParts
    return minutes * 60 + seconds
  }

  const [hours, minutes, seconds] = numericParts
  return hours * 3600 + minutes * 60 + seconds
}

function extractBilibiliVideoId(videoUrl) {
  return videoUrl.match(/\/video\/([^/?]+)/i)?.[1]
}

function extractBilibiliPageNumber(videoUrl) {
  try {
    const parsedUrl = new URL(videoUrl)
    const pageNumber = Number(parsedUrl.searchParams.get('p') || 1)
    return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1
  } catch {
    return 1
  }
}

function resolveFfmpegPath() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH
  }

  const ffmpegPath = require('ffmpeg-static')
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static is not available')
  }

  return ffmpegPath
}

async function resolvePlaybackSource(videoUrl, rawCookie = '') {
  const videoId = extractBilibiliVideoId(videoUrl)
  if (!videoId) {
    throw new Error('Unable to parse Bilibili video id from the provided URL')
  }

  const pageNumber = extractBilibiliPageNumber(videoUrl)
  const referer = `${BILIBILI_ORIGIN}/video/${videoId}/?p=${pageNumber}`
  const response = await fetch(referer, {
    headers: createBilibiliHeaders(referer, rawCookie),
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(`Bilibili page request failed: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()
  const playInfo = extractScriptJson(html, '__playinfo__')
  const initialState = extractScriptJson(html, '__INITIAL_STATE__')
  const selectedVideo = selectBestDashVideo(playInfo.data?.dash?.video || [])
  const streamUrl = getStreamUrl(selectedVideo)

  if (!streamUrl) {
    throw new Error('Unable to resolve a direct Bilibili video stream URL')
  }

  return {
    durationSeconds: Math.max(0, Number(playInfo.data?.timelength || 0) / 1000),
    pageNumber,
    streamUrl,
    title: initialState.videoData?.title || initialState.h1Title || videoId,
    videoId,
  }
}

async function captureFrameFromStream(streamUrl, seconds) {
  const ffmpegPath = resolveFfmpegPath()
  const fastSeekSeconds = Math.max(0, seconds - 3)
  const accurateSeekSeconds = Math.max(0, seconds - fastSeekSeconds)
  const ffmpegArgs = [
    '-v',
    'error',
    '-headers',
    buildFfmpegHeaders({
      Origin: BILIBILI_ORIGIN,
      Referer: `${BILIBILI_ORIGIN}/`,
      'User-Agent': DEFAULT_USER_AGENT,
    }),
    '-ss',
    fastSeekSeconds.toFixed(3),
    '-i',
    streamUrl,
    '-ss',
    accurateSeekSeconds.toFixed(3),
    '-frames:v',
    '1',
    '-vf',
    `scale='min(${MAX_SCREENSHOT_WIDTH},iw)':-2`,
    '-f',
    'image2pipe',
    '-vcodec',
    'png',
    'pipe:1',
  ]

  return await new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdoutChunks = []
    const stderrChunks = []
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('Frame capture timed out'))
    }, FFMPEG_TIMEOUT_MS)

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(chunk)
    })

    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk)
    })

    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })

    child.on('close', (code) => {
      clearTimeout(timeout)

      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8').trim()
        reject(new Error(stderr || `ffmpeg exited with code ${code}`))
        return
      }

      const outputBuffer = Buffer.concat(stdoutChunks)
      if (outputBuffer.length < 1) {
        reject(new Error('ffmpeg returned an empty screenshot'))
        return
      }

      resolve(outputBuffer)
    })
  })
}

async function captureBilibiliScreenshot(input) {
  const requestedSeconds = parseTimestampToSeconds(input.timestamp)
  const playbackSource = await resolvePlaybackSource(input.videoUrl, input.rawCookie)
  const safeSeconds = getSafeScreenshotSecond(requestedSeconds, playbackSource.durationSeconds)
  const imageBuffer = await captureFrameFromStream(playbackSource.streamUrl, safeSeconds)

  return {
    bytes: imageBuffer.length,
    contentType: 'image/png',
    imageBuffer,
    pageNumber: playbackSource.pageNumber,
    seconds: safeSeconds,
    title: playbackSource.title,
    videoId: playbackSource.videoId,
  }
}

function sanitizeFilePart(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '-')
}

function buildDefaultOutputPath(videoId, pageNumber, seconds) {
  const safeSeconds = String(Math.floor(seconds)).padStart(4, '0')
  return path.resolve('frames', `${sanitizeFilePart(videoId)}-p${pageNumber}-${safeSeconds}s.png`)
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function saveBilibiliScreenshot(input) {
  const result = await captureBilibiliScreenshot(input)
  const outputPath = path.resolve(
    input.output || buildDefaultOutputPath(result.videoId, result.pageNumber, result.seconds),
  )

  await fsp.mkdir(path.dirname(outputPath), { recursive: true })
  await fsp.writeFile(outputPath, result.imageBuffer)

  return {
    ...result,
    outputPath,
    sha256: sha256(result.imageBuffer),
  }
}

function parseArgs(argv) {
  const options = {
    cookie: '',
    cookieFile: '',
    output: '',
    printJson: false,
    timestamp: '',
    videoUrl: '',
  }

  for (const arg of argv) {
    if (arg === '--json') {
      options.printJson = true
      continue
    }

    if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length)
      continue
    }

    if (arg.startsWith('--cookie=')) {
      options.cookie = arg.slice('--cookie='.length)
      continue
    }

    if (arg.startsWith('--cookie-file=')) {
      options.cookieFile = arg.slice('--cookie-file='.length)
      continue
    }

    if (!options.videoUrl) {
      options.videoUrl = arg.trim()
      continue
    }

    if (!options.timestamp) {
      options.timestamp = arg.trim()
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.videoUrl || !options.timestamp) {
    throw new Error(
      'Usage: node scripts/capture_bilibili_screenshot.js <bilibili-url> <timestamp> [--output=frame.png] [--cookie=...] [--cookie-file=cookie.txt] [--json]',
    )
  }

  return options
}

async function resolveCliCookie(options) {
  if (options.cookie) {
    return normalizeCookie(options.cookie)
  }

  if (options.cookieFile) {
    return await readCookieFile(options.cookieFile)
  }

  return ''
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const rawCookie = await resolveCliCookie(options)
  const result = await saveBilibiliScreenshot({
    output: options.output,
    rawCookie,
    timestamp: options.timestamp,
    videoUrl: options.videoUrl,
  })

  const payload = {
    bytes: result.bytes,
    contentType: result.contentType,
    outputPath: result.outputPath,
    pageNumber: result.pageNumber,
    sha256: result.sha256,
    timestamp: result.seconds.toFixed(3),
    title: result.title,
    videoId: result.videoId,
  }

  if (options.printJson) {
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  console.log(`Saved PNG to: ${payload.outputPath}`)
  console.log(`Video: ${payload.videoId} (P${payload.pageNumber})`)
  console.log(`Timestamp: ${payload.timestamp}s`)
  console.log(`Bytes: ${payload.bytes}`)
  console.log(`SHA256: ${payload.sha256}`)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}

module.exports = {
  captureBilibiliScreenshot,
  extractBilibiliPageNumber,
  extractBilibiliVideoId,
  parseTimestampToSeconds,
  resolvePlaybackSource,
  saveBilibiliScreenshot,
}
