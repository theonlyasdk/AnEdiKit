# Trim and Cut Media (`trim`)

## 1. Tool Purpose
Cuts video or audio files between specified start and end timestamps. Supports lossless instant stream copy (no quality loss, fast) and frame-accurate re-encoding with visual filmstrip and audio waveform scrubber controls.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `trim-start` | Start Timestamp | Text | `"00:00:00.000"` | Formatted as `HH:MM:SS.mmm`. Validated against `0 <= start < end`. |
| `trim-end` | End Timestamp | Text | `"00:01:00.000"` | Formatted as `HH:MM:SS.mmm`. Validated against `start < end <= duration`. |
| `trim-mode` | Trim Mode | Select | `"copy"` | `copy` (Fast Stream Copy - Lossless), `accurate` (Frame-Accurate Re-encode) |

## 3. Interactive Visual Trimmer Controls (`src/js/trimmer.js`)
- Dual Range Sliders: `#trim-slider-start` and `#trim-slider-end` overlaying the timeline.
- Visual Highlights:
  - Dimmed overlays for unselected regions (`#trim-dimmer-left`, `#trim-dimmer-right`).
  - Active selection window (`#trim-selection-window`) bounded with primary color borders.
  - Scrubbing playhead (`#trim-playhead`) synchronized with HTML5 video player.
- Quick Control Buttons:
  - Step buttons: `-1s`, `-0.1s`, `+0.1s`, `+1s`.
  - Mark In / Out buttons: Mark Start (`[`), Mark End (`]`) mapping playhead position to timestamps.
  - Preview Clip (`#btn-trim-preview-segment`): loops preview between start and end timestamps.

## 4. Rust Commands and Events
- Probing:
  - `media::get_media_info({ filePath })`
  - `media::extract_timeline_thumbnails({ filePath, count: 12 })` -> renders background filmstrip.
  - `media::extract_audio_peaks({ filePath, numSamples: 800 })` -> renders waveform canvas.
- Execution:
  - `jobs::execute_ffmpeg({ args, totalDurationSecs: clipDuration })`
- Cancellation:
  - `jobs::cancel_ffmpeg()`

## 5. CLI Argument Assembly (`src/js/commands/video_builders.js:buildTrimCommand`)
- Lossless Copy Mode (`trim-mode: "copy"`):
  - Fast seek: `-ss <start>` placed before or `-to <end>` placed appropriately.
  - Command: `ffmpeg -y -ss <start> -to <end> -i <src> -c copy -map_metadata 0 -progress pipe:1 <dest>`
- Accurate Re-encode Mode (`trim-mode: "accurate"`):
  - Accurate seek after input: `ffmpeg -y -i <src> -ss <start> -to <end> -c:v libx264 -crf 18 -preset fast -c:a aac -b:a 192k -progress pipe:1 <dest>`

## 6. Edge Cases
- Stream copy cut points on non-keyframes can result in a brief frozen frame at start. Tool UI displays helper tooltip explaining the difference between copy and accurate modes.
- If input duration is unavailable, default duration is 60s.

## 7. DOM Decoupling for React
- Isolate the timeline scrubber into a custom component `<TimelineScrubber>`:
  - Receives `duration`, `currentTime`, `thumbnails`, `waveformPeaks`.
  - Manages `[startTime, endTime]` as normalized percentages or seconds.
  - Emits `onRangeChange(start, end)` and `onSeek(time)`.
