# User Kits IDE & Custom Module Builder (`kit_ide`)

## 1. Tool Purpose
An advanced scriptable environment allowing users to design, test, and run custom media processing workflows through two authoring paradigms:
1. Visual Block Builder: Drag-and-drop pipeline blocks (Source Input, Video Filter, Audio Mixer, Scale, Codec Transcode, Shell Step).
2. Monaco Script Engine: Full Monaco code editor for writing Python or JavaScript automation scripts with direct access to CLI tools.
Custom kits are saved to local storage, registered into the sidebar navigation alongside native tools, and can be exported/imported as JSON packages.

## 2. Architecture and Tab Navigation (`src/kits/`)

The workspace consists of 4 main tabs with a sliding pill indicator (`#kit-tab-indicator`):
1. Runner Tab (`src/kits/runner.js`):
   - User-facing execution form dynamically constructed from the kit's declared input blocks.
   - Input file selection, parameter controls, execute button, and streaming log console.
2. Builder Tab (`src/kits/builder.js`):
   - Visual pipeline canvas where blocks are added, reordered, configured, and deleted.
   - Toolbox drawer containing available block types (`src/kits/blocks.js`).
3. Script Tab (`src/kits/editor.js`):
   - Monaco code editor instance (`@monaco-editor/react` or vanilla Monaco).
   - Language selector (Python, JavaScript, Shell).
   - Script themes (VS Dark, Monokai, Solarized, One Dark).
4. Settings Tab (`src/kits/settings.js`):
   - Metadata editor: Kit Name, Description, Category, Custom Icon picker (`src/kits/icons.js`), Author, Version.
   - Export to JSON, Duplicate Kit, Delete Kit.

## 3. Data Model (`UserKit`)
```typescript
interface UserKit {
  id: string;                    // "kit_1727000000_abc"
  name: string;                  // "Instagram Reel Auto-Cropper"
  description: string;
  icon: string;                  // Ionicons name e.g. "film-outline"
  version: string;               // "1.0.0"
  author: string;
  mode: "blocks" | "script";
  blocks: KitBlock[];            // Pipeline block definitions
  scriptContent?: string;        // Raw Python or JavaScript code
  scriptRuntime?: "python" | "deno" | "node";
  createdAt: number;
  updatedAt: number;
}

interface KitBlock {
  id: string;
  type: "input_file" | "filter" | "scale" | "transcode" | "custom_cli" | "output_file";
  title: string;
  parameters: Record<string, any>;
}
```

## 4. Execution Engine (`src/kits/executor.js`)
- Block Pipeline: Serializes block configuration into a composite FFmpeg command or multi-step execution plan.
- Script Execution:
  - If Python runtime: executes via Rust `jobs::execute_image_ai({ task: "custom_script", params })`.
  - If Deno/Shell: invokes external process runner.

## 5. Rust Commands and Events
- `jobs::execute_ffmpeg`: for generated FFmpeg pipeline strings.
- `jobs::execute_image_ai`: for Python-based custom scripts.
- `system::write_temp_text_file`: for writing temporary script files.
- `system::pick_file`: for input files.
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`.

## 6. Edge Cases
- Experimental Feature Warning: When opening User Kits for the first time, `#user-kits-warning-modal` must be confirmed.
- Monaco Editor AMD conflict: In the current vanilla app, Monaco's AMD `require` hijacked Bootstrap's UMD loaders. In React + Vite, this is solved cleanly by using `@monaco-editor/react` which bundles ESM workers without global AMD pollution.

## 7. DOM Decoupling for React
- State management: `useKitsStore` (Zustand) managing all user kits, active kit ID, active tab.
- Components:
  - `<KitShell>`: header, sliding tab strip, action buttons.
  - `<KitRunnerTab>`: dynamic form rendered from `kit.blocks`.
  - `<KitBuilderCanvas>`: drag-and-drop block pipeline using `@dnd-kit/core`.
  - `<KitMonacoEditor>`: React Monaco editor component.
  - `<KitSettingsForm>`: kit metadata and export buttons.
