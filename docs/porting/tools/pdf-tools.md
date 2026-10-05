# PDF Tools Suite (`pdf_tools`)

## 1. Tool Purpose
The PDF Tools Suite is a self-contained document processing workspace organized into 7 functional categories comprising 31 specialized operations:
1. Organize PDF: Merge PDF, Split PDF, Remove Pages, Extract Pages, Organize PDF, Scan to PDF.
2. Optimize PDF: Compress PDF, Repair PDF, OCR PDF.
3. Convert to PDF: JPG to PDF, Word to PDF, PowerPoint to PDF, Excel to PDF, HTML to PDF.
4. Convert from PDF: PDF to JPG, PDF to Word, PDF to PowerPoint, PDF to Excel, PDF to PDF/A, PDF to Markdown.
5. Edit PDF: Edit PDF, Rotate PDF, Crop PDF, Page Numbers, Watermark, PDF Forms.
6. PDF Security: Protect PDF, Unlock PDF, Sign PDF, Redact PDF, Compare PDF.
7. PDF Intelligence: AI Summarizer, Translate PDF.

## 2. Architecture and View Modes (`src/js/pdf_tools.js`)
- View Modes:
  1. Category Home: Cards presenting tools within the selected category.
  2. Focused Workspace: Dedicated interactive tool execution screen.
- Special Interactive Modules:
  - Page Reorder & Selection Grid (`#pdf-page-grid`):
    - Renders rendered raster thumbnails of all PDF pages.
    - Drag-and-drop pointer reordering with ghost element and animated dashed target insertion indicator (`.pdf-page-ants`).
    - Multi-selection: All, Odd, Even, Invert, Clear.
    - Page Enlarge Modal: Full-screen lightbox modal inspecting individual pages.
  - Multi-Document File Queue (`#pdf-queue-list`):
    - Reorderable file queue with drag handles, item count badges, and delete buttons.

## 3. Inputs and Options by Tool

| Tool Category / Name | Specific Inputs & Options | Validation & Defaults |
|---|---|---|
| Organize > Merge PDF | File Queue, Output Path | Requires >= 2 files |
| Organize > Split PDF | Source File, `pdf-split-mode` | Modes: `individual` (every page) or `ranges` (e.g. `1-3, 4-6`) |
| Organize > Remove Pages | Source File, Page Grid Selection | Requires selecting at least 1 page to delete |
| Organize > Extract Pages | Source File, Page Grid Selection | Requires selecting pages to create new document |
| Organize > Organize PDF | Source File, Page Reorder Drag Grid | Drag and drop reordering of page sequence |
| Optimize > Compress PDF | `pdf-compression-level` | `screen` (Low res 72 dpi), `balanced` (150 dpi), `printer` (300 dpi) |
| Optimize > OCR PDF | `pdf-ocr-lang` | Language code (default: `"eng"`, options: `"spa"`, `"fra"`, `"deu"`, etc.) |
| Convert to > JPG to PDF | Image File Queue, Margin option | Accepts multi-image drag-drop |
| Convert to > HTML to PDF | `pdf-source-url` | Validates HTTP/HTTPS URL |
| Convert from > PDF to JPG | `pdf-image-dpi` | `72`, `150`, `300` DPI |
| Edit > Rotate PDF | `pdf-rotate-degrees` | `90`, `180`, `270` degrees |
| Edit > Watermark | `pdf-watermark`, Position, Opacity | Default text: `"CONFIDENTIAL"`, opacity `0.3` |
| Security > Protect PDF | `pdf-password` | Password input (masked) |
| Security > Unlock PDF | `pdf-password` | Existing document decryption password |
| Security > Redact PDF | `pdf-pages` (Terms to redact) | Comma-separated strings to black out |
| Intelligence > Summarize | `pdf-ai-language` (Detail Level) | `Concise executive summary`, `Detailed summary`, `Key bullet points` |

## 4. Rust Backend and Python Integration
1. Rendering Page Thumbnails:
   - Command: `jobs::render_pdf_pages({ filePath })` -> `Result<string[], string>`
   - Spawns Python using PyMuPDF / fitz, rasterizes pages into base64 PNG data URLs.
2. Inspecting PDF Document Properties:
   - Command: `jobs::get_pdf_info({ filePath })` -> `Result<serde_json::Value, string>`
   - Returns page count, dimensions, PDF version, encryption status, metadata dictionary.
3. Installing Missing Python Dependencies:
   - Command: `jobs::install_pdf_dependencies()`
   - Runs `pip install pymupdf pypdf pdf2docx reportlab pytesseract` if missing.
4. Tool Task Execution:
   - Command: `jobs::execute_image_ai({ task: "pdf_tool", params: JSON.stringify(params) })`
   - Backend redirects to `src/py/pdf_tools.py --params "<json>"`.
5. Post-Execution Result Handling:
   - Python emits `ANEDIKIT_RESULT:{"output_path":"..."}`.
   - Frontend displays Open Output File / Open Output Folder action dropdowns.

## 5. Edge Cases
- Encrypted PDFs: Prompt user for password before attempting page rendering (`render_pdf_pages`).
- Missing Python libraries: If PyMuPDF or pypdf is not installed, catches error and offers single-click "Install PDF Support" invoking `install_pdf_dependencies`.
- Very large documents (500+ pages): Rendering all thumbnails simultaneously can exhaust memory; pagination or on-demand lazy rendering is recommended.

## 6. DOM Decoupling for React
- In the existing vanilla JS, `src/js/pdf_tools.js` manually generates hundreds of lines of innerHTML and attaches imperative event listeners.
- In React:
  - Architecture: `<PdfSuite>` parent router with nested components:
    - `<PdfCategoryNav>`: category switcher tabs.
    - `<PdfToolHome>`: visual grid of tools in active category.
    - `<PdfWorkspace>`: focused tool execution environment.
    - `<PdfPageGrid>`: interactive page thumbnail grid using `@dnd-kit/sortable`.
    - `<PdfFileQueue>`: multi-document list with drag reordering.
    - `<PdfInfoCard>`: side panel showing document metadata, encryption, and page count.
