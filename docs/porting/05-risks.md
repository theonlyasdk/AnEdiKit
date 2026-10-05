# Technical Risks and Open Architectural Questions

This document analyzes the global state patterns, coupling risks, hidden dependencies, and architectural questions identified during the analysis of the AnEdiKit vanilla frontend and its interfaces with the Tauri v2 backend.

## Global State and Coupling Risks

### 1. Window-Level Mutable Singletons
The legacy application relies heavily on global mutable objects attached to the `window` object or exported as module-level singletons:
- `window.runnerState`: Tracks the active child process PID, start timestamp, active command arguments, total duration, and completion callback handlers.
- `window.mediaState`: Caches media probe results, audio stream indices, video stream parameters, and file metadata.
- `window.uiState`: Holds current tool identifiers, active modal references, log viewer scroll lock flags, and toast notification queues.

#### Risk
In React, relying on uncontrolled global mutable singletons causes desynchronization between the DOM and application state. Components fail to re-render when properties on a plain JavaScript object change, or unmounted components attempt to consume callbacks or mutate state.

#### Recommended Mitigation
- Replace `runnerState` with a centralized Zustand store (`useRunnerStore`) or React Context with dedicated actions (`startJob`, `updateProgress`, `appendLog`, `finishJob`, `abortJob`).
- Replace `mediaState` with per-tool React hook state (`useMediaProbe(filePath)`) to ensure probe lifecycles are bound to component mounting and file changes.
- Implement an explicit task queue abstraction so multiple background operations (e.g. downloads or batch jobs) can be managed without singleton collision.

### 2. Direct DOM Coupling in Command Builders
In the legacy codebase, modules in `src/js/commands/` directly query DOM nodes using `document.getElementById(...)` to retrieve form values when constructing command argument arrays:
- Example: `convertCommand.js` reads `#convert-format-select`, `#convert-crf-slider`, `#convert-preset`.

#### Risk
This tightly couples command logic to the specific HTML structure and element IDs of the legacy templates. If element IDs change or components are unmounted, builders fail with null reference exceptions.

#### Recommended Mitigation
- Refactor all command builders into pure TypeScript functions accepting strongly-typed options payloads (e.g., `buildConvertArgs(inputPath: string, outputPath: string, options: ConvertOptions): string[]`).
- Validate options structures using Zod schemas matching React Hook Form state.

### 3. Log Streaming Throughput and React Render Bottlenecks
FFmpeg and yt-dlp processes can emit hundreds of log lines per second during active execution.
In the legacy app, `src/js/runner.js` appends strings directly to a `pre` element innerText or textContent.

#### Risk
Updating React component state for every `ffmpeg-log` event triggers high-frequency re-renders of the log container and its parent tree. This can cause WebView2 UI stutter, input lag, and high memory usage.

#### Recommended Mitigation
- Use a buffered logging strategy. Collect log chunks in a mutable buffer or ref and flush them to state on requestAnimationFrame or at a throttled interval (e.g. 50ms).
- Alternatively, use a canvas-based or virtualized terminal emulator such as `@xterm/xterm` mounted via a DOM ref, bypassing React render reconciliation for raw log text.

### 4. Monaco Editor and Python Engine Dependencies in Kit IDE
`Kit IDE` uses the Monaco Editor and runs custom Python or shell scripts. In the vanilla app, Monaco is loaded via AMD require scripts injected into the document head.

#### Risk
AMD loading patterns conflict with modern Vite ESM bundling. Vite requires ESM-compatible packaging (`@monaco-editor/react` or Vite Monaco plugins) and dedicated web worker configurations for syntax highlighting and language services.

#### Recommended Mitigation
- Install `@monaco-editor/react` and configure Vite workers using standard Vite worker syntax (`?worker`).
- Isolate the Kit runner execution lifecycle into a dedicated hook (`useKitRunner`) with strict cancellation token support.

### 5. Native Drag-and-Drop and Windows WebView2 File Path Handling
The legacy application implements drag-and-drop file detection via browser drag events (`dragover`, `drop`) combined with Tauri's native payload handling.

#### Risk
On Windows WebView2, browser drop events sometimes return empty `dataTransfer.files` or fake paths (`C:\fakepath\...`) due to OS security sandboxing unless Tauri window-level file drop events are captured (`tauri://drag-drop` or `@tauri-apps/api/event`).

#### Recommended Mitigation
- Standardize all drag-and-drop interactions using Tauri's window file drop listeners (`getCurrentWebview().onDragDropEvent(...)`) instead of pure HTML5 drag-and-drop events.
- Provide a consistent drop zone overlay triggered globally or per-tool when files are dragged over the window.

## Inconsistencies and Edge Cases Identified

### 1. Inconsistent Output Path Conventions Across Tools
- Some tools default to saving in the same directory as the input file with a suffix (e.g. `_converted.mp4`).
- Other tools default to a global output folder defined in application settings.
- Some tools do not verify if the output file already exists before launching FFmpeg, relying on FFmpeg's `-y` or `-n` flags to fail or overwrite silently.

#### Resolution Needed
Standardize the output resolution pipeline:
1. Determine default directory: if user setting exists and is valid, use it; otherwise, use source file parent directory.
2. Generate default filename: `[original_basename]_[tool_suffix].[target_ext]`.
3. Perform explicit pre-flight collision check via `check_file_exists` invoke before spawning process.

### 2. Mixed Process Cancellation Signals
- Most FFmpeg tools use the Tauri `cancel_ffmpeg` command.
- yt-dlp and Python workers run through separate wrapper commands or share the unified runner channel.
- If a user navigates away from an active tool view, the legacy app either leaves the background process running or detaches the log listener without aborting the process.

#### Resolution Needed
- Clarify whether tool navigation should abort the active process or detach it into a persistent background job drawer.
- Implement an explicit job management drawer where active processes remain visible and cancelable regardless of current view.

## Open Architectural Questions

1. Background Job Persistence
   Should navigating between tools in the sidebar terminate the active operation, or should active jobs continue running in the background with a global floating progress indicator in the bottom footer?

2. Output File Collision Policy
   Should the app support an automatic "auto-increment filename" mode (e.g., `file_1.mp4`, `file_2.mp4`), or should it always present an overwrite confirmation modal when collisions are detected?

3. Monaco Editor vs Lightweight Code Editor
   Is the full Monaco Editor required for Kit IDE, or would a lighter alternative such as CodeMirror 6 satisfy script editing requirements while significantly reducing bundle size and initialization time?

4. Python Environment Management
   How should Python virtual environment path overrides be handled if the user provides a custom Python interpreter in Settings? Currently, the backend assumes bundled or system Python.
