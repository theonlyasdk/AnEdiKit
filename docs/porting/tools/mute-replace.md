# Mute or Replace Audio (`mute_replace`)

## 1. Tool Purpose
Modifies the audio tracks of a video: strip/mute existing audio, replace audio with an external audio file, or mix background music under the existing dialogue with volume attenuation (ducking).

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `mute-action` | Operation | Select | `"strip"` | `strip` (Mute/Remove Audio Track), `replace` (Replace with external audio), `mix` (Mix Background Audio Track) |
| `second-audio-path` | Background Audio File | File Input | `""` | File path of replacement/background audio. Required when action is `replace` or `mix`. |
| `second-audio-vol` | Background Audio Volume | Select | `"1.0"` | `1.0` (100%), `0.75` (75%), `0.5` (50% Ducking), `0.25` (25% Subtle), `1.5` (150% Boost). Only visible when action is `mix`. |

## 3. CLI Argument Assembly (`src/js/commands/video_builders.js:buildMuteReplaceCommand`)
- Strip/Mute:
  - Video stream copied directly: `-c:v copy`
  - Audio dropped: `-an`
- Replace Audio:
  - Inputs: `-i <videoSrc> -i <secondAudioPath>`
  - Video copied: `-c:v copy`
  - Audio mapped from second input: `-map 0:v:0 -map 1:a:0 -c:a aac -b:a 192k`
  - Truncate to shortest: `-shortest`
- Mix Audio:
  - Inputs: `-i <videoSrc> -i <secondAudioPath>`
  - Filter complex: `[1:a]volume=<vol>[a2];[0:a][a2]amix=inputs=2:duration=first[a]`
  - Mapping: `-map 0:v -map "[a]"`
  - Video stream: `-c:v copy`, audio: `-c:a aac -b:a 192k`.

## 4. Rust Commands and Events
- `system::pick_file({ filterMode: "audio" })` -> for selecting secondary audio file.
- `media::get_media_info({ filePath })`
- `jobs::execute_ffmpeg({ args, totalDurationSecs: duration })`
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 5. Edge Cases
- If the background audio file is longer than the video, `-shortest` or `duration=first` prevents video freeze.
- Video stream is never unnecessarily re-encoded (`-c:v copy`), preserving full quality and speeding up execution.

## 6. DOM Decoupling for React
- Create `MuteReplaceOptions` controlled form with file picker component for secondary audio track.
