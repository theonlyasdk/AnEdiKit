# Image Vectorizer (`vectorizer`)

## 1. Tool Purpose
Converts raster bitmaps (PNG, JPG, BMP, WEBP) into scalable vector graphics (SVG) layers and curves using VTracer / Potrace bezier curve extraction.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `vec-mode` | Vector Mode | Select | `"color"` | `color` (Full-Color Multi-Layer SVG), `bw` (Black & White Monochromatic), `posterize` (Posterized Limited Palette) |
| `vec-colors` | Color Quantization | Number | `8` | Number of distinct palette colors (2 to 64). Only visible in `color` and `posterize`. |
| `vec-tolerance` | Curve Precision | Number | `1.0` | Bezier curve fitting tolerance (0.1 sharp/exact to 5.0 smooth/abstract) |
| `vec-mono-color` | Silhouette Color | Color Picker | `"#000000"` | Fill color for monochrome silhouettes. Only visible in `bw` mode. |
| `ai-replace-source` | Replace Source | Switch | `false` | Only applies if source file was already an SVG |

## 3. Rust Backend and Python Engine Invocation
- Rust Command:
  - `jobs::execute_image_ai({ task: "vectorizer", params: JSON.stringify(params) })`
- Python Worker:
  - `src/py/image_ai_engine.py --task vectorizer --params "<json>"`
  - Emits SVG vector markup.
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 4. Edge Cases
- Photos with high detail contain thousands of paths, producing large SVGs. The UI suggests reducing color quantization and increasing curve tolerance for complex photos.
- Output file is always `.svg`.

## 5. DOM Decoupling for React
- Controlled state `VectorizerOptions`. SVG inline preview support in the media preview panel.
