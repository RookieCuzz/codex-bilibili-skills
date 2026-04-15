# bilibili-video-evidence

Turn a Bilibili `videoUrl` into evidence artifacts that downstream note-writing can consume.

## What it does

- Parses a Bilibili URL and resolves `BV` plus optional `p=` page index.
- Fetches subtitle metadata from Bilibili player APIs.
- Chooses a usable subtitle track and writes:
  - `sectioned.md`
  - `subtitles.json`
- Falls back to local `ffmpeg` + ASR when Bilibili exposes no usable subtitle track and writes:
  - `audio-16k.wav`
  - `asr.srt`
  - `asr.json`
  - optional `asr.zh.srt`
- Captures direct PNG evidence under `frames/`.
- Reuses or validates the repo's `/api/bilibili/screenshot` flow when the task is an endpoint smoke test.

## Directory layout

```text
bilibili-video-evidence/
+- SKILL.md
+- README.md
+- skill.manifest.json
+- agents/
|  +- openai.yaml
+- references/
|  +- implementation.md
|  +- asr-fallback.md
|  +- keyframe-reference.md
+- scripts/
   +- bilibili_subtitle_to_md.py
   +- bilibili_audio_asr_to_srt.py
   +- capture_bilibili_screenshot.js
   +- smoke_bilibili_endpoint.js
```

## Main inputs

- Bilibili video URL
- Optional browser `Cookie` header or cookie file
- Optional output paths
- Optional screenshot timestamps

## Main outputs

- `sectioned.md`
- `subtitles.json`
- `audio-16k.wav`
- `asr.srt`
- `asr.json`
- Optional `asr.zh.srt`
- `frames/*.png`
- Optional `smoke-report.json`

## Example: subtitle extraction

```bash
python scripts/bilibili_subtitle_to_md.py ^
  --url "https://www.bilibili.com/video/BV1X7411F744?p=5" ^
  --output "sectioned.md" ^
  --json-output "subtitles.json"
```

If `--cookie` and `--cookie-file` are omitted, the script can also use `BILIBILI_COOKIE` or `BILIBILI_SESSION_TOKEN` from the environment.

## Example: local ASR fallback

```bash
python scripts/bilibili_audio_asr_to_srt.py ^
  --url "https://www.bilibili.com/video/BV1X7411F744?p=5" ^
  --cookie-file "cookie.txt" ^
  --output-dir "outputs\\P05" ^
  --model "small" ^
  --device "cpu" ^
  --compute-type "int8"
```

When a Chinese subtitle file is requested after ASR, keep subtitle numbering and timestamps unchanged and preserve technical keywords in English. See `references/asr-fallback.md`.

## Example: direct frame capture

```bash
node scripts/capture_bilibili_screenshot.js ^
  "https://www.bilibili.com/video/BV15DG7zxENa/" ^
  00:24 ^
  --output=frames/intro.png
```

## Example: screenshot smoke test

```bash
node scripts/smoke_bilibili_endpoint.js <repo-root> <bilibili-url> --timestamps=00:13,10:25
```

The smoke script requires each screenshot response to be a non-empty `image/jpeg` and records subtitle and screenshot status separately in the report.

## When to use it

- You need subtitles and frames from a Bilibili page.
- You want a reusable evidence bundle before writing notes.
- You need to confirm screenshot extraction works for specific timestamps.

## Operational notes

- Prefer full `BILIBILI_COOKIE` when available.
- If subtitle access is login-gated, ask for a fresh full browser `Cookie` header.
- AI subtitle tracks can be mismatched; verify duration and early subtitle lines before trusting them.
- When no usable subtitle track exists, switch to the local ASR fallback instead of stopping at the API failure.
- Use `references/keyframe-reference.md` when you need the explanatory version of the extraction workflow instead of the compact rules.
