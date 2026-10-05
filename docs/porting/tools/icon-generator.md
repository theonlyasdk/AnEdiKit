# Icon & Asset Generator (`icon_generator`)

## 1. Tool Purpose
Generates multi-resolution icon sets for Windows (`.ico` with 16, 24, 32, 48, 64, 128, 256px layers), Apple macOS (`.icns`), iOS / Android PWA icons (192x192, 512x512), and web favicons from a single master square image.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `icon-fit-mode` | Fitting Mode | Select | `"contain"` | `contain` (Fit with padding), `cover` (Center crop to square), `stretch` (Stretch to square) |
| `icon-bg-color` | Canvas Background | Select | `"transparent"` | `transparent` (Keep alpha), `white` (Solid White), `black` (Solid Black), `custom` (Custom Hex Color) |
| `image-ai-output-dir` | Output Folder | Folder Path | `<outputDir>/<name>_icons` | Output directory created to hold the full bundle of generated icons |

## 3. Rust Backend and Python Engine Invocation
- Rust Command:
  - `jobs::execute_image_ai({ task: "icon_generator", params: JSON.stringify(params) })`
- Python Worker:
  - `src/py/image_ai_engine.py --task icon_generator --params "<json>"`
  - Employs PIL (`Image.save(..., format='ICO', sizes=[...])`, `icns` packaging).
  - Outputs:
    - `favicon.ico`
    - `icon.icns`
    - `favicon-16x16.png`, `favicon-32x32.png`
    - `apple-touch-icon.png` (180x180)
    - `android-chrome-192x192.png`, `android-chrome-512x512.png`
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 4. Edge Cases
- Master images smaller than 512x512 px produce blurry large icons; tool UI displays a notice suggesting at least 512x512 input.
- Transparent padding is required when input is rectangular.

## 5. DOM Decoupling for React
- Controlled form state `IconGeneratorOptions`.
- Folder picker component directly binds to output directory.
