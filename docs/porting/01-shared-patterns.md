# Shared UI Patterns and Proposed React Components

## 1. Overview of Shared Patterns

Across AnEdiKit's 28 tool views, common interface and state management patterns recur. In the HTML/JS frontend, these are implemented via direct DOM manipulation and imperative event bindings in `src/js/media.js`, `src/js/output_path.js`, `src/js/execution.js`, and `src/js/runner/progress.js`.

In the React architecture, each pattern is encapsulated as a reusable, typed React component using Radix UI primitives and Tailwind CSS styling.

## 2. File Selection and Media Input

### Current Implementation
- Single Input Media (`#single-input-file-wrapper` in `30_workspace_open.html`):
  - Text input displaying path, browse button invoking `system::pick_file`, and clear button.
  - Handled in `src/js/media.js` via `selectMediaFile()`.
  - Probes file immediately via `media::get_media_info`, caches probe, extracts action frame, updates duration, and triggers auto-output name generation.
- Batch Queue (`#batch-queue-container` in `30_workspace_open.html`):
  - Table of queued files with status, duration, remove buttons, and drag-and-drop support.
  - Handled in `src/js/media.js` (`getBatchQueue()`, `addFilesToBatchQueue()`, `removeBatchItem()`).
- Image AI Queue (`#image-ai-queue-container` in `view-bg_remover.html`, etc.):
  - Rendered by `src/js/image_queue.js` with thumbnail previews, status badges, resolution, and lightbox launcher.

### Proposed React Component: `MediaInputSection`
```typescript
interface MediaInputSectionProps {
  mode: "single" | "batch" | "queue";
  filterMode?: "video" | "audio" | "image" | "pdf";
  currentFile?: string;
  mediaInfo?: MediaInfo | null;
  queue?: QueueItem[];
  onFileSelect: (filePath: string) => void;
  onFilesAdd?: (filePaths: string[]) => void;
  onFileRemove?: (index: number) => void;
  onClear?: () => void;
}
```
Sub-components:
- `SingleFileInput`: Input field with Browse (`pick_file`) and Clear buttons, displaying truncated path and hover tooltip.
- `BatchQueueTable`: Sortable list showing filename, size, duration badge, action buttons, and empty-state dropzone.
- `DropZoneOverlay`: Full-window or card-level drag-drop target with dashed primary border and animated upload icon.

## 3. Media Preview and Player

### Current Implementation
- Handled in `src/js/preview_providers.js` and `src/js/media/metadata_ui.js`.
- Video Mode: HTML `<video>` element with custom controls or native controls, seeking synchronized with timestamp inputs. Uses Tauri's `convertFileSrc` to load local paths via `asset://localhost/`.
- Audio Mode: Album art display with spinning vinyl/CD animation (`.vinyl-spin`), track title marquee, format badge, and waveform canvas.
- Canvas Waveform: Drawn by `src/js/waveform.js` using peak data retrieved from `media::extract_audio_peaks`.

### Proposed React Component: `MediaPreviewCard`
```typescript
interface MediaPreviewCardProps {
  mediaInfo: MediaInfo | null;
  filePath: string;
  currentTime?: number;
  onTimeUpdate?: (time: number) => void;
  showWaveform?: boolean;
}
```
Key features:
- Uses `convertFileSrc(filePath)` for HTML5 `<video>` and `<audio>` elements.
- Uses `useMemo` or React `ref` with `HTMLCanvasElement` to render waveform peaks.
- Seamlessly switches aspect ratio between 16:9 for video, 1:1 for audio album art, and adaptive scaling for images.
- Controlled via `usePersistedSetting("showMediaPreview", true)`.

## 4. Output Destination and Collision Detection

### Current Implementation
- Handled in `src/js/output_path.js`:
  - `getSmartOutputFileName(srcPath, suffix, container, outputDir)`
  - `checkOutputTargetFileExists(targetPath)` (invokes Rust `system::check_file_exists`)
  - Warning banner `#output-file-exists-warning` shown when the target file already exists.
  - Buttons: Choose folder (`system::pick_folder`) and Show in folder (`system::show_in_folder`).

### Proposed React Component: `OutputPathSelector`
```typescript
interface OutputPathSelectorProps {
  value: string;
  defaultDir: string;
  suggestedName: string;
  onChange: (newPath: string) => void;
  isOverwritingAllowed?: boolean;
}
```
Implementation highlights:
- Internal `useEffect` with 200ms debounce calling `check_file_exists` to detect file collisions.
- Warning pill rendered using shadcn `Badge` or inline alert when collision is detected.
- Direct integration with `pick_folder` and `show_in_folder`.

## 5. Execution Status, Terminal Logs, and Metrics

### Current Implementation
- Located in `src/partials/40_workspace_close.html` and `src/js/runner/progress.js`.
- Elements:
  - Terminal log console (`#log-console`): auto-scrolling container with colored log line classification (`logKindToCssClass`).
  - Active item heading (`#current-processing-heading`): marquee scroll when text overflows container width.
  - Telemetry badges: Elapsed Time, ETA, FPS, Speed multiplier, Bitrate, Percentage.
  - Progress bar (`#job-progress-bar`): indeterminate shimmer while preparing, percentage fill when active, green on success, red on failure.
  - Copy logs button with checkmark animation (`src/js/copy_anim.js`).

### Proposed React Component: `ExecutionStatusPanel`
```typescript
interface ExecutionStatusPanelProps {
  job: ActiveJobState; // isRunning, progress, logs, metrics, activeItemTitle
  onCancel: () => void;
  onCopyLogs: () => void;
}
```
UI elements using shadcn:
- `ScrollArea` for terminal logs, with virtual scrolling or capped lines (500 lines maximum).
- `Progress` bar with smooth Tailwind transitions.
- Marquee text component using CSS transform animations for long filenames.
- Metrics pill bar displaying ETA, FPS, speed, and bitrate.

## 6. Options and Parameter Forms

### Current Implementation
- Sliders: Custom M3 sliders (`src/js/m3_slider.js`, `src/css/m3_sliders.css`) with value bubbles and tick marks.
- Switches: Custom M3 switches (`src/js/m3_switch.js`, `src/css/m3_switches.css`) with scale animation on click.
- Dropdowns: Native HTML `<select class="form-select">` with custom arrow icons.
- Persistence: Stored per-tool in localStorage under `anedikit:tools:params:<tool_id>`.

### Proposed React Components:
1. `SliderField`:
   - Built with `@radix-ui/react-slider` (shadcn `Slider`).
   - Displays label, current numerical readout, minimum/maximum range, and step increments.
2. `SwitchField`:
   - Built with `@radix-ui/react-switch` (shadcn `Switch`).
   - Crisp toggle with title and descriptive sublabel.
3. `SelectField`:
   - Built with `@radix-ui/react-select` (shadcn `Select`).
   - Keyboard accessible, searchable when list is long, custom trigger styling.
4. `RadioGroupField`:
   - Segmented buttons or radio card grid for mutually exclusive choices (e.g. Codecs, Aspect Ratios, Presets).

## 7. Modal Dialogs and Alerts

### Current Implementation
- Bootstrap modals in `src/partials/50_modals.html` managed via `bootstrap.Modal`:
  - `user-kits-warning-modal`: static warning dialog before enabling experimental features.
  - `playlist-album-warning-modal`: prompts user to switch to Playlist tool if playlist URL is detected in Audio tool.
  - `missing-tools-modal`: lists uninstalled binaries with link to tool manager.
  - `manage-tools-modal`: binary manager with download buttons, progress bars, and version checks.
  - `theme-customizer-modal`: color pickers, blur sliders, font selectors.
  - `confirm-exit-modal`: warns user when exiting while a foreground task is actively encoding.
  - `image-comparison-modal`: swipe curtain slider for image diffing.
  - `image-lightbox-modal`: pan and zoom overlay.

### Proposed React Components:
- `Dialog` (shadcn / Radix) based modal wrappers:
  - `MissingToolsDialog`: listens to version status and guides binary download.
  - `ConfirmExitDialog`: wired to Tauri `confirm-exit-requested` event.
  - `ManageToolsDialog`: full tool download and update orchestration.
  - `ThemeCustomizerDialog`: theme preset selector and palette controls.
  - `ComparisonDialog`: React port of image diff slider (Split / Side-by-side / Onion / Difference).
  - `LightboxDialog`: full-resolution image viewer with wheel zoom and drag pan.

## 8. Persisted State and Custom React Hooks

### Current Implementation
- `src/js/storage.js` manages key-value items with `anedikit:` namespace.
- Synchronous reads/writes to `localStorage`.

### Proposed React Architecture:
- Custom hook: `usePersistedState<T>(key: string, defaultValue: T): [T, (val: T) => void]`
- Typed Zod schemas for application settings and per-tool parameter state.
- Global application context or Zustand stores:
  - `useSettingsStore`: App-level settings (outputDir, hwAccel, threads, codecs, blurEnabled).
  - `useRunnerStore`: Current job state, progress metrics, logs, active PID, cancellation handlers.
  - `useMediaStore`: Active media file path, probed `MediaInfo`, metadata caches.
  - `useToolStore`: Active tool ID, tool parameters map, batch queue.
