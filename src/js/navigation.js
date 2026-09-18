// Navigation & View Transitions Module
import { saveActiveTool, getSavedActiveTool, getLastYtDlpOutDir, loadSettings, getUserKitById } from "./storage.js";
import { isJobRunning } from "./runner.js";
import { cancelAudioMetadataLoading } from "./audio_tags.js";

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
  audio_tags: {
    title: "Audio Tag & Metadata Editor",
    desc: "Edit ID3 tags (title, artist, album, genre, year, track number) and embed custom cover artwork into MP3, M4A, FLAC, and OGG files.",
    viewId: "view-audio_tags",
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
  "ytdlp_audio",
  "ytdlp_video",
  "ytdlp_playlist",
  "ytdlp_subtitles",
  "convert",
  "compress",
  "trim",
  "speed_motion",
  "aspect_crop",
  "stabilize",
  "loop_duration",
  "normalize",
  "mute_replace",
  "gif_frames",
  "extract_audio",
  "compress_audio",
  "audio_tags",
  "merge",
  "custom",
  "bg_remover",
  "ai_upscaler",
  "vectorizer",
  "restore_denoise",
  "icon_generator",
  "metadata_cleaner",
  "settings",
];

let currentActiveTool = "convert";
let currentActiveViewEl = null;

export function getCurrentActiveTool() {
  return currentActiveTool;
}

export function updateSidebarIndicator(activeBtn) {
  const sidebarIndicator = document.getElementById("sidebar-indicator");
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

export function switchTool(toolId, onToolChanged, autoScroll = false, instantScroll = false) {
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

  if (currentActiveTool === "audio_tags" && toolId !== "audio_tags") {
    cancelAudioMetadataLoading();
  }

  const prevIndex = TOOL_ORDER.indexOf(currentActiveTool);
  const nextIndex = TOOL_ORDER.indexOf(toolId);
  const movingDown = nextIndex > prevIndex;

  currentActiveTool = toolId;
  document.body.dataset.activeTool = toolId;
  saveActiveTool(toolId);

  // Update nav buttons active states across tool-nav, image-ai-nav, ytdlp-nav, user-kits-nav, and settings-nav
  const allToolButtons = document.querySelectorAll(
    "#tool-nav .nav-link, #image-ai-nav .nav-link, #ytdlp-nav .nav-link, #user-kits-nav .nav-link, #settings-nav .nav-link"
  );

  let activeNavBtn = null;
  allToolButtons.forEach((b) => {
    if (b.dataset.tool === toolId) {
      b.classList.add("active");
      activeNavBtn = b;
    } else {
      b.classList.remove("active");
    }
  });

  if (activeNavBtn) {
    updateSidebarIndicator(activeNavBtn);
    if (autoScroll) {
      // Wheel navigation passes instantScroll: queued "smooth" scrolls pile
      // up and fight each other under high-rate wheels, freezing the UI.
      // Instant scrolling just jumps, so rapid steps never queue animations.
      const behavior = instantScroll ? "auto" : "smooth";
      requestAnimationFrame(() => {
        activeNavBtn.scrollIntoView({ behavior, block: "center", inline: "nearest" });
      });
    }
  }

  // Header directional slide
  const headerContainer = document.getElementById("tool-header-text");
  const titleEl = document.getElementById("current-tool-title");
  const descEl = document.getElementById("current-tool-desc");

  if (headerContainer && titleEl && descEl) {
    headerContainer.classList.remove("slide-from-bottom", "slide-from-top");

    titleEl.textContent = toolTitle;
    titleEl.title = toolTitle;
    descEl.textContent = toolDesc;
    descEl.title = toolDesc;
    headerContainer.title = `${toolTitle} - ${toolDesc}`;

    const animClass = movingDown ? "slide-from-bottom" : "slide-from-top";
    void headerContainer.offsetWidth;
    headerContainer.classList.add(animClass);
  }

  // Main workspace views: hide previous view directly, show target view
  if (currentActiveViewEl && currentActiveViewEl.id !== targetViewId) {
    currentActiveViewEl.classList.add("d-none");
  } else {
    const toolViews = document.querySelectorAll(".tool-view");
    toolViews.forEach((view) => {
      if (view.id !== targetViewId) view.classList.add("d-none");
    });
  }

  const targetView = document.getElementById(targetViewId);
  if (targetView) {
    targetView.classList.remove("d-none");
    currentActiveViewEl = targetView;
  }

  // Workspace material zoom animation
  const workspaceContainer = document.getElementById("tool-view-container");
  if (workspaceContainer) {
    workspaceContainer.classList.remove("view-material-zoom");
    void workspaceContainer.offsetWidth;
    workspaceContainer.classList.add("view-material-zoom");
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
  const isAudioTags = toolId === "audio_tags";

  const sharedInputCard = document.getElementById("shared-input-card");
  const sharedUrlCard = document.getElementById("shared-url-card");
  const imageAiWorkspaceCard = document.getElementById("image-ai-workspace-card");
  const cmdPreviewCard = document.getElementById("command-preview-card");

  if (sharedInputCard) {
    sharedInputCard.classList.toggle("d-none", isYtDlp || isSettings || isImageTool || isKit || isAudioTags);
  }
  if (imageAiWorkspaceCard) {
    imageAiWorkspaceCard.classList.toggle("d-none", !isImageTool || isSettings || isKit);
  }
  if (cmdPreviewCard) {
    cmdPreviewCard.classList.toggle("d-none", isSettings || isImageTool || isKit || isAudioTags);
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

  // Do not show footer in settings page
  const bottomFooterBar = document.getElementById("bottom-footer-bar");
  if (bottomFooterBar) {
    bottomFooterBar.classList.toggle("d-none", toolId === "settings");
  }

  const statusSlot = document.getElementById("status-message");
  if (statusSlot) {
    statusSlot.classList.toggle("d-none", toolId === "settings" || isImageTool || isAudioTags);
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
      } else if (isImageTool) {
        statusMsg.textContent = "";
      } else if (statusMsg.textContent === "Settings are saved automatically" || statusMsg.textContent === "Ready") {
        statusMsg.textContent = "";
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
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("no-animations");
    if (reduceMotion) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
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
    // animationend removes it at opacity 0; the timeout is a backstop so a
    // missed event (hidden tab, toggled animations) can never accumulate
    // compositor layers and wedge the UI.
    let gone = false;
    const remove = () => {
      if (gone) return;
      gone = true;
      ripple.remove();
    };
    ripple.addEventListener("animationend", remove);
    setTimeout(remove, 2100);
  });
}

// Smoothly morph a queue container across a re-render (empty drop card <->
// populated list) instead of snapping, using compositor-only properties
// (opacity, clip-path, transform) — never height/width, so no per-frame
// page reflow and no stutter under the frosted overlays.
// The old content fades out, swaps mid-flight, then the new content blooms
// Real box morph: crossfades between start box and end box while interpolating
// their size (width, height), position (x, y), and corner radius.
// Same-state updates (row add/remove, status flips) render instantly.
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

  // Snapshot the starting visual box before renderFn runs
  const startChild = container.firstElementChild;
  const startTarget = startChild || container;
  const startRect = startTarget.getBoundingClientRect();
  const startStyle = window.getComputedStyle(startTarget);
  const startRadius = startStyle.borderRadius || "6px";
  const startW = startRect.width;
  const startH = startRect.height;
  const startLeft = startRect.left;
  const startTop = startRect.top;

  let cloneA = null;
  if (startChild) {
    cloneA = startChild.cloneNode(true);
    cloneA.removeAttribute("id");
    cloneA.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    cloneA.querySelectorAll(".audio-queue-drag-overlay").forEach((el) => el.remove());
    if (startChild.scrollTop) {
      cloneA.scrollTop = startChild.scrollTop;
    }
  }

  // Execute the synchronous DOM render
  renderFn();

  const stillEmpty = isEmptyCard();
  if (wasEmpty === stillEmpty || !cloneA) {
    // Same-state refresh: render plainly, no box morph
    return;
  }

  const endChild = container.firstElementChild;
  if (!endChild) return;

  const endRect = endChild.getBoundingClientRect();
  const endStyle = window.getComputedStyle(endChild);
  const endRadius = endStyle.borderRadius || "6px";
  const endW = endRect.width;
  const endH = endRect.height;
  const endLeft = endRect.left;
  const endTop = endRect.top;

  if (startW <= 0 || startH <= 0 || endW <= 0 || endH <= 0) {
    return;
  }

  const deltaX = startLeft - endLeft;
  const deltaY = startTop - endTop;

  // Retrieve motion tokens with safe fallbacks
  const computedRoot = window.getComputedStyle(document.documentElement);
  const durationStr = computedRoot.getPropertyValue("--duration-medium").trim();
  const duration = durationStr.endsWith("ms")
    ? parseFloat(durationStr)
    : (durationStr.endsWith("s") ? parseFloat(durationStr) * 1000 : 350);
  const easing =
    computedRoot.getPropertyValue("--ease-smooth-out").trim() ||
    "cubic-bezier(0.22, 1, 0.36, 1)";

  // Morph shell wrapper handles bounding box size, position, radius and clipping
  const morphShell = document.createElement("div");
  morphShell.className = "queue-box-morph-shell";
  morphShell.style.position = "relative";
  morphShell.style.boxSizing = "border-box";
  morphShell.style.overflow = "hidden";
  morphShell.style.pointerEvents = "none";
  morphShell.style.width = `${startW}px`;
  morphShell.style.height = `${startH}px`;
  morphShell.style.borderRadius = startRadius;
  morphShell.style.transformOrigin = "top left";
  morphShell.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
  morphShell.style.willChange = "width, height, transform, border-radius";
  morphShell.style.backgroundColor =
    endStyle.backgroundColor || startStyle.backgroundColor || "var(--bs-tertiary-bg)";

  // Lock container height to interpolate smoothly so adjacent elements glide
  container.style.position = "relative";
  container.style.overflow = "hidden";
  container.style.height = `${startH}px`;
  container.style.willChange = "height";

  // Configure start box clone (Layer A)
  cloneA.style.position = "absolute";
  cloneA.style.top = "0";
  cloneA.style.left = "0";
  cloneA.style.width = "100%";
  cloneA.style.height = "100%";
  cloneA.style.margin = "0";
  cloneA.style.maxHeight = "none";
  cloneA.style.overflow = "hidden";
  cloneA.style.boxSizing = "border-box";
  cloneA.style.pointerEvents = "none";
  cloneA.style.willChange = "opacity";
  cloneA.style.zIndex = "1";
  cloneA.style.borderRadius = startRadius;

  // Configure end box element (Layer B)
  endChild.style.position = "absolute";
  endChild.style.top = "0";
  endChild.style.left = "0";
  endChild.style.width = "100%";
  endChild.style.height = "100%";
  endChild.style.margin = "0";
  endChild.style.maxHeight = "none";
  endChild.style.overflow = "hidden";
  endChild.style.boxSizing = "border-box";
  endChild.style.pointerEvents = "none";
  endChild.style.willChange = "opacity";
  endChild.style.zIndex = "2";
  endChild.style.opacity = "0";
  endChild.style.borderRadius = endRadius;

  // Assemble inside container
  container.insertBefore(morphShell, endChild);
  morphShell.appendChild(cloneA);
  morphShell.appendChild(endChild);

  let finished = false;
  let safetyTimer = 0;

  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(safetyTimer);

    try {
      containerAnim?.cancel?.();
      shellAnim?.cancel?.();
      cloneAnim?.cancel?.();
      endAnim?.cancel?.();
    } catch (_) {}

    if (morphShell.parentNode === container) {
      container.insertBefore(endChild, morphShell);
      morphShell.remove();
    }
    cloneA.remove();

    endChild.style.position = "";
    endChild.style.top = "";
    endChild.style.left = "";
    endChild.style.width = "";
    endChild.style.height = "";
    endChild.style.margin = "";
    endChild.style.maxHeight = "";
    endChild.style.overflow = "";
    endChild.style.boxSizing = "";
    endChild.style.pointerEvents = "";
    endChild.style.willChange = "";
    endChild.style.zIndex = "";
    endChild.style.opacity = "";
    endChild.style.borderRadius = "";

    container.style.position = "";
    container.style.overflow = "";
    container.style.height = "";
    container.style.willChange = "";

    if (container._qhCleanup === finish) {
      container._qhCleanup = null;
    }
  };

  container._qhCleanup = finish;

  // Animate bounding boxes, positions, corner radiuses, and crossfading opacities
  const containerAnim = container.animate(
    [
      { height: `${startH}px` },
      { height: `${endH}px` }
    ],
    { duration, easing, fill: "forwards" }
  );

  const shellAnim = morphShell.animate(
    [
      {
        width: `${startW}px`,
        height: `${startH}px`,
        transform: `translate(${deltaX}px, ${deltaY}px)`,
        borderRadius: startRadius
      },
      {
        width: `${endW}px`,
        height: `${endH}px`,
        transform: "translate(0px, 0px)",
        borderRadius: endRadius
      }
    ],
    { duration, easing, fill: "forwards" }
  );

  const cloneAnim = cloneA.animate(
    [
      { opacity: 1 },
      { opacity: 0 }
    ],
    { duration, easing, fill: "forwards" }
  );

  const endAnim = endChild.animate(
    [
      { opacity: 0 },
      { opacity: 1 }
    ],
    { duration, easing, fill: "forwards" }
  );

  shellAnim.onfinish = finish;
  safetyTimer = setTimeout(finish, duration + 100);
}

// Bind edge hover proximity and ripple effects to any sidebar button
export function setupSidebarButtonEffects(btn, onToolChanged) {
  if (!btn || btn.dataset.effectsBound === "true") return;
  btn.dataset.effectsBound = "true";

  let btnRect = null;
  btn.addEventListener("mouseenter", () => {
    btnRect = btn.getBoundingClientRect();
  });
  btn.addEventListener("mousemove", (e) => {
    if (!btnRect) btnRect = btn.getBoundingClientRect();
    const x = e.clientX - btnRect.left;
    const y = e.clientY - btnRect.top;
    btn.style.setProperty("--mouse-x", `${x}px`);
    btn.style.setProperty("--mouse-y", `${y}px`);
  });
  btn.addEventListener("mouseleave", () => {
    btnRect = null;
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
  const header = modalEl.querySelector(".sheet-header, .modal-header");
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
    // Notch-coalesced wheel stepping (no time throttle, so the first input
    // acts immediately). Raw wheel ticks are accumulated and one tool step
    // fires per ~notch of travel: high-resolution / inertia wheels collapse
    // to the intended steps instead of dozens of switches, and leftover
    // fractions decay so slow drifts never trigger phantom steps.
    const WHEEL_STEP_PX = 120;
    const WHEEL_IDLE_RESET_MS = 150;
    let wheelAccum = 0;
    let wheelIdleTimer = null;
    const stepTool = (dir) => {
      const curIdx = TOOL_ORDER.indexOf(currentActiveTool);
      if (curIdx === -1) return;
      const nextIdx = (curIdx + dir + TOOL_ORDER.length) % TOOL_ORDER.length;
      switchTool(TOOL_ORDER[nextIdx], onToolChanged, true, true);
    };
    brandCol.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        // Dominant axis only; line-mode deltas (Firefox) scaled to ~px.
        const unit = e.deltaMode === 1 ? 40 : 1;
        const d =
          Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        wheelAccum += d * unit;

        while (Math.abs(wheelAccum) >= WHEEL_STEP_PX) {
          const dir = wheelAccum > 0 ? 1 : -1;
          wheelAccum -= dir * WHEEL_STEP_PX;
          stepTool(dir);
        }

        clearTimeout(wheelIdleTimer);
        wheelIdleTimer = setTimeout(() => {
          wheelAccum = 0;
        }, WHEEL_IDLE_RESET_MS);
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

  // Container-level proximity border tracking across adjacent sidebar items (rAF throttled with cached rects)
  const sidebarPanel = document.getElementById("sidebar-scroll-container");
  if (sidebarPanel) {
    let proximityRaf = null;
    let cachedButtons = null;

    const refreshCachedRects = () => {
      if (!sidebarPanel) return;
      const btns = sidebarPanel.querySelectorAll(".nav-link");
      cachedButtons = Array.from(btns).map((btn) => ({
        btn,
        rect: btn.getBoundingClientRect(),
      }));
    };

    sidebarPanel.addEventListener("mouseenter", refreshCachedRects);
    sidebarPanel.addEventListener("scroll", refreshCachedRects, { passive: true });

    sidebarPanel.addEventListener("mousemove", (e) => {
      if (proximityRaf) return;
      const clientX = e.clientX;
      const clientY = e.clientY;
      proximityRaf = requestAnimationFrame(() => {
        proximityRaf = null;
        if (!cachedButtons) refreshCachedRects();
        const proximityThreshold = 60;

        for (let i = 0; i < cachedButtons.length; i++) {
          const item = cachedButtons[i];
          const rect = item.rect;
          const withinX = clientX >= rect.left - proximityThreshold && clientX <= rect.right + proximityThreshold;
          const withinY = clientY >= rect.top - proximityThreshold && clientY <= rect.bottom + proximityThreshold;

          if (withinX && withinY) {
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            item.btn.style.setProperty("--mouse-x", `${x}px`);
            item.btn.style.setProperty("--mouse-y", `${y}px`);
            item.btn.classList.add("has-proximity");
          } else {
            if (item.btn.classList.contains("has-proximity")) {
              item.btn.classList.remove("has-proximity");
            }
          }
        }
      });
    });

    sidebarPanel.addEventListener("mouseleave", () => {
      if (proximityRaf) {
        cancelAnimationFrame(proximityRaf);
        proximityRaf = null;
      }
      cachedButtons = null;
      const currentNavButtons = sidebarPanel.querySelectorAll(".nav-link.has-proximity");
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
        updateSidebarIndicator(activeBtn);
      }
      updateStickyHeaders();
    });
  }

  window.addEventListener("resize", () => {
    const activeBtn = document.querySelector("#sidebar-scroll-container .nav-link.active");
    if (activeBtn) {
      updateSidebarIndicator(activeBtn);
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
    const isStuck = !isAtTop && rect.top <= containerTop + 2 && rect.bottom > containerTop;
    if (isStuck) anyStuck = true;
    header.classList.toggle("is-stuck", isStuck);
  });

  const brandCol = document.querySelector(".header-brand-col");
  if (brandCol) {
    brandCol.classList.toggle("has-stuck-header", anyStuck);
  }
}
