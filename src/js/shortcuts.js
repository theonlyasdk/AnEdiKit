import { switchTool } from "./navigation.js";
import { sharedPlaybackController } from "./playback.js";

/**
 * Check if the active target element is an interactive input where typing shortcuts should not intercept.
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
export function isTypingTarget(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  // Check if inside a contentEditable container (e.g. rich text or code editors)
  if (typeof target.closest === "function" && target.closest("[contenteditable='true']")) {
    return true;
  }
  return false;
}

/**
 * Handle global keydown events for desktop shortcuts.
 * @param {KeyboardEvent} e
 */
export function handleGlobalKeyDown(e) {
  const isCtrlOrCmd = e.ctrlKey || e.metaKey;
  const key = e.key;

  // Escape key: dismiss active modal or lightbox
  if (key === "Escape") {
    // 1. Lightbox check
    const lightboxOverlay = document.querySelector(".image-lightbox-overlay");
    if (lightboxOverlay) {
      const closeBtn = lightboxOverlay.querySelector(".image-lightbox-close");
      if (closeBtn) {
        closeBtn.click();
        e.preventDefault();
        return;
      }
    }

    // 2. Open Bootstrap modal check
    const openModal = document.querySelector(".modal.show");
    if (openModal) {
      if (window.bootstrap?.Modal) {
        const instance = window.bootstrap.Modal.getInstance(openModal);
        if (instance) {
          instance.hide();
          e.preventDefault();
          return;
        }
      }
      const closeBtn = openModal.querySelector('[data-bs-dismiss="modal"]');
      if (closeBtn) {
        closeBtn.click();
        e.preventDefault();
        return;
      }
    }

    // If focused in input and no modal is open, blur it
    if (isTypingTarget(e.target) && typeof e.target.blur === "function") {
      e.target.blur();
    }
    return;
  }

  // Ctrl+,: Settings
  if (isCtrlOrCmd && key === ",") {
    e.preventDefault();
    switchTool("settings");
    return;
  }

  // Ctrl+O: Open file picker
  if (isCtrlOrCmd && (key === "o" || key === "O")) {
    e.preventDefault();
    const browseBtn = document.getElementById("btn-browse-input");
    if (browseBtn && !browseBtn.disabled) {
      browseBtn.click();
    }
    return;
  }

  // Ctrl+Enter or Ctrl+E: Execute current tool
  if (isCtrlOrCmd && (key === "Enter" || key === "e" || key === "E")) {
    // If inside a multiline textarea / contentEditable and user presses Ctrl+Enter, we still allow execute
    // unless they specifically pressed Ctrl+E inside text without intent to execute.
    // For convenience and productivity in media toolkit, both trigger execution if button is active.
    const executeBtn = document.getElementById("btn-execute");
    if (executeBtn && !executeBtn.disabled) {
      e.preventDefault();
      executeBtn.click();
    }
    return;
  }

  // Space: Play/Pause media preview
  if (key === " " || key === "Spacebar") {
    if (isTypingTarget(e.target)) {
      return; // allow normal space character entry in input/textarea
    }
    e.preventDefault();
    if (sharedPlaybackController && typeof sharedPlaybackController.togglePlayPause === "function") {
      sharedPlaybackController.togglePlayPause();
    }
    return;
  }
}

/**
 * Initialize the morphing behaviour for the About/Credits modal.
 */
export function initAboutModalMorph() {
  const modalEl = document.getElementById("credits-modal");
  if (!modalEl || modalEl.dataset.morphBound === "true") return;
  modalEl.dataset.morphBound = "true";

  const contentEl = document.getElementById("about-modal-content");
  const dialogEl = document.getElementById("credits-modal-dialog");
  const infoPane = document.getElementById("about-pane-info");
  const shortcutsPane = document.getElementById("about-pane-shortcuts");
  const showShortcutsBtn = document.getElementById("btn-toggle-shortcuts");
  const backBtn = document.getElementById("btn-back-to-about");

  let morphRaf = 0;
  let heightResetTimer = 0;

  function cancelPendingMorph() {
    if (morphRaf) {
      cancelAnimationFrame(morphRaf);
      morphRaf = 0;
    }
    if (heightResetTimer) {
      clearTimeout(heightResetTimer);
      heightResetTimer = 0;
    }
  }

  function morphTo(fromPane, toPane, targetWidth) {
    cancelPendingMorph();

    const startH = contentEl?.offsetHeight || fromPane.offsetHeight;

    // Lock starting height to interpolate fluidly like an iOS sheet
    if (contentEl && startH > 0) {
      contentEl.style.height = `${startH}px`;
    }

    if (dialogEl) {
      dialogEl.style.maxWidth = targetWidth;
    }

    // Switch visibility with entering state
    fromPane.classList.add("d-none");
    fromPane.classList.remove("about-pane-active", "about-pane-entering");

    toPane.classList.remove("d-none", "about-pane-active");
    toPane.classList.add("about-pane-entering");

    // Measure target height cleanly without layout thrashing
    const targetH = toPane.offsetHeight;

    morphRaf = requestAnimationFrame(() => {
      morphRaf = requestAnimationFrame(() => {
        morphRaf = 0;
        toPane.classList.remove("about-pane-entering");
        toPane.classList.add("about-pane-active");

        if (contentEl && targetH > 0) {
          contentEl.style.height = `${targetH}px`;
          // After transition completes, release fixed height so dialog is naturally responsive
          heightResetTimer = setTimeout(() => {
            if (contentEl) contentEl.style.height = "";
          }, 260);
        }
      });
    });
  }

  function showShortcuts() {
    morphTo(infoPane, shortcutsPane, "460px");
  }

  function showInfo() {
    morphTo(shortcutsPane, infoPane, "400px");
  }

  function resetInstant() {
    cancelPendingMorph();
    if (contentEl) {
      contentEl.style.height = "";
    }
    shortcutsPane.classList.add("d-none");
    shortcutsPane.classList.remove("about-pane-active", "about-pane-entering");
    infoPane.classList.remove("d-none", "about-pane-entering");
    infoPane.classList.add("about-pane-active");
    if (dialogEl) {
      dialogEl.style.maxWidth = "400px";
    }
  }

  if (showShortcutsBtn) {
    showShortcutsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      showShortcuts();
    });
  }

  if (backBtn) {
    backBtn.addEventListener("click", (e) => {
      e.preventDefault();
      showInfo();
    });
  }

  // When modal is dismissed, reset immediately to the default info pane
  modalEl.addEventListener("hidden.bs.modal", () => {
    resetInstant();
  });
}

/**
 * Attach global keyboard shortcuts and modal morphing logic.
 */
export function initKeyboardShortcuts() {
  window.addEventListener("keydown", handleGlobalKeyDown);
  initAboutModalMorph();
}
