# AnEdiKit

AnEdiKit is a lightweight, all-in-one desktop toolkit for creators that integrates FFmpeg and yt-dlp media utilities into a responsive desktop application built with Tauri v2 and Rust.

## Features

### Video & Audio Processing (FFmpeg)
- Video Conversion: Transcode video files across MP4, MKV, WebM, MOV, AVI, and other formats with customizable codecs (H.264, HEVC, AV1, VP9), CRF quality presets, and resolution scaling.
- Audio Extraction & Conversion: Extract audio tracks from video or transcode audio files across MP3, M4A, FLAC, WAV, Opus, and OGG formats.
- Precision Trimming & Cutting: Trim clips using instant lossless stream copying or frame-accurate re-encoding.
- Targeted Media Compression: Compress video and audio to fit target file sizes (Discord, WhatsApp, Email, or custom megabyte limits) with automatic bitrate budgeting.
- Media Concatenation & Merging: Join multiple video or audio tracks into a single continuous stream.
- Audio Track Replacement & Muting: Strip unwanted audio from video files or mux custom audio tracks with volume mixing.
- GIF & Frame Extraction: Generate high-quality animated GIFs with custom palette generation or export image sequence frames.
- Custom FFmpeg Execution: Run custom argument strings with real-time log output and stream progress tracking.

### Media Downloader (yt-dlp)
- Video & Audio Downloads: Download media streams in single video, audio-only (MP3, M4A, FLAC), and subtitle/thumbnail extraction modes.
- Playlist & Batch Queueing: Download full playlists and channels with dual-progress tracking for both current item and overall batch completion.
- Global Downloader Settings: Centralized configuration for browser cookie authentication (Chrome, Firefox, Edge, Brave, Opera, Vivaldi), download speed limits, SponsorBlock segment removal, and custom flags.

### Core Engine & Architecture
- Hardware Acceleration: Support for NVIDIA NVENC (CUDA), Intel QuickSync (QSV), and AMD AMF hardware encoders.
- Non-Blocking Background Processing: Asynchronous process management allows browsing between tools while tasks execute in the background.
- Process Lifecycle Management: Background jobs persist across interface reloads, and active operations are safely terminated with child process tree cleanup on exit confirmation.

## Development

Requirements:
- Rust (Cargo)
- Node.js (npm)
- FFmpeg and yt-dlp available on system PATH or local application tools folder

Install dependencies:
```bash
npm install
```

Run application in development mode:
```bash
npm run tauri dev
```

Build release variant with installer bundles:
```bash
npm run release
# or
build_release.bat
```
The release output will be placed flat in the `release/` folder:
- `AnEdiKit-v<version>-windows-x64-portable.exe` (Portable binary)
- `AnEdiKit-v<version>-windows-x64-installer.msi` (MSI Installer)
- `AnEdiKit-v<version>-windows-x64-setup.exe` (NSIS Setup)
- `SHA256SUMS.txt` (SHA256 checksums)

## License

MIT License

Copyright (c) 2026 theonlyasdk

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.