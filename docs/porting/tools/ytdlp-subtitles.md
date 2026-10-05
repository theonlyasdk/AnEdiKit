# Subtitles & Thumbnails (`ytdlp_subtitles`)

## 1. Tool Purpose
Extracts standalone closed captions, translations, auto-generated subtitles, high-resolution video thumbnail artwork, and video JSON metadata from online media without downloading or re-encoding the full video streams.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `ytdlp-url-input` | Video URL | URL Input | `""` | Source online link |
| `dl-sub-lang` | Subtitle Language | Text | `"en"` | Language code, comma-separated e.g. `en, es, ja, fr` or `all` |
| `dl-sub-fmt` | Subtitle Format | Select | `"srt"` | `srt` (SubRip), `vtt` (WebVTT), `ass` (Advanced SubStation), `lrc` (Synced Lyrics) |
| `dl-sub-auto` | Auto-Generated Subtitles | Switch | `true` | Includes automated machine captions |
| `dl-sub-thumb` | Download Thumbnail Cover | Switch | `true` | Saves high-resolution image thumbnail |
| `dl-sub-info` | Write JSON Metadata | Switch | `false` | Saves `.info.json` metadata description file |

## 3. Rust Commands and Events
- `jobs::execute_ytdlp({ args })`
- `jobs::cancel_job()`
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 4. CLI Argument Assembly (`src/js/commands/ytdlp_builders.js:buildYtDlpSubtitlesCommand`)
- No Media Download: `--skip-download` (prevents downloading video/audio streams).
- Subtitle Extraction:
  - `--write-subs`
  - If `dl-sub-auto`: `--write-auto-subs`
  - `--sub-langs <lang>`
  - `--convert-subs <format>`
- Thumbnail:
  - If `dl-sub-thumb`: `--write-thumbnail --convert-thumbnails png`
- Description & Metadata:
  - If `dl-sub-info`: `--write-description --write-info-json`
- Output Destination: `-o <outDir>/<template>`

## 5. Edge Cases
- Auto-generated captions are not always available on non-YouTube platforms; flags should tolerate missing subs gracefully without raising fatal exit codes.
- Thumbnails converted to `.png` ensure cross-platform preview compatibility.

## 6. DOM Decoupling for React
- Controlled state `YtDlpSubtitlesOptions`. Pure command builder taking URL and options.
