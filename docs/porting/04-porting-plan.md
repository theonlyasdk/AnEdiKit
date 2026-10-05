# Porting Plan and Execution Roadmap

This document outlines the recommended order of work to port the AnEdiKit frontend to React 19, Vite, TypeScript, Tailwind CSS, and shadcn/ui. The plan prioritizes early validation of the Rust Tauri v2 IPC bridge, reusable component extraction, and incremental tool migration with behavioral verification against the existing implementation.

## Guiding Principles

1. Non-destructive migration: The original HTML/CSS/JS frontend files remain untouched while the new React structure is established and verified.
2. Unchanged Rust backend: All 39 Tauri invoke commands and 6 event channels remain identical in signature, payload shape, and emission semantics.
3. Decoupled command generators: Command builders must be pure TypeScript functions taking typed state models, with zero direct DOM access.
4. Pilot-first validation: Validate the entire execution lifecycle (file picking, media inspection, command construction, process spawning, progress streaming, cancellation, completion, and error handling) on a single pilot tool before migrating other tools.

## Phase Overview

### Phase 1: Tooling and Project Scaffolding
- Initialize Vite React + TypeScript configuration inside the project root or frontend directory.
- Configure Tailwind CSS v3 or v4 with custom color variables matching the AnEdiKit design system tokens.
- Install shadcn/ui dependencies: radix-ui primitives, class-variance-authority, clsx, tailwind-merge, lucide-react.
- Setup TypeScript path aliases (`@/*` pointing to `src/`).
- Setup Tauri v2 client bindings `@tauri-apps/api` and `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`.

### Phase 2: App Shell and Navigation
- Port window controls (`WindowHeader.tsx`) with Tauri window minimize, maximize, and close handlers, frameless titlebar drag regions, and acrylic backdrop styling.
- Port application sidebar (`Sidebar.tsx`) with category groupings (Video, Audio, YouTube, Image & AI, PDF & Tools, System), active route indicator, and collapsible state.
- Port global search and dashboard view (`Dashboard.tsx`) with tool filtering, category chips, and keyboard shortcut navigation (`Ctrl+K`).
- Port theme provider (`ThemeProvider.tsx`) supporting dark, light, and system themes persisted to localStorage.
- Port bottom status footer (`StatusFooter.tsx`) displaying background task status and hardware stats.

### Phase 3: Core IPC Bridge and Pilot Tool
Select `Convert` as the pilot tool due to its comprehensive coverage of the standard workflow:
- File picking via native Tauri open dialog (`pick_file` invoke or `@tauri-apps/plugin-dialog`).
- Media probe invocation (`get_media_info`).
- Shared input preview card displaying resolution, codec, duration, and file size.
- Conversion options form with format selector, video codec, audio codec, CRF quality slider, and preset selection.
- Destination folder selection with conflict detection (`check_file_exists`).
- Execution runner integration listening to `ffmpeg-progress`, `ffmpeg-log`, and `ffmpeg-finished`.
- Cancelation handling (`cancel_ffmpeg`).
- Completion dialog with output folder reveal (`open_file_folder`).

### Phase 4: Remaining FFmpeg Video and Audio Tools
Migrate the standardized FFmpeg tools utilizing the shared components established in Phase 3:
1. `Compress` (target file size calculation and two-pass encoding).
2. `Trim` (visual time scrubbing, start and end points).
3. `Speed & Motion` (speed multipliers, setpts and atempo filters, reverse playback).
4. `Aspect & Crop` (preset ratios, custom dimension calculation, crop filters).
5. `Stabilize` (two-pass vidstabdetect and vidstabtransform).
6. `Loop & Duration` (stream looping and exact duration extension).
7. `Audio Normalizer` (loudnorm two-pass EBU R128 and peak normalization).
8. `Mute & Replace Audio` (audio stripping and secondary track injection).
9. `GIF & Frame Extraction` (palettegen / paletteuse filters and sequential image export).
10. `Extract Audio` (audio stream extraction and re-encoding).
11. `Compress Audio` (audio bitrate targeting and voice optimization).
12. `Audio Metadata & Tags` (ID3 tagging and album art embedding).
13. `Merge Files` (multi-file reordering table, concat demuxer vs filter_complex).
14. `Custom FFmpeg` (raw arguments builder and preset manager).

### Phase 5: yt-dlp Suite
Migrate download and extraction tools:
1. `yt-dlp Video Downloader` (URL validation, quality selectors, cookies file picking).
2. `yt-dlp Audio Extractor` (audio format selection, thumbnail embedding).
3. `yt-dlp Playlist Downloader` (playlist inspection, virtualized item checklist, batch download execution).
4. `yt-dlp Subtitle Downloader` (language selection, subtitle format, auto-generated vs manual captions).

### Phase 6: Image and AI Tools
Migrate Python and engine-backed visual tools:
1. `Background Remover` (engine selection: RMBG-2.0, BiRefNet, rembg; alpha matting options; preview comparison).
2. `AI Upscaler` (RealESRGAN model selector, outscale factor, tile size configuration).
3. `Vectorizer` (VTracer color clustering, path precision, SVG preview).
4. `Restore & Denoise` (scanned document cleaning, blur removal, binarization).
5. `App Icon Generator` (multi-platform asset pack generation, icon preview grid).
6. `Metadata Cleaner` (EXIF and container metadata stripping).

### Phase 7: PDF Tools and Custom Kits
Migrate document processing and IDE modules:
1. `PDF Tools Suite` (Organize, Security, Compress, Convert, Edit & OCR, Watermark, Repair).
2. `Kit IDE` (Kits management, visual node runner, Monaco script editor integration).

### Phase 8: Settings and Binaries Management
1. General application preferences (default output directory, concurrent task limits, notification preferences).
2. Binaries status inspector (`get_binaries_status` invoke).
3. Automated binary downloader (`download_binary` invoke with progress listening).
4. Path override configuration for custom binary installations.

## Pilot Tool Implementation Specification: Convert Tool

The `Convert` tool serves as the primary verification milestone.

### Input State
- Source file path: string.
- Media probe data: width, height, duration, format_name, video_codec, audio_codec, bit_rate, size.

### Form State
- Output format: container string (e.g. `mp4`, `mkv`, `webm`, `avi`, `mov`).
- Video codec: string (e.g. `libx264`, `libx265`, `libvpx-vp9`, `copy`).
- Audio codec: string (e.g. `aac`, `libmp3lame`, `libopus`, `copy`).
- Preset: string (`ultrafast`, `fast`, `medium`, `slow`, `veryslow`).
- CRF: number (0 to 51, default 23).
- Audio bitrate: string (`128k`, `192k`, `320k`).
- Hardware acceleration: boolean.

### Output State
- Destination directory: string (defaults to source directory or global setting).
- Target filename: auto-generated from source name + target extension.
- Overwrite mode: prompt, overwrite, or increment filename.

### Runner Lifecycle
1. User clicks Start.
2. Validate source path exists and options are valid.
3. Check destination file existence via `check_file_exists`.
4. If exists, prompt user or auto-append suffix based on settings.
5. Invoke `execute_ffmpeg` with generated argument array.
6. Open execution terminal drawer displaying real-time stdout/stderr lines from `ffmpeg-log`.
7. Update progress bar and percentage from `ffmpeg-progress`.
8. Handle completion via `ffmpeg-finished` with return code check.
9. Display completion card with open file and open folder actions.

## Behavioral Verification Checklist

Verify the following behaviors against the existing vanilla implementation:

### Shell and Navigation
- Frameless window can be dragged from custom drag regions.
- Minimize, maximize, restore, and close buttons trigger window actions without lag.
- Double-clicking the titlebar toggles window maximization.
- Switching tools preserves unsaved form state where appropriate.
- Search input filters tools by title, description, and keywords instantly.
- Theme switch applies immediately without flash of unstyled content.

### File Selection and Drag and Drop
- Dragging a file over the drop zone shows active drop styling.
- Dropping a file populates the file path and triggers media probing.
- Dropping an invalid file type displays an error toast.
- Clicking Browse opens the native OS file picker.
- Recent files list updates on file selection.

### Media Information Probe
- Media dimensions, codec, duration, and file size format match probe output.
- Non-media files gracefully show minimal file info without crashing.
- Invalid media files display an inspection error alert.

### Execution and Process Control
- FFmpeg command arguments match the exact flags produced by the legacy builder.
- Progress percentage increments smoothly from 0 to 100 percent.
- Time remaining and processing speed display correct calculations.
- Live log viewer handles high throughput (100+ lines per second) without UI freeze.
- Auto-scroll lock keeps the viewer at the bottom unless scrolled up manually.
- Clicking Cancel sends `cancel_ffmpeg` and halts process execution within 500ms.
- Failed processes display the exit code and the last relevant error log lines.

### File Outputs and Revealing
- Target filename collision prompts user with overwrite, rename, or cancel options.
- Completed jobs provide buttons to open the resulting file or reveal it in File Explorer / Finder.
