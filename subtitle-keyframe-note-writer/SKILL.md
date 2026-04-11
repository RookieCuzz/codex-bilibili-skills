---
name: subtitle-keyframe-note-writer
description: Generate a checked tutorial-style Markdown note from a video title, `sectioned.md`, raw subtitles, keyframe images, and optional web research. Use when Codex needs to turn subtitle segments and screenshots into a titled Markdown study note, especially for beginner-friendly tutorials, chapter notes, simplified explanations, formulas, tables, image placement, automatic keyframe extraction, and low-hallucination knowledge expansion.
---

# Subtitle Keyframe Note Writer

## Overview

Use this skill to turn video evidence into a tutorial-style Markdown note, not just a plain summary. The target output is a titled Markdown study note, with clear structure, simple explanations, chapter images, optional formulas/tables, and explicit separation between "video said this" and "external expansion".

## Workflow

1. Read all input artifacts first:
   - video title and URL
   - `sectioned.md`
   - raw subtitle file
   - keyframe images and timestamps, if already provided
   - optional web search results
2. Determine the exact video title and use it as the output filename stem.
   Display name stays as the true video title even if the filesystem filename must be sanitized.
3. Build an evidence map before drafting:
   - subtitle evidence
   - keyframe evidence
   - external-source evidence
   - unresolved items
4. If chapter keyframes are missing or insufficient, plan them before drafting.
   For each chapter, choose one main timestamp that best represents the teaching point of that section.
   If formulas, tables, diagrams, maps, or slides appear, optionally choose one additional figure timestamp for that chapter.
5. Use the repo's screenshot capability to extract the planned frames.
   Prefer an existing endpoint or skill such as a Bilibili timestamp screenshot API. If extraction fails for a chapter, continue writing the note and leave an image placeholder or omit the image line.
6. Draft the note in tutorial layers:
   - what the video is saying
   - what that means in simple language
   - why it matters
   - how a beginner should understand it
   - what to be careful not to misunderstand
7. Only use web research when you need:
   - extra background knowledge
   - formula verification
   - table completion
   - terminology clarification
   - fact checking
8. Keep "video content" and "external expansion" separate.
   External facts must never be presented as if they were said in the video.
9. If formulas or tables appear, write them in Markdown only when they are reliable.
   If they are incomplete or ambiguous, mark them as `pending-review`.
10. Run a final multi-check pass:

- factual consistency
- chapter/image alignment
- image extraction quality
- formula/table reliability
- source boundary
- tutorial clarity
- Markdown rendering safety

## Hard Rules

- Output one Markdown file body unless the user explicitly asks for extra artifacts.
- Default filename rule: use the video title as the file stem and apply the note suffix shown in the output template reference.
- Prioritize clarity over polish.
- Use short paragraphs, short sentences, and direct explanations.
- Avoid unexplained jargon. If a term is necessary, explain it the first time it appears.
- Every important conclusion should be attributable to subtitles, keyframes, external sources, or be explicitly marked as uncertain.
- Do not invent formulas, tables, dates, names, values, or causal explanations.
- If extra knowledge is added, make it obvious that it is external expansion.
- If image paths are provided or newly extracted, use standard Markdown image syntax.
- Prefer one main image per chapter, placed directly under the chapter heading.
- If a formula/table/diagram needs its own image, place that image inside the "Formula and Table" or equivalent visual subsection, not at random.
- If formulas are used, use `$...$` or `$$...$$`.
- If tables are used, use standard Markdown tables.

## Teaching Bias

When the evidence allows it, prefer notes that feel like a beginner tutorial:

- start each chapter with "what this section is teaching"
- explain "why it matters"
- give a plain-language version
- if possible, add one intuitive example or analogy
- point out one common misunderstanding or likely confusion point

Do not force examples or analogies when the evidence is too weak.

## References

- Read [references/prompt-blueprint.md](references/prompt-blueprint.md) for the recommended master prompt.
- Read [references/output-template.md](references/output-template.md) for the target note structure.
- Read [references/keyframe-selection.md](references/keyframe-selection.md) for how to pick and place screenshots.
- Read [references/verification-checklist.md](references/verification-checklist.md) for the final multi-check pass.
