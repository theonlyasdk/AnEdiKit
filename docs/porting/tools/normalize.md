# Volume Normalization & Loudness (`normalize`)

## 1. Tool Purpose
Standardizes audio loudness across videos or standalone music files to match target platform standards (Spotify, YouTube, Apple Podcasts, EBU R128) using ITU-R BS.1770 EBU R128 loudnorm or dynamic range normalization (`dynaudnorm`).

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `norm-target` | Target Standard | Select | `"spotify_youtube"` | `spotify_youtube` (-14 LUFS), `apple_podcast` (-16 LUFS), `ebu_r128` (-23 LUFS / Broadcast), `custom` (Custom LUFS), `dynaudnorm` (Dynamic Audio Normalizer), `peak` (0 dB Peak Normalization) |
| `norm-custom-lufs` | Custom LUFS | Number | `"-14"` | Min: `-70`, Max: `0`. Only visible when target is `custom`. |
| `norm-tp` | True Peak (dBTP) | Select | `"-1.0"` | `-1.0` (Standard), `-0.5`, `-2.0` |
| `norm-video-mode` | Video Handling | Select | `"copy"` | `copy` (Keep Video Stream unchanged with `-c:v copy`), `strip` (Strip Video and output Audio Only with `-vn`) |
| `norm-acodec` | Audio Codec | Select | `"aac"` | `aac`, `libmp3lame` (MP3), `libopus` (Opus), `flac` (FLAC), `pcm_s16le` (WAV) |

## 3. CLI Argument Assembly (`src/js/commands/filter_builders.js:buildNormalizeCommand`)
- Audio Filter Generation:
  - `spotify_youtube`: `loudnorm=I=-14:TP=<tp>:LRA=11`
  - `apple_podcast`: `loudnorm=I=-16:TP=<tp>:LRA=11`
  - `ebu_r128`: `loudnorm=I=-23:TP=<tp>:LRA=11`
  - `custom`: `loudnorm=I=<customLufs>:TP=<tp>:LRA=11`
  - `dynaudnorm`: `dynaudnorm=f=150:g=15:p=0.95`
  - `peak`: `volume=0dB`
- Audio vs Video Input Detection:
  - Consults `probeIsAudioOnly(src)` or file extension.
  - If input is pure audio or `norm-video-mode === "strip"`, adds `-vn` and sets output container matching the audio codec (`.mp3`, `.opus`, `.flac`, `.wav`, `.m4a`).
  - Otherwise, copies video stream `-c:v copy` and packages into `.mp4`.
- Bitrate: `-b:a 256k` for AAC and MP3.

## 4. Rust Commands and Events
- `media::get_media_info({ filePath })`
- `jobs::execute_ffmpeg({ args, totalDurationSecs: duration })`
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 5. Edge Cases
- When processing pure audio files (e.g. `.mp3` or `.flac`), specifying `-c:v copy` causes FFmpeg to exit with an error. The command builder explicitly detects audio-only files and applies `-vn`.
- EBU R128 `loudnorm` performs best in single-pass linear mode when LRA=11 and dual-pass parameters are estimated.

## 6. DOM Decoupling for React
- Controlled state `NormalizeOptions`.
- Pure builder function `buildNormalizeCommand(src, outDir, settings, options)`.
