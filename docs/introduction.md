# Introduction to AnEdiKit

AnEdiKit is a lightweight, all-in-one desktop toolkit and visual pipeline engine for creators, developers, and power users. It unifies high-performance media utilities, on-device neural processing, batch processing, media downloading, and scriptable command-line interface (CLI) builders into a single, predictable desktop environment.

Built on Tauri v2 and Rust, AnEdiKit keeps binary size and resource overhead minimal while providing asynchronous execution, hardware-accelerated transcoding, and complete local execution without uploading creator files to remote cloud services.

## Core Philosophy and Design Principles

1. On-Device Execution and Privacy: All media operations, transcode jobs, audio conversions, and neural image processing models run locally on the host machine.
2. Asynchronous and Responsive UI: Long-running media jobs and neural inference run in separate background processes with real-time progress, speed, and time estimation feedback, preventing interface freezes.
3. Predictable Workflow: Form controls, execution parameters, command previews, and outputs follow consistent layouts across all tools.
4. CLI Transparency: Every tool dynamically generates and displays the exact underlying command line string in real time, allowing users to inspect or copy commands for standalone terminal use.
5. Extensibility via Kits: Beyond built-in tools, users can visually assemble custom GUIs and multi-step macro pipelines for any CLI binary using the Kit builder.

## Core Feature Suites

### 1. FFmpeg Video and Audio Suite
- Convert Video: Transcode across containers (MP4, MKV, WebM, MOV, AVI, GIF, WebP) with codec selection (H.264, H.265/HEVC, VP9, AV1, ProRes), CRF rate control, and speed presets.
- Compress Video: Target specific file size caps (Discord, WhatsApp, Email, Custom MB) with auto-calculated bitrates and two-pass encoding.
- Trim and Cut: Stream copy or frame-accurate re-encoding with interactive timeline scrubbers and duration markers.
- Speed and Motion: Variable speed adjustments (0.25x to 16x) with audio retiming algorithms and motion interpolation.
- Aspect and Crop: Framing adjustments (9:16, 1:1, 4:5, 16:9, 21:9) with intelligent center cropping, blurred padding, or black pillarboxing.
- Video Stabilization: Motion smoothing and camera shake correction via deshake and vidstab engines.
- Audio Normalization: EBU R128 loudness normalization and two-pass LUFS target matching for broadcast and streaming platforms.
- Mute and Replace Audio: Strip existing audio tracks or mix external background audio with custom volume balances.
- GIF and Frame Sequences: High-quality palettegen GIF rendering, snapshots, and individual image sequence exports.
- Extract and Convert Audio: Extract audio to MP3, M4A/AAC, FLAC, WAV, Opus, OGG with channel downmixing and sample rate configuration.
- Compress Audio: Low-bitrate speech and music compression targeted by file size or bitrate.
- Merge and Concat: Combine multiple video or audio tracks using concat demuxers or filter complexes.
- Custom FFmpeg: Direct CLI input with preset argument templates and real-time validation.

### 2. On-Device Image and Neural AI Suite
- AI Background Remover: Neural segmentation using U2-Net, IS-Net, BiRefNet, and Silueta models with options for transparent alpha, solid color fills, or blurred background layers.
- Fake Transparency Cleaner: Automated pattern detection and replacement of baked-in checkerboard patterns from fake PNG images.
- AI Image Upscaler: Super-resolution scaling (2x, 3x, 4x) powered by Real-ESRGAN models alongside bicubic sharpening filters.
- Vectorizer: Convert raster artwork and bitmaps to clean SVG vector paths with adjustable color quantization and curve simplification.
- Restore and Denoise: Non-local means denoising, bilateral smoothing, deblur sharpening, and CLAHE contrast enhancement.
- Icon Generator: Multi-platform icon bundle generation for Windows ICO, Web favicons, Android, and iOS assets.
- Metadata Cleaner: Strip EXIF, IPTC, and private device location tags from photos while preserving color profiles.

### 3. yt-dlp Media Downloader
- Video Downloader: Download video streams up to 4K/8K with automatic audio merging, subtitle embedding, and metadata tagging.
- Audio Downloader: Direct extraction of audio streams into MP3, M4A, FLAC, or Opus with embedded cover artwork.
- Playlist Inspector and Downloader: Parse entire playlists, inspect individual video titles and durations, filter selection, and batch download.
- Subtitle and Thumbnail Extractor: Download multi-language subtitle tracks (.srt, .vtt, .ass) and high-resolution thumbnail graphics.
- Filename Format Editor: Interactive token-based template builder (`%(title)s [%(id)s].%(ext)s`) with live filename preview and drag-and-drop reordering.

### 4. User Kits and Macro Automation
- Visual Parameter Block Builder: Build custom tool interfaces with text inputs, dropdowns, number steppers, range sliders, switches, and file pickers.
- Script Execution Sandbox: Write JavaScript script bodies that receive configured UI parameters and dynamically construct execution arguments for FFmpeg, Deno, Node.js, or Python.
- Import and Export: Export custom kit definitions as portable JSON files to share across systems.

## Basic Terminology

1. Tool / Module: A dedicated visual view tailored for a specific media transformation task (e.g. Convert, Normalize, AI Upscaler).
2. Kit: A user-defined tool or chained workflow. A Kit consists of metadata, a visual parameter layout (blocks), and a command construction script.
3. Parameter Block: A single configurable UI element within a Kit, such as a select menu, numeric slider, or file path picker.
4. Batch Queue: A list of media files queued for sequential processing under the current tool's settings.
5. Command Preview: The live command-line string generated by the application based on current form inputs and system binary resolution.
6. Comparison Modal: An interactive before-and-after split view with draggable slider comparison for inspecting visual output quality.

## System Architecture

```
+-------------------------------------------------------------+
|                  AnEdiKit Desktop App                       |
|                                                             |
|  +-------------------------------------------------------+  |
|  |             Tauri v2 Frontend Webview                 |  |
|  |  - HTML5, CSS3, ES6 JavaScript Modular Architecture   |  |
|  |  - Bootstrap 5 Responsive Grid & Theme System         |  |
|  |  - LocalStorage Parameter & Queue Persistence         |  |
|  +---------------------------+---------------------------+  |
|                              |                              |
|                    Tauri IPC Commands                        |
|                              |                              |
|  +---------------------------v---------------------------+  |
|  |             Rust Backend (src-tauri/src)              |  |
|  |  - Process Spawning & Asynchronous Job Runner         |  |
|  |  - Cross-Platform File & Folder Dialogs (rfd)         |  |
|  |  - Hardware Detection (NVENC, QuickSync, AMF, CPU)    |  |
|  |  - Output Path Sanitization & Binary Resolution       |  |
|  +---------------------------+---------------------------+  |
|                              |                              |
|                 System Binaries & Engines                    |
|                              |                              |
|       +--------------+-------+--------+-------------+       |
|       |              |                |             |       |
|   +---v----+   +-----v----+     +-----v----+   +----v-----+ |
|   | FFmpeg |   |  yt-dlp  |     |  Python  |   |   Deno   | |
|   |  CLI   |   |   CLI    |     | AI Engine|   | Runtime  | |
|   +--------+   +----------+     +----------+   +----------+ |
+-------------------------------------------------------------+
```

## Basic Workflow Guide

1. Choose Media Input: Click Choose File, click Add Multiple for batch lists, or drag and drop files directly onto the workspace.
2. Select Tool: Select the desired transformation tool from the sidebar navigation.
3. Configure Parameters: Adjust format dropdowns, codecs, bitrate sliders, or toggle switches. The Command Preview updates in real time.
4. Execute: Click the primary Execute button. The job runs in the background with real-time log output and progress metrics.
5. Review Results: When completed, open the destination folder directly or launch the Comparison Modal to inspect image outputs.