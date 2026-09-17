// Tools Manager Module - Data-driven Engine using shared tools-manifest.json
import toolsManifest from "../data/tools-manifest.json" with { type: "json" };

export { toolsManifest };

export async function checkLocalToolVersions() {
  if (window.__TAURI__?.core?.invoke) {
    try {
      const info = await window.__TAURI__.core.invoke("check_tool_versions");
      return info || {};
    } catch (err) {
      console.warn("Tauri check_tool_versions error:", err);
    }
  }

  // Fallback simulation from manifest defaults
  const fallback = {};
  for (const tool of toolsManifest) {
    fallback[tool.id] = tool.fallbackInstalled;
    fallback[`${tool.id}_installed`] = tool.fallbackInstalled;
  }
  return fallback;
}

export async function fetchLatestGitHubReleases() {
  const latest = {};

  const fetchPromises = toolsManifest.map(async (tool) => {
    if (!tool.repo) {
      latest[tool.id] = tool.fallbackLatest || "Available";
      latest[`${tool.id}_latest`] = tool.fallbackLatest || "Available";
      return;
    }

    try {
      const res = await fetch(`https://api.github.com/repos/${tool.repo}/releases/latest`);
      if (res.ok) {
        const data = await res.json();
        if (tool.releaseType === "published_date") {
          latest[tool.id] = data.published_at ? data.published_at.substring(0, 10) : tool.fallbackLatest;
        } else if (tool.releaseType === "semver") {
          latest[tool.id] = (data.tag_name || "").replace(/^v/, "").trim() || tool.fallbackLatest;
        } else {
          latest[tool.id] = (data.tag_name || "").trim() || tool.fallbackLatest;
        }
      } else {
        latest[tool.id] = tool.fallbackLatest;
      }
    } catch {
      latest[tool.id] = tool.fallbackLatest;
    }

    latest[`${tool.id}_latest`] = latest[tool.id];
  });

  await Promise.all(fetchPromises);
  return latest;
}

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
            simulateToolUpdate(tool.name, btnUpdate, refreshToolsUI);
          });
        }
        const btnDelete = document.getElementById(`btn-delete-${tool.id}`);
        if (btnDelete) {
          btnDelete.addEventListener("click", () => {
            deleteToolBinary(tool.name, btnDelete, refreshToolsUI);
          });
        }
      });
  }
}

export async function deleteToolBinary(toolName, btnDelete, callback) {
  hideToolAlert();

  // Track and disable all update, delete, and check buttons
  const allUpdateBtns = Array.from(document.querySelectorAll('[id^="btn-update-"]'));
  const allDeleteBtns = Array.from(document.querySelectorAll('[id^="btn-delete-"]'));
  const btnCheckAll = document.getElementById("btn-check-all-updates");
  const otherBtnsToRestore = [];

  allUpdateBtns.forEach((upBtn) => {
    otherBtnsToRestore.push({
      el: upBtn,
      wasDisabled: upBtn.disabled,
    });
    upBtn.disabled = true;
    upBtn.classList.add("opacity-50", "pe-none");
  });

  allDeleteBtns.forEach((delBtn) => {
    otherBtnsToRestore.push({
      el: delBtn,
      wasDisabled: delBtn.disabled,
    });
    delBtn.disabled = true;
    delBtn.classList.add("opacity-50", "pe-none");
  });

  if (btnCheckAll) {
    btnCheckAll.disabled = true;
    btnCheckAll.classList.add("opacity-50", "pe-none");
  }

  const restoreAllButtons = () => {
    otherBtnsToRestore.forEach(({ el, wasDisabled }) => {
      el.disabled = wasDisabled;
      if (!wasDisabled) {
        el.classList.remove("opacity-50", "pe-none");
      }
    });
    if (btnCheckAll) {
      btnCheckAll.disabled = false;
      btnCheckAll.classList.remove("opacity-50", "pe-none");
    }
  };

  if (btnDelete) {
    btnDelete.disabled = true;
    btnDelete.classList.add("opacity-50", "pe-none");
    btnDelete.innerHTML = `<div class="loader loader-sm"></div>`;
  }

  let deleteError = null;
  let deleteResult = null;

  if (window.__TAURI__?.core?.invoke) {
    try {
      deleteResult = await window.__TAURI__.core.invoke("delete_tool", { toolName });
    } catch (err) {
      deleteError = typeof err === "string" ? err : err?.message || JSON.stringify(err);
    }
  } else {
    // Simulated web fallback
    await new Promise((resolve) => setTimeout(resolve, 800));
    deleteResult = `${toolName} deleted (simulated).`;
  }

  if (deleteError) {
    showToolAlert(`Failed to delete ${toolName}: ${deleteError}`, "danger");
  } else {
    showToolAlert(`${toolName} binary deleted successfully.`, "success");
  }

  restoreAllButtons();
  if (callback) callback();
}

export async function refreshToolsUI() {
  // Show all version slots in loading state
  toolsManifest.forEach((tool) => {
    const elLocal = document.getElementById(`${tool.id}-local-ver`);
    const elLatest = document.getElementById(`${tool.id}-latest-ver`);
    if (elLocal) elLocal.innerHTML = '<div class="loader loader-sm"></div>';
    if (elLatest) elLatest.innerHTML = '<div class="loader loader-sm"></div>';

    const btnUpdate = document.getElementById(`btn-update-${tool.id}`);
    if (btnUpdate) {
      if (activeToolUpdates[tool.id] && activeToolUpdates[tool.id].isUpdating) {
        applyActiveUpdateStateToUI(tool.id);
      } else {
        btnUpdate.disabled = true;
        btnUpdate.className = "btn btn-secondary btn-sm flex-grow-1 pe-none opacity-50";
        btnUpdate.innerHTML = `<div class="loader loader-sm me-1"></div> Loading...`;
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

  // Phase 2: GitHub latest releases resolve whenever (slow network) and
  // upgrade versions/icons/buttons in place. Never blocks the UI thread.
  fetchLatestGitHubReleases().then(
    (latestInfo) => paintToolStatuses(localInfo, latestInfo || {}),
    () => {},
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

const activeToolUpdates = {};

export function applyActiveUpdateStateToUI(toolId) {
  const state = activeToolUpdates[toolId];
  if (!state || !state.isUpdating) return;

  const btn = document.getElementById(`btn-update-${toolId}`);
  if (btn) {
    btn.disabled = true;
    btn.className = "btn btn-sm flex-shrink-0 pe-none btn-updating-progress text-white border-0";
    btn.style.removeProperty("background");
    btn.style.setProperty("--btn-progress", `${state.pct}%`);
    btn.style.border = "none";
    btn.style.boxShadow = "none";

    let textNode = btn.querySelector(".btn-progress-label");
    if (!textNode) {
      btn.innerHTML = `<div class="loader loader-sm me-1"></div><span class="btn-progress-label"></span>`;
      textNode = btn.querySelector(".btn-progress-label");
    }

    if (textNode) {
      if (state.stageText === "Extracting" && state.extractionStep) {
        const prog = state.extractionProgress ? ` (${state.extractionProgress})` : "";
        textNode.textContent = `Extracting: ${state.extractionStep}${prog}`;
        textNode.title = `Extracting: ${state.extractionStep}${prog}`;
      } else if (state.stageText === "Extracting") {
        textNode.textContent = `Extracting archive...`;
        textNode.title = `Extracting archive...`;
      } else if (state.stageText === "Downloading" && state.downloaded && state.total) {
        textNode.textContent = `Downloading ${state.pct}% (${state.downloaded}/${state.total})`;
        textNode.title = `Downloading ${state.pct}% (${state.downloaded}/${state.total})`;
      } else {
        textNode.textContent = `${state.stageText} ${state.pct}%`;
        textNode.title = `${state.stageText} ${state.pct}%`;
      }
    }
  }

  // Disable all other update/delete buttons in Manage Tools modal
  toolsManifest.filter((t) => t.hasManageRow && t.id !== toolId).forEach((t) => {
    const otherUp = document.getElementById(`btn-update-${t.id}`);
    const otherDel = document.getElementById(`btn-delete-${t.id}`);
    if (otherUp) {
      otherUp.disabled = true;
      otherUp.classList.add("opacity-50", "pe-none");
    }
    if (otherDel) {
      otherDel.disabled = true;
      otherDel.classList.add("opacity-50", "pe-none");
    }
  });

  const btnCheckAll = document.getElementById("btn-check-all-updates");
  if (btnCheckAll) {
    btnCheckAll.disabled = true;
    btnCheckAll.classList.add("opacity-50", "pe-none");
  }

  // Display speed & ETA badge in footer if modal is open
  const speedBadge = document.getElementById("tool-download-speed-badge");
  const speedText = document.getElementById("tool-download-speed-text");
  const etaText = document.getElementById("tool-download-eta-text");
  const etaContainer = document.getElementById("tool-download-eta-container");

  if (speedBadge) {
    speedBadge.classList.remove("d-none");
    speedBadge.classList.add("d-flex");
    if (speedText && state.speedVal) speedText.textContent = state.speedVal;
    if (etaText && state.etaVal) {
      etaText.textContent = state.etaVal;
      if (etaContainer) etaContainer.classList.remove("d-none");
    } else if (etaContainer) {
      etaContainer.classList.add("d-none");
    }
  }
}

export function updateActionButton(toolId, toolName, localVer, latestVer) {
  const btnUpdate = document.getElementById(`btn-update-${toolId}`);
  const btnDelete = document.getElementById(`btn-delete-${toolId}`);
  if (!btnUpdate) return;

  // Preserve live update state if this tool is currently updating in background
  if (activeToolUpdates[toolId] && activeToolUpdates[toolId].isUpdating) {
    applyActiveUpdateStateToUI(toolId);
    return;
  }

  btnUpdate.disabled = false;
  btnUpdate.classList.remove("pe-none", "opacity-50");

  const isInstalled = localVer && localVer !== "Not Found" && !localVer.toLowerCase().includes("not");
  const hasUpdate =
    isInstalled &&
    latestVer &&
    latestVer !== "Unknown" &&
    latestVer !== "Checking..." &&
    !latestVer.toLowerCase().includes("check") &&
    localVer.trim() !== latestVer.trim();

  if (!isInstalled) {
    btnUpdate.innerHTML = `<ion-icon name="download-outline"></ion-icon> Install ${toolName}`;
    btnUpdate.className = "btn btn-outline-primary btn-sm flex-grow-1";
    btnUpdate.title = `Install ${toolName} binary to system/app data`;
  } else if (hasUpdate) {
    btnUpdate.innerHTML = `<ion-icon name="repeat-outline"></ion-icon> Update ${toolName}`;
    btnUpdate.className = "btn btn-warning btn-sm flex-grow-1 text-dark";
    btnUpdate.title = `Update ${toolName} from ${localVer} to ${latestVer}`;
  } else {
    btnUpdate.innerHTML = `<ion-icon name="refresh-outline"></ion-icon> Reinstall ${toolName}`;
    btnUpdate.className = "btn btn-primary btn-sm flex-grow-1";
    btnUpdate.title = `Reinstall verified ${toolName} binary build (${localVer})`;
  }

  if (btnDelete) {
    btnDelete.disabled = !isInstalled;
    btnDelete.innerHTML = `<ion-icon name="trash-outline"></ion-icon>`;
    btnDelete.className = `btn btn-outline-danger btn-sm flex-shrink-0 px-2 ${!isInstalled ? "opacity-50 pe-none" : ""}`;
    btnDelete.title = isInstalled ? `Delete ${toolName} binary` : `${toolName} is not installed`;
  }
}

export function showToolAlert(message, type = "danger") {
  const alertBox = document.getElementById("tool-update-alert");
  const alertMsg = document.getElementById("tool-update-alert-msg");
  if (!alertBox || !alertMsg) return;

  alertBox.className = `alert alert-${type} alert-dismissible fade show py-2 px-3 small`;
  alertBox.classList.remove("d-none");
  alertMsg.textContent = message;
}

export function hideToolAlert() {
  const alertBox = document.getElementById("tool-update-alert");
  if (alertBox) alertBox.classList.add("d-none");
}

export async function simulateToolUpdate(toolName, btnElementOrId, callback) {
  const btn = typeof btnElementOrId === "string" ? document.getElementById(btnElementOrId) : btnElementOrId;
  hideToolAlert();

  const cleanTName = toolName.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const foundTool = toolsManifest.find(
    (t) => t.id === cleanTName || t.name.toLowerCase().replace(/[^a-z0-9_-]/g, "") === cleanTName
  );
  const toolId = foundTool ? foundTool.id : cleanTName;

  activeToolUpdates[toolId] = {
    toolId,
    toolName,
    pct: 5,
    stageText: "Downloading",
    downloaded: null,
    total: null,
    speedVal: "Connecting...",
    etaVal: "Estimating...",
    extractionStep: null,
    extractionProgress: null,
    isUpdating: true,
  };

  // Track and disable all other update, delete, and action buttons in Manage Tools modal
  const allUpdateBtns = Array.from(document.querySelectorAll('[id^="btn-update-"]'));
  const allDeleteBtns = Array.from(document.querySelectorAll('[id^="btn-delete-"]'));
  const btnCheckAll = document.getElementById("btn-check-all-updates");
  const otherBtnsToRestore = [];

  allUpdateBtns.forEach((otherBtn) => {
    if (otherBtn.id !== `btn-update-${toolId}`) {
      otherBtnsToRestore.push({
        el: otherBtn,
        wasDisabled: otherBtn.disabled,
      });
      otherBtn.disabled = true;
      otherBtn.classList.add("opacity-50", "pe-none");
    }
  });

  allDeleteBtns.forEach((delBtn) => {
    otherBtnsToRestore.push({
      el: delBtn,
      wasDisabled: delBtn.disabled,
    });
    delBtn.disabled = true;
    delBtn.classList.add("opacity-50", "pe-none");
  });

  if (btnCheckAll) {
    btnCheckAll.disabled = true;
    btnCheckAll.classList.add("opacity-50", "pe-none");
  }

  const restoreOtherButtons = () => {
    otherBtnsToRestore.forEach(({ el, wasDisabled }) => {
      el.disabled = wasDisabled;
      if (!wasDisabled) {
        el.classList.remove("opacity-50", "pe-none");
      }
    });
    if (btnCheckAll) {
      btnCheckAll.disabled = false;
      btnCheckAll.classList.remove("opacity-50", "pe-none");
    }
  };

  const updateProgressStyles = (pct, stageText = "Updating", speedVal = null, etaVal = null) => {
    if (activeToolUpdates[toolId]) {
      if (pct > activeToolUpdates[toolId].pct || activeToolUpdates[toolId].stageText !== "Downloading") {
        activeToolUpdates[toolId].pct = pct;
      }
      if (activeToolUpdates[toolId].stageText !== "Extracting") {
        activeToolUpdates[toolId].stageText = stageText;
      }
      if (speedVal !== null) activeToolUpdates[toolId].speedVal = speedVal;
      if (etaVal !== null) activeToolUpdates[toolId].etaVal = etaVal;
    }
    applyActiveUpdateStateToUI(toolId);
  };

  updateProgressStyles(5, "Downloading", "Connecting...", "Estimating...");

  let pct = 8;
  const startTime = Date.now();
  const estTotalSeconds = toolName.toLowerCase().includes("ffmpeg") ? 25 : 6;

  const interval = setInterval(() => {
    const elapsedSec = (Date.now() - startTime) / 1000;
    if (window.__TAURI__?.core?.invoke) {
      // In Tauri mode: Backend emits real progress via tool_download_progress & tool_extraction_progress
      if (activeToolUpdates[toolId]?.stageText === "Downloading") {
        const currentPct = activeToolUpdates[toolId].pct || 5;
        const remainingSec = Math.max(1, Math.round(estTotalSeconds - elapsedSec));
        const currentSpeed = (3.4 + (currentPct % 7) * 0.38).toFixed(1);
        const etaStr = remainingSec > 60
          ? `${Math.ceil(remainingSec / 60)}m left`
          : `${remainingSec}s left`;
        if (activeToolUpdates[toolId]) {
          activeToolUpdates[toolId].speedVal = `${currentSpeed} MB/s`;
          activeToolUpdates[toolId].etaVal = etaStr;
        }
        applyActiveUpdateStateToUI(toolId);
      } else if (activeToolUpdates[toolId]?.stageText === "Extracting") {
        if (activeToolUpdates[toolId]) {
          activeToolUpdates[toolId].speedVal = "Unpacking";
          activeToolUpdates[toolId].etaVal = "Finishing up...";
        }
        applyActiveUpdateStateToUI(toolId);
      }
    } else {
      // Simulated web fallback
      if (pct < 75) {
        pct += Math.max(1, Math.round((75 - pct) * 0.12));
        if (activeToolUpdates[toolId]) {
          activeToolUpdates[toolId].downloaded = `${((pct / 100) * 42.5).toFixed(1)}M`;
          activeToolUpdates[toolId].total = "42.5M";
        }
        updateProgressStyles(pct, "Downloading", "3.8 MB/s", "5s left");
      } else if (pct < 95) {
        pct += 1;
        const simSteps = [
          `${cleanTName}.exe`,
          `bin/${cleanTName}.exe`,
          `doc/${cleanTName}-manual.html`,
          `finishing up...`,
        ];
        const stepIdx = Math.floor(((pct - 75) / 20) * simSteps.length);
        const simStep = simSteps[Math.min(stepIdx, simSteps.length - 1)];
        if (activeToolUpdates[toolId]) {
          activeToolUpdates[toolId].extractionStep = simStep;
          activeToolUpdates[toolId].extractionProgress = `${(((pct - 75) / 20) * 85.0).toFixed(1)}M/85.0M`;
          activeToolUpdates[toolId].stageText = "Extracting";
        }
        updateProgressStyles(pct, "Extracting", "Unpacking archive...", "Finishing up...");
      }
    }
  }, 400);

  let updateError = null;
  let updateResult = null;

  if (window.__TAURI__?.core?.invoke) {
    try {
      updateResult = await window.__TAURI__.core.invoke("update_tool", { toolName });
    } catch (err) {
      updateError = typeof err === "string" ? err : err?.message || JSON.stringify(err);
    }
  } else {
    // Simulated web fallback
    await new Promise((resolve) => setTimeout(resolve, 3000));
    updateResult = `${toolName} updated to latest version (simulated).`;
  }

  clearInterval(interval);

  const speedBadge = document.getElementById("tool-download-speed-badge");
  if (speedBadge) {
    speedBadge.classList.add("d-none");
    speedBadge.classList.remove("d-flex");
  }

  if (updateError) {
    if (activeToolUpdates[toolId]) activeToolUpdates[toolId].isUpdating = false;
    const curBtn = document.getElementById(`btn-update-${toolId}`);
    if (curBtn) {
      curBtn.style.background = "var(--bs-danger)";
      curBtn.innerHTML = `<ion-icon name="alert-circle-outline" class="me-1"></ion-icon> Failed`;
      curBtn.className = "btn btn-danger btn-sm flex-shrink-0 pe-none btn-updating-progress text-white border-0";
    }
    showToolAlert(`Failed to update ${toolName}: ${updateError}`, "danger");
    restoreOtherButtons();

    setTimeout(() => {
      delete activeToolUpdates[toolId];
      refreshToolsUI();
    }, 2500);
  } else {
    updateProgressStyles(100, "Updated", "Complete", "0s");
    if (activeToolUpdates[toolId]) activeToolUpdates[toolId].isUpdating = false;
    const curBtn = document.getElementById(`btn-update-${toolId}`);
    if (curBtn) {
      curBtn.style.background = "var(--bs-success)";
      curBtn.style.border = "none";
      curBtn.innerHTML = `<ion-icon name="checkmark-outline" class="me-1"></ion-icon> Updated`;
      curBtn.className = "btn btn-success btn-sm flex-shrink-0 pe-none btn-updating-progress text-white border-0";
    }

    setTimeout(() => {
      delete activeToolUpdates[toolId];
      restoreOtherButtons();
      refreshToolsUI();
      if (callback) callback();
    }, 1200);
  }
}

export function initToolsManager() {
  // Render data-driven cards and modal rows from manifest
  renderToolsUI();

  // Initialize initial version check
  refreshToolsUI();

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

        if (activeToolUpdates[toolId]) {
          activeToolUpdates[toolId].stageText = "Downloading";
          activeToolUpdates[toolId].pct = Math.min(99, Math.max(1, Math.round(payload.pct)));
          if (payload.downloaded) activeToolUpdates[toolId].downloaded = payload.downloaded;
          if (payload.total) activeToolUpdates[toolId].total = payload.total;
          if (payload.speed) {
            activeToolUpdates[toolId].speedVal = payload.speed.endsWith("/s") ? payload.speed : `${payload.speed}/s`;
          }
          if (payload.eta) {
            activeToolUpdates[toolId].etaVal = payload.eta.includes("left") ? payload.eta : `${payload.eta} left`;
          }
          activeToolUpdates[toolId].extractionStep = null;
          activeToolUpdates[toolId].extractionProgress = null;
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

        if (activeToolUpdates[toolId]) {
          activeToolUpdates[toolId].stageText = "Extracting";
          activeToolUpdates[toolId].extractionStep = stepText;
          activeToolUpdates[toolId].extractionProgress = payload.progress || null;
          activeToolUpdates[toolId].pct = Math.max(activeToolUpdates[toolId].pct, 85);
          activeToolUpdates[toolId].speedVal = "Unpacking";
          activeToolUpdates[toolId].etaVal = "Finishing up...";
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
      refreshToolsUI();
    });
  }

  const btnCloseAlert = document.getElementById("btn-close-tool-alert");
  if (btnCloseAlert) {
    btnCloseAlert.addEventListener("click", hideToolAlert);
  }

  const btnCheckAll = document.getElementById("btn-check-all-updates");
  if (btnCheckAll) {
    btnCheckAll.addEventListener("click", () => {
      refreshToolsUI();
    });
  }

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

export function initScrollCardsOverflow() {
  const container = document.getElementById("executables-scroll-container");
  if (!container) return;
  const wrapper = container.closest(".scroll-cards-wrapper");
  if (!wrapper) return;

  const updateOverflow = () => {
    const scrollLeft = container.scrollLeft;
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    if (scrollLeft > 4) {
      wrapper.classList.add("has-overflow-left");
    } else {
      wrapper.classList.remove("has-overflow-left");
    }

    if (maxScroll - scrollLeft > 4) {
      wrapper.classList.add("has-overflow-right");
    } else {
      wrapper.classList.remove("has-overflow-right");
    }
  };

  updateOverflow();
  setTimeout(updateOverflow, 50);
  setTimeout(updateOverflow, 300);

  if (container.dataset.velocityScrollBound === "true") {
    return;
  }
  container.dataset.velocityScrollBound = "true";

  container.addEventListener("scroll", updateOverflow, { passive: true });
  window.addEventListener("resize", updateOverflow);

  // Velocity Momentum, Drag-to-Scroll & Rubberband Overscroll engine
  let isDown = false;
  let startX = 0;
  let scrollStart = 0;
  let hasMoved = false;
  let currentOverscroll = 0;
  let momentumId = 0;
  let activeVelocity = 0;
  let moveHistory = [];

  const stopMomentum = () => {
    if (momentumId) {
      cancelAnimationFrame(momentumId);
      momentumId = 0;
    }
    activeVelocity = 0;
  };

  const getRubberbandOffset = (overDistance) => {
    if (overDistance <= 0) return 0;
    return 1.6 * Math.pow(overDistance, 0.55);
  };

  const resetOverscroll = () => {
    if (currentOverscroll !== 0) {
      currentOverscroll = 0;
      container.style.transition = "transform 0.38s cubic-bezier(0.175, 0.885, 0.32, 1.25)";
      container.style.transform = "translateX(0px)";
      setTimeout(() => {
        if (!isDown && !momentumId) {
          container.style.transition = "";
          updateOverflow();
        }
      }, 380);
    }
  };

  const startMomentum = (v0) => {
    stopMomentum();
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    if (maxScroll <= 0) return;

    // Cap velocity within physical bounds (px/ms)
    let v = Math.max(-3.8, Math.min(3.8, v0));
    activeVelocity = v;
    let lastTick = performance.now();
    const friction = 0.935; // Frame-rate normalized decay

    const step = (now) => {
      const dt = Math.min(32, now - lastTick);
      lastTick = now;

      // Frame-rate independent friction decay
      v *= Math.pow(friction, dt / 16.67);
      activeVelocity = v;

      if (Math.abs(v) < 0.01) {
        stopMomentum();
        updateOverflow();
        return;
      }

      const currMaxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      const delta = v * dt;
      const targetScroll = container.scrollLeft - delta;

      if (targetScroll < 0) {
        container.scrollLeft = 0;
        const over = -targetScroll;
        currentOverscroll = getRubberbandOffset(over + Math.abs(v) * 15);
        container.style.transition = "none";
        container.style.transform = `translateX(${currentOverscroll}px)`;
        stopMomentum();
        updateOverflow();
        setTimeout(resetOverscroll, 30);
        return;
      }

      if (targetScroll > currMaxScroll) {
        container.scrollLeft = currMaxScroll;
        const over = targetScroll - currMaxScroll;
        currentOverscroll = -getRubberbandOffset(over + Math.abs(v) * 15);
        container.style.transition = "none";
        container.style.transform = `translateX(${currentOverscroll}px)`;
        stopMomentum();
        updateOverflow();
        setTimeout(resetOverscroll, 30);
        return;
      }

      container.scrollLeft = targetScroll;
      updateOverflow();
      momentumId = requestAnimationFrame(step);
    };

    momentumId = requestAnimationFrame(step);
  };

  container.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    stopMomentum();
    if (currentOverscroll !== 0) {
      resetOverscroll();
    }
    isDown = true;
    hasMoved = false;
    startX = e.clientX;
    scrollStart = container.scrollLeft;
    moveHistory = [{ x: e.clientX, t: performance.now() }];
    container.style.transition = "none";
    container.classList.add("is-dragging");
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    const now = performance.now();
    moveHistory.push({ x: e.clientX, t: now });
    while (moveHistory.length > 1 && now - moveHistory[0].t > 100) {
      moveHistory.shift();
    }

    const dx = e.clientX - startX;
    if (Math.abs(dx) > 3) {
      hasMoved = true;
    }

    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    const targetScroll = scrollStart - dx;

    if (targetScroll < 0) {
      container.scrollLeft = 0;
      const over = -targetScroll;
      currentOverscroll = getRubberbandOffset(over);
      container.style.transform = `translateX(${currentOverscroll}px)`;
      wrapper.classList.remove("has-overflow-left");
      if (maxScroll > 0) wrapper.classList.add("has-overflow-right");
    } else if (targetScroll > maxScroll) {
      container.scrollLeft = maxScroll;
      const over = targetScroll - maxScroll;
      currentOverscroll = -getRubberbandOffset(over);
      container.style.transform = `translateX(${currentOverscroll}px)`;
      wrapper.classList.remove("has-overflow-right");
      if (maxScroll > 0) wrapper.classList.add("has-overflow-left");
    } else {
      container.scrollLeft = targetScroll;
      if (currentOverscroll !== 0) {
        currentOverscroll = 0;
        container.style.transform = "translateX(0px)";
      }
      updateOverflow();
    }
  });

  const handleDragEnd = () => {
    if (!isDown) return;
    isDown = false;
    container.classList.remove("is-dragging");

    if (currentOverscroll !== 0) {
      resetOverscroll();
      return;
    }

    const now = performance.now();
    let releaseVelocity = 0;
    if (moveHistory.length >= 2 && now - moveHistory[moveHistory.length - 1].t <= 70) {
      const recent = moveHistory.filter((p) => now - p.t <= 80);
      const p0 = recent[0] || moveHistory[0];
      const p1 = moveHistory[moveHistory.length - 1];
      const dt = p1.t - p0.t;
      if (dt > 8) {
        releaseVelocity = (p1.x - p0.x) / dt;
      }
    }

    if (Math.abs(releaseVelocity) > 0.05) {
      container.style.transition = "none";
      startMomentum(releaseVelocity);
    } else {
      resetOverscroll();
    }
  };

  window.addEventListener("mouseup", handleDragEnd);
  window.addEventListener("blur", handleDragEnd);

  // Smooth Horizontal Wheel Velocity Scrolling:
  // Intercepts vertical or horizontal wheel events over cards and drives momentum scrolling.
  container.addEventListener(
    "wheel",
    (e) => {
      const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      if (maxScroll <= 0) return;

      const rawDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!rawDelta) return;

      const canScrollLeft = container.scrollLeft > 0 && rawDelta < 0;
      const canScrollRight = container.scrollLeft < maxScroll && rawDelta > 0;

      if (canScrollLeft || canScrollRight || currentOverscroll !== 0) {
        e.preventDefault();

        let multiplier = 1;
        if (e.deltaMode === 1) multiplier = 24; // DOM_DELTA_LINE
        else if (e.deltaMode === 2) multiplier = 300; // DOM_DELTA_PAGE

        const delta = rawDelta * multiplier;
        // Map delta to an initial impulse: negative delta (scroll down/right) increases scrollLeft
        const impulse = -(delta / 100) * 0.42;

        if (momentumId && Math.sign(activeVelocity) === Math.sign(impulse)) {
          startMomentum(Math.max(-3.8, Math.min(3.8, activeVelocity + impulse * 0.5)));
        } else {
          startMomentum(impulse);
        }
      }
    },
    { passive: false }
  );

  // Prevent accidental clicks on child interactive elements during drag
  container.addEventListener(
    "click",
    (e) => {
      if (hasMoved) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );
}
