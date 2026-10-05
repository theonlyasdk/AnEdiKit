# Aspect Ratio & Crop Framing (`aspect_crop`)

## 1. Tool Purpose
Adapts video aspect ratios for social media platforms (TikTok/Shorts 9:16, Square 1:1, Classic 4:3, Ultrawide 21:9) using centered smart cropping, black letterboxing/pillarboxing, or blurred background padding.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `crop-ratio` | Target Aspect Ratio | Select | `"9:16"` | `9:16` (TikTok / Reels / Shorts), `1:1` (Instagram Square), `16:9` (Widescreen), `4:3` (Standard / TV), `21:9` (Cinematic Ultrawide), `4:5` (Instagram Portrait) |
| `crop-mode` | Framing Mode | Select | `"center_crop"` | `center_crop` (Smart Center Crop - Fills screen), `pad_black` (Letterbox / Pillarbox with black bars), `pad_blur` (Blurred Background Video Padding), `stretch` (Stretch to Fit) |
| `crop-crf` | Quality (CRF) | Select | `"23"` | `18`, `23`, `28` |
| `crop-container` | Output Format | Select | `"mp4"` | `mp4`, `mkv`, `mov`, `webm` |

## 3. CLI Argument Assembly (`src/js/commands/filter_builders.js:buildAspectCropCommand`)
- Ratio Parsing: parses `rw:rh` from `crop-ratio`.
- Center Crop:
  - `-vf crop='min(iw,ih*(rw/rh))':'min(ih,iw*(rh/rw))'`
- Black Padding:
  - `-vf pad='max(iw,ih*(rw/rh))':'max(ih,iw*(rh/rw))':(ow-iw)/2:(oh-ih)/2:black`
- Blurred Background:
  - Complex filtergraph creates two branches:
    1. Background `[bg]`: scales to fill target dimensions, crops, and applies `boxblur=20:5`.
    2. Foreground `[fg]`: scales video keeping original aspect ratio.
    3. Merges: `[bg][fg]overlay=(W-w)/2:(H-h)/2[v]`.
  - Filter string: `[0:v]scale=1080:H:force_original_aspect_ratio=increase,crop=1080:H,boxblur=20:5[bg];[0:v]scale=1080:H:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[v]`
- Audio stream: `-c:a copy` (lossless audio passthrough).

## 4. Rust Commands and Events
- `media::get_media_info({ filePath })`
- `jobs::execute_ffmpeg({ args, totalDurationSecs: duration })`
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 5. Edge Cases
- When target height or width calculated for blurred backgrounds is odd, FFmpeg fails with `width not divisible by 2`. The builder ensures dimensions are rounded to even numbers: `if (targetH % 2 !== 0) targetH++;`.

## 6. DOM Decoupling for React
- Create an interactive visual preview widget showing the crop boundary box overlaying a 16:9 canvas.
- Controlled state `AspectCropOptions` managing ratio, framing mode, CRF, and container.
