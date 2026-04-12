#!/usr/bin/env node

const crypto = require('crypto')
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const { spawn } = require('child_process')

const DEFAULT_PORT = 3012
const DEFAULT_TIMESTAMPS = ['00:13', '10:25']
const DEFAULT_TIMEOUT_MS = 45_000
const JPEG_MAGIC_BYTES = [0xff, 0xd8, 0xff]
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'

function parseArgs(argv) {
  const options = {
    port: DEFAULT_PORT,
    repoRoot: '',
    skipSubtitles: false,
    timestamps: [...DEFAULT_TIMESTAMPS],
    videoUrl: '',
  }

  for (const arg of argv) {
    if (arg === '--skip-subtitles') {
      options.skipSubtitles = true
      continue
    }

    if (arg.startsWith('--port=')) {
      options.port = Number(arg.slice('--port='.length))
      continue
    }

    if (arg.startsWith('--timestamps=')) {
      options.timestamps = arg
        .slice('--timestamps='.length)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      continue
    }

    if (!options.repoRoot) {
      options.repoRoot = path.resolve(arg)
      continue
    }

    if (!options.videoUrl) {
      options.videoUrl = arg.trim()
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.repoRoot || !options.videoUrl) {
    throw new Error(
      'Usage: node scripts/smoke_bilibili_endpoint.js <repo-root> <bilibili-url> [--timestamps=00:13,10:25] [--port=3012] [--skip-subtitles]',
    )
  }

  if (!Number.isFinite(options.port) || options.port <= 0) {
    throw new Error('Port must be a positive number')
  }

  return options
}

function parseEnvFile(content) {
  const env = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex < 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }

  return env
}

async function loadEnvFiles(repoRoot) {
  for (const fileName of ['.env.local', '.env']) {
    const filePath = path.join(repoRoot, fileName)
    if (!fs.existsSync(filePath)) {
      continue
    }

    const envContent = await fsp.readFile(filePath, 'utf8')
    const envEntries = parseEnvFile(envContent)
    for (const [key, value] of Object.entries(envEntries)) {
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
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

function extractVideoId(videoUrl) {
  return videoUrl.match(/\/video\/([^/?]+)/i)?.[1] || ''
}

function sanitizeFilePart(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '-')
}

function getArtifactSubdir() {
  return process.env.BILIBILI_SMOKE_ARTIFACT_SUBDIR || 'skill-smoke'
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function getRawCookie() {
  if (process.env.BILIBILI_COOKIE) {
    return process.env.BILIBILI_COOKIE
  }

  const token = String(process.env.BILIBILI_SESSION_TOKEN || '')
    .split(',')
    .map((item) => item.trim())
    .find(Boolean)

  return token ? `SESSDATA=${token}` : ''
}

async function inspectVideoPage(videoUrl) {
  const response = await fetch(videoUrl, {
    headers: {
      Referer: 'https://www.bilibili.com/',
      'User-Agent': DEFAULT_USER_AGENT,
    },
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(`Video page request failed: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()
  const playInfo = extractScriptJson(html, '__playinfo__')
  const initialState = extractScriptJson(html, '__INITIAL_STATE__')
  const videoId = extractVideoId(videoUrl)

  return {
    durationSeconds: Math.max(0, Number(playInfo?.data?.timelength || 0) / 1000),
    htmlLength: html.length,
    pageNumber: Number(new URL(videoUrl).searchParams.get('p') || 1),
    title: initialState?.videoData?.title || initialState?.h1Title || videoId,
    videoId,
  }
}

async function waitForServerReady(url, child, timeoutMs) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Dev server exited early with code ${child.exitCode}`)
    }

    try {
      const response = await fetch(url)
      if (response.status > 0) {
        return
      }
    } catch {
      // Keep polling until ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for ${url}`)
}

async function stopProcessTree(child) {
  if (!child || child.exitCode !== null) {
    return
  }

  if (process.platform === 'win32') {
    await new Promise((resolve, reject) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: ['ignore', 'ignore', 'ignore'],
      })
      killer.on('error', reject)
      killer.on('close', () => resolve())
    })
    return
  }

  child.kill('SIGTERM')
}

async function startNextDevServer(repoRoot, port, artifactDir) {
  const stdoutPath = path.join(artifactDir, `next-dev-${port}.log`)
  const stderrPath = path.join(artifactDir, `next-dev-${port}.err.log`)
  const stdoutStream = fs.createWriteStream(stdoutPath)
  const stderrStream = fs.createWriteStream(stderrPath)
  const nextBinPath = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next')

  const child = spawn(process.execPath, [nextBinPath, 'dev', '-p', String(port)], {
    cwd: repoRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => stdoutStream.write(chunk))
  child.stderr.on('data', (chunk) => stderrStream.write(chunk))

  try {
    await waitForServerReady(`http://127.0.0.1:${port}/`, child, DEFAULT_TIMEOUT_MS)
    return { child, stderrPath, stdoutPath }
  } catch (error) {
    await stopProcessTree(child)
    throw error
  }
}

async function runScreenshotCheck(port, videoUrl, timestamp, outputPath) {
  const apiUrl =
    `http://127.0.0.1:${port}/api/bilibili/screenshot?videoUrl=` +
    encodeURIComponent(videoUrl) +
    `&timestamp=` +
    encodeURIComponent(timestamp)

  const response = await fetch(apiUrl)
  const buffer = Buffer.from(await response.arrayBuffer())

  if (!response.ok) {
    throw new Error(buffer.toString('utf8') || response.statusText)
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().startsWith('image/jpeg')) {
    throw new Error(`Expected image/jpeg but received ${contentType || 'an empty content-type header'}`)
  }

  if (buffer.length < 1) {
    throw new Error('Screenshot response was empty')
  }

  const hasJpegSignature = JPEG_MAGIC_BYTES.every((byte, index) => buffer[index] === byte)
  if (!hasJpegSignature) {
    throw new Error('Screenshot response did not start with a JPEG signature')
  }

  await fsp.writeFile(outputPath, buffer)

  return {
    bytes: buffer.length,
    contentType,
    jpegSignature: 'ffd8ff',
    outputPath,
    pageNumber: response.headers.get('x-bilibili-page-number'),
    sha256: sha256(buffer),
    timestamp: response.headers.get('x-screenshot-timestamp-seconds'),
    videoId: response.headers.get('x-bilibili-video-id'),
  }
}

async function runCommand(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdoutChunks = []
    const stderrChunks = []

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk))
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        })
        return
      }

      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim()
      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim()
      reject(new Error(stderr || stdout || `${command} exited with code ${code}`))
    })
  })
}

async function runSubtitleCheck(repoRoot, videoUrl, rawCookie, artifactDir) {
  const subtitleScriptPath = path.join(
    repoRoot,
    'skills',
    'bilibili-video-evidence',
    'scripts',
    'bilibili_subtitle_to_md.py',
  )
  const subtitleOutputPath = path.join(artifactDir, 'sectioned.md')
  const subtitleJsonPath = path.join(artifactDir, 'subtitles.json')
  const args = [
    subtitleScriptPath,
    '--url',
    videoUrl,
    '--output',
    subtitleOutputPath,
    '--json-output',
    subtitleJsonPath,
  ]

  if (rawCookie) {
    args.push('--cookie', rawCookie)
  }

  await runCommand('python', args, {
    cwd: repoRoot,
    env: process.env,
  })
  const subtitleJson = JSON.parse(await fsp.readFile(subtitleJsonPath, 'utf8'))

  return {
    jsonPath: subtitleJsonPath,
    markdownPath: subtitleOutputPath,
    pageNumber: subtitleJson.page_number,
    pageTitle: subtitleJson.page_title,
    subtitleCount: subtitleJson.subtitle_body_count,
    subtitleLang: subtitleJson.subtitle_language,
    title: subtitleJson.title,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  await loadEnvFiles(options.repoRoot)

  const page = await inspectVideoPage(options.videoUrl)
  const artifactDir = path.join(
    options.repoRoot,
    'artifacts',
    getArtifactSubdir(),
    `${sanitizeFilePart(page.videoId || 'bilibili')}-${Date.now()}`,
  )
  await fsp.mkdir(artifactDir, { recursive: true })
  const framesDir = path.join(artifactDir, 'frames')
  await fsp.mkdir(framesDir, { recursive: true })

  const report = {
    artifacts: { dir: artifactDir, framesDir },
    checks: {
      screenshots: {
        ok: false,
        requestedTimestamps: [...options.timestamps],
      },
      subtitles: options.skipSubtitles
        ? {
            ok: null,
            skipped: true,
          }
        : {
            ok: false,
            skipped: false,
            warning: false,
          },
    },
    ok: false,
    page,
    screenshots: [],
    startedAt: new Date().toISOString(),
    subtitles: null,
    videoUrl: options.videoUrl,
  }

  const rawCookie = getRawCookie()
  let serverHandle = null

  try {
    if (!options.skipSubtitles) {
      try {
        report.subtitles = {
          ...(await runSubtitleCheck(options.repoRoot, options.videoUrl, rawCookie, artifactDir)),
          ok: true,
        }
        report.checks.subtitles = {
          ok: true,
          skipped: false,
          warning: false,
        }
      } catch (error) {
        const warning = !rawCookie
        report.subtitles = {
          errorMessage: error instanceof Error ? error.message : String(error),
          ok: false,
          warning,
        }
        report.checks.subtitles = {
          ok: false,
          skipped: false,
          warning,
        }
      }
    }

    serverHandle = await startNextDevServer(options.repoRoot, options.port, artifactDir)
    report.artifacts.nextDevLog = serverHandle.stdoutPath
    report.artifacts.nextDevErrLog = serverHandle.stderrPath

    for (const timestamp of options.timestamps) {
      const outputPath = path.join(
        framesDir,
        `${sanitizeFilePart(page.videoId)}-${sanitizeFilePart(timestamp)}.jpg`,
      )
      report.screenshots.push({
        ok: true,
        requestedTimestamp: timestamp,
        ...(await runScreenshotCheck(options.port, options.videoUrl, timestamp, outputPath)),
      })
    }

    report.checks.screenshots.ok = report.screenshots.length === options.timestamps.length
    report.ok = true
  } catch (error) {
    report.errorMessage = error instanceof Error ? error.message : String(error)
  } finally {
    if (serverHandle) {
      await stopProcessTree(serverHandle.child)
    }
  }

  const reportPath = path.join(artifactDir, 'smoke-report.json')
  await fsp.writeFile(reportPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ reportPath, ...report }, null, 2))

  if (!report.ok) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
