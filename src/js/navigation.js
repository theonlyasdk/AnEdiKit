// Navigation & View Transitions Module
import { saveActiveTool, getSavedActiveTool, getLastYtDlpOutDir, loadSettings, getUserKitById, STORAGE_KEYS } from "./storage.js";
import { isJobRunning } from "./runner.js";
import { PDF_CATEGORIES, renderTool, getCategoryToolIdForPdfTool } from "./pdf_tools.js";
import { saveActiveModuleState } from "./module_state.js";
import { attachMaterialRipple, attachFluentRipple, animateQueueHeight } from "./anim.js";

// Re-exported for backward compatibility (queue modules imported these here).
export { attachMaterialRipple, attachFluentRipple, animateQueueHeight };
import { TOOL_METADATA, TOOL_ORDER } from "./tool_metadata.js";
import { toolState, getCurrentActiveTool as getActiveToolFromStore } from "./active_tool.js";
import { isLazyView, loadView } from "./view_loader.js";

import { reportError } from "./errors.js";
// Re-exported for backward compatibility (contract.test.js imports from here).
export { TOOL_METADATA, TOOL_ORDER };

// TOOL_METADATA + TOOL_ORDER live in tool_metadata.js (imported above).


const ALL_PDF_TOOLS = PDF_CATEGORIES.flatMap((category) =>
  category.tools.map(([name, description, icon]) => ({
    id: `pdf_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    title: name,
    desc: description,
    icon: icon,
    isPdf: true,
    pdfToolName: name,
  }))
);

const ALL_TOOLS_GROUPS = [
  { title: "Media", icon: "videocam-outline", tools: ["convert", "extract_audio", "trim", "speed_motion", "aspect_crop", "stabilize", "loop_duration", "normalize", "compress", "compress_audio", "merge", "mute_replace", "gif_frames", "custom"] },
  { title: "Audio & Metadata", icon: "musical-notes-outline", tools: ["audio_tags"] },
  { title: "Image AI", icon: "sparkles-outline", tools: ["bg_remover", "ai_upscaler", "vectorizer", "restore_denoise", "icon_generator", "metadata_cleaner"] },
  { title: "Downloads", icon: "download-outline", tools: ["ytdlp_video", "ytdlp_audio", "ytdlp_playlist", "ytdlp_subtitles"] },
  { title: "PDF Tools", icon: "document-text-outline", tools: ALL_PDF_TOOLS },
  { title: "App", icon: "settings-outline", tools: ["settings"] },
];

// Active-tool value lives in active_tool.js (toolState.current, init "convert").
let currentActiveViewEl = null;

function initAllToolsBrowser(onToolChanged) {
  const results = document.getElementById("all-tools-results");
  const search = document.getElementById("all-tools-search");
  const searchGroup = document.getElementById("all-tools-search-group");
  const empty = document.getElementById("all-tools-empty");
  if (!results || !search) return;
  const icons = {
    convert: "swap-horizontal-outline",
    extract_audio: "musical-note-outline",
    trim: "cut-outline",
    speed_motion: "speedometer-outline",
    aspect_crop: "crop-outline",
    stabilize: "shield-checkmark-outline",
    loop_duration: "repeat-outline",
    normalize: "stats-chart-outline",
    compress: "resize-outline",
    compress_audio: "volume-low-outline",
    merge: "git-merge-outline",
    mute_replace: "volume-mute-outline",
    gif_frames: "film-outline",
    custom: "code-slash-outline",
    audio_tags: "pricetag-outline",
    bg_remover: "color-wand-outline",
    ai_upscaler: "scan-outline",
    vectorizer: "git-branch-outline",
    restore_denoise: "sparkles-outline",
    icon_generator: "apps-outline",
    metadata_cleaner: "finger-print-outline",
    ytdlp_video: "cloud-download-outline",
    ytdlp_audio: "musical-notes-outline",
    ytdlp_playlist: "list-outline",
    ytdlp_subtitles: "image-outline",
    pdf: "document-text-outline",
    settings: "settings-outline"
  };
  const render = () => {
    const query = search.value.trim().toLowerCase();
    searchGroup?.classList.toggle("is-expanded", Boolean(query));
    let visible = 0;
    results.replaceChildren();
    ALL_TOOLS_GROUPS.forEach((group) => {
      const items = group.tools
        .map((tool) => {
          if (typeof tool === "string") {
            const metadata = TOOL_METADATA[tool];
            if (!metadata) return null;
            return {
              id: tool,
              title: metadata.title,
              desc: metadata.desc,
              icon: icons[tool] || "ellipse-outline",
              isPdf: false,
            };
          }
          return tool;
        })
        .filter((item) => {
          if (!item) return false;
          return !query || `${item.title} ${item.desc} ${group.title}`.toLowerCase().includes(query);
        });
      if (!items.length) return;
      visible += items.length;
      const section = document.createElement("section");
      section.className = "mb-4";
      const heading = document.createElement("div");
      heading.className = "section-divider-header mb-3";
      heading.innerHTML = `<span class="d-inline-flex align-items-center gap-2"><ion-icon name="${group.icon}" class="text-primary fs-5 flex-shrink-0"></ion-icon><span class="h5 mb-0 fw-medium text-body">${group.title}</span></span>`;
      section.appendChild(heading);
      const grid = document.createElement("div");
      grid.className = "row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3";
      items.forEach((item) => {
        const column = document.createElement("div");
        column.className = "col";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-outline-secondary text-start w-100 h-100 p-3 all-tool-card";
        button.dataset.allTool = item.id;
        button.innerHTML = `<div class="d-flex gap-3 align-items-start"><ion-icon name="${item.icon || "ellipse-outline"}" class="fs-2 text-primary flex-shrink-0"></ion-icon><span><span class="d-block fw-semibold text-body all-tool-title"></span><span class="d-block small text-body-secondary mt-1 all-tool-description"></span></span></div>`;
        button.querySelector(".all-tool-title").textContent = item.title;
        button.querySelector(".all-tool-description").textContent = item.desc;
        button.addEventListener("click", () => {
          if (item.isPdf) {
            const catId = getCategoryToolIdForPdfTool(item.pdfToolName);
            if (toolState.current !== catId) {
              switchTool(catId, onToolChanged, true);
            } else {
              const pdfBtn = document.querySelector(`#pdf-nav button[data-tool="${catId}"]`);
              pdfBtn?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
            }
            renderTool(item.pdfToolName);
          } else {
            switchTool(item.id, onToolChanged, true);
          }
          document.getElementById("tool-view-container")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        column.appendChild(button);
        grid.appendChild(column);
      });
      section.appendChild(grid);
      results.appendChild(section);
    });
    empty?.classList.toggle("d-none", visible !== 0);
  };
  search.addEventListener("input", render);
  // Native search-field Esc-clear path (no custom clear button).
  search.addEventListener("search", render);
  render();
}

export function getCurrentActiveTool() {
  return getActiveToolFromStore();
}

export function updateSidebarIndicator(activeBtn) {
  const sidebarIndicator = document.getElementById("sidebar-indicator");
  if (!sidebarIndicator || !activeBtn) return;

  const scrollContainer = document.getElementById("sidebar-scroll-container");
  if (!scrollContainer) return;

  const containerRect = scrollContainer.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  const top = btnRect.top - containerRect.top + scrollContainer.scrollTop;
  const left = btnRect.left - containerRect.left;
  const width = btnRect.width;
  const height = btnRect.height;

  sidebarIndicator.style.transform = `translateY(${top}px)`;
  sidebarIndicator.style.left = `${left}px`;
  sidebarIndicator.style.width = `${width}px`;
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

  if (toolId === toolState.current) return;
  if (isJobRunning() && toolId !== "settings") return;

  if (toolState.current) {
    saveActiveModuleState(toolState.current);
  }

  if (toolState.current === "audio_tags" && toolId !== "audio_tags") {
    // Decoupled: audio_tags.js listens for this (was a direct import).
    try {
      document.dispatchEvent(new CustomEvent("anedikit:cancel-audio-load"));
    } catch (caughtErr) { reportError("js/navigation.js:switchTool", caughtErr); }
  }

  const getToolIndex = (id) => {
    if (!id) return -1;
    if (typeof id === "string" && id.startsWith("kit_")) return 24.5;
    const idx = TOOL_ORDER.indexOf(id);
    return idx !== -1 ? idx : 0;
  };
  const prevIndex = getToolIndex(toolState.current);
  const nextIndex = getToolIndex(toolId);
  const movingDown = prevIndex === -1 ? true : nextIndex > prevIndex;

  toolState.current = toolId;
  document.body.dataset.activeTool = toolId;
  saveActiveTool(toolId);

  // Update nav buttons active states across tool-nav, image-ai-nav, ytdlp-nav, pdf-nav, user-kits-nav, and settings-nav
  const allToolButtons = document.querySelectorAll(
    "#all-tools-nav .nav-link, #tool-nav .nav-link, #image-ai-nav .nav-link, #ytdlp-nav .nav-link, #pdf-nav .nav-link, #user-kits-nav .nav-link, #settings-nav .nav-link"
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
    updateSidebarScrollShadows();
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

  // Lazy views: inject placeholder + fetch on first open (shimmer skeleton
  // shows until the partial arrives; no signature change — still sync).
  if (isLazyView(targetViewId)) {
    const pending = document.getElementById(targetViewId);
    if (pending && pending.dataset.lazyState !== "loaded" && pending.dataset.lazyState !== "pending") {
      // loadView() injects skeleton synchronously, then fetches.
      loadView(targetViewId);
    }
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
  const allToolsBrowser = document.getElementById("all-tools-browser");
  const toolViewContainer = document.getElementById("tool-view-container");
  const isAllTools = toolId === "all_tools";
  allToolsBrowser?.classList.toggle("d-none", !isAllTools);
  toolViewContainer?.classList.toggle("d-none", isAllTools);


  // Toggle shared input cards (FFmpeg input file vs Image & AI queue vs yt-dlp URL input vs User Kit)
  const isYtDlp = toolId.startsWith("ytdlp_");
  const isAllToolsView = toolId === "all_tools";
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
  const isPdfTool = toolId.startsWith("pdf_") || toolId === "pdf";

  const sharedInputCard = document.getElementById("shared-input-card");
  const sharedUrlCard = document.getElementById("shared-url-card");
  const imageAiWorkspaceCard = document.getElementById("image-ai-workspace-card");
  const cmdPreviewCard = document.getElementById("command-preview-card");

  if (sharedInputCard) {
    sharedInputCard.classList.toggle("d-none", isYtDlp || isSettings || isAllToolsView || isImageTool || isKit || isAudioTags || isPdfTool);
  }
  if (imageAiWorkspaceCard) {
    imageAiWorkspaceCard.classList.toggle("d-none", !isImageTool || isSettings || isAllToolsView || isKit);
  }
  if (cmdPreviewCard) {
    cmdPreviewCard.classList.toggle("d-none", isSettings || isAllToolsView || isImageTool || isKit || isAudioTags || isPdfTool);
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

  // Toggle execute and reset buttons on settings, all_tools, and pdf views
  const isNoFooterTool = toolId === "settings" || toolId === "all_tools" || isPdfTool;
  const btnExecute = document.getElementById("btn-execute");
  const btnReset = document.getElementById("btn-reset");
  if (btnExecute) {
    btnExecute.classList.toggle("d-none", isNoFooterTool);
  }
  if (btnReset) {
    btnReset.classList.toggle("d-none", isNoFooterTool);
  }

  // Do not show footer in settings page, all tools, or PDF tools
  const bottomFooterBar = document.getElementById("bottom-footer-bar");
  if (bottomFooterBar) {
    bottomFooterBar.classList.toggle("d-none", isNoFooterTool);
  }

  const statusSlot = document.getElementById("status-message");
  if (statusSlot) {
    statusSlot.classList.toggle("d-none", toolId === "settings" || isImageTool || isAudioTags || isPdfTool);
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

// Ripple + queue-morph animation lives in anim.js (re-exported below).

// Collapsed-rail hover labels: an instantaneous Bootstrap tooltip (with
// arrow) showing the tool title, removed the instant the pointer leaves.
// Instances are created on demand and disposed synchronously, so each
// button's native `title` (the expanded-mode hover text) is left intact.
let activeCollapsedTipBtn = null;
let lastTipHideAt = 0;

// Design rule: the first hover fades in, but hopping straight to another
// item swaps instantly without re-animating while a label is on screen
// (or just left it).
function shouldShowTipInstantly() {
  if (document.querySelector(".tooltip.sidebar-nav-tip")) return true;
  return Date.now() - lastTipHideAt < 300;
}

export function hideActiveCollapsedTooltip() {
  if (activeCollapsedTipBtn) hideCollapsedTooltip(activeCollapsedTipBtn);
}

function showCollapsedTooltip(btn) {
  if (!btn) return;
  if (!document.body.classList.contains("sidebar-collapsed")) return;
  if (window.innerWidth <= 768) return;
  const BT = window.bootstrap?.Tooltip;
  if (!BT) return;
  if (activeCollapsedTipBtn && activeCollapsedTipBtn !== btn) {
    hideCollapsedTooltip(activeCollapsedTipBtn);
  }
  let existing = null;
  try {
    existing = BT.getInstance(btn);
  } catch (_) {
    existing = null;
  }
  if (existing) return;
  const labelEl = btn.querySelector("span:not(.fluent-ripple):not(.m3-ripple)");
  const label = labelEl?.textContent?.trim() || btn.getAttribute("title")?.trim();
  if (!label) return;
  let inst = null;
  try {
    inst = new BT(btn, {
      title: label,
      placement: "right",
      trigger: "manual",
      animation: !shouldShowTipInstantly(),
      delay: { show: 0, hide: 0 },
      fallbackPlacements: ["right", "left"],
      offset: [0, 10],
      customClass: "sidebar-nav-tip",
    });
  } catch (_) {
    return;
  }
  activeCollapsedTipBtn = btn;
  try {
    inst.show();
  } catch (_) {
    try {
      inst.dispose();
    } catch (caughtErr) { reportError("js/navigation.js:showCollapsedTooltip", caughtErr); }
    if (activeCollapsedTipBtn === btn) activeCollapsedTipBtn = null;
  }
}

function hideCollapsedTooltip(btn) {
  if (!btn) return;
  if (activeCollapsedTipBtn === btn) activeCollapsedTipBtn = null;
  const BT = window.bootstrap?.Tooltip;
  if (!BT) return;
  let inst = null;
  try {
    inst = BT.getInstance(btn);
  } catch (_) {
    inst = null;
  }
  if (!inst) return;
  // Dismiss synchronously the moment the pointer leaves: no fade-out, so
  // a slow traversal never shows the old label fading under the new one
  // (the flashing), and the native title is restored at once.
  lastTipHideAt = Date.now();
  try {
    inst.dispose();
  } catch (caughtErr) { reportError("js/navigation.js:hideCollapsedTooltip", caughtErr); }
}

function attachCollapsedTooltip(btn) {
  if (!btn) return;
  btn.addEventListener("mouseenter", () => showCollapsedTooltip(btn));
  btn.addEventListener("mouseleave", () => hideCollapsedTooltip(btn));
  btn.addEventListener("focus", () => showCollapsedTooltip(btn));
  btn.addEventListener("blur", () => hideCollapsedTooltip(btn));
  btn.addEventListener("click", () => hideCollapsedTooltip(btn));
}

// Queue-morph animation lives in anim.js (re-exported below).

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
  attachCollapsedTooltip(btn);

  if (onToolChanged && btn.dataset.tool) {
    btn.addEventListener("click", () => {
      const tool = btn.dataset.tool;
      switchTool(tool, onToolChanged);
    });
  }
}

export function initNavigation(onToolChanged) {
  initAllToolsBrowser(onToolChanged);
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
  const btnCollapse = document.getElementById("btn-sidebar-collapse");
  if (btnCollapse) {
    btnCollapse.addEventListener("click", (e) => {
      e.stopPropagation();
      hideActiveCollapsedTooltip();
      if (isSmallWidth()) {
        toggleMobileSidebar();
      } else {
        const isCollapsed = document.body.classList.toggle("sidebar-collapsed");
        try {
          localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, isCollapsed ? "true" : "false");
        } catch (caughtErr) { reportError("js/navigation.js:initNavigation", caughtErr); }
        updateSidebarScrollShadows();
        // Rail geometry is mid-transition: re-measure once it lands.
        setTimeout(resyncSidebarGeometry, 260);
      }
    });
  }

  // Restore collapsed sidebar state on desktop
  try {
    if (localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED) === "true" && !isSmallWidth()) {
      document.body.classList.add("sidebar-collapsed");
    }
  } catch (caughtErr) { reportError("js/navigation.js:initNavigation", caughtErr); }

  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
      const activeTag = document.activeElement?.tagName;
      if (activeTag !== "INPUT" && activeTag !== "TEXTAREA") {
        e.preventDefault();
        btnCollapse?.click();
      }
    }
  });

  if (btnToggle) {
    btnToggle.addEventListener("click", (e) => {
      if (!isSmallWidth()) return;
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
      const curIdx = TOOL_ORDER.indexOf(toolState.current);
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
      hideActiveCollapsedTooltip();
      const activeBtn = document.querySelector("#sidebar-scroll-container .nav-link.active");
      if (activeBtn) {
        updateSidebarIndicator(activeBtn);
      }
      updateSidebarScrollShadows();
    });
  }

  window.addEventListener("resize", () => {
    const activeBtn = document.querySelector("#sidebar-scroll-container .nav-link.active");
    if (activeBtn) {
      updateSidebarIndicator(activeBtn);
    }
    updateSidebarScrollShadows();
  });

  // Expose global switcher for custom modules like kits
  window.switchAppTool = (toolId) => switchTool(toolId, onToolChanged);

  // Restore saved active tool on startup
  let savedTool = getSavedActiveTool("convert");
  if (savedTool === "pdf") savedTool = "pdf_organize";
  toolState.current = ""; // reset to trigger clean initial load
  switchTool(savedTool, onToolChanged);
  updateSidebarScrollShadows();
  // Reload with a restored collapsed rail: it is still animating from full
  // width here (and icon fonts may not be ready), so the indicator measured
  // above has expanded geometry. Re-sync past the width transition and again
  // once fonts/icons settle.
  setTimeout(resyncSidebarGeometry, 320);
  if (document.readyState === "complete") {
    resyncSidebarGeometry();
  } else {
    window.addEventListener("load", resyncSidebarGeometry);
  }
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => resyncSidebarGeometry()).catch(() => {});
  }
}

export function updateSidebarScrollShadows() {
  const scrollContainer = document.getElementById("sidebar-scroll-container");
  const mainSidebar = document.getElementById("main-sidebar");
  if (!scrollContainer || !mainSidebar) return;

  const scrollTop = scrollContainer.scrollTop;
  const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;

  const hasTop = scrollTop > 4;
  const hasBottom = maxScroll > 4 && scrollTop < maxScroll - 4;

  mainSidebar.classList.toggle("has-scroll-top", hasTop);
  mainSidebar.classList.toggle("has-scroll-bottom", hasBottom);
}

// Re-measure the active button after async geometry changes (sidebar width
// transition on toggle/restore, webfont/icon load) so the sliding indicator
// never keeps stale inline dimensions.
export function resyncSidebarGeometry() {
  const activeBtn = document.querySelector(
    "#sidebar-scroll-container .nav-link.active, #settings-nav .nav-link.active"
  );
  if (activeBtn) {
    updateSidebarIndicator(activeBtn);
  }
  updateSidebarScrollShadows();
}
