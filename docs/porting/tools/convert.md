# Convert Video Formats (`convert`)

## 1. Tool Purpose
Transcodes video and animation files between different container formats (MP4, MKV, WebM, MOV, AVI, FLV, TS, WMV, GIF, WebP, etc.) with codec selection, Constant Rate Factor (CRF) quality presets, resolution scaling, and encoding speed controls.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `cvt-container` | Output Format | Select | `"mp4"` | `mp4`, `mkv`, `webm`, `mov`, `avi`, `flv`, `ts`, `wmv`, `gif`, `webp`, `m4v`, `3gp`, `mpg`, `vob`, `ogv` |
| `cvt-vcodec` | Video Codec | Select | `"libx264"` | `libx264`, `libx265`, `libvpx-vp9`, `libsvtav1`, `copy`. Automatically mapped to hardware encoders (e.g. `h264_nvenc`) if configured in Settings. |
| `cvt-acodec` | Audio Codec | Select | `"aac"` | `aac`, `mp3`, `opus`, `flac`, `copy` |
| `cvt-crf` | Quality (CRF) | Select | `"23"` | `18` (High Quality), `23` (Balanced), `28` (Low Size) |
| `cvt-preset` | Encoding Speed | Select | `"medium"` | `ultrafast`, `veryfast`, `fast`, `medium`, `slow` |
| `cvt-scale` | Output Resolution | Select | `"original"` | `original`, `3840:2160`, `2560:1440`, `1920:1080`, `1280:720`, `854:480`, `640:360` |
| `cvt-gif-fps` | GIF Frame Rate | Select | `"15"` | `10`, `15`, `20`, `24`, `30`. Only visible when container is `gif`. |
| `cvt-gif-quality` | Palette Generation | Select | `"palettegen"` | `palettegen` (two-pass high quality), `basic` (256 colors). Only visible when container is `gif`. |
| `cvt-webp-fps` | WebP Frame Rate | Select | `"24"` | `15`, `24`, `30`, `60`. Only visible when container is `webp`. |
| `cvt-webp-quality` | WebP Quality | Select | `"75"` | `75`, `85`, `95`, `lossless`. Only visible when container is `webp`. |

## 3. Rust Commands and Events

- Probing Input:
  - `media::get_media_info({ filePath })` -> `MediaInfo`
- Destination Collision Check:
  - `system::check_file_exists({ filePath: destinationPath })` -> `boolean`
- Execution:
  - `jobs::execute_ffmpeg({ args, totalDurationSecs })`
- Cancellation:
  - `jobs::cancel_ffmpeg()`
- Events Listened:
  - `ffmpeg-progress`: telemetry (time, eta, fps, speed, bitrate, pct).
  - `ffmpeg-log`: stdout/stderr lines.
  - `ffmpeg-finished`: exit status code and notification message.

## 4. CLI Argument Assembly (`src/js/commands/video_builders.js:buildConvertCommand`)
- Base flags: `-y`
- Hardware Acceleration: `getHwaccelInputArgs(hwChoice)` (not included for GIF or WebP).
- Threads: `-threads <settings.threads>` (if not `"0"`).
- Input: `-i <src>`
- Container `gif`:
  - Uses filter chain: `fps=<fps>,scale=<scale>:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse` (for `palettegen`) or `fps=<fps>,scale=<scale>:-1:flags=lanczos` (for `basic`).
  - `-an` (drop audio).
- Container `webp`:
  - `-vf fps=<fps>,scale=<w>:<h>:force_original_aspect_ratio=decrease,pad=...`
  - `-c:v libwebp -loop 0 -q:v <quality>` (or `-lossless 1`) `-an`.
- Standard Video:
  - Video filter: `-vf scale=<w>:<h>:force_original_aspect_ratio=decrease,pad=...`
  - Encoder: `applyVideoEncoderOptions(args, vcodec, settings, { crf, preset })`
  - Audio codec: `-c:a <mappedAcodec> -b:a 192k` (or `-c:a copy`).
  - Flags: `-pix_fmt yuv420p -progress pipe:1 <destination>`.

## 5. Progress and Error Handling
- Progress is calculated against `mediaInfo.duration_seconds`.
- Zero percentage displays an indeterminate loading bar; completion renders green 100%.
- If process fails (non-zero exit code), error banner is shown with last stderr lines.

## 6. Edge Cases
- File paths containing spaces, `%`, or `&` must not be URL-encoded in CLI arguments.
- When output format is GIF or WebP, video/audio codec and CRF selectors must be hidden in the UI.
- When `copy` codec is selected, resolution scaling filter `-vf` must not be applied.

## 7. DOM Decoupling for React
- Currently reads `document.getElementById("cvt-container")?.value`, `document.getElementById("cvt-vcodec")?.value`, etc.
- In React: Manage options in a controlled form store `ConvertOptions` with `react-hook-form` and a Zod schema. Pass options directly to a pure function `buildConvertCommand(src, outDir, settings, options)`.
