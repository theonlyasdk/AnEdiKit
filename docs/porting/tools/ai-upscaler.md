# AI Image Upscaler (`ai_upscaler`)

## 1. Tool Purpose
Upscales images 2x, 3x, or 4x using deep learning super-resolution models (Real-ESRGAN x4plus, Real-ESRGAN anime, Real-ESRGAN compact) with edge enhancement and noise suppression.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `upscale-factor` | Upscale Factor | Select | `"2"` | `2` (2x Scale), `3` (3x Scale), `4` (4x Scale) |
| `upscale-model` | Super-Resolution Model | Select | `"realesrgan-x4plus"` | `realesrgan-x4plus` (General Photos), `realesrgan-x4plus-anime` (Illustrations / Manga / Anime), `realesr-general-x4v3` (Compact / Fast) |
| `upscale-denoise` | Denoise Strength | Number | `0` | Range: `0.0` (Sharpest) to `1.0` (Maximum Noise Suppression) |
| `ai-replace-source` | Replace Source | Switch | `false` | Overwrite source image |

## 3. Rust Backend and Python Engine Invocation
- Rust Command:
  - `jobs::execute_image_ai({ task: "ai_upscaler", params: JSON.stringify(params) })`
- Python Worker:
  - `src/py/image_ai_engine.py --task ai_upscaler --params "<json>"`
  - Uses `basicsr` and `realesrgan` PyTorch / ONNX runtime.
- Telemetry:
  - Emits tiling progress percentages via `ANEDIKIT_PROGRESS:` as tiles are processed.
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 4. Edge Cases
- Extremely large images (e.g. 4000x3000) upscaled 4x can trigger out-of-memory errors on GPU; Python engine tiles the image into chunks to bound VRAM usage.
- JPG source upscaled is saved as `.png` to avoid re-compression compression artifacts.

## 5. DOM Decoupling for React
- Controlled state `AiUpscalerOptions`.
- Connects to shared `ImageComparisonModal` for inspection.
