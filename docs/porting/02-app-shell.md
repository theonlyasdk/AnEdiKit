# Application Shell and Navigation Architecture

## 1. Overview of the Application Shell

The AnEdiKit shell provides a desktop-grade frame featuring a custom title bar with window controls, a collapsible navigation sidebar with a gliding active indicator, an instant-search tool browser (Dashboard), a dynamic workspace router, a synchronized bottom status/control bar, and theme customizer integration.

## 2. Window Chrome and Custom Titlebar

### Current Implementation (`15_chrome.html`, `src/js/window_caption.js`)
- Frameless Window: Tauri is configured with `"decorations": false` and `"transparent": true` in `src-tauri/tauri.conf.json`.
- Draggable Titlebar: Header elements contain `data-tauri-drag-region`, allowing click-and-drag window movement across the top bar.
- Brand Cell (`#header-brand-col`):
  - Sidebar toggle button (`#btn-sidebar-collapse`) triggering width collapse and Ctrl+B shortcut.
  - Interactive logo title (`#brand-logo-title`): click opens Credits modal; mouse wheel scroll cycles through tools.
- Animated Tool Header (`#tool-header-text`):
  - Displays `#current-tool-title` and `#current-tool-desc`.
  - Directional vertical slide animation: slides upwards when navigating to a tool below, slides downwards when navigating to a tool above in the sidebar.
- Search Input (`#all-tools-search`):
  - Visible on Dashboard view; provides instant fuzzy-search filtering across all 28 tools.
- Window Caption Buttons (`#header-caption-controls`):
  - Minimize (`win-minimize`): calls `appWindow.minimize()`.
  - Maximize / Restore (`win-maximize`): toggles `appWindow.toggleMaximize()` and swaps glyph between maximize (`\uE922`) and restore (`\uE923`).
  - Close (`win-close`): calls `appWindow.close()`. If a foreground job is active, Rust intercepts `CloseRequested` and emits `confirm-exit-requested`.
- System Titlebar Toggle:
  - Settings allows enabling native OS titlebars, which calls `window::set_decorations(true)` in Rust.

### React + shadcn Implementation: `WindowHeader`
```tsx
export function WindowHeader() {
  const { currentTool, isSidebarCollapsed, toggleSidebar, searchQuery, setSearchQuery } = useAppShell();
  const { isMaximized, minimize, toggleMaximize, close } = useTauriWindow();

  return (
    <header className="flex h-11 border-b border-border bg-background/80 backdrop-blur select-none flex-shrink-0 z-50">
      {/* Brand Column */}
      <div className={cn("flex items-center justify-between px-3 border-r border-border transition-all duration-200", isSidebarCollapsed ? "w-16" : "w-64")}>
        <Button variant="ghost" size="icon" onClick={toggleSidebar} title="Toggle sidebar (Ctrl+B)">
          <Menu className="h-4 w-4" />
        </Button>
        {!isSidebarCollapsed && (
          <span className="font-light tracking-wide text-sm cursor-pointer" onClick={() => openCreditsModal()}>
            AnEdiKit
          </span>
        )}
      </div>

      {/* Draggable Title / Tool Header */}
      <div data-tauri-drag-region className="flex flex-1 items-center justify-between px-4 overflow-hidden">
        <AnimatedToolTitle title={currentTool.title} description={currentTool.desc} />
        {currentTool.id === "all_tools" && (
          <div className="w-64">
            <Input
              type="search"
              placeholder="Search all tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
        )}
      </div>

      {/* Windows Caption Controls */}
      <div className="flex items-center">
        <button onClick={minimize} className="h-11 w-11 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button onClick={toggleMaximize} className="h-11 w-11 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground">
          {isMaximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
        </button>
        <button onClick={close} className="h-11 w-11 flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
```

## 3. Sidebar Navigation

### Current Implementation (`20_sidebar.html`, `src/js/navigation.js`)
- Structure:
  - Width: 260px expanded, 60px collapsed.
  - Sections:
    1. Dashboard (`all_tools`)
    2. yt-dlp (4 tools: audio, video, playlist, subtitles)
    3. FFmpeg (11 tools: convert, compress, trim, speed_motion, aspect_crop, stabilize, loop, normalize, mute_replace, gif_frames, extract_audio, compress_audio, audio_tags, merge, custom)
    4. Image & AI Tools (6 tools: bg_remover, ai_upscaler, vectorizer, restore_denoise, icon_generator, metadata_cleaner)
    5. PDF Tools (7 categories: organize, optimize, to, from, edit, security, intelligence)
    6. User Kits (dynamic scriptable pipelines, toggleable from settings)
    7. Settings (pinned at bottom)
- Gliding Indicator:
  - `#sidebar-indicator` element tracks active button's `offsetTop` and `offsetHeight` with `transform: translateY(Ypx)` and height matching.
- Lockout During Execution:
  - When a job is active, `runner.js` sets all sidebar buttons to `disabled`, `opacity-50`, and `cursor: not-allowed`.

### React + shadcn Implementation: `AppSidebar`
- Built using shadcn `Sidebar` or a tailored vertical navigation list.
- Gliding Indicator: implemented using Framer Motion `layoutId="sidebar-active-indicator"`.
```tsx
<nav className="flex flex-col gap-1 relative px-2 py-2">
  {tools.map((tool) => {
    const isActive = activeToolId === tool.id;
    return (
      <button
        key={tool.id}
        disabled={isJobRunning}
        onClick={() => setActiveTool(tool.id)}
        className={cn(
          "relative flex items-center gap-3 px-3 py-2 rounded-md text-xs transition-colors text-left",
          isActive ? "text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
          isJobRunning && "opacity-50 cursor-not-allowed pointer-events-none"
        )}
      >
        {isActive && (
          <motion.div
            layoutId="active-indicator"
            className="absolute inset-0 bg-primary rounded-md z-0"
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
          />
        )}
        <tool.Icon className="h-4 w-4 relative z-10" />
        <span className="relative z-10 truncate">{tool.label}</span>
      </button>
    );
  })}
</nav>
```

## 4. Dashboard (All Tools Grid)

### Current Implementation (`30_workspace_open.html`, `src/js/navigation.js`)
- Rendered in `#all-tools-browser`.
- Displays tool cards grouped by category (yt-dlp, FFmpeg Video, FFmpeg Audio, Image & AI, PDF Tools).
- Each card has an icon, title, description, and click event navigating directly to that tool view.
- Real-time search filter: hiding sections with no matching cards, displaying empty-state `#all-tools-empty` when zero results match.

### React + shadcn Implementation: `DashboardGrid`
- Uses shadcn `Card`, `Badge`, and Lucide icons.
- Instant search filter driven by React state:
```tsx
export function DashboardGrid({ searchQuery }: { searchQuery: string }) {
  const filteredCategories = useMemo(() => {
    return TOOL_CATEGORIES.map(category => ({
      ...category,
      tools: category.tools.filter(t =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.desc.toLowerCase().includes(searchQuery.toLowerCase())
      )
    })).filter(cat => cat.tools.length > 0);
  }, [searchQuery]);

  if (filteredCategories.length === 0) {
    return <EmptySearchState query={searchQuery} />;
  }

  return (
    <div className="space-y-6 p-6">
      {filteredCategories.map(cat => (
        <section key={cat.id} className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{cat.title}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {cat.tools.map(tool => (
              <Card
                key={tool.id}
                onClick={() => navigateToTool(tool.id)}
                className="cursor-pointer p-4 hover:border-primary/50 hover:bg-accent/40 transition-all flex flex-col justify-between"
              >
                <div className="flex items-start gap-3">
                  <tool.Icon className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-foreground">{tool.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{tool.desc}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

## 5. Bottom Status and Control Bar

### Current Implementation (`40_workspace_close.html`, `src/js/execution.js`)
- Unified Footer Bar (`#bottom-footer-bar`):
  - Left: Replace Source toggle switch (`#ai-replace-source-wrapper`), visible only when in Image AI tools.
  - Right:
    - Reset button (`#btn-reset`): resets all form fields of the current active tool to defaults.
    - Execute button (`#btn-execute`): primary action button. State dynamically calculated by `resolveExecuteButtonState`:
      - Hidden on informational views like Settings or Dashboard.
      - "Select File" (disabled) when no input file is selected.
      - "Execute" (primary) when ready to run.
      - "Fetch Playlist" when yt-dlp playlist URL is entered but not yet queried.
      - "Cancel" (danger style, with animated shimmer) when a job is currently running.

### React Implementation: `ShellFooterBar`
```tsx
export function ShellFooterBar() {
  const { activeTool } = useAppShell();
  const { isRunning, cancelJob } = useJobRunner();
  const { canExecute, executeLabel, executeAction, resetAction } = useActiveToolExecution();

  if (activeTool.isInformational) return null;

  return (
    <footer className="h-12 border-t border-border bg-background/90 px-4 flex items-center justify-between z-40">
      <div className="flex items-center gap-3">
        {activeTool.isImageAi && <ReplaceSourceToggle />}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={resetAction} disabled={isRunning}>
          Reset
        </Button>
        <Button
          variant={isRunning ? "destructive" : "default"}
          size="sm"
          className="min-w-28"
          disabled={!isRunning && !canExecute}
          onClick={isRunning ? cancelJob : executeAction}
        >
          {isRunning ? "Cancel" : executeLabel}
        </Button>
      </div>
    </footer>
  );
}
```

## 6. Theming and Appearance Engine

### Current Implementation (`src/js/theme.js`)
- 15 Built-in Theme Presets:
  - Bootstrap Dark, Catppuccin Mocha, Tokyo Night, Dracula, Nord, One Dark Pro, Gruvbox Dark, Solarized Dark, Rosé Pine, Synthwave '84, GitHub Dark, Monokai Pro, Everforest Dark, Material Deep Ocean, Ayu Dark.
- Theme Customizer Modal (`#theme-customizer-modal`):
  - Allows overriding primary color, surface backgrounds, text colors, and font family.
  - Acrylic and backdrop blur settings (`blur_enabled`, `blur_radius`, `blur_saturate`).
  - Persisted in localStorage key `anedikit:settings:theme`.

### React + Tailwind / shadcn Implementation: `ThemeProvider`
- Tailwind v4 or v3 with CSS variables mode.
- Root `<div data-theme={themePreset} style={customThemeStyles}>`.
- Theming context hook `useTheme()` providing:
  - `activePreset`: string key.
  - `customOverrides`: color palette map.
  - `blurEnabled`: boolean (sets CSS class or root variables).
  - `setTheme(preset)`: updates state and persists to `anedikit:settings:theme`.
