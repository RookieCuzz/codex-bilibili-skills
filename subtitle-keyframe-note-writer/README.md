# subtitle-keyframe-note-writer

Generate a checked Markdown study note from a video title, `sectioned.md`, raw subtitles, and optional keyframes.

## What it does

- Reads evidence that is already close to final-note form.
- Separates evidence into:
  - subtitle evidence
  - keyframe evidence
  - external-source evidence
  - unresolved items
- Produces a tutorial-style Markdown note with explicit source boundaries.

## Directory layout

```text
subtitle-keyframe-note-writer/
+- SKILL.md
+- README.md
+- agents/
|  +- openai.yaml
+- references/
   +- keyframe-selection.md
   +- output-template.md
   +- prompt-blueprint.md
   +- verification-checklist.md
```

## Expected inputs

- Video title and URL
- `sectioned.md`
- Raw subtitle file or normalized subtitle JSON
- Optional keyframe image paths and timestamps
- Optional external references for fact checking or clarification

## Output

- One Markdown note file, typically titled after the source video

## Best use cases

- Tutorial and lecture videos
- Interview-prep notes
- Chaptered explanations with screenshots
- Low-hallucination note generation from existing evidence

## Writing rules

- Keep video content and external expansion separate.
- Do not invent formulas, tables, dates, names, or causal explanations.
- Mark uncertain items clearly instead of guessing.
- Prefer one main image per chapter unless the user explicitly wants more.

## Typical workflow

1. Start from `sectioned.md` plus subtitle JSON.
2. Plan one representative timestamp per chapter when screenshots are needed.
3. Insert screenshots only when they improve comprehension.
4. Run a final consistency and Markdown-safety check before saving the note.
