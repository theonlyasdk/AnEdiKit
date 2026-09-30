// AnEdiKit - Tools manager facade (API-preserving).
// Implementations live in ./tools/*.js; init/wiring stays here.

import toolsManifest from "../data/tools-manifest.json" with { type: "json" };
import { clearToolsUpdateCache } from "./storage.js";
import { toolUpdateState } from "./tools/store.js";
import {
  checkLocalToolVersions,
  fetchLatestGitHubReleases,
  TOOLS_UPDATE_CACHE_TTL_MS,
} from "./tools/versions.js";
import {
  renderToolsUI,
  refreshToolsUI,
} from "./tools/render.js";
import {
  deleteToolBinary,
  simulateToolUpdate,
} from "./tools/updates.js";
import {
  getMissingTools,
  showMissingToolsDialog,
  initMissingToolsDialog,
  checkFirstStartTools,
  checkToolsBeforeExecution,
} from "./tools/dialogs.js";
import {
  initScrollCardsOverflow,
} from "./tools/scroll.js";
import { hideToolAlert } from "./tools/alerts.js";
import { applyActiveUpdateStateToUI } from "./tools/updates.js";

export {
  toolsManifest,
  clearToolsUpdateCache,
  checkLocalToolVersions,
  fetchLatestGitHubReleases,
  TOOLS_UPDATE_CACHE_TTL_MS,
  renderToolsUI,
  refreshToolsUI,
  deleteToolBinary,
  simulateToolUpdate,
  getMissingTools,
  showMissingToolsDialog,
  initMissingToolsDialog,
  checkFirstStartTools,
  checkToolsBeforeExecution,
  initScrollCardsOverflow,
};

import { registerRefreshToolsUI, requestRefreshToolsUI, requestInitToolsCacheControls } from "./tools_ui_bridge.js";

export function initToolsManager() {
  // Render data-driven cards and modal rows from manifest
  renderToolsUI();

  // Wire missing tools modal buttons
  initMissingToolsDialog();

  // On first start only: check whether tools are installed and prompt if missing.
  // On subsequent starts: skipped to keep startup responsive on low-end machines.
  checkFirstStartTools();

  if (window.__TAURI__?.event?.listen) {
    try {
      window.__TAURI__.event.listen("tool_download_progress", (evt) => {
        const payload = evt.payload;
        if (!payload || !payload.tool_name) return;

        const cleanToolName = payload.tool_name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
        const tool = toolsManifest.find(
          (t) => t.id === cleanToolName || t.name.toLowerCase().replace(/[^a-z0-9_-]/g, "") === cleanToolName
        );
        const toolId = tool ? tool.id : cleanToolName;

        if (toolUpdateState[toolId]) {
          toolUpdateState[toolId].stageText = "Downloading";
          toolUpdateState[toolId].pct = Math.min(99, Math.max(1, Math.round(payload.pct)));
          if (payload.downloaded) toolUpdateState[toolId].downloaded = payload.downloaded;
          if (payload.total) toolUpdateState[toolId].total = payload.total;
          if (payload.speed) {
            toolUpdateState[toolId].speedVal = payload.speed.endsWith("/s") ? payload.speed : `${payload.speed}/s`;
          }
          if (payload.eta) {
            toolUpdateState[toolId].etaVal = payload.eta.includes("left") ? payload.eta : `${payload.eta} left`;
          }
          toolUpdateState[toolId].extractionStep = null;
          toolUpdateState[toolId].extractionProgress = null;
        }
        applyActiveUpdateStateToUI(toolId);
      });

      window.__TAURI__.event.listen("tool_extraction_progress", (evt) => {
        const payload = evt.payload;
        if (!payload || !payload.tool_name || !payload.step) return;

        const cleanToolName = payload.tool_name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
        const tool = toolsManifest.find(
          (t) => t.id === cleanToolName || t.name.toLowerCase().replace(/[^a-z0-9_-]/g, "") === cleanToolName
        );
        const toolId = tool ? tool.id : cleanToolName;

        let stepText = String(payload.step).trim();
        stepText = stepText.replace(/^[xa]\s+/, "").replace(/^\.\//, "");
        const parts = stepText.split(/[/\\]/);
        if (parts.length > 2) {
          stepText = parts.slice(-2).join("/");
        }

        if (toolUpdateState[toolId]) {
          toolUpdateState[toolId].stageText = "Extracting";
          toolUpdateState[toolId].extractionStep = stepText;
          toolUpdateState[toolId].extractionProgress = payload.progress || null;
          toolUpdateState[toolId].pct = Math.max(toolUpdateState[toolId].pct, 85);
          toolUpdateState[toolId].speedVal = "Unpacking";
          toolUpdateState[toolId].etaVal = "Finishing up...";
        }
        applyActiveUpdateStateToUI(toolId);
      });
    } catch (err) {
      console.warn("tool progress listener warning:", err);
    }
  }

  const modal = document.getElementById("manage-tools-modal");
  if (modal) {
    modal.addEventListener("show.bs.modal", () => {
      requestRefreshToolsUI();
    });
  }

  const btnCloseAlert = document.getElementById("btn-close-tool-alert");
  if (btnCloseAlert) {
    btnCloseAlert.addEventListener("click", hideToolAlert);
  }

  requestInitToolsCacheControls();

  const handleOpenBinFolder = async (e) => {
    if (e) e.preventDefault();
    if (window.__TAURI__?.core?.invoke) {
      try {
        await window.__TAURI__.core.invoke("open_binaries_folder");
      } catch (err) {
        console.warn("open_binaries_folder error:", err);
      }
    }
  };

  const btnOpenBin = document.getElementById("btn-open-bin-folder");
  if (btnOpenBin) btnOpenBin.addEventListener("click", handleOpenBinFolder);

  const linkOpenBin = document.getElementById("link-open-bin-folder");
  if (linkOpenBin) linkOpenBin.addEventListener("click", handleOpenBinFolder);

  initScrollCardsOverflow();
}


// Decoupled from app_settings.js: it invokes this via the bridge.
registerRefreshToolsUI(refreshToolsUI);
