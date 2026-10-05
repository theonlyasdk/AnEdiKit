# AI Background Remover (`bg_remover`)

## 1. Tool Purpose
Removes photo backgrounds locally using neural segmentation models (u2net, isnet, silueta) without uploading images to cloud services, and replaces the background with transparency, solid colors, or blur.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `bg-model` | Neural Model | Select | `"u2net"` | `u2net` (High Accuracy - General), `u2net_human_seg` (Portraits / People), `isnet-general-use` (Sharp Object Edges), `silueta` (Compact / Ultra-Fast) |
| `bg-output-mode` | Background Fill | Select | `"transparent"` | `transparent` (PNG Alpha Channel), `color` (Solid Color Fill), `blur` (Blurred Original Background) |
| `bg-color` | Solid Fill Color | Color Picker | `"#ffffff"` | Hex color string. Only visible when mode is `color`. |
| `bg-blur-radius` | Blur Radius | Number | `25` | Blur radius in pixels (1 to 100). Only visible when mode is `blur`. |
| `fake-grid-tile-size` | Fake PNG Defringe | Number | `0` | Defringes fake checkerboard transparency tiles (0 to 64) |
| `ai-replace-source` | Replace Source | Switch | `false` | Overwrites source file in-place (in footer bar) |

## 3. Rust Backend and Python Engine Invocation
- Rust Command:
  - `jobs::execute_image_ai({ task: "bg_remover", params: JSON.stringify(params) })`
- Python Worker:
  - `src/py/image_ai_engine.py --task bg_remover --params "<json>"`
  - Uses `rembg` session and PIL / OpenCV.
- Cancellation:
  - `jobs::cancel_job()` (kills Python child process tree).
- Events:
  - Intercepts `ANEDIKIT_PROGRESS:{...}` lines emitted by Python and forwards them as `ffmpeg-progress`.
  - Stdout logs stream as `ffmpeg-log`.
  - Completion emits `ffmpeg-finished`.

## 4. Edge Cases
- When source is a `.jpg` and `output_mode` is `transparent`, output container must be forced to `.png` (JPEG lacks alpha channel support).
- First run downloads model weights into user cache directory; progress telemetry reports download percentage.

## 5. Comparison and Inspection Modal
- Completed results support opening the Split Comparison Modal (`src/js/comparison.js`) to inspect original vs processed image side-by-side or via slider wipe.

## 6. DOM Decoupling for React
- Form state managed in `BgRemoverOptions`.
- Integrate `<ImageLightbox>` and `<ImageComparisonModal>` as controlled React dialogs.
