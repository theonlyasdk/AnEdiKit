// Navigation & View Transitions Module
import { saveActiveTool, getSavedActiveTool } from "./storage.js";

const TOOL_METADATA = {
  convert: {
    title: "Convert Video Formats",
    desc: "Convert between MP4, MKV, WebM, MOV, and AVI with codec, CRF quality, and resolution controls.",
    viewId: "view-convert",
  },
  extract_audio: {
    title: "Extract & Convert Audio",
    desc: "Extract audio tracks from video files or convert between MP3, M4A, FLAC, WAV, OGG, and OPUS.",
    viewId: "view-extract_audio",
  },
  trim: {
    title: "Trim and Cut Media",
    desc: "Cut video or audio clips instantly with lossless stream copy or accurate re-encode.",
    viewId: "view-trim",
  },
  compress: {
    title: "Compress Video",
    desc: "Reduce video file size for Discord (24 MB), WhatsApp (15 MB), Email (10 MB), or custom target size.",
    viewId: "view-compress",
  },
  merge: {
    title: "Merge and Concatenate",
    desc: "Combine multiple video or audio files into a single seamless continuous media stream.",
    viewId: "view-merge",
  },
  mute_replace: {
    title: "Mute or Replace Audio",
    desc: "Remove audio tracks completely or replace background audio with an external audio file.",
    viewId: "view-mute_replace",
  },
  gif_frames: {
    title: "GIF and Frame Extraction",
    desc: "Generate animated GIFs with PaletteGen color optimization or export individual image frames.",
    viewId: "view-gif_frames",
  },
  custom: {
    title: "Custom FFmpeg Command",
    desc: "Execute custom FFmpeg argument strings with live command preview and real-time execution logs.",
    viewId: "view-custom",
  },
  settings: {
    title: "Settings & Defaults",
    desc: "Configure default output folders, hardware acceleration engine, encoding threads, and system binaries.",
    viewId: "view-settings",
  },
};

const TOOL_ORDER = [
  "convert",
  "extract_audio",
  "trim",
  "compress",
  "merge",
  "mute_replace",
  "gif_frames",
  "custom",
  "settings",
];

let currentActiveTool = "convert";

export function getCurrentActiveTool() {
  return currentActiveTool;
}

export function updateSidebarIndicator(activeBtn, isSettings = false) {
  const indicator = isSettings
    ? document.getElementById("settings-indicator")
    : document.getElementById("sidebar-indicator");
  const otherIndicator = isSettings
    ? document.getElementById("sidebar-indicator")
    : document.getElementById("settings-indicator");

  if (otherIndicator) otherIndicator.style.opacity = "0";
  if (!indicator || !activeBtn) return;

  const top = activeBtn.offsetTop;
  const height = activeBtn.offsetHeight;

  indicator.style.transform = `translateY(${top}px)`;
  indicator.style.height = `${height}px`;
  indicator.style.opacity = "1";
}

export function switchTool(toolId, onToolChanged) {
  if (!TOOL_METADATA[toolId]) return;
  if (toolId === currentActiveTool) return;

  const prevIndex = TOOL_ORDER.indexOf(currentActiveTool);
  const nextIndex = TOOL_ORDER.indexOf(toolId);
  const movingDown = nextIndex > prevIndex;

  currentActiveTool = toolId;
  saveActiveTool(toolId);

  // Update nav buttons active states
  const toolNavButtons = document.querySelectorAll("#tool-nav .nav-link");
  const settingsNavBtn = document.querySelector("#settings-nav .nav-link");

  if (toolId === "settings") {
    toolNavButtons.forEach((b) => b.classList.remove("active"));
    if (settingsNavBtn) {
      settingsNavBtn.classList.add("active");
      updateSidebarIndicator(settingsNavBtn, true);
    }
  } else {
    if (settingsNavBtn) settingsNavBtn.classList.remove("active");
    toolNavButtons.forEach((b) => {
      if (b.dataset.tool === toolId) {
        b.classList.add("active");
        updateSidebarIndicator(b, false);
      } else {
        b.classList.remove("active");
      }
    });
  }

  // Header directional slide
  const headerContainer = document.getElementById("tool-header-text");
  const titleEl = document.getElementById("current-tool-title");
  const descEl = document.getElementById("current-tool-desc");

  if (headerContainer && titleEl && descEl) {
    headerContainer.classList.remove("slide-from-bottom", "slide-from-top");
    void headerContainer.offsetWidth; // force reflow

    titleEl.textContent = TOOL_METADATA[toolId].title;
    descEl.textContent = TOOL_METADATA[toolId].desc;

    const animClass = movingDown ? "slide-from-bottom" : "slide-from-top";
    headerContainer.classList.add(animClass);

    headerContainer.addEventListener(
      "animationend",
      () => {
        headerContainer.classList.remove(animClass);
      },
      { once: true },
    );
  }

  // Main workspace views
  const toolViews = document.querySelectorAll(".tool-view");
  toolViews.forEach((view) => view.classList.add("d-none"));

  const targetView = document.getElementById(TOOL_METADATA[toolId].viewId);
  if (targetView) {
    targetView.classList.remove("d-none");
  }

  // Workspace material zoom animation
  const workspaceContainer = document.getElementById("tool-view-container");
  if (workspaceContainer) {
    workspaceContainer.classList.remove("view-material-zoom");
    void workspaceContainer.offsetWidth; // force reflow
    workspaceContainer.classList.add("view-material-zoom");

    workspaceContainer.addEventListener(
      "animationend",
      () => {
        workspaceContainer.classList.remove("view-material-zoom");
      },
      { once: true },
    );
  }

  // Toggle shared input card on settings view
  const sharedInputCard = document.getElementById("shared-input-card");
  if (sharedInputCard) {
    sharedInputCard.classList.toggle("d-none", toolId === "settings");
  }

  if (onToolChanged) {
    onToolChanged(toolId);
  }
}

export function initNavigation(onToolChanged) {
  const toolNavButtons = document.querySelectorAll("#tool-nav .nav-link");
  const settingsNavBtn = document.querySelector("#settings-nav .nav-link");

  toolNavButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tool = btn.dataset.tool;
      switchTool(tool, onToolChanged);
    });
  });

  if (settingsNavBtn) {
    settingsNavBtn.addEventListener("click", () => {
      switchTool("settings", onToolChanged);
    });
  }

  // Restore saved active tool on startup
  const savedTool = getSavedActiveTool("convert");
  currentActiveTool = ""; // reset to trigger clean initial load
  switchTool(savedTool, onToolChanged);
}
