#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import requests

from bilibili_subtitle_to_md import (
    BilibiliSubtitleError,
    REQUEST_TIMEOUT,
    extract_bvid,
    extract_page_index,
    get_cid_by_page,
    get_video_info,
    read_cookie,
)


DEFAULT_MODEL = "small"
DEFAULT_DEVICE = "cpu"
DEFAULT_COMPUTE_TYPE = "int8"
DEFAULT_LANGUAGE = "auto"
DEFAULT_BEAM_SIZE = 5
DEFAULT_AUDIO_FILENAME = "audio-16k.wav"
DEFAULT_SRT_FILENAME = "asr.srt"
DEFAULT_JSON_FILENAME = "asr.json"
DEFAULT_FFMPEG_TIMEOUT_SECONDS = 900
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
)
BILIBILI_ORIGIN = "https://www.bilibili.com"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract Bilibili audio and run local ASR to export SRT.",
    )
    parser.add_argument("--url", required=True, help="Bilibili video URL")
    parser.add_argument(
        "--output-dir",
        default="",
        help="Directory for audio/SRT/JSON outputs",
    )
    parser.add_argument(
        "--audio-output",
        default="",
        help="Optional explicit WAV output path",
    )
    parser.add_argument(
        "--srt-output",
        default="",
        help="Optional explicit SRT output path",
    )
    parser.add_argument(
        "--json-output",
        default="",
        help="Optional explicit JSON metadata output path",
    )
    parser.add_argument(
        "--cookie",
        default="",
        help="Full Cookie header value for login-gated playback access",
    )
    parser.add_argument(
        "--cookie-file",
        default="",
        help="Path to a file containing the full Cookie header value",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help="faster-whisper model name or local model path",
    )
    parser.add_argument(
        "--device",
        default=DEFAULT_DEVICE,
        help="ASR device, for example cpu or cuda",
    )
    parser.add_argument(
        "--compute-type",
        default=DEFAULT_COMPUTE_TYPE,
        help="faster-whisper compute type, for example int8 or float16",
    )
    parser.add_argument(
        "--language",
        default=DEFAULT_LANGUAGE,
        help="Language code or auto",
    )
    parser.add_argument(
        "--beam-size",
        type=int,
        default=DEFAULT_BEAM_SIZE,
        help="Beam size for transcription",
    )
    parser.add_argument(
        "--ffmpeg-path",
        default="",
        help="Optional explicit ffmpeg executable path",
    )
    parser.add_argument(
        "--ffmpeg-timeout-seconds",
        type=int,
        default=DEFAULT_FFMPEG_TIMEOUT_SECONDS,
        help="Timeout for ffmpeg audio extraction",
    )
    parser.add_argument(
        "--reuse-audio",
        action="store_true",
        help="Skip ffmpeg extraction when the WAV already exists",
    )
    return parser.parse_args()


def build_browser_headers(referer: str, cookie: str = "") -> dict[str, str]:
    headers = {
        "User-Agent": DEFAULT_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Origin": BILIBILI_ORIGIN,
        "Referer": referer,
    }
    if cookie:
        headers["Cookie"] = cookie
    return headers


def extract_script_json(html: str, variable_name: str) -> dict[str, Any]:
    pattern = re.compile(
        rf"<script>\s*window\.{re.escape(variable_name)}\s*=\s*([\s\S]*?)</script>",
        re.IGNORECASE,
    )
    match = pattern.search(html)
    if not match:
        raise BilibiliSubtitleError(f"Bilibili page is missing {variable_name}.")

    raw_content = match.group(1).strip()
    if raw_content.endswith(";"):
        raw_content = raw_content[:-1]

    try:
        return json.loads(raw_content)
    except json.JSONDecodeError:
        trailing_index = raw_content.find(";(function")
        if trailing_index < 0:
            raise BilibiliSubtitleError(f"Bilibili page contains invalid {variable_name}.")
        return json.loads(raw_content[:trailing_index])


def fetch_page_html(video_url: str, cookie: str = "") -> tuple[str, str]:
    bvid = extract_bvid(video_url)
    page_index = extract_page_index(video_url)
    referer = f"{BILIBILI_ORIGIN}/video/{bvid}/?p={page_index}"
    response = requests.get(
        referer,
        headers=build_browser_headers(referer, cookie=cookie),
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return response.text, referer


def select_best_audio(dash_audio: list[dict[str, Any]]) -> dict[str, Any]:
    if not dash_audio:
        raise BilibiliSubtitleError("No playable Bilibili audio stream was found.")

    def score(item: dict[str, Any]) -> tuple[int, int, int]:
        bandwidth = int(item.get("bandwidth") or 0)
        audio_id = int(item.get("id") or 0)
        url_rank = 1 if get_stream_url(item) else 0
        return url_rank, bandwidth, audio_id

    ranked = sorted(dash_audio, key=score, reverse=True)
    best = ranked[0]
    if not get_stream_url(best):
        raise BilibiliSubtitleError("The selected audio stream has no URL.")
    return best


def get_stream_url(item: dict[str, Any]) -> str:
    return str(
        item.get("baseUrl")
        or item.get("base_url")
        or (item.get("backupUrl") or [None])[0]
        or (item.get("backup_url") or [None])[0]
        or ""
    ).strip()


def summarize_audio_track(item: dict[str, Any] | None) -> dict[str, Any] | None:
    if not item:
        return None

    return {
        "id": item.get("id"),
        "bandwidth": item.get("bandwidth"),
        "codecs": item.get("codecs"),
        "mime_type": item.get("mimeType") or item.get("mime_type"),
        "has_backup_url": bool(item.get("backupUrl") or item.get("backup_url")),
    }


def resolve_media_source(video_url: str, cookie: str = "") -> dict[str, Any]:
    bvid = extract_bvid(video_url)
    page_index = extract_page_index(video_url)
    video_info = get_video_info(bvid, cookie=cookie)
    cid, page_info = get_cid_by_page(bvid, page_index, cookie=cookie)
    html, referer = fetch_page_html(video_url, cookie=cookie)
    playinfo = extract_script_json(html, "__playinfo__")
    initial_state = extract_script_json(html, "__INITIAL_STATE__")
    data = playinfo.get("data", {})
    dash = data.get("dash") or {}

    media_url = ""
    stream_kind = ""
    selected_audio: dict[str, Any] | None = None

    if dash.get("audio"):
        selected_audio = select_best_audio(list(dash["audio"]))
        media_url = get_stream_url(selected_audio)
        stream_kind = "dash-audio"
    elif data.get("durl"):
        media_url = str((data["durl"][0] or {}).get("url") or "").strip()
        stream_kind = "durl"

    if not media_url:
        raise BilibiliSubtitleError("Unable to resolve a direct Bilibili media URL.")

    page_title = str(page_info.get("part", "")).strip()
    initial_video_title = str(initial_state.get("videoData", {}).get("title", "")).strip()
    video_title = (
        initial_video_title
        or str(initial_state.get("h1Title", "")).strip()
        or str(video_info.get("title", "")).strip()
        or bvid
    )

    return {
        "aid": video_info.get("aid"),
        "bvid": bvid,
        "cid": cid,
        "cookie_used": bool(cookie),
        "duration_seconds": max(0.0, float(data.get("timelength") or 0) / 1000),
        "media_url": media_url,
        "page_index": page_index,
        "page_title": page_title,
        "referer": referer,
        "stream_kind": stream_kind,
        "title": video_title,
        "uploader": str(video_info.get("owner", {}).get("name", "")),
        "selected_audio": selected_audio,
    }


def resolve_ffmpeg_path(explicit_path: str = "") -> Path:
    candidates: list[Path] = []
    if explicit_path:
        candidates.append(Path(explicit_path))

    ffmpeg_env = Path(os.environ["FFMPEG_PATH"]) if "FFMPEG_PATH" in os.environ else None
    if ffmpeg_env:
        candidates.append(ffmpeg_env)

    repo_root = Path(__file__).resolve().parents[2]
    candidates.append(repo_root / "node_modules" / "ffmpeg-static" / "ffmpeg.exe")
    candidates.extend(
        sorted(repo_root.glob("outputs/*/_deps/node_modules/ffmpeg-static/ffmpeg.exe"))
    )

    which_path = shutil.which("ffmpeg")
    if which_path:
        candidates.append(Path(which_path))

    for candidate in candidates:
        if candidate and candidate.exists():
            return candidate.resolve()

    raise FileNotFoundError(
        "Unable to find ffmpeg. Pass --ffmpeg-path or set FFMPEG_PATH."
    )


def build_ffmpeg_header_blob(headers: dict[str, str]) -> str:
    return "".join(f"{key}: {value}\r\n" for key, value in headers.items() if value)


def extract_audio_with_ffmpeg(
    *,
    ffmpeg_path: Path,
    media_source: dict[str, Any],
    audio_output: Path,
    timeout_seconds: int,
    cookie: str = "",
) -> None:
    audio_output.parent.mkdir(parents=True, exist_ok=True)
    headers = build_browser_headers(media_source["referer"], cookie=cookie)
    ffmpeg_args = [
        str(ffmpeg_path),
        "-v",
        "error",
        "-headers",
        build_ffmpeg_header_blob(headers),
        "-i",
        str(media_source["media_url"]),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        "-y",
        str(audio_output),
    ]

    completed = subprocess.run(
        ffmpeg_args,
        capture_output=True,
        check=False,
        text=True,
        timeout=timeout_seconds,
    )
    if completed.returncode != 0:
        stderr = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(stderr or f"ffmpeg exited with code {completed.returncode}")

    if not audio_output.exists() or audio_output.stat().st_size == 0:
        raise RuntimeError("ffmpeg did not produce a valid WAV file.")


def format_srt_timestamp(seconds: float) -> str:
    total_milliseconds = max(0, int(round(seconds * 1000)))
    hours = total_milliseconds // 3_600_000
    remainder = total_milliseconds % 3_600_000
    minutes = remainder // 60_000
    remainder %= 60_000
    secs = remainder // 1000
    milliseconds = remainder % 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"


def write_srt(segments: list[dict[str, Any]], output_path: Path) -> None:
    lines: list[str] = []
    for index, segment in enumerate(segments, start=1):
        start = float(segment["start"])
        end = float(segment["end"])
        text = str(segment["text"]).strip()
        if not text:
            continue
        lines.extend(
            [
                str(index),
                f"{format_srt_timestamp(start)} --> {format_srt_timestamp(end)}",
                text,
                "",
            ]
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def transcribe_audio(
    *,
    audio_path: Path,
    model_name: str,
    device: str,
    compute_type: str,
    language: str,
    beam_size: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError(
            "faster-whisper is not installed. Run: pip install faster-whisper"
        ) from exc

    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    segments_iter, info = model.transcribe(
        str(audio_path),
        beam_size=beam_size,
        condition_on_previous_text=False,
        language=None if language.lower() == "auto" else language,
        vad_filter=True,
    )

    segments: list[dict[str, Any]] = []
    for segment in segments_iter:
        text = str(segment.text).strip()
        if not text:
            continue
        segments.append(
            {
                "id": int(segment.id),
                "start": float(segment.start),
                "end": float(segment.end),
                "text": text,
            }
        )

    if not segments:
        raise RuntimeError("ASR finished but produced no subtitle segments.")

    metadata = {
        "language": getattr(info, "language", None),
        "language_probability": getattr(info, "language_probability", None),
        "duration": getattr(info, "duration", None),
        "duration_after_vad": getattr(info, "duration_after_vad", None),
    }
    return segments, metadata


def build_output_paths(args: argparse.Namespace, page_index: int) -> tuple[Path, Path, Path]:
    if args.audio_output:
        audio_path = Path(args.audio_output)
    elif args.output_dir:
        audio_path = Path(args.output_dir) / DEFAULT_AUDIO_FILENAME
    else:
        audio_path = Path(f"P{page_index:02d}-{DEFAULT_AUDIO_FILENAME}")

    if args.srt_output:
        srt_path = Path(args.srt_output)
    elif args.output_dir:
        srt_path = Path(args.output_dir) / DEFAULT_SRT_FILENAME
    else:
        srt_path = Path(f"P{page_index:02d}-{DEFAULT_SRT_FILENAME}")

    if args.json_output:
        json_path = Path(args.json_output)
    elif args.output_dir:
        json_path = Path(args.output_dir) / DEFAULT_JSON_FILENAME
    else:
        json_path = Path(f"P{page_index:02d}-{DEFAULT_JSON_FILENAME}")

    return audio_path, srt_path, json_path


def save_json(payload: dict[str, Any], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> int:
    args = parse_args()
    cookie = read_cookie(args.cookie, args.cookie_file)

    try:
        media_source = resolve_media_source(args.url, cookie=cookie)
        audio_output, srt_output, json_output = build_output_paths(
            args,
            media_source["page_index"],
        )
        ffmpeg_path = resolve_ffmpeg_path(args.ffmpeg_path)

        if not (args.reuse_audio and audio_output.exists() and audio_output.stat().st_size > 0):
            extract_audio_with_ffmpeg(
                ffmpeg_path=ffmpeg_path,
                media_source=media_source,
                audio_output=audio_output,
                timeout_seconds=args.ffmpeg_timeout_seconds,
                cookie=cookie,
            )

        segments, asr_metadata = transcribe_audio(
            audio_path=audio_output,
            model_name=args.model,
            device=args.device,
            compute_type=args.compute_type,
            language=args.language,
            beam_size=args.beam_size,
        )
        write_srt(segments, srt_output)

        payload = {
            "source_url": args.url,
            "site": "bilibili",
            "video_id": media_source["bvid"],
            "aid": media_source["aid"],
            "cid": media_source["cid"],
            "title": media_source["title"],
            "page_number": media_source["page_index"],
            "page_title": media_source["page_title"],
            "uploader": media_source["uploader"],
            "stream_kind": media_source["stream_kind"],
            "duration_seconds": media_source["duration_seconds"],
            "selected_audio": summarize_audio_track(media_source["selected_audio"]),
            "audio_path": str(audio_output.resolve()),
            "srt_path": str(srt_output.resolve()),
            "ffmpeg_path": str(ffmpeg_path),
            "asr_engine": "faster-whisper",
            "asr_model": args.model,
            "asr_device": args.device,
            "asr_compute_type": args.compute_type,
            "requested_language": args.language,
            "detected_language": asr_metadata["language"],
            "detected_language_probability": asr_metadata["language_probability"],
            "segment_count": len(segments),
            "segments": segments,
        }
        save_json(payload, json_output)
    except (
        BilibiliSubtitleError,
        FileNotFoundError,
        requests.RequestException,
        RuntimeError,
        subprocess.TimeoutExpired,
        ValueError,
    ) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Audio saved to: {audio_output.resolve()}")
    print(f"SRT saved to: {srt_output.resolve()}")
    print(f"JSON saved to: {json_output.resolve()}")
    print(f"Video: {media_source['bvid']} (P{media_source['page_index']})")
    print(f"Page title: {media_source['page_title'] or 'N/A'}")
    print(f"Detected language: {payload['detected_language']}")
    print(f"Segments: {payload['segment_count']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
