# Bilibili Keyframe Extraction Notes

This file is the detailed reference companion to the skill.
Use it when you need the reasoning behind the implementation, not just the short workflow.

## 1. HTML Parsing

### Why the public page is used

The public Bilibili video page often exposes `window.__playinfo__` with enough data to resolve a playable media URL.
That path is frequently more stable than directly calling older player APIs such as `x/player/playurl`, which may fail or require additional signing.

### Required request headers

Send at least:

- `User-Agent: Mozilla/...`
- `Referer: https://www.bilibili.com/`

These headers help Bilibili treat the request like a normal browser page load.

### Data sources

- `window.__playinfo__`
  Carries DASH stream info, quality information, and duration.
- `window.__INITIAL_STATE__`
  Carries page metadata such as title and high-level page state.

### Common parsing pitfall

`__INITIAL_STATE__` is not always “pure JSON”.
Sometimes the script contains valid JSON immediately followed by `;(function...)`.

The safe pattern is:

1. extract the whole script payload
2. try `JSON.parse`
3. if it fails, trim from `;(function` onward
4. parse again

That exact fallback avoids false negatives on real pages.

## 2. Stream Selection

### Where the media list lives

Use:

- `playinfo.data.dash.video`

Each entry may contain:

- `id`
- `codecs`
- `baseUrl`
- `base_url`
- `backupUrl`
- `backup_url`

### Why AVC is preferred

AVC (`avc1`) tends to be easier to decode consistently with ffmpeg in generic environments.
It is not always the only valid option, but it is a pragmatic default when building a general-purpose extractor.

### URL resolution order

Prefer:

1. `baseUrl`
2. `base_url`
3. `backupUrl[0]`
4. `backup_url[0]`

This order matches the common “best known URL, then fallback” pattern.

## 3. Timestamp Handling

Support all of these inputs:

- raw seconds as a number
- raw seconds as a numeric string
- `MM:SS`
- `HH:MM:SS`

Why this matters:

- API callers often send plain seconds
- UI callers often send clock-style timestamps
- tests should not have to normalize inputs first

Clamp the final timestamp to slightly before the media end.
That avoids asking ffmpeg for a frame beyond the video’s last decodable point.

## 4. ffmpeg Invocation

### Important header block

```text
-headers "Origin: https://www.bilibili.com\r\nReferer: https://www.bilibili.com/\r\nUser-Agent: Mozilla/5.0\r\n"
```

The remote media URL is not enough by itself.
Bilibili often expects browser-like request headers when the media file is fetched by ffmpeg.

### Recommended extraction pattern

```text
-v error
-headers ...
-ss <fast-seek-seconds>
-i <stream-url>
-ss <accurate-seek-seconds>
-frames:v 1
-vf scale='min(1280,iw)':-2
-q:v 2
-f image2pipe
-vcodec mjpeg
pipe:1
```

### Why the two-step seek is useful

- seek before `-i`
  Makes long remote videos start faster
- seek after `-i`
  Improves frame precision

This combination is a practical compromise between speed and correctness.

### Why `mjpeg` to `pipe:1`

Returning a JPEG buffer is convenient for web APIs because:

- the server can directly send bytes to the response
- callers can store the result without another conversion step
- smoke tests can hash the resulting bytes and save them to disk

## 5. API Shape

Prefer an endpoint that:

- accepts `videoUrl`
- accepts `timestamp`
- supports GET when the caller wants a simple URL
- optionally supports POST when payloads may grow
- returns `image/jpeg`

Helpful metadata headers:

- `X-Bilibili-Video-Id`
- `X-Bilibili-Page-Number`
- `X-Screenshot-Timestamp-Seconds`

These headers make smoke-test scripts easier to write and debug.

## 6. Login-State Edge Cases

Do not assume “subtitle accessible” and “frame accessible” are the same capability.

Observed real-world pattern:

- screenshot extraction can succeed anonymously
- subtitle fetching can still fail without login state

That is why this skill treats subtitle validation as optional unless the task explicitly requires it.

## 7. Smoke-Test Expectations

A minimal but meaningful smoke test should prove:

1. the public page is reachable
2. `__playinfo__` parses
3. `__INITIAL_STATE__` parses
4. the local screenshot endpoint returns `200 image/jpeg`
5. at least two timestamps produce non-empty files

If subtitle fetching fails and no cookie is present, report it as a warning rather than a hard failure.
