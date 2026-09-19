# AnEdiKit Screenshots

Reference captures of the AnEdiKit interface, one folder per release version. Descriptions of each tool live in [introduction.md](../introduction.md).

| Version | Desktop | Mobile | Notes |
| --- | --- | --- | --- |
| 0.1.0 | 3 pages | none | Early subset: Convert, Trim, Background Remover |
| 0.2.0 | none | none | Folder reserved, no captures |
| 0.3.0 | 25 pages, 3 dialogs | 25 pages, 4 drawer views | Complete tool set |
| 0.4.2 | 26 pages, 3 dialogs | 26 pages, 4 drawer views | Added Audio Tag & Metadata Editor, UI refinements |
| 0.5.0 | 34 pages, 3 dialogs | 34 pages, 4 drawer views | Added PDF Tools, All Tools browser, UI & motion polish |

## 0.3.0

Page captures are full height rather than viewport height. The app scrolls inside its own panels, so the capture grows the emulated viewport until nothing is left clipped. Width stays fixed, 1280 CSS px at 1.5x for desktop and 390 CSS px at 2x for mobile where the sidebar becomes a navigation drawer, while height follows the content: desktop runs from 1920x2273 for ordinary pages to 1920x3720 for Settings, and mobile from 780x2658 for drawer views to 780x6852 for Settings.

All pages are captured in their empty state, with no media, URL, or image queue loaded. Upload and drop zones therefore show their placeholder prompts, and the command preview shows the default generated string for each tool.

### Desktop pages

Files live directly in `0.3.0/`.

| Tool | Tool ID | File |
| --- | --- | --- |
| Convert Video Formats | `convert` | convert_video.png |
| Compress Video | `compress` | compress_video.png |
| Trim and Cut Media | `trim` | trim_and_cut.png |
| Speed & Motion Control | `speed_motion` | speed_motion.png |
| Aspect Ratio & Crop Framing | `aspect_crop` | aspect_crop.png |
| Video Stabilization & Deshake | `stabilize` | video_stabilization.png |
| Loop to Duration | `loop_duration` | loop_to_duration.png |
| Volume Normalization & Loudness | `normalize` | normalize_loudness.png |
| Mute or Replace Audio | `mute_replace` | mute_or_replace_audio.png |
| GIF and Frame Extraction | `gif_frames` | gif_and_frames.png |
| Extract & Convert Audio | `extract_audio` | extract_and_convert_audio.png |
| Compress Audio | `compress_audio` | compress_audio.png |
| Audio Tag & Metadata Editor | `audio_tags` | audio_tag_editor.png |
| Merge and Concatenate | `merge` | merge_and_concat.png |
| Custom FFmpeg Command | `custom` | custom_command.png |
| AI Background Remover | `bg_remover` | background_remover.png |
| AI Image Upscaler | `ai_upscaler` | ai_image_upscaler.png |
| Image Vectorizer (SVG) | `vectorizer` | image_vectorizer.png |
| Image Restoration & Denoise | `restore_denoise` | restore_denoise.png |
| Icon & Asset Generator | `icon_generator` | icon_generator.png |
| Metadata Viewer & Cleaner | `metadata_cleaner` | metadata_cleaner.png |
| Download Audio & Music | `ytdlp_audio` | download_audio.png |
| Download Video | `ytdlp_video` | download_video.png |
| Download Playlist | `ytdlp_playlist` | download_playlist.png |
| Subtitles & Thumbnails | `ytdlp_subtitles` | subtitles_thumbnails.png |
| Settings & Defaults | `settings` | settings.png |

### Mobile pages

`0.3.0/mobile/` mirrors the table above with the same filenames, captured with the drawer closed at phone width. Four pages also have a companion capture with the navigation drawer open, one per sidebar section:

| Page | File |
| --- | --- |
| Convert Video Formats, drawer open | mobile/convert_video_drawer.png |
| AI Background Remover, drawer open | mobile/background_remover_drawer.png |
| Download Video, drawer open | mobile/download_video_drawer.png |
| Settings & Defaults, drawer open | mobile/settings_drawer.png |

The drawer is only used below the 768px breakpoint. At that width the Settings entry lives inside the drawer rather than the desktop sidebar footer, which is why one of the drawer captures is taken on the Settings page. Drawer captures are sized to the drawer contents, so the whole navigation list is visible without scrolling.

### Dialogs

Captured once, at desktop width, after the page sweep.

| Dialog | File | Notes |
| --- | --- | --- |
| Credits / About | modal_credits.png | Opened by clicking the AnEdiKit logo |
| Filename Format Editor | modal_filename_format_editor.png | Opened from the Edit button in the yt-dlp URL card |
| Comparison View | modal_comparison.png | Split slider loaded with two fixtures from `test/images`: fake_transparency.jpg as the original and test_perfect_cutout.png as the result |

The Comparison View is normally opened from a finished queue item, which needs a real processing job, so tooling opens it through `window.openComparisonModal()` instead. It loads images from `test/images` through a capture-only route on the local server, and the capture fails if either half of the split view has not decoded.

## Regenerating

```bash
npm run screenshots                                # desktop and mobile
node tools/Scripts/capture_screenshots.js --mode mobile
node tools/Scripts/capture_screenshots.js --mode desktop
node tools/Scripts/capture_screenshots.js --out docs/screenshots/0.3.0
```

The script serves `src/` over a local HTTP server and drives headless Chrome through the DevTools Protocol, walking every sidebar entry the same way a click does. No Tauri build, Rust toolchain, or running desktop app is required. The output folder is the app version from `src-tauri/tauri.conf.json`, so a version bump writes a new folder.

Notes:

- Requires Node 22 or newer, which provides the built-in WebSocket used for the DevTools connection, plus an installed Chrome or Chromium. Set `CHROME_PATH` if the browser is not in a standard location.
- User kit pages are skipped. They only appear once the "enable user kits" setting is on, and their layout is user-defined.
- Every capture is checked before the run finishes: the expected `view-*` container must be visible, the tool header must have a title, the drawer must be in the expected state for that capture, the page must still be in its empty state, no content may be left clipped at the fitted height, and the PNG must contain real pixel variance rather than a blank frame. A bad capture prints a warning and fails the run.
- Each run uses a fresh throwaway browser profile, so saved tool parameters, the active tool, and theme settings from a real install never leak into the captures.
- PNGs are overwritten in place rather than cleaned up first. If a page or its filename changes again, delete the leftover PNG by hand.
- The `--mode` flag covers pages only; dialogs are captured as part of `desktop`.
