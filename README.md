# Skills

This repository includes reusable Codex skills for Bilibili evidence collection and downstream note generation.

## Included skills

### `bilibili-video-evidence`

- Purpose: turn a Bilibili `videoUrl` into `sectioned.md`, `subtitles.json`, `frames/*.png`, and optional `smoke-report.json`.
- Best for: subtitle download, direct frame capture, and screenshot endpoint smoke validation.
- Directory: [bilibili-video-evidence](./bilibili-video-evidence)

### `video-note-writer`

- Purpose: consume subtitle and frame artifacts and turn them into a checked Markdown study note.
- Best for: producing a tutorial-style Markdown note from `sectioned.md`, `subtitles.json`, and optional screenshots.
- Directory: [video-note-writer](./video-note-writer)

## Repository layout

```text
skills/
+- bilibili-video-evidence/
|  +- SKILL.md
|  +- README.md
|  +- skill.manifest.json
|  +- agents/
|  +- references/
|  +- scripts/
+- video-note-writer/
|  +- SKILL.md
|  +- README.md
|  +- skill.manifest.json
|  +- agents/
|  +- references/
+- README.md
```

## Typical workflow

1. Use `bilibili-video-evidence` to collect subtitle and frame artifacts.
2. Review or fix subtitle quality when the source track is AI-generated.
3. Use `video-note-writer` to generate a structured note from the evidence.

## Orchestration

- Each skill now carries a `skill.manifest.json` that declares inputs, outputs, and produced artifact classes.
- Route `videoUrl` plus a note request through `bilibili-video-evidence` first, then `video-note-writer`.
- Route `videoUrl` plus timestamps directly to the frame-capture capability.
- Route existing `sectioned.md` or `subtitles.json` directly to `video-note-writer`.
- Route screenshot endpoint validation requests to the smoke-test capability instead of the standalone capture path.

## Notes

- Some Bilibili subtitle tracks require login state.
- Prefer a full browser `Cookie` header over `SESSDATA` alone when subtitle access is gated.
- Screenshot extraction and subtitle access should be treated as separate checks.
- The former `commented` skill now lives as `bilibili-video-evidence/references/keyframe-reference.md`.
