# Download Audio & Music (`ytdlp_audio`)

## 1. Tool Purpose
Downloads online media from YouTube, YouTube Music, SoundCloud, Bandcamp, Twitch, etc., and extracts pure audio directly into MP3, M4A, FLAC, WAV, OPUS, or OGG with embedded album art and track metadata.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `ytdlp-url-input` | Audio / Video URL | URL Input | `""` | Online link. Auto-detects playlist/album URLs and shows redirect modal. |
| `dl-audio-fmt` | Audio Format | Select | `"mp3"` | `mp3`, `m4a`, `flac`, `wav`, `opus`, `ogg` |
| `dl-audio-quality` | Audio Bitrate | Select | `"0"` | `0` (320 kbps / Best), `2` (256 kbps), `4` (192 kbps), `6` (128 kbps) |
| `dl-audio-embed-thumb` | Embed Album Art | Switch | `true` | Embeds high-res thumbnail as album artwork cover |
| `dl-audio-embed-meta` | Embed Metadata | Switch | `true` | Embeds ID3 tags, artist, album, and track info |

## 3. Rust Commands and Events
- `jobs::execute_ytdlp({ args })`
- `jobs::cancel_job()`
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 4. CLI Argument Assembly (`src/js/commands/ytdlp_builders.js:buildYtDlpAudioCommand`)
- Single Track: `--no-playlist`
- Audio Extraction: `-x --audio-format <format> --audio-quality <quality>`
- Artwork & ID3:
  - Embed thumbnail: `--embed-thumbnail`
  - Embed metadata: `--embed-metadata`
- YouTube Music extractor:
  - If URL matches `music.youtube.com`, sets `extractor-args youtube:player_client=android,ios` to ensure reliable audio stream fetching without web PO token warnings.
- Output Destination: `-o <outDir>/<template>`

## 5. Edge Cases
- Album / Playlist Detection: If the user inputs a link containing `list=` or an album URL into Download Audio, `isPlaylistOrAlbumUrl(url)` triggers `#playlist-album-warning-modal` prompting the user to switch to Download Playlist.

## 6. DOM Decoupling for React
- URL input state managed by shared `YtDlpUrlInput` component.
- Modal prompt rendered using shadcn `AlertDialog`.
