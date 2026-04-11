---
name: bilibili-subtitles-and-keyframes
description: Fetch subtitles from Bilibili video pages, save sectioned Markdown transcripts, and validate or wire timestamped keyframe extraction. Use when Codex needs a Bilibili transcript, subtitle download, time-coded notes, sectioned subtitle Markdown, screenshot endpoint, timestamped keyframe smoke test, or Bilibili frame capture workflow, especially when login-gated subtitles, DASH stream parsing, ffmpeg invocation, or copied browser cookies matter.
---

# Bilibili Subtitles And Keyframes

Fetch native Bilibili subtitle tracks first. Reuse or validate keyframe extraction second.

## Workflow

1. Parse the BV id and optional `p=` page index from the user URL.
2. If the user wants subtitles, prefer the native Bilibili subtitle API over ASR.
3. If the user wants keyframes, inspect the repo for an existing screenshot path before adding code.
4. Ask for a full browser `Cookie` header when subtitle access is login-gated.
5. Use `scripts/bilibili_subtitle_to_md.py` to fetch subtitle JSON and write sectioned Markdown.
6. Use `scripts/smoke_bilibili_endpoint.js` to validate a local screenshot endpoint when the task is about keyframes.
7. Confirm the title, page, subtitle language, keyframe timestamps, and output paths before finishing.

## Run

Use:

```bash
python scripts/bilibili_subtitle_to_md.py \
  --url "https://www.bilibili.com/video/BV1X7411F744?p=5" \
  --cookie-file "cookie.txt" \
  --output "video-title.md" \
  --json-output "lecture-05.json"
```

## Cookie Handling

- Prefer the full browser `Cookie` header over `SESSDATA` alone.
- Accept either `--cookie` or `--cookie-file`.
- Strip a leading `Cookie:` prefix if the user pasted a raw header line.
- Try `x/player/v2` first and keep `x/player/wbi/v2` as a fallback source.
- If login-gated subtitle access still fails, ask for a fresh full `Cookie` header or `Copy as cURL`.
- For screenshot validation, treat frame capture success and subtitle access as separate checks.

## Output Shape

The script writes Markdown with:

- Video title
- Source URL
- BV id and CID
- Page index and page title
- Subtitle language and subtitle URL
- Subtitle count
- Timeline sections grouped by fixed-length buckets

If `--output` is omitted, the default Markdown filename is the sanitized video title.

Each section looks like:

```md
### 05:00 - 05:59

- `05:03` Subtitle text
- `05:07` Another subtitle line
```

## Notes

- The script merges nearby short subtitle fragments before grouping them.
- The default grouping window is 60 seconds.
- The script prefers non-AI Chinese tracks first, then `ai-zh`, then other fallback tracks.
- The script skips broken subtitle tracks such as entries with a missing `subtitle_url` or an empty subtitle body.
- Machine-generated tracks can be wrong or mismatched even when the API metadata is correct. If the content obviously does not match the page, say so explicitly.

## Keyframes

When the user wants screenshots or timestamped keyframes:

1. Search the repo for `ffmpeg`, `__playinfo__`, `/api/bilibili/screenshot`, `ffmpeg-static`, and `captureBilibiliScreenshot`.
2. Prefer reusing an existing server-side screenshot endpoint over adding a new one.
3. Read [references/implementation.md](references/implementation.md) for the HTML parsing rules, DASH stream selection, timestamp handling, and ffmpeg flags.
4. Run:

```bash
node scripts/smoke_bilibili_endpoint.js <repo-root> <bilibili-url> --timestamps=00:13,10:25
```

5. Treat a `200 image/jpeg` response for two timestamps as the minimum passing smoke test.

If the target repo already has `scripts/smoke-bilibili.js`, reuse it instead of duplicating logic.

## Validation

Before finishing:

1. Confirm the page title and page number match the requested URL.
2. Confirm the subtitle list is non-empty.
3. Confirm timestamps increase monotonically in the first few lines.
4. Confirm the Markdown file exists on disk.
5. If a JSON output was requested, confirm it exists and includes API-source metadata plus merged groups.
6. If keyframe validation was requested, confirm the screenshot endpoint returns non-empty JPEGs and records a smoke report.

## Failure Handling

- If no BV id can be parsed, fail clearly.
- If the requested `p=` is out of range, fail clearly.
- If the subtitle track is missing, say the page currently exposes no subtitle track.
- If login-gated subtitles still fail with a full cookie, ask for a fresh cookie or copied cURL request.
- If the screenshot endpoint works but subtitle access fails, report them separately instead of collapsing them into one failure.
- Do not claim that ASR was used unless you actually switched to ASR.
