# AnEdiKit Logic and Runtime Issues Audit Report

Timestamp: 2026-09-18T14:52:00+05:30
Scope: Critical logic, runtime exceptions, process execution, concurrency, data corruption, and security vulnerabilities across the AnEdiKit codebase.
Exclusions: UI layout, styling, margins, color palettes, and visual animations.

## Executive Summary

An in-depth code audit of the AnEdiKit codebase was performed covering the Rust backend, Python image AI engine, JavaScript task runners and queues, command builders, media analyzers, and custom kit execution engines. A total of 18 critical and high-priority logic and runtime defects were identified. These issues include filesystem path corruption on Windows, OpenCV Unicode path failures, memory exhaustion in the Python AI engine, command injection vectors in backend IPC, unhandled task cancellations, and process race conditions.

The detailed breakdown of each issue, its root cause, failure scenarios, and recommended remediations are presented below.

## 1. File System, Path Resolution and Security Vulnerabilities

### Issue 1.1: Path Corruption via Unconditional URL Decoding on Filesystem Paths
- Severity: Critical
- Status: ✅ Fixed (2026-09-18)
- Affected Files:
  - [src-tauri/src/lib.rs](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src-tauri/src/lib.rs#L447-L470)
  - [src/js/media.js](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/js/media.js#L140-L149)
  - [src/js/storage.js](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/js/storage.js#L90-L115)
- Description:
  The `percent_decode_path` helper in Rust and path sanitizers in JavaScript check `path.includes("%") || path.startsWith("file://")`. When an actual local file or directory name on Windows contains a literal `%` character (for example, `C:\Media\Promo_100%_Final.mp4` or a folder named `C:\Discount%20Sale\`), the path is treated as a URL-encoded string and decoded via `decodeURIComponent` or hex parsing. This mutates `%20` into a space character or causes errors on non-hex percent patterns.
- Impact:
  Subsequent filesystem calls (`Path::new(&decoded).exists()`, `fs::read`, file probes) fail because the path on disk differs from the mutated path. The application reports that the file does not exist.
- Remediation:
  Only apply percent decoding if the string starts with `file://` or `file:///`. Strip the protocol scheme first, then decode URL escape sequences. Plain filesystem paths must never be subjected to URL decoding.

### Issue 1.2: Shell Command Injection and Special Character Failure in File Opener
- Severity: High
- Status: ✅ Fixed (2026-09-18)
- Affected File:
  - [src-tauri/src/lib.rs](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src-tauri/src/lib.rs#L1854-L1857)
- Description:
  The `open_file` command spawns `cmd.exe` with arguments `["/C", "start", "", &decoded]`. In Windows `cmd.exe`, characters such as `&`, `^`, `|`, `(`, `)`, and `%` are interpreted as command separators and operators. For example, opening a file named `Rock & Roll.mp4` causes `cmd.exe` to interpret `&` as a command chain, executing `Roll.mp4` as an independent command.
- Impact:
  Files containing ampersands or shell control characters fail to open. If an untrusted filename is processed, this allows arbitrary command execution.
- Remediation:
  Avoid `cmd.exe /C start`. Use the Windows ShellExecuteW API directly, use the `opener` or `open` crate, or invoke `rundll32 url.dll,FileProtocolHandler` with the file path passed as a single verbatim parameter.

### Issue 1.3: PowerShell Script Injection and Variable Expansion in System Notifications
- Severity: High
- Status: ✅ Fixed (2026-09-18)
- Affected File:
  - [src-tauri/src/lib.rs](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src-tauri/src/lib.rs#L2436-L2455)
- Description:
  The `send_system_notification` function interpolates `title` and `body` directly into a PowerShell script string executed via `powershell -Command <script>`. The only sanitization applied is `replace('"', "`\"")`. In PowerShell double-quoted strings, `$` triggers variable substitution and `$()` triggers sub-expression execution.
- Impact:
  Media titles containing variable symbols (such as `$100 Challenge`) result in erased or blank notification text. Media titles containing `$()` expressions execute arbitrary PowerShell commands during notification triggers.
- Remediation:
  Do not format untrusted text into PowerShell command strings. Pass the text via environment variables or stdin, or use native Windows Toast Notification APIs through Windows runtime crates.

### Issue 1.4: FFmpeg Concat Demuxer Path Escaping Failure on Windows
- Severity: High
- Status: ✅ Fixed (2026-09-18)
- Affected File:
  - [src/main.js](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/main.js#L1876-L1881)
- Description:
  When generating concat lists for the Merge tool, the application creates script lines using `lines = mergeFiles.map((f) => "file '" + f.replace(/'/g, "'\\''") + "'")`. On Windows, file paths use backslashes (`\`). According to FFmpeg concat demuxer specifications, backslashes are escape characters.
- Impact:
  Paths such as `C:\Users\User\Videos\input.mp4` cause FFmpeg to interpret `\U`, `\u`, and `\V` as invalid escape sequences, terminating concat demuxer operations with `Impossible to open file` errors.
- Remediation:
  Convert backslashes to forward slashes before formatting lines: `f.replace(/\\/g, "/").replace(/'/g, "'\\''")`.

## 2. Python AI Processing Engine

### Issue 2.1: OpenCV Unicode Path Read/Write Failures on Windows
- Severity: Critical
- Status: ✅ Fixed (2026-09-18)
- Affected File:
  - [src/py/image_ai_engine.py](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/py/image_ai_engine.py#L309-L310)
  - [src/py/image_ai_engine.py](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/py/image_ai_engine.py#L435)
  - [src/py/image_ai_engine.py](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/py/image_ai_engine.py#L668-L670)
  - [src/py/image_ai_engine.py](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/py/image_ai_engine.py#L839)
- Description:
  The Python image processing engine calls `cv2.imread(input_path)` and `cv2.imwrite(target_path)`. On Windows, OpenCV's default C++ file I/O implementations do not support non-ASCII characters. When files or parent directories contain accented letters, non-Latin scripts (such as Japanese, Chinese, Cyrillic), or emoji, `cv2.imread` returns `None` and `cv2.imwrite` returns `False`.
- Impact:
  Tasks crash with `ValueError: Could not load image file` whenever the user path or image filename contains Unicode characters.
- Remediation:
  Use numpy memory buffers with wide-character filesystem APIs:
  To read: `cv2.imdecode(np.fromfile(input_path, dtype=np.uint8), flags)`
  To write: `_, buf = cv2.imencode(ext, img); buf.tofile(target_path)`

### Issue 2.2: Memory Exhaustion Crash in Metadata Cleaner
- Severity: Critical
- Status: ✅ Fixed (2026-09-18)
- Affected File:
  - [src/py/image_ai_engine.py](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/py/image_ai_engine.py#L981-L983)
- Description:
  In `clean_metadata`, pixel data is copied using `data = list(img.getdata())` followed by `clean_img.putdata(data)`. Converting PIL image data into a Python list materializes every pixel as a distinct Python tuple object. For a standard 12MP to 48MP photo, this creates 12 to 48 million Python objects, consuming 2 GB to 4 GB of RAM.
- Impact:
  High-resolution images trigger `MemoryError` crashes or cause severe system memory paging and UI freezing.
- Remediation:
  Remove `list(img.getdata())`. Create a new image and paste the source image via `clean_img = Image.new(img.mode, img.size); clean_img.paste(img)` or use `img.copy()` and save without passing EXIF parameters.

### Issue 2.3: Unhandled RGBA Mode Crash on In-Place JPEG Replacement in Background Remover
- Severity: High
- Status: ✅ Fixed (2026-09-18)
- Affected Files:
  - [src/js/image_commands.js](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/js/image_commands.js#L48)
  - [src/py/image_ai_engine.py](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/py/image_ai_engine.py#L312)
  - [src/py/image_ai_engine.py](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/py/image_ai_engine.py#L552)
- Description:
  When the "Replace Source File" option is enabled for a JPEG file in Background Remover, the output path retains the `.jpg` extension. In transparent mode, `final_img` is in `RGBA` format. During `data.save(target_path)`, PIL attempts to write an RGBA image into a JPEG container.
- Impact:
  PIL raises `OSError: cannot write mode RGBA as JPEG`, causing the task to crash without producing an output.
- Remediation:
  If transparent mode is chosen, force the destination extension to `.png`. If the JPEG container must be preserved, composite the image against a default matte color and convert to `RGB` before saving.

## 3. Frontend Execution Runners, Queues and Modals

### Issue 3.1: Image AI Execute Button Permanently Disabled Without Media File Selected
- Severity: High
- Status: ✅ Fixed (2026-09-18)
- Affected File:
  - [src/main.js](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/main.js#L573-L635)
- Description:
  `updateExecuteButtonState()` determines execute eligibility via `canExecute = !!(currentInput && currentInput.trim().length > 0)`. While Image AI tools are active, the primary input card is hidden and files are managed through `imageAiQueue`. Unless the user previously selected a video file in another tool, `currentInput` is null.
- Impact:
  The Execute button remains disabled with title "Select a file to execute operation" even when multiple valid images are present in `imageAiQueue`.
- Remediation:
  Add an explicit condition in `updateExecuteButtonState()` for Image AI tools checking `getImageAiQueue().length > 0`, enabling the execute button and displaying the queue count.

### Issue 3.2: Modal Stacking and Missing Cancellation in Image AI Batch Processing
- Severity: High
- Status: ✅ Fixed (2026-09-18)
- Affected File:
  - [src/main.js](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/main.js#L1836-L1864)
- Description:
  In the Image AI queue execution loop:
  1. `openComparisonModal` is called synchronously on every successful item. In a multi-item batch, modal dialogs continuously spawn and stack on top of each other.
  2. When the user clicks Cancel, `executeFfmpegJob` terminates the current child process and returns false. The loop does not inspect cancellation state and proceeds immediately to process the next queued image.
- Impact:
  Cancelling a 20-image batch requires clicking Cancel 20 consecutive times. Successful batch runs leave multiple stacked modal backdrops freezing the UI.
- Remediation:
  Only invoke `openComparisonModal` when the queue contains a single item. In multi-item runs, check if the job was cancelled after each step and break the loop immediately.

### Issue 3.3: Reference Error and Inoperable Save in Comparison Modal
- Severity: High
- Status: ✅ Fixed (2026-09-18)
- Affected File:
  - [src/js/comparison.js](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/js/comparison.js#L348-L375)
- Description:
  Clicking Export or Copy in the Comparison Modal triggers `showToast("Saved image successfully")` and `showToast("Copied to clipboard")`. The function `showToast` is not defined anywhere in the application. Furthermore, the Export button calls Tauri command `pick_file` with `{ saveMode: true }`. Rust's `pick_file` only accepts `filter_mode: Option<String>` and opens an open dialog instead of a save dialog. Even if a path is returned, no file copy operation is executed.
- Impact:
  Clicking Export or Copy produces `ReferenceError: showToast is not defined` in the console. Exported files are never written to disk.
- Remediation:
  Implement a notification display function or import existing alerts. Implement a dedicated `save_file_as` backend command using `rfd::FileDialog::new().save_file()` and perform the file copy operation in Rust.

## 4. FFmpeg Command Builders and Filtergraphs

### Issue 4.1: Filtergraph Failure on Silent Video Inputs in Merge and Mute/Replace Tools
- Severity: High
- Status: ✅ Fixed (2026-09-18)
- Affected File:
  - [src/js/commands.js](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/js/commands.js#L740-L750)
  - [src/js/commands.js](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/js/commands.js#L800-L808)
- Description:
  The Merge tool filtergraph references `[${i}:a:0]` for every input file. The Mute/Replace tool in "mix" mode references `[0:a]`. If an input file has no audio stream (such as a screen recording, timelapse, or silent animation), FFmpeg fails immediately.
- Impact:
  FFmpeg exits with error `Stream specifier ':a:0' in filtergraph description matches no streams`.
- Remediation:
  Check audio stream presence using probed media metadata (`audio_codec !== "None"`). When an input lacks audio, synthesize silence using `anullsrc` or conditionally construct the filtergraph without audio mapping.

### Issue 4.2: Incompatible Audio Stream Copy Container in Extract Audio Tool
- Severity: Medium
- Status: ✅ Fixed (2026-09-18)
- Affected File:
  - [src/js/commands.js](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/js/commands.js#L259-L273)
- Description:
  In the Extract Audio tool, choosing "Stream Copy" applies `-c:a copy` while the output destination filename continues to use the format dropdown value (defaulting to `.mp3`). When extracting audio from videos containing AAC, Opus, or FLAC streams, FFmpeg attempts to copy the raw bitstream into an MP3 container.
- Impact:
  FFmpeg terminates with `Audio codec is not compatible with the MP3 format` or generates an unplayable file.
- Remediation:
  When "Stream Copy" is selected, dynamically adjust the output container extension to match the source file's audio codec (for example, `.m4a` for AAC, `.opus` for Opus).

### Issue 4.3: Loudness Normalizer Defaulting to MP4 Video Output for Audio Inputs
- Severity: Medium
- Status: ✅ Fixed (2026-09-18)
- Affected File:
  - [src/js/commands.js](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/js/commands.js#L1441-L1467)
- Description:
  In `buildAudioNormalizationCommand`, `videoMode` defaults to `"copy"`. When an audio file (`.mp3`, `.wav`, `.flac`) is loaded, the output container defaults to `.mp4` and arguments include `-c:v copy`.
- Impact:
  FFmpeg tries to copy a non-existent video stream and muxes pure audio into an MP4 container, resulting in muxer failures or unexpected file extensions.
- Remediation:
  Detect pure audio inputs via `isAudioFile(src)` or `video_codec === "None"`. If the input is audio, omit `-c:v copy` and preserve the input audio container format.

## 5. User Kits Engine and Tool Management

### Issue 5.1: User Kit Execution Output Blackout and Engine Misalignment
- Severity: High
- Affected Files:
  - [src/kits/executor.js](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/kits/executor.js#L142-L160)
  - [src/js/runner.js](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/js/runner.js#L261-L273)
- Description:
  `executeActiveKit` calls `executeFfmpegJob` passing `{ args, totalDuration: 0, onLog, onProgress }`. However:
  1. `commandObj.executable` is omitted, causing `runner.js` to execute every kit via `execute_ffmpeg`, breaking kits configured for `yt-dlp`.
  2. `runner.js` does not invoke `commandObj.onLog` or `commandObj.onProgress`.
- Impact:
  The User Kit's dedicated runner UI elements (`#kit-log-console`, `#kit-job-progress-bar`, stats labels) never receive events and remain frozen at initial states.
- Remediation:
  Pass `{ executable: activeKit.engine || "ffmpeg", args, fullString: ... }` to `executeFfmpegJob`. Forward runner progress and log events to the kit callbacks.

### Issue 5.2: Tool Deletion Failure for Deno Runtime
- Severity: Medium
- Affected File:
  - [src-tauri/src/lib.rs](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src-tauri/src/lib.rs#L2379-L2384)
- Description:
  The tools manifest registers `deno` with `hasManageRow: true` and exposes a delete button. However, `delete_tool_internal` in Rust only checks for `yt-dlp` and `ffmpeg`/`ffprobe`.
- Impact:
  Attempting to delete Deno returns `Err("No files found to delete for tool: deno")`.
- Remediation:
  Add `"deno"` to `delete_tool_internal` mapping to `vec!["deno.exe", "deno"]`.

## 6. Backend Process Management and Media Decoding

### Issue 6.1: Global Process ID Collision and Cancellation State Races
- Severity: High
- Affected File:
  - [src-tauri/src/lib.rs](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src-tauri/src/lib.rs#L11-L12)
  - [src-tauri/src/lib.rs](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src-tauri/src/lib.rs#L635)
  - [src-tauri/src/lib.rs](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src-tauri/src/lib.rs#L923)
  - [src-tauri/src/lib.rs](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src-tauri/src/lib.rs#L1079)
- Description:
  Child processes are tracked via a single global static `RUNNING_CHILD_PID` and `CANCEL_REQUESTED`. When background probing, thumbnail generation, or concurrent tasks run, each process overwrites the global PID.
- Impact:
  Cancelling a task may terminate a background thumbnail process while leaving the main transcoding process running, or clear the cancellation flag prematurely.
- Remediation:
  Track processes per task or session using a synchronized map of task IDs to process IDs.

### Issue 6.2: Missing Frame Limit in Album Art Extraction
- Severity: High
- Affected File:
  - [src-tauri/src/lib.rs](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src-tauri/src/lib.rs#L2510-L2525)
- Description:
  `extract_album_art_internal` executes `ffmpeg -y -i <file_path> -an -vcodec mjpeg -q:v 2 <cache_file>`. It omits `-vframes 1` or `-frames:v 1`.
- Impact:
  If a video file or audio file with an active video stream is processed, FFmpeg transcodes every video frame in the entire file sequentially into the cache file, pegging CPU at 100% and stalling background threads.
- Remediation:
  Add `"-vframes", "1"` before the output file parameter.

### Issue 6.3: Unbounded Audio Decoding Memory Spike in Waveform Generator
- Severity: High
- Affected File:
  - [src/js/waveform.js](file:///C:/Users/User/Documents/Toolkit/AnEdiKit/src/js/waveform.js#L97-L105)
- Description:
  `generateWaveformFromSource` fetches the entire media file into memory via `await response.arrayBuffer()` and decodes it using `audioCtx.decodeAudioData(arrayBuffer)`.
- Impact:
  Loading a multi-gigabyte video or long audio recording loads the entire file into renderer memory and decodes uncompressed 32-bit float PCM data, causing browser crashes or severe UI freezing.
- Remediation:
  Enforce a file size limit (for example, 30 MB) for in-browser audio decoding. For larger files, extract an audio peak profile using an FFmpeg backend command or fall back to synthetic waveforms.

## Summary Priority Matrix

| ID | Issue Description | Component | Severity |
|---|---|---|---|
| 1.1 | Path corruption via unconditional URL decoding | Backend IPC & Storage | Critical |
| 1.2 | Command injection in file opener | Backend IPC | High |
| 1.3 | PowerShell injection in notifications | Backend IPC | High |
| 1.4 | FFmpeg concat demuxer backslash failure | Frontend Runner | High |
| 2.1 | OpenCV Windows Unicode path failures | Python AI Engine | Critical |
| 2.2 | Memory exhaustion in metadata cleaner | Python AI Engine | Critical |
| 2.3 | Unhandled RGBA mode crash on JPEG replacement | Python AI Engine | High |
| 3.1 | Image AI execute button permanently disabled | Frontend Main | High |
| 3.2 | Modal stacking and missing cancellation in Image AI queue | Frontend Main | High |
| 3.3 | Reference error and inoperable save in comparison modal | Frontend Comparison | High |
| 4.1 | Filtergraph failure on silent inputs | Frontend Commands | High |
| 4.2 | Incompatible stream copy audio container | Frontend Commands | Medium |
| 4.3 | Loudness normalizer defaulting to MP4 for audio | Frontend Commands | Medium |
| 5.1 | User Kit output blackout and engine misalignment | User Kits IDE | High |
| 5.2 | Tool deletion failure for Deno runtime | Backend IPC | Medium |
| 6.1 | Global PID collision and cancel state races | Backend IPC | High |
| 6.2 | Missing frame limit in album art extraction | Backend IPC | High |
| 6.3 | Unbounded audio decoding memory spike | Frontend Waveform | High |
