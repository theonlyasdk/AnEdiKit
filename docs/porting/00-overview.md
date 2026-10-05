# Architecture and Tauri IPC Overview

## 1. System Architecture

AnEdiKit is a desktop media processing application built with Tauri v2. The system consists of three architectural tiers:

1. Frontend Tier: Currently vanilla HTML5, CSS3, ES modules, Bootstrap 5.3, and Ionicons. The target frontend architecture is React 19 / 18, Vite, TypeScript, Tailwind CSS, and shadcn/ui (Radix UI primitives).
2. Desktop Runtime Tier: Tauri v2 in Rust (`src-tauri`), handling operating system integration, multi-threaded background process orchestration, child process lifecycle, native file dialogs, system notifications, and window vibrancy/frameless chrome.
3. Execution Engine Tier:
   - External CLI Binaries: FFmpeg, FFprobe, and yt-dlp, located either in the user PATH or managed in `%LOCALAPPDATA%\ASDK\Shared\bin` and `%LOCALAPPDATA%\tauri\bin`.
   - Sidecar Python Runtimes: Bundled Python scripts executed via `python -u` or `py -3 -u`:
     - `src/py/image_ai_engine.py`: Machine learning pipelines (rembg, Real-ESRGAN, vtracer, opencv restoration, PIL ICO/ICNS generation, piexif metadata sanitizer).
     - `src/py/pdf_tools.py`: PDF document processing engine (PyMuPDF / fitz, pypdf, pdf2docx, reportlab, pytesseract).

## 2. Directory Layout Comparison

### Current Structure
```
AnEdiKit/
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs              # Application entry, window setup, invoke handler registry
│   │   ├── main.rs             # Tauri binary bootstrap
│   │   ├── jobs.rs             # FFmpeg, yt-dlp, Python child process management & streaming
│   │   ├── media.rs            # Media probing, metadata extraction, timeline frames, peaks
│   │   ├── models.rs           # Serde Rust DTOs and IPC event payload structs
│   │   ├── system.rs           # Native file dialogs, filesystem ops, hardware probing
│   │   ├── tools.rs            # Binary discovery, version checking, curl downloads/extraction
│   │   └── window.rs           # Frameless window decorations and blur controls
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── css/                    # Modular CSS, design tokens, M3 components, animations
│   ├── js/
│   │   ├── commands/           # Command builders for FFmpeg and yt-dlp
│   │   ├── execution/          # UI state machine and execution bindings
│   │   ├── media/              # Media probing, thumbnail extraction, metadata display
│   │   ├── runner/             # Job state, progress tracking, log console, notifications
│   │   ├── tools/              # Binary manager modal and updater UI
│   │   ├── audio_tags/         # ID3 tag editor queue and execution
│   │   ├── pdf_tools.js        # PDF suite view router and executor
│   │   ├── image_queue.js      # Image AI batch queue and lightbox
│   │   ├── comparison.js       # Split-slider image comparison modal
│   │   ├── navigation.js       # Tool switcher, active tool persistence
│   │   └── theme.js            # Theme presets, CSS variable applicator
│   ├── kits/                   # Scriptable user kit IDE, block builder, Monaco editor
│   ├── partials/               # HTML template partials assembled by assemble_html.py
│   ├── py/                     # Python AI engines executed by Rust backend
│   ├── index.html              # Assembled single-page application entry
│   └── main.js                 # App initialization bootstrap
```

### Proposed React + Vite + TypeScript Structure
```
AnEdiKit/
├── src-tauri/                  # Unchanged Rust backend
├── src/
│   ├── py/                     # Python scripts kept in bundle resources
│   ├── app/
│   │   ├── App.tsx             # Root application shell, theme provider, router
│   │   ├── routes.ts           # Tool registry, order, categories, metadata
│   │   └── globals.css         # Tailwind base, shadcn theme variables, motion tokens
│   ├── components/
│   │   ├── ui/                 # shadcn components (button, dialog, slider, switch, etc.)
│   │   ├── shell/              # Titlebar, Sidebar, DashboardGrid, SearchBar, StatusFooter
│   │   ├── shared/             # FilePicker, MediaPreviewCard, BatchQueue, ProgressLogPanel,
│   │   │                       # OutputPathSelector, LightboxModal, ComparisonModal
│   │   └── kits/               # KitIDE, BlockCanvas, MonacoEditorWrapper, KitRunner
│   ├── features/               # Self-contained tool views and controllers
│   │   ├── video/              # Convert, Compress, Trim, SpeedMotion, AspectCrop, Stabilize, Loop
│   │   ├── audio/              # ExtractAudio, CompressAudio, AudioTags, Normalize, MuteReplace
│   │   ├── ytdlp/              # YtDlpVideo, YtDlpAudio, YtDlpPlaylist, YtDlpSubtitles
│   │   ├── image-ai/           # BgRemover, Upscaler, Vectorizer, RestoreDenoise, IconGen, ExifCleaner
│   │   ├── pdf/                # PdfSuite, PdfCategoryBrowser, PdfPageReorderGrid, PdfQueue
│   │   ├── custom/             # CustomCommand
│   │   └── settings/           # SettingsView, BinariesManagerDialog, ThemeCustomizerModal
│   ├── hooks/                  # Custom hooks (useTauriJob, useMediaProbe, usePersistedState)
│   ├── lib/
│   │   ├── tauri/              # Typed wrappers for all invoke commands and event listeners
│   │   ├── commands/           # Pure CLI command builders (converted from src/js/commands)
│   │   └── utils.ts            # Formatting, time, string, and path utilities
│   ├── types/                  # TypeScript interfaces matching models.rs and settings
│   ├── index.html              # Vite HTML entry
│   └── main.tsx                # React root mount
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

## 3. Frontend-to-Rust IPC Specification

All communication between the frontend and Rust passes through `@tauri-apps/api/core` via `invoke(command, payload)` or `@tauri-apps/api/event` via `listen(eventName, callback)`.

### Tauri Commands (`invoke`)

#### System and Filesystem (`src-tauri/src/system.rs`)
1. `is_windows_10`
   - Signature: `invoke<boolean>("is_windows_10")`
   - Arguments: None
   - Returns: `boolean` (true if running on Windows 10, false on Windows 11 or non-Windows)
   - Usage: Used during setup to conditionally avoid acrylic blur rendering issues on Windows 10.

2. `pick_file`
   - Signature: `invoke<string | null>("pick_file", { filterMode?: "pdf" | "image" | "audio" | "video" })`
   - Arguments: `filterMode`: optional string category to filter extensions in the native file dialog.
   - Returns: string absolute path of the chosen file, or null if canceled.

3. `pick_files`
   - Signature: `invoke<string[]>("pick_files", { filterMode?: "pdf" | "image" | "audio" | "video" })`
   - Arguments: `filterMode`: optional string category filter.
   - Returns: array of absolute file paths (empty array if canceled).

4. `pick_folder`
   - Signature: `invoke<string | null>("pick_folder", { defaultPath?: string })`
   - Arguments: `defaultPath`: optional initial folder path.
   - Returns: string absolute directory path, or null if canceled.

5. `save_image_as`
   - Signature: `invoke<string | null>("save_image_as", { sourcePath: string, suggestedName?: string })`
   - Arguments: `sourcePath` (absolute path of source image), `suggestedName` (optional filename proposal).
   - Returns: absolute path where the image was saved, or null.

6. `write_temp_text_file`
   - Signature: `invoke<string>("write_temp_text_file", { filename: string, content: string })`
   - Arguments: `filename` (e.g., `"concat_list.txt"`), `content` (file text).
   - Returns: absolute path of the generated temporary file in the OS temp directory.
   - Usage: Used by Merge and Concat tool for FFmpeg concat demuxer file lists.

7. `replace_file`
   - Signature: `invoke<void>("replace_file", { sourceTemp: string, targetDest: string })`
   - Arguments: `sourceTemp` (path to new temporary file), `targetDest` (target file to replace).
   - Returns: void on success; throws error message string on failure.
   - Usage: In-place file replacement for Image AI tools when Replace Source is enabled.

8. `check_file_exists`
   - Signature: `invoke<boolean>("check_file_exists", { filePath: string })`
   - Arguments: `filePath` (absolute file path).
   - Returns: `boolean`.
   - Usage: Destination collision warning, pre-flight input file verification.

9. `read_image_data`
   - Signature: `invoke<string>("read_image_data", { filePath: string })`
   - Arguments: `filePath` (absolute image path).
   - Returns: `string` (base64 data URI `data:image/<format>;base64,...`).

10. `open_file`
    - Signature: `invoke<void>("open_file", { filePath: string })`
    - Arguments: `filePath` (absolute file path).
    - Returns: void.
    - Usage: Launches the default system handler for the file.

11. `show_in_folder`
    - Signature: `invoke<void>("show_in_folder", { filePath: string })`
    - Arguments: `filePath` (absolute path).
    - Returns: void.
    - Usage: Opens File Explorer with the target file highlighted.

12. `send_system_notification`
    - Signature: `invoke<void>("send_system_notification", { title: string, body: string })`
    - Arguments: `title`: string, `body`: string.
    - Returns: void.

13. `get_hardware_info`
    - Signature: `invoke<HardwareInfo>("get_hardware_info")`
    - Arguments: None.
    - Returns: `HardwareInfo` object:
      ```typescript
      interface HardwareInfo {
        cpu_name?: string;
        nvidia_gpu?: string;
        intel_gpu?: string;
        amd_gpu?: string;
        default_recommended: string; // e.g. "nvenc", "qsv", "amf", "cpu"
        nvenc_available: boolean;
        qsv_available: boolean;
        amf_available: boolean;
        d3d11va_available: boolean;
        videotoolbox_available: boolean;
      }
      ```

14. `probe_hardware_acceleration`
    - Signature: `invoke<boolean>("probe_hardware_acceleration", { engine: string })`
    - Arguments: `engine` (e.g. `"nvenc"`, `"qsv"`, `"amf"`, `"d3d11va"`).
    - Returns: `boolean`.

#### Media Probing and Metadata (`src-tauri/src/media.rs`)
15. `get_media_info`
    - Signature: `invoke<MediaInfo>("get_media_info", { filePath: string })`
    - Arguments: `filePath`: absolute path to media file.
    - Returns: `MediaInfo` object:
      ```typescript
      interface MediaInfo {
        file_path: string;
        file_name: string;
        duration_seconds: number;
        duration_string: string; // "00:01:23.456"
        resolution: string;      // "1920x1080"
        video_codec: string;     // "h264"
        audio_codec: string;     // "aac"
        file_size_mb: number;
        file_size_formatted: string; // "14.2 MB"
        bitrate_kbps: number;
        album_art_url?: string;  // data URL if present
      }
      ```

16. `get_audio_metadata`
    - Signature: `invoke<AudioMetadataInfo>("get_audio_metadata", { filePath: string })`
    - Arguments: `filePath`: absolute path to audio file.
    - Returns: `AudioMetadataInfo` object:
      ```typescript
      interface AudioMetadataInfo {
        title: string;
        artist: string;
        album: string;
        album_artist: string;
        genre: string;
        year: string;
        track: string;
        total_tracks: string;
        disc: string;
        composer: string;
        comment: string;
        has_cover: boolean;
        cover_data_url?: string;
        raw_tags: Record<string, string>;
      }
      ```

17. `prepare_ogg_cover_metadata`
    - Signature: `invoke<string>("prepare_ogg_cover_metadata", { imagePath: string })`
    - Arguments: `imagePath`: absolute path to cover image file.
    - Returns: base64-encoded METADATA_BLOCK_PICTURE string for Ogg/FLAC tags.

18. `extract_action_frame`
    - Signature: `invoke<string>("extract_action_frame", { filePath: string, timestamp: number })`
    - Arguments: `filePath`: media path, `timestamp`: seek position in seconds.
    - Returns: string base64 data URL of the extracted frame.

19. `extract_album_art`
    - Signature: `invoke<string | null>("extract_album_art", { filePath: string })`
    - Arguments: `filePath`: audio media path.
    - Returns: base64 data URL string or null.

20. `extract_audio_peaks`
    - Signature: `invoke<number[]>("extract_audio_peaks", { filePath: string, numSamples?: number })`
    - Arguments: `filePath`: audio path, `numSamples`: optional peak count (defaults to 800).
    - Returns: `number[]` array of normalized amplitude floats (0.0 to 1.0).

21. `extract_timeline_thumbnails`
    - Signature: `invoke<string[]>("extract_timeline_thumbnails", { filePath: string, count: number })`
    - Arguments: `filePath`: video path, `count`: number of evenly-spaced thumbnail frames.
    - Returns: array of base64 data URL strings.

22. `extract_timeline_frame`
    - Signature: `invoke<string>("extract_timeline_frame", { filePath: string, timestamp: number })`
    - Arguments: `filePath`: video path, `timestamp`: seconds.
    - Returns: string base64 data URL.

23. `fetch_playlist_videos`
    - Signature: `invoke<PlaylistVideo[]>("fetch_playlist_videos", { url: string })`
    - Arguments: `url`: online playlist URL (YouTube, SoundCloud, etc.).
    - Returns: array of `PlaylistVideo`:
      ```typescript
      interface PlaylistVideo {
        index: number;
        id: string;
        title: string;
        url: string;
        duration?: number;
        duration_string?: string;
      }
      ```

#### Job Execution and Lifecycle (`src-tauri/src/jobs.rs`)
24. `execute_ffmpeg`
    - Signature: `invoke<void>("execute_ffmpeg", { args: string[], totalDurationSecs?: number })`
    - Arguments:
      - `args`: string array of raw FFmpeg arguments (excluding executable name).
      - `totalDurationSecs`: optional duration in seconds for progress calculation.
    - Behavior: Registers foreground job, spawns child process, redirects stdout/stderr, streams events.

25. `execute_ytdlp`
    - Signature: `invoke<void>("execute_ytdlp", { args: string[] })`
    - Arguments: `args`: raw CLI argument array for yt-dlp.
    - Behavior: Registers foreground job, spawns yt-dlp, parses download progress, streams events.

26. `execute_image_ai`
    - Signature: `invoke<void>("execute_image_ai", { task: string, params: string })`
    - Arguments:
      - `task`: task identifier (e.g. `"bg_remover"`, `"upscale"`, `"vectorize"`, `"restore"`, `"icon"`, `"metadata"`, `"pdf_tool"`).
      - `params`: JSON-serialized configuration string.
    - Behavior: Spawns Python runner, streams log lines, emits progress and completion events.

27. `render_pdf_pages`
    - Signature: `invoke<string[]>("render_pdf_pages", { filePath: string })`
    - Arguments: `filePath`: path to source PDF.
    - Returns: array of base64 data URL images of each page in the PDF.

28. `get_pdf_info`
    - Signature: `invoke<any>("get_pdf_info", { filePath: string })`
    - Arguments: `filePath`: path to PDF.
    - Returns: JSON object containing page count, page sizes, title, author, encryption status.

29. `install_pdf_dependencies`
    - Signature: `invoke<string>("install_pdf_dependencies")`
    - Arguments: None.
    - Returns: success message string on completion.
    - Behavior: Runs `pip install pymupdf pypdf pdf2docx reportlab pytesseract`.

30. `cancel_ffmpeg` / `cancel_job`
    - Signature: `invoke<void>("cancel_ffmpeg")` or `invoke<void>("cancel_job")`
    - Arguments: None.
    - Behavior: Sets cancellation flag, kills tracked foreground process tree via `taskkill /F /T` on Windows or `kill -9` on Unix.

31. `is_job_active`
    - Signature: `invoke<boolean>("is_job_active")`
    - Arguments: None.
    - Returns: `boolean` indicating if a foreground job is running.

32. `force_exit_app`
    - Signature: `invoke<void>("force_exit_app")`
    - Arguments: None.
    - Behavior: Terminates all tracked child processes and immediately closes the application.

#### Binary and Tool Management (`src-tauri/src/tools.rs`)
33. `check_tool_versions`
    - Signature: `invoke<Record<string, string>>("check_tool_versions")`
    - Arguments: None.
    - Returns: map of version strings, e.g. `{ "ytdlp_installed": "2026.03.01", "ffmpeg_installed": "7.0.1", "ffprobe_installed": "7.0.1", "deno_installed": "1.45.0" }`.

34. `open_binaries_folder`
    - Signature: `invoke<void>("open_binaries_folder")`
    - Arguments: None.
    - Returns: void. Opens `%LOCALAPPDATA%\ASDK\Shared\bin` in Explorer.

35. `update_tool`
    - Signature: `invoke<string>("update_tool", { toolName: string })`
    - Arguments: `toolName` (`"ytdlp"` | `"ffmpeg"` | `"deno"`).
    - Returns: success message string. Emits download and extraction progress events.

36. `delete_tool`
    - Signature: `invoke<void>("delete_tool", { toolName: string })`
    - Arguments: `toolName`: string.
    - Returns: void.

37. `cancel_tool_update`
    - Signature: `invoke<string>("cancel_tool_update")`
    - Arguments: None.
    - Returns: string status. Cancels active curl download and cleans up temporary files.

#### Window Controls (`src-tauri/src/window.rs`)
38. `set_decorations`
    - Signature: `invoke<void>("set_decorations", { decorations: boolean })`
    - Arguments: `decorations`: boolean.
    - Behavior: Toggles native OS titlebar borders.

39. `set_window_blur`
    - Signature: `invoke<void>("set_window_blur", { mode: string })`
    - Arguments: `mode`: `"acrylic"` | `"mica"` | `"blur"` | `"none"`.

### Tauri Events (`listen`)

1. `ffmpeg-progress`
   - Payload:
     ```typescript
     interface ProgressPayload {
       time: string;                  // "00:01:23.45"
       eta?: string;                  // "00:00:15"
       fps: string;                  // "60.0"
       speed: string;                // "2.4x"
       bitrate: string;              // "3200 kbits/s"
       pct: number;                  // 0 to 100
       playlist_item?: number;       // Current item in playlist
       playlist_total?: number;      // Total items in playlist
       current_item_title?: string;  // Active item title
     }
     ```

2. `ffmpeg-log`
   - Payload:
     ```typescript
     interface LogPayload {
       line: string;                 // Raw console log line
     }
     ```

3. `ffmpeg-finished`
   - Payload:
     ```typescript
     interface FinishPayload {
       success: boolean;
       exit_code: number;
       message: string;
     }
     ```

4. `confirm-exit-requested`
   - Payload: `void`
   - Description: Emitted by the Rust backend when the user attempts to close the app window while a foreground job is active.

5. `tool_download_progress`
   - Payload:
     ```typescript
     interface ToolDownloadProgressPayload {
       tool_name: string;
       pct: number;                  // 0.0 to 100.0
       downloaded?: string;          // "12.4 MB"
       total?: string;               // "45.0 MB"
       speed?: string;               // "3.2 MB/s"
       eta?: string;                 // "00:10"
     }
     ```

6. `tool_extraction_progress`
   - Payload:
     ```typescript
     interface ToolExtractProgressPayload {
       tool_name: string;
       step: string;                 // e.g. "bin/ffmpeg.exe"
       progress?: string;            // "verified"
     }
     ```

## 4. Sidecar and Python Launch Architecture

### Binary Resolution Pipeline
Before invoking FFmpeg, FFprobe, yt-dlp, or Python, the Rust backend searches through candidate directories in order:
1. `%LOCALAPPDATA%\ASDK\Shared\bin\<tool>.exe`
2. `%LOCALAPPDATA%\tauri\bin\<tool>.exe`
3. `C:\ffmpeg\bin\<tool>.exe` (FFmpeg-specific fallback)
4. System `PATH` entries evaluated directly against the filesystem.

### Python Engine Execution
1. Resolution:
   - Backend queries `find_binary("python")`.
   - If not found or if it resolves to a Windows Store stub, it checks `find_binary("py")`.
2. Arguments and Environment:
   - Launched with `-u` (unbuffered stdout/stderr) or `-3 -u`.
   - `PYTHONUNBUFFERED=1` environment variable set.
   - On Windows, `creation_flags(0x08000000)` (`CREATE_NO_WINDOW`) is set to prevent opening a console window.
3. IPC Protocol between Python and Rust:
   - Python prints status lines formatted as `ANEDIKIT_PROGRESS:{"type":"progress","pct":...,"speed":...}`.
   - Python prints result descriptors formatted as `ANEDIKIT_RESULT:{"output_path":"..."}`.
   - The Rust backend intercepts `ANEDIKIT_PROGRESS:` lines in `src-tauri/src/jobs.rs`, extracts the JSON payload, formats it into `ProgressPayload`, and emits `ffmpeg-progress` to the frontend.
   - All standard stdout and stderr lines are emitted as `ffmpeg-log`.
   - On exit, Rust emits `ffmpeg-finished` with the exit status and summary message.
