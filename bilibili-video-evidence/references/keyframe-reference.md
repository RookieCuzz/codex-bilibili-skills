# Bilibili Keyframe Reference

Use this file when you need the explanatory version of the frame-capture workflow.

## HTML parsing

### Why the public page is used

The public Bilibili video page often exposes `window.__playinfo__` with enough data to resolve a playable media URL.
That path is usually more stable than older player APIs such as `x/player/playurl`, which may fail or require extra signing.

### Required request headers

Send at least:

- `User-Agent: Mozilla/...`
- `Referer: https://www.bilibili.com/`

These headers help Bilibili treat the request like a normal browser page load.

### Data sources

- `window.__playinfo__`
  Carries DASH stream info, quality information, and duration.
- `window.__INITIAL_STATE__`
  Carries page metadata such as title and page state.

### Common parsing pitfall

`__INITIAL_STATE__` is not always pure JSON.
Sometimes the script contains valid JSON immediately followed by `;(function...)`.

Use this safe pattern:

1. Extract the whole script payload.
2. Try `JSON.parse`.
3. If it fails, trim from `;(function` onward.
4. Parse again.

That fallback avoids false negatives on real pages.

## Stream selection

### Where the media list lives

Use `playinfo.data.dash.video`.

Each entry may contain:

- `id`
- `codecs`
- `baseUrl`
- `base_url`
- `backupUrl`
- `backup_url`

### Why AVC is preferred

AVC (`avc1`) tends to decode more consistently with ffmpeg in mixed environments.
It is not the only valid option, but it is a pragmatic default for a general-purpose extractor.

### URL resolution order

Prefer:

1. `baseUrl`
2. `base_url`
3. `backupUrl[0]`
4. `backup_url[0]`

## Timestamp handling

Support all of these inputs:

- raw seconds as a number
- raw seconds as a numeric string
- `MM:SS`
- `HH:MM:SS`

Clamp the final timestamp to slightly before the media end.
That avoids asking ffmpeg for a frame beyond the video's last decodable point.

## ffmpeg invocation

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
-f image2pipe
-vcodec png
pipe:1
```

### Why the two-step seek is useful

- Seek before `-i` to make long remote videos start faster.
- Seek after `-i` to improve frame precision.

This is a practical compromise between speed and correctness.

## Standalone capture shape

When you do not already have a repo-local endpoint, keep the same logic in a small reusable module or CLI that:

- accepts `videoUrl`
- accepts `timestamp`
- optionally accepts `cookie` or `cookie-file`
- writes a PNG to disk
- prints metadata such as output path, resolved timestamp seconds, page number, and video id

That keeps the evidence layer useful even before any server-side route exists.

## Endpoint shape

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

## Login-state edge cases

Do not assume subtitle access and frame access are the same capability.

Observed real-world pattern:

- screenshot extraction can succeed anonymously
- subtitle fetching can still fail without login state

That is why smoke reports should keep subtitle warnings separate from screenshot failures.

## Smoke-test expectations

A minimal but meaningful smoke test should prove:

1. The public page is reachable.
2. `__playinfo__` parses.
3. `__INITIAL_STATE__` parses.
4. The local screenshot endpoint returns `200 image/jpeg`.
5. At least two timestamps produce non-empty files.

If subtitle fetching fails and no cookie is present, report it as a warning rather than a hard failure.
