# Custom FFmpeg Command (`custom`)

## 1. Tool Purpose
Allows power users to execute arbitrary custom FFmpeg arguments with live command string preview, hardware acceleration support, and real-time streaming console logs.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `custom-preset-select` | Quick Example Presets | Select | `""` | Quick presets: Rotate 90 CW, Rotate 90 CCW, Horizontal Flip, Speed Up 2x, Slow Down 0.5x, Reverse Playback, Deinterlace (Yadif), Brightness/Contrast, Lossless Archive (CRF 0) |
| `custom-ext` | Output Extension | Select | `"mp4"` | `mp4`, `mkv`, `mov`, `webm`, `avi`, `mp3`, `wav` |
| `custom-args` | Custom FFmpeg Arguments | Textarea | `"-c:v libx264 -crf 20 -c:a copy"` | User-entered CLI string inserted between input file and destination |

## 3. CLI Argument Assembly (`src/js/commands/video_builders.js:buildCustomCommand`)
- Base flags: `-y`
- Hardware Acceleration: `getHwaccelInputArgs(hwChoice)`
- Input: `-i <src>`
- Tokenization: Splits user arguments from `custom-args` with shell quote handling (respecting double-quoted and single-quoted tokens with embedded spaces).
- Progress & Output: `-progress pipe:1 <destination>`

## 4. Rust Commands and Events
- `media::get_media_info({ filePath })`
- `jobs::execute_ffmpeg({ args, totalDurationSecs: duration })`
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 5. Edge Cases
- Quoted arguments (e.g. `-filter_complex "[0:v]boxblur[v]"`) must not be naively split by whitespace. The tokenizer preserves quoted strings as atomic argument array items.
- If user omits codec or filter options, FFmpeg's default encoding rules apply.

## 6. DOM Decoupling for React
- Controlled state `CustomCommandOptions` (`{ preset: string, extension: string, customArgs: string }`).
- Monospace syntax-highlighted textarea or code input component.
