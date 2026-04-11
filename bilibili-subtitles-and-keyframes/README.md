# bilibili-subtitles-and-keyframes

Fetch native Bilibili subtitle tracks, write sectioned Markdown transcripts, and validate timestamped screenshot extraction.

## What it does

- Parses a Bilibili URL and resolves `BV` plus optional `p=` page index.
- Fetches subtitle metadata from Bilibili player APIs.
- Chooses a usable subtitle track and writes:
  - `sectioned.md`
  - optional normalized `subtitles.json`
- Reuses or validates the repo's `/api/bilibili/screenshot` flow for keyframes.

## Directory layout

```text
bilibili-subtitles-and-keyframes/
+- SKILL.md
+- README.md
+- agents/
|  +- openai.yaml
+- references/
|  +- implementation.md
+- scripts/
   +- bilibili_subtitle_to_md.py
   +- smoke_bilibili_endpoint.js
```

## Main inputs

- Bilibili video URL
- Optional browser `Cookie` header or cookie file
- Optional output paths
- Optional screenshot timestamps

## Main outputs

- Markdown transcript grouped into fixed-length time buckets
- Optional JSON output with subtitle metadata and merged segments
- Smoke-test report for screenshot validation

## Example: subtitle extraction

```bash
python scripts/bilibili_subtitle_to_md.py ^
  --url "https://www.bilibili.com/video/BV1X7411F744?p=5" ^
  --cookie-file "cookie.txt" ^
  --output "sectioned.md" ^
  --json-output "subtitles.json"
```

## Example: screenshot smoke test

```bash
node scripts/smoke_bilibili_endpoint.js <repo-root> <bilibili-url> --timestamps=00:13,10:25
```

## When to use it

- You need subtitles from a Bilibili page.
- You want a `sectioned.md` transcript before writing notes.
- You need to confirm screenshot extraction works for specific timestamps.

## Operational notes

- Prefer full `BILIBILI_COOKIE` when available.
- If subtitle access is login-gated, ask for a fresh full browser `Cookie` header.
- AI subtitle tracks can be mismatched; verify duration and early subtitle lines before trusting them.
