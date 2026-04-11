# Keyframe Selection and Placement

Use this file when the note should actively drive screenshot extraction instead of only consuming pre-made images.

## 1. When To Extract Keyframes

Extract new keyframes when:

- no chapter images were provided
- provided images do not cover all major chapters
- the chapter contains a formula, table, slide, map, or visual explanation that deserves a dedicated image
- the user explicitly wants the note to insert screenshots in the tutorial

Do not extract images just for decoration.

## 2. Main Chapter Image Rule

Choose one main keyframe per chapter when possible.

The best main chapter image usually:

- matches the chapter topic
- is visually stable
- is not black, blurred, or mid-transition
- is not from the first or last instant of the chapter unless that instant is clearly meaningful
- helps the reader understand the section

Default placement:

- insert the main image directly below the chapter heading
- then start the "what this section is teaching" explanation

## 3. Figure Image Rule

Choose one extra figure image only when a chapter contains important visual material such as:

- formula
- table
- chart
- diagram
- map
- slide
- labeled object or structure

Default placement:

- insert it inside the "Formula and Table" section or another clearly named visual subsection
- add a short caption explaining what the reader should notice

## 4. Timestamp Planning Heuristics

When planning timestamps from subtitles and chapter ranges:

1. Avoid the first 1-2 seconds of a chapter unless the opening frame is the main visual.
2. Avoid the last 1-2 seconds if it looks like a scene transition.
3. Prefer the sentence where the speaker introduces the core concept.
4. If the subtitles mention "this chart", "this number", "this table", "this formula", "this map", or similar, prioritize that nearby timestamp.
5. If the chapter is mostly narration with no strong visual, choose the most stable representative frame rather than forcing a visual claim.

## 5. If Screenshot Capability Exists

If the repo already has a Bilibili screenshot endpoint or sibling skill:

- first plan timestamps
- then extract screenshots
- then insert the returned image paths into the note

If extraction fails:

- do not block the whole note
- either omit the image or leave a visible placeholder such as:
  - `<!-- pending screenshot: 03:12 -->`

## 6. Caption Style

Captions should explain relevance, not restate the filename.

Good:

- "Chapter main frame: the abandoned clinic building mentioned in this section"
- "Figure frame: source capsule structure shown while the narration explains its layers"

Weak:

- "Screenshot 1"
- "Image at 03:12"
