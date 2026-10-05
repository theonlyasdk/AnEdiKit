# Merge and Concatenate (`merge`)

## 1. Tool Purpose
Combines multiple video or audio clips sequentially into a single media file. Supports rapid direct stream copying using FFmpeg's `concat` demuxer (for files sharing the same codec/resolution/frame rate) and full re-encoding via `filter_complex` for heterogeneous files.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| Merge File List | Media Files to Concatenate | Reorderable List | `[]` | List of media files. Supports reordering (Move Up / Move Down / Drag & Drop) and deletion. |
| `merge-engine` | Merge Engine | Select | `"concat_demuxer"` | `concat_demuxer` (Fast Concat - Direct stream copy), `filter_complex` (Re-encode Concat - for mixed resolutions/codecs) |
| `merge-format` | Output Format | Select | `"mp4"` | Video: `mp4`, `mkv`, `webm`, `mov`, `avi`, `ts`. Audio: `mp3`, `m4a`, `flac`, `wav`, `ogg`. |

## 3. CLI Argument Assembly (`src/js/commands/video_builders.js:buildMergeCommand`)
- Concat Demuxer (`concat_demuxer`):
  - Generates a text file listing inputs formatted as:
    ```
    file 'C:\path\to\clip1.mp4'
    file 'C:\path\to\clip2.mp4'
    ```
  - Written via Tauri `system::write_temp_text_file`.
  - Command: `ffmpeg -y -f concat -safe 0 -i <concatListPath> -c copy -map_metadata 0 -progress pipe:1 <dest>`
- Filter Complex Concat (`filter_complex`):
  - Passes each file as a separate `-i <file>` input.
  - Builds graph: `[0:v:0][0:a:0][1:v:0][1:a:0]...concat=n=<count>:v=1:a=1[v][a]`
  - Encodes with `libx264 -crf 22 -c:a aac -b:a 192k`.

## 4. Rust Commands and Events
- `system::pick_files({ filterMode: "media" })`
- `system::write_temp_text_file({ filename: "concat_list.txt", content })` -> returns temp path.
- `jobs::execute_ffmpeg({ args, totalDurationSecs: totalMergedDuration })`
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 5. Edge Cases
- When merging audio-only files (e.g. MP3s), `concat_demuxer` works seamlessly, but `filter_complex` must omit video streams (`v=0:a=1`).
- Files with mismatched sample rates or frame rates will desync in `concat_demuxer`; tool warns user to choose `filter_complex` if files have differing properties.

## 6. DOM Decoupling for React
- Create `<SortableFileList>` using `@dnd-kit/core` or HTML5 Drag and Drop.
- Pure builder taking an array of file paths and `MergeOptions`.
