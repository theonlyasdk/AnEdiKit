// AnEdiKit - User Kits Settings & Management Tab
import { getActiveKit, setActiveKit, escapeHtml } from "./state.js";
import {
  getUserKitById,
  saveUserKit,
  deleteUserKit,
  saveActiveKit,
  loadUserKits,
  getSavedKitParams,
  saveKitParams,
} from "./storage.js";
import { getIonicIconName, renderUserKitsSidebar } from "./sidebar.js";
import { selectAndOpenKit, renderKitIdeWorkspace } from "./workspace.js";
import { showCustomKitAlert } from "./modals.js";

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
      setActiveKit(null);
      if (window.switchAppTool) {
        window.switchAppTool("convert");
      }
    }
  }
}

// TAB 4: KIT SETTINGS (Properties, metadata, icon changer, save)
export function renderKitSettingsTab() {
  const activeKit = getActiveKit();
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
