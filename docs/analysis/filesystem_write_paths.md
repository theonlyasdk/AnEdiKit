# Filesystem Write Paths Analysis

This document provides a comprehensive audit of all possible filesystem paths where AnEdiKit, its underlying desktop engine (Tauri v2, WebView2), runtime dependencies (FFmpeg, yt-dlp, Deno, Python), machine learning models, caches, and temporary files write to disk.

## 1. Managed Executables and Tool Binaries

AnEdiKit includes an integrated binary management engine that installs, updates, and executes standalone CLI binaries.

### Primary Location
- `%LOCALAPPDATA%\ASDK\Shared\bin\`
  - `ffmpeg.exe`: FFmpeg multimedia transcoding engine.
  - `ffprobe.exe`: FFprobe media stream analyzer.
  - `yt-dlp.exe`: Media and stream downloader executable.
  - `deno.exe`: JavaScript and TypeScript runtime used for deciphering and script execution.

### Fallback / Resolution Search Paths (Read-Only Checks)
- `%LOCALAPPDATA%\tauri\bin\`
- `C:\ffmpeg\bin\`
- System `PATH` entries

## 2. Thumbnail, Waveform, and Media Caching

When importing media files or rendering preview tracks, AnEdiKit generates thumbnail frames, album art covers, and audio waveform data.

### Primary Location
- `%LOCALAPPDATA%\ASDK\AnEdiKit\ThumbCache\`
  - `video\`: Cached video frame thumbnails extracted by FFmpeg for timeline scrubbers and batch list items (named `<hash>_<timestamp>.jpg`).
  - `audio\`: Extracted embedded ID3/MP4 album art covers and audio peak waveform cache (named `<hash>_<timestamp>.png`).

### Temporary Fallback Location
If `%LOCALAPPDATA%` is inaccessible, the cache falls back to:
- `%TEMP%\ASDK_AnEdiKit_ThumbCache\video\`
- `%TEMP%\ASDK_AnEdiKit_ThumbCache\audio\`

## 3. On-Device AI and Machine Learning Models

Image and AI tools execute on-device neural processing via Python and ONNX Runtime. AnEdiKit redirects model caches to centralized application storage.

### Primary Location
- `%LOCALAPPDATA%\ASDK\AnEdiKit\models\`
  - `bg_remover\`: Neural segmentation weights for background removal, configured via `U2NET_HOME` (e.g. `u2net.onnx`, `u2netp.onnx`, `isnet-general-use.onnx`, `u2net_human_seg.onnx`).
  - `upscaler\`: Deep learning super-resolution checkpoint models (e.g. `RealESRGAN_x4plus.pth`, `RealESRGAN_x2plus.pth`).
  - `torch\`: PyTorch hub cache, configured via `TORCH_HOME`.
  - `huggingface\`: HuggingFace Hub cached repositories, configured via `HF_HOME` and `HUGGINGFACE_HUB_CACHE`.

### Upstream Fallback Locations
If environment overrides are bypassed by upstream third-party libraries, models may be written to user profile defaults:
- `%USERPROFILE%\.u2net\` (Default rembg cache)
- `%USERPROFILE%\.cache\torch\hub\checkpoints\` (Default PyTorch cache)
- `%USERPROFILE%\.cache\huggingface\hub\` (Default Hugging Face cache)

## 4. WebView2 Runtime and Application State

Tauri v2 runs inside Microsoft Edge WebView2 on Windows. WebView2 maintains browser state, local storage, GPU shader caches, and network cache.

### Primary Location
- `%LOCALAPPDATA%\com.user.anedikit\EBWebView\`
  - `Default\Local Storage\leveldb\`: Chromium LevelDB database storing all `anedikit:*` configuration keys (e.g. tool preferences, batch queues, hardware acceleration choices, custom kit scripts).
  - `Default\Session Storage\`: Ephemeral session storage keys.
  - `Default\IndexedDB\`: Structured client-side databases.
  - `Default\Cache\Cache_Data\`: Cached web resources, CSS, icons, and frontend assets.
  - `Default\Code Cache\js\`: V8 engine compiled JavaScript bytecode.
  - `Default\Code Cache\wasm\`: Compiled WebAssembly artifacts.
  - `Default\GPUCache\`: Compiled DirectX and HLSL shader caches.
  - `Default\Network\`: Persistent network states and cookie storage.
  - `Crashpad\reports\`: Crashpad minidump files in the event of an unhandled browser crash.

## 5. Temporary Files and In-Flight Processing

Temporary files are created during tool downloading, archive extraction, and complex media pipelines.

### Primary Location
- `%TEMP%\` (or `%LOCALAPPDATA%\Temp\`)
  - `deno_update.zip`: Downloaded Deno release archive prior to extraction.
  - `ffmpeg_update.zip`: Downloaded FFmpeg release archive prior to extraction.
  - `ffmpeg_update_extracted\`: Temporary folder where FFmpeg archive contents are extracted before copying `ffmpeg.exe` and `ffprobe.exe` to `ASDK\Shared\bin\`.
  - `ffprobe_fallback.zip`: Downloaded standalone FFprobe archive if primary master build fails.
  - `yt-dlp.exe`: Temporary download target during binary update.
  - `anedikit_concat_list_*.txt`: Generated FFmpeg concat demuxer text files used when merging multiple audio or video tracks.
  - `anedikit_*.tmp`: Intermediate video/audio transcode passes (such as two-pass video bitrate analysis or loudness two-pass normalization measurements).

## 6. Processed Media Output Destinations

Processed media files are saved to user-selected locations or the default output directory configured in Settings.

### Default Destination
- `%USERPROFILE%\Downloads\` (configured via `anedikit:settings` -> `outputDir`)
- Or the directory of the source input file when custom output destination is disabled.

### Output File Naming Patterns
- Video Conversion: `<input_folder>\<filename>_converted.<ext>`
- Video Compression: `<input_folder>\<filename>_compressed.<ext>`
- Video Trim & Cut: `<input_folder>\<filename>_trimmed.<ext>`
- Speed & Motion: `<input_folder>\<filename>_speed.<ext>`
- Aspect Ratio & Crop: `<input_folder>\<filename>_crop.<ext>`
- Video Stabilization: `<input_folder>\<filename>_stabilized.<ext>`
- Loop to Duration: `<input_folder>\<filename>_loop.<ext>`
- Volume Normalization: `<input_folder>\<filename>_normalized.<ext>`
- Mute or Replace Audio: `<input_folder>\<filename>_audio_replaced.<ext>` or `<filename>_muted.<ext>`
- Extract & Convert Audio: `<input_folder>\<filename>_audio.<ext>`
- Audio Compression: `<input_folder>\<filename>_compressed_audio.<ext>`
- Merge & Concatenate: `<output_dir>\merged_output_<timestamp>.<ext>`
- GIF & Frame Extraction:
  - GIF: `<output_dir>\<filename>.gif`
  - Frames: `<output_dir>\<filename>_frames\frame_%04d.png`
- Custom FFmpeg Command: Path explicitly specified by the user in custom command arguments.
- yt-dlp Downloads:
  - Media: `<output_dir>\<title> [<id>].<ext>`
  - Subtitles: `<output_dir>\<title> [<id>].<lang>.<ext>`
  - Thumbnails: `<output_dir>\<title> [<id>].<ext>`
- Image & AI Tools:
  - Background Removal: `<input_folder>\<filename>_nobg.png`
  - AI Upscaler: `<input_folder>\<filename>_upscaled.png`
  - Image Vectorizer: `<input_folder>\<filename>_vector.svg`
  - Restore & Denoise: `<input_folder>\<filename>_restored.png`
  - Icon Generator: `<output_dir>\<filename>_icons\` (`icon.ico`, `icon.icns`, `favicon.ico`, `icon-192.png`, `icon-512.png`)
  - Metadata Cleaner: `<input_folder>\<filename>_clean.<ext>`
  - In-Place Replacement: When `Replace Source` is toggled on, generated output overwrites the original input file path directly.

## 7. Build and Development Artifacts (Developer Environment)

During project compilation, packaging, and testing:
- `src-tauri\target\`: Cargo target build directory containing compiled Rust dependencies and executable binaries (`target\release\anedikit.exe`).
- `%LOCALAPPDATA%\tauri\`: Tauri toolchain bundle cache, containing WiX toolset and NSIS binaries.
- `%USERPROFILE%\.cargo\`: Cargo registry index, cache, and installed tools.
- `node_modules\`: Installed npm frontend packages and dependencies.
