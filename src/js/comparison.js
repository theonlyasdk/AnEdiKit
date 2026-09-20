// Comparison Dialog Module for Image & AI Tools
// Supports Interactive Split Slider (Sliding Window), Side-by-Side, and Onion Skin
import { uiState } from "./ui_state.js";

let currentOrigSrc = "";
let currentResultSrc = "";
let currentOrigPath = "";
let currentResultPath = "";
let currentTaskName = "";
let zoomLevel = 1.0;
let panX = 0;
let panY = 0;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let splitPositionPct = 50; // 0 to 100
let isDraggingSlider = false;
let activeMode = "split"; // "split", "side", "fade"

function persistComparisonState(debounceMs = 0) {
  const modalEl = document.getElementById("image-comparison-modal");
  const isOpen = modalEl ? !modalEl.classList.contains("d-none") : false;
  if (!isOpen) {
    uiState.remove("comparison_modal");
    return;
  }
  uiState.set(
    "comparison_modal",
    {
      isOpen: true,
      origPath: currentOrigPath,
      resultPath: currentResultPath,
      taskName: currentTaskName,
      activeMode,
      splitPositionPct,
    },
    { debounceMs }
  );
}

function showComparisonToast(message, isError = false) {
  // Local notification helper (no global showToast exists in the app).
  // Renders a Bootstrap toast in the shared notification container,
  // falling back to the status line and console.
  try {
    const container = document.getElementById("notification-toast-container");
    if (container && window.bootstrap?.Toast) {
      const el = document.createElement("div");
      el.className = `toast align-items-center border ${isError ? "text-bg-danger" : "text-bg-success"}`;
      el.setAttribute("role", "alert");
      el.setAttribute("aria-live", "assertive");
      el.setAttribute("aria-atomic", "true");
      el.innerHTML = `<div class="d-flex"><div class="toast-body"></div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
      el.querySelector(".toast-body").textContent = message;
      container.appendChild(el);
      const toast = window.bootstrap.Toast.getOrCreateInstance(el, { delay: 3500 });
      el.addEventListener("hidden.bs.toast", () => el.remove());
      toast.show();
      return;
    }
  } catch (_) {}
  try {
    const statusMsg = document.getElementById("status-message");
    if (statusMsg) statusMsg.textContent = message;
  } catch (_) {}
  if (isError) console.warn(message);
  else console.log(message);
}

export function initComparisonModal() {
  const modalEl = document.getElementById("image-comparison-modal");
  if (!modalEl) return;

  const btnClose = document.getElementById("btn-comp-close");
  const btnCloseX = document.getElementById("btn-comp-close-x");
  const btnModeSplit = document.getElementById("btn-comp-mode-split");
  const btnModeSide = document.getElementById("btn-comp-mode-side");
  const btnModeFade = document.getElementById("btn-comp-mode-fade");
  const fadeSlider = document.getElementById("comp-fade-slider");
  const btnZoomIn = document.getElementById("btn-comp-zoom-in");
  const btnZoomOut = document.getElementById("btn-comp-zoom-out");
  const btnZoomFit = document.getElementById("btn-comp-zoom-fit");
  const btnZoom100 = document.getElementById("btn-comp-zoom-100");
  const btnExport = document.getElementById("btn-comp-export");
  const btnCopy = document.getElementById("btn-comp-copy");
  const btnShowFolder = document.getElementById("btn-comp-show-folder");

  const splitDivider = document.getElementById("comp-split-divider");
  const stage = document.getElementById("comp-stage-container");

  // Close handlers
  const closeModal = () => {
    uiState.remove("comparison_modal");
    // Restore background app view
    const appMain = document.getElementById("app-root");
    if (appMain) {
      appMain.style.transition = "transform 0.3s cubic-bezier(0.09, -0.05, 0.12, 0.98), opacity 0.3s cubic-bezier(0.09, -0.05, 0.12, 0.98)";
      appMain.style.transform = "";
      appMain.style.opacity = "";
    }
    // Slide-out animation
    modalEl.classList.add("comp-closing");
    modalEl.addEventListener("animationend", function onEnd() {
      modalEl.removeEventListener("animationend", onEnd);
      modalEl.classList.add("d-none");
      modalEl.classList.remove("comp-closing");
      document.body.classList.remove("overflow-hidden");
    }, { once: true });
  };

  if (btnClose) btnClose.addEventListener("click", closeModal);
  if (btnCloseX) btnCloseX.addEventListener("click", closeModal);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalEl.classList.contains("d-none")) {
      closeModal();
    }
  });

  const compHeader = modalEl.querySelector(".comp-header");
  if (compHeader) {
    compHeader.setAttribute("data-tauri-drag-region", "");
    compHeader.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("button, a, input, select, textarea, [role=\"button\"]")) return;
      try {
        const win = window.__TAURI__?.window?.getCurrentWindow
          ? window.__TAURI__.window.getCurrentWindow()
          : (window.__TAURI__?.window?.appWindow || null);
        if (win && typeof win.startDragging === "function") {
          win.startDragging().catch((err) => {
            console.warn("Window dragging failed:", err);
          });
        }
      } catch (_) {}
    });
  }

  // Mode Switchers
  const setMode = (mode) => {
    activeMode = mode;
    const splitView = document.getElementById("comp-view-split");
    const sideView = document.getElementById("comp-view-side");
    const fadeView = document.getElementById("comp-view-fade");
    const fadeCtrl = document.getElementById("comp-fade-ctrl-wrapper");

    if (btnModeSplit) btnModeSplit.classList.toggle("active", mode === "split");
    if (btnModeSide) btnModeSide.classList.toggle("active", mode === "side");
    if (btnModeFade) btnModeFade.classList.toggle("active", mode === "fade");

    if (splitView) splitView.classList.toggle("d-none", mode !== "split");
    if (sideView) sideView.classList.toggle("d-none", mode !== "side");
    if (fadeView) fadeView.classList.toggle("d-none", mode !== "fade");
    if (fadeCtrl) fadeCtrl.classList.toggle("d-none", mode !== "fade");

    resetTransform();
    persistComparisonState();
  };

  if (btnModeSplit) btnModeSplit.addEventListener("click", () => setMode("split"));
  if (btnModeSide) btnModeSide.addEventListener("click", () => setMode("side"));
  if (btnModeFade) btnModeFade.addEventListener("click", () => setMode("fade"));

  // Onion skin opacity slider
  if (fadeSlider) {
    fadeSlider.addEventListener("input", () => {
      const imgAfter = document.getElementById("comp-fade-after-img");
      if (imgAfter) {
        imgAfter.style.opacity = (parseFloat(fadeSlider.value) / 100).toString();
      }
    });
  }

  // Split Slider Dragging Interaction
  const updateSplit = (clientX) => {
    const splitWrapper = document.getElementById("comp-split-wrapper");
    if (!splitWrapper) return;
    const rect = splitWrapper.getBoundingClientRect();
    if (rect.width <= 0) return;

    let x = clientX - rect.left;
    x = Math.max(0, Math.min(rect.width, x));
    splitPositionPct = (x / rect.width) * 100;

    const beforeWrapper = document.getElementById("comp-split-before-wrapper");
    const afterWrapper = document.getElementById("comp-split-after-wrapper");
    const divider = document.getElementById("comp-split-divider");

    if (beforeWrapper) {
      beforeWrapper.style.clipPath = `polygon(0% 0%, ${splitPositionPct}% 0%, ${splitPositionPct}% 100%, 0% 100%)`;
    }
    if (afterWrapper) {
      afterWrapper.style.clipPath = `polygon(${splitPositionPct}% 0%, 100% 0%, 100% 100%, ${splitPositionPct}% 100%)`;
    }
    if (divider) {
      divider.style.left = `${splitPositionPct}%`;
    }
    persistComparisonState(80);
  };

  if (splitDivider) {
    splitDivider.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      isDraggingSlider = true;
    });
  }

  const splitWrapper = document.getElementById("comp-split-wrapper");
  if (splitWrapper) {
    splitWrapper.addEventListener("mousedown", (e) => {
      if (e.button === 0 && activeMode === "split") {
        isDraggingSlider = true;
        updateSplit(e.clientX);
      }
    });
  }

  // Touch support for split slider
  if (splitWrapper) {
    splitWrapper.addEventListener("touchstart", (e) => {
      if (activeMode === "split" && e.touches.length > 0) {
        isDraggingSlider = true;
        updateSplit(e.touches[0].clientX);
      }
    }, { passive: true });

    splitWrapper.addEventListener("touchmove", (e) => {
      if (isDraggingSlider && e.touches.length > 0) {
        updateSplit(e.touches[0].clientX);
      }
    }, { passive: true });

    splitWrapper.addEventListener("touchend", () => {
      isDraggingSlider = false;
    });
  }

  // Zoom and Pan Controls
  let panRafId = null;
  const scheduleApplyTransform = () => {
    if (panRafId) return;
    panRafId = requestAnimationFrame(() => {
      panRafId = null;
      applyTransform();
    });
  };

  const setZoomableWillChange = (active) => {
    const targets = document.querySelectorAll(".comp-zoomable");
    targets.forEach((el) => {
      el.style.willChange = active ? "transform" : "";
      el.style.transition = "none";
    });
  };

  const applyTransform = () => {
    const targets = document.querySelectorAll(".comp-zoomable");
    const transformVal = `translate3d(${panX}px, ${panY}px, 0px) scale(${zoomLevel})`;
    targets.forEach((el) => {
      el.style.transform = transformVal;
    });
    const zoomText = document.getElementById("comp-zoom-text");
    if (zoomText) zoomText.textContent = `${Math.round(zoomLevel * 100)}%`;
  };

  const resetTransform = () => {
    zoomLevel = 1.0;
    panX = 0;
    panY = 0;
    applyTransform();
  };

  if (btnZoomIn) {
    btnZoomIn.addEventListener("click", () => {
      zoomLevel = Math.min(5.0, zoomLevel + 0.25);
      applyTransform();
    });
  }

  if (btnZoomOut) {
    btnZoomOut.addEventListener("click", () => {
      zoomLevel = Math.max(0.25, zoomLevel - 0.25);
      applyTransform();
    });
  }

  if (btnZoomFit) btnZoomFit.addEventListener("click", resetTransform);
  if (btnZoom100) {
    btnZoom100.addEventListener("click", () => {
      zoomLevel = 1.0;
      panX = 0;
      panY = 0;
      applyTransform();
    });
  }

  // Mouse wheel zoom on stage and panning
  if (stage) {
    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      zoomLevel = Math.max(0.25, Math.min(5.0, zoomLevel + delta));
      applyTransform();
    }, { passive: false });

    stage.addEventListener("mousedown", (e) => {
      // Middle mouse button (button 1): pan stage from anywhere without modifying split slider
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        isPanning = true;
        setZoomableWillChange(true);
        startPanX = e.clientX - panX;
        startPanY = e.clientY - panY;
        stage.style.cursor = "grabbing";
        return;
      }

      // Left mouse button (button 0):
      if (e.button === 0) {
        // Prevent panning when clicking on the tuning drawer, floating toolbar, split divider, inputs/buttons, or split wrapper
        if (
          e.target.closest("#comp-tuning-drawer") ||
          e.target.closest(".comp-floating-toolbar") ||
          e.target.closest("#comp-split-divider") ||
          e.target.closest("input") ||
          e.target.closest("button") ||
          e.target.closest(".form-range") ||
          (activeMode === "split" && e.target.closest("#comp-split-wrapper"))
        ) {
          return;
        }

        if (!isDraggingSlider) {
          isPanning = true;
          setZoomableWillChange(true);
          startPanX = e.clientX - panX;
          startPanY = e.clientY - panY;
          stage.style.cursor = "grabbing";
        }
      }
    });

    stage.addEventListener("auxclick", (e) => {
      if (e.button === 1) {
        e.preventDefault();
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (isPanning) {
        panX = e.clientX - startPanX;
        panY = e.clientY - startPanY;
        scheduleApplyTransform();
      }
      if (isDraggingSlider) {
        updateSplit(e.clientX);
      }
    });

    window.addEventListener("mouseup", () => {
      if (isPanning) {
        isPanning = false;
        setZoomableWillChange(false);
        if (stage) stage.style.cursor = "default";
      }
      if (isDraggingSlider) {
        isDraggingSlider = false;
      }
    });
  }

  // Tuning Drawer & Header Toggle Button Event Listeners
  const btnTuningClose = document.getElementById("btn-comp-tuning-close");
  const btnToggleTuning = document.getElementById("btn-comp-toggle-tuning");
  const tuningDrawer = document.getElementById("comp-tuning-drawer");

  const setTuningDrawerVisible = (visible) => {
    if (tuningDrawer) {
      tuningDrawer.classList.toggle("d-none", !visible);
    }
    if (btnToggleTuning) {
      btnToggleTuning.classList.toggle("active", visible);
    }
  };

  if (btnTuningClose) {
    btnTuningClose.addEventListener("click", () => setTuningDrawerVisible(false));
  }
  if (btnToggleTuning) {
    btnToggleTuning.addEventListener("click", () => {
      const isCurrentlyHidden = !tuningDrawer || tuningDrawer.classList.contains("d-none");
      setTuningDrawerVisible(isCurrentlyHidden);
    });
  }

  const compTileInput = document.getElementById("comp-fake-tile-size");
  const compTileVal = document.getElementById("comp-fake-tile-size-val");
  const compTolInput = document.getElementById("comp-fake-grid-tolerance");
  const compTolVal = document.getElementById("comp-fake-grid-tolerance-val");
  const compGapInput = document.getElementById("comp-fake-gap-threshold");
  const compGapVal = document.getElementById("comp-fake-gap-threshold-val");
  const btnReapply = document.getElementById("btn-comp-reapply");

  if (compTileInput && compTileVal) {
    compTileInput.addEventListener("input", () => {
      compTileVal.textContent = compTileInput.value === "0" ? "Auto" : `${compTileInput.value}px`;
      const mainTile = document.getElementById("fake-grid-tile-size");
      if (mainTile) mainTile.value = compTileInput.value;
    });
  }
  if (compTolInput && compTolVal) {
    compTolInput.addEventListener("input", () => {
      compTolVal.textContent = compTolInput.value;
      const mainTol = document.getElementById("fake-grid-tolerance");
      if (mainTol) mainTol.value = compTolInput.value;
    });
  }
  if (compGapInput && compGapVal) {
    compGapInput.addEventListener("input", () => {
      compGapVal.textContent = compGapInput.value;
      const mainGap = document.getElementById("fake-gap-threshold");
      if (mainGap) mainGap.value = compGapInput.value;
    });
  }

  if (btnReapply) {
    btnReapply.addEventListener("click", async () => {
      if (!currentOrigPath || !currentResultPath) return;

      const mainTile = document.getElementById("fake-grid-tile-size");
      const mainTol = document.getElementById("fake-grid-tolerance");
      const mainGap = document.getElementById("fake-gap-threshold");
      if (compTileInput && mainTile) mainTile.value = compTileInput.value;
      if (compTolInput && mainTol) mainTol.value = compTolInput.value;
      if (compGapInput && mainGap) mainGap.value = compGapInput.value;

      btnReapply.disabled = true;
      btnReapply.innerHTML = `<span class="spinner-border spinner-border-sm" role="status"></span> Generating...`;
      setComparisonShimmer(true);

      window.dispatchEvent(new CustomEvent("anedikit:regenerate_comparison", {
        detail: {
          origPath: currentOrigPath,
          resultPath: currentResultPath,
          taskName: currentTaskName || "Fake Transparency",
        },
      }));
    });
  }

  // Export / Save Image
  if (btnExport) {
    btnExport.addEventListener("click", async () => {
      if (!currentResultPath) return;
      try {
        if (window.__TAURI__?.core?.invoke) {
          const suggested = currentResultPath.split(/[/\\]/).pop() || "image.png";
          const dest = await window.__TAURI__.core.invoke("save_image_as", {
            sourcePath: currentResultPath,
            suggestedName: suggested,
          });
          // dest is null when the user cancels the save dialog.
          if (dest) {
            showComparisonToast("Saved image successfully");
          }
        } else {
          // Browser fallback: trigger a download via anchor element.
          const a = document.createElement("a");
          a.href = currentResultSrc;
          a.download = currentResultPath.split(/[/\\]/).pop() || "image.png";
          document.body.appendChild(a);
          a.click();
          a.remove();
          showComparisonToast("Saved image successfully");
        }
      } catch (err) {
        console.warn("Save image error:", err);
        showComparisonToast(`Save failed: ${err?.message || err}`, true);
      }
    });
  }

  // Copy Result Image
  if (btnCopy) {
    btnCopy.addEventListener("click", async () => {
      if (!currentResultPath && !currentResultSrc) return;
      try {
        // Resolve the image bytes (fresh convertFileSrc first so the
        // cache-buster query never breaks the asset protocol fetch).
        let blob = null;
        const candidates = [];
        if (window.__TAURI__?.core?.convertFileSrc && currentResultPath) {
          try {
            candidates.push(window.__TAURI__.core.convertFileSrc(currentResultPath));
          } catch (_) {}
        }
        if (currentResultSrc) candidates.push(currentResultSrc);
        for (const url of candidates) {
          for (const attempt of [url, url.split("?")[0]]) {
            try {
              const res = await fetch(attempt);
              if (!res.ok) continue;
              const b = await res.blob();
              if (b && b.size > 0) {
                blob = b;
                break;
              }
            } catch (_) {}
          }
          if (blob) break;
        }
        if (blob && window.ClipboardItem && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
          showComparisonToast("Copied to clipboard");
        } else if (navigator.clipboard?.writeText && currentResultPath) {
          await navigator.clipboard.writeText(currentResultPath);
          showComparisonToast("Copied file path to clipboard");
        } else {
          throw new Error("Clipboard unavailable");
        }
      } catch (err) {
        console.warn("Copy error:", err);
        showComparisonToast(`Copy failed: ${err?.message || err}`, true);
      }
    });
  }

  // Show in folder
  if (btnShowFolder) {
    btnShowFolder.addEventListener("click", () => {
      if (currentResultPath && window.__TAURI__?.core?.invoke) {
        window.__TAURI__.core.invoke("show_in_folder", { filePath: currentResultPath });
      }
    });
  }

  // Restore saved comparison modal state across refreshes
  const saved = uiState.get("comparison_modal");
  if (saved && saved.isOpen && saved.origPath && saved.resultPath) {
    openComparisonModal(saved.origPath, saved.resultPath, saved.taskName || "Enhanced Image");
    if (saved.activeMode) {
      setMode(saved.activeMode);
    }
    if (typeof saved.splitPositionPct === "number") {
      splitPositionPct = saved.splitPositionPct;
      const beforeWrapper = document.getElementById("comp-split-before-wrapper");
      const afterWrapper = document.getElementById("comp-split-after-wrapper");
      const divider = document.getElementById("comp-split-divider");
      if (beforeWrapper) {
        beforeWrapper.style.clipPath = `polygon(0% 0%, ${splitPositionPct}% 0%, ${splitPositionPct}% 100%, 0% 100%)`;
      }
      if (afterWrapper) {
        afterWrapper.style.clipPath = `polygon(${splitPositionPct}% 0%, 100% 0%, 100% 100%, ${splitPositionPct}% 100%)`;
      }
      if (divider) {
        divider.style.left = `${splitPositionPct}%`;
      }
      persistComparisonState();
    }
  }
}

export function openComparisonModal(origPath, resultPath, taskName = "Enhanced Image") {
  const modal = document.getElementById("image-comparison-modal");
  if (!modal) return;

  currentOrigPath = origPath;
  currentResultPath = resultPath;
  currentTaskName = taskName;

  const toSrc = (p, isResult = false) => {
    if (!p) return "";
    if (p.startsWith("data:") || p.startsWith("blob:") || p.startsWith("http")) return p;
    const base = window.__TAURI__?.core?.convertFileSrc ? window.__TAURI__.core.convertFileSrc(p) : p;
    return isResult ? `${base}?t=${Date.now()}` : base;
  };

  currentOrigSrc = toSrc(origPath, false);
  currentResultSrc = toSrc(resultPath, true);

  // Set titles
  const titleEl = document.getElementById("comp-modal-title");
  const subtitleEl = document.getElementById("comp-modal-subtitle");
  const origName = origPath.split(/[/\\]/).pop() || "Original";
  const resultName = resultPath.split(/[/\\]/).pop() || "Processed";

  if (titleEl) titleEl.textContent = `Comparing ${origName}`;
  if (subtitleEl) subtitleEl.textContent = `${taskName} • ${resultName}`;

  // Set images in Split View
  const splitBefore = document.getElementById("comp-split-before-img");
  const splitAfter = document.getElementById("comp-split-after-img");
  if (splitBefore) splitBefore.src = currentOrigSrc;
  if (splitAfter) splitAfter.src = currentResultSrc;

  // Set images in Side-by-Side View
  const sideBefore = document.getElementById("comp-side-before-img");
  const sideAfter = document.getElementById("comp-side-after-img");
  if (sideBefore) sideBefore.src = currentOrigSrc;
  if (sideAfter) sideAfter.src = currentResultSrc;

  // Set images in Fade View
  const fadeBefore = document.getElementById("comp-fade-before-img");
  const fadeAfter = document.getElementById("comp-fade-after-img");
  if (fadeBefore) fadeBefore.src = currentOrigSrc;
  if (fadeAfter) {
    fadeAfter.src = currentResultSrc;
    fadeAfter.style.opacity = "0.5";
  }
  const fadeSlider = document.getElementById("comp-fade-slider");
  if (fadeSlider) fadeSlider.value = "50";

  // Reset split slider position to 50%
  splitPositionPct = 50;
  const beforeWrapper = document.getElementById("comp-split-before-wrapper");
  const afterWrapper = document.getElementById("comp-split-after-wrapper");
  const divider = document.getElementById("comp-split-divider");
  if (beforeWrapper) {
    beforeWrapper.style.clipPath = `polygon(0% 0%, 50% 0%, 50% 100%, 0% 100%)`;
  }
  if (afterWrapper) {
    afterWrapper.style.clipPath = `polygon(50% 0%, 100% 0%, 100% 100%, 50% 100%)`;
  }
  if (divider) {
    divider.style.left = `50%`;
  }

  // Reset Zoom
  zoomLevel = 1.0;
  panX = 0;
  panY = 0;
  const targets = document.querySelectorAll(".comp-zoomable");
  targets.forEach((el) => {
    el.style.transform = `translate(0px, 0px) scale(1)`;
  });
  const zoomText = document.getElementById("comp-zoom-text");
  if (zoomText) zoomText.textContent = `100%`;

  // Show/hide tuning drawer in comparison modal based on task & active model
  const tuningDrawer = document.getElementById("comp-tuning-drawer");
  const btnToggleTuning = document.getElementById("btn-comp-toggle-tuning");
  const isFakeTransparency = taskName.toLowerCase().includes("fake transparency") || 
                             document.getElementById("bg-model")?.value === "fake_transparency";

  if (btnToggleTuning) {
    btnToggleTuning.classList.toggle("d-none", !isFakeTransparency);
    btnToggleTuning.classList.toggle("active", isFakeTransparency);
  }

  if (tuningDrawer) {
    tuningDrawer.classList.toggle("d-none", !isFakeTransparency);
    if (isFakeTransparency) {
      // Initialize inputs with current form settings
      const mainTileSize = document.getElementById("fake-grid-tile-size")?.value || "0";
      const mainGridTol = document.getElementById("fake-grid-tolerance")?.value || "14";
      const mainGapThresh = document.getElementById("fake-gap-threshold")?.value || "15";

      const compTileInput = document.getElementById("comp-fake-tile-size");
      const compTileVal = document.getElementById("comp-fake-tile-size-val");
      const compTolInput = document.getElementById("comp-fake-grid-tolerance");
      const compTolVal = document.getElementById("comp-fake-grid-tolerance-val");
      const compGapInput = document.getElementById("comp-fake-gap-threshold");
      const compGapVal = document.getElementById("comp-fake-gap-threshold-val");

      if (compTileInput) {
        compTileInput.value = mainTileSize;
        if (compTileVal) compTileVal.textContent = mainTileSize === "0" ? "Auto" : `${mainTileSize}px`;
      }
      if (compTolInput) {
        compTolInput.value = mainGridTol;
        if (compTolVal) compTolVal.textContent = mainGridTol;
      }
      if (compGapInput) {
        compGapInput.value = mainGapThresh;
        if (compGapVal) compGapVal.textContent = mainGapThresh;
      }
    }
  }

  // Show modal with slide-in animation
  // Background (main app view) scales down while comparison slides up
  const appMain = document.getElementById("main-content-area") || document.querySelector(".col.p-0.d-flex");
  if (appMain) {
    appMain.style.transition = "transform 0.35s cubic-bezier(0.09, -0.05, 0.12, 0.98), opacity 0.35s cubic-bezier(0.09, -0.05, 0.12, 0.98)";
    appMain.style.transform = "scale(0.75)";
    appMain.style.opacity = "0.3";
    appMain.style.transformOrigin = "center center";
  }
  modal.classList.remove("d-none", "comp-closing");
  document.body.classList.add("overflow-hidden");
  persistComparisonState();
}

export function setComparisonShimmer(isGenerating) {
  const stage = document.getElementById("comp-stage-container");
  if (stage) {
    stage.classList.toggle("is-generating", !!isGenerating);
  }
}
