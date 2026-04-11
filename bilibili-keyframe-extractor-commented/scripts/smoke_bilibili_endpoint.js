#!/usr/bin/env node

// This script performs an end-to-end smoke test against a local repo that
// exposes a Bilibili screenshot endpoint.
//
// High-level flow:
// 1. Parse CLI arguments.
// 2. Load repo-local environment variables from .env.local / .env.
// 3. Inspect the Bilibili HTML page to confirm it is parseable.
// 4. Optionally test subtitle access.
// 5. Start the repo's local Next.js dev server.
// 6. Call the screenshot endpoint for one or more timestamps.
// 7. Write images and a JSON report to the repo's artifacts directory.
// 8. Stop the dev server, even on failure.

const crypto = require('crypto')
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const { pathToFileURL } = require('url')
const { spawn } = require('child_process')

// Default port used when the caller does not provide one.
const DEFAULT_PORT = 3012

// Two timestamps are used by default because one image alone can mask bugs.
// Producing two different frames is a stronger smoke test than producing one.
const DEFAULT_TIMESTAMPS = ['00:13', '10:25']

// Upper bound for waiting on the local dev server to become ready.
const DEFAULT_TIMEOUT_MS = 45_000

// Browser-like user agent for fetching Bilibili HTML pages.
// This helps avoid behavior differences between raw bots and normal browsers.
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'

function parseArgs(argv) {
  // The script expects:
  //   node smoke_bilibili_endpoint.js <repo-root> <bilibili-url> [options]
  //
  // Supported options:
  //   --port=3012
  //   --timestamps=00:13,10:25
  //   --skip-subtitles
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

    // The first positional argument is the repo root.
    if (!options.repoRoot) {
      options.repoRoot = path.resolve(arg)
      continue
    }

    // The second positional argument is the Bilibili URL.
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
  // Parse a very small .env subset:
  // - ignore blank lines
  // - ignore comments
  // - split on the first "="
  // - strip surrounding quotes
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }

  return env
}

async function loadEnvFiles(repoRoot) {
  // Load repo-local env files into process.env without overwriting values
  // that the caller already injected into the process.
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
  // Extract script payload from:
  //   <script>window.__playinfo__=...</script>
  // or:
  //   <script>window.__INITIAL_STATE__=...</script>
  const scriptPattern = new RegExp(`<script>window\\.${variableName}=([\\s\\S]*?)<\\/script>`)
  const match = html.match(scriptPattern)
  if (!match || !match[1]) {
    throw new Error(`Bilibili page is missing ${variableName}`)
  }

  const scriptContent = match[1]
  try {
    return JSON.parse(scriptContent)
  } catch {
    // Bilibili sometimes appends `;(function...)` after the JSON payload in the
    // same script block. Trim that suffix and try again.
    const trailingScriptIndex = scriptContent.indexOf(';(function')
    if (trailingScriptIndex < 0) {
      throw new Error(`Bilibili page contains invalid ${variableName}`)
    }

    return JSON.parse(scriptContent.slice(0, trailingScriptIndex))
  }
}

function extractVideoId(videoUrl) {
  // Extract BV/av id from a standard /video/<id> URL.
  return videoUrl.match(/\/video\/([^/?]+)/i)?.[1] || ''
}

function sanitizeFilePart(value) {
  // Remove characters that are illegal in Windows filenames and normalize
  // whitespace to hyphens so artifact names are stable and portable.
  return String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '-')
}

function sha256(buffer) {
  // Hash output files so the report can prove different frames were produced.
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function getRawCookie() {
  // Prefer the full Bilibili cookie when present.
  // Fall back to SESSDATA if only BILIBILI_SESSION_TOKEN exists.
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
  // This is the first real validation step:
  // if the page cannot be fetched or parsed, the screenshot pipeline will fail.
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
  // Poll the local dev server until it starts responding or times out.
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
      // Ignore transient connection failures while the dev server is still booting.
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for ${url}`)
}

async function stopProcessTree(child) {
  // Stop the dev server and its children so smoke tests do not leak processes.
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
  // Start the repo's Next.js dev server and write stdout/stderr to files
  // so failures remain inspectable after the script exits.
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
  // Call the screenshot endpoint, save the returned image, and capture metadata
  // from the response headers for the final report.
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

  await fsp.writeFile(outputPath, buffer)

  return {
    bytes: buffer.length,
    contentType: response.headers.get('content-type'),
    outputPath,
    pageNumber: response.headers.get('x-bilibili-page-number'),
    sha256: sha256(buffer),
    timestamp: response.headers.get('x-screenshot-timestamp-seconds'),
    videoId: response.headers.get('x-bilibili-video-id'),
  }
}

async function runSubtitleCheck(repoRoot, videoUrl, rawCookie) {
  // Subtitle access is checked separately because subtitle APIs may require
  // login state even when frame extraction works anonymously.
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'bilibili-video-summary-system', 'server', 'bilibili.js')).href
  const { fetchVideoContext } = await import(moduleUrl)
  const result = await fetchVideoContext({ rawCookie, videoUrl })

  return {
    pageNumber: result.pageNumber,
    pageTitle: result.pageTitle,
    subtitleCount: result.subtitleCount,
    subtitleLang: result.subtitleLang,
    title: result.title,
  }
}

async function main() {
  // Main orchestration function.
  const options = parseArgs(process.argv.slice(2))
  await loadEnvFiles(options.repoRoot)

  const page = await inspectVideoPage(options.videoUrl)
  const artifactDir = path.join(
    options.repoRoot,
    'artifacts',
    'skill-smoke',
    `${sanitizeFilePart(page.videoId || 'bilibili')}-${Date.now()}`,
  )
  await fsp.mkdir(artifactDir, { recursive: true })

  // The report is always written, even if a later step fails.
  const report = {
    artifacts: { dir: artifactDir },
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
    // Subtitle validation is optional because it tests a separate capability.
    if (!options.skipSubtitles) {
      try {
        report.subtitles = {
          ...(await runSubtitleCheck(options.repoRoot, options.videoUrl, rawCookie)),
          ok: true,
        }
      } catch (error) {
        report.subtitles = {
          errorMessage: error instanceof Error ? error.message : String(error),
          ok: false,
          // Mark subtitle failure as a warning when no cookie was available.
          warning: !rawCookie,
        }
      }
    }

    serverHandle = await startNextDevServer(options.repoRoot, options.port, artifactDir)
    report.artifacts.nextDevLog = serverHandle.stdoutPath
    report.artifacts.nextDevErrLog = serverHandle.stderrPath

    // Request screenshots for each timestamp and write them to disk.
    for (const timestamp of options.timestamps) {
      const outputPath = path.join(
        artifactDir,
        `${sanitizeFilePart(page.videoId)}-${sanitizeFilePart(timestamp)}.jpg`,
      )
      report.screenshots.push({
        ok: true,
        requestedTimestamp: timestamp,
        ...(await runScreenshotCheck(options.port, options.videoUrl, timestamp, outputPath)),
      })
    }

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
