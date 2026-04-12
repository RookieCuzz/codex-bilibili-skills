#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import requests


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) "
    "Gecko/20100101 Firefox/149.0"
)
REQUEST_TIMEOUT = 15
PLAYER_API_ENDPOINTS = (
    ("player-v2", "https://api.bilibili.com/x/player/v2"),
    ("player-wbi-v2", "https://api.bilibili.com/x/player/wbi/v2"),
)


class BilibiliSubtitleError(Exception):
    """Custom error for subtitle fetching failures."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch Bilibili subtitles and write sectioned Markdown.",
    )
    parser.add_argument("--url", required=True, help="Bilibili video URL")
    parser.add_argument("--output", default="", help="Path to the Markdown output file")
    parser.add_argument(
        "--json-output",
        default="",
        help="Optional path to write normalized JSON output",
    )
    parser.add_argument(
        "--cookie",
        default="",
        help="Full Cookie header value for login-gated subtitle access",
    )
    parser.add_argument(
        "--cookie-file",
        default="",
        help="Path to a file containing the full Cookie header value",
    )
    parser.add_argument(
        "--section-seconds",
        type=int,
        default=60,
        help="Seconds per Markdown section bucket",
    )
    parser.add_argument(
        "--max-gap",
        type=float,
        default=1.2,
        help="Maximum gap between short segments to merge",
    )
    parser.add_argument(
        "--max-chars-per-line",
        type=int,
        default=45,
        help="Maximum merged subtitle length",
    )
    parser.add_argument(
        "--merge-short-line-threshold",
        type=int,
        default=18,
        help="Prefer merging when either neighbor is shorter than this",
    )
    return parser.parse_args()


def normalize_cookie(raw_cookie: str) -> str:
    return raw_cookie.replace("Cookie:", "").replace("\ufeff", "").strip()


def read_cookie(cookie: str, cookie_file: str) -> str:
    if cookie:
        return normalize_cookie(cookie)
    if cookie_file:
        return normalize_cookie(Path(cookie_file).read_text(encoding="utf-8"))
    env_cookie = normalize_cookie(os.environ.get("BILIBILI_COOKIE", ""))
    if env_cookie:
        return env_cookie
    env_session_token = os.environ.get("BILIBILI_SESSION_TOKEN", "").strip()
    if env_session_token:
        session_token = next(
            (item.strip() for item in env_session_token.split(",") if item.strip()),
            "",
        )
        if session_token:
            return f"SESSDATA={session_token}"
    return ""


def build_headers(referer: str, cookie: str = "") -> dict[str, str]:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Referer": referer,
    }
    if cookie:
        headers["Cookie"] = cookie
        headers["Origin"] = "https://www.bilibili.com"
    return headers


def extract_bvid(url: str) -> str:
    match = re.search(r"(BV[0-9A-Za-z]+)", url)
    if not match:
        raise BilibiliSubtitleError("Unable to extract a BV id from the URL.")
    return match.group(1)


def extract_page_index(url: str) -> int:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    raw_value = query.get("p", ["1"])[0]
    try:
        page = int(raw_value)
    except ValueError:
        return 1
    return page if page > 0 else 1


def get_json(url: str, *, params: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
    response = requests.get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    payload = response.json()
    if payload.get("code") != 0:
        raise BilibiliSubtitleError(f"Bilibili API error for {url}: {payload}")
    return payload.get("data", {})


def get_video_info(bvid: str, cookie: str = "") -> dict[str, Any]:
    return get_json(
        "https://api.bilibili.com/x/web-interface/view",
        params={"bvid": bvid},
        headers=build_headers(f"https://www.bilibili.com/video/{bvid}", cookie=cookie),
    )


def get_pagelist(bvid: str, cookie: str = "") -> list[dict[str, Any]]:
    pages = get_json(
        "https://api.bilibili.com/x/player/pagelist",
        params={"bvid": bvid},
        headers=build_headers(f"https://www.bilibili.com/video/{bvid}", cookie=cookie),
    )
    if not pages:
        raise BilibiliSubtitleError("No page list was returned for this video.")
    return pages


def get_cid_by_page(bvid: str, page_index: int, cookie: str = "") -> tuple[int, dict[str, Any]]:
    pages = get_pagelist(bvid, cookie=cookie)
    if page_index > len(pages):
        raise BilibiliSubtitleError(
            f"The video only has {len(pages)} pages, but page {page_index} was requested."
        )
    page_info = pages[page_index - 1]
    cid = page_info.get("cid")
    if not cid:
        raise BilibiliSubtitleError("The selected page has no CID.")
    return int(cid), page_info


def get_player_info_sources(
    bvid: str,
    cid: int,
    page_index: int,
    cookie: str = "",
) -> tuple[list[dict[str, Any]], list[str]]:
    referer = f"https://www.bilibili.com/video/{bvid}/?p={page_index}"
    headers = build_headers(referer, cookie=cookie)
    sources: list[dict[str, Any]] = []
    errors: list[str] = []

    for api_name, api_url in PLAYER_API_ENDPOINTS:
        try:
            data = get_json(
                api_url,
                params={"bvid": bvid, "cid": cid},
                headers=headers,
            )
        except (BilibiliSubtitleError, requests.RequestException) as exc:
            errors.append(f"{api_name}: {exc}")
            continue

        subtitles = data.get("subtitle", {}).get("subtitles", [])
        sources.append(
            {
                "api_name": api_name,
                "api_url": api_url,
                "need_login_subtitle": bool(data.get("need_login_subtitle")),
                "subtitle_count": len(subtitles),
                "data": data,
            }
        )

    if not sources:
        detail = "; ".join(errors) if errors else "No player API returned data."
        raise BilibiliSubtitleError(f"Unable to fetch player metadata. {detail}")

    return sources, errors


def is_ai_subtitle(item: dict[str, Any]) -> bool:
    lan = str(item.get("lan", "")).lower()
    subtitle_type = item.get("type")
    return lan.startswith("ai-") or subtitle_type == 1


def subtitle_priority_key(item: dict[str, Any]) -> tuple[int, int, int, str]:
    lan = str(item.get("lan", "")).lower()
    lan_doc = str(item.get("lan_doc", ""))
    has_url_rank = 0 if str(item.get("subtitle_url", "")).strip() else 1
    is_ai_rank = 1 if is_ai_subtitle(item) else 0

    if not is_ai_rank and lan == "zh-cn":
        language_rank = 0
    elif not is_ai_rank and lan == "zh-hans":
        language_rank = 1
    elif not is_ai_rank and lan == "zh-hant":
        language_rank = 2
    elif not is_ai_rank and (lan.startswith("zh") or "中文" in lan_doc):
        language_rank = 3
    elif lan == "ai-zh":
        language_rank = 4
    elif lan.startswith("zh") or "中文" in lan_doc:
        language_rank = 5
    elif not is_ai_rank:
        language_rank = 6
    else:
        language_rank = 7

    track_id = str(item.get("id_str") or item.get("id") or "")
    return has_url_rank, language_rank, is_ai_rank, track_id


def subtitle_identity_key(item: dict[str, Any], source_name: str, index: int) -> str:
    return (
        str(item.get("id_str") or item.get("id") or "")
        or f"{item.get('lan', '')}::{item.get('type', '')}::{source_name}::{index}"
    )


def collect_subtitle_candidates(player_sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates_by_key: dict[str, dict[str, Any]] = {}

    for source in player_sources:
        subtitles = source["data"].get("subtitle", {}).get("subtitles", [])
        for index, item in enumerate(subtitles):
            enriched = dict(item)
            enriched["player_api_name"] = source["api_name"]
            enriched["player_api_url"] = source["api_url"]
            enriched["is_ai"] = is_ai_subtitle(item)
            candidate_key = subtitle_identity_key(enriched, source["api_name"], index)
            existing = candidates_by_key.get(candidate_key)
            if existing is None:
                candidates_by_key[candidate_key] = enriched
                continue

            existing_has_url = bool(str(existing.get("subtitle_url", "")).strip())
            current_has_url = bool(str(enriched.get("subtitle_url", "")).strip())
            if not existing_has_url and current_has_url:
                candidates_by_key[candidate_key] = enriched

    return sorted(candidates_by_key.values(), key=subtitle_priority_key)


def choose_subtitle(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not candidates:
        raise BilibiliSubtitleError("This page does not expose subtitle tracks.")
    return sorted(candidates, key=subtitle_priority_key)


def normalize_subtitle_url(subtitle_url: str) -> str:
    if subtitle_url.startswith("//"):
        return f"https:{subtitle_url}"
    return subtitle_url


def download_subtitle_json(subtitle_url: str) -> dict[str, Any]:
    response = requests.get(
        normalize_subtitle_url(subtitle_url),
        headers=build_headers("https://www.bilibili.com/"),
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()


def summarize_subtitle_track(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item.get("id"),
        "id_str": item.get("id_str"),
        "lan": item.get("lan"),
        "lan_doc": item.get("lan_doc"),
        "type": item.get("type"),
        "ai_status": item.get("ai_status"),
        "is_ai": bool(item.get("is_ai")),
        "player_api_name": item.get("player_api_name"),
        "subtitle_url": normalize_subtitle_url(str(item.get("subtitle_url", "")).strip()),
    }


def choose_working_subtitle(
    candidates: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    if not candidates:
        raise BilibiliSubtitleError("This page does not expose subtitle tracks.")

    failures: list[dict[str, Any]] = []
    for item in choose_subtitle(candidates):
        subtitle_url = str(item.get("subtitle_url", "")).strip()
        if not subtitle_url:
            failures.append(
                {
                    "track": summarize_subtitle_track(item),
                    "reason": "missing subtitle_url",
                }
            )
            continue

        try:
            subtitle_json = download_subtitle_json(subtitle_url)
        except (requests.RequestException, ValueError) as exc:
            failures.append(
                {
                    "track": summarize_subtitle_track(item),
                    "reason": f"download failed: {exc}",
                }
            )
            continue

        subtitle_body = subtitle_json.get("body", [])
        if not subtitle_body:
            failures.append(
                {
                    "track": summarize_subtitle_track(item),
                    "reason": "empty subtitle body",
                }
            )
            continue

        return item, subtitle_json, failures

    raise BilibiliSubtitleError("No usable subtitle track was found after checking all candidates.")


def seconds_to_label(seconds: float) -> str:
    total_seconds = max(0, int(seconds))
    minutes = total_seconds // 60
    secs = total_seconds % 60
    return f"{minutes:02d}:{secs:02d}"


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def merge_subtitle_segments(
    subtitle_body: list[dict[str, Any]],
    *,
    max_gap: float,
    max_chars_per_line: int,
    merge_short_line_threshold: int,
) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    for item in subtitle_body:
        start_time = float(item.get("from", 0))
        end_time = float(item.get("to", start_time))
        content = normalize_text(str(item.get("content", "")))
        if not content:
            continue

        current = {
            "from": start_time,
            "to": end_time,
            "content": content,
        }

        if not segments:
            segments.append(current)
            continue

        previous = segments[-1]
        gap = start_time - float(previous["to"])
        merged_candidate = f"{previous['content']} {content}".strip()
        should_merge = (
            gap <= max_gap
            and len(merged_candidate) <= max_chars_per_line
            and (
                len(str(previous["content"])) <= merge_short_line_threshold
                or len(content) <= merge_short_line_threshold
            )
        )

        if should_merge:
            previous["to"] = end_time
            previous["content"] = merged_candidate
        else:
            segments.append(current)

    return segments


def group_segments_by_time(
    segments: list[dict[str, Any]],
    *,
    section_seconds: int,
) -> list[dict[str, Any]]:
    grouped: list[dict[str, Any]] = []
    for segment in segments:
        start_sec = int(float(segment["from"]))
        bucket_start = (start_sec // section_seconds) * section_seconds
        bucket_end = bucket_start + section_seconds - 1

        if not grouped or grouped[-1]["bucket_start"] != bucket_start:
            grouped.append(
                {
                    "bucket_start": bucket_start,
                    "bucket_end": bucket_end,
                    "items": [],
                }
            )

        grouped[-1]["items"].append(segment)

    return grouped


def subtitle_body_to_markdown_sectioned(
    *,
    video_title: str,
    video_url: str,
    bvid: str,
    cid: int,
    page_index: int,
    part_title: str,
    subtitle_item: dict[str, Any],
    grouped_segments: list[dict[str, Any]],
) -> str:
    subtitle_url = normalize_subtitle_url(str(subtitle_item.get("subtitle_url", "")))
    subtitle_language = str(subtitle_item.get("lan_doc") or subtitle_item.get("lan") or "")
    subtitle_count = sum(len(group["items"]) for group in grouped_segments)

    lines = [
        f"# {video_title}",
        "",
        f"- Source URL: {video_url}",
        f"- BV ID: `{bvid}`",
        f"- CID: `{cid}`",
        f"- Page: `P{page_index}`",
        f"- Page title: {part_title or 'N/A'}",
        f"- Subtitle language: {subtitle_language or 'unknown'}",
        f"- Subtitle URL: `{subtitle_url}`",
        f"- Subtitle count: {subtitle_count}",
        "",
        "## Transcript",
        "",
    ]

    for group in grouped_segments:
        start_label = seconds_to_label(float(group["bucket_start"]))
        end_label = seconds_to_label(float(group["bucket_end"]))
        lines.append(f"### {start_label} - {end_label}")
        lines.append("")
        for item in group["items"]:
            timestamp = seconds_to_label(float(item["from"]))
            lines.append(f"- `{timestamp}` {item['content']}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def sanitize_filename(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "_", name).strip("._ ") or "subtitle"


def save_text(text: str, output_path: str) -> Path:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def save_json(data: dict[str, Any], output_path: str) -> Path:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def bilibili_subtitle_to_md(
    *,
    video_url: str,
    output_path: str = "",
    json_output_path: str = "",
    cookie: str = "",
    section_seconds: int = 60,
    max_gap: float = 1.2,
    max_chars_per_line: int = 45,
    merge_short_line_threshold: int = 18,
) -> tuple[Path, Path | None]:
    bvid = extract_bvid(video_url)
    page_index = extract_page_index(video_url)

    video_info = get_video_info(bvid, cookie=cookie)
    video_title = str(video_info.get("title", "")).strip() or bvid
    cid, page_info = get_cid_by_page(bvid, page_index, cookie=cookie)
    part_title = str(page_info.get("part", "")).strip()

    player_sources, player_errors = get_player_info_sources(bvid, cid, page_index, cookie=cookie)
    subtitle_candidates = collect_subtitle_candidates(player_sources)
    if not subtitle_candidates:
        if any(source.get("need_login_subtitle") for source in player_sources):
            raise BilibiliSubtitleError(
                "Subtitle access is login-gated. Provide a full browser Cookie header."
            )
        raise BilibiliSubtitleError("This page currently exposes no subtitle tracks.")

    subtitle_item, subtitle_json, subtitle_fetch_failures = choose_working_subtitle(subtitle_candidates)
    subtitle_url = str(subtitle_item.get("subtitle_url", "")).strip()
    subtitle_body = subtitle_json.get("body", [])
    if not subtitle_body:
        raise BilibiliSubtitleError("The subtitle JSON body is empty.")

    merged_segments = merge_subtitle_segments(
        subtitle_body,
        max_gap=max_gap,
        max_chars_per_line=max_chars_per_line,
        merge_short_line_threshold=merge_short_line_threshold,
    )
    grouped_segments = group_segments_by_time(
        merged_segments,
        section_seconds=section_seconds,
    )
    markdown = subtitle_body_to_markdown_sectioned(
        video_title=video_title,
        video_url=video_url,
        bvid=bvid,
        cid=cid,
        page_index=page_index,
        part_title=part_title,
        subtitle_item=subtitle_item,
        grouped_segments=grouped_segments,
    )

    if not output_path:
        filename = sanitize_filename(f"{video_title}.md")
        output_path = filename

    json_path: Path | None = None
    normalized_payload = {
        "title": video_title,
        "site": "bilibili",
        "source_url": video_url,
        "video_id": bvid,
        "aid": video_info.get("aid"),
        "video_uploader": str(video_info.get("owner", {}).get("name", "")),
        "cid": cid,
        "page_number": page_index,
        "page_title": part_title,
        "page_duration": page_info.get("duration"),
        "player_api_used": subtitle_item.get("player_api_name"),
        "player_api_attempts": [
            {
                "api_name": source["api_name"],
                "api_url": source["api_url"],
                "need_login_subtitle": source["need_login_subtitle"],
                "subtitle_count": source["subtitle_count"],
            }
            for source in player_sources
        ],
        "player_api_errors": player_errors,
        "available_subtitles": [summarize_subtitle_track(item) for item in subtitle_candidates],
        "selected_subtitle": summarize_subtitle_track(subtitle_item),
        "subtitle_language": str(subtitle_item.get("lan") or ""),
        "subtitle_language_label": str(subtitle_item.get("lan_doc") or ""),
        "selected_subtitle_is_ai": bool(subtitle_item.get("is_ai")),
        "subtitle_url": normalize_subtitle_url(subtitle_url),
        "subtitle_body_count": len(subtitle_body),
        "subtitle_fetch_failures": subtitle_fetch_failures,
        "merged_segments": merged_segments,
        "grouped_segments": grouped_segments,
    }

    markdown_path = save_text(markdown, output_path)
    if json_output_path:
        json_path = save_json(normalized_payload, json_output_path)

    return markdown_path, json_path


def main() -> int:
    args = parse_args()
    cookie = read_cookie(args.cookie, args.cookie_file)
    try:
        markdown_path, json_path = bilibili_subtitle_to_md(
            video_url=args.url,
            output_path=args.output,
            json_output_path=args.json_output,
            cookie=cookie,
            section_seconds=args.section_seconds,
            max_gap=args.max_gap,
            max_chars_per_line=args.max_chars_per_line,
            merge_short_line_threshold=args.merge_short_line_threshold,
        )
    except (BilibiliSubtitleError, requests.RequestException, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Markdown saved to: {markdown_path.resolve()}")
    if json_path:
        print(f"JSON saved to: {json_path.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
