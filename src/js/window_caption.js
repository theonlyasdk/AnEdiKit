// AnEdiKit - Window Caption Controls and Titlebar Management Submodule

export function getTauriWindow() {
  try {
    const tauriWindow = window.__TAURI__?.window;
    if (!tauriWindow) return null;
    if (typeof tauriWindow.getCurrentWindow === "function") {
      return tauriWindow.getCurrentWindow();
    }
    if (tauriWindow.appWindow) {
      return tauriWindow.appWindow;
    }
  } catch (err) {
    console.warn("Failed to resolve Tauri window:", err);
  }
  return null;
}

export async function updateMaximizeIcon() {
  const icon = document.getElementById("win-maximize-icon");
  const btn = document.getElementById("win-maximize");
  if (!icon || !btn) return;
  const win = getTauriWindow();
  if (!win || typeof win.isMaximized !== "function") return;
  try {
    const maximized = await win.isMaximized();
    // Segoe MDL2 Assets: E922 = ChromeMaximize, E923 = ChromeRestore
    icon.textContent = maximized ? "\uE923" : "\uE922";
    btn.title = maximized ? "Restore" : "Maximize";
  } catch (_) {
    /* ignore - e.g. running in browser preview */
  }
}

export function applyTitlebarMode(useSystem) {
  const isSystem = useSystem !== false;
  document.body.classList.toggle("with-system-titlebar", isSystem);
  if (window.__TAURI__?.core?.invoke) {
    window.__TAURI__.core.invoke("set_decorations", { decorations: isSystem }).catch((e) => {
      console.warn("Failed to set window decorations:", e);
    });
  }
  updateMaximizeIcon();
}

export function initCaptionControls() {
  const bar = document.getElementById("top-header-bar");
  const btnMin = document.getElementById("win-minimize");
  const btnMax = document.getElementById("win-maximize");
  const btnClose = document.getElementById("win-close");
  if (!bar || !btnMin || !btnMax || !btnClose) return;

  btnMin.addEventListener("click", async () => {
    const win = getTauriWindow();
    if (win && typeof win.minimize === "function") {
      try {
        await win.minimize();
      } catch (err) {
        console.warn("Minimize failed:", err);
      }
    }
  });

  const toggleMax = async () => {
    const win = getTauriWindow();
    if (win && typeof win.toggleMaximize === "function") {
      try {
        await win.toggleMaximize();
      } catch (err) {
        console.warn("Toggle maximize failed:", err);
      }
      updateMaximizeIcon();
    } else if (win && typeof win.isMaximized === "function") {
      try {
        if (await win.isMaximized()) await win.unmaximize();
        else await win.maximize();
      } catch (err) {
        console.warn("Maximize toggle failed:", err);
      }
      updateMaximizeIcon();
    }
  };

  btnMax.addEventListener("click", toggleMax);

  // Window dragging: left-press anywhere on the merged header (outside
  // interactive elements) starts a native window drag. This is the reliable
  // Tauri v2 mechanism - the data-tauri-drag-region attribute alone is not
  // enough once decorations are toggled at runtime.
  bar.addEventListener("mousedown", (e) => {
    // Native decorations already drag the window: only take over presses
    // when the custom title bar is active, so a drag gesture can never
    // swallow clicks (e.g. the hamburger) in system-titlebar mode.
    if (document.body.classList.contains("with-system-titlebar")) return;
    if (e.button !== 0) return;
    if (e.target.closest(".header-caption-controls, button, a, input, select, textarea, [role=\"button\"]")) return;
    const win = getTauriWindow();
    if (win && typeof win.startDragging === "function") {
      win.startDragging().catch((err) => {
        console.warn("Window dragging failed:", err);
      });
    }
  });

  // Double-click on the drag region toggles maximize (Windows 10 behavior)
  bar.addEventListener("dblclick", (e) => {
    if (document.body.classList.contains("with-system-titlebar")) return;
    if (e.target.closest(".header-caption-controls, button, a, input, select, textarea, [role=\"button\"]")) return;
    toggleMax();
  });

  // Movable dialogs: any open Bootstrap modal can reposition the window by
  // dragging its header (same native mechanism as the main header).
  // Delegated so dynamically-created modals work too. Controls (close/X,
  // links, inputs) are excluded so they keep their normal behavior.
  // No-op outside Tauri (browser preview).
  document.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const header = e.target?.closest?.(".modal-header");
    if (!header || !header.closest(".modal.show")) return;
    if (e.target.closest("button, a, input, select, textarea, [role=\"button\"], #manage-tools-modal, .sheet-header, [data-tauri-drag-region=\"false\"]")) return;
    const win = getTauriWindow();
    if (win && typeof win.startDragging === "function") {
      win.startDragging().catch((err) => {
        console.warn("Dialog dragging failed:", err);
      });
    }
  });

  btnClose.addEventListener("click", async () => {
    const win = getTauriWindow();
    if (win && typeof win.close === "function") {
      try {
        await win.close();
      } catch (err) {
        console.warn("Close failed:", err);
      }
    }
  });

  updateMaximizeIcon();
  // Refresh restore/maximize glyph when window state changes externally
  window.addEventListener("resize", () => {
    updateMaximizeIcon();
  });
}
