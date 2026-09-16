// Navigation & View Transitions Module
import { saveActiveTool, getSavedActiveTool, getLastYtDlpOutDir, loadSettings, getUserKitById } from "./storage.js";
import { isJobRunning } from "./runner.js";

export const TOOL_METADATA = {
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
  speed_motion: {
    title: "Speed & Motion Control",
    desc: "Speed up, slow down, timelapse, hyperlapse, pitch correction, and optical flow frame interpolation.",
    viewId: "view-speed_motion",
  },
  aspect_crop: {
    title: "Aspect Ratio & Crop Framing",
    desc: "Convert aspect ratios for TikTok 9:16, Square 1:1, Ultrawide 21:9 with center crop or blurred background.",
    viewId: "view-aspect_crop",
  },
  stabilize: {
    title: "Video Stabilization & Deshake",
    desc: "Remove handheld camera shakes and stabilize action or drone footage using native FFmpeg algorithms.",
    viewId: "view-stabilize",
  },
  loop_duration: {
    title: "Loop to Duration",
    desc: "Repeat and loop videos or audio to an exact target duration or repeat count with seamless stream copy.",
    viewId: "view-loop_duration",
  },
  normalize: {
    title: "Volume Normalization & Loudness",
    desc: "Standardize audio loudness to YouTube, Spotify, Podcasts, or broadcast EBU R128 standards.",
    viewId: "view-normalize",
  },
  compress: {
    title: "Compress Video",
    desc: "Reduce video file size for Discord (24 MB), WhatsApp (15 MB), Email (10 MB), or custom target size.",
    viewId: "view-compress",
  },
  compress_audio: {
    title: "Compress Audio",
    desc: "Reduce audio file sizes for voice notes, podcasts, Discord, WhatsApp, or email attachments with Opus, MP3, and AAC codecs.",
    viewId: "view-compress_audio",
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
  bg_remover: {
    title: "AI Background Remover",
    desc: "Remove background and extract subjects locally using on-device neural segmentation models.",
    viewId: "view-bg_remover",
  },
  ai_upscaler: {
    title: "AI Image Upscaler",
    desc: "Super-resolution deep learning 2x, 3x, 4x image upscaling with edge sharpening and noise reduction.",
    viewId: "view-ai_upscaler",
  },
  vectorizer: {
    title: "Image Vectorizer (SVG)",
    desc: "Convert raster images (PNG, JPG) into clean, scalable vector SVG layers and curves.",
    viewId: "view-vectorizer",
  },
  restore_denoise: {
    title: "Image Restoration & Denoise",
    desc: "Remove photo noise, grain, and blur using Non-Local Means, Bilateral, and Unsharp Mask algorithms.",
    viewId: "view-restore_denoise",
  },
  icon_generator: {
    title: "Icon & Asset Generator",
    desc: "Generate multi-resolution Windows .ico, Apple Touch icons, Android PWA assets, and web favicons.",
    viewId: "view-icon_generator",
  },
  metadata_cleaner: {
    title: "Metadata Viewer & Cleaner",
    desc: "Inspect and strip EXIF tags, GPS coordinates, and camera metadata for photo privacy.",
    viewId: "view-metadata_cleaner",
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
    title: "Download Playlist",
    desc: "Fetch and download complete playlists, video series, channels, or select specific videos to download.",
    viewId: "view-ytdlp_playlist",
  },
  ytdlp_subtitles: {
    title: "Subtitles & Thumbnails",
    desc: "Extract closed captions, auto-generated subtitles, cover thumbnails, and video metadata without re-downloading media.",
    viewId: "view-ytdlp_subtitles",
  },
  settings: {
    title: "Settings & Defaults",
    desc: "Configure default output folders, hardware acceleration engine, encoding threads, and system binaries.",
    viewId: "view-settings",
  },
};

const TOOL_ORDER = [
  "convert",
  "compress",
  "trim",
  "speed_motion",
  "aspect_crop",
  "stabilize",
  "normalize",
  "mute_replace",
  "gif_frames",
  "extract_audio",
  "compress_audio",
  "merge",
  "custom",
  "bg_remover",
  "ai_upscaler",
  "vectorizer",
  "restore_denoise",
  "icon_generator",
  "metadata_cleaner",
  "ytdlp_audio",
  "ytdlp_video",
  "ytdlp_playlist",
  "ytdlp_subtitles",
  "settings",
];

let currentActiveTool = "convert";

export function getCurrentActiveTool() {
  return currentActiveTool;
}

export function updateSidebarIndicator(activeBtn, isSettings = false) {
  const settingsIndicator = document.getElementById("settings-indicator");
  const mobileSettingsIndicator = document.getElementById("mobile-settings-indicator");
  const sidebarIndicator = document.getElementById("sidebar-indicator");

  if (isSettings) {
    if (sidebarIndicator) sidebarIndicator.style.opacity = "0";
    // Desktop footer cell and mobile drawer each get their own pill,
    // measured against the button inside their own nav (hidden navs
    // report zero height, so their pill stays parked invisible).
    const pairs = [
      ["#settings-nav .nav-link", settingsIndicator],
      ["#mobile-settings-nav .nav-link", mobileSettingsIndicator],
    ];
    pairs.forEach(([selector, indicator]) => {
      if (!indicator) return;
      const btn = document.querySelector(selector);
      if (!btn || !btn.offsetHeight) {
        indicator.style.opacity = "0";
        return;
      }
      indicator.style.transform = `translateY(${btn.offsetTop}px)`;
      indicator.style.height = `${btn.offsetHeight}px`;
      indicator.style.opacity = "1";
    });
  } else {
    if (settingsIndicator) settingsIndicator.style.opacity = "0";
    if (mobileSettingsIndicator) mobileSettingsIndicator.style.opacity = "0";
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

export function switchTool(toolId, onToolChanged, autoScroll = false) {
  const isKit = typeof toolId === "string" && toolId.startsWith("kit_");
  let toolTitle = "";
  let toolDesc = "";
  let targetViewId = "";

  if (isKit) {
    const settings = loadSettings();
    if (!settings.enableUserKits) {
      switchTool("convert", onToolChanged);
      return;
    }
    const kitId = toolId.replace("kit_", "");
    const kit = getUserKitById(kitId);
    toolTitle = kit ? kit.name : "User Kit";
    toolDesc = kit ? (kit.description || "Custom scriptable user module.") : "Custom Kit IDE & Scripting workspace.";
    targetViewId = "view-kit_ide";
    if (window.renderActiveKitIde) {
      window.renderActiveKitIde(kitId);
    }
  } else if (TOOL_METADATA[toolId]) {
    toolTitle = TOOL_METADATA[toolId].title;
    toolDesc = TOOL_METADATA[toolId].desc;
    targetViewId = TOOL_METADATA[toolId].viewId;
  } else {
    return;
  }

  if (toolId === currentActiveTool) return;
  if (isJobRunning() && toolId !== "settings") return;

  const prevIndex = TOOL_ORDER.indexOf(currentActiveTool);
  const nextIndex = TOOL_ORDER.indexOf(toolId);
  const movingDown = nextIndex > prevIndex;

  currentActiveTool = toolId;
  saveActiveTool(toolId);

  // Update nav buttons active states across tool-nav, image-ai-nav, ytdlp-nav, user-kits-nav, and settings-nav
  const allToolButtons = document.querySelectorAll("#tool-nav .nav-link, #image-ai-nav .nav-link, #ytdlp-nav .nav-link, #user-kits-nav .nav-link");
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
        if (autoScroll) {
          // Use native center scrolling — respects scroll-padding (sticky header + absolute footer)
          // and works even when offsetTop is relative to a nested <nav>, unlike manual offsetTop math.
          requestAnimationFrame(() => {
            b.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
          });
        }
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

    titleEl.textContent = toolTitle;
    titleEl.title = toolTitle;
    descEl.textContent = toolDesc;
    descEl.title = toolDesc;
    headerContainer.title = `${toolTitle} - ${toolDesc}`;

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

  const targetView = document.getElementById(targetViewId);
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

  // Toggle shared input cards (FFmpeg input file vs Image & AI queue vs yt-dlp URL input vs User Kit)
  const isYtDlp = toolId.startsWith("ytdlp_");
  const isSettings = toolId === "settings";
  const isImageTool = [
    "bg_remover",
    "ai_upscaler",
    "vectorizer",
    "restore_denoise",
    "icon_generator",
    "metadata_cleaner",
  ].includes(toolId);

  const sharedInputCard = document.getElementById("shared-input-card");
  const sharedUrlCard = document.getElementById("shared-url-card");
  const imageAiWorkspaceCard = document.getElementById("image-ai-workspace-card");
  const cmdPreviewCard = document.getElementById("command-preview-card");

  if (sharedInputCard) {
    sharedInputCard.classList.toggle("d-none", isYtDlp || isSettings || isImageTool || isKit);
  }
  if (imageAiWorkspaceCard) {
    imageAiWorkspaceCard.classList.toggle("d-none", !isImageTool || isSettings || isKit);
  }
  if (cmdPreviewCard) {
    cmdPreviewCard.classList.toggle("d-none", isSettings || isImageTool || isKit);
  }

  const aiReplaceSourceWrapper = document.getElementById("ai-replace-source-wrapper");
  if (aiReplaceSourceWrapper) {
    aiReplaceSourceWrapper.classList.toggle("d-none", !isImageTool || isSettings || isKit);
  }

  const singleInputFileWrapper = document.getElementById("single-input-file-wrapper");
  const mergeFilesContainer = document.getElementById("merge-files-container");
  const inputMetaInfo = document.getElementById("input-meta-info");

  if (singleInputFileWrapper) {
    singleInputFileWrapper.classList.toggle("d-none", toolId === "merge" || isYtDlp || isSettings || isImageTool || isKit);
  }
  if (mergeFilesContainer) {
    mergeFilesContainer.classList.toggle("d-none", toolId !== "merge");
  }
  if (inputMetaInfo && toolId === "merge") {
    inputMetaInfo.classList.add("d-none");
  }

  const batchQueueContainer = document.getElementById("batch-queue-container");
  if (batchQueueContainer) {
    batchQueueContainer.classList.toggle("d-none", toolId === "merge" || isYtDlp || isSettings || isImageTool || isKit);
  }
  if (sharedUrlCard) {
    sharedUrlCard.classList.toggle("d-none", !isYtDlp || isSettings || isKit);
    if (isYtDlp) {
      const ytdlpOutInput = document.getElementById("ytdlp-output-dir");
      if (ytdlpOutInput && !ytdlpOutInput.value) {
        ytdlpOutInput.value = getLastYtDlpOutDir() || loadSettings().outputDir || "C:\\Users\\User\\Downloads";
      }
    }
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

  // Bottom-left slot would sit completely empty in Settings view (both
  // action buttons hide there), so the status line shows here and only
  // here — every other view keeps the clean label-free footer.
  const statusSlot = document.getElementById("status-message");
  if (statusSlot) {
    statusSlot.classList.toggle("d-none", toolId !== "settings");
  }

  // Contextual status message for settings
  const statusMsg = document.getElementById("status-message");
  if (statusMsg) {
    const isRunning = btnExecute && btnExecute.textContent === "Cancel";
    if (!isRunning) {
      if (toolId === "settings") {
        statusMsg.textContent = "Settings are saved automatically";
        setTimeout(() => {
          const scrollBox = document.getElementById("executables-scroll-container");
          if (scrollBox) scrollBox.dispatchEvent(new Event("scroll"));
        }, 50);
      } else if (statusMsg.textContent === "Settings are saved automatically") {
        statusMsg.textContent = "Ready";
      }
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

// Material You soft ripple for settings items: a gentle primary wash
// sized to just cover the item from the press point. Skipped entirely
// under reduced motion / no-animations (CSS kills animations globally,
// so a spawned span would otherwise stick around forever).
export function attachMaterialRipple(element) {
  if (!element) return;
  element.addEventListener("mousedown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("no-animations");
    if (reduceMotion) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = Math.max(x, rect.width - x);
    const dy = Math.max(y, rect.height - y);
    const size = Math.ceil(Math.hypot(dx, dy) * 2);

    const ripple = document.createElement("span");
    ripple.className = "m3-ripple";
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    element.appendChild(ripple);
    // animationend removes it at opacity 0; the timeout is a backstop so
    // a missed event (hidden tab, toggled animations) can never leave a
    // visible wash stuck on the row.
    let gone = false;
    const remove = () => {
      if (gone) return;
      gone = true;
      ripple.remove();
    };
    ripple.addEventListener("animationend", remove);
    setTimeout(remove, 700);
  });
}

export function attachFluentRipple(element) {
  if (!element) return;
  element.addEventListener("mousedown", (e) => {
    // If click is on a child button or control, ignore to prevent duplicate ripples
    const rect = element.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const size = Math.max(rect.width, rect.height) * 1.5;

    const ripple = document.createElement("span");
    ripple.className = "fluent-ripple";
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    element.appendChild(ripple);
    ripple.addEventListener("animationend", () => {
      ripple.remove();
    });
  });
}

// Smoothly morph a queue container across a re-render (empty drop card <->
// populated list) instead of snapping, using compositor-only properties
// (opacity, clip-path, transform) — never height/width, so no per-frame
// page reflow and no stutter under the frosted overlays.
// The old content fades out, swaps mid-flight, then the new content blooms
// in with a top-down clip reveal + rise. Same-state updates (row add/remove,
// status flips) render instantly so batch progress never flickers.
// Usage: animateQueueHeight(listEl, () => { ...existing render body... }).
export function animateQueueHeight(container, renderFn) {
  if (typeof renderFn !== "function") return;
  if (!container) {
    renderFn();
    return;
  }
  // Snap-finish any in-flight morph so rapid updates never stack.
  if (container._qhCleanup) {
    const fin = container._qhCleanup;
    container._qhCleanup = null;
    fin();
  }

  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("no-animations");
  if (reduceMotion || !container.offsetHeight) {
    renderFn();
    return;
  }

  const isEmptyCard = () => !!container.querySelector('[id$="-empty-msg"]');
  const wasEmpty = isEmptyCard();

  let finished = false;
  let phaseTimer = 0;
  const restore = () => {
    container.style.opacity = "";
    container.style.clipPath = "";
    container.style.transform = "";
    container.style.pointerEvents = "";
    container.style.transition = "";
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(phaseTimer);
    container.removeEventListener("transitionend", onRevealEnd);
    restore();
    if (container._qhCleanup === finish) container._qhCleanup = null;
  };
  container._qhCleanup = finish;

  // Same-state refresh: render plainly, no motion at all.
  renderFn();
  const stillEmpty = isEmptyCard();
  if (wasEmpty === stillEmpty) {
    finish();
    return;
  }

  // Emptiness flipped: everything above ran synchronously, so no paint
  // happened yet — arm the hidden pre-state, then bloom the fresh content
  // in with a clip reveal + rise. One clean entrance, no double flash.
  const endH = container.offsetHeight;
  container.style.pointerEvents = "none";
  container.style.opacity = "0";
  container.style.transform = "translateY(var(--distance-base))";
  if (endH > 0) container.style.clipPath = `inset(0 0 ${endH}px 0)`;
  // Commit the hidden pre-state before arming the transition.
  void container.offsetHeight;
  // Entrance: reveal (--duration-slow, resize/panel-open lane) with a
  // quicker fade + rise (--duration-fast) layered over it.
  container.style.transition =
    "clip-path var(--duration-slow) var(--ease-smooth-out), opacity var(--duration-fast) var(--ease-smooth-out), transform var(--duration-fast) var(--ease-smooth-out)";
  container.style.clipPath = "inset(0 0 0px 0)";
  container.style.opacity = "1";
  container.style.transform = "translateY(0)";
  container.addEventListener("transitionend", onRevealEnd);
  phaseTimer = setTimeout(finish, 600);

  function onRevealEnd(e) {
    if (!e || e.target !== container) return;
    if (e.propertyName === "clip-path") finish();
  }
}

// Bind edge hover proximity and ripple effects to any sidebar button
export function setupSidebarButtonEffects(btn, onToolChanged) {

  if (!btn || btn.dataset.effectsBound === "true") return;
  btn.dataset.effectsBound = "true";

  btn.addEventListener("mousemove", (e) => {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    btn.style.setProperty("--mouse-x", `${x}px`);
    btn.style.setProperty("--mouse-y", `${y}px`);
  });

  attachFluentRipple(btn);

  if (onToolChanged && btn.dataset.tool) {
    btn.addEventListener("click", () => {
      const tool = btn.dataset.tool;
      switchTool(tool, onToolChanged);
    });
  }
}

// Shared bottom-sheet drag-to-dismiss core (small screens only): pull down
// past ~100px (or flick) to dismiss, otherwise spring back. Plain taps and
// clicks pass through untouched. The dialog's own show-state transition
// does the motion; inline styles only carry the live finger offset.
function attachSheetDrag(modalEl, handle) {
  const dialog = modalEl.querySelector(".modal-dialog");
  if (!dialog || !handle) return;
  const isMobileSheet = () => window.matchMedia("(max-width: 768px)").matches;

  let dragging = false;
  let moved = false;
  let startY = 0;
  let dy = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;

  handle.addEventListener("pointerdown", (e) => {
    if (!isMobileSheet()) return;
    if (!modalEl.classList.contains("show")) return;
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    moved = false;
    dy = 0;
    velocity = 0;
    startY = e.clientY;
    lastY = e.clientY;
    lastT = e.timeStamp;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch (_) {}
  });

  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dt = Math.max(1, e.timeStamp - lastT);
    velocity = 0.8 * ((e.clientY - lastY) / dt) + 0.2 * velocity;
    lastY = e.clientY;
    lastT = e.timeStamp;
    dy = Math.max(0, e.clientY - startY);
    if (Math.abs(e.clientY - startY) > 8) moved = true;
    if (dy > 0) {
      // Important-flagged: the sheet's own transitions/transforms are
      // !important, so plain inline styles would lose and the sheet
      // would only animate after release instead of tracking live.
      dialog.style.setProperty("transition", "none", "important");
      dialog.style.setProperty("transform", `translateY(${dy}px)`, "important");
    }
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try {
      if (handle.releasePointerCapture && e.pointerId !== undefined) handle.releasePointerCapture(e.pointerId);
    } catch (_) {}
    if (moved) {
      // Swallow the tap that would otherwise hit sheet buttons after a drag.
      handle.addEventListener(
        "click",
        (ce) => {
          ce.preventDefault();
          ce.stopPropagation();
        },
        { capture: true, once: true },
      );
    }
    if ((dy > 100 || velocity > 0.55) && isMobileSheet() && window.bootstrap?.Modal) {
      // Dismiss first (Bootstrap swaps to the slide-down close state),
      // then release the inline offset so it glides from the finger
      // position instead of snapping.
      window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
      requestAnimationFrame(() => {
        dialog.style.removeProperty("transition");
        dialog.style.removeProperty("transform");
      });
    } else {
      // Spring back via the sheet's own show-state transition.
      dialog.style.removeProperty("transition");
      dialog.style.removeProperty("transform");
    }
  };
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
}

// Mobile bottom-sheet drag for the About dialog (whole sheet is the
// handle: it has no scrollable body to protect).
export function initCreditsSheetDrag() {
  const modalEl = document.getElementById("credits-modal");
  if (!modalEl || modalEl.dataset.sheetDragBound === "true") return;
  const sheet = modalEl.querySelector(".about-dialog-content");
  if (!sheet) return;
  modalEl.dataset.sheetDragBound = "true";
  attachSheetDrag(modalEl, sheet);
}

// Mobile bottom-sheet drag for the Manage Tools dialog. Only the header is
// the handle so the tall body keeps its native touch scroll.
export function initManageSheetDrag() {
  const modalEl = document.getElementById("manage-tools-modal");
  if (!modalEl || modalEl.dataset.sheetDragBound === "true") return;
  const header = modalEl.querySelector(".modal-header");
  if (!header) return;
  modalEl.dataset.sheetDragBound = "true";
  attachSheetDrag(modalEl, header);
}

export function initNavigation(onToolChanged) {
  const allToolButtons = document.querySelectorAll("button[data-tool]");
  const btnToggle = document.getElementById("btn-sidebar-toggle");
  const backdrop = document.getElementById("sidebar-backdrop");

  // Mobile drawer toggle. The hamburger is a real <button> (hits always land
  // on it, keyboard works natively, and the window-drag exclusion matches
  // `button` unconditionally). The whole brand cell also toggles, strictly
  // gated to small widths so desktop is unaffected. Button handler stops
  // propagation so the two never double-fire (open+close = looks dead).
  const isSmallWidth = () => window.innerWidth <= 768;
  const mobileMenuBtn = document.getElementById("btn-mobile-menu");
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMobileSidebar();
    });
  }
  if (btnToggle) {
    btnToggle.addEventListener("click", (e) => {
      if (!isSmallWidth()) return;
      // Button already handled it (and stopped propagation); this catches
      // clicks that land on the title/padding around the button instead.
      toggleMobileSidebar();
    });
  }

  const brandCol = document.querySelector(".header-brand-col") || btnToggle;
  if (brandCol) {
    let lastScrollTime = 0;
    brandCol.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const now = performance.now();
        if (now - lastScrollTime < 25) return;
        lastScrollTime = now;

        const curIdx = TOOL_ORDER.indexOf(currentActiveTool);
        if (curIdx === -1) return;

        if (e.deltaY > 0 || e.deltaX > 0) {
          // Scroll down -> Next tool
          const nextIdx = (curIdx + 1) % TOOL_ORDER.length;
          switchTool(TOOL_ORDER[nextIdx], onToolChanged, true);
        } else if (e.deltaY < 0 || e.deltaX < 0) {
          // Scroll up -> Previous tool
          const prevIdx = (curIdx - 1 + TOOL_ORDER.length) % TOOL_ORDER.length;
          switchTool(TOOL_ORDER[prevIdx], onToolChanged, true);
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
    setupSidebarButtonEffects(btn, onToolChanged);
  });

  // Desktop footer settings cell reveals only while the sidebar is
  // hovered (slides up from below on a slow iOS curve, collapses away).
  const mainSidebar = document.getElementById("main-sidebar");
  const footerSettingsCol = document.getElementById("footer-settings-col");
  if (mainSidebar && footerSettingsCol) {
    mainSidebar.addEventListener("mouseenter", () => {
      footerSettingsCol.classList.remove("settings-cell-parked");
    });
    mainSidebar.addEventListener("mouseleave", () => {
      footerSettingsCol.classList.add("settings-cell-parked");
    });
  }

  // Material You soft ripples on the Settings page list rows (the
  // clickable toggle rows). Guarded so a second init never double-binds.
  document.querySelectorAll("#view-settings .settings-row.clickable").forEach((row) => {
    if (row.dataset.m3RippleBound === "true") return;
    row.dataset.m3RippleBound = "true";
    attachMaterialRipple(row);
  });

  // About + Manage Tools bottom-sheet drag-to-dismiss (guarded inside).
  try {
    initCreditsSheetDrag();
    initManageSheetDrag();
  } catch (err) {
    console.warn("sheet drag init failed:", err);
  }

  // Drop every dialog out of the 3D animation scene once open (see
  // .modal-settled in styles.css): the entrance/exit keeps its perspective
  // tilt, but at rest the dialog renders flat so backdrop-filter works.
  document.addEventListener("shown.bs.modal", (e) => {
    if (e.target && e.target.classList) e.target.classList.add("modal-settled");
  });
  document.addEventListener("hide.bs.modal", (e) => {
    if (e.target && e.target.classList) e.target.classList.remove("modal-settled");
  });

  // Container-level proximity border tracking across adjacent sidebar items (dynamic)
  const sidebarPanel = document.getElementById("sidebar-scroll-container");
  if (sidebarPanel) {
    sidebarPanel.addEventListener("mousemove", (e) => {
      const proximityThreshold = 80;
      const currentNavButtons = sidebarPanel.querySelectorAll(".nav-link");
      currentNavButtons.forEach((btn) => {
        const rect = btn.getBoundingClientRect();
        const withinX = e.clientX >= rect.left - proximityThreshold && e.clientX <= rect.right + proximityThreshold;
        const withinY = e.clientY >= rect.top - proximityThreshold && e.clientY <= rect.bottom + proximityThreshold;

        if (withinX && withinY) {
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          btn.style.setProperty("--mouse-x", `${x}px`);
          btn.style.setProperty("--mouse-y", `${y}px`);
          btn.classList.add("has-proximity");
        } else {
          btn.classList.remove("has-proximity");
        }
      });
    });

    sidebarPanel.addEventListener("mouseleave", () => {
      const currentNavButtons = sidebarPanel.querySelectorAll(".nav-link");
      currentNavButtons.forEach((btn) => {
        btn.classList.remove("has-proximity");
      });
    });
  }

  const scrollContainer = document.getElementById("sidebar-scroll-container");
  if (scrollContainer) {
    scrollContainer.addEventListener("scroll", () => {
      const activeBtn = document.querySelector("#sidebar-scroll-container .nav-link.active");
      if (activeBtn) {
        updateSidebarIndicator(activeBtn, false);
      }
      updateStickyHeaders();
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
    updateStickyHeaders();
  });

  // Expose global switcher for custom modules like kits
  window.switchAppTool = (toolId) => switchTool(toolId, onToolChanged);

  // Restore saved active tool on startup
  const savedTool = getSavedActiveTool("convert");
  currentActiveTool = ""; // reset to trigger clean initial load
  switchTool(savedTool, onToolChanged);
  updateStickyHeaders();
}

export function updateStickyHeaders() {
  const scrollContainer = document.getElementById("sidebar-scroll-container");
  if (!scrollContainer) return;
  const containerTop = scrollContainer.getBoundingClientRect().top;
  const sectionHeaders = scrollContainer.querySelectorAll(".sidebar-section-header");
  const isAtTop = scrollContainer.scrollTop <= 4;
  let anyStuck = false;

  sectionHeaders.forEach((header) => {
    if (!header.querySelector(".sidebar-section-header-bg")) {
      const bg = document.createElement("div");
      bg.className = "sidebar-section-header-bg";
      bg.setAttribute("aria-hidden", "true");
      header.prepend(bg);
    }
    const rect = header.getBoundingClientRect();
    const isStuck = !isAtTop && rect.top <= containerTop + 2;
    if (isStuck) anyStuck = true;
    header.classList.toggle("is-stuck", isStuck);
  });

  const brandCol = document.querySelector(".header-brand-col");
  if (brandCol) {
    brandCol.classList.toggle("has-stuck-header", anyStuck);
  }
}
