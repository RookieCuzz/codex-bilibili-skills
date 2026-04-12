# Verification Checklist

Run this checklist before returning the final note.

## 1. Fact Check

- Are people, places, organizations, dates, and quantities consistent across sections?
- Did the note accidentally merge two different events or concepts?
- Did the text overstate certainty where the subtitles were vague?

## 2. Source Boundary Check

- Is every important claim traceable to subtitles, keyframes, or external sources?
- Is every external expansion clearly separated from "what the video said"?
- Are speculative statements explicitly labeled as `待复核` or uncertainty?

## 3. Image Alignment Check

- Does each inserted keyframe match the chapter it appears under?
- Does the image caption describe the frame accurately?
- Is the chosen image representative rather than random?
- If a screenshot is missing, is the gap explicit instead of hidden?
- Is the main chapter image placed immediately after the chapter heading?
- If there is a formula, table, or diagram image, is it placed near the related explanation?

## 4. Formula and Table Check

- Is the formula fully supported by subtitles, frame content, or external verification?
- Is the table complete enough to be useful?
- If either one is incomplete, was it marked as `待复核` instead of guessed?

## 5. Tutorial Clarity Check

- Can a beginner understand the main point without already knowing the jargon?
- Is the explanation more understandable than the raw subtitle itself?
- Did the note explain "为什么重要" rather than only repeat "发生了什么"?
- Is at least one hard concept rewritten in plain language when the evidence allows it?
- Did the note avoid pretending that an analogy is part of the video itself?

## 6. Keyframe Utility Check

- Does each screenshot help teach the section, instead of merely decorating it?
- Is there a better provided frame in the same chapter for formulas, tables, charts, maps, or slides?
- Did the note avoid inserting redundant screenshots that add no teaching value?

## 7. Markdown Rendering Check

- Are heading levels valid and ordered?
- Are lists, tables, formulas, and images syntactically valid Markdown?
- Does the file read naturally when saved directly as `《视频标题》笔记.md`?

## 8. Final Decision Rule

If any statement fails the checks above:

- remove it, or
- move it to `待复核`, or
- rewrite it with a lower-confidence label

If any paragraph is technically correct but still hard to understand:

- shorten it
- explain the term
- add a simple teaching sentence

Do not keep unsupported certainty or unreadable jargon in the final note.
