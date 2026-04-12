# bilibili-keyframe-extractor-commented

Readable Bilibili keyframe extraction skill with both explanation and a standalone capture script.

## What this copy includes

- `SKILL.md`
  High-level workflow and usage guidance.
- `references/implementation.md`
  Detailed notes about HTML parsing, DASH streams, timestamp handling, and ffmpeg.
- `scripts/capture_bilibili_screenshot.js`
  Standalone reusable module plus CLI that saves a PNG from `videoUrl` and `timestamp`.
- `scripts/smoke_bilibili_endpoint.js`
  End-to-end validator for repos that already expose `/api/bilibili/screenshot`.

## Standalone usage

Save one frame directly:

```bash
node scripts/capture_bilibili_screenshot.js \
  "https://www.bilibili.com/video/BV15DG7zxENa/" \
  00:24 \
  --output=frame.png
```

Print JSON metadata:

```bash
node scripts/capture_bilibili_screenshot.js \
  "https://www.bilibili.com/video/BV15DG7zxENa/" \
  151 \
  --json
```

Use login state when needed:

```bash
node scripts/capture_bilibili_screenshot.js \
  "https://www.bilibili.com/video/BV15DG7zxENa/" \
  00:24 \
  --cookie-file=cookie.txt \
  --output=frame.png
```

## When to use what

- Use `capture_bilibili_screenshot.js` when you want a PNG immediately and do not have a repo-local screenshot endpoint.
- Use `smoke_bilibili_endpoint.js` when the target repo already has `/api/bilibili/screenshot` and you want to validate that integration.
