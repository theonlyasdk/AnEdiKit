# Audio Tag & Metadata ID3 Editor (`audio_tags`)

## 1. Tool Purpose
Edits audio ID3 tags (title, artist, album, genre, track numbers, year, disc, comment) and manages embedded album cover artwork across MP3, M4A, FLAC, and OGG files with lossless audio stream copy (`-c:a copy`).

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| Audio Queue | Track List | Queue Table | `[]` | Multi-track audio file queue with selection and delete buttons |
| `tag-title` | Track Title | Text | `""` | e.g. "Bohemian Rhapsody" |
| `tag-artist` | Artist | Text | `""` | e.g. "Queen" |
| `tag-album` | Album | Text | `""` | e.g. "A Night at the Opera" |
| `tag-album-artist` | Album Artist | Text | `""` | e.g. "Queen" |
| `tag-track` | Track # | Number | `""` | e.g. "1" |
| `tag-total-tracks` | Total Tracks | Number | `""` | e.g. "12" |
| `tag-disc` | Disc # | Number | `""` | e.g. "1" |
| `tag-year` | Year | Number | `""` | e.g. "1975" |
| `tag-genre` | Genre | Text | `""` | e.g. "Rock" |
| `tag-composer` | Composer | Text | `""` | e.g. "Freddie Mercury" |
| `tag-comment` | Comment | Text | `""` | Optional comment |
| Album Cover | Cover Artwork | Image Box | `null` | Display embedded cover, "Choose..." via file dialog, or "Remove" |

Quick Actions:
- `btn-tag-autofill`: Parses filename pattern `Artist - Title.mp3` to auto-populate fields.
- `btn-tag-revert`: Reloads original metadata from audio file.
- `btn-tag-clear`: Clears all metadata text inputs.

## 3. Rust Commands and Events
- Probing Track Metadata:
  - `media::get_audio_metadata({ filePath })` -> `AudioMetadataInfo`
- Album Cover Selection:
  - `system::pick_file({ filterMode: "image" })` -> `string`
- Ogg Picture Block Metadata Preparation:
  - `media::prepare_ogg_cover_metadata({ imagePath })` -> `string`
- Execution:
  - `jobs::execute_ffmpeg({ args, totalDurationSecs: 1.0 })`
- Cancellation:
  - `jobs::cancel_ffmpeg()`

## 4. CLI Argument Assembly (`src/js/commands/video_builders.js:buildAudioTagsCommand`)
- Base flags: `-y -i <src>`
- Tag Arguments:
  - `-metadata title=<title>`
  - `-metadata artist=<artist>`
  - `-metadata album=<album>`
  - `-metadata album_artist=<albumArtist>`
  - `-metadata genre=<genre>`
  - `-metadata date=<year> -metadata year=<year>`
  - `-metadata track=<track>/<totalTracks>`
  - `-metadata disc=<disc>`
  - `-metadata composer=<composer>`
  - `-metadata comment=<comment>`
- Lossless Audio Stream Copy:
  - `-map 0:a -c:a copy`
- Cover Artwork Embedding:
  - MP3: `-i <coverPath> -map 1 -c:v mjpeg -id3v2_version 3 -metadata:s:v title="Album cover" -disposition:v:0 attached_pic`
  - M4A: `-i <coverPath> -map 1 -c:v copy -disposition:v:0 attached_pic`
  - FLAC: `-i <coverPath> -map 1 -c:v mjpeg -disposition:v:0 attached_pic`
  - OGG: `-i <tempOggMetaPath> -map_metadata 1`
  - Cover Removal (`coverAction === "remove"`): `-vn` or `-map -0:v`

## 5. Edge Cases
- Tagging must be completely lossless; the audio stream is never re-encoded.
- When saving, if "Replace Source" or overwrite prompt is agreed, writes to a temporary file first then calls `system::replace_file` to avoid file locking on Windows.

## 6. DOM Decoupling for React
- Create `useAudioTagsQueue` hook: manages queue list, active selected track, dirty change detection, and batch execution loop.
- Encapsulate metadata editor in `<AudioTagEditor>` component.
