# Skills

This repository includes reusable Codex skills for Bilibili subtitle extraction, keyframe extraction, and note generation.

## Included skills

### `bilibili-subtitles-and-keyframes`

- Purpose: fetch native Bilibili subtitles, write sectioned Markdown transcripts, and validate timestamped screenshot extraction.
- Best for: turning a Bilibili URL into `sectioned.md`, `subtitles.json`, and smoke-tested keyframe timestamps.
- Directory: [bilibili-subtitles-and-keyframes](./bilibili-subtitles-and-keyframes)

### `bilibili-keyframe-extractor-commented`

- Purpose: explain or adapt Bilibili timestamp-based screenshot extraction with a more readable, commented workflow.
- Best for: understanding how `/api/bilibili/screenshot`-style extraction works, including DASH parsing, ffmpeg flags, and smoke testing.
- Directory: [bilibili-keyframe-extractor-commented](./bilibili-keyframe-extractor-commented)

### `subtitle-keyframe-note-writer`

- Purpose: turn subtitles, timestamps, and optional screenshots into a checked Markdown study note.
- Best for: producing a tutorial-style Markdown note from `sectioned.md`, raw subtitles, and keyframes.
- Directory: [subtitle-keyframe-note-writer](./subtitle-keyframe-note-writer)

## Repository layout

```text
skills/
+- bilibili-subtitles-and-keyframes/
|  +- SKILL.md
|  +- README.md
|  +- agents/
|  +- references/
|  +- scripts/
+- bilibili-keyframe-extractor-commented/
|  +- SKILL.md
|  +- agents/
|  +- references/
|  +- scripts/
+- subtitle-keyframe-note-writer/
|  +- SKILL.md
|  +- README.md
|  +- agents/
|  +- references/
+- README.md
```

## Typical workflow

1. Use `bilibili-subtitles-and-keyframes` to fetch subtitles and validate screenshot capability.
2. Review or fix subtitle quality when the source track is AI-generated.
3. Use `subtitle-keyframe-note-writer` to generate a structured note from the evidence.

## Notes

- Some Bilibili subtitle tracks require login state.
- Prefer a full browser `Cookie` header over `SESSDATA` alone when subtitle access is gated.
- Screenshot extraction and subtitle access should be treated as separate checks.
