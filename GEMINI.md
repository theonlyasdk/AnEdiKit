# Project Overview - AnEdiKit

AnEdiKit is a lightweight, all-in-one toolkit for creators, combining a wide range of media utilities into a single desktop application. It includes FFmpeg-based video and audio tools, a yt-dlp frontend for downloading media, image extraction utilities, and other tools for common content creation workflows.

The application uses Tauri for its frontend, keeping the overall application size and resource usage relatively low compared to traditional desktop frameworks. Python is used as the backend for image processing and other tasks that benefit from its extensive ecosystem of media and machine-learning libraries.

AnEdiKit is designed around asynchronous processing, allowing long-running tasks such as encoding, downloading, image processing, and AI-based operations to run in the background without freezing the interface. Tasks can provide clear progress and status feedback while keeping the UI responsive.

The interface follows a simple and predictable workflow, making tools easy to discover and use without requiring users to navigate through unnecessary screens or complex settings. Common actions, inputs, outputs, progress states, and errors are presented consistently across the application.

AnEdiKit also supports on-device neural processing for features such as background removal and image upscaling, allowing these operations to run locally without requiring files to be uploaded to external services. This keeps creator data on the user's device while providing advanced processing capabilities.

Tech:
- Application Type: Desktop app (Tauri v2)
- Frontend: HTML5, CSS3, JavaScript
- Backend: Rust (`src-tauri`)
- Package Manager: npm

Avoid:
- generic SaaS aesthetics
- oversized spacing
- decorative UI patterns

# Hard rules

- No generic SaaS layouts
- No copy-paste AI-style UI patterns
- No predictable navbar + hero + feature grid + pricing layouts
- No colorful or neon gradients
- No neon gradient borders
- No glow, lighting blooms, or heavy shadows without a clear purpose
- No huge drop shadow radii
- No huge rounded corners
- Don't round every element
- No oversized headings
- No default or trendy fonts just for looks
- No overused startup serif fonts
- No stock 3D graphics unless needed
- No excessive use of icons
- No icons that don't clearly match their meaning
- No excessive use of emojis
- Don't use emojis as a replacement for real icons
- No version tags like v0.1 or build badges in UI
- No random monospace badges or decorative status pills
- No monospace font in the UI except inside log boxes and console outputs
- Keep a clean table-like grid layout (fixed sidebar on left, unified top bar spanning across sidebar header and main tool titlebar in a crisp grid alignment)
- Cursor pointer must be used for dropdown menu buttons and select elements
- Use Material Zoom transition (subtle scale and fade) for the main workspace view container when switching tools. For the top tool header title and description, use a directional vertical slide without fade reflecting sidebar navigation order (sliding from bottom when moving downwards, sliding from top when moving upwards)
- Use zoom-in ease-out animations for conditionally appearing and disappearing UI elements
- Use ellipsis text-truncation for tool header titles and descriptions when the window is narrow
- Do not show action buttons (such as Execute or Run) on informational or configuration views like Settings where no task execution is performed
- No floating pills or badges like "AI Powered" or "Trusted by 10k+ teams" unless useful
- No "modern", "innovative", or "next-gen" styling without a reason
- No purposeless whitespace or uniform padding everywhere
- No cliché UI elements like bouncing scroll indicators
- No default eyebrow text above headings unless useful
- No UI elements without a clear purpose
- No screens designed without considering the full user flow
- No buttons or links without a clear result
- After copying text or commands to clipboard, temporarily change the copy button state to success (e.g. btn-success with checkmark icon) for clear user feedback before reverting
- Keep interactions consistent across the app
- Handle loading, empty, error, disabled, and success states
- Check edge cases before implementing a feature
- No vague copy like "Boost Your Workflow" or "Unlock Productivity"
- UI text must clearly explain the action or feature with a title=""
- Don't invent features, data, or requirements
- Follow the project's technical limits
- Keep accessibility in mind
- Don't add UI that makes the app harder to build for no good reason
- Prefer simple and useful over flashy
- Reuse existing components and patterns
- Treat AI-generated boilerplate as a starting point, not a finished design
- Add visual or interaction choices only when they serve the product
- Follow the product needs, not current design trends

# Bootstrap 5 design rules

- Follow Bootstrap 5 components and patterns closely
- Prefer Bootstrap classes over custom CSS
- Use Bootstrap's grid system for layout
- Use Bootstrap's spacing utilities instead of custom margins and padding
- Use Bootstrap's standard breakpoints
- Use Bootstrap's standard buttons, forms, cards, alerts, modals, dropdowns, and navs
- Follow Bootstrap's default component structure and behavior
- Use Bootstrap's typography scale and text utilities
- Use Bootstrap's color and utility classes where possible
- Keep border radius and shadows close to Bootstrap defaults
- Do not recreate Bootstrap components with custom implementations
- Do not add custom design patterns when a Bootstrap solution already exists
- Avoid excessive use of custom CSS
- Keep custom CSS limited to styles that Bootstrap cannot provide
- Keep responsive behavior consistent with Bootstrap 5
- Use Ionicons across the app for a crisp, modern, consistent icon set
- Do not mix unrelated design systems with Bootstrap
- When unsure, choose the closest Bootstrap 5 pattern instead of inventing a new one
- Always load Bootstrap scripts (`bootstrap.bundle.min.js`) before Monaco Editor's loader (`vs/loader.min.js`) in HTML; Monaco's AMD loader (`define.amd`) hijacks Bootstrap's UMD module definition and prevents Bootstrap modals/dialogs from initializing globally


# LocalStorage Key System

All localStorage keys must follow the hierarchical `anedikit:` namespace convention:
- `anedikit:settings:active_tool`: Currently selected active sidebar tool ID (e.g. `convert`, `extract_audio`, `trim`, `compress`, `merge`, `mute_replace`, `gif_frames`, `custom`, `settings`).
- `anedikit:settings`: Application settings JSON object (output directory, overwrite prompt, hardware acceleration engine, thread count, default video codec, default speed preset, default audio format, default audio bitrate).
- `anedikit:settings:last_input_file`: Path of the most recently chosen media file.
- `anedikit:settings:last_ytdlp_out_dir`: Default/last used download destination folder for yt-dlp tools.
- `anedikit:settings:last_image_ai_out_dir`: Default/last used output folder for Image & AI tools.
- `anedikit:settings:theme`: Custom theme color palette and typography configuration.
- `anedikit:settings:active_kit`: Active user kit ID string.
- `anedikit:settings:active_kit_tab:<kit_id>`: Remembered active IDE tab per specific kit (e.g. runner, builder, script, settings).
- `anedikit:settings:script_theme`: Active Monaco editor syntax theme identifier in User Kit Script Editor.
- `anedikit:tools:batch:queue`: List of queued media files for batch processing.
- `anedikit:tools:image_ai:queue`: List of queued image files for AI processing.
- `anedikit:tools:image_ai:replace_source`: In-place source replacement toggle for AI images.
- `anedikit:tools:ytdlp:filename_format`: Global template format string for downloaded filenames.
- `anedikit:tools:user_kits`: Array of custom user kit definitions.
- `anedikit:tools:params:<tool_id>`: Saved parameters and properties array per specific tool view.

# Success criteria

Good implementations:
- Require minimal explanation
- Are easy to scan
- Feel predictable
- Minimize cognitive load
- Are easy to modify later
- Follow Bootstrap 5 patterns closely
- Use existing components instead of custom solutions
- Have clear and consistent user flows
- Handle common edge cases
- Handle errors gracefully
- Give clear feedback when something fails
- Explain what went wrong and what the user can do next
- Give clear feedback when an action succeeds
- Give immediate feedback for important user actions and controls
- Keep controls visually consistent with their current state
- Never leave the user unsure whether an action worked
- Avoid unnecessary code and complexity

## Assistant and Output Instructions
- Use summaries.
- No emojis.
- No horizontal rules (no `---`).
- No unnecessary bold letters.
- Keep responses and documentation direct, clean, and concise.
- Create distinct modules for each JS functionality instead of a monolithic main.js file.
- Expose backend commands via `tauri::command` in `src-tauri/src/lib.rs` and invoke from frontend via `@tauri-apps/api/core`.
