# Compress Video (`compress`)

## 1. Tool Purpose
Reduces video file size to meet strict file sharing limits (Discord 24 MB / Nitro 500 MB, WhatsApp 15 MB, Email 20 MB) or custom size targets using dynamic bitrate budgeting and audio allocation.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `comp-preset` | Target Preset | Select | `"discord"` | `discord` (24 MB), `discord_nitro` (500 MB), `whatsapp` (15 MB), `email` (20 MB), `reduce_50` (50% reduction), `reduce_75` (75% reduction), `custom` (Custom MB) |
| `comp-custom-mb` | Custom Size (MB) | Number | `24` | Min: `1`, Max: `4000`. Only visible when preset is `custom`. |
| `comp-scale` | Max Resolution | Select | `"original"` | `original`, `1920:1080`, `1280:720`, `854:480`, `640:360` |
| `comp-vcodec` | Video Codec | Select | `"libx264"` | `libx264` (H.264), `libx265` (H.265 / HEVC), `libsvtav1` (AV1) |

## 3. Bitrate Calculation Logic (`src/js/commands/video_builders.js:buildCompressCommand`)
1. Target Size (Megabytes):
   - `discord`: 24 MB (leaves 1 MB buffer for Discord 25 MB limit)
   - `discord_nitro`: 490 MB
   - `whatsapp`: 15 MB
   - `email`: 20 MB
   - `reduce_50`: `input_file_size_mb * 0.5`
   - `reduce_75`: `input_file_size_mb * 0.25`
   - `custom`: parsed from `comp-custom-mb`
2. Total Available Bitrate:
   - `totalBitrateKbps = (targetBytes * 8) / (durationSeconds * 1000)`
3. Audio Allocation:
   - Low budgets (< 500 kbps): 64 kbps audio.
   - High budgets: 96 kbps or 128 kbps audio.
4. Video Allocation:
   - `vBitrate = Math.max(100, Math.floor(totalBitrateKbps - aBitrate))`
   - Buffer size: `-maxrate <vBitrate * 1.4>k -bufsize <vBitrate * 2.0>k`

## 4. Rust Commands and Events
- `media::get_media_info({ filePath })` -> used for media duration and original file size.
- `jobs::execute_ffmpeg({ args, totalDurationSecs: duration })`
- `jobs::cancel_ffmpeg()`
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 5. Live Bitrate Readout (`src/js/estimates.js`)
- As duration or preset changes, `#comp-est-target`, `#comp-est-vbitrate`, and `#comp-est-abitrate` update in real-time to preview the calculated target bitrates before executing.

## 6. Edge Cases
- Media duration of 0 or unprobed media defaults to 120 seconds fallback.
- Extremely short clips (< 2s) could calculate excessively high bitrates; capping prevents overflowing codec limits.
- Extremely long videos might yield < 100 kbps; video codec is clamped to minimum 100 kbps.

## 7. DOM Decoupling for React
- Replace direct DOM reads with controlled state `CompressOptions` and an active calculation hook `useBitrateEstimate(mediaInfo, compressOptions)`.
