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
            <div class="d-flex gap-4 small text-body-secondary">
              <div>Installed: <span class="text-body fw-medium" id="${tool.id}-local-ver"><span class="meta-loading-pulse">...</span></span></div>
              <div>Latest: <span class="text-body fw-medium" id="${tool.id}-latest-ver"><span class="meta-loading-pulse">...</span></span></div>
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
      btnUpdate.disabled = true;
      btnUpdate.className = "btn btn-secondary btn-sm flex-grow-1 pe-none opacity-50";
      btnUpdate.innerHTML = `<div class="loader loader-sm me-1"></div> Loading...`;
    }
    const btnDelete = document.getElementById(`btn-delete-${tool.id}`);
    if (btnDelete) {
      btnDelete.disabled = true;
      btnDelete.classList.add("opacity-50", "pe-none");
    }
  });

  const [localInfo, latestInfo] = await Promise.all([
    checkLocalToolVersions(),
    fetchLatestGitHubReleases(),
  ]);

  toolsManifest.forEach((tool) => {
    const localVer = localInfo[tool.id] || localInfo[`${tool.id}_installed`] || localInfo[tool.binName] || "Not Found";
    const latestVer = latestInfo[tool.id] || latestInfo[`${tool.id}_latest`] || "Unknown";

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

export function updateActionButton(toolId, toolName, localVer, latestVer) {
  const btnUpdate = document.getElementById(`btn-update-${toolId}`);
  const btnDelete = document.getElementById(`btn-delete-${toolId}`);
  if (!btnUpdate) return;

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

  const originalBtnHtml = btn ? btn.innerHTML : null;
  const originalBtnDisabled = btn ? btn.disabled : false;
  const originalBtnClass = btn ? btn.className : null;

  // Track and disable all other update, delete, and action buttons in Manage Tools modal
  const allUpdateBtns = Array.from(document.querySelectorAll('[id^="btn-update-"]'));
  const allDeleteBtns = Array.from(document.querySelectorAll('[id^="btn-delete-"]'));
  const btnCheckAll = document.getElementById("btn-check-all-updates");
  const otherBtnsToRestore = [];

  allUpdateBtns.forEach((otherBtn) => {
    if (otherBtn !== btn) {
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

  const speedBadge = document.getElementById("tool-download-speed-badge");
  const speedText = document.getElementById("tool-download-speed-text");
  const etaText = document.getElementById("tool-download-eta-text");
  const etaContainer = document.getElementById("tool-download-eta-container");

  if (speedBadge) {
    speedBadge.classList.remove("d-none");
    speedBadge.classList.add("d-flex");
    if (speedText) speedText.textContent = "Connecting...";
    if (etaText) etaText.textContent = "Estimating...";
    if (etaContainer) etaContainer.classList.remove("d-none");
  }

  // Pre-create persistent loading elements inside button to avoid re-creating loader DOM node on every tick
  let loaderEl = null;
  let textNode = null;
  if (btn) {
    btn.disabled = true;
    btn.className = "btn btn-sm flex-shrink-0 pe-none btn-updating-progress text-white border-0";
    btn.innerHTML = `<div class="loader loader-sm me-1"></div><span class="btn-progress-label"></span>`;
    loaderEl = btn.querySelector(".loader");
    textNode = btn.querySelector(".btn-progress-label");
  }

  const updateProgressStyles = (pct, stageText = "Updating", speedVal = null, etaVal = null) => {
    if (!btn) return;
    // Drive the class gradient via the registered custom property so the
    // fill edge transitions (lerps) instead of snapping between ticks.
    btn.style.removeProperty("background");
    btn.style.setProperty("--btn-progress", `${pct}%`);
    btn.style.border = "none";
    btn.style.boxShadow = "none";
    if (textNode) {
      textNode.textContent = `${stageText} ${pct}%`;
    }

    if (speedText && speedVal !== null) {
      speedText.textContent = speedVal;
    }
    if (etaText && etaVal !== null) {
      etaText.textContent = etaVal;
    }
  };

  updateProgressStyles(5, "Downloading", "Connecting...", "Estimating...");

  // Two-stage progress: Download phase (0-75%) followed by Async Extraction phase (75-95%)
  let pct = 8;
  const startTime = Date.now();
  const estTotalSeconds = toolName.toLowerCase().includes("ffmpeg") ? 25 : 6;

  const interval = setInterval(() => {
    const elapsedSec = (Date.now() - startTime) / 1000;
    if (pct < 75) {
      // Downloading phase
      pct += Math.max(1, Math.round((75 - pct) * 0.12));
      const remainingSec = Math.max(1, Math.round(estTotalSeconds - elapsedSec));
      const currentSpeed = (3.4 + (pct % 7) * 0.38).toFixed(1);
      const etaStr = remainingSec > 60
        ? `${Math.ceil(remainingSec / 60)}m left`
        : `${remainingSec}s left`;
      updateProgressStyles(pct, "Downloading", `${currentSpeed} MB/s`, etaStr);
    } else if (pct < 95) {
      // Async archive extraction phase
      pct += 1;
      updateProgressStyles(pct, "Extracting", "Unpacking archive...", "Finishing up...");
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
    await new Promise((resolve) => setTimeout(resolve, 2000));
    updateResult = `${toolName} updated to latest version (simulated).`;
  }

  clearInterval(interval);

  if (speedBadge) {
    speedBadge.classList.add("d-none");
    speedBadge.classList.remove("d-flex");
  }

  if (updateError) {
    // Show error state on button and banner
    if (btn) {
      btn.style.background = "var(--bs-danger)";
      btn.innerHTML = `<ion-icon name="alert-circle-outline" class="me-1"></ion-icon> Failed`;
      btn.className = "btn btn-danger btn-sm flex-shrink-0 pe-none btn-updating-progress text-white border-0";
    }
    showToolAlert(`Failed to update ${toolName}: ${updateError}`, "danger");
    restoreOtherButtons();

    setTimeout(() => {
      if (btn) {
        btn.disabled = originalBtnDisabled;
        btn.classList.remove("pe-none", "btn-updating-progress", "btn-danger", "text-white", "border-0");
        btn.style.background = "";
        btn.style.removeProperty("--btn-progress");
        btn.style.border = "";
        btn.style.boxShadow = "";
        if (originalBtnClass) btn.className = originalBtnClass;
        if (originalBtnHtml) btn.innerHTML = originalBtnHtml;
      }
    }, 2500);
  } else {
    // Show success state
    updateProgressStyles(100, "Updated", "Complete", "0s");
    if (btn) {
      btn.style.background = "var(--bs-success)";
      btn.style.border = "none";
      btn.innerHTML = `<ion-icon name="checkmark-outline" class="me-1"></ion-icon> Updated`;
      btn.className = "btn btn-success btn-sm flex-shrink-0 pe-none btn-updating-progress text-white border-0";
    }

    setTimeout(() => {
      restoreOtherButtons();
      if (btn) {
        btn.disabled = originalBtnDisabled;
        btn.classList.remove("pe-none", "btn-updating-progress", "btn-success", "text-white", "border-0");
        btn.style.background = "";
        btn.style.removeProperty("--btn-progress");
        btn.style.border = "";
        btn.style.boxShadow = "";
        if (originalBtnClass) btn.className = originalBtnClass;
        if (originalBtnHtml) btn.innerHTML = originalBtnHtml;
      }
      if (callback) callback();
    }, 1200);
  }
}

export function initToolsManager() {
  // Render data-driven cards and modal rows from manifest
  renderToolsUI();

  // Initialize initial version check
  refreshToolsUI();

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
    const maxScroll = container.scrollWidth - container.clientWidth;
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

  container.addEventListener("scroll", updateOverflow, { passive: true });
  window.addEventListener("resize", updateOverflow);
  // Initial check after render
  setTimeout(updateOverflow, 50);
  setTimeout(updateOverflow, 300);

  // Drag-to-scroll & Rubberband Overscroll implementation (Uncapped Power-Law Stiffness)
  let isDown = false;
  let startX = 0;
  let scrollStart = 0;
  let hasMoved = false;
  let currentOverscroll = 0;

  // As drag distance increases, stiffness increases continuously without stopping or hard capping
  const getRubberbandOffset = (overDistance) => {
    if (overDistance <= 0) return 0;
    return 1.6 * Math.pow(overDistance, 0.55);
  };

  const resetOverscroll = () => {
    if (currentOverscroll !== 0) {
      currentOverscroll = 0;
      container.style.transition = "transform 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
      container.style.transform = "translateX(0px)";
      setTimeout(() => {
        if (!isDown) {
          container.style.transition = "";
          updateOverflow();
        }
      }, 450);
    }
  };

  container.addEventListener("mousedown", (e) => {
    // Only left click
    if (e.button !== 0) return;
    isDown = true;
    hasMoved = false;
    startX = e.pageX - container.offsetLeft;
    scrollStart = container.scrollLeft;
    container.style.transition = "none";
    container.classList.add("is-dragging");
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 1.4; // Scroll speed multiplier
    if (Math.abs(walk) > 3) {
      hasMoved = true;
    }

    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    const targetScroll = scrollStart - walk;

    if (targetScroll < 0) {
      // Rubberband overscroll on left boundary
      container.scrollLeft = 0;
      const over = -targetScroll;
      currentOverscroll = getRubberbandOffset(over);
      container.style.transform = `translateX(${currentOverscroll}px)`;
      wrapper.classList.remove("has-overflow-left");
      if (maxScroll > 0) wrapper.classList.add("has-overflow-right");
    } else if (targetScroll > maxScroll) {
      // Rubberband overscroll on right boundary
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
    resetOverscroll();
  };

  window.addEventListener("mouseup", handleDragEnd);
  container.addEventListener("mouseleave", handleDragEnd);

  // Prevent accidental clicks on child links or interactive elements during drag
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
