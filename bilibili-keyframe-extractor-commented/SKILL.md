---
name: bilibili-keyframe-extractor-commented
description: Copy of the Bilibili keyframe extractor skill with expanded explanations and inline guidance. Use when Codex needs a highly readable version of the skill to understand or teach how timestamp-based Bilibili screenshot extraction works, including DASH parsing, ffmpeg usage, smoke testing, and login-state edge cases.
---

# Bilibili Keyframe Extractor Commented

## Overview

This is a commented copy of the original `bilibili-keyframe-extractor` skill.

Keep this version when readability matters more than compactness:

- read the end-to-end extraction flow
- understand why each implementation choice exists
- reuse the smoke-test script in another repo
- teach another developer how the feature is wired

The target problem is always the same: extract a real video frame from a Bilibili URL at a requested timestamp on the server side.

## Workflow

1. Inspect the target repo before writing code.
   Look for an existing `ffmpeg` path, a Bilibili HTML parser, or an endpoint such as `/api/bilibili/screenshot`.

2. Reuse an existing screenshot endpoint if it already accepts `videoUrl` and `timestamp`.
   If the endpoint is missing, implement the server-side API first.

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
   Include headers such as resolved timestamp, page number, and video id.

9. Smoke-test the full path locally.
   The included script starts the repo’s dev server, calls the screenshot endpoint, writes output files, and records a structured report.

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
- `references/implementation.md`
  Expanded implementation notes and failure analysis.
- `scripts/smoke_bilibili_endpoint.js`
  Fully commented Node.js smoke-test runner.

## How To Use This Copy

1. Read `references/implementation.md` for the implementation decisions.
2. Reuse `scripts/smoke_bilibili_endpoint.js` when validating another repo.
3. If you need the original compact skill for normal Codex use, keep using the original under `~/.codex/skills/`.
