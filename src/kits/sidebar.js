// AnEdiKit - User Kits Sidebar & Navigation Integration
import { loadUserKits, getUserKitById, saveUserKit } from "./storage.js";
import { escapeHtml } from "./state.js";
import { STARTER_TEMPLATES, generateKitId } from "./templates.js";
import { showCustomKitAlert } from "./modals.js";
import { setupSidebarButtonEffects } from "../js/navigation.js";
import { selectAndOpenKit } from "./workspace.js";
import { exportKitAsJSON, duplicateKitById, deleteKitById } from "./settings.js";

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

// Toggle visibility of User Kits section in the sidebar
export function applyUserKitsVisibility(enabled) {
  const section = document.getElementById("sidebar-user-kits-section");
  if (!section) return;

  if (enabled) {
    section.classList.remove("d-none");
    section.classList.remove("ui-zoom-in");
    void section.offsetWidth; // Force reflow to retrigger animation
    section.classList.add("ui-zoom-in");
    renderUserKitsSidebar();
  } else {
    section.classList.add("d-none");
    section.classList.remove("ui-zoom-in");
    if (window.switchAppTool) {
      const activeTool = localStorage.getItem("anedikit:settings:active_tool");
      if (activeTool && activeTool.startsWith("kit_")) {
        window.switchAppTool("convert");
      }
    }
  }
}

// Ensure context menu DOM exists
export function ensureSidebarContextMenu() {
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
export function bindKitWizardEvents() {
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
