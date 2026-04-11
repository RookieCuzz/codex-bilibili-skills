# Bilibili Keyframe Extraction Notes

## HTML parsing

- Fetch the public video page, not `x/player/playurl`.
- Send:
  - `User-Agent: Mozilla/...`
  - `Referer: https://www.bilibili.com/`
- Parse:
  - `window.__playinfo__`
  - `window.__INITIAL_STATE__`
- `__INITIAL_STATE__` can contain a trailing `;(function...)` suffix inside the same script tag. Trim that suffix before calling `JSON.parse`.

## Stream selection

- Use `playinfo.data.dash.video`.
- Prefer `codecs` that start with `avc1`.
- Prefer the highest useful `id` within the filtered list.
- Resolve the URL from:
  - `baseUrl`
  - `base_url`
  - `backupUrl[0]`
  - `backup_url[0]`

## Timestamp handling

- Accept:
  - seconds as a number or numeric string
  - `MM:SS`
  - `HH:MM:SS`
- Clamp the final timestamp to stay slightly before the media end.

## ffmpeg pattern

Use ffmpeg with request headers so remote Bilibili media URLs stay valid:

```text
-headers "Origin: https://www.bilibili.com\r\nReferer: https://www.bilibili.com/\r\nUser-Agent: Mozilla/5.0\r\n"
```

Reliable extraction pattern:

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

Why this pattern works:

- fast seek keeps startup reasonable on remote media
- accurate seek improves frame precision
- `mjpeg` to `pipe:1` makes API handlers easy to implement

## API shape

Prefer an endpoint that:

- accepts `videoUrl` and `timestamp`
- supports GET and POST when convenient
- returns `image/jpeg`
- sets metadata headers such as:
  - `X-Bilibili-Video-Id`
  - `X-Bilibili-Page-Number`
  - `X-Screenshot-Timestamp-Seconds`

## Login-state edge cases

- Public pages can still expose playable DASH URLs anonymously.
- Subtitle APIs can fail without login state even when frame capture works.
- Prefer full `BILIBILI_COOKIE` when present.
- If only `BILIBILI_SESSION_TOKEN` exists, `SESSDATA=<token>` is a fallback, not a guarantee.

## Smoke-test expectations

Minimum passing smoke test:

1. page HTML fetch succeeds
2. `__playinfo__` and `__INITIAL_STATE__` both parse
3. local screenshot endpoint returns `200 image/jpeg`
4. two different timestamps produce two non-empty image files

Treat subtitle failure without cookie as a warning, not a hard failure, unless the user specifically asked to validate subtitle access.
