---
name: bilibili-video-evidence
description: Collect evidence artifacts from a Bilibili video URL. Fetch native subtitles, save `sectioned.md`, write normalized `subtitles.json`, capture `frames/*.png`, and optionally validate a repo-local screenshot endpoint with `smoke-report.json`. Use when Codex needs a Bilibili evidence bundle from `videoUrl`, direct frame capture by timestamp, subtitle download, transcript sectioning, screenshot endpoint smoke testing, or login-gated subtitle handling.
---

# Bilibili Video Evidence

Collect evidence first. Write notes later.

## Workflow

1. Parse the BV id and optional `p=` page index from the user URL.
2. Fetch native subtitles before considering ASR or summaries.
3. Write transcript artifacts with `scripts/bilibili_subtitle_to_md.py`.
4. Capture direct frame artifacts with `scripts/capture_bilibili_screenshot.js` when the user wants PNG evidence files.
5. Inspect the repo for an existing screenshot endpoint before adding code.
6. Run `scripts/smoke_bilibili_endpoint.js` only when the task is specifically about validating a repo-local screenshot route.
7. Report subtitle access and screenshot access separately.

## Outputs

- `sectioned.md`
- `subtitles.json`
- `frames/*.png`
- optional `smoke-report.json`

## Run

Use:

```bash
python scripts/bilibili_subtitle_to_md.py \
  --url "https://www.bilibili.com/video/BV1X7411F744?p=5" \
  --output "sectioned.md" \
  --json-output "subtitles.json"
```

Capture a frame directly:

```bash
node scripts/capture_bilibili_screenshot.js \
  "https://www.bilibili.com/video/BV15DG7zxENa/" \
  00:24 \
  --output=frames/intro.png
```

Validate a repo-local screenshot endpoint:

```bash
node scripts/smoke_bilibili_endpoint.js <repo-root> <bilibili-url> --timestamps=00:13,10:25
```

## Cookie Handling

- Prefer the full browser `Cookie` header over `SESSDATA` alone.
- Accept either `--cookie` or `--cookie-file`.
- If neither is passed, the subtitle script may fall back to `BILIBILI_COOKIE` or `BILIBILI_SESSION_TOKEN` from the environment.
- Strip a leading `Cookie:` prefix if the user pasted a raw header line.
- Try `x/player/v2` first and keep `x/player/wbi/v2` as a fallback source.
- If login-gated subtitle access still fails, ask for a fresh full `Cookie` header or `Copy as cURL`.
- Treat frame capture success and subtitle access as separate checks.

## Subtitle Artifacts

The subtitle script writes Markdown with:

- video title
- source URL
- BV id and CID
- page index and page title
- subtitle language and subtitle URL
- subtitle count
- timeline sections grouped by fixed-length buckets

If `--output` is omitted, the default Markdown filename is the sanitized video title.

Each section looks like:

```md
### 05:00 - 05:59

- `05:03` Subtitle text
- `05:07` Another subtitle line
```

## Frame Artifacts

- Default direct-capture output goes under `frames/`.
- Prefer one representative PNG per requested timestamp.
- Read [references/implementation.md](references/implementation.md) for the compact rules.
- Read [references/keyframe-reference.md](references/keyframe-reference.md) when you need the detailed rationale behind HTML parsing, stream selection, timestamp handling, or ffmpeg flags.

## Endpoint Smoke

When the user wants screenshot endpoint validation instead of standalone PNG capture:

1. Search the repo for `ffmpeg`, `__playinfo__`, `/api/bilibili/screenshot`, `ffmpeg-static`, and `captureBilibiliScreenshot`.
2. Prefer reusing an existing server-side screenshot endpoint over adding a new one.
3. Run the smoke script against the repo root and video URL.
4. Treat a `200 image/jpeg` response for two timestamps as the minimum passing smoke test.
   The smoke script should fail if a response is empty or does not look like a JPEG.

If the target repo already has `scripts/smoke-bilibili.js`, reuse it instead of duplicating logic.

## Validation

Before finishing:

1. Confirm the page title and page number match the requested URL.
2. Confirm the subtitle list is non-empty when subtitle output was requested.
3. Confirm timestamps increase monotonically in the first few lines of `sectioned.md`.
4. Confirm the Markdown file exists on disk.
5. If `subtitles.json` was requested, confirm it exists and includes API-source metadata plus merged groups.
6. If PNG frames were requested, confirm the files exist under `frames/` or the requested output path.
7. If smoke testing was requested, confirm the endpoint returns non-empty JPEGs and records `smoke-report.json`.
8. If subtitle and screenshot checks differ, report them separately instead of collapsing them into one status.

## Failure Handling

- If no BV id can be parsed, fail clearly.
- If the requested `p=` is out of range, fail clearly.
- If the subtitle track is missing, say the page currently exposes no subtitle track.
- If login-gated subtitles still fail with a full cookie, ask for a fresh cookie or copied cURL request.
- If direct frame capture works but subtitle access fails, report them separately instead of collapsing them into one failure.
- If the screenshot endpoint works but subtitle access fails, report them separately instead of collapsing them into one failure.
- Do not claim that ASR was used unless you actually switched to ASR.
