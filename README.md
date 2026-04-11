# Codex Bilibili Skills

Reusable Codex skills for Bilibili subtitle extraction and Markdown note generation.

## Included skills

### `bilibili-subtitles-and-keyframes`
- Fetches native Bilibili subtitles.
- Writes sectioned Markdown transcripts.
- Validates timestamped screenshot extraction against a repo-local screenshot endpoint.

Directory: [bilibili-subtitles-and-keyframes](./bilibili-subtitles-and-keyframes)

### `subtitle-keyframe-note-writer`
- Turns `sectioned.md`, subtitle evidence, and optional keyframes into a checked Markdown note.
- Keeps video content and external expansion clearly separated.

Directory: [subtitle-keyframe-note-writer](./subtitle-keyframe-note-writer)

## Suggested workflow

1. Use `bilibili-subtitles-and-keyframes` to fetch `sectioned.md` and subtitle metadata from a Bilibili URL.
2. Validate screenshot extraction if the final note should include chapter images.
3. Use `subtitle-keyframe-note-writer` to generate the final study note.

## Repository layout

```text
codex-bilibili-skills/
+- README.md
+- bilibili-subtitles-and-keyframes/
|  +- README.md
|  +- SKILL.md
|  +- agents/
|  +- references/
|  +- scripts/
+- subtitle-keyframe-note-writer/
   +- README.md
   +- SKILL.md
   +- agents/
   +- references/
```

## Notes

- Some Bilibili subtitle tracks require login state.
- Prefer a full browser `Cookie` header when subtitle access is gated.
- AI subtitle tracks should be verified before being used as final evidence.
