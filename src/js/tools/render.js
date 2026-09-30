// AnEdiKit - Tools UI rendering + refresh.
import toolsManifest from "../../data/tools-manifest.json" with { type: "json" };
import { toolUpdateState } from "./store.js";
import { showToolAlert, hideToolAlert } from "./alerts.js";
import { simulateToolUpdate, deleteToolBinary, updateActionButton, applyActiveUpdateStateToUI } from "./updates.js";
import { checkLocalToolVersions, fetchLatestGitHubReleases } from "./versions.js";
import { requestRefreshToolsUI } from "../tools_ui_bridge.js";
import { reportError } from "../errors.js";

export function renderToolsUI() {
  // 1. Render Executables & Environment horizontal scroll cards
  const execContainer = document.getElementById("executables-scroll-container");
  if (execContainer) {
    execContainer.innerHTML = toolsManifest
      .filter((t) => t.hasExecCard)
      .map(
        (tool) => `
        <div class="card p-3 border bg-body-tertiary flex-shrink-0 env-tool-card" id="card-env-${tool.id}">
          <div class="d-flex align-items-start justify-content-between">
            <ion-icon name="${tool.icon}" class="fs-2 ${tool.iconColorClass} lh-1"></ion-icon>
            <ion-icon name="ellipsis-horizontal-outline" class="text-body-tertiary fs-5 flex-shrink-0" id="status-${tool.id}-installed" title="Checking version status..."></ion-icon>
          </div>
          <div class="mt-auto">
            <div class="fs-5 fw-light text-body lh-1 mb-1">${tool.name}</div>
            <div class="text-body-secondary small" style="font-size: 0.75rem;">${tool.summary}</div>
          </div>
        </div>
      `
      )
      .join("");
  }

  // 2. Render Manage Tools & Binaries modal rows as a conjoined card
  const manageContainer = document.getElementById("manage-tools-list-container");
  if (manageContainer) {
    const manageTools = toolsManifest.filter((t) => t.hasManageRow);
    manageContainer.innerHTML = `
      <div class="border rounded bg-body-tertiary mb-3 overflow-hidden">
        ${manageTools
          .map(
            (tool, idx) => `
          <div class="p-3 ${idx < manageTools.length - 1 ? "border-bottom" : ""}">
            <div class="mb-2">
              <div class="fw-semibold text-body">${tool.displayName}</div>
              <div class="text-body-secondary small">${tool.description}</div>
            </div>
            <div class="tool-action-group mb-2">
              <button class="btn btn-outline-primary btn-sm flex-grow-1" type="button" id="btn-update-${tool.id}" data-tool-id="${tool.id}" data-tool-name="${tool.name}">
                <ion-icon name="repeat-outline"></ion-icon> Update ${tool.name}
              </button>
              <button class="btn btn-outline-danger btn-sm flex-shrink-0 px-2" type="button" id="btn-delete-${tool.id}" data-tool-id="${tool.id}" data-tool-name="${tool.name}" title="Delete ${tool.displayName} binary">
                <ion-icon name="trash-outline"></ion-icon>
              </button>
            </div>
            <div class="d-flex gap-3 small text-body-secondary">
              <div class="tool-ver-item"><span class="text-body-secondary">Installed:</span> <span class="text-body fw-medium" id="${tool.id}-local-ver"><span class="meta-loading-pulse">...</span></span></div>
              <div><span class="text-body-secondary">Latest:</span> <span class="text-body fw-medium" id="${tool.id}-latest-ver"><span class="meta-loading-pulse">...</span></span></div>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `;

    // Bind dynamic click listener to each update and delete button
    toolsManifest
      .filter((t) => t.hasManageRow)
      .forEach((tool) => {
        const btnUpdate = document.getElementById(`btn-update-${tool.id}`);
        if (btnUpdate) {
          btnUpdate.addEventListener("click", () => {
            simulateToolUpdate(tool.name, btnUpdate, () => requestRefreshToolsUI());
          });
        }
        const btnDelete = document.getElementById(`btn-delete-${tool.id}`);
        if (btnDelete) {
          btnDelete.addEventListener("click", () => {
            deleteToolBinary(tool.name, btnDelete, () => requestRefreshToolsUI());
          });
        }
      });
  }
}


export async function refreshToolsUI({ force = false } = {}) {
  // Show all version slots in loading state
  toolsManifest.forEach((tool) => {
    const elLocal = document.getElementById(`${tool.id}-local-ver`);
    const elLatest = document.getElementById(`${tool.id}-latest-ver`);
    if (elLocal) elLocal.innerHTML = '<div class="loader loader-sm"></div>';
    if (elLatest) elLatest.innerHTML = '<div class="loader loader-sm"></div>';

    const btnUpdate = document.getElementById(`btn-update-${tool.id}`);
    if (btnUpdate) {
      if (toolUpdateState[tool.id] && toolUpdateState[tool.id].isUpdating) {
        applyActiveUpdateStateToUI(tool.id);
      } else {
        btnUpdate.disabled = true;
        btnUpdate.className = "btn btn-secondary btn-sm flex-grow-1 pe-none opacity-50 btn-shimmer";
        btnUpdate.innerHTML = `Loading...`;
      }
    }
    const btnDelete = document.getElementById(`btn-delete-${tool.id}`);
    if (btnDelete) {
      btnDelete.disabled = true;
      btnDelete.classList.add("opacity-50", "pe-none");
    }
  });

  // Phase 1: local versions only (Tauri IPC, milliseconds). Card check/cross
  // icons paint immediately instead of waiting on the network below.
  let localInfo = {};
  try {
    localInfo = (await checkLocalToolVersions()) || {};
  } catch {
    localInfo = {};
  }
  paintToolStatuses(localInfo, null);

  // Phase 2: GitHub latest releases resolve (or return cached within 24 hours) and
  // upgrade versions/icons/buttons in place. Never blocks the UI thread.
  return fetchLatestGitHubReleases({ force }).then(
    (latestInfo) => {
      paintToolStatuses(localInfo, latestInfo || {});
      try {
        window.dispatchEvent(new CustomEvent("anedikit:tools_cache_updated", { detail: latestInfo }));
      } catch (caughtErr) { reportError("js/tools/render.js:refreshToolsUI", caughtErr); }
      return latestInfo;
    },
    () => {
      return {};
    },
  );
}


function paintToolStatuses(localInfo, latestInfo) {
  toolsManifest.forEach((tool) => {
    const localVer = localInfo[tool.id] || localInfo[`${tool.id}_installed`] || localInfo[tool.binName] || "Not Found";
    const latestVer = latestInfo
      ? latestInfo[tool.id] || latestInfo[`${tool.id}_latest`] || "Unknown"
      : "Checking...";

    const elLocal = document.getElementById(`${tool.id}-local-ver`);
    const elLatest = document.getElementById(`${tool.id}-latest-ver`);
    if (elLocal) elLocal.textContent = localVer;
    if (elLatest) elLatest.textContent = latestVer;

    const isInstalled = localVer && localVer !== "Not Found" && !localVer.toLowerCase().includes("not");
    const hasUpdate =
      isInstalled &&
      tool.updatable &&
      latestVer &&
      latestVer !== "Unknown" &&
      latestVer !== "Checking..." &&
      !latestVer.toLowerCase().includes("check") &&
      localVer.trim() !== latestVer.trim();

    // Status icon & tooltip update for executable cards (Top-right)
    const statusIcon = document.getElementById(`status-${tool.id}-installed`);
    if (statusIcon) {
      if (hasUpdate) {
        statusIcon.setAttribute("name", "warning-outline");
        statusIcon.className = "text-warning fs-5 flex-shrink-0";
        statusIcon.title = `Update available for ${tool.name}: ${localVer} → ${latestVer}`;
      } else if (isInstalled) {
        statusIcon.setAttribute("name", "checkmark-outline");
        statusIcon.className = "text-success fs-5 flex-shrink-0";
        statusIcon.title = `${tool.name} is installed (${localVer})`;
      } else {
        statusIcon.setAttribute("name", "close-outline");
        statusIcon.className = "text-danger fs-5 flex-shrink-0";
        statusIcon.title = `${tool.name} is not installed`;
      }
    }

    // Button state update
    if (tool.hasManageRow) {
      updateActionButton(tool.id, tool.name, localVer, latestVer);
    }
  });
}

