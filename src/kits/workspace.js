// AnEdiKit - User Kits IDE Workspace & Tab Navigation Module
import {
  getActiveKit,
  setActiveKit,
  getActiveKitTab,
  setActiveKitTab,
  setKitRuntimeValues,
  getMonacoEditorInstance,
  setMonacoEditorInstance,
  escapeHtml,
} from "./state.js";
import {
  loadSettings,
  getUserKitById,
  saveActiveKit,
  saveKitActiveTab,
  getSavedKitActiveTab,
  getSavedKitParams,
  saveUserKit,
} from "./storage.js";
import { sanitizeKitBlocks } from "./blocks.js";
import { getIonicIconName } from "./sidebar.js";
import { bindUniversalDropdowns } from "./modals.js";
import {
  exportKitAsJSON,
  duplicateKitById,
  deleteKitById,
  renderKitSettingsTab,
} from "./settings.js";
import { renderKitRunnerTab } from "./runner.js";
import { renderKitBuilderTab } from "./builder.js";
import { renderKitScriptTab } from "./editor.js";

let _kitTabsResizeObserver = null;
let _lastNavWidth = 0;

// Update the gliding background indicator position on the kit navigation tab bar
export function updateKitTabIndicator(instant = false) {
  const nav = document.getElementById("kit-ide-tabs");
  const indicator = document.getElementById("kit-tab-indicator");
  if (!nav || !indicator) return;

  const activeKitTab = getActiveKitTab();
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
  if (getActiveKitTab() === tabName) return;
  setActiveKitTab(tabName);
  const activeKit = getActiveKit();
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
  const monacoEditorInstance = getMonacoEditorInstance();
  if (monacoEditorInstance) {
    try {
      if (activeKit) {
        activeKit.script = monacoEditorInstance.getValue();
        saveUserKit(activeKit);
      }
      monacoEditorInstance.dispose();
    } catch (_) {}
    setMonacoEditorInstance(null);
  }

  const tabContent = document.getElementById("kit-tab-content");
  if (tabContent) {
    tabContent.classList.remove("material-zoom");
    void tabContent.offsetWidth;
    tabContent.classList.add("material-zoom");
  }

  if (tabName === "runner") {
    renderKitRunnerTab();
  } else if (tabName === "builder") {
    renderKitBuilderTab();
  } else if (tabName === "script") {
    renderKitScriptTab();
  } else if (tabName === "settings") {
    renderKitSettingsTab();
  }
}

// Select a kit and open IDE / Runner view
export function selectAndOpenKit(kitId, shouldSwitchTool = true, targetTab = null) {
  const settings = loadSettings();
  if (!settings.enableUserKits) return;

  const kit = getUserKitById(kitId);
  if (!kit) return;

  sanitizeKitBlocks(kit);
  setActiveKit(kit);
  saveActiveKit(kitId);

  let tab = targetTab;
  if (targetTab) {
    setActiveKitTab(targetTab);
    saveKitActiveTab(kitId, targetTab);
  } else {
    tab = getSavedKitActiveTab(kitId, "runner");
    setActiveKitTab(tab);
  }

  // Restore runtime values from storage or block defaults
  const savedParams = getSavedKitParams(kitId);
  const runtimeValues = { ...savedParams };

  (kit.blocks || []).forEach((b) => {
    if (runtimeValues[b.id] === undefined) {
      if (b.default !== undefined) {
        runtimeValues[b.id] = b.default;
      } else if (b.type === "output_filename") {
        runtimeValues[b.id] = b.placeholder || "output";
      }
    }
  });
  setKitRuntimeValues(runtimeValues);

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

// Render the Kit IDE workspace in the content area
export function renderKitIdeWorkspace() {
  const container = document.getElementById("view-kit_ide");
  const activeKit = getActiveKit();
  if (!container || !activeKit) return;

  // Clean up previous Monaco editor instance if exists
  const monacoEditorInstance = getMonacoEditorInstance();
  if (monacoEditorInstance) {
    try {
      monacoEditorInstance.dispose();
    } catch (_) {}
    setMonacoEditorInstance(null);
  }

  const activeKitTab = getActiveKitTab();

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
