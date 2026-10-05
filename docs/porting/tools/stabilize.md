# Video Stabilization & Deshake (`stabilize`)

## 1. Tool Purpose
Removes camera shake, jitter, and rotational vibration from handheld or action camera footage using FFmpeg's native `deshake` transform algorithm.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `stab-smooth` | Stabilization Strength | Select | `"medium"` | `low` (Gentle stabilization, rx=16/ry=16), `medium` (Standard handheld, rx=32/ry=32), `high` (Heavy camera shake, rx=64/ry=64), `tripod` (Simulated tripod lock, rx=64/ry=64) |
| `stab-border` | Edge Handling | Select | `"crop"` | `crop` (Zoom & Crop 8% edges to hide black borders), `mirror` (Mirror edge pixels), `black` (Leave black borders) |
| `stab-container` | Output Format | Select | `"mp4"` | `mp4`, `mkv`, `mov`, `webm` |

## 3. CLI Argument Assembly (`src/js/commands/filter_builders.js:buildStabilizeCommand`)
- Smoothness radius:
  - `low`: `rx=16:ry=16`
  - `medium`: `rx=32:ry=32`
  - `high` / `tripod`: `rx=64:ry=64`
- Filter string: `deshake=rx=<rx>:ry=<ry>:edge=<blank|mirror>:blocksize=32:contrast=125:search=0`
- If `stab-border === "crop"`, appends auto-zoom filter: `,crop=iw*0.92:ih*0.92,scale=iw:ih`.
- Video encoding: `libx264 -crf 20 -preset medium`.
- Audio encoding: `-c:a copy` (audio copied untouched).

## 4. Rust Commands and Events
- `media::get_media_info({ filePath })`
- `jobs::execute_ffmpeg({ args, totalDurationSecs: duration })`
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 5. Edge Cases
- Videos with rapid intentional pans can introduce warping or jerkiness if `high` is used; UI should provide tooltip guidance.
- Audio is untouched (`-c:a copy`).

## 6. DOM Decoupling for React
- Controlled form state `StabilizeOptions` with type safety. Pure function builder `buildStabilizeCommand`.
