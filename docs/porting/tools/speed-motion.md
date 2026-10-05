# Speed & Motion Control (`speed_motion`)

## 1. Tool Purpose
Changes video and audio playback speed (speed up, slow down, timelapse, hyperlapse) with pitch correction and optional optical flow motion interpolation for ultra-smooth slow motion.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `speed-preset` | Speed Slider | Range | `2.0` | Range: `0.25` to `16.0` (step: `0.25`). Quick presets: `0.25x`, `0.5x`, `0.75x`, `1x`, `1.25x`, `1.5x`, `2x`, `4x`, `8x`, `16x`. |
| `speed-custom-val` | Custom Speed | Number | `2.0` | Min: `0.1`, Max: `100.0`, Step: `0.1` |
| `speed-container` | Output Format | Select | `"mp4"` | `mp4`, `mkv`, `mov`, `webm` |
| `speed-audio-mode` | Audio Retiming | Select | `"atempo"` | `atempo` (Pitch-Corrected Audio via chained FFmpeg atempo filters), `strip` (Mute/Strip Audio Track), `drop` (Drop audio sync with `-c:a copy`) |
| `speed-interp` | Frame Interpolation | Select | `"none"` | `none` (Instant standard drop/duplicate), `blend` (Frame blending with `tblend`), `minterpolate` (Optical Flow Motion Interpolation at 60 FPS) |

## 3. CLI Argument Assembly (`src/js/commands/filter_builders.js:buildSpeedMotionCommand`)
- Base PTS calculation: `setpts=(1/speed)*PTS`
- When `speed-interp` is `blend`: appends `tblend=all_mode=average`
- When `speed-interp` is `minterpolate`: appends `minterpolate=mi_mode=mci:mc_mode=aobmc:search_param=8:scd=fdiff:fps=60`
- Audio Pitch Retiming (`atempo`):
  - FFmpeg `atempo` filter is limited to 0.5 to 2.0 per instance. Speeds outside this range are chained in a loop:
    - Example 4x speed: `atempo=2.0,atempo=2.0`
    - Example 0.25x speed: `atempo=0.5,atempo=0.5`
- Audio Mute (`strip`): adds `-an`
- Re-encodes video with `libx264 -crf 22 -preset medium`.
- Audio encoded with `-c:a aac -b:a 192k`.

## 4. Rust Commands and Events
- `media::get_media_info({ filePath })` -> provides duration for estimates.
- `jobs::execute_ffmpeg({ args, totalDurationSecs: newDuration })`
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 5. Live Readout (`#speed-estimate-box`)
- Estimates: Speed Factor (`2.0x`), New Duration (`original_duration / speed`), Estimated Size.

## 6. Edge Cases
- `minterpolate` is CPU intensive; UI should warn user about longer processing times.
- Extremely low speeds (< 0.25x) generate multiple chained `atempo` filters; input speed must be clamped and sanitized.

## 7. DOM Decoupling for React
- Convert speed slider and number input into synchronized controlled components.
- Encapsulate `buildAtempoFilter` as a pure helper function with automated unit test coverage.
