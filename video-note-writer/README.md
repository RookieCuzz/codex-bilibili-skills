# video-note-writer

Write a checked Markdown study note from evidence artifacts that already exist.

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
video-note-writer/
+- SKILL.md
+- README.md
+- skill.manifest.json
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
- Normalized `subtitles.json` or another raw subtitle file
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
2. Insert screenshots only when they improve comprehension.
3. Keep missing evidence explicit instead of guessing.
4. Run a final consistency and Markdown-safety check before saving the note.
