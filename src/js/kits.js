// AnEdiKit - User Kits & Scripting IDE Module
import {
  loadUserKits,
  saveUserKits,
  getUserKitById,
  saveUserKit,
  deleteUserKit,
  saveActiveKit,
  loadSettings,
  getSavedKitParams,
  saveKitParams,
  getSavedScriptTheme,
  saveScriptTheme,
  getSavedKitActiveTab,
  saveKitActiveTab,
} from "./storage.js";
import { BLOCK_TYPES, createBlockInstance, renderBlockHTML } from "./blocks.js";
import { executeFfmpegJob, cancelFfmpegJob, isJobRunning } from "./runner.js";
import { selectMediaFile, selectOutputFolder, probeMedia } from "./media.js";
import { setupSidebarButtonEffects } from "./navigation.js";
import { setupListDragAndDrop } from "./drag_reorder.js";

// Starter Templates for New Kits
export const STARTER_TEMPLATES = {
  converter: {
    id: "converter_template",
    name: "Video Format Converter",
    author: "User",
    version: "1.0.0",
    license: "MIT",
    description: "Convert video streams between MP4, MKV, and WebM with custom CRF quality",
    icon: "film-outline",
    category: "video",
    engine: "ffmpeg",
    blocks: [
      {
        id: "inputFile",
        type: "file_input",
        label: "Source Media File",
        fileFilter: "video",
        help: "Choose or drop a video file to convert",
        required: true,
      },
      {
        id: "containerFormat",
        type: "select",
        label: "Target Container Format",
        options: [
          { value: "mp4", label: "MP4 (.mp4)" },
          { value: "mkv", label: "MKV (.mkv)" },
          { value: "webm", label: "WebM (.webm)" },
          { value: "mov", label: "MOV (.mov)" },
        ],
        default: "mp4",
      },
      {
        id: "videoCodec",
        type: "select",
        label: "Video Codec",
        options: [
          { value: "libx264", label: "H.264 (libx264 - Universal)" },
          { value: "libx265", label: "H.265 / HEVC (libx265 - Smaller File)" },
          { value: "libvpx-vp9", label: "VP9 (libvpx-vp9)" },
          { value: "copy", label: "Stream Copy (Lossless / Fast)" },
        ],
        default: "libx264",
      },
      {
        id: "crfQuality",
        type: "number",
        label: "CRF Quality Value",
        min: 0,
        max: 51,
        step: 1,
        default: 23,
        unit: "CRF",
        help: "0 is lossless, 23 is default, 51 is worst quality",
      },
      {
        id: "fastStart",
        type: "checkbox",
        label: "Optimize for Web Streaming (+faststart)",
        default: true,
      },
      {
        id: "outputFolder",
        type: "folder_picker",
        label: "Output Destination Folder",
        placeholder: "Default Videos folder...",
      },
      {
        id: "outputFilename",
        type: "output_filename",
        label: "Output File Name",
        suffix: "_converted",
        ext: "mp4",
      },
    ],
    script: `/**
 * AnEdiKit Script Editor - buildCommand
 *
 * @param {Object} ctx
 * @param {Object} ctx.values - Block input values mapped by block ID:
 *   - ctx.values.inputFile (string): Path to source media file
 *   - ctx.values.containerFormat (string): Selected output container format
 *   - ctx.values.videoCodec (string): Selected video encoder codec
 *   - ctx.values.crfQuality (number): CRF quality factor
 *   - ctx.values.fastStart (boolean): Web faststart moov atom flag
 *   - ctx.values.outputFolder (string): Output destination folder path
 *   - ctx.values.outputFilename (string): Output base filename
 * @param {Object} ctx.helpers - Helper utilities:
 *   - ctx.helpers.getDefaultOutputDir(): string - Default Videos directory path
 *   - ctx.helpers.joinPath(dir, filename): string - Platform-safe path join
 *   - ctx.helpers.splitArgs(argString): string[] - Parse space-separated CLI flags
 *   - ctx.helpers.getSettings(): Object - Current application settings
 * @returns {string[]} Argument list array passed to FFmpeg / CLI engine
 */
function buildCommand(ctx) {
  const { values, helpers } = ctx;
  const input = values.inputFile;
  if (!input) return [];

  const outDir = values.outputFolder || helpers.getDefaultOutputDir();
  const baseName = values.outputFilename || "output";
  const ext = values.containerFormat || "mp4";
  const finalOut = helpers.joinPath(outDir, baseName.endsWith("." + ext) ? baseName : baseName + "." + ext);

  const args = ["-i", input];

  if (values.videoCodec && values.videoCodec !== "none") {
    args.push("-c:v", values.videoCodec);
  }
  if (values.crfQuality !== undefined && values.videoCodec !== "copy") {
    args.push("-crf", String(values.crfQuality));
  }
  if (values.fastStart && ext === "mp4") {
    args.push("-movflags", "+faststart");
  }

  args.push("-y", finalOut);
  return args;
}`,
  },
  audio_filter: {
    id: "audio_filter_template",
    name: "Audio Normalizer & Extractor",
    author: "User",
    version: "1.0.0",
    license: "MIT",
    description: "Extract audio and apply volume gain or peak normalization",
    icon: "musical-notes-outline",
    category: "audio",
    engine: "ffmpeg",
    blocks: [
      {
        id: "inputFile",
        type: "file_input",
        label: "Source Media File",
        fileFilter: "all",
        required: true,
      },
      {
        id: "audioFormat",
        type: "select",
        label: "Audio Format",
        options: [
          { value: "mp3", label: "MP3 (.mp3)" },
          { value: "m4a", label: "AAC (.m4a)" },
          { value: "flac", label: "FLAC Lossless (.flac)" },
          { value: "wav", label: "WAV PCM (.wav)" },
        ],
        default: "mp3",
      },
      {
        id: "audioBitrate",
        type: "select",
        label: "Audio Bitrate",
        options: [
          { value: "128k", label: "128 kbps (Standard)" },
          { value: "192k", label: "192 kbps (High)" },
          { value: "256k", label: "256 kbps (Very High)" },
          { value: "320k", label: "320 kbps (Maximum)" },
        ],
        default: "256k",
      },
      {
        id: "volumeGain",
        type: "slider",
        label: "Volume Boost / Gain",
        default: 100,
        min: 10,
        max: 300,
        step: 5,
        unit: "%",
      },
      {
        id: "outputFolder",
        type: "folder_picker",
        label: "Output Destination Folder",
      },
      {
        id: "outputFilename",
        type: "output_filename",
        label: "Output File Name",
        suffix: "_audio",
        ext: "mp3",
      },
    ],
    script: `/**
 * AnEdiKit Script Editor - buildCommand
 *
 * @param {Object} ctx
 * @param {Object} ctx.values - Block input values (ctx.values.inputFile, ctx.values.volumeGain, etc.)
 * @param {Object} ctx.helpers - Helper utilities (getDefaultOutputDir, joinPath, splitArgs)
 * @returns {string[]} Argument list array passed to FFmpeg / CLI engine
 */
function buildCommand(ctx) {
  const { values, helpers } = ctx;
  const input = values.inputFile;
  if (!input) return [];

  const outDir = values.outputFolder || helpers.getDefaultOutputDir();
  const baseName = values.outputFilename || "audio_extracted";
  const ext = values.audioFormat || "mp3";
  const finalOut = helpers.joinPath(outDir, \`\${baseName}.\${ext}\`);

  const args = ["-i", input, "-vn"];

  if (values.volumeGain && values.volumeGain !== 100) {
    const vol = (values.volumeGain / 100).toFixed(2);
    args.push("-af", \`volume=\${vol}\`);
  }

  if (ext === "mp3") {
    args.push("-c:a", "libmp3lame", "-b:a", values.audioBitrate || "256k");
  } else if (ext === "m4a") {
    args.push("-c:a", "aac", "-b:a", values.audioBitrate || "256k");
  } else if (ext === "flac") {
    args.push("-c:a", "flac");
  } else if (ext === "wav") {
    args.push("-c:a", "pcm_s16le");
  }

  args.push("-y", finalOut);
  return args;
}`,
  },
  blank: {
    id: "blank_template",
    name: "Blank Scriptable Kit",
    author: "User",
    version: "1.0.0",
    license: "MIT",
    description: "Custom modular FFmpeg script kit",
    icon: "code-slash-outline",
    category: "tools",
    engine: "ffmpeg",
    blocks: [
      {
        id: "inputFile",
        type: "file_input",
        label: "Source Input File",
        fileFilter: "all",
      },
      {
        id: "customArgs",
        type: "text",
        label: "Command Arguments",
        placeholder: "-c copy output.mp4",
        default: "",
      },
    ],
    script: `/**
 * AnEdiKit Script Editor - buildCommand
 *
 * @param {Object} ctx
 * @param {Object} ctx.values - Block input values
 * @param {Object} ctx.helpers - Helper utilities (getDefaultOutputDir, joinPath, splitArgs)
 * @returns {string[]} Argument list array passed to FFmpeg / CLI engine
 */
function buildCommand(ctx) {
  const { values, helpers } = ctx;
  const input = values.inputFile;
  if (!input) return [];

  const args = ["-i", input];
  if (values.customArgs && values.customArgs.trim()) {
    args.push(...helpers.splitArgs(values.customArgs));
  }
  return args;
}`,
  },
};

let activeKit = null;
let activeKitTab = "runner"; // runner, builder, script, settings
let kitRuntimeValues = {};
let monacoEditorInstance = null;
let editingBlockIndices = new Set();

// Autogenerate a clean Kit ID based on author and name
export function generateKitId(author, name) {
  const cleanAuthor = (author || "user")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  const cleanName = (name || "kit")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `${cleanAuthor || "user"}.${cleanName || "new_kit"}`;
}

// Initialize Kits System
export function initKitsManager() {
  ensureCustomKitModals();
  ensureDefaultSampleKits();
  renderUserKitsSidebar();
  bindKitWizardEvents();

  // Dismiss open dropdowns on click outside (only if Bootstrap is not active)
  document.addEventListener("click", (e) => {
    if (window.bootstrap?.Dropdown) return;
    if (!e.target.closest(".dropdown, .dropup, .dropend, .dropstart")) {
      document.querySelectorAll(".dropdown-menu.show").forEach((m) => {
        m.classList.remove("show");
        const b = m.parentElement?.querySelector('[data-bs-toggle="dropdown"]');
        if (b) {
          b.classList.remove("show");
          b.setAttribute("aria-expanded", "false");
        }
      });
    }
  });

  // Resize listener to keep sliding tab indicator properly positioned
  window.addEventListener("resize", () => {
    updateKitTabIndicator(true);
  });
}

// Universal robust dropdown binding helper for dynamic views
export function bindUniversalDropdowns(container) {
  if (!container) return;

  container.querySelectorAll('[data-bs-toggle="dropdown"]').forEach((toggleBtn) => {
    if (window.bootstrap?.Dropdown) {
      const autoCloseAttr = toggleBtn.getAttribute("data-bs-auto-close");
      let autoCloseVal = true;
      if (autoCloseAttr === "outside") autoCloseVal = "outside";
      else if (autoCloseAttr === "inside") autoCloseVal = "inside";
      else if (autoCloseAttr === "false") autoCloseVal = false;

      window.bootstrap.Dropdown.getOrCreateInstance(toggleBtn, {
        autoClose: autoCloseVal,
      });
    } else {
      toggleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const parentDropdown = toggleBtn.closest(".dropdown, .dropup, .dropend, .dropstart") || toggleBtn.parentElement;
        const menu = parentDropdown?.querySelector(".dropdown-menu");
        if (!menu) return;

        const isCurrentlyOpen = menu.classList.contains("show");

        document.querySelectorAll(".dropdown-menu.show").forEach((m) => {
          m.classList.remove("show");
          const b = m.parentElement?.querySelector('[data-bs-toggle="dropdown"]');
          if (b) {
            b.classList.remove("show");
            b.setAttribute("aria-expanded", "false");
          }
        });

        if (!isCurrentlyOpen) {
          menu.classList.add("show");
          menu.setAttribute("data-bs-popper", "static");
          toggleBtn.classList.add("show");
          toggleBtn.setAttribute("aria-expanded", "true");
        }
      });
    }
  });
}

// Populate sample kits if list is empty
function ensureDefaultSampleKits() {
  const existing = loadUserKits();
  if (existing.length === 0) {
    const sampleKit = {
      ...STARTER_TEMPLATES.converter,
      id: "user.webm_to_mp4_fast",
      name: "Fast MP4 Converter",
      author: "AnEdiKit",
    };
    saveUserKits([sampleKit]);
  }
}

// Export kit configuration as downloadable JSON file
export function exportKitAsJSON(kit) {
  if (!kit) return;
  const jsonStr = JSON.stringify(kit, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${kit.id || "kit"}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Duplicate existing kit by ID
export function duplicateKitById(kitId) {
  const kit = getUserKitById(kitId);
  if (!kit) return;

  const newId = `${kit.id}_copy_${Date.now().toString().slice(-4)}`;
  const duplicated = {
    ...JSON.parse(JSON.stringify(kit)),
    id: newId,
    name: `${kit.name} (Copy)`,
  };

  saveUserKit(duplicated);
  renderUserKitsSidebar();
  selectAndOpenKit(newId);
}

// Delete existing kit by ID with confirmation
export function deleteKitById(kitId) {
  const kit = getUserKitById(kitId);
  if (!kit) return;

  if (confirm(`Are you sure you want to delete the kit "${kit.name}"?`)) {
    deleteUserKit(kitId);
    renderUserKitsSidebar();

    const remaining = loadUserKits();
    if (remaining.length > 0) {
      selectAndOpenKit(remaining[0].id);
    } else {
      activeKit = null;
      if (window.switchAppTool) {
        window.switchAppTool("convert");
      }
    }
  }
}

// Ensure context menu DOM exists
function ensureSidebarContextMenu() {
  let menu = document.getElementById("kit-sidebar-context-menu");
  if (!menu) {
    menu = document.createElement("ul");
    menu.id = "kit-sidebar-context-menu";
    menu.className = "dropdown-menu shadow position-fixed";
    menu.style.zIndex = "1060";
    menu.style.display = "none";
    menu.innerHTML = `
      <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" data-action="open"><ion-icon name="enter-outline" class="text-primary"></ion-icon>Open Kit</a></li>
      <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" data-action="settings"><ion-icon name="settings-outline" class="text-secondary"></ion-icon>Properties</a></li>
      <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" data-action="export"><ion-icon name="download-outline" class="text-secondary"></ion-icon>Export Kit JSON</a></li>
      <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" data-action="duplicate"><ion-icon name="copy-outline" class="text-secondary"></ion-icon>Duplicate Kit</a></li>
      <li><hr class="dropdown-divider my-1"></li>
      <li><a class="dropdown-item small text-danger d-flex align-items-center gap-2" href="#" data-action="delete"><ion-icon name="trash-outline"></ion-icon>Delete Kit</a></li>
    `;
    document.body.appendChild(menu);

    menu.querySelectorAll(".dropdown-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const action = item.dataset.action;
        const targetKitId = menu.dataset.targetKitId;
        hideSidebarContextMenu();

        if (!targetKitId) return;
        if (action === "open") {
          selectAndOpenKit(targetKitId);
        } else if (action === "settings") {
          selectAndOpenKit(targetKitId, true, "settings");
        } else if (action === "export") {
          const k = getUserKitById(targetKitId);
          if (k) exportKitAsJSON(k);
        } else if (action === "duplicate") {
          duplicateKitById(targetKitId);
        } else if (action === "delete") {
          deleteKitById(targetKitId);
        }
      });
    });

    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target)) {
        hideSidebarContextMenu();
      }
    });

    window.addEventListener("resize", hideSidebarContextMenu);
    window.addEventListener("scroll", hideSidebarContextMenu, true);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideSidebarContextMenu();
    });
  }
  return menu;
}

export function hideSidebarContextMenu() {
  const menu = document.getElementById("kit-sidebar-context-menu");
  if (menu) {
    menu.style.display = "none";
    menu.classList.remove("show");
  }
}

export function showSidebarContextMenu(e, kitId) {
  e.preventDefault();
  e.stopPropagation();

  const menu = ensureSidebarContextMenu();
  menu.dataset.targetKitId = kitId;
  menu.style.display = "block";
  menu.classList.add("show");

  const menuWidth = 190;
  const menuHeight = 210;
  let posX = e.clientX;
  let posY = e.clientY;

  if (posX + menuWidth > window.innerWidth) {
    posX = window.innerWidth - menuWidth - 8;
  }
  if (posY + menuHeight > window.innerHeight) {
    posY = window.innerHeight - menuHeight - 8;
  }

  menu.style.left = `${posX}px`;
  menu.style.top = `${posY}px`;
}

export function getIonicIconName(rawIcon) {
  if (!rawIcon) return "cube-outline";
  const map = {
    "bi-film": "film-outline",
    "bi-music-note-beamed": "musical-notes-outline",
    "bi-code-slash": "code-slash-outline",
    "bi-box-seam": "cube-outline",
    "bi-sliders": "options-outline",
    "bi-lightning": "flash-outline",
    "bi-terminal": "terminal-outline",
    "bi-gear": "settings-outline",
    "bi-cpu": "hardware-chip-outline",
    "bi-camera-video": "videocam-outline",
    "bi-soundwave": "pulse-outline",
    "bi-palette": "color-palette-outline",
    "bi-magic": "sparkles-outline",
    "bi-scissors": "cut-outline",
    "bi-file-earmark-code": "code-working-outline",
  };
  if (map[rawIcon]) return map[rawIcon];
  const clean = rawIcon.replace(/^bi-/, "");
  if (map[clean]) return map[clean];
  return clean.includes("-") ? clean : `${clean}-outline`;
}

// Render User Kits navigation links in sidebar
export function renderUserKitsSidebar() {
  const container = document.getElementById("user-kits-nav");
  if (!container) return;

  const kits = loadUserKits();
  if (kits.length === 0) {
    container.innerHTML = `
      <div class="p-2 text-body-secondary small text-center opacity-75">
        No custom kits yet
      </div>
    `;
    return;
  }

  container.innerHTML = kits
    .map(
      (k) => `
      <button class="nav-link text-start d-flex align-items-center gap-2 text-truncate kit-nav-button" data-tool="kit_${escapeHtml(k.id)}" data-kit-id="${escapeHtml(k.id)}" type="button" title="${escapeHtml(k.name)}${k.description ? ' - ' + escapeHtml(k.description) : ''} (${escapeHtml(k.version || "1.0.0")})">
        <ion-icon name="${getIonicIconName(k.icon)}" class="text-body-secondary flex-shrink-0"></ion-icon>
        <span class="text-truncate flex-grow-1">${escapeHtml(k.name)}</span>
      </button>
    `
    )
    .join("");

  container.querySelectorAll(".kit-nav-button").forEach((btn) => {
    setupSidebarButtonEffects(btn);
    btn.addEventListener("click", () => {
      const kitId = btn.dataset.kitId;
      selectAndOpenKit(kitId);
    });
    btn.addEventListener("contextmenu", (e) => {
      const kitId = btn.dataset.kitId;
      showSidebarContextMenu(e, kitId);
    });
  });
}

// Bind Kit Creation Wizard Modal events
function bindKitWizardEvents() {
  const btnSidebarNewKit = document.getElementById("btn-sidebar-new-kit");
  const modalEl = document.getElementById("modal-create-kit");
  const formEl = document.getElementById("form-create-kit");

  const inName = document.getElementById("kit-wizard-name");
  const inAuthor = document.getElementById("kit-wizard-author");
  const inId = document.getElementById("kit-wizard-id");
  const inVer = document.getElementById("kit-wizard-version");
  const inLicense = document.getElementById("kit-wizard-license");
  const inTemplate = document.getElementById("kit-wizard-template");
  const inDesc = document.getElementById("kit-wizard-desc");
  const inIcon = document.getElementById("kit-wizard-icon");

  let idManuallyEdited = false;

  const updateAutoId = () => {
    if (!idManuallyEdited && inName && inAuthor && inId) {
      inId.value = generateKitId(inAuthor.value, inName.value);
    }
  };

  if (inName) {
    inName.addEventListener("input", updateAutoId);
  }
  if (inAuthor) {
    inAuthor.addEventListener("input", updateAutoId);
  }
  if (inId) {
    inId.addEventListener("input", () => {
      idManuallyEdited = true;
    });
  }

  if (btnSidebarNewKit) {
    btnSidebarNewKit.addEventListener("click", () => {
      idManuallyEdited = false;
      if (inName) inName.value = "";
      if (inAuthor) inAuthor.value = "User";
      if (inId) inId.value = "user.new_kit";
      if (inVer) inVer.value = "1.0.0";
      if (inLicense) inLicense.value = "MIT";
      if (inTemplate) inTemplate.value = "converter";
      if (inDesc) inDesc.value = "";
      if (inIcon) inIcon.value = "cube-outline";

      if (window.bootstrap?.Modal && modalEl) {
        const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
        setTimeout(() => inName?.focus(), 250);
      }
    });
  }

  if (formEl) {
    formEl.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = inName?.value?.trim() || "Untitled Kit";
      const author = inAuthor?.value?.trim() || "User";
      const id = (inId?.value?.trim() || generateKitId(author, name)).toLowerCase();
      const version = inVer?.value?.trim() || "1.0.0";
      const license = inLicense?.value || "MIT";
      const templateKey = inTemplate?.value || "converter";
      const description = inDesc?.value?.trim() || "";
      const icon = inIcon?.value || "cube-outline";

      // Check unique ID
      const existing = getUserKitById(id);
      if (existing) {
        showCustomKitAlert(`A kit with ID "${id}" already exists. Please choose a different ID.`, "Duplicate Kit ID");
        if (inId) inId.focus();
        return;
      }

      const template = STARTER_TEMPLATES[templateKey] || STARTER_TEMPLATES.blank;
      const newKit = {
        id,
        name,
        author,
        version,
        license,
        description,
        icon,
        category: template.category || "video",
        engine: template.engine || "ffmpeg",
        blocks: JSON.parse(JSON.stringify(template.blocks || [])),
        script: template.script || "",
      };

      saveUserKit(newKit);
      renderUserKitsSidebar();

      // Close modal
      if (window.bootstrap?.Modal && modalEl) {
        const modal = window.bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }

      // Switch to newly created kit
      selectAndOpenKit(id);
    });
  }
}

let _kitTabsResizeObserver = null;
let _lastNavWidth = 0;

// Update the gliding background indicator position on the kit navigation tab bar
export function updateKitTabIndicator(instant = false) {
  const nav = document.getElementById("kit-ide-tabs");
  const indicator = document.getElementById("kit-tab-indicator");
  if (!nav || !indicator) return;

  const activeBtn = nav.querySelector(`.kit-segment-btn[data-tab="${activeKitTab}"]`);
  if (!activeBtn) return;

  // Use layout offset coordinates so calculations are unaffected by parent scale/zoom transforms
  const left = activeBtn.offsetLeft;
  const width = activeBtn.offsetWidth;

  if (width === 0) {
    requestAnimationFrame(() => updateKitTabIndicator(instant));
    return;
  }

  if (instant) {
    indicator.style.transition = "none";
    indicator.style.transform = `translateX(${left}px)`;
    indicator.style.width = `${width}px`;
    void indicator.offsetWidth;
    indicator.style.transition = "";
  } else {
    indicator.style.transform = `translateX(${left}px)`;
    indicator.style.width = `${width}px`;
  }

  // Auto-track layout reflows on container resize without cancelling active transitions
  if (!_kitTabsResizeObserver && typeof ResizeObserver !== "undefined") {
    _kitTabsResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && Math.abs(entry.contentRect.width - _lastNavWidth) > 1) {
          _lastNavWidth = entry.contentRect.width;
          updateKitTabIndicator(true);
        }
      }
    });
  }
  if (_kitTabsResizeObserver && nav) {
    _kitTabsResizeObserver.observe(nav);
  }
}

// Switch between IDE tabs (Runner, UI Blocks, Script Engine, Kit Settings) with animated transition
export function switchKitTab(tabName) {
  if (activeKitTab === tabName) return;
  activeKitTab = tabName;
  if (activeKit) {
    saveKitActiveTab(activeKit.id, tabName);
  }

  const nav = document.getElementById("kit-ide-tabs");
  if (nav) {
    nav.querySelectorAll(".kit-segment-btn").forEach((btn) => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add("active", "text-body");
        btn.classList.remove("text-body-secondary");
      } else {
        btn.classList.remove("active", "text-body");
        btn.classList.add("text-body-secondary");
      }
    });
    updateKitTabIndicator(false);
  }

  // Clean up Monaco editor if switching away, ensuring latest code is saved
  if (monacoEditorInstance) {
    try {
      if (activeKit) {
        activeKit.script = monacoEditorInstance.getValue();
        saveUserKit(activeKit);
      }
      monacoEditorInstance.dispose();
    } catch (_) {}
    monacoEditorInstance = null;
  }

  const tabContent = document.getElementById("kit-tab-content");
  if (tabContent) {
    tabContent.classList.remove("material-zoom");
    void tabContent.offsetWidth;
    tabContent.classList.add("material-zoom");
  }

  if (activeKitTab === "runner") {
    renderKitRunnerTab();
  } else if (activeKitTab === "builder") {
    renderKitBuilderTab();
  } else if (activeKitTab === "script") {
    renderKitScriptTab();
  } else if (activeKitTab === "settings") {
    renderKitSettingsTab();
  }
}

// Sanitize kit blocks to strip obsolete preview and log blocks
function sanitizeKitBlocks(kit) {
  if (!kit || !Array.isArray(kit.blocks)) return;
  const originalLen = kit.blocks.length;
  kit.blocks = kit.blocks.filter((b) => b && b.type !== "progress_and_logs" && b.type !== "command_preview");
  if (kit.blocks.length !== originalLen) {
    saveUserKit(kit);
  }
}

// Select a kit and open IDE / Runner view
export function selectAndOpenKit(kitId, shouldSwitchTool = true, targetTab = null) {
  const kit = getUserKitById(kitId);
  if (!kit) return;

  sanitizeKitBlocks(kit);
  activeKit = kit;
  saveActiveKit(kitId);

  if (targetTab) {
    activeKitTab = targetTab;
    saveKitActiveTab(kitId, targetTab);
  } else {
    activeKitTab = getSavedKitActiveTab(kitId, "runner");
  }

  // Restore runtime values from storage or block defaults
  const savedParams = getSavedKitParams(kitId);
  kitRuntimeValues = { ...savedParams };

  (kit.blocks || []).forEach((b) => {
    if (kitRuntimeValues[b.id] === undefined) {
      if (b.default !== undefined) {
        kitRuntimeValues[b.id] = b.default;
      } else if (b.type === "output_filename") {
        kitRuntimeValues[b.id] = b.placeholder || "output";
      }
    }
  });

  // Switch navigation to kit view
  if (shouldSwitchTool && window.switchAppTool) {
    window.switchAppTool(`kit_${kitId}`);
  }

  renderKitIdeWorkspace();
}

// Global hook so switchTool can render kit IDE
window.renderActiveKitIde = (kitId, targetTab = null) => {
  selectAndOpenKit(kitId, false, targetTab);
};

export function getActiveKit() {
  return activeKit;
}

// Render the Kit IDE workspace in the content area
export function renderKitIdeWorkspace() {
  const container = document.getElementById("view-kit_ide");
  if (!container || !activeKit) return;

  // Clean up previous Monaco editor instance if exists
  if (monacoEditorInstance) {
    try {
      monacoEditorInstance.dispose();
    } catch (_) {}
    monacoEditorInstance = null;
  }

  container.innerHTML = `
    <!-- Top Kit Header Bar (100% full-bleed width, no side gaps) -->
    <div class="kit-ide-header-bar bg-body d-flex flex-wrap align-items-center justify-content-between gap-3">
      <div class="d-flex align-items-center gap-2">
        <ion-icon name="${getIonicIconName(activeKit.icon)}" class="fs-2 text-primary lh-1 me-2" id="kit-header-icon-display"></ion-icon>
        <div>
          <div class="d-flex align-items-center gap-2">
            <h4 class="mb-0 fw-semibold text-body">${escapeHtml(activeKit.name)}</h4>
            <span class="badge bg-secondary-subtle text-secondary-emphasis">v${escapeHtml(activeKit.version || "1.0.0")}</span>
          </div>
          <div class="small text-body-secondary mt-1">
            Author: <span class="text-body">${escapeHtml(activeKit.author || "User")}</span> &bull; ID: <span class="text-body-secondary">${escapeHtml(activeKit.id)}</span>
          </div>
        </div>
      </div>

      <div class="d-flex align-items-center gap-2">
        <!-- View Tabs Switcher with Animated Background Indicator -->
        <div class="kit-segment-nav" id="kit-ide-tabs" role="tablist">
          <div class="kit-segment-indicator" id="kit-tab-indicator"></div>
          <button type="button" class="btn btn-sm kit-segment-btn ${activeKitTab === "runner" ? "active text-body" : "text-body-secondary"}" data-tab="runner" role="tab">
            <ion-icon name="play-circle-outline" class="me-1"></ion-icon> Playground
          </button>
          <button type="button" class="btn btn-sm kit-segment-btn ${activeKitTab === "builder" ? "active text-body" : "text-body-secondary"}" data-tab="builder" role="tab">
            <ion-icon name="cube-outline" class="me-1"></ion-icon> Blocks
          </button>
          <button type="button" class="btn btn-sm kit-segment-btn ${activeKitTab === "script" ? "active text-body" : "text-body-secondary"}" data-tab="script" role="tab">
            <ion-icon name="code-slash-outline" class="me-1"></ion-icon> Script Editor
          </button>
          <button type="button" class="btn btn-sm kit-segment-btn ${activeKitTab === "settings" ? "active text-body" : "text-body-secondary"}" data-tab="settings" role="tab">
            <ion-icon name="settings-outline" class="me-1"></ion-icon> Properties
          </button>
        </div>

        <!-- Actions Dropdown -->
        <div class="dropdown">
          <button class="btn btn-outline-secondary btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Kit Options">
            <ion-icon name="ellipsis-vertical-outline"></ion-icon>
          </button>
          <ul class="dropdown-menu dropdown-menu-end shadow">
            <li><a class="dropdown-item small" href="#" id="btn-export-kit-json"><ion-icon name="download-outline" class="me-2"></ion-icon>Export Kit JSON</a></li>
            <li><a class="dropdown-item small" href="#" id="btn-duplicate-kit"><ion-icon name="copy-outline" class="me-2"></ion-icon>Duplicate Kit</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item small text-danger" href="#" id="btn-delete-kit"><ion-icon name="trash-outline" class="me-2"></ion-icon>Delete Kit</a></li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Active Tab Content Area -->
    <div id="kit-tab-content" class="position-relative">
      <!-- Injected by tab renderers below -->
    </div>
  `;

  // Bind dropdown menus
  bindUniversalDropdowns(container);

  // Bind tab switching
  container.querySelectorAll("#kit-ide-tabs button.kit-segment-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchKitTab(btn.dataset.tab);
    });
  });

  // Bind header dropdown actions
  const btnExport = container.querySelector("#btn-export-kit-json");
  if (btnExport) {
    btnExport.addEventListener("click", (e) => {
      e.preventDefault();
      exportKitAsJSON(activeKit);
    });
  }

  const btnDup = container.querySelector("#btn-duplicate-kit");
  if (btnDup) {
    btnDup.addEventListener("click", (e) => {
      e.preventDefault();
      duplicateKitById(activeKit.id);
    });
  }

  const btnDel = container.querySelector("#btn-delete-kit");
  if (btnDel) {
    btnDel.addEventListener("click", (e) => {
      e.preventDefault();
      deleteKitById(activeKit.id);
    });
  }

  // Initial tab render
  if (activeKitTab === "runner") {
    renderKitRunnerTab();
  } else if (activeKitTab === "builder") {
    renderKitBuilderTab();
  } else if (activeKitTab === "script") {
    renderKitScriptTab();
  } else if (activeKitTab === "settings") {
    renderKitSettingsTab();
  }

  // Position indicator smoothly on active tab
  requestAnimationFrame(() => {
    updateKitTabIndicator(true);
  });
  if (typeof customElements !== "undefined" && customElements.whenDefined) {
    customElements.whenDefined("ion-icon").then(() => {
      updateKitTabIndicator(true);
    });
  }
}

// -------------------------------------------------------------
// TAB 1: RUNNER / INTERACTIVE TOOL VIEW (No Kit Action Card)
// -------------------------------------------------------------
function renderKitRunnerTab() {
  const container = document.getElementById("kit-tab-content");
  if (!container || !activeKit) return;

  const blocks = activeKit.blocks || [];
  if (blocks.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5 text-body-secondary border rounded bg-body">
        <ion-icon name="cube-outline" class="fs-1 text-secondary opacity-50 mb-2"></ion-icon>
        <h6 class="text-body fw-semibold">No Blocks Defined</h6>
        <p class="small text-body-secondary mb-3">Add blocks in the "Blocks" tab to create inputs and controls for this kit.</p>
        <button class="btn btn-primary btn-sm" type="button" id="btn-goto-builder">
          <ion-icon name="add-outline" class="me-1"></ion-icon> Open Blocks Builder
        </button>
      </div>
    `;
    const btnGoto = container.querySelector("#btn-goto-builder");
    if (btnGoto) {
      btnGoto.addEventListener("click", () => {
        activeKitTab = "builder";
        renderKitIdeWorkspace();
      });
    }
    return;
  }

  const blocksHtml = blocks.map((b) => renderBlockHTML(b, kitRuntimeValues[b.id], activeKit.id)).join("");

  container.innerHTML = `
    <div class="row g-3 mb-4">
      <div class="col-12">
        <div class="card bg-body border-0">
          <div class="card-body p-0">
            ${blocksHtml}
          </div>
        </div>
      </div>
    </div>

    <!-- Execution Footer Panel (Command Preview & Conditional Execution Status/Logs) -->
    <div id="kit-execution-footer-panel">
      <!-- Command Preview -->
      <div class="mb-4" id="kit-command-preview-card">
        <div class="section-divider-header">Command Preview</div>
        <div class="input-group">
          <div class="form-control small user-select-all text-body bg-body font-monospace overflow-x-auto d-flex align-items-center" style="min-height: 38px; font-size: 0.8rem; white-space: nowrap;" id="kit-cmd-preview">ffmpeg [waiting for input media selection...]</div>
          <button class="btn btn-outline-secondary" type="button" id="btn-kit-copy-cmd" title="Copy command string">
            <ion-icon name="copy-outline"></ion-icon>
          </button>
        </div>
      </div>

      <!-- Conditional Progress & Execution Logs (Shown only after user clicks Execute) -->
      <div class="mb-3 d-none ui-zoom-in" id="kit-execution-status-panel">
        <div class="section-divider-header">Execution Status & Log Output</div>
        <div class="card border-secondary-subtle overflow-hidden position-relative">
          <!-- Copy Log Button at Top Right Corner -->
          <button type="button" class="btn btn-sm text-secondary border-0 bg-transparent position-absolute top-0 end-0 m-1 log-copy-btn" id="btn-kit-copy-logs" title="Copy execution log to clipboard" style="z-index: 5;">
            <ion-icon name="copy-outline"></ion-icon>
          </button>

          <!-- Log Box at top (full width, no gap from top, user-selectable text) -->
          <div class="bg-black text-success-emphasis p-3 pe-5 font-monospace small overflow-y-auto user-select-text" style="height: 140px; font-size: 0.8rem; user-select: text; -webkit-user-select: text;" id="kit-log-console">
            <div class="text-secondary">[Ready to process tasks]</div>
          </div>

          <!-- Status text in middle -->
          <div class="d-flex justify-content-between align-items-center px-3 py-2 bg-body small text-body-secondary border-top">
            <div class="d-flex flex-wrap gap-3">
              <span id="kit-stat-time">Time: 00:00:00</span>
              <span id="kit-stat-fps">FPS: 0</span>
              <span id="kit-stat-speed">Speed: 0x</span>
              <span id="kit-stat-bitrate">Bitrate: 0 kbits/s</span>
            </div>
            <span class="fw-semibold text-body" id="kit-progress-pct">0%</span>
          </div>

          <!-- Progress Bar at absolute bottom (full width, no gap) -->
          <div class="progress rounded-0" style="height: 4px; background-color: var(--bs-border-color);" id="kit-exec-progress-container">
            <div class="progress-bar" id="kit-job-progress-bar" role="progressbar" style="width: 0%"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindKitRunnerInputs(container);
  updateKitLivePreview();
}

function bindKitRunnerInputs(container) {
  if (!container || !activeKit) return;

  // File input browse buttons
  container.querySelectorAll(".btn-browse-block-file").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const blockId = btn.dataset.blockId;
      const filter = btn.dataset.filter || "all";
      const filePath = await selectMediaFile(filter);
      if (filePath) {
        kitRuntimeValues[blockId] = filePath;
        saveKitParams(activeKit.id, kitRuntimeValues);

        const inputEl = container.querySelector(`#kit-block-${blockId}`);
        if (inputEl) inputEl.value = filePath;

        // Automatically update output filename if an output_filename block exists
        const outBlock = activeKit.blocks.find((b) => b.type === "output_filename");
        if (outBlock) {
          const fileName = filePath.split(/[/\\]/).pop() || filePath;
          const baseName = fileName.replace(/\.[^/.]+$/, "");
          const suffix = outBlock.suffix || "_processed";
          kitRuntimeValues[outBlock.id] = `${baseName}${suffix}`;
          saveKitParams(activeKit.id, kitRuntimeValues);
          const outEl = container.querySelector(`#kit-block-${outBlock.id}`);
          if (outEl) outEl.value = kitRuntimeValues[outBlock.id];
        }

        // Probe media info
        probeMedia(filePath).then((info) => {
          const metaCard = container.querySelector(`#kit-file-meta-${blockId}`);
          const metaDesc = container.querySelector(`#kit-file-meta-desc-${blockId}`);
          const metaBadge = container.querySelector(`#kit-file-meta-badge-${blockId}`);
          if (metaCard && info) {
            metaCard.classList.remove("d-none");
            if (metaDesc) metaDesc.textContent = `${info.resolution || ""} • ${info.video_codec || ""} / ${info.audio_codec || ""} • ${info.file_size_formatted || ""}`;
            if (metaBadge) metaBadge.textContent = info.duration_string || "";
          }
        });

        updateKitLivePreview();
      }
    });
  });

  // Clear file buttons
  container.querySelectorAll(".btn-clear-block-file").forEach((btn) => {
    btn.addEventListener("click", () => {
      const blockId = btn.dataset.blockId;
      kitRuntimeValues[blockId] = "";
      saveKitParams(activeKit.id, kitRuntimeValues);
      const inputEl = container.querySelector(`#kit-block-${blockId}`);
      if (inputEl) inputEl.value = "";
      const metaCard = container.querySelector(`#kit-file-meta-${blockId}`);
      if (metaCard) metaCard.classList.add("d-none");
      updateKitLivePreview();
    });
  });

  // Folder browse buttons
  container.querySelectorAll(".btn-browse-block-folder").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const blockId = btn.dataset.blockId;
      const folderPath = await selectOutputFolder();
      if (folderPath) {
        kitRuntimeValues[blockId] = folderPath;
        saveKitParams(activeKit.id, kitRuntimeValues);
        const inputEl = container.querySelector(`#kit-block-${blockId}`);
        if (inputEl) inputEl.value = folderPath;
        updateKitLivePreview();
      }
    });
  });

  // Generic inputs (text, number, select, checkbox, textarea)
  container.querySelectorAll(".kit-block-input").forEach((el) => {
    const blockId = el.dataset.blockId;
    const block = activeKit.blocks.find((b) => b.id === blockId);

    const handleInput = () => {
      if (el.type === "checkbox") {
        kitRuntimeValues[blockId] = el.checked;
      } else if (el.type === "number" || el.type === "range") {
        kitRuntimeValues[blockId] = parseFloat(el.value) || 0;
        const readout = container.querySelector(`#kit-slider-val-${blockId}`);
        if (readout && block) readout.textContent = `${el.value}${block.unit || ""}`;
      } else {
        kitRuntimeValues[blockId] = el.value;
      }
      saveKitParams(activeKit.id, kitRuntimeValues);
      updateKitLivePreview();
    };

    el.addEventListener("input", handleInput);
    el.addEventListener("change", handleInput);
  });

  // Radio buttons
  container.querySelectorAll(".kit-block-radio").forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) {
        kitRuntimeValues[r.dataset.blockId] = r.value;
        saveKitParams(activeKit.id, kitRuntimeValues);
        updateKitLivePreview();
      }
    });
  });

  // Copy command button
  const btnCopyCmd = container.querySelector("#btn-kit-copy-cmd");
  if (btnCopyCmd) {
    btnCopyCmd.addEventListener("click", async () => {
      const pre = container.querySelector("#kit-cmd-preview");
      if (pre && pre.textContent) {
        await navigator.clipboard.writeText(pre.textContent);
        const origHtml = btnCopyCmd.innerHTML;
        btnCopyCmd.innerHTML = `<ion-icon name="checkmark-outline"></ion-icon> Copied!`;
        btnCopyCmd.classList.replace("btn-outline-secondary", "btn-success");
        setTimeout(() => {
          btnCopyCmd.innerHTML = origHtml;
          btnCopyCmd.classList.replace("btn-success", "btn-outline-secondary");
        }, 1800);
      }
    });
  }

  // Copy logs button
  const btnCopyLogs = container.querySelector("#btn-kit-copy-logs");
  const logBox = container.querySelector("#kit-log-console");
  if (btnCopyLogs && logBox) {
    btnCopyLogs.addEventListener("click", async () => {
      await navigator.clipboard.writeText(logBox.innerText || "");
      const origHtml = btnCopyLogs.innerHTML;
      btnCopyLogs.innerHTML = `<ion-icon name="checkmark-outline" class="text-success"></ion-icon>`;
      setTimeout(() => (btnCopyLogs.innerHTML = origHtml), 1500);
    });
  }

  // Remove unknown or deprecated block button
  container.querySelectorAll(".btn-remove-unknown-block").forEach((btn) => {
    btn.addEventListener("click", () => {
      const blockId = btn.dataset.blockId;
      if (!activeKit || !blockId) return;
      activeKit.blocks = (activeKit.blocks || []).filter((b) => b.id !== blockId);
      delete kitRuntimeValues[blockId];
      saveKitParams(activeKit.id, kitRuntimeValues);
      saveUserKit(activeKit);
      renderKitRunnerTab();
    });
  });
}

// Ensure Bootstrap modals for Kit Alerts & Prompts exist in DOM
export function ensureCustomKitModals() {
  if (!document.getElementById("modal-kit-alert")) {
    const alertModal = document.createElement("div");
    alertModal.className = "modal fade";
    alertModal.id = "modal-kit-alert";
    alertModal.tabIndex = -1;
    alertModal.setAttribute("aria-hidden", "true");
    alertModal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content shadow border">
          <div class="modal-header py-2 px-3">
            <h6 class="modal-title small fw-semibold text-body d-flex align-items-center gap-2" id="modal-kit-alert-title">
              <ion-icon name="information-circle-outline" class="text-primary"></ion-icon> Alert
            </h6>
            <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-3 small text-body" id="modal-kit-alert-message"></div>
          <div class="modal-footer py-2 px-3 border-top-0">
            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-kit-alert-ok" data-bs-dismiss="modal">OK</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(alertModal);
  }

  if (!document.getElementById("modal-kit-prompt")) {
    const promptModal = document.createElement("div");
    promptModal.className = "modal fade";
    promptModal.id = "modal-kit-prompt";
    promptModal.tabIndex = -1;
    promptModal.setAttribute("aria-hidden", "true");
    promptModal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content shadow border">
          <div class="modal-header py-2 px-3">
            <h6 class="modal-title small fw-semibold text-body d-flex align-items-center gap-2" id="modal-kit-prompt-title">
              <ion-icon name="chatbubble-ellipses-outline" class="text-primary"></ion-icon> Prompt
            </h6>
            <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-3">
            <label class="form-label small text-body" id="modal-kit-prompt-message"></label>
            <input type="text" class="form-control form-control-sm font-sans" id="modal-kit-prompt-input" />
          </div>
          <div class="modal-footer py-2 px-3">
            <button type="button" class="btn btn-outline-secondary btn-sm px-3" id="btn-kit-prompt-cancel" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-kit-prompt-ok">OK</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(promptModal);
  }
}

// Show custom asynchronous alert modal dialog
export function showCustomKitAlert(message, title = "Alert") {
  ensureCustomKitModals();
  return new Promise((resolve) => {
    const modalEl = document.getElementById("modal-kit-alert");
    if (!modalEl || !window.bootstrap?.Modal) {
      window.alert(message);
      resolve();
      return;
    }

    const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    const titleEl = document.getElementById("modal-kit-alert-title") || document.getElementById("kit-alert-title");
    const msgEl = document.getElementById("modal-kit-alert-message") || document.getElementById("kit-alert-message");
    const okBtn = document.getElementById("btn-kit-alert-ok");

    if (titleEl) titleEl.innerHTML = `<ion-icon name="information-circle-outline" class="text-primary me-2"></ion-icon>${escapeHtml(title)}`;
    if (msgEl) msgEl.textContent = String(message ?? "");

    let resolved = false;
    const onDismiss = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    modalEl.addEventListener("hidden.bs.modal", onDismiss, { once: true });
    okBtn?.addEventListener(
      "click",
      () => {
        modal.hide();
      },
      { once: true }
    );

    modal.show();
  });
}

// Show custom asynchronous prompt modal dialog
export function showCustomKitPrompt(message, defaultValue = "", title = "Prompt") {
  ensureCustomKitModals();
  return new Promise((resolve) => {
    const modalEl = document.getElementById("modal-kit-prompt");
    if (!modalEl || !window.bootstrap?.Modal) {
      const val = window.prompt(message, defaultValue);
      resolve(val !== null ? val : defaultValue);
      return;
    }

    const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    const titleEl = document.getElementById("modal-kit-prompt-title") || document.getElementById("kit-prompt-title");
    const msgEl = document.getElementById("modal-kit-prompt-message") || document.getElementById("kit-prompt-message");
    const inputEl = document.getElementById("modal-kit-prompt-input") || document.getElementById("kit-prompt-input");
    const okBtn = document.getElementById("btn-kit-prompt-ok");
    const cancelBtn = document.getElementById("btn-kit-prompt-cancel");

    if (titleEl) titleEl.innerHTML = `<ion-icon name="chatbubble-ellipses-outline" class="text-primary me-2"></ion-icon>${escapeHtml(title)}`;
    if (msgEl) msgEl.textContent = String(message ?? "");
    if (inputEl) inputEl.value = defaultValue || "";

    let resolved = false;
    const onDismiss = () => {
      if (!resolved) {
        resolved = true;
        resolve(defaultValue);
      }
    };

    const onOk = () => {
      if (!resolved) {
        resolved = true;
        const val = inputEl ? inputEl.value : "";
        modal.hide();
        resolve(val);
      }
    };

    const onKeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onOk();
      }
    };

    modalEl.addEventListener("hidden.bs.modal", onDismiss, { once: true });
    okBtn?.addEventListener("click", onOk, { once: true });
    cancelBtn?.addEventListener("click", () => modal.hide(), { once: true });
    inputEl?.addEventListener("keydown", onKeydown);

    modal.show();
    setTimeout(() => {
      inputEl?.focus();
      inputEl?.select();
    }, 200);
  });
}

// Evaluate script with current runtime values to generate live command arguments
export async function evaluateKitCommand(kit, values, interactive = false) {
  if (!kit || !kit.script) return [];

  const appSettings = loadSettings();

  const customAlert = (msg, title) => (interactive ? showCustomKitAlert(msg, title || "Kit Alert") : Promise.resolve());
  const customPrompt = (msg, def, title) => (interactive ? showCustomKitPrompt(msg, def || "", title || "Kit Prompt") : Promise.resolve(def || ""));

  const helpers = {
    getDefaultOutputDir: () => appSettings.outputDir || "C:\\Users\\User\\Videos",
    getSettings: () => ({ ...appSettings }),
    joinPath: (dir, file) => {
      if (!dir) return file || "";
      const cleanDir = dir.replace(/[/\\]+$/, "");
      const cleanFile = (file || "").replace(/^[/\\]+/, "");
      return `${cleanDir}\\${cleanFile}`;
    },
    splitArgs: (str) => {
      if (!str || typeof str !== "string") return [];
      const matches = str.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
      return matches ? matches.map((m) => m.replace(/^['"]|['"]$/g, "")) : [];
    },
    alert: customAlert,
    prompt: customPrompt,
  };

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(
      "ctx",
      "alert",
      "prompt",
      `
      const window = { alert, prompt };
      ${kit.script}
      if (typeof buildCommand === 'function') {
        return await buildCommand(ctx);
      }
      return [];
      `
    );
    const result = await fn(
      { values: { ...values }, helpers, alert: customAlert, prompt: customPrompt },
      customAlert,
      customPrompt
    );
    return Array.isArray(result) ? result : [];
  } catch (err) {
    return [`# Script Error: ${err.message}`];
  }
}

async function updateKitLivePreview() {
  const container = document.getElementById("kit-tab-content");
  if (!container || !activeKit) return;

  const pre = container.querySelector("#kit-cmd-preview");
  if (!pre) return;

  const args = await evaluateKitCommand(activeKit, kitRuntimeValues, false);
  if (args.length === 0) {
    pre.textContent = "ffmpeg [waiting for input media selection...]";
  } else if (args[0] && args[0].startsWith("# Script Error:")) {
    pre.textContent = args[0];
    pre.classList.add("text-danger");
  } else {
    pre.classList.remove("text-danger");
    const engine = activeKit.engine || "ffmpeg";
    pre.textContent = `${engine} ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`;
  }
}

// Global Execute Active Kit handler for bottom control bar
export async function executeActiveKit() {
  if (!activeKit) return;

  const container = document.getElementById("kit-tab-content");
  const statusPanel = container?.querySelector("#kit-execution-status-panel");
  const logBox = container?.querySelector("#kit-log-console");
  const progBar = container?.querySelector("#kit-job-progress-bar");
  const pctLabel = container?.querySelector("#kit-progress-pct");
  const statTime = container?.querySelector("#kit-stat-time");
  const statFps = container?.querySelector("#kit-stat-fps");
  const statSpeed = container?.querySelector("#kit-stat-speed");
  const statBitrate = container?.querySelector("#kit-stat-bitrate");
  const statusMsg = document.getElementById("status-message");

  if (isJobRunning()) {
    cancelFfmpegJob();
    return;
  }

  // Validate required fields
  const missingRequired = (activeKit.blocks || []).filter((b) => {
    if (!b.required) return false;
    if (b.type === "alert_box") return false;
    const val = kitRuntimeValues[b.id];
    if (val === undefined || val === null || val === "") return true;
    if (typeof val === "string" && val.trim() === "") return true;
    return false;
  });

  if (missingRequired.length > 0) {
    const names = missingRequired.map((b) => b.label || b.id).join(", ");
    await showCustomKitAlert(`Please provide required input for: ${names}`, "Missing Required Field");
    return;
  }

  const args = await evaluateKitCommand(activeKit, kitRuntimeValues, true);
  if (!args || args.length === 0) {
    await showCustomKitAlert("The kit script produced no command arguments. Please select an input file or verify buildCommand() in the Script Editor.", "No Command Generated");
    return;
  }
  if (args[0] && args[0].startsWith("# Script Error:")) {
    await showCustomKitAlert(args[0], "Script Error");
    return;
  }

  if (statusPanel) statusPanel.classList.remove("d-none");
  if (progBar) progBar.style.width = "0%";
  if (pctLabel) pctLabel.textContent = "0%";
  if (statTime) statTime.textContent = "Time: 00:00:00";
  if (statFps) statFps.textContent = "FPS: 0";
  if (statSpeed) statSpeed.textContent = "Speed: 0x";
  if (statBitrate) statBitrate.textContent = "Bitrate: 0 kbits/s";
  if (logBox) logBox.innerHTML = '<div class="text-info">Starting Kit Execution...</div>';
  if (statusMsg) statusMsg.textContent = `Running ${activeKit.name}...`;

  try {
    const jobPromise = executeFfmpegJob({
      args,
      totalDuration: 0,
      onLog: (line) => {
        if (!logBox) return;
        const d = document.createElement("div");
        d.textContent = line;
        logBox.appendChild(d);
        logBox.scrollTop = logBox.scrollHeight;
      },
      onProgress: (p) => {
        if (progBar) progBar.style.width = `${p.pct}%`;
        if (pctLabel) pctLabel.textContent = `${Math.round(p.pct)}%`;
        if (p.time && statTime) statTime.textContent = `Time: ${p.time}`;
        if (p.fps && statFps) statFps.textContent = `FPS: ${p.fps}`;
        if (p.speed && statSpeed) statSpeed.textContent = `Speed: ${p.speed}`;
        if (p.bitrate && statBitrate) statBitrate.textContent = `Bitrate: ${p.bitrate}`;
      },
    });

    await jobPromise;
    if (statusMsg) statusMsg.textContent = "Operation Completed";
  } catch (err) {
    if (logBox) {
      const errDiv = document.createElement("div");
      errDiv.className = "text-danger";
      errDiv.textContent = `Execution failed: ${err?.message || err}`;
      logBox.appendChild(errDiv);
    }
    if (statusMsg) statusMsg.textContent = "Error";
  } finally {
    if (progBar) progBar.style.width = "100%";
    if (pctLabel) pctLabel.textContent = "100%";
  }
}

// Global Reset Active Kit handler
export function resetActiveKit() {
  if (!activeKit) return;
  saveKitParams(activeKit.id, {});
  selectAndOpenKit(activeKit.id);
}

// -------------------------------------------------------------
// TAB 2: BLOCKS BUILDER (VISUAL IDE)
// -------------------------------------------------------------
function renderKitBuilderTab() {
  const container = document.getElementById("kit-tab-content");
  if (!container || !activeKit) return;

  const blocks = activeKit.blocks || [];

  const blockCategoriesHtml = Object.keys(BLOCK_TYPES).reduce((acc, key) => {
    const b = BLOCK_TYPES[key];
    const cat = b.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(b);
    return acc;
  }, {});

  const catKeys = Object.keys(blockCategoriesHtml);
  const blockDropdownHtml = catKeys
    .map((catTitle, catIdx) => {
      const items = blockCategoriesHtml[catTitle]
        .map(
          (b) => {
            const isBi = b.icon && (b.icon.startsWith("bi-") || b.icon.startsWith("bi "));
            const iconEl = isBi
              ? `<i class="${b.icon.startsWith("bi ") ? b.icon : "bi " + b.icon} text-primary fs-5 me-3 flex-shrink-0"></i>`
              : `<ion-icon name="${b.icon || "cube-outline"}" class="text-primary fs-5 me-3 flex-shrink-0"></ion-icon>`;
            return `
        <li>
          <a class="dropdown-item small d-flex align-items-center btn-add-block-type py-2" href="#" data-type="${b.type}">
            ${iconEl}
            <div class="flex-grow-1 min-w-0">
              <div class="fw-medium text-body text-truncate">${escapeHtml(b.name)}</div>
              <div class="text-body-secondary text-truncate" style="font-size: 0.72rem;">${escapeHtml(b.description)}</div>
            </div>
          </a>
        </li>
      `;
          }
        )
        .join("");

      const divider = catIdx < catKeys.length - 1 ? '<li><hr class="dropdown-divider my-1"></li>' : "";

      return `
        <div class="dropdown-header small text-uppercase text-body-secondary py-1">${catTitle}</div>
        ${items}
        ${divider}
      `;
    })
    .join("");

  const blocksListHtml =
    blocks.length === 0
      ? `<div class="p-4 text-center text-body-secondary">No blocks added yet. Click "+ Add Block" above to begin.</div>`
      : blocks
          .map((b, idx) => {
            const isEditing = editingBlockIndices.has(idx);
            const bDef = BLOCK_TYPES[b.type] || { name: b.type, icon: "cube-outline" };
            const bName = bDef.name || b.type;
            const bIcon = bDef.icon || "cube-outline";
            return `
          <div class="border-bottom kit-builder-row bg-body" data-block-id="${b.id}" data-idx="${idx}">
            <div class="d-flex align-items-center justify-content-between gap-2 py-2 px-3 kit-block-header-row user-select-none" data-idx="${idx}" title="Click to configure block" style="cursor: pointer;">
              <span class="kit-block-drag-handle text-secondary cursor-grab p-1 flex-shrink-0" data-drag-idx="${idx}" title="Drag vertically to reorder">
                <ion-icon name="reorder-two-outline" class="fs-5"></ion-icon>
              </span>
              <span class="text-body-secondary fw-semibold flex-shrink-0 me-1" style="font-size: 0.95rem; min-width: 1.1rem; line-height: 1;">${idx + 1}.</span>
              <div class="flex-grow-1 min-w-0">
                <div class="d-flex align-items-center gap-2 flex-wrap">
                  <strong class="text-body text-truncate small">${escapeHtml(b.label || b.id)}</strong>
                  <span class="badge rounded-pill bg-body-secondary text-body-secondary border d-inline-flex align-items-center gap-1 px-2 py-1" style="font-size: 0.72rem; font-weight: 500;">
                    <ion-icon name="${bIcon}" style="font-size: 0.8rem;"></ion-icon>
                    <span>${escapeHtml(bName)}</span>
                  </span>
                </div>
                <div class="small text-body-secondary text-truncate" style="font-size: 0.72rem; opacity: 0.85;">id: ${escapeHtml(b.id)}${b.help || b.placeholder ? ` &bull; ${escapeHtml(b.help || b.placeholder)}` : ""}</div>
              </div>
              <div class="btn-group btn-group-sm flex-shrink-0">
                <button class="btn btn-outline-secondary btn-edit-block ${isEditing ? "active" : ""}" type="button" data-idx="${idx}" title="${isEditing ? "Collapse parameters" : "Edit block parameters"}">
                  <i class="bi ${isEditing ? "bi-chevron-up" : "bi-pencil"}"></i>
                </button>
                <button class="btn btn-outline-secondary btn-move-block-up" type="button" data-idx="${idx}" title="Move Up" ${idx === 0 ? "disabled" : ""}>
                  <ion-icon name="arrow-up-outline"></ion-icon>
                </button>
                <button class="btn btn-outline-secondary btn-move-block-down" type="button" data-idx="${idx}" title="Move Down" ${idx === blocks.length - 1 ? "disabled" : ""}>
                  <ion-icon name="arrow-down-outline"></ion-icon>
                </button>
                <button class="btn btn-outline-danger btn-delete-block" type="button" data-idx="${idx}" title="Delete Block">
                  <ion-icon name="trash-outline"></ion-icon>
                </button>
              </div>
            </div>
            <div class="kit-block-curtain ${isEditing ? "is-open" : ""}" id="curtain-block-${idx}">
              <div class="kit-block-curtain-inner">
                ${renderBlockEditorHTML(b, idx)}
              </div>
            </div>
          </div>
        `;
          })
          .join("");

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="section-divider-header flex-grow-1 mb-0 me-3">Blocks Layout Structure</div>
      <div class="d-flex align-items-center gap-2 flex-shrink-0">
        <!-- Batch Modify Dropdown -->
        <div class="dropdown">
          <button class="btn btn-outline-secondary btn-sm dropdown-toggle d-flex align-items-center gap-1" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" id="btn-batch-modify-toggle" title="Batch modify multiple blocks">
            <ion-icon name="options-outline"></ion-icon> Batch Modify
          </button>
          <div class="dropdown-menu dropdown-menu-end shadow p-3" style="min-width: 620px; max-width: 95vw;" id="batch-modify-menu">
            <!-- Row 1: Target Scope & Filter Rule -->
            <div class="d-flex align-items-center flex-wrap gap-2 mb-2 bg-body-tertiary p-2 rounded border">
              <span class="small text-body-secondary flex-shrink-0">Target:</span>
              <select class="form-select form-select-sm" id="batch-target-type" style="width: auto; cursor: pointer;">
                <option value="any">All blocks</option>
                <option value="inputs">All input controls</option>
                <option value="settings">Settings blocks</option>
                <option value="output">Output blocks</option>
                <option value="file_input">File pickers</option>
                <option value="folder_picker">Folder pickers</option>
                <option value="output_filename">Output filename</option>
                <option value="select">Dropdown selects</option>
                <option value="text">Text inputs</option>
                <option value="textarea">Text areas</option>
                <option value="number">Number inputs</option>
                <option value="slider">Sliders</option>
                <option value="checkbox">Toggle switches</option>
                <option value="radios">Radio choices</option>
                <option value="alert_box">Alert callouts</option>
              </select>

              <span class="small text-body-secondary flex-shrink-0">where:</span>
              <select class="form-select form-select-sm" id="batch-filter-mode" style="width: auto; cursor: pointer;">
                <option value="all">any block</option>
                <option value="name_contains">label or ID contains</option>
                <option value="name_regex">label or ID matches regex</option>
                <option value="name_starts_with">label or ID starts with</option>
                <option value="name_ends_with">label or ID ends with</option>
                <option value="required_is">required is true</option>
                <option value="not_required">required is false</option>
                <option value="has_desc">has description</option>
                <option value="no_desc">has no description</option>
                <option value="has_placeholder">has placeholder</option>
                <option value="no_placeholder">has no placeholder</option>
                <option value="has_default">has default value</option>
                <option value="index_even">even positions (2nd, 4th...)</option>
                <option value="index_odd">odd positions (1st, 3rd...)</option>
                <option value="index_first_n">first N blocks</option>
                <option value="index_last_n">last N blocks</option>
                <option value="custom_js">JavaScript expression</option>
              </select>

              <input type="text" class="form-control form-control-sm d-none flex-grow-1" id="batch-filter-query" placeholder="filter query..." style="min-width: 140px;" />
            </div>

            <!-- Row 2: Operation, Target Property & Value Inputs -->
            <div class="d-flex align-items-center flex-wrap gap-2 mb-3 bg-body-tertiary p-2 rounded border">
              <select class="form-select form-select-sm" id="batch-op" style="width: auto; cursor: pointer;">
                <option value="set">Set</option>
                <option value="clear">Clear</option>
                <option value="prepend">Prepend</option>
                <option value="append">Append</option>
                <option value="replace">Find & replace</option>
                <option value="invert">Invert / toggle</option>
                <option value="case_transform">Change case</option>
              </select>

              <select class="form-select form-select-sm" id="batch-prop" style="width: auto; cursor: pointer;">
                <option value="required">required</option>
                <option value="label">display label</option>
                <option value="help">description (help text)</option>
                <option value="placeholder">placeholder</option>
                <option value="default">default value</option>
              </select>

              <span class="small text-body-secondary" id="batch-to-label">to</span>

              <div class="flex-grow-1 d-flex align-items-center gap-2" id="batch-val-wrapper" style="min-width: 150px;">
                <select class="form-select form-select-sm" id="batch-val-select" style="cursor: pointer;">
                  <option value="true">true (checked)</option>
                  <option value="false">false (unchecked)</option>
                </select>
                <input type="text" class="form-control form-control-sm d-none" id="batch-val-text" placeholder="value to apply..." />
                
                <!-- Find & Replace Sub-inputs -->
                <div class="d-none w-100 d-flex gap-2" id="batch-val-replace-group">
                  <input type="text" class="form-control form-control-sm" id="batch-val-find" placeholder="find text or /regex/..." />
                  <input type="text" class="form-control form-control-sm" id="batch-val-replace" placeholder="replace with..." />
                </div>

                <!-- Case Transform Sub-select -->
                <select class="form-select form-select-sm d-none" id="batch-val-case" style="cursor: pointer;">
                  <option value="uppercase">uppercase</option>
                  <option value="lowercase">lowercase</option>
                  <option value="titlecase">title case</option>
                </select>
              </div>
            </div>

            <!-- Summary & Actions Bar (No HR / No Top Border, No Matched Badge) -->
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 pt-0">
              <span class="small text-body-secondary text-truncate me-2 flex-grow-1 min-w-0" id="batch-summary-preview">Set required = true on all blocks</span>
              <div class="d-flex gap-2 flex-shrink-0">
                <button type="button" class="btn btn-outline-secondary btn-sm px-3" id="btn-batch-cancel">Cancel</button>
                <button type="button" class="btn btn-primary btn-sm px-3" id="btn-batch-apply"><ion-icon name="checkmark-outline" class="me-1"></ion-icon>Apply</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Add Block Dropdown -->
        <div class="dropdown">
          <button class="btn btn-primary btn-sm dropdown-toggle d-flex align-items-center gap-1" type="button" data-bs-toggle="dropdown" aria-expanded="false">
            <ion-icon name="add-outline"></ion-icon> Add Block
          </button>
          <ul class="dropdown-menu dropdown-menu-end shadow" style="max-height: 420px; overflow-y: auto; overflow-x: hidden; width: 330px; min-width: 320px;">
            ${blockDropdownHtml}
          </ul>
        </div>
      </div>
    </div>
    <div class="border rounded overflow-hidden" id="kit-blocks-list-container">
      ${blocksListHtml}
    </div>
  `;

  // Bind dropdown menus
  bindUniversalDropdowns(container);

  // Batch modify interactions
  const batchTargetTypeSelect = container.querySelector("#batch-target-type");
  const batchFilterModeSelect = container.querySelector("#batch-filter-mode");
  const batchFilterQueryInput = container.querySelector("#batch-filter-query");
  const batchOpSelect = container.querySelector("#batch-op");
  const batchPropSelect = container.querySelector("#batch-prop");
  const batchValSelect = container.querySelector("#batch-val-select");
  const batchValText = container.querySelector("#batch-val-text");
  const batchValWrapper = container.querySelector("#batch-val-wrapper");
  const batchValReplaceGroup = container.querySelector("#batch-val-replace-group");
  const batchValFind = container.querySelector("#batch-val-find");
  const batchValReplace = container.querySelector("#batch-val-replace");
  const batchValCase = container.querySelector("#batch-val-case");
  const batchToLabel = container.querySelector("#batch-to-label");
  const batchTargetBadge = container.querySelector("#batch-target-count");
  const batchSummaryPreview = container.querySelector("#batch-summary-preview");
  const btnBatchApply = container.querySelector("#btn-batch-apply");
  const btnBatchCancel = container.querySelector("#btn-batch-cancel");

  const isInputType = (type) => {
    return ["file_input", "folder_picker", "output_filename", "select", "text", "textarea", "number", "slider", "checkbox", "radios"].includes(type);
  };

  const getMatchingBlocks = () => {
    const selectedType = batchTargetTypeSelect ? batchTargetTypeSelect.value : "any";
    const filterMode = batchFilterModeSelect ? batchFilterModeSelect.value : "all";
    const filterQuery = (batchFilterQueryInput?.value || "").trim();
    const queryLower = filterQuery.toLowerCase();
    const allBlocks = activeKit.blocks || [];

    return allBlocks.filter((b, idx) => {
      // 1. Target scope filter
      if (selectedType === "inputs" && !isInputType(b.type)) return false;
      if (selectedType === "settings" && b.category !== "settings") return false;
      if (selectedType === "output" && b.category !== "output") return false;
      if (selectedType !== "any" && selectedType !== "inputs" && selectedType !== "settings" && selectedType !== "output" && b.type !== selectedType) return false;

      // 2. Complex Filter Condition
      if (filterMode === "name_contains") {
        if (queryLower) {
          const matchLabel = (b.label || "").toLowerCase().includes(queryLower);
          const matchId = (b.id || "").toLowerCase().includes(queryLower);
          if (!matchLabel && !matchId) return false;
        }
      } else if (filterMode === "name_regex") {
        if (filterQuery) {
          try {
            const re = new RegExp(filterQuery, "i");
            if (!re.test(b.label || "") && !re.test(b.id || "")) return false;
          } catch {
            return false;
          }
        }
      } else if (filterMode === "name_starts_with") {
        if (queryLower) {
          const matchLabel = (b.label || "").toLowerCase().startsWith(queryLower);
          const matchId = (b.id || "").toLowerCase().startsWith(queryLower);
          if (!matchLabel && !matchId) return false;
        }
      } else if (filterMode === "name_ends_with") {
        if (queryLower) {
          const matchLabel = (b.label || "").toLowerCase().endsWith(queryLower);
          const matchId = (b.id || "").toLowerCase().endsWith(queryLower);
          if (!matchLabel && !matchId) return false;
        }
      } else if (filterMode === "required_is") {
        if (!b.required) return false;
      } else if (filterMode === "not_required") {
        if (b.required) return false;
      } else if (filterMode === "has_desc") {
        if (!b.help && !b.placeholder) return false;
      } else if (filterMode === "no_desc") {
        if (b.help || b.placeholder) return false;
      } else if (filterMode === "has_placeholder") {
        if (!b.placeholder) return false;
      } else if (filterMode === "no_placeholder") {
        if (b.placeholder) return false;
      } else if (filterMode === "has_default") {
        if (b.default === undefined || b.default === null || b.default === "") return false;
      } else if (filterMode === "index_even") {
        if ((idx + 1) % 2 !== 0) return false;
      } else if (filterMode === "index_odd") {
        if ((idx + 1) % 2 === 0) return false;
      } else if (filterMode === "index_first_n") {
        const count = parseInt(filterQuery, 10) || 1;
        if (idx >= count) return false;
      } else if (filterMode === "index_last_n") {
        const count = parseInt(filterQuery, 10) || 1;
        if (idx < allBlocks.length - count) return false;
      } else if (filterMode === "custom_js") {
        if (filterQuery) {
          try {
            const fn = new Function("b", "idx", "blocks", `return Boolean(${filterQuery});`);
            if (!fn(b, idx, allBlocks)) return false;
          } catch {
            return false;
          }
        }
      }

      return true;
    });
  };

  const updateBatchUI = () => {
    if (!batchPropSelect || !batchOpSelect) return;
    const prop = batchPropSelect.value;
    const op = batchOpSelect.value;
    const filterMode = batchFilterModeSelect?.value || "all";

    // Dynamic Filter Query input placeholder & visibility
    if (["name_contains", "name_regex", "name_starts_with", "name_ends_with", "index_first_n", "index_last_n", "custom_js"].includes(filterMode)) {
      batchFilterQueryInput?.classList.remove("d-none");
      if (filterMode === "name_contains") batchFilterQueryInput.placeholder = "Contains text (e.g. video)...";
      else if (filterMode === "name_regex") batchFilterQueryInput.placeholder = "Regex (e.g. ^opt_.*)...";
      else if (filterMode === "name_starts_with") batchFilterQueryInput.placeholder = "Starts with prefix...";
      else if (filterMode === "name_ends_with") batchFilterQueryInput.placeholder = "Ends with suffix...";
      else if (filterMode === "index_first_n") batchFilterQueryInput.placeholder = "Count (e.g. 3)...";
      else if (filterMode === "index_last_n") batchFilterQueryInput.placeholder = "Count (e.g. 2)...";
      else if (filterMode === "custom_js") batchFilterQueryInput.placeholder = "JS code e.g. b.required || b.type === 'slider'...";
    } else {
      batchFilterQueryInput?.classList.add("d-none");
    }

    const totalBlocks = (activeKit.blocks || []).length;
    const targets = getMatchingBlocks();

    if (batchTargetBadge) {
      batchTargetBadge.textContent = `${targets.length} of ${totalBlocks} matched`;
    }

    // Configure operator inputs
    batchValSelect?.classList.add("d-none");
    batchValText?.classList.add("d-none");
    batchValReplaceGroup?.classList.add("d-none");
    batchValCase?.classList.add("d-none");
    if (batchToLabel) batchToLabel.classList.remove("d-none");

    if (op === "clear" || op === "invert") {
      if (batchToLabel) batchToLabel.classList.add("d-none");
    } else if (op === "replace") {
      if (batchToLabel) batchToLabel.textContent = "in";
      batchValReplaceGroup?.classList.remove("d-none");
    } else if (op === "case_transform") {
      if (batchToLabel) batchToLabel.textContent = "to";
      batchValCase?.classList.remove("d-none");
    } else {
      if (batchToLabel) batchToLabel.textContent = op === "prepend" ? "with prefix" : (op === "append" ? "with suffix" : "to");
      if (prop === "required" && op === "set") {
        batchValSelect?.classList.remove("d-none");
      } else {
        batchValText?.classList.remove("d-none");
        if (op === "prepend") batchValText.placeholder = "Prefix string...";
        else if (op === "append") batchValText.placeholder = "Suffix string...";
        else batchValText.placeholder = "Value to apply...";
      }
    }

    if (batchSummaryPreview) {
      const typeLabel = batchTargetTypeSelect?.options[batchTargetTypeSelect.selectedIndex]?.text?.toLowerCase() || "blocks";
      const propLabel = batchPropSelect?.options[batchPropSelect.selectedIndex]?.text?.toLowerCase() || "property";
      
      let valSnippet = "";
      if (op === "clear") valSnippet = `Clear ${propLabel}`;
      else if (op === "invert") valSnippet = `Invert ${propLabel}`;
      else if (op === "replace") valSnippet = `Replace "${batchValFind?.value || ""}" with "${batchValReplace?.value || ""}" in ${propLabel}`;
      else if (op === "case_transform") valSnippet = `Convert ${propLabel} to ${batchValCase?.value || "uppercase"}`;
      else if (op === "prepend") valSnippet = `Prepend "${batchValText?.value || ""}" to ${propLabel}`;
      else if (op === "append") valSnippet = `Append "${batchValText?.value || ""}" to ${propLabel}`;
      else {
        const val = prop === "required" ? batchValSelect?.value : `"${batchValText?.value || ""}"`;
        valSnippet = `Set ${propLabel} = ${val}`;
      }

      batchSummaryPreview.textContent = `${valSnippet} for ${typeLabel}`;
    }
  };

  [batchTargetTypeSelect, batchFilterModeSelect, batchFilterQueryInput, batchOpSelect, batchPropSelect, batchValSelect, batchValText, batchValFind, batchValReplace, batchValCase].forEach((el) => {
    el?.addEventListener("change", updateBatchUI);
    el?.addEventListener("input", updateBatchUI);
  });

  updateBatchUI();

  btnBatchCancel?.addEventListener("click", () => {
    const dropdownToggle = container.querySelector("#btn-batch-modify-toggle");
    if (dropdownToggle && window.bootstrap?.Dropdown) {
      const dd = window.bootstrap.Dropdown.getInstance(dropdownToggle);
      if (dd) dd.hide();
    }
  });

  btnBatchApply?.addEventListener("click", () => {
    const prop = batchPropSelect?.value || "required";
    const op = batchOpSelect?.value || "set";
    const targets = getMatchingBlocks();

    if (targets.length === 0) {
      showCustomKitAlert("No blocks matched the selected criteria.", "Batch Modify");
      return;
    }

    const toTitleCase = (str) => {
      return (str || "").replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    };

    targets.forEach((b) => {
      if (op === "clear") {
        if (prop === "required") b.required = false;
        else if (prop === "help") b.help = "";
        else if (prop === "placeholder") b.placeholder = "";
        else if (prop === "default") b.default = "";
        else if (prop === "label") b.label = b.id;
      } else if (op === "invert") {
        if (prop === "required") b.required = !b.required;
        else if (b.type === "checkbox" && prop === "default") b.default = !b.default;
      } else if (op === "replace") {
        const findStr = batchValFind?.value || "";
        const replaceStr = batchValReplace?.value || "";
        if (findStr) {
          let targetStr = String(b[prop] || "");
          if (findStr.startsWith("/") && findStr.lastIndexOf("/") > 0) {
            const lastSlash = findStr.lastIndexOf("/");
            const pattern = findStr.slice(1, lastSlash);
            const flags = findStr.slice(lastSlash + 1);
            try {
              const re = new RegExp(pattern, flags);
              targetStr = targetStr.replace(re, replaceStr);
            } catch {
              targetStr = targetStr.replaceAll(findStr, replaceStr);
            }
          } else {
            targetStr = targetStr.replaceAll(findStr, replaceStr);
          }
          b[prop] = targetStr;
        }
      } else if (op === "case_transform") {
        const caseMode = batchValCase?.value || "uppercase";
        const currentStr = String(b[prop] || "");
        if (caseMode === "uppercase") b[prop] = currentStr.toUpperCase();
        else if (caseMode === "lowercase") b[prop] = currentStr.toLowerCase();
        else if (caseMode === "titlecase") b[prop] = toTitleCase(currentStr);
      } else if (op === "prepend") {
        const prefix = batchValText?.value || "";
        if (prefix) b[prop] = `${prefix}${b[prop] || ""}`;
      } else if (op === "append") {
        const suffix = batchValText?.value || "";
        if (suffix) b[prop] = `${b[prop] || ""}${suffix}`;
      } else {
        // Set operation
        if (prop === "required") {
          b.required = batchValSelect?.value === "true";
        } else if (prop === "help") {
          b.help = batchValText?.value || "";
        } else if (prop === "placeholder") {
          b.placeholder = batchValText?.value || "";
        } else if (prop === "label") {
          b.label = batchValText?.value || b.id;
        } else if (prop === "default") {
          b.default = batchValText?.value || "";
        }
      }
    });

    saveUserKit(activeKit);
    renderKitBuilderTab();
  });

  // Attach pointer drag reordering to each block row
  const listContainer = container.querySelector("#kit-blocks-list-container");
  if (listContainer) {
    listContainer.querySelectorAll(".kit-builder-row").forEach((itemEl, index) => {
      const handle = itemEl.querySelector(".kit-block-drag-handle");
      if (handle) {
        setupBlockItemDrag(itemEl, handle, index, listContainer);
      }
    });
  }

  // Bind block builder actions
  container.querySelectorAll(".btn-add-block-type").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const type = btn.dataset.type;
      const newBlock = createBlockInstance(type);
      activeKit.blocks.push(newBlock);
      editingBlockIndices.clear();
      editingBlockIndices.add(activeKit.blocks.length - 1);
      saveUserKit(activeKit);
      renderKitBuilderTab();
    });
  });

  // Toggle inline block editor with smooth curtain transition (single-open accordion)
  const toggleCurtain = (idx) => {
    const isCurrentlyOpen = editingBlockIndices.has(idx);

    // Close any currently open blocks
    editingBlockIndices.forEach((openIdx) => {
      if (openIdx !== idx) {
        const otherCurtain = container.querySelector(`#curtain-block-${openIdx}`);
        const otherEditBtn = container.querySelector(`.btn-edit-block[data-idx="${openIdx}"]`);
        if (otherCurtain) otherCurtain.classList.remove("is-open");
        if (otherEditBtn) {
          otherEditBtn.classList.remove("active");
          otherEditBtn.innerHTML = '<i class="bi bi-pencil"></i>';
          otherEditBtn.title = "Edit block parameters";
        }
      }
    });
    editingBlockIndices.clear();

    const curtain = container.querySelector(`#curtain-block-${idx}`);
    const editBtn = container.querySelector(`.btn-edit-block[data-idx="${idx}"]`);
    if (!curtain) return;

    if (!isCurrentlyOpen) {
      editingBlockIndices.add(idx);
      curtain.classList.add("is-open");
      if (editBtn) {
        editBtn.classList.add("active");
        editBtn.innerHTML = '<i class="bi bi-chevron-up"></i>';
        editBtn.title = "Collapse parameters";
      }
    } else {
      curtain.classList.remove("is-open");
      if (editBtn) {
        editBtn.classList.remove("active");
        editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
        editBtn.title = "Edit block parameters";
      }
    }
  };

  // Single click header row to toggle curtain
  container.querySelectorAll(".kit-block-header-row").forEach((headerRow) => {
    headerRow.addEventListener("click", (e) => {
      if (e.target.closest("button, .btn, .kit-block-drag-handle, input, select, textarea")) return;
      const idx = parseInt(headerRow.dataset.idx, 10);
      toggleCurtain(idx);
    });
  });

  // Click edit button to toggle curtain
  container.querySelectorAll(".btn-edit-block").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      toggleCurtain(idx);
    });
  });

  // Done editing block button
  container.querySelectorAll(".btn-done-editing-block").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      if (editingBlockIndices.has(idx)) {
        toggleCurtain(idx);
      }
    });
  });

  // Handle block property field updates
  container.querySelectorAll(".block-edit-field").forEach((field) => {
    const updateField = () => {
      const idx = parseInt(field.dataset.idx, 10);
      const key = field.dataset.field;
      if (!activeKit.blocks[idx]) return;

      if (field.type === "checkbox") {
        activeKit.blocks[idx][key] = field.checked;
      } else if (field.type === "number") {
        activeKit.blocks[idx][key] = field.value === "" ? 0 : parseFloat(field.value);
      } else {
        activeKit.blocks[idx][key] = field.value;
      }
      saveUserKit(activeKit);
    };

    field.addEventListener("input", updateField);
    field.addEventListener("change", updateField);
  });

  // Add option to select / radios block
  container.querySelectorAll(".btn-add-block-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (!activeKit.blocks[idx]) return;
      activeKit.blocks[idx].options = activeKit.blocks[idx].options || [];
      activeKit.blocks[idx].options.push({
        value: `opt_${Date.now().toString().slice(-4)}`,
        label: "New Option",
      });
      saveUserKit(activeKit);
      renderKitBuilderTab();
    });
  });

  // Remove option from select / radios block
  container.querySelectorAll(".btn-remove-block-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const optIdx = parseInt(btn.dataset.optIdx, 10);
      if (!activeKit.blocks[idx] || !activeKit.blocks[idx].options) return;
      activeKit.blocks[idx].options.splice(optIdx, 1);
      saveUserKit(activeKit);
      renderKitBuilderTab();
    });
  });

  // Update option values & labels
  container.querySelectorAll(".block-opt-val, .block-opt-lbl").forEach((input) => {
    input.addEventListener("input", () => {
      const idx = parseInt(input.dataset.idx, 10);
      const optIdx = parseInt(input.dataset.optIdx, 10);
      if (!activeKit.blocks[idx] || !activeKit.blocks[idx].options || !activeKit.blocks[idx].options[optIdx]) return;

      if (input.classList.contains("block-opt-val")) {
        activeKit.blocks[idx].options[optIdx].value = input.value;
      } else {
        activeKit.blocks[idx].options[optIdx].label = input.value;
      }
      saveUserKit(activeKit);
    });
  });

  container.querySelectorAll(".btn-move-block-up").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      if (idx > 0) {
        const temp = activeKit.blocks[idx];
        activeKit.blocks[idx] = activeKit.blocks[idx - 1];
        activeKit.blocks[idx - 1] = temp;
        const newEditing = new Set();
        editingBlockIndices.forEach((openIdx) => {
          if (openIdx === idx) newEditing.add(idx - 1);
          else if (openIdx === idx - 1) newEditing.add(idx);
          else newEditing.add(openIdx);
        });
        editingBlockIndices = newEditing;
        saveUserKit(activeKit);
        renderKitBuilderTab();
      }
    });
  });

  container.querySelectorAll(".btn-move-block-down").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      if (idx < activeKit.blocks.length - 1) {
        const temp = activeKit.blocks[idx];
        activeKit.blocks[idx] = activeKit.blocks[idx + 1];
        activeKit.blocks[idx + 1] = temp;
        const newEditing = new Set();
        editingBlockIndices.forEach((openIdx) => {
          if (openIdx === idx) newEditing.add(idx + 1);
          else if (openIdx === idx + 1) newEditing.add(idx);
          else newEditing.add(openIdx);
        });
        editingBlockIndices = newEditing;
        saveUserKit(activeKit);
        renderKitBuilderTab();
      }
    });
  });

  container.querySelectorAll(".btn-delete-block").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      activeKit.blocks.splice(idx, 1);
      const newEditing = new Set();
      editingBlockIndices.forEach((openIdx) => {
        if (openIdx < idx) newEditing.add(openIdx);
        else if (openIdx > idx) newEditing.add(openIdx - 1);
      });
      editingBlockIndices = newEditing;
      saveUserKit(activeKit);
      renderKitBuilderTab();
    });
  });
}

// Generate inline configuration editor HTML for a specific block
function renderBlockEditorHTML(b, idx) {
  let specificFieldsHtml = "";

  if (b.type === "file_input") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Filter Type</label>
        <div class="col">
          <select class="form-select form-select-sm block-edit-field" data-idx="${idx}" data-field="fileFilter" style="cursor: pointer;">
            <option value="all" ${b.fileFilter === "all" ? "selected" : ""}>All Media Files (*.*)</option>
            <option value="video" ${b.fileFilter === "video" ? "selected" : ""}>Video Files (*.mp4, *.mkv, etc.)</option>
            <option value="audio" ${b.fileFilter === "audio" ? "selected" : ""}>Audio Files (*.mp3, *.wav, etc.)</option>
            <option value="image" ${b.fileFilter === "image" ? "selected" : ""}>Image Files (*.png, *.jpg, etc.)</option>
          </select>
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Placeholder</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="placeholder" value="${escapeHtml(b.placeholder || "")}" placeholder="Select or drop a media file..." />
        </div>
      </div>
    `;
  } else if (b.type === "folder_picker") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Placeholder</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="placeholder" value="${escapeHtml(b.placeholder || "")}" placeholder="Default output directory..." />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">App Default</label>
        <div class="col">
          <div class="form-check form-switch">
            <input class="form-check-input block-edit-field" type="checkbox" data-idx="${idx}" data-field="useAppDefault" id="edit-appdef-${idx}" ${b.useAppDefault !== false ? "checked" : ""}>
            <label class="form-check-label small" for="edit-appdef-${idx}">Use default app video output directory</label>
          </div>
        </div>
      </div>
    `;
  } else if (b.type === "output_filename") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Default Name</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="placeholder" value="${escapeHtml(b.placeholder || "output")}" placeholder="e.g. output" />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Default Suffix</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="suffix" value="${escapeHtml(b.suffix || "_processed")}" placeholder="e.g. _processed" />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Extension</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="ext" value="${escapeHtml(b.ext || "mp4")}" placeholder="e.g. mp4" />
        </div>
      </div>
    `;
  } else if (b.type === "select" || b.type === "radios") {
    const opts = b.options || [];
    const optionsRowsHtml = opts
      .map(
        (opt, optIdx) => `
      <div class="d-flex align-items-center gap-2 block-option-row" data-opt-idx="${optIdx}">
        <input type="text" class="form-control form-control-sm block-opt-lbl" data-idx="${idx}" data-opt-idx="${optIdx}" placeholder="Label (e.g. MP4 Video)" value="${escapeHtml(opt.label)}" />
        <input type="text" class="form-control form-control-sm block-opt-val" data-idx="${idx}" data-opt-idx="${optIdx}" placeholder="Value (e.g. mp4)" value="${escapeHtml(opt.value)}" />
        <button class="btn btn-outline-danger btn-sm flex-shrink-0 btn-remove-block-opt" type="button" data-idx="${idx}" data-opt-idx="${optIdx}" title="Remove option">
          <ion-icon name="close-outline"></ion-icon>
        </button>
      </div>
    `
      )
      .join("");

    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Default Value</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="default" value="${escapeHtml(b.default || "")}" placeholder="Default selected option value..." />
        </div>
      </div>
      <div class="row g-2 mb-2">
        <label class="col-auto col-form-label small fw-medium text-body pt-1" style="width: 120px; flex-shrink: 0;">Choices</label>
        <div class="col">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="small text-body-secondary" style="font-size: 0.75rem;">Label &amp; Value Pairs</span>
            <button class="btn btn-outline-primary btn-sm py-0 px-2 btn-add-block-opt" type="button" data-idx="${idx}">
              <ion-icon name="add-outline"></ion-icon> Add Option
            </button>
          </div>
          <div class="border rounded p-2 bg-body d-flex flex-column gap-2">
            ${optionsRowsHtml || '<div class="small text-body-secondary">No options defined yet. Click "+ Add Option" above.</div>'}
          </div>
        </div>
      </div>
    `;
  } else if (b.type === "number" || b.type === "slider") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Default Value</label>
        <div class="col">
          <input type="number" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="default" value="${b.default !== undefined ? b.default : 0}" />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Minimum</label>
        <div class="col">
          <input type="number" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="min" value="${b.min !== undefined ? b.min : 0}" />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Maximum</label>
        <div class="col">
          <input type="number" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="max" value="${b.max !== undefined ? b.max : 100}" />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Step</label>
        <div class="col">
          <input type="number" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="step" value="${b.step !== undefined ? b.step : 1}" />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Unit Label</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="unit" value="${escapeHtml(b.unit || "")}" placeholder="e.g. %, CRF, kbps" />
        </div>
      </div>
    `;
  } else if (b.type === "text") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Placeholder</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="placeholder" value="${escapeHtml(b.placeholder || "")}" placeholder="Enter placeholder text..." />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Default Value</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="default" value="${escapeHtml(b.default || "")}" placeholder="Default text value..." />
        </div>
      </div>
    `;
  } else if (b.type === "textarea") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Placeholder</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="placeholder" value="${escapeHtml(b.placeholder || "")}" placeholder="Enter multi-line placeholder..." />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Default Rows</label>
        <div class="col">
          <input type="number" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="rows" value="${b.rows || 3}" min="1" max="20" />
        </div>
      </div>
      <div class="row g-2 mb-2">
        <label class="col-auto col-form-label small fw-medium text-body pt-1" style="width: 120px; flex-shrink: 0;">Default Text</label>
        <div class="col">
          <textarea class="form-control form-control-sm block-edit-field font-sans" data-idx="${idx}" data-field="default" rows="2" placeholder="Default content...">${escapeHtml(b.default || "")}</textarea>
        </div>
      </div>
    `;
  } else if (b.type === "checkbox") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Default State</label>
        <div class="col">
          <div class="form-check form-switch">
            <input class="form-check-input block-edit-field" type="checkbox" data-idx="${idx}" data-field="default" id="edit-chkdef-${idx}" ${b.default ? "checked" : ""}>
            <label class="form-check-label small" for="edit-chkdef-${idx}">Default enabled / checked</label>
          </div>
        </div>
      </div>
    `;
  } else if (b.type === "alert_box") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Alert Title</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="title" value="${escapeHtml(b.title || "Note")}" placeholder="e.g. Note" />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Variant</label>
        <div class="col">
          <select class="form-select form-select-sm block-edit-field" data-idx="${idx}" data-field="variant" style="cursor: pointer;">
            <option value="info" ${b.variant === "info" ? "selected" : ""}>Info (Blue)</option>
            <option value="success" ${b.variant === "success" ? "selected" : ""}>Success (Green)</option>
            <option value="warning" ${b.variant === "warning" ? "selected" : ""}>Warning (Yellow)</option>
            <option value="danger" ${b.variant === "danger" ? "selected" : ""}>Danger (Red)</option>
            <option value="secondary" ${b.variant === "secondary" ? "selected" : ""}>Secondary (Gray)</option>
          </select>
        </div>
      </div>
      <div class="row g-2 mb-2">
        <label class="col-auto col-form-label small fw-medium text-body pt-1" style="width: 120px; flex-shrink: 0;">Content</label>
        <div class="col">
          <textarea class="form-control form-control-sm block-edit-field font-sans" data-idx="${idx}" data-field="content" rows="2" placeholder="Alert message text...">${escapeHtml(b.content || "")}</textarea>
        </div>
      </div>
    `;
  } else if (b.type === "progress_and_logs") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Max Lines</label>
        <div class="col">
          <input type="number" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="maxLogLines" value="${b.maxLogLines || 300}" />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Show Logs</label>
        <div class="col">
          <div class="form-check form-switch">
            <input class="form-check-input block-edit-field" type="checkbox" data-idx="${idx}" data-field="showLogs" id="edit-showlogs-${idx}" ${b.showLogs !== false ? "checked" : ""}>
            <label class="form-check-label small" for="edit-showlogs-${idx}">Show log console output box</label>
          </div>
        </div>
      </div>
    `;
  }

  const isInputType = b.type !== "alert_box" && b.type !== "command_preview" && b.type !== "progress_and_logs";

  return `
    <div class="p-3 bg-body-tertiary border-top kit-block-editor-panel" data-idx="${idx}">
      <!-- Row 1: Identifier (At very top) -->
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Identifier</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field font-sans" data-idx="${idx}" data-field="id" value="${escapeHtml(b.id || "")}" placeholder="Machine identifier (ctx.values.id)" />
        </div>
      </div>

      <!-- Row 2: Display Label -->
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Label</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="label" value="${escapeHtml(b.label || "")}" placeholder="Field display label..." />
        </div>
      </div>

      <!-- Row 3: Description -->
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Description</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="help" value="${escapeHtml(b.help || "")}" placeholder="Description or hint text..." />
        </div>
      </div>

      <!-- Row 4: Required Checkbox for input blocks -->
      ${
        isInputType
          ? `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Required</label>
        <div class="col">
          <div class="form-check form-switch">
            <input class="form-check-input block-edit-field" type="checkbox" data-idx="${idx}" data-field="required" id="edit-req-${idx}" ${b.required ? "checked" : ""}>
            <label class="form-check-label small" for="edit-req-${idx}">Required before execution</label>
          </div>
        </div>
      </div>
      `
          : ""
      }

      <!-- Specific Type Fields -->
      ${specificFieldsHtml}

      <div class="d-flex justify-content-end mt-2">
        <button class="btn btn-primary btn-sm px-3 btn-done-editing-block" type="button" data-idx="${idx}">
          <ion-icon name="checkmark-outline" class="me-1"></ion-icon> Done
        </button>
      </div>
    </div>
  `;
}

// Vertical pointer drag reordering with real-time shift animations for UI Blocks
function setupBlockItemDrag(itemEl, dragHandle, index, listContainer) {
  setupListDragAndDrop({
    itemEl,
    dragHandle,
    index,
    listContainer,
    itemSelector: ".kit-builder-row",
    onReorder: (startIndex, targetIndex) => {
      if (targetIndex !== startIndex && targetIndex >= 0 && targetIndex < activeKit.blocks.length) {
        const newEditing = new Set();
        editingBlockIndices.forEach((openIdx) => {
          if (openIdx === startIndex) {
            newEditing.add(targetIndex);
          } else if (startIndex < targetIndex && openIdx > startIndex && openIdx <= targetIndex) {
            newEditing.add(openIdx - 1);
          } else if (startIndex > targetIndex && openIdx >= targetIndex && openIdx < startIndex) {
            newEditing.add(openIdx + 1);
          } else {
            newEditing.add(openIdx);
          }
        });
        editingBlockIndices = newEditing;

        const moved = activeKit.blocks.splice(startIndex, 1)[0];
        activeKit.blocks.splice(targetIndex, 0, moved);
        saveUserKit(activeKit);
        renderKitBuilderTab();
      }
    },
  });
}

// 10 Common Monaco Themes configuration and color schemes
export const MONACO_THEMES = [
  { id: "vs-dark", name: "VS Code Dark" },
  { id: "vs", name: "VS Code Light" },
  { id: "hc-black", name: "High Contrast Dark" },
  {
    id: "monokai",
    name: "Monokai",
    data: {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "75715e" },
        { token: "keyword", foreground: "f92672" },
        { token: "string", foreground: "e6db74" },
        { token: "number", foreground: "ae81ff" },
        { token: "identifier", foreground: "f8f8f2" },
        { token: "type", foreground: "66d9ef" },
      ],
      colors: {
        "editor.background": "#272822",
        "editor.foreground": "#f8f8f2",
        "editorCursor.foreground": "#f8f8f0",
        "editor.lineHighlightBackground": "#3e3d32",
        "editorLineNumber.foreground": "#75715e",
        "editor.selectionBackground": "#49483e",
      },
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    data: {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6272a4" },
        { token: "keyword", foreground: "ff79c6" },
        { token: "string", foreground: "f1fa8c" },
        { token: "number", foreground: "bd93f9" },
        { token: "identifier", foreground: "f8f8f2" },
        { token: "type", foreground: "8be9fd" },
      ],
      colors: {
        "editor.background": "#282a36",
        "editor.foreground": "#f8f8f2",
        "editorCursor.foreground": "#f8f8f2",
        "editor.lineHighlightBackground": "#44475a75",
        "editorLineNumber.foreground": "#6272a4",
        "editor.selectionBackground": "#44475a",
      },
    },
  },
  {
    id: "github-dark",
    name: "GitHub Dark",
    data: {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "8b949e" },
        { token: "keyword", foreground: "ff7b72" },
        { token: "string", foreground: "a5d6ff" },
        { token: "number", foreground: "79c0ff" },
        { token: "type", foreground: "ffa657" },
      ],
      colors: {
        "editor.background": "#0d1117",
        "editor.foreground": "#c9d1d9",
        "editorCursor.foreground": "#58a6ff",
        "editor.lineHighlightBackground": "#161b22",
        "editorLineNumber.foreground": "#6e7681",
        "editor.selectionBackground": "#264f78",
      },
    },
  },
  {
    id: "github-light",
    name: "GitHub Light",
    data: {
      base: "vs",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6e7781" },
        { token: "keyword", foreground: "cf222e" },
        { token: "string", foreground: "0a3069" },
        { token: "number", foreground: "0550ae" },
        { token: "type", foreground: "953800" },
      ],
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#24292f",
        "editorCursor.foreground": "#0969da",
        "editor.lineHighlightBackground": "#f6f8fa",
        "editorLineNumber.foreground": "#8c959f",
        "editor.selectionBackground": "#b6e3ff",
      },
    },
  },
  {
    id: "nord",
    name: "Nord",
    data: {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "616e88" },
        { token: "keyword", foreground: "81a1c1" },
        { token: "string", foreground: "a3be8c" },
        { token: "number", foreground: "b48ead" },
        { token: "type", foreground: "8fbcbb" },
      ],
      colors: {
        "editor.background": "#2e3440",
        "editor.foreground": "#d8dee9",
        "editorCursor.foreground": "#d8dee9",
        "editor.lineHighlightBackground": "#3b4252",
        "editorLineNumber.foreground": "#4c566a",
        "editor.selectionBackground": "#434c5e",
      },
    },
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    data: {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "586e75" },
        { token: "keyword", foreground: "859900" },
        { token: "string", foreground: "2aa198" },
        { token: "number", foreground: "d33682" },
        { token: "type", foreground: "b58900" },
      ],
      colors: {
        "editor.background": "#002b36",
        "editor.foreground": "#839496",
        "editorCursor.foreground": "#839496",
        "editor.lineHighlightBackground": "#073642",
        "editorLineNumber.foreground": "#586e75",
        "editor.selectionBackground": "#073642",
      },
    },
  },
  {
    id: "one-dark-pro",
    name: "One Dark Pro",
    data: {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "5c6370" },
        { token: "keyword", foreground: "c678dd" },
        { token: "string", foreground: "98c379" },
        { token: "number", foreground: "d19a66" },
        { token: "type", foreground: "e5c07b" },
      ],
      colors: {
        "editor.background": "#282c34",
        "editor.foreground": "#abb2bf",
        "editorCursor.foreground": "#528bff",
        "editor.lineHighlightBackground": "#2c313a",
        "editorLineNumber.foreground": "#4b5263",
        "editor.selectionBackground": "#3e4451",
      },
    },
  },
];

export function registerMonacoThemes() {
  if (!window.monaco || !window.monaco.editor) return;
  for (const t of MONACO_THEMES) {
    if (t.data) {
      try {
        window.monaco.editor.defineTheme(t.id, t.data);
      } catch {
        // Theme already registered
      }
    }
  }
}

export function obfuscateScriptCode(sourceCode) {
  if (!sourceCode || typeof sourceCode !== "string") return "";
  const utf8Bytes = new TextEncoder().encode(sourceCode);
  let binaryStr = "";
  for (let i = 0; i < utf8Bytes.length; i++) {
    binaryStr += String.fromCharCode(utf8Bytes[i]);
  }
  const b64 = btoa(binaryStr);

  const maskedChunks = [];
  for (let i = 0; i < b64.length; i += 64) {
    maskedChunks.push(JSON.stringify(b64.slice(i, i + 64)));
  }
  const payloadArray = maskedChunks.join(",\n  ");

  return `/**
 * @anedikit-obfuscated v1.0
 * Protected User Kit Execution Payload
 */
(function(_0x8a1e,_0x4f2c){
  const _0x3b9d=[
  ${payloadArray}
  ];
  const _0x1c7a=function(_0x9d2e){
    const _0x5f1b=_0x3b9d.join("");
    const _0x2e4c=atob(_0x5f1b);
    const _0x7a3d=new Uint8Array(_0x2e4c.length);
    for(let _0x4b1f=0;_0x4b1f<_0x2e4c.length;_0x4b1f++){
      _0x7a3d[_0x4b1f]=_0x2e4c.charCodeAt(_0x4b1f);
    }
    return new TextDecoder().decode(_0x7a3d);
  };
  return (new Function(_0x1c7a()))();
})();`;
}

export function deobfuscateScriptCode(code) {
  if (!code || typeof code !== "string") return null;

  if (code.includes("@anedikit-obfuscated")) {
    const arrayMatch = code.match(/const\s+_0x3b9d\s*=\s*\[([\s\S]*?)\];/);
    if (arrayMatch && arrayMatch[1]) {
      try {
        const items = JSON.parse(`[${arrayMatch[1]}]`);
        const b64 = items.join("");
        const raw = atob(b64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
          bytes[i] = raw.charCodeAt(i);
        }
        return new TextDecoder().decode(bytes);
      } catch (_) {}
    }
  }

  // Fallback pattern matching for base64 eval
  const b64Match = code.match(/atob\(["']([A-Za-z0-9+/=]+)["']\)/) || code.match(/["']([A-Za-z0-9+/=]{40,})["']/);
  if (b64Match && b64Match[1]) {
    try {
      const raw = atob(b64Match[1]);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    } catch (_) {}
  }

  return null;
}

// -------------------------------------------------------------
// TAB 3: SCRIPT EDITOR (MONACO EDITOR - Zero outer border/padding, Flush layout)
// -------------------------------------------------------------
function renderKitScriptTab() {
  const container = document.getElementById("kit-tab-content");
  if (!container || !activeKit) return;

  const currentTheme = getSavedScriptTheme();

  const themeOptionsHtml = MONACO_THEMES.map(
    (t) => `<option value="${t.id}" ${t.id === currentTheme ? "selected" : ""}>${escapeHtml(t.name)}</option>`
  ).join("");

  container.innerHTML = `
    <div class="kit-script-editor-wrapper p-0 m-0 border-0 rounded-0" style="margin: -1.5rem -1.5rem -1.5rem -1.5rem !important; width: calc(100% + 3rem); height: calc(100vh - 106px);">
      <!-- Overlay 3-Dot Dropdown Menu on Top Right of Editor -->
      <div class="dropdown kit-script-floating-menu">
        <button class="btn btn-dark btn-sm border bg-body-tertiary text-body shadow-sm py-1 px-2 dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Script Options">
          <ion-icon name="ellipsis-vertical-outline"></ion-icon>
        </button>
        <ul class="dropdown-menu dropdown-menu-end shadow" style="min-width: 275px;">
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-save-kit-script"><ion-icon name="checkmark-outline" class="text-success"></ion-icon>Save Script</a></li>
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-format-kit-script"><ion-icon name="code-outline" class="text-secondary"></ion-icon>Format Code</a></li>
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-insert-vars-boilerplate"><ion-icon name="download-outline" class="text-primary"></ion-icon>Insert Block Variables</a></li>
          <li><hr class="dropdown-divider my-1"></li>
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-obfuscate-kit-script"><ion-icon name="lock-closed-outline" class="text-warning"></ion-icon>Obfuscate Script</a></li>
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-unobfuscate-kit-script"><ion-icon name="lock-open-outline" class="text-info"></ion-icon>Unobfuscate Script</a></li>
          <li><hr class="dropdown-divider my-1"></li>
          <li class="dropdown-header small text-body-secondary py-1">Editor Theme</li>
          <li class="px-3 py-1">
            <div class="input-group input-group-sm">
              <button class="btn btn-outline-secondary" type="button" id="btn-prev-monaco-theme" title="Previous theme">
                <ion-icon name="chevron-back-outline"></ion-icon>
              </button>
              <select class="form-select form-select-sm small font-sans" id="select-monaco-theme" style="cursor: pointer;">
                ${themeOptionsHtml}
              </select>
              <button class="btn btn-outline-secondary" type="button" id="btn-next-monaco-theme" title="Next theme">
                <ion-icon name="chevron-forward-outline"></ion-icon>
              </button>
            </div>
          </li>
          <li><hr class="dropdown-divider my-1"></li>
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-copy-kit-script"><ion-icon name="copy-outline" class="text-secondary"></ion-icon>Copy Script</a></li>
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-export-kit-script"><ion-icon name="download-outline" class="text-secondary"></ion-icon>Export Script (.js)</a></li>
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-import-kit-script"><ion-icon name="cloud-upload-outline" class="text-secondary"></ion-icon>Import Script (.js)</a></li>
          <li><hr class="dropdown-divider my-1"></li>
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-insert-template-script"><ion-icon name="code-working-outline" class="text-secondary"></ion-icon>Reset to Template</a></li>
          <li><a class="dropdown-item small text-danger d-flex align-items-center gap-2" href="#" id="btn-clear-kit-script"><ion-icon name="trash-outline"></ion-icon>Clear Script</a></li>
        </ul>
      </div>

      <!-- Monaco Container (Full width, full height, zero border/gap flush) -->
      <div class="kit-monaco-wrapper rounded-0 border-0 w-100 h-100" id="monaco-script-editor-container">
        <textarea class="form-control font-monospace border-0 bg-dark text-light p-3 small h-100 w-100 rounded-0" id="kit-script-fallback-editor" spellcheck="false">${escapeHtml(activeKit.script || "")}</textarea>
      </div>
    </div>
  `;

  // Bind dropdown menus
  bindUniversalDropdowns(container);

  const monacoContainer = container.querySelector("#monaco-script-editor-container");
  const fallbackEditor = container.querySelector("#kit-script-fallback-editor");
  const btnSave = container.querySelector("#btn-save-kit-script");
  const btnFormat = container.querySelector("#btn-format-kit-script");
  const btnInsertVars = container.querySelector("#btn-insert-vars-boilerplate");
  const btnCopyScript = container.querySelector("#btn-copy-kit-script");
  const btnExportScript = container.querySelector("#btn-export-kit-script");
  const btnImportScript = container.querySelector("#btn-import-kit-script");
  const btnResetTpl = container.querySelector("#btn-insert-template-script");
  const btnClearScript = container.querySelector("#btn-clear-kit-script");
  const selectTheme = container.querySelector("#select-monaco-theme");
  const btnPrevTheme = container.querySelector("#btn-prev-monaco-theme");
  const btnNextTheme = container.querySelector("#btn-next-monaco-theme");

  const applyThemeById = (themeId) => {
    saveScriptTheme(themeId);
    if (selectTheme) selectTheme.value = themeId;
    if (window.monaco && window.monaco.editor) {
      registerMonacoThemes();
      window.monaco.editor.setTheme(themeId);
    }
  };

  if (selectTheme) {
    selectTheme.addEventListener("change", (e) => {
      e.stopPropagation();
      applyThemeById(selectTheme.value);
    });
    selectTheme.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  if (btnPrevTheme) {
    btnPrevTheme.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const curr = getSavedScriptTheme();
      const idx = MONACO_THEMES.findIndex((t) => t.id === curr);
      const prevIdx = (idx - 1 + MONACO_THEMES.length) % MONACO_THEMES.length;
      applyThemeById(MONACO_THEMES[prevIdx].id);
    });
  }

  if (btnNextTheme) {
    btnNextTheme.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const curr = getSavedScriptTheme();
      const idx = MONACO_THEMES.findIndex((t) => t.id === curr);
      const nextIdx = (idx + 1) % MONACO_THEMES.length;
      applyThemeById(MONACO_THEMES[nextIdx].id);
    });
  }

  const triggerSaveScript = () => {
    if (monacoEditorInstance) {
      activeKit.script = monacoEditorInstance.getValue();
    } else if (fallbackEditor) {
      activeKit.script = fallbackEditor.value;
    }
    saveUserKit(activeKit);
    if (btnSave) {
      const origHtml = btnSave.innerHTML;
      btnSave.innerHTML = `<ion-icon name="checkmark-done-outline" class="text-success"></ion-icon> Saved!`;
      setTimeout(() => (btnSave.innerHTML = origHtml), 1500);
    }
  };

  // Initialize Monaco Editor
  const initMonaco = () => {
    if (!window.monaco || !monacoContainer) return;

    if (fallbackEditor) fallbackEditor.remove();

    registerMonacoThemes();
    const activeTheme = getSavedScriptTheme();

    monacoEditorInstance = window.monaco.editor.create(monacoContainer, {
      value: activeKit.script || "",
      language: "javascript",
      theme: activeTheme,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      fontFamily: "'Fira Code', Consolas, Monaco, monospace",
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      wordWrap: "on",
      tabSize: 2,
    });

    // Bind Ctrl+S / Cmd+S shortcut inside Monaco editor
    monacoEditorInstance.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS, () => {
      triggerSaveScript();
    });

    monacoEditorInstance.onDidChangeModelContent(() => {
      activeKit.script = monacoEditorInstance.getValue();
      saveUserKit(activeKit);
    });
  };

  if (window.monaco) {
    initMonaco();
  } else if (window.require) {
    window.require.config({
      paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" },
    });
    window.require(["vs/editor/editor.main"], function () {
      initMonaco();
    });
  } else {
    // Textarea fallback listener
    if (fallbackEditor) {
      fallbackEditor.addEventListener("input", () => {
        activeKit.script = fallbackEditor.value;
        saveUserKit(activeKit);
      });
    }
  }

  // Periodic autosave every 5 seconds
  if (window._kitScriptAutosaveInterval) {
    clearInterval(window._kitScriptAutosaveInterval);
  }
  window._kitScriptAutosaveInterval = setInterval(() => {
    if (!activeKit) return;
    const currentVal = monacoEditorInstance ? monacoEditorInstance.getValue() : (fallbackEditor ? fallbackEditor.value : null);
    if (currentVal !== null && currentVal !== activeKit.script) {
      activeKit.script = currentVal;
      saveUserKit(activeKit);
    }
  }, 5000);

  if (btnSave) {
    btnSave.addEventListener("click", (e) => {
      e.preventDefault();
      triggerSaveScript();
    });
  }

  if (btnFormat) {
    btnFormat.addEventListener("click", (e) => {
      e.preventDefault();
      if (monacoEditorInstance) {
        monacoEditorInstance.getAction("editor.action.formatDocument")?.run();
      }
    });
  }

  const btnObfuscate = container.querySelector("#btn-obfuscate-kit-script");
  const btnUnobfuscate = container.querySelector("#btn-unobfuscate-kit-script");

  if (btnObfuscate) {
    btnObfuscate.addEventListener("click", async (e) => {
      e.preventDefault();
      const code = monacoEditorInstance ? monacoEditorInstance.getValue() : (fallbackEditor ? fallbackEditor.value : activeKit.script || "");
      if (!code.trim()) {
        await showCustomKitAlert("There is no script code to obfuscate.", "Obfuscation");
        return;
      }
      if (code.includes("@anedikit-obfuscated")) {
        await showCustomKitAlert("This script is already obfuscated.", "Obfuscation");
        return;
      }
      const obfuscated = obfuscateScriptCode(code);
      if (monacoEditorInstance) {
        monacoEditorInstance.setValue(obfuscated);
      } else if (fallbackEditor) {
        fallbackEditor.value = obfuscated;
      }
      activeKit.script = obfuscated;
      saveUserKit(activeKit);
      await showCustomKitAlert("Script successfully obfuscated with protected execution payload.", "Obfuscation");
    });
  }

  if (btnUnobfuscate) {
    btnUnobfuscate.addEventListener("click", async (e) => {
      e.preventDefault();
      const code = monacoEditorInstance ? monacoEditorInstance.getValue() : (fallbackEditor ? fallbackEditor.value : activeKit.script || "");
      if (!code.trim()) {
        await showCustomKitAlert("There is no script code to unobfuscate.", "Unobfuscation");
        return;
      }
      const deobfuscated = deobfuscateScriptCode(code);
      if (deobfuscated !== null) {
        if (monacoEditorInstance) {
          monacoEditorInstance.setValue(deobfuscated);
        } else if (fallbackEditor) {
          fallbackEditor.value = deobfuscated;
        }
        activeKit.script = deobfuscated;
        saveUserKit(activeKit);
        await showCustomKitAlert("Script successfully unobfuscated to 100% original source code.", "Unobfuscation");
      } else {
        await showCustomKitAlert("The current script does not appear to be an obfuscated script payload.", "Unobfuscation");
      }
    });
  }

  if (btnInsertVars) {
    btnInsertVars.addEventListener("click", async (e) => {
      e.preventDefault();
      const blockIds = (activeKit.blocks || []).filter((b) => b.id).map((b) => b.id);
      if (blockIds.length === 0) {
        await showCustomKitAlert("No blocks found in this kit to extract variables from.", "Insert Variables");
        return;
      }
      const boilerplate = `  // Block parameters from UI\n  const { ${blockIds.join(", ")} } = ctx.values;\n`;
      if (monacoEditorInstance) {
        const selection = monacoEditorInstance.getSelection() || new window.monaco.Selection(1, 1, 1, 1);
        monacoEditorInstance.executeEdits("insert-vars", [
          {
            range: selection,
            text: boilerplate,
            forceMoveMarkers: true,
          },
        ]);
        monacoEditorInstance.focus();
      } else if (fallbackEditor) {
        const start = fallbackEditor.selectionStart || 0;
        const end = fallbackEditor.selectionEnd || 0;
        fallbackEditor.value = fallbackEditor.value.substring(0, start) + boilerplate + fallbackEditor.value.substring(end);
        activeKit.script = fallbackEditor.value;
        saveUserKit(activeKit);
      }
    });
  }

  if (btnCopyScript) {
    btnCopyScript.addEventListener("click", async (e) => {
      e.preventDefault();
      const code = monacoEditorInstance ? monacoEditorInstance.getValue() : (fallbackEditor ? fallbackEditor.value : activeKit.script || "");
      await navigator.clipboard.writeText(code);
      const origHtml = btnCopyScript.innerHTML;
      btnCopyScript.innerHTML = `<ion-icon name="checkmark-outline" class="text-success"></ion-icon> Copied!`;
      setTimeout(() => (btnCopyScript.innerHTML = origHtml), 1500);
    });
  }

  if (btnExportScript) {
    btnExportScript.addEventListener("click", (e) => {
      e.preventDefault();
      const code = monacoEditorInstance ? monacoEditorInstance.getValue() : (fallbackEditor ? fallbackEditor.value : activeKit.script || "");
      const blob = new Blob([code], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeKit.id || "script"}.js`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  if (btnImportScript) {
    btnImportScript.addEventListener("click", (e) => {
      e.preventDefault();
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".js,.txt";
      fileInput.onchange = (ev) => {
        const file = ev.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (fileEv) => {
          const content = fileEv.target.result;
          activeKit.script = content;
          if (monacoEditorInstance) {
            monacoEditorInstance.setValue(content);
          } else if (fallbackEditor) {
            fallbackEditor.value = content;
          }
          saveUserKit(activeKit);
        };
        reader.readAsText(file);
      };
      fileInput.click();
    });
  }

  if (btnResetTpl) {
    btnResetTpl.addEventListener("click", (e) => {
      e.preventDefault();
      if (confirm("Reset current script to the default starter template?")) {
        const tpl = STARTER_TEMPLATES.converter.script;
        activeKit.script = tpl;
        if (monacoEditorInstance) {
          monacoEditorInstance.setValue(tpl);
        } else if (fallbackEditor) {
          fallbackEditor.value = tpl;
        }
        saveUserKit(activeKit);
      }
    });
  }

  if (btnClearScript) {
    btnClearScript.addEventListener("click", (e) => {
      e.preventDefault();
      if (confirm("Clear script contents?")) {
        const blank = `function buildCommand(ctx) {\n  const { values, helpers } = ctx;\n  return [];\n}\n`;
        activeKit.script = blank;
        if (monacoEditorInstance) {
          monacoEditorInstance.setValue(blank);
        } else if (fallbackEditor) {
          fallbackEditor.value = blank;
        }
        saveUserKit(activeKit);
      }
    });
  }

  // Bind Ctrl+S on window
  const onGlobalKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      if (activeKit && activeKitTab === "script") {
        e.preventDefault();
        triggerSaveScript();
      }
    }
  };
  window.addEventListener("keydown", onGlobalKeyDown);
}

// -------------------------------------------------------------
// TAB 4: KIT SETTINGS (No outer card, Linear layout, Icon changer)
// -------------------------------------------------------------
function renderKitSettingsTab() {
  const container = document.getElementById("kit-tab-content");
  if (!container || !activeKit) return;

  const currentIcon = getIonicIconName(activeKit.icon);

  container.innerHTML = `
    <div class="kit-settings-linear-wrapper">
      <div class="section-divider-header mb-3">Properties</div>
      <form id="form-kit-metadata">
        <div class="row g-3">
          
          <!-- Row 1: Kit Name -->
          <div class="col-12">
            <label class="form-label small fw-medium text-body" for="meta-kit-name">Kit Name *</label>
            <input type="text" class="form-control small font-sans" id="meta-kit-name" value="${escapeHtml(activeKit.name)}" required />
          </div>

          <!-- Row 2: Kit ID (Unique Identifier) - Editable -->
          <div class="col-12">
            <label class="form-label small fw-medium text-body" for="meta-kit-id">Kit ID *</label>
            <input type="text" class="form-control small font-monospace" id="meta-kit-id" value="${escapeHtml(activeKit.id)}" required />
            <div class="form-text small text-body-secondary">Unique machine identifier used for namespacing and storage.</div>
          </div>

          <!-- Row 3: Version, Author, License in Same Row -->
          <div class="col-md-4 col-12">
            <label class="form-label small fw-medium text-body" for="meta-kit-version">Version</label>
            <input type="text" class="form-control small font-monospace" id="meta-kit-version" value="${escapeHtml(activeKit.version || "1.0.0")}" />
          </div>
          <div class="col-md-4 col-12">
            <label class="form-label small fw-medium text-body" for="meta-kit-author">Author</label>
            <input type="text" class="form-control small font-sans" id="meta-kit-author" value="${escapeHtml(activeKit.author || "User")}" />
          </div>
          <div class="col-md-4 col-12">
            <label class="form-label small fw-medium text-body" for="meta-kit-license">License</label>
            <select class="form-select small" id="meta-kit-license" style="cursor: pointer;">
              <option value="MIT" ${activeKit.license === "MIT" ? "selected" : ""}>MIT License</option>
              <option value="Apache-2.0" ${activeKit.license === "Apache-2.0" ? "selected" : ""}>Apache 2.0</option>
              <option value="GPL-3.0" ${activeKit.license === "GPL-3.0" ? "selected" : ""}>GPL 3.0</option>
              <option value="BSD-3-Clause" ${activeKit.license === "BSD-3-Clause" ? "selected" : ""}>BSD 3-Clause</option>
              <option value="Unlicense" ${activeKit.license === "Unlicense" ? "selected" : ""}>The Unlicense (Public Domain)</option>
              <option value="Proprietary" ${activeKit.license === "Proprietary" ? "selected" : ""}>Proprietary / Custom</option>
            </select>
          </div>

          <!-- Row 4: Kit Icon with Live Preview -->
          <div class="col-12">
            <label class="form-label small fw-medium text-body" for="meta-kit-icon">Kit Icon</label>
            <div class="input-group">
              <span class="input-group-text bg-body-tertiary text-primary" id="meta-icon-preview">
                <ion-icon name="${escapeHtml(currentIcon)}" class="fs-6"></ion-icon>
              </span>
              <select class="form-select small" id="meta-kit-icon" style="cursor: pointer;">
                <option value="cube-outline" ${currentIcon === "cube-outline" ? "selected" : ""}>Cube (Default)</option>
                <option value="code-slash-outline" ${currentIcon === "code-slash-outline" ? "selected" : ""}>Code Slash</option>
                <option value="film-outline" ${currentIcon === "film-outline" ? "selected" : ""}>Film / Video</option>
                <option value="musical-notes-outline" ${currentIcon === "musical-notes-outline" ? "selected" : ""}>Music / Audio</option>
                <option value="options-outline" ${currentIcon === "options-outline" ? "selected" : ""}>Sliders / Parameters</option>
                <option value="flash-outline" ${currentIcon === "flash-outline" ? "selected" : ""}>Lightning / Fast</option>
                <option value="terminal-outline" ${currentIcon === "terminal-outline" ? "selected" : ""}>Terminal / CLI</option>
                <option value="settings-outline" ${currentIcon === "settings-outline" ? "selected" : ""}>Gear / Engine</option>
                <option value="hardware-chip-outline" ${currentIcon === "hardware-chip-outline" ? "selected" : ""}>CPU / Processing</option>
                <option value="videocam-outline" ${currentIcon === "videocam-outline" ? "selected" : ""}>Camera Video</option>
                <option value="pulse-outline" ${currentIcon === "pulse-outline" ? "selected" : ""}>Soundwave / Waves</option>
                <option value="color-palette-outline" ${currentIcon === "color-palette-outline" ? "selected" : ""}>Palette / Visual</option>
                <option value="sparkles-outline" ${currentIcon === "sparkles-outline" ? "selected" : ""}>Magic / Enhancement</option>
                <option value="cut-outline" ${currentIcon === "cut-outline" ? "selected" : ""}>Scissors / Trimming</option>
                <option value="code-working-outline" ${currentIcon === "code-working-outline" ? "selected" : ""}>File Code</option>
              </select>
            </div>
          </div>

          <!-- Row 5: Description -->
          <div class="col-12">
            <label class="form-label small fw-medium text-body" for="meta-kit-desc">Description</label>
            <textarea class="form-control small font-sans" id="meta-kit-desc" rows="3" placeholder="Summary of what this kit does...">${escapeHtml(activeKit.description || "")}</textarea>
          </div>

          <!-- Row 6: Save Action Button -->
          <div class="col-12 d-flex justify-content-end mt-2">
            <button class="btn btn-success btn-sm px-4" type="submit" id="btn-save-kit-metadata">
              <ion-icon name="checkmark-outline"></ion-icon> Save Settings
            </button>
          </div>

        </div>
      </form>
    </div>
  `;

  const iconSelect = container.querySelector("#meta-kit-icon");
  const iconPreview = container.querySelector("#meta-icon-preview");
  if (iconSelect && iconPreview) {
    iconSelect.addEventListener("change", () => {
      iconPreview.innerHTML = `<ion-icon name="${getIonicIconName(iconSelect.value)}" class="fs-6"></ion-icon>`;
    });
  }

  const form = container.querySelector("#form-kit-metadata");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const oldId = activeKit.id;
      const rawNewId = container.querySelector("#meta-kit-id")?.value || "";
      const newId = rawNewId.trim().toLowerCase();

      if (!newId) {
        showCustomKitAlert("Kit ID cannot be empty.", "Edit Kit ID");
        return;
      }

      if (newId !== oldId) {
        const existing = getUserKitById(newId);
        if (existing) {
          showCustomKitAlert(`A kit with ID "${newId}" already exists. Please choose a different ID.`, "Duplicate Kit ID");
          return;
        }
      }

      activeKit.name = container.querySelector("#meta-kit-name")?.value || activeKit.name;
      activeKit.version = container.querySelector("#meta-kit-version")?.value || activeKit.version;
      activeKit.author = container.querySelector("#meta-kit-author")?.value || activeKit.author;
      activeKit.license = container.querySelector("#meta-kit-license")?.value || activeKit.license;
      activeKit.icon = container.querySelector("#meta-kit-icon")?.value || activeKit.icon;
      activeKit.description = container.querySelector("#meta-kit-desc")?.value || "";

      if (newId !== oldId) {
        // Migrate saved parameters from old ID key to new ID key
        const savedParams = getSavedKitParams(oldId);
        saveKitParams(newId, savedParams);

        // Delete old kit from user kits
        deleteUserKit(oldId);

        // Update ID on activeKit
        activeKit.id = newId;
        saveActiveKit(newId);
      }

      saveUserKit(activeKit);
      renderUserKitsSidebar();

      // Update top header title, description and tooltips immediately
      const titleEl = document.getElementById("current-tool-title");
      const descEl = document.getElementById("current-tool-desc");
      const headerContainer = document.getElementById("tool-header-text");
      if (titleEl) {
        titleEl.textContent = activeKit.name;
        titleEl.title = activeKit.name;
      }
      if (descEl) {
        descEl.textContent = activeKit.description || "Custom scriptable user module.";
        descEl.title = activeKit.description || "Custom scriptable user module.";
      }
      if (headerContainer) {
        headerContainer.title = `${activeKit.name} - ${activeKit.description || "Custom scriptable user module."}`;
      }

      // If ID changed, re-open with new ID
      if (newId !== oldId) {
        if (window.switchAppTool) {
          window.switchAppTool(`kit_${newId}`);
        }
        selectAndOpenKit(newId, false, "settings");
      } else {
        renderKitIdeWorkspace();
      }
    });
  }
}

function escapeHtml(str) {
  if (typeof str !== "string") return String(str || "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
