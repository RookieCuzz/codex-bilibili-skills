# Local ASR Fallback

Use this file when a Bilibili page exposes no usable subtitle track, or when the user explicitly requests a local/offline subtitle workflow.

## Trigger conditions

Switch from native subtitle fetching to local ASR when any of these is true:

- `x/player/v2` and `x/player/wbi/v2` expose no subtitle tracks.
- The exposed subtitle tracks have no `subtitle_url`.
- The subtitle JSON body is empty or clearly unusable.
- The user explicitly asks for `ffmpeg` + local ASR + `.srt`.

When switching, say clearly that native subtitles were unavailable and that the workflow is now using local ASR.

## Fallback chain

Use this base chain:

1. Resolve the Bilibili page and direct media stream.
2. Use `ffmpeg` to extract audio.
3. Run a local ASR model.
4. Export `.srt`.
5. If requested, translate the `.srt` into Chinese while preserving technical keywords.

Use `scripts/bilibili_audio_asr_to_srt.py` for steps 1 to 4.

Example:

```bash
python scripts/bilibili_audio_asr_to_srt.py \
  --url "https://www.bilibili.com/video/BV1X7411F744?p=5" \
  --cookie-file "cookie.txt" \
  --output-dir "outputs/P05" \
  --model "small" \
  --device "cpu" \
  --compute-type "int8"
```

Expected outputs:

- `audio-16k.wav`
- `asr.srt`
- `asr.json`
- optional `asr.zh.srt`

## Translation rules

When translating `asr.srt` into `asr.zh.srt`:

- Keep the subtitle index unchanged.
- Keep each timestamp line unchanged.
- Translate only subtitle text.
- Preserve technical keywords in English unless the user asks otherwise.
- Fix obvious ASR technical-term mistakes when the intended term is clear from context.
- Do not summarize, shorten, expand, or reorder lines.

Examples of keywords to preserve:

- `C++`
- `Standard Library`
- `Standard Template Library`
- `STL`
- `vector`
- `iterator`
- `container`
- `algorithm`
- `namespace std`
- `begin`
- `end`
- `push_back`
- `sort`
- `undefined behavior`

## Prompt pattern

Use a prompt like this when translating:

```text
Translate this SRT into Chinese.
Keep the subtitle numbering and timestamps exactly unchanged.
Translate only the subtitle text lines.
Preserve technical keywords in English, including C++, Standard Library, Standard Template Library, STL, vector, iterator, container, algorithm, namespace std, begin, end, push_back, sort, and undefined behavior.
If ASR obviously misheard a technical term, correct it to the intended technical term.
Do not summarize, add notes, or rewrite the timing structure.
Output valid SRT only.
```

## Validation

Before finishing:

1. Confirm the page number and page title still match the requested URL.
2. Confirm `audio-16k.wav`, `asr.srt`, and `asr.json` exist.
3. Confirm the first few subtitle timestamps are strictly increasing.
4. If `asr.zh.srt` was requested, confirm its timestamps exactly match `asr.srt`.
5. Report clearly that the subtitle source is local ASR, not a native Bilibili subtitle track.
