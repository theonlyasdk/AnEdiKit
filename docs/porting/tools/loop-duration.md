# Loop to Duration (`loop_duration`)

## 1. Tool Purpose
Repeats and loops video or audio clips to an exact target duration (e.g. 10 minutes, 1 hour, 10 hours for ambient background tracks or screensavers) or a specific repetition count, using lossless stream copy or re-encoding.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `loop-mode` | Loop Mode | Select | `"duration"` | `duration` (Target Duration), `count` (Repeat Count) |
| `loop-target-hh` | Target Hours | Number | `1` | Min: `0`, Max: `999` |
| `loop-target-mm` | Target Minutes | Number | `0` | Min: `0`, Max: `59` |
| `loop-target-ss` | Target Seconds | Number | `0` | Min: `0`, Max: `59` |
| Quick Presets | Duration Presets | Buttons | `3600` (1 Hour) | 1 Min (`60`), 5 Min (`300`), 10 Min (`600`), 30 Min (`1800`), 1 Hour (`3600`), 2 Hours (`7200`), 10 Hours (`36000`) |
| `loop-repeat-count` | Repeat Count | Number | `10` | Min: `2`, Max: `10000`. Only visible in `count` mode. |
| `loop-engine` | Processing Mode | Select | `"copy"` | `copy` (Direct Stream Copy - Lossless & Instant), `reencode` (Re-encode Video & Audio) |
| `loop-audio-mode` | Audio Handling | Select | `"keep"` | `keep` (Loop Audio with Video), `mute` (Mute Audio with `-an`) |
| `loop-container` | Output Format | Select | `"mp4"` | `mp4`, `mkv`, `webm`, `mov`, `ts` |
| `loop-vcodec` | Video Codec | Select | `"libx264"` | Only visible when engine is `reencode` |

## 3. CLI Argument Assembly (`src/js/commands/video_builders.js:buildLoopDurationCommand`)
- Duration Mode:
  - `-stream_loop -1 -i <src> -t <targetDurationSec>`
  - Uses `-stream_loop -1` before input to loop indefinitely, then `-t <duration>` to truncate at the exact target second.
- Repeat Count Mode:
  - `-stream_loop <loopCount - 1> -i <src>`
- Stream Copy (`copy`):
  - `-c:v copy` and `-c:a copy` (if not muted).
- Re-encode Mode:
  - `applyVideoEncoderOptions` with `libx264 -crf 23 -preset medium`, audio `-c:a aac -b:a 192k`.

## 4. Rust Commands and Events
- `media::get_media_info({ filePath })` -> retrieves source duration for repetition calculation.
- `jobs::execute_ffmpeg({ args, totalDurationSecs: targetDurationSec })`
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 5. Live Calculation Readout
- Updates `#loop-calc-count`: `Math.ceil(targetDurationSec / srcDurationSec)` repetitions.
- Updates `#loop-total-time-str`: Formats total duration as `HH:MM:SS`.

## 6. Edge Cases
- When using `copy` mode, some video players require keyframe synchronization at loop boundaries. If artifacts appear, user should use `reencode`.
- Setting a 10-hour duration produces large files; stream copy is recommended for durations over 1 hour.

## 7. DOM Decoupling for React
- Create `LoopDurationOptions` state.
- Component `<DurationInput>` managing hours, minutes, seconds and quick preset buttons.
