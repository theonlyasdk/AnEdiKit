#!/usr/bin/env python3
"""Assemble src/index.html from src/partials/*.html.

Partials are the source of truth for page structure; index.html is the
generated artifact (checked in so Tauri, tests, and screenshot tooling keep
reading one file). Order is fixed and explicit — never alphabetical.

Usage:
    python tools/Scripts/assemble_html.py            # regenerate src/index.html
    python tools/Scripts/assemble_html.py --check    # CI: fail if stale
    python tools/Scripts/assemble_html.py --lazy     # lazy pilot: view-custom fetched on demand
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
PART = ROOT / "src" / "partials"
OUT = ROOT / "src" / "index.html"

# Document order of tool views (must match previous monolith sequence).
VIEWS = [
    "view-convert",
    "view-extract_audio",
    "view-trim",
    "view-speed_motion",
    "view-aspect_crop",
    "view-stabilize",
    "view-loop_duration",
    "view-normalize",
    "view-compress",
    "view-compress_audio",
    "view-audio_tags",
    "view-merge",
    "view-mute_replace",
    "view-gif_frames",
    "view-custom",
    "view-bg_remover",
    "view-ai_upscaler",
    "view-vectorizer",
    "view-restore_denoise",
    "view-icon_generator",
    "view-metadata_cleaner",
    "view-ytdlp_video",
    "view-ytdlp_audio",
    "view-ytdlp_playlist",
    "view-ytdlp_subtitles",
    "view-pdf",
    "view-settings",
    "view-kit_ide",
]

ORDER = (
    ["10_head.html", "15_chrome.html", "20_sidebar.html", "30_workspace_open.html"]
    + ["views/%s.html" % v for v in VIEWS]
    + ["40_workspace_close.html", "50_modals.html"]
)


LAZY_VIEWS = {"view-custom"}


def view_placeholder(view_id: str) -> str:
    return f'<div class="tool-view d-none" id="{view_id}"></div>'


def assemble(lazy: bool = False) -> str:
    chunks = []
    for name in ORDER:
        if lazy and name.startswith("views/") and name.removesuffix(".html").removeprefix("views/") in LAZY_VIEWS:
            view_id = name.removeprefix("views/").removesuffix(".html")
            chunks.append(view_placeholder(view_id))
            continue
        path = PART / name
        if not path.is_file():
            raise SystemExit(f"missing partial: {path.relative_to(ROOT)}")
        chunks.append(path.read_text(encoding="utf-8"))
    return "".join(chunks)


def main() -> None:
    lazy = "--lazy" in sys.argv
    html = assemble(lazy=lazy)
    if "--check" in sys.argv:
        current = OUT.read_text(encoding="utf-8")
        if current != html:
            mode = "lazy" if lazy else "full"
            raise SystemExit(f"src/index.html is stale ({mode}) — run tools/Scripts/assemble_html.py" + (" --lazy" if lazy else ""))
        print(f"OK: src/index.html up to date ({len(html)} chars, {len(ORDER)} partials, lazy={lazy})")
        return
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(html)} chars from {len(ORDER)} partials, lazy={lazy})")


if __name__ == "__main__":
    main()
