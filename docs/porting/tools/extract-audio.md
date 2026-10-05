# Extract & Convert Audio (`extract_audio`)

## 1. Tool Purpose
Extracts sound tracks from video files or converts existing audio files across formats (MP3, M4A/AAC, FLAC, WAV, Opus, Ogg, WMA, etc.) with custom bitrate, bit depth, channel configuration, and sample rate settings.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `aud-format` | Target Audio Format | Select | `"mp3"` | `mp3`, `m4a`, `flac`, `wav`, `opus`, `ogg`, `wma`, `aiff`, `ac3`, `dts`, `amr`, `mka`, `mp2` |
| `aud-bitrate` | Audio Bitrate | Select | `"256k"` | `320k`, `256k`, `192k`, `128k`, `96k`, `64k`, `copy` (Direct Stream Copy). Hidden for uncompressed WAV/FLAC. |
| `aud-bitdepth` | PCM Bit Depth | Select | `"16"` | `16` (16-bit PCM), `24` (24-bit Studio), `32` (32-bit Float). Only visible when format is `wav` or `aiff`. |
| `aud-channels` | Audio Channels | Select | `"original"` | `original`, `2` (Stereo), `1` (Mono), `6` (5.1 Surround) |
| `aud-samplerate` | Sample Rate | Select | `"original"` | `original`, `48000`, `44100`, `96000`, `22050` |
| `aud-volume` | Volume / Normalization | Select | `"none"` | `none`, `vol_3db` (+3 dB), `vol_6db` (+6 dB), `loudnorm` (EBU R128) |

## 3. CLI Argument Assembly (`src/js/commands/video_builders.js:buildAudioExtractCommand`)
- Strips video: `-vn`
- Audio Codec Selection:
  - `mp3`: `-c:a libmp3lame -b:a <bitrate>`
  - `m4a`: `-c:a aac -b:a <bitrate>`
  - `opus`: `-c:a libopus -b:a <bitrate>`
  - `flac`: `-c:a flac`
  - `wav`: mapped from `aud-bitdepth` (`pcm_s16le`, `pcm_s24le`, `pcm_f32le`)
  - `copy`: `-c:a copy`
- Channel mapping: `-ac <channels>`
- Sample rate: `-ar <samplerate>`
- Volume filter:
  - `vol_3db`: `-af volume=3dB`
  - `vol_6db`: `-af volume=6dB`
  - `loudnorm`: `-af loudnorm=I=-16:TP=-1.5:LRA=11`
- Preserves input metadata: `-map_metadata 0`

## 4. Rust Commands and Events
- `media::get_media_info({ filePath })`
- `jobs::execute_ffmpeg({ args, totalDurationSecs: duration })`
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 5. Edge Cases
- When selecting `wav` or `flac`, the bitrate select dropdown must be hidden in the UI and replaced with bit-depth controls.
- When `copy` is chosen, volume filters and channel/sample-rate conversion are omitted.

## 6. DOM Decoupling for React
- Controlled state `ExtractAudioOptions`.
- Reactive validation hiding bitrate for lossless PCM formats.
