# Download Playlist (`ytdlp_playlist`)

## 1. Tool Purpose
Downloads complete YouTube or SoundCloud playlists, channels, and video series, or queries the playlist first and presents an interactive checkbox list where users can select, deselect, sort, and batch-download specific items.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `ytdlp-url-input` | Playlist / Channel URL | URL Input | `""` | Link to playlist, channel, or video list |
| `dl-playlist-mode` | Download Mode | Select | `"video"` | `video` (Full Video Series MP4 1080p/Best), `audio` (Extract Audio Tracks MP3 320k) |
| `dl-playlist-items` | Items Range | Text | `"all"` | `all` or range e.g. `1-10, 15, 20-25` |
| `dl-playlist-autonumber` | Auto Numbering | Switch | `true` | Prefixes files with `%(playlist_index)s - ` |
| `dl-playlist-ignore-errors` | Continue on Error | Switch | `true` | Adds `-i` / `--ignore-errors` to avoid halting playlist on broken videos |

Interactive Selection Panel (`#playlist-entries-panel`):
- Fetched items list with thumbnails, video titles, and duration strings.
- Sort dropdown: Original Order, Title (A-Z), Title (Z-A), Duration (Shortest first), Duration (Longest first).
- Multi-selection controls: Select All, Deselect All, Select Odd, Select Even, Invert Selection.

## 3. Rust Commands and Events
- Querying Playlist Entries:
  - `media::fetch_playlist_videos({ url })` -> `PlaylistVideo[]`
- Execution:
  - `jobs::execute_ytdlp({ args })`
- Cancellation:
  - `jobs::cancel_job()`
- Events: `ffmpeg-progress` (includes `playlist_item`, `playlist_total`, `current_item_title`), `ffmpeg-log`, `ffmpeg-finished`.

## 4. CLI Argument Assembly (`src/js/commands/ytdlp_builders.js:buildYtDlpPlaylistCommand`)
- If specific items were checked in the UI:
  - Pass `--playlist-items <comma_separated_indices>` (e.g. `--playlist-items 1,3,4,8`)
- Download Mode:
  - `video`: `-f "bestvideo*[height<=1080]+bestaudio/best[height<=1080]/best" --merge-output-format mp4`
  - `audio`: `-x --audio-format mp3 --audio-quality 0`
- Numbering:
  - Prepends `%(playlist_index)02d - ` to filename template.
- Error Tolerance:
  - `--ignore-errors` (or `--no-abort-on-error`).

## 5. Edge Cases
- Playlists with 500+ items: Querying `fetch_playlist_videos` runs asynchronously in Rust without freezing UI.
- Private or unlisted videos in playlist: `--ignore-errors` ensures the runner skips unplayable entries instead of failing the job.

## 6. DOM Decoupling for React
- Create `<PlaylistEntriesManager>` component with virtualized list rendering (e.g. `@tanstack/react-virtual`).
- Two-stage execution state machine: "Fetch Playlist" button -> fetches entries -> turns into "Download (N items)" button.
