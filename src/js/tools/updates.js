// AnEdiKit - Tool update simulation + binary deletion.
import toolsManifest from "../../data/tools-manifest.json" with { type: "json" };
import { toolUpdateState } from "./store.js";
import { showToolAlert, hideToolAlert } from "./alerts.js";
import { requestRefreshToolsUI } from "../tools_ui_bridge.js";
import { reportError } from "../errors.js";

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
      el.classList.remove("btn-shimmer");
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
    btnDelete.classList.add("opacity-50", "pe-none", "btn-shimmer");
    btnDelete.innerHTML = `<ion-icon name="trash-outline"></ion-icon>`;
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


export function applyActiveUpdateStateToUI(toolId) {
  const state = toolUpdateState[toolId];
  if (!state || !state.isUpdating) return;

  const btn = document.getElementById(`btn-update-${toolId}`);
  if (btn) {
    btn.disabled = true;
    btn.className = "btn btn-sm flex-shrink-0 pe-none btn-updating-progress text-white border-0 btn-shimmer";
    btn.style.removeProperty("background");
    btn.style.setProperty("--btn-progress", `${state.pct}%`);
    btn.style.border = "none";
    btn.style.boxShadow = "none";

    let textNode = btn.querySelector(".btn-progress-label");
    if (!textNode) {
      btn.innerHTML = `<span class="btn-progress-label"></span>`;
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
  if (toolUpdateState[toolId] && toolUpdateState[toolId].isUpdating) {
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


export async function simulateToolUpdate(toolName, btnElementOrId, callback) {
  const btn = typeof btnElementOrId === "string" ? document.getElementById(btnElementOrId) : btnElementOrId;
  hideToolAlert();

  const cleanTName = toolName.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const foundTool = toolsManifest.find(
    (t) => t.id === cleanTName || t.name.toLowerCase().replace(/[^a-z0-9_-]/g, "") === cleanTName
  );
  const toolId = foundTool ? foundTool.id : cleanTName;

  toolUpdateState[toolId] = {
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

  const btnDone = document.getElementById("btn-manage-tools-done");
  let updateCancelled = false;

  const handleCancelUpdate = async () => {
    updateCancelled = true;
    if (btnDone) {
      btnDone.disabled = true;
      btnDone.classList.add("btn-shimmer");
      btnDone.innerHTML = `Cancelling...`;
    }
    if (window.__TAURI__?.core?.invoke) {
      try {
        await window.__TAURI__.core.invoke("cancel_tool_update");
      } catch (err) {
        console.warn("cancel_tool_update error:", err);
      }
    }
  };

  if (btnDone) {
    btnDone.textContent = "Cancel";
    btnDone.className = "btn btn-danger btn-sm px-3";
    btnDone.removeAttribute("data-bs-dismiss");
    btnDone.addEventListener("click", handleCancelUpdate);
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
    if (btnDone) {
      btnDone.removeEventListener("click", handleCancelUpdate);
      btnDone.disabled = false;
      btnDone.textContent = "Done";
      btnDone.className = "btn btn-primary btn-sm px-3";
      btnDone.setAttribute("data-bs-dismiss", "modal");
    }
  };

  const updateProgressStyles = (pct, stageText = "Updating", speedVal = null, etaVal = null) => {
    if (toolUpdateState[toolId]) {
      if (pct > toolUpdateState[toolId].pct || toolUpdateState[toolId].stageText !== "Downloading") {
        toolUpdateState[toolId].pct = pct;
      }
      if (toolUpdateState[toolId].stageText !== "Extracting") {
        toolUpdateState[toolId].stageText = stageText;
      }
      if (speedVal !== null) toolUpdateState[toolId].speedVal = speedVal;
      if (etaVal !== null) toolUpdateState[toolId].etaVal = etaVal;
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
      if (toolUpdateState[toolId]?.stageText === "Downloading") {
        const currentPct = toolUpdateState[toolId].pct || 5;
        const remainingSec = Math.max(1, Math.round(estTotalSeconds - elapsedSec));
        const currentSpeed = (3.4 + (currentPct % 7) * 0.38).toFixed(1);
        const etaStr = remainingSec > 60
          ? `${Math.ceil(remainingSec / 60)}m left`
          : `${remainingSec}s left`;
        if (toolUpdateState[toolId]) {
          toolUpdateState[toolId].speedVal = `${currentSpeed} MB/s`;
          toolUpdateState[toolId].etaVal = etaStr;
        }
        applyActiveUpdateStateToUI(toolId);
      } else if (toolUpdateState[toolId]?.stageText === "Extracting") {
        if (toolUpdateState[toolId]) {
          toolUpdateState[toolId].speedVal = "Unpacking";
          toolUpdateState[toolId].etaVal = "Finishing up...";
        }
        applyActiveUpdateStateToUI(toolId);
      }
    } else {
      // Simulated web fallback
      if (pct < 75) {
        pct += Math.max(1, Math.round((75 - pct) * 0.12));
        if (toolUpdateState[toolId]) {
          toolUpdateState[toolId].downloaded = `${((pct / 100) * 42.5).toFixed(1)}M`;
          toolUpdateState[toolId].total = "42.5M";
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
        if (toolUpdateState[toolId]) {
          toolUpdateState[toolId].extractionStep = simStep;
          toolUpdateState[toolId].extractionProgress = `${(((pct - 75) / 20) * 85.0).toFixed(1)}M/85.0M`;
          toolUpdateState[toolId].stageText = "Extracting";
        }
        updateProgressStyles(pct, "Extracting", "Unpacking archive...", "Finishing up...");
      }
    }
  }, 60);

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
    if (toolUpdateState[toolId]) toolUpdateState[toolId].isUpdating = false;
    const isCancelled = updateCancelled || updateError.toLowerCase().includes("cancel");
    const curBtn = document.getElementById(`btn-update-${toolId}`);
    if (curBtn) {
      if (isCancelled) {
        curBtn.style.background = "var(--bs-secondary)";
        curBtn.innerHTML = `<ion-icon name="close-circle-outline" class="me-1"></ion-icon> Cancelled`;
        curBtn.className = "btn btn-secondary btn-sm flex-shrink-0 pe-none btn-updating-progress text-white border-0";
      } else {
        curBtn.style.background = "var(--bs-danger)";
        curBtn.innerHTML = `<ion-icon name="alert-circle-outline" class="me-1"></ion-icon> Failed`;
        curBtn.className = "btn btn-danger btn-sm flex-shrink-0 pe-none btn-updating-progress text-white border-0";
      }
    }
    if (isCancelled) {
      showToolAlert(`Update for ${toolName} was cancelled.`, "secondary");
    } else {
      showToolAlert(`Failed to update ${toolName}: ${updateError}`, "danger");
    }
    restoreOtherButtons();

    setTimeout(() => {
      delete toolUpdateState[toolId];
      requestRefreshToolsUI();
    }, isCancelled ? 1500 : 2500);
  } else {
    updateProgressStyles(100, "Updated", "Complete", "0s");
    if (toolUpdateState[toolId]) toolUpdateState[toolId].isUpdating = false;
    const curBtn = document.getElementById(`btn-update-${toolId}`);
    if (curBtn) {
      curBtn.style.background = "var(--bs-success)";
      curBtn.style.border = "none";
      curBtn.innerHTML = `<ion-icon name="checkmark-outline" class="me-1"></ion-icon> Updated`;
      curBtn.className = "btn btn-success btn-sm flex-shrink-0 pe-none btn-updating-progress text-white border-0";
    }

    setTimeout(() => {
      delete toolUpdateState[toolId];
      restoreOtherButtons();
      requestRefreshToolsUI();
      if (callback) callback();
    }, 1200);
  }
}
