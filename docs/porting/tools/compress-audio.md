# Compress Audio (`compress_audio`)

## 1. Tool Purpose
Compresses voice memos, songs, podcasts, and recordings to small file sizes suitable for chat attachments and email, leveraging high-efficiency codecs (Opus VBR, AAC, MP3) with preset size targets and channel downmixing.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `comp-aud-preset` | Target Preset | Select | `"discord"` | `discord` (64 kbps Opus), `whatsapp` (32 kbps Mono), `email` (5 MB Target), `reduce_50` (50% reduction), `reduce_75` (75% reduction), `custom_mb` (Custom Size MB), `custom_bitrate` (Custom Bitrate) |
| `comp-aud-custom-mb` | Custom Size (MB) | Number | `5` | Min: `0.1`, Max: `500`. Only visible when preset is `custom_mb`. |
| `comp-aud-format` | Output Format | Select | `"opus"` | `opus` (Opus - Highest low-bitrate quality), `mp3` (MP3 - Universal), `m4a` (AAC), `ogg` (Vorbis), `flac` (Lossless) |
| `comp-aud-bitrate` | Audio Bitrate | Select | `"auto"` | `auto`, `320k`, `256k`, `192k`, `128k`, `96k`, `64k`, `48k`, `32k`, `16k` |
| `comp-aud-channels` | Channels | Select | `"original"` | `original`, `1` (Mono - halves raw PCM data), `2` (Stereo) |
| `comp-aud-samplerate` | Sample Rate | Select | `"original"` | `original`, `48000`, `44100`, `32000`, `24000`, `16000`, `8000` |

## 3. Bitrate Budgeting Logic (`src/js/commands/video_builders.js:buildCompressAudioCommand`)
1. In `auto` bitrate mode:
   - `discord`: 64 kbps
   - `whatsapp`: 32 kbps (with mono channel forced)
   - `email` (5 MB target): `(5 * 8192) / durationSeconds`
   - `reduce_50`: half of original bitrate
   - `reduce_75`: one-quarter of original bitrate
   - `custom_mb`: `(customMb * 8192) / durationSeconds`
2. Codec-specific Flags:
   - Opus: `-c:a libopus -b:a <targetK>k -vbr on -compression_level 10`
   - MP3: `-c:a libmp3lame -b:a <targetK>k`
   - M4A: `-c:a aac -b:a <targetK>k`
   - FLAC: `-c:a flac -compression_level 8`
3. Channels & Sample Rate:
   - Mono downmix: `-ac 1`
   - Sample rate: `-ar <sampleRate>`

## 4. Rust Commands and Events
- `media::get_media_info({ filePath })` -> used to retrieve duration and original bitrate.
- `jobs::execute_ffmpeg({ args, totalDurationSecs: duration })`
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 5. Live Readout (`#comp-aud-estimate-box`)
- Previews Target, Estimated Audio Bitrate, and Selected Codec before running.

## 6. Edge Cases
- When using Opus, 48 kHz is the native sample rate; resampling to 48000 Hz happens internally in the codec.
- Preserves existing tags and artwork with `-map_metadata 0`.

## 7. DOM Decoupling for React
- Controlled state `CompressAudioOptions`. Pure command builder taking options.
