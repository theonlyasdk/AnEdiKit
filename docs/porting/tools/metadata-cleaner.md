# Metadata Viewer & Cleaner (`metadata_cleaner`)

## 1. Tool Purpose
Inspects and purges sensitive metadata embedded in images (EXIF camera model, GPS coordinates, serial numbers, date-time, photographer information) for photo privacy before online publishing.

## 2. Inputs and Options

| Field ID / State Key | Label | Type | Default | Options / Validation |
|---|---|---|---|---|
| `meta-action` | Sanitize Action | Select | `"strip_all"` | `strip_all` (Remove all EXIF, GPS, and XMP metadata), `strip_gps_only` (Remove GPS location data only, keep camera settings), `sanitize_copyright` (Keep only Copyright & Author tags) |
| `ai-replace-source` | Replace Source | Switch | `false` | In-place file sanitization |

## 3. Rust Backend and Python Engine Invocation
- Rust Command:
  - `jobs::execute_image_ai({ task: "metadata_cleaner", params: JSON.stringify(params) })`
- Python Worker:
  - `src/py/image_ai_engine.py --task metadata_cleaner --params "<json>"`
  - Employs `piexif` and PIL (`image.getexif()`, `image.save(..., exif=b"")`).
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 4. Edge Cases
- Image rotation tags: Stripping EXIF tags on photos taken with smartphones can cause the image to rotate improperly if the EXIF Orientation tag is simply discarded. The Python script performs lossless image normalization (`ImageOps.exif_transpose`) before stripping metadata so the physical pixel layout is upright.

## 5. DOM Decoupling for React
- Controlled state `MetadataCleanerOptions`.
- Metadata readout table showing detected camera, lens, date, and GPS coordinates before cleaning.
