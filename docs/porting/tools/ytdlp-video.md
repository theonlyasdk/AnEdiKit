# Download Video (`ytdlp_video`)

## 1. Tool Purpose
Downloads online video streams across 1,000+ supported sites (YouTube, Twitch, Twitter/X, TikTok, Vimeo, etc.) with resolution capping (4K, 1080p, 720p, etc.), container multiplexing, embedded subtitles, and thumbnail embedding.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `ytdlp-url-input` | Video URL | URL Input | `""` | Validated and cleaned by `ytdlp_url.js`. Auto-pasted on window focus if enabled. |
| `dl-video-res` | Max Resolution | Select | `"best"` | `best` (Highest Available), `2160` (4K), `1440` (2K), `1080` (Full HD), `720` (HD), `480` (SD), `360` (Low Data) |
| `dl-video-container` | Target Container | Select | `"mp4"` | `mp4`, `mkv`, `webm` |
| `dl-video-embed-subs` | Embed Subtitles | Switch | `true` | Embeds all available subtitles and automated captions |
| `dl-video-embed-thumb` | Embed Thumbnail Cover | Switch | `true` | Embeds video thumbnail into file container |
| `dl-video-embed-meta` | Embed Metadata | Switch | `true` | Embeds title, chapters, upload date, description |

Global settings affecting this tool:
- Browser cookies (`--cookies-from-browser`), rate limit (`-r`), SponsorBlock (`--sponsorblock-remove all`), Geo-bypass (`--geo-bypass`), filename template (`ytdlpFilenameFormat`).

## 3. Rust Commands and Events
- `jobs::execute_ytdlp({ args })`
- `jobs::cancel_job()`
- Events: `ffmpeg-progress` (parsed percentage, speed, ETA, size), `ffmpeg-log`, `ffmpeg-finished`.

## 4. CLI Argument Assembly (`src/js/commands/ytdlp_builders.js:buildYtDlpVideoCommand`)
- Single item download: `--no-playlist`
- Format selection:
  - When `res === "best"`: `-f "bestvideo*+bestaudio/best"`
  - When specific res (e.g. `1080`): `-f "bestvideo*[height<=1080]+bestaudio/best[height<=1080]/best"`
- Container: `--merge-output-format <container>`
- Embedded assets:
  - If embed subs: `--embed-subs --sub-langs all`
  - If embed thumb: `--embed-thumbnail`
  - If embed meta: `--embed-metadata --embed-chapters`
- Robustness defaults: `--retries 10 --fragment-retries 10 --socket-timeout 15 --compat-options manifest-filesize-approx --extractor-args youtube:player_client=android,web --no-mtime`
- Output template: `-o <outDir>/<template>` (normalized with `%(title)s [%(id)s].%(ext)s`).

## 5. Edge Cases
- YouTube Bot Checks: `player_client=android,web` avoids `Sign in to confirm you're not a bot` errors.
- URL sanitizer (`src/js/ytdlp_url.js`) strips playlist query parameters (`&list=...`) unless intentional.
- Automatic clipboard URL detection on window focus (`tryAutoPasteYtDlpUrl`).

## 6. DOM Decoupling for React
- Create `useYtDlpUrl` hook with automated clipboard watcher, URL cleaning, and playlist detection.
- Controlled state `YtDlpVideoOptions`.
