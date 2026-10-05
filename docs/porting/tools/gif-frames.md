# GIF and Frame Extraction (`gif_frames`)

## 1. Tool Purpose
Generates high-fidelity animated GIFs using FFmpeg's two-pass `palettegen` + `paletteuse` filters, exports full-resolution single-frame snapshots, or extracts image frame sequences from video.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `gif-mode` | Operation Mode | Select | `"gif_hq"` | `gif_hq` (High-Quality Animated GIF), `snapshot` (Single Frame Snapshot), `frames_seq` (Extract Frame Sequence) |
| `gif-fps` | Frame Rate | Select | `"15"` | `10`, `15` (Standard), `20`, `24`, `30`. Only visible in `gif_hq` and `frames_seq` modes. |
| `gif-width` | Target Width | Select | `"480"` | `320`, `480`, `640`, `800`, `original`. Only visible in `gif_hq` mode. |
| `gif-start` | Start Timestamp | Text | `"00:00:00.000"` | `HH:MM:SS.mmm` seek point. |
| `gif-dur` | Clip Duration | Number | `5` | Duration in seconds (min: `0.5`, step: `0.5`, max: `300`). Only in `gif_hq` and `frames_seq`. |
| `gif-snap-fmt` | Image Format | Select | `"png"` | `png` (Lossless), `jpg` (JPEG), `webp` (WebP). Only visible in `snapshot` and `frames_seq` modes. |

## 3. CLI Argument Assembly (`src/js/commands/video_builders.js:buildGifFramesCommand`)
- High-Quality GIF (`gif_hq`):
  - Seek and duration: `-ss <start> -t <duration> -i <src>`
  - Two-pass palette filter: `-vf "fps=<fps>,scale=<width>:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5"`
  - Audio dropped: `-an`
  - Destination: `<baseName>_<start>_<dur>s.gif`
- Snapshot (`snapshot`):
  - Exact seek: `-ss <start> -i <src> -vframes 1 -q:v 2`
  - Destination: `<baseName>_snapshot.<snapFmt>`
- Frame Sequence (`frames_seq`):
  - Seek: `-ss <start> -t <duration> -i <src> -vf "fps=<fps>" -q:v 2`
  - Destination: `<baseName>_frame_%04d.<snapFmt>`

## 4. Rust Commands and Events
- `media::get_media_info({ filePath })`
- `jobs::execute_ffmpeg({ args, totalDurationSecs: duration })`
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 5. Edge Cases
- When exporting frame sequences, multiple output files are created in the target folder. Auto-output name should display the pattern `%04d.<ext>`.
- Two-pass `palettegen` avoids color banding on gradients.

## 6. DOM Decoupling for React
- Controlled state `GifFramesOptions`.
- Conditionally render inputs depending on `mode` (hide duration/FPS on snapshot, hide width on snapshot/sequence).
