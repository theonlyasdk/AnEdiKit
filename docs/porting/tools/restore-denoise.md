# Image Restoration & Denoise (`restore_denoise`)

## 1. Tool Purpose
Restores degraded, noisy, low-light, or blurry photographs using computer vision filters (Fast Non-Local Means Denoising, Bilateral Filter, Unsharp Mask, and CLAHE Adaptive Contrast Enhancement).

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `rest-method` | Restoration Method | Select | `"nlmeans"` | `nlmeans` (Non-Local Means Denoise - Photo Grain), `bilateral` (Bilateral Edge-Preserving Smooth), `unsharp` (Unsharp Mask Deblur & Sharpen), `clahe` (CLAHE Contrast & Shadow Boost), `combined` (Full Multi-Stage Pipeline) |
| `rest-strength` | Filter Strength | Number | `10` | Filter strength slider / number (1 subtle to 50 aggressive) |
| `ai-replace-source` | Replace Source | Switch | `false` | In-place replacement |

## 3. Rust Backend and Python Engine Invocation
- Rust Command:
  - `jobs::execute_image_ai({ task: "restore_denoise", params: JSON.stringify(params) })`
- Python Worker:
  - `src/py/image_ai_engine.py --task restore_denoise --params "<json>"`
  - Employs OpenCV (`cv2.fastNlMeansDenoisingColored`, `cv2.bilateralFilter`, `cv2.createCLAHE`).
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 4. Edge Cases
- Non-Local Means algorithm on 4K+ images can take several seconds; the Python runner streams chunk progress to avoid UI perceived freeze.
- Preserves input file format (JPEG/PNG/WEBP).

## 5. DOM Decoupling for React
- Controlled state `RestoreDenoiseOptions`. Connected to image comparison diff modal.
