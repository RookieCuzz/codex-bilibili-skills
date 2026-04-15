# Bilibili Video Evidence Implementation Notes

Use this file for the compact rules. Read `keyframe-reference.md` when you need the detailed rationale.

## Subtitle collection

- Prefer native Bilibili subtitle APIs over ASR.
- Try `x/player/v2` first and keep `x/player/wbi/v2` as a fallback.
- Prefer non-AI Chinese tracks first, then `ai-zh`, then other usable fallbacks.
- Reject tracks with a missing `subtitle_url` or an empty body.
- Normalize the result into `sectioned.md` and `subtitles.json`.

## Local ASR fallback

- Switch to local ASR only after native subtitle checks fail, or when the user explicitly asks for local/offline transcription.
- Use `scripts/bilibili_audio_asr_to_srt.py` for the fallback chain.
- Extract audio with `ffmpeg`, run local ASR, and write `audio-16k.wav`, `asr.srt`, and `asr.json`.
- If Chinese translation is requested, write `asr.zh.srt` with the same numbering and timestamps as `asr.srt`.
- Preserve technical keywords in English during translation.

## Direct frame capture

- Fetch the public page, not `x/player/playurl`.
- Parse `window.__playinfo__` and `window.__INITIAL_STATE__`.
- Trim a trailing `;(function...)` suffix from `__INITIAL_STATE__` before `JSON.parse`.
- Prefer AVC DASH video streams and resolve the first usable media URL.
- Accept timestamps as seconds, `MM:SS`, or `HH:MM:SS`.
- Clamp timestamps slightly before the media end.
- Save standalone captures as PNG files under `frames/` unless the caller overrides the path.

## Endpoint validation

- Reuse a repo-local `/api/bilibili/screenshot` endpoint when it already exists.
- Treat endpoint validation as separate from direct PNG capture.
- Require `200 image/jpeg` plus non-empty bytes for smoke-test success.
- Save `smoke-report.json` and keep subtitle warnings separate from screenshot failures.

## Login-state edge cases

- Subtitle access can fail while frame capture still works.
- Prefer full `BILIBILI_COOKIE` when present.
- If only `BILIBILI_SESSION_TOKEN` exists, `SESSDATA=<token>` is a fallback, not a guarantee.
