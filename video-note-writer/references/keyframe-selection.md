# Keyframe Selection and Placement

Use this file when the note should choose among provided screenshots or record missing-image requests for the evidence layer.

## 1. When To Use Existing Keyframes

Prefer existing screenshots when:

- chapter images were already provided
- the evidence bundle already covers the major sections
- the chapter includes a formula, table, slide, map, or visual explanation that already has a matching frame
- the user asked for a note, not another evidence pass

Do not add images just for decoration.

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

If screenshots are missing and you need to describe what evidence should be collected next, plan timestamps from subtitles and chapter ranges:

1. Avoid the first 1-2 seconds of a chapter unless the opening frame is the main visual.
2. Avoid the last 1-2 seconds if it looks like a scene transition.
3. Prefer the sentence where the speaker introduces the core concept.
4. If the subtitles mention "this chart", "this number", "this table", "this formula", "this map", or similar, prioritize that nearby timestamp.
5. If the chapter is mostly narration with no strong visual, choose the most stable representative frame rather than forcing a visual claim.

## 5. If Screenshots Are Missing

If the evidence bundle does not include a needed screenshot:

- do not extract it inside this skill
- either omit the image, or
- leave a visible placeholder such as `<!-- pending screenshot request: 03:12 -->`, or
- record the desired timestamp so the evidence layer can collect it later

## 6. Caption Style

Captions should explain relevance, not restate the filename.

Good:

- "Chapter main frame: the clinic building discussed in this section"
- "Figure frame: the table shown while the speaker compares the three cases"

Weak:

- "Screenshot 1"
- "Image at 03:12"
