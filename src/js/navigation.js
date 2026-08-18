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
  ytdlp_video: {
    title: "Download Video",
    desc: "Download full video streams from YouTube, Twitch, Twitter, TikTok, and 1000+ sites with resolution and container options.",
    viewId: "view-ytdlp_video",
  },
  ytdlp_audio: {
    title: "Download Audio & Music",
    desc: "Extract and convert online media directly to MP3, M4A, FLAC, or OPUS with automatic album art and metadata.",
    viewId: "view-ytdlp_audio",
  },
  ytdlp_playlist: {
    title: "Playlist & Batch Downloader",
    desc: "Download complete playlists, video series, channels, or batch URL queues with index numbering.",
    viewId: "view-ytdlp_playlist",
  },
  ytdlp_subtitles: {
    title: "Subtitles & Thumbnails",
    desc: "Extract closed captions, auto-generated subtitles, cover thumbnails, and video metadata without re-downloading media.",
    viewId: "view-ytdlp_subtitles",
  },
  ytdlp_custom: {
    title: "Advanced & Cookies",
    desc: "Download private or age-gated media using browser cookies, rate limits, SponsorBlock, and custom yt-dlp arguments.",
    viewId: "view-ytdlp_custom",
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
  "ytdlp_video",
  "ytdlp_audio",
  "ytdlp_playlist",
  "ytdlp_subtitles",
  "ytdlp_custom",
  "settings",
];

let currentActiveTool = "convert";

export function getCurrentActiveTool() {
  return currentActiveTool;
}

export function updateSidebarIndicator(activeBtn, isSettings = false) {
  const settingsIndicator = document.getElementById("settings-indicator");
  const sidebarIndicator = document.getElementById("sidebar-indicator");

  if (isSettings) {
    if (sidebarIndicator) sidebarIndicator.style.opacity = "0";
    if (!settingsIndicator || !activeBtn) return;
    const top = activeBtn.offsetTop;
    const height = activeBtn.offsetHeight;
    settingsIndicator.style.transform = `translateY(${top}px)`;
    settingsIndicator.style.height = `${height}px`;
    settingsIndicator.style.opacity = "1";
  } else {
    if (settingsIndicator) settingsIndicator.style.opacity = "0";
    if (!sidebarIndicator || !activeBtn) return;

    const scrollContainer = document.getElementById("sidebar-scroll-container");
    if (!scrollContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const top = btnRect.top - containerRect.top + scrollContainer.scrollTop;
    const height = btnRect.height;

    sidebarIndicator.style.transform = `translateY(${top}px)`;
    sidebarIndicator.style.height = `${height}px`;
    sidebarIndicator.style.opacity = "1";
  }
}

export function switchTool(toolId, onToolChanged) {
  if (!TOOL_METADATA[toolId]) return;
  if (toolId === currentActiveTool) return;

  const prevIndex = TOOL_ORDER.indexOf(currentActiveTool);
  const nextIndex = TOOL_ORDER.indexOf(toolId);
  const movingDown = nextIndex > prevIndex;

  currentActiveTool = toolId;
  saveActiveTool(toolId);

  // Update nav buttons active states across tool-nav, ytdlp-nav, and settings-nav
  const allToolButtons = document.querySelectorAll("#tool-nav .nav-link, #ytdlp-nav .nav-link");
  const allSettingsButtons = document.querySelectorAll('button[data-tool="settings"]');
  const desktopSettingsBtn = document.querySelector("#settings-nav .nav-link");

  if (toolId === "settings") {
    allToolButtons.forEach((b) => b.classList.remove("active"));
    allSettingsButtons.forEach((b) => b.classList.add("active"));
    if (desktopSettingsBtn) {
      updateSidebarIndicator(desktopSettingsBtn, true);
    }
  } else {
    allSettingsButtons.forEach((b) => b.classList.remove("active"));
    allToolButtons.forEach((b) => {
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

  // Toggle shared input cards (FFmpeg input file vs yt-dlp URL input)
  const isYtDlp = toolId.startsWith("ytdlp_");
  const isSettings = toolId === "settings";
  const sharedInputCard = document.getElementById("shared-input-card");
  const sharedUrlCard = document.getElementById("shared-url-card");

  if (sharedInputCard) {
    sharedInputCard.classList.toggle("d-none", isYtDlp || isSettings);
  }
  if (sharedUrlCard) {
    sharedUrlCard.classList.toggle("d-none", !isYtDlp || isSettings);
  }

  // Toggle execute and reset buttons on settings view
  const btnExecute = document.getElementById("btn-execute");
  const btnReset = document.getElementById("btn-reset");
  if (btnExecute) {
    btnExecute.classList.toggle("d-none", toolId === "settings");
  }
  if (btnReset) {
    btnReset.classList.toggle("d-none", toolId === "settings");
  }

  // Contextual status message for settings
  const statusMsg = document.getElementById("status-message");
  if (statusMsg) {
    if (toolId === "settings") {
      statusMsg.textContent = "Settings are saved automatically";
    } else if (statusMsg.textContent === "Settings are saved automatically") {
      statusMsg.textContent = "Ready";
    }
  }

  // Auto close mobile drawer on selection
  if (window.innerWidth <= 768) {
    closeMobileSidebar();
  }

  if (onToolChanged) {
    onToolChanged(toolId);
  }
}

export function closeMobileSidebar() {
  const sidebar = document.getElementById("main-sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  if (sidebar) sidebar.classList.remove("show-sidebar");
  if (backdrop) backdrop.classList.add("d-none");
}

export function toggleMobileSidebar() {
  const sidebar = document.getElementById("main-sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  if (!sidebar) return;
  const isShown = sidebar.classList.toggle("show-sidebar");
  if (backdrop) backdrop.classList.toggle("d-none", !isShown);
}

export function initNavigation(onToolChanged) {
  const allToolButtons = document.querySelectorAll("button[data-tool]");
  const btnToggle = document.getElementById("btn-sidebar-toggle");
  const backdrop = document.getElementById("sidebar-backdrop");

  if (btnToggle) {
    btnToggle.addEventListener("click", () => {
      toggleMobileSidebar();
    });

    let lastScrollTime = 0;
    btnToggle.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const now = Date.now();
        if (now - lastScrollTime < 100) return;
        lastScrollTime = now;

        const curIdx = TOOL_ORDER.indexOf(currentActiveTool);
        if (curIdx === -1) return;

        if (e.deltaY > 0) {
          // Scroll down -> Next tool
          const nextIdx = (curIdx + 1) % TOOL_ORDER.length;
          switchTool(TOOL_ORDER[nextIdx], onToolChanged);
        } else if (e.deltaY < 0) {
          // Scroll up -> Previous tool
          const prevIdx = (curIdx - 1 + TOOL_ORDER.length) % TOOL_ORDER.length;
          switchTool(TOOL_ORDER[prevIdx], onToolChanged);
        }
      },
      { passive: false },
    );
  }

  if (backdrop) {
    backdrop.addEventListener("click", () => {
      closeMobileSidebar();
    });
  }

  allToolButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tool = btn.dataset.tool;
      switchTool(tool, onToolChanged);
    });
  });

  const scrollContainer = document.getElementById("sidebar-scroll-container");
  if (scrollContainer) {
    scrollContainer.addEventListener("scroll", () => {
      const activeBtn = document.querySelector("#sidebar-scroll-container .nav-link.active");
      if (activeBtn) {
        updateSidebarIndicator(activeBtn, false);
      }
    });
  }

  window.addEventListener("resize", () => {
    const activeBtn =
      currentActiveTool === "settings"
        ? document.querySelector("#settings-nav .nav-link")
        : document.querySelector("#sidebar-scroll-container .nav-link.active");
    if (activeBtn) {
      updateSidebarIndicator(activeBtn, currentActiveTool === "settings");
    }
  });

  // Restore saved active tool on startup
  const savedTool = getSavedActiveTool("convert");
  currentActiveTool = ""; // reset to trigger clean initial load
  switchTool(savedTool, onToolChanged);
}
