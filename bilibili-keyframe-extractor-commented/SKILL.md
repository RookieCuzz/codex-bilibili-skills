---
name: bilibili-keyframe-extractor-commented
description: Copy of the Bilibili keyframe extractor skill with expanded explanations and inline guidance. Use when Codex needs a highly readable version of the skill to understand, teach, or directly run timestamp-based Bilibili screenshot extraction, including DASH parsing, ffmpeg usage, standalone capture, smoke testing, and login-state edge cases.
---

# Bilibili Keyframe Extractor Commented

## Overview

This is a commented copy of the original `bilibili-keyframe-extractor` skill.

Keep this version when readability matters more than compactness:

- read the end-to-end extraction flow
- understand why each implementation choice exists
- capture a PNG directly from `videoUrl` plus `timestamp`
- reuse the smoke-test script in another repo
- teach another developer how the feature is wired

The target problem is always the same: extract a real video frame from a Bilibili URL at a requested timestamp on the server side.

## Workflow

1. Decide whether you need standalone capture or repo integration.
   If you only need a PNG file, use the bundled `scripts/capture_bilibili_screenshot.js`.
   If you need to validate or wire an existing repo endpoint, inspect the target repo first.

2. Reuse an existing screenshot endpoint if it already accepts `videoUrl` and `timestamp`.
   If the endpoint is missing, use the bundled standalone script directly or port its implementation into the repo.

3. Fetch the Bilibili video page HTML.
   Send a browser-like `User-Agent` and a Bilibili `Referer`.

4. Parse `window.__playinfo__` and `window.__INITIAL_STATE__`.
   `__playinfo__` gives the playable DASH streams and media duration.
   `__INITIAL_STATE__` gives page-level metadata such as title.

5. Guard against malformed inline JSON.
   In practice, `__INITIAL_STATE__` may include trailing `;(function...)` script text in the same tag.
   Trim that suffix before `JSON.parse`.

6. Select a stable video stream for ffmpeg.
   Prefer AVC streams (`codecs` starts with `avc1`) because they are usually the least surprising to decode in mixed environments.

7. Call ffmpeg with explicit Bilibili headers.
   Use a fast seek before `-i`, an accurate seek after `-i`, and emit a single JPEG frame.

8. Return bytes plus metadata.
   Include fields such as resolved timestamp, page number, and video id.

9. Choose the right validation path.
   Use `scripts/capture_bilibili_screenshot.js` for direct extraction.
   Use `scripts/smoke_bilibili_endpoint.js` only when the task is specifically about a repo-local screenshot endpoint.

## Rules

- Keep frame extraction on the server side.
- Prefer real media frames over player deep-links or canvas capture.
- Treat subtitle access and screenshot access as separate concerns.
  Public videos may still expose playable DASH media while subtitle APIs require login state.
- Use full `BILIBILI_COOKIE` when possible.
  If only `BILIBILI_SESSION_TOKEN` exists, `SESSDATA=<token>` is a fallback, not a guarantee.
- Avoid adding UI unless the task explicitly asks for UI or the repo already has a clear place to expose the feature.

## Files In This Copy

- `agents/openai.yaml`
  Commented UI metadata for the skill.
- `README.md`
  Standalone usage examples for direct PNG extraction and endpoint validation.
- `references/implementation.md`
  Expanded implementation notes and failure analysis.
- `scripts/capture_bilibili_screenshot.js`
  Reusable standalone module plus CLI for direct PNG output.
- `scripts/smoke_bilibili_endpoint.js`
  Fully commented Node.js smoke-test runner.

## How To Use This Copy

1. Read `references/implementation.md` for the implementation decisions.
2. Run `scripts/capture_bilibili_screenshot.js` when you need a PNG directly from `videoUrl` plus `timestamp`.
3. Reuse `scripts/smoke_bilibili_endpoint.js` when validating another repo's existing endpoint.
4. If you need the original compact skill for normal Codex use, keep using the original under `~/.codex/skills/`.
