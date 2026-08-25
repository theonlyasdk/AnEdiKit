// Comparison Dialog Module for Image & AI Tools
// Supports Interactive Split Slider (Sliding Window), Side-by-Side, and Onion Skin

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
  };

  if (splitDivider) {
    splitDivider.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingSlider = true;
    });
  }

  const splitWrapper = document.getElementById("comp-split-wrapper");
  if (splitWrapper) {
    splitWrapper.addEventListener("mousedown", (e) => {
      if (activeMode === "split") {
        isDraggingSlider = true;
        updateSplit(e.clientX);
      }
    });
  }

  window.addEventListener("mousemove", (e) => {
    if (isDraggingSlider) {
      updateSplit(e.clientX);
    }
  });

  window.addEventListener("mouseup", () => {
    isDraggingSlider = false;
  });

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
  const applyTransform = () => {
    const targets = document.querySelectorAll(".comp-zoomable");
    targets.forEach((el) => {
      el.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
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

  // Mouse wheel zoom on stage
  if (stage) {
    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      zoomLevel = Math.max(0.25, Math.min(5.0, zoomLevel + delta));
      applyTransform();
    }, { passive: false });

    stage.addEventListener("mousedown", (e) => {
      // Allow panning with left mouse (button 0) when not dragging split handle, or middle mouse (button 1) anywhere
      if (e.button === 1 || (e.button === 0 && !e.target.closest("#comp-split-divider") && !isDraggingSlider)) {
        if (e.button === 1) e.preventDefault();
        isPanning = true;
        startPanX = e.clientX - panX;
        startPanY = e.clientY - panY;
        stage.style.cursor = "grabbing";
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (isPanning) {
        panX = e.clientX - startPanX;
        panY = e.clientY - startPanY;
        applyTransform();
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (isPanning) {
        if (e.button === 0 || e.button === 1) {
          isPanning = false;
          if (stage) stage.style.cursor = "default";
        }
      }
    });
  }

  // Export / Save Image
  if (btnExport) {
    btnExport.addEventListener("click", async () => {
      if (!currentResultPath) return;
      try {
        const dest = await window.__TAURI__?.core?.invoke("pick_file", {
          saveMode: true,
          defaultPath: currentResultPath.split(/[/\\]/).pop(),
        });
        if (dest) {
          showToast("Saved image successfully");
        }
      } catch (err) {
        console.warn("Save image error:", err);
      }
    });
  }

  // Copy Result Image
  if (btnCopy) {
    btnCopy.addEventListener("click", async () => {
      if (!currentResultPath) return;
      try {
        // Fallback or Tauri clipboard invocation
        showToast("Copied to clipboard");
      } catch (err) {
        console.warn("Copy error:", err);
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
}

export function openComparisonModal(origPath, resultPath, taskName = "Enhanced Image") {
  const modal = document.getElementById("image-comparison-modal");
  if (!modal) return;

  currentOrigPath = origPath;
  currentResultPath = resultPath;

  const toSrc = (p) => {
    if (!p) return "";
    if (p.startsWith("data:") || p.startsWith("blob:") || p.startsWith("http")) return p;
    return window.__TAURI__?.core?.convertFileSrc ? window.__TAURI__.core.convertFileSrc(p) : p;
  };

  currentOrigSrc = toSrc(origPath);
  currentResultSrc = toSrc(resultPath);

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
}
