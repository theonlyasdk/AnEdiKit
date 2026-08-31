# AnEdiKit LocalStorage Key System Documentation

This document describes all keys used by AnEdiKit to store application configuration, state, queues, user kits, themes, and per-module parameter properties in web browser/WebView2 localStorage.

All keys in the application follow the hierarchical `anedikit:` namespace convention, organized into `settings` and `tools` domain scopes.

## Application Settings Namespace (`anedikit:settings:*`)

### 1. `anedikit:settings`
- Type: JSON Object
- Description: Global application settings and defaults configured in the Settings view.
- Structure:
  - `outputDir` (string): Default target directory for processed media files.
  - `promptOverwrite` (boolean): Whether to prompt confirmation before overwriting existing files.
  - `enableNotifications` (boolean): Toggle desktop system notifications upon task completion.
  - `disableAnimations` (boolean): Disables UI transitions and animations when true.
  - `customFont` (string): Custom system font family override.
  - `hwAccel` (string): Hardware acceleration profile (`auto`, `cuda`, `qsv`, `amf`, `cpu`).
  - `threads` (string): Number of encoding threads (`0` for auto-detection).
  - `defVCodec` (string): Default video codec for conversions (`libx264`, `libx265`, `libvpx-vp9`, `libsvtav1`).
  - `defSpeed` (string): Default FFmpeg preset (`ultrafast`, `veryfast`, `fast`, `medium`, `slow`).
  - `defAFmt` (string): Default audio format for extraction (`mp3`, `m4a`, `flac`, `wav`, `opus`, `ogg`).
  - `defABitrate` (string): Default audio bitrate (`320k`, `256k`, `192k`, `128k`, `96k`, `64k`).
  - `ytdlpCookies` (string): Browser cookie extraction profile for yt-dlp (`none`, `chrome`, `firefox`, `edge`, `brave`, `opera`, `vivaldi`).
  - `ytdlpRateLimit` (string): yt-dlp download speed limit (`none`, `50K`, `500K`, `1M`, `5M`, `10M`, `20M`).
  - `ytdlpSponsorblock` (boolean): Automatically strip sponsored video segments using SponsorBlock API.
  - `ytdlpGeoBypass` (boolean): Bypass geographic restrictions when downloading streams.
  - `ytdlpAutoPaste` (boolean): Automatically populate URL input when pasting links from clipboard.
  - `ytdlpCustomArgs` (string): Additional custom yt-dlp CLI arguments.
  - `ytdlpFilenameFormat` (string): Global template format string for downloaded filenames.
  - `ffmpegBin` (string): Resolved path or label for FFmpeg binary.
  - `ffprobeBin` (string): Resolved path or label for FFprobe binary.

### 2. `anedikit:settings:active_tool`
- Type: String
- Description: Stores the identifier of the currently selected sidebar tool or active user kit.
- Possible values: `convert`, `compress`, `trim`, `speed_motion`, `aspect_crop`, `stabilize`, `normalize`, `mute_replace`, `gif_frames`, `extract_audio`, `compress_audio`, `merge`, `custom`, `bg_remover`, `ai_upscaler`, `vectorizer`, `restore_denoise`, `icon_generator`, `metadata_cleaner`, `ytdlp_video`, `ytdlp_playlist`, `ytdlp_audio`, `ytdlp_subtitles`, `settings`, or `kit_<kit_id>`.
- Example: `"convert"`

### 3. `anedikit:settings:last_input_file`
- Type: String
- Description: Normalized absolute path of the most recently chosen media file.
- Example: `"C:\\Users\\User\\Videos\\sample_clip.mp4"`

### 4. `anedikit:settings:last_ytdlp_out_dir`
- Type: String
- Description: Most recently chosen destination folder for yt-dlp media downloads.
- Example: `"C:\\Users\\User\\Downloads"`

### 5. `anedikit:settings:last_image_ai_out_dir`
- Type: String
- Description: Most recently chosen destination folder for Image and AI processed outputs.
- Example: `"C:\\Users\\User\\Pictures"`

### 6. `anedikit:settings:active_kit`
- Type: String
- Description: Identifier of the currently active/selected user kit.
- Example: `"converter_template"`

### 7. `anedikit:settings:theme`
- Type: JSON Object
- Description: Custom color palette and typography preferences.
- Structure:
  - `name` (string): Theme preset name or `"Custom"`.
  - `font_family` (string): Body typography family override.
  - `primary` (string): Hex color code for primary accents.
  - `secondary` (string): Hex color code for secondary elements.
  - `success` (string): Hex color code for success states.
  - `danger` (string): Hex color code for destructive actions.
  - `warning` (string): Hex color code for warnings.
  - `info` (string): Hex color code for information cues.
  - `body_bg` (string): Hex color code for root body background.
  - `card_bg` (string): Hex color code for card surfaces.
  - `pane_bg` (string): Hex color code for workspace container background.
  - `text_color` (string): Hex color code for primary text.
  - `border_color` (string): Hex color code for surface borders.

### 8. `anedikit:settings:script_theme`
- Type: String
- Description: Active Monaco editor syntax theme identifier in User Kit Script Editor.
- Possible values: `vs-dark`, `vs`, `hc-black`, `monokai`, `dracula`, `github-dark`, `github-light`, `nord`, `solarized-dark`, `one-dark-pro`.
- Example: `"vs-dark"`

### 9. `anedikit:settings:active_kit_tab:<kit_id>`
- Type: String
- Description: Remembers the active workspace tab per individual user kit.
- Possible values: `runner`, `builder`, `script`, `settings`.
- Example: `"builder"`

## Tools and Queues Namespace (`anedikit:tools:*`)

### 1. `anedikit:tools:batch:queue`
- Type: JSON Array of Objects
- Description: Persisted media items queued for batch processing across tools.
- Item Structure:
  - `path` (string): Absolute file path of the queued item.
  - `name` (string): Display filename.
  - `size` (number): File size in bytes.
  - `status` (string): Status of the batch item (`pending`, `done`, `error`, `skipped`).
  - `duration` (string): Media duration string.

### 2. `anedikit:tools:image_ai:queue`
- Type: JSON Array of Objects
- Description: Persisted image files queued for AI and batch image operations.
- Item Structure:
  - `path` (string): Absolute image file path.
  - `name` (string): Display image filename.
  - `size` (number): File size in bytes.
  - `status` (string): Processing state (`pending`, `processing`, `done`, `error`, `skipped`).
  - `outputPath` (string, optional): Path to the generated output image.

### 3. `anedikit:tools:image_ai:replace_source`
- Type: String (`"true"` | `"false"`)
- Description: Preference toggle indicating whether AI image operations overwrite source files or create new output files.

### 4. `anedikit:tools:ytdlp:filename_format`
- Type: String
- Description: Global filename format template for yt-dlp downloads.
- Example: `"%(title)s [%(id)s].%(ext)s"`

### 5. `anedikit:tools:user_kits`
- Type: JSON Array of Objects
- Description: Collection of user-created scriptable Kits and macro pipelines.
- Kit Structure:
  - `id` (string): Unique kit identifier (e.g. `user_converter_123`).
  - `name` (string): User-defined kit name.
  - `author` (string): Author name.
  - `version` (string): Kit version string.
  - `license` (string): Kit license (e.g. `MIT`).
  - `description` (string): Kit description text.
  - `icon` (string): Bootstrap icon class name.
  - `category` (string): Category identifier (`video`, `audio`, `image`, `utility`).
  - `engine` (string): Target runtime engine (`ffmpeg`, `deno`, `node`, `python`).
  - `blocks` (array): Array of configured UI parameter block definitions.
  - `script` (string): JavaScript execution script body for command construction.

## Module Parameter Keys (`anedikit:tools:params:<module_id>`)

Each individual tool module stores its complete UI parameter state under its own unique key.

### Key Format
`anedikit:tools:params:<module_id>`

### Storage Value Structure
```json
{
  "moduleId": "convert",
  "updatedAt": "2026-08-31T18:00:00.000Z",
  "properties": [
    {
      "id": "cvt-container",
      "value": "mp4",
      "type": "select"
    },
    {
      "id": "cvt-vcodec",
      "value": "libx264",
      "type": "select"
    },
    {
      "id": "cvt-crf",
      "value": "23",
      "type": "select"
    }
  ]
}
```

### Module Keys and Stored Properties

#### 1. `anedikit:tools:params:convert` (Convert Video)
- `cvt-container`: Target video container format (`mp4`, `mkv`, `webm`, `mov`, `avi`, `gif`, `webp`, etc.).
- `cvt-vcodec`: Video encoder codec (`libx264`, `libx265`, `libvpx-vp9`, `libsvtav1`, `copy`).
- `cvt-acodec`: Audio encoder codec (`aac`, `mp3`, `opus`, `flac`, `copy`).
- `cvt-crf`: Constant Rate Factor quality value (`18`, `23`, `28`).
- `cvt-preset`: Encoding speed and compression preset (`ultrafast`, `veryfast`, `fast`, `medium`, `slow`).
- `cvt-scale`: Output resolution scaling (`original`, `1920:1080`, `1280:720`, `854:480`, `640:360`, `480:270`).
- `cvt-gif-fps`: GIF frame rate when GIF format is chosen (`10`, `15`, `20`, `24`, `30`).
- `cvt-gif-quality`: Palette generation mode (`palettegen`, `basic`).
- `cvt-webp-fps`: WebP animation frame rate (`15`, `24`, `30`, `60`).
- `cvt-webp-quality`: WebP quality compression preset (`75`, `90`, `50`, `lossless`).

#### 2. `anedikit:tools:params:compress` (Compress Video)
- `comp-preset`: Size/platform target preset (`discord`, `discord_nitro`, `whatsapp`, `email`, `reduce_50`, `reduce_75`, `custom`).
- `comp-custom-mb`: Custom size limit in megabytes.
- `comp-scale`: Maximum resolution downscaling limit (`original`, `1920:1080`, `1280:720`, `854:480`, `640:360`).
- `comp-vcodec`: Compression video codec (`libx264`, `libx265`, `libsvtav1`).

#### 3. `anedikit:tools:params:trim` (Trim and Cut)
- `trim-start`: Start timestamp string (`00:00:00.000`).
- `trim-end`: End timestamp string (`00:01:00.000`).
- `trim-mode`: Cut method (`copy` for stream copy, `reencode` for frame-accurate re-encode).
- `trim-slider-start`: Timeline slider range start position.
- `trim-slider-end`: Timeline slider range end position.

#### 4. `anedikit:tools:params:speed_motion` (Speed & Motion)
- `speed-preset`: Speed factor preset (`0.25`, `0.5`, `0.75`, `1.25`, `1.5`, `2.0`, `4.0`, `8.0`, `16.0`, `custom`).
- `speed-custom-val`: Numeric custom speed multiplier value.
- `speed-audio-mode`: Audio speed retiming mode (`atempo`, `strip`, `drop`).
- `speed-interp`: Frame rate smoothing/interpolation mode (`none`, `blend`, `minterpolate`).
- `speed-container`: Target container format (`mp4`, `mkv`, `mov`, `webm`).

#### 5. `anedikit:tools:params:aspect_crop` (Aspect & Crop Framing)
- `crop-ratio`: Target aspect ratio (`9:16`, `1:1`, `4:5`, `16:9`, `21:9`, `4:3`).
- `crop-mode`: Framing mode (`center_crop`, `pad_blur`, `pad_black`, `fit_scale`).
- `crop-crf`: Quality CRF value (`18`, `23`, `28`).
- `crop-container`: Output container format (`mp4`, `mkv`, `mov`, `webm`).

#### 6. `anedikit:tools:params:stabilize` (Video Stabilization)
- `stab-engine`: Stabilization engine (`deshake`, `vidstab`).
- `stab-smooth`: Smoothing level (`low`, `medium`, `high`, `tripod`).
- `stab-border`: Border handling (`crop`, `black`, `mirror`).
- `stab-container`: Output format (`mp4`, `mkv`, `mov`).

#### 7. `anedikit:tools:params:normalize` (Volume Normalization)
- `norm-target`: Loudness standard preset (`spotify_youtube`, `apple_podcast`, `ebu_r128`, `dynaudnorm`, `peak`, `custom`).
- `norm-custom-lufs`: Custom numeric integrated LUFS target.
- `norm-tp`: Maximum true peak in dBTP (`-1.0`, `-1.5`, `-2.0`, `0.0`).
- `norm-video-mode`: Video stream handling (`copy`, `strip`).
- `norm-acodec`: Audio codec (`aac`, `libmp3lame`, `libopus`, `flac`, `pcm_s16le`).

#### 8. `anedikit:tools:params:mute_replace` (Mute or Replace Audio)
- `mute-action`: Operation mode (`strip`, `replace`, `mix`).
- `second-audio-path`: File path of replacement or background audio track.
- `second-audio-vol`: Background track volume scale (`1.0`, `0.75`, `0.5`, `0.25`, `1.5`).

#### 9. `anedikit:tools:params:gif_frames` (GIF and Frames)
- `gif-mode`: Extraction mode (`gif_hq`, `snapshot`, `frames_seq`).
- `gif-fps`: Animation frame rate (`10`, `15`, `20`, `24`, `30`).
- `gif-width`: Target width (`320`, `480`, `640`, `800`, `original`).
- `gif-start`: Start timestamp string.
- `gif-dur`: Extraction duration in seconds.
- `gif-snap-fmt`: Snapshot image format (`png`, `jpg`, `webp`).

#### 10. `anedikit:tools:params:extract_audio` (Extract and Convert Audio)
- `aud-format`: Target audio container (`mp3`, `m4a`, `flac`, `wav`, `opus`, `ogg`, `aiff`, etc.).
- `aud-bitrate`: Audio bitrate (`320k`, `256k`, `192k`, `128k`, `96k`, `64k`, `copy`).
- `aud-bitdepth`: PCM bit depth (`16`, `24`, `32`).
- `aud-channels`: Channel layout (`original`, `2`, `1`, `6`).
- `aud-samplerate`: Audio sample rate (`original`, `48000`, `44100`, `96000`, `22050`).
- `aud-volume`: Volume adjustment and normalization (`none`, `vol_3db`, `vol_6db`, `loudnorm`).

#### 11. `anedikit:tools:params:compress_audio` (Compress Audio)
- `comp-aud-preset`: Audio size target preset (`discord`, `whatsapp`, `email`, `reduce_50`, `reduce_75`, `custom_mb`, `custom_bitrate`).
- `comp-aud-custom-mb`: Custom size limit in megabytes.
- `comp-aud-format`: Audio codec (`opus`, `mp3`, `m4a`, `ogg`, `flac`).
- `comp-aud-bitrate`: Audio bitrate (`auto`, `320k`, `256k`, `192k`, `128k`, `96k`, `64k`, `48k`, `32k`, `16k`).
- `comp-aud-channels`: Channels (`original`, `1`, `2`).
- `comp-aud-samplerate`: Sample rate (`original`, `48000`, `44100`, `32000`, `24000`, `16000`, `8000`).

#### 12. `anedikit:tools:params:merge` (Merge and Concat)
- `merge-engine`: Concat engine (`concat_demuxer`, `filter_complex`).
- `merge-format`: Output container format (`mp4`, `mkv`, `webm`, `mov`, `avi`, `ts`, `mp3`, `m4a`, `flac`, `wav`, `ogg`).

#### 13. `anedikit:tools:params:custom` (Custom Command)
- `custom-preset-select`: Predefined argument string preset.
- `custom-ext`: Output file extension (`mp4`, `mkv`, `mov`, `webm`, `avi`, `mp3`, `wav`).
- `custom-args`: Custom FFmpeg CLI parameter string.

#### 14. `anedikit:tools:params:bg_remover` (AI Background Remover)
- `bg-model`: Segmentation model (`u2net`, `fake_transparency`, `u2net_human_seg`, `u2net_cloth_seg`, `isnet-general-use`, `isnet-anime`, `birefnet-general`, `silueta`).
- `bg-output-mode`: Output background mode (`transparent`, `solid_color`, `blur_bg`).
- `bg-color`: Hex color for solid background fill.
- `bg-blur-radius`: Blur radius in pixels.
- `fake-grid-tile-size`: Checkerboard grid tile size (0 for auto).
- `fake-grid-tolerance`: Checkerboard color tolerance.
- `fake-gap-threshold`: Checkerboard interior gap threshold.
- `image-ai-output-dir`: Dedicated image output directory.
- `ai-replace-source`: In-place source replacement toggle.

#### 15. `anedikit:tools:params:ai_upscaler` (AI Image Upscaler)
- `upscale-factor`: Scale factor (`2`, `3`, `4`).
- `upscale-model`: Upscaling neural model or filter (`realesrgan-x4plus`, `realesr-animevideov3`, `realesrgan-x4plus-anime`, `bicubic_sharp`, `clarity_hdr`).
- `upscale-denoise`: Denoise level (`0`, `15`, `30`, `50`).
- `image-ai-output-dir`: Output folder.
- `ai-replace-source`: In-place source replacement toggle.

#### 16. `anedikit:tools:params:vectorizer` (Image Vectorizer)
- `vec-mode`: Vectorization mode (`color`, `monochrome`, `line_art`, `posterize_flat`).
- `vec-colors`: Color palette count (`4`, `8`, `16`, `32`).
- `vec-mono-color`: Monochrome silhouette color hex.
- `vec-tolerance`: Path curve simplification tolerance (`0.5`, `1.0`, `2.5`).
- `image-ai-output-dir`: Output folder.
- `ai-replace-source`: In-place source replacement toggle.

#### 17. `anedikit:tools:params:restore_denoise` (Restore & Denoise)
- `rest-method`: Algorithm (`nlmeans`, `bilateral`, `deblur_sharpen`, `clahe_enhance`, `guided_filter`).
- `rest-strength`: Filter strength (`8`, `15`, `25`, `40`).
- `image-ai-output-dir`: Output folder.
- `ai-replace-source`: In-place source replacement toggle.

#### 18. `anedikit:tools:params:icon_generator` (Icon Generator)
- `icon-platform`: Platform target bundle (`all`, `windows`, `web`, `mobile`).
- `icon-fit-mode`: Fit mode (`contain`, `cover`, `stretch`).
- `icon-bg-color`: Background padding mode (`transparent`, `#ffffff`, `#000000`).
- `image-ai-output-dir`: Output folder.

#### 19. `anedikit:tools:params:metadata_cleaner` (Metadata Cleaner)
- `meta-action`: Cleaning mode (`strip_all`, `color_profile_only`).
- `meta-out-format`: Output format (`original`, `jpg`, `png`, `webp`).
- `image-ai-output-dir`: Output folder.
- `ai-replace-source`: In-place source replacement toggle.

#### 20. `anedikit:tools:params:ytdlp_video` (Download Video)
- `dl-video-res`: Maximum resolution limit (`best`, `2160`, `1440`, `1080`, `720`, `480`, `360`).
- `dl-video-container`: Target container (`mp4`, `mkv`, `webm`).
- `dl-video-embed-subs`: Subtitle embedding toggle switch (boolean).
- `dl-video-embed-thumb`: Thumbnail cover embedding toggle switch (boolean).
- `dl-video-embed-meta`: Metadata and chapter embedding switch (boolean).
- `ytdlp-output-dir`: Download destination folder path.
- `ytdlp-filename-format`: Output filename format template.

#### 21. `anedikit:tools:params:ytdlp_audio` (Download Audio)
- `dl-audio-fmt`: Audio format (`mp3`, `m4a`, `flac`, `wav`, `opus`, `ogg`).
- `dl-audio-quality`: Audio bitrate quality profile (`0`, `2`, `4`, `6`).
- `dl-audio-embed-thumb`: Album art embedding toggle switch (boolean).
- `dl-audio-embed-meta`: ID3 tags/artist info embedding switch (boolean).
- `ytdlp-output-dir`: Download destination folder path.
- `ytdlp-filename-format`: Output filename format template.

#### 22. `anedikit:tools:params:ytdlp_playlist` (Download Playlist)
- `dl-playlist-mode`: Playlist download mode (`video`, `audio`).
- `dl-playlist-items`: Items range expression (e.g. `all` or `1-10`).
- `dl-playlist-autonumber`: Numbering prefix toggle switch (boolean).
- `dl-playlist-ignore-errors`: Skip failed items toggle switch (boolean).
- `playlist-sort-select`: Playlist sorting mode (`original`, `title_asc`, `title_desc`, `dur_asc`, `dur_desc`).
- `ytdlp-output-dir`: Download destination folder path.
- `ytdlp-filename-format`: Output filename format template.

#### 23. `anedikit:tools:params:ytdlp_subtitles` (Subtitles & Thumbnails)
- `dl-sub-lang`: Subtitle language code (e.g. `en`, `es`, `all`).
- `dl-sub-fmt`: Subtitle format (`srt`, `vtt`, `ass`, `lrc`).
- `dl-sub-auto`: Include auto-generated captions switch (boolean).
- `dl-sub-thumb`: Download high-resolution thumbnail artwork switch (boolean).
- `ytdlp-output-dir`: Download destination folder path.
- `ytdlp-filename-format`: Output filename format template.

#### 24. `anedikit:tools:params:kit_<kit_id>` (User Kits)
- Dynamically stores block inputs, switches, folder pickers, and parameters configured in the Kit builder.
