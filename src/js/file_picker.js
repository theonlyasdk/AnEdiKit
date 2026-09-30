// AnEdiKit - Pure Tauri file/folder picker wrappers (no app imports).
// Breaks the media.js <-> image_queue.js cycle: queue modules need the raw
// picker without media.js's batch-queue side effect. media.js keeps
// selectMediaFiles()/selectOutputFolder() as behavior-preserving wrappers
// (pick + add to batch); queue modules call pickFiles() directly.

export async function pickFiles(filterMode = "all") {
  if (window.__TAURI__?.core?.invoke) {
    try {
      const selected = await window.__TAURI__.core.invoke("pick_files", {
        filterMode,
      });
      if (selected && selected.length > 0) return selected;
    } catch (err) {
      console.warn("Tauri pick_files error:", err);
    }
  }
  return [];
}

export async function pickFolder(defaultPath = null) {
  if (window.__TAURI__?.core?.invoke) {
    try {
      const selected = await window.__TAURI__.core.invoke("pick_folder", {
        defaultPath: defaultPath || null,
      });
      return selected || null;
    } catch (err) {
      console.warn("Tauri pick_folder error:", err);
    }
  }
  return null;
}
