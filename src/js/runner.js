// AnEdiKit - Job runner facade (API-preserving).
// Implementations live in ./runner/*.js; init/wiring stays here.

import {
  isJobRunning,
  isCancelRequested,
  resetCancelFlag,
} from "./runner/state.js";
import {
  setControlsDisabledState,
  appendLog,
  clearLogs,
  setProcessingHeading,
  updateProgress,
  attachTauriListeners,
} from "./runner/progress.js";
import {
  executeFfmpegJob,
  cancelFfmpegJob,
} from "./runner/job.js";
import {
  executeBatchQueue,
  onJobFinished,
} from "./runner/batch.js";
import {
  showBatchFinishedNotification,
  showFinishedNotification,
  openFile,
  showInFolder,
} from "./runner/notify.js";

export {
  isJobRunning,
  isCancelRequested,
  resetCancelFlag,
  setControlsDisabledState,
  appendLog,
  clearLogs,
  setProcessingHeading,
  updateProgress,
  attachTauriListeners,
  executeFfmpegJob,
  cancelFfmpegJob,
  executeBatchQueue,
  onJobFinished,
  showBatchFinishedNotification,
  showFinishedNotification,
  openFile,
  showInFolder,
};

import { runnerState } from "./runner/state.js";
import { animateCopyConfirm } from "./copy_anim.js";
import { setupExecutionStatusAutoScroll } from "./runner/progress.js";

export async function initJobRunner() {
  // Check if a background task is already executing (e.g. after page reload)
  if (window.__TAURI__?.core?.invoke) {
    try {
      const active = await window.__TAURI__.core.invoke("is_job_active");
      if (active) {
        runnerState.isRunning = true;
        setControlsDisabledState(true);

        const statusPanel = document.getElementById("execution-status-panel");
        const statusMsg = document.getElementById("status-message");
        const btnExecute = document.getElementById("btn-execute");

        if (statusPanel) {
          statusPanel.classList.remove("d-none");
          setupExecutionStatusAutoScroll();
          setTimeout(() => {
            try { statusPanel.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (_) {}
          }, 80);
        }
        if (statusMsg) statusMsg.textContent = "Processing task...";
        if (btnExecute) {
          btnExecute.textContent = "Cancel";
          btnExecute.classList.remove("btn-primary");
          btnExecute.classList.add("btn-danger");
          btnExecute.disabled = false;
        }

        await attachTauriListeners();
      }
    } catch (e) {
      console.warn("Check is_job_active error:", e);
    }

    // Listen for confirm-exit-requested from Rust backend
    try {
      if (window.__TAURI__?.event?.listen) {
        await window.__TAURI__.event.listen("confirm-exit-requested", () => {
          const modalEl = document.getElementById("confirm-exit-modal");
          if (modalEl && window.bootstrap?.Modal) {
            const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
          }
        });
      }
    } catch (e) {
      console.warn("Listen confirm-exit-requested error:", e);
    }
  }

  // Bind Confirm Force Exit button
  const btnForceExit = document.getElementById("btn-confirm-force-exit");
  if (btnForceExit) {
    btnForceExit.addEventListener("click", async () => {
      if (window.__TAURI__?.core?.invoke) {
        try {
          await window.__TAURI__.core.invoke("force_exit_app");
        } catch (e) {
          console.warn("force_exit_app error:", e);
        }
      }
    });
  }

  // Bind Log Copy button
  initLogCopyButton();

  // Prevent accidental reload/unload when job is active
  window.addEventListener("beforeunload", (e) => {
    if (runnerState.isRunning) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}


export function initLogCopyButton() {
  const btnCopy = document.getElementById("btn-copy-logs");
  const logConsole = document.getElementById("log-console");
  if (!btnCopy || !logConsole) return;

  btnCopy.onclick = async () => {
    try {
      // Gather lines cleanly from child elements to ensure full text fidelity
      const lines = Array.from(logConsole.querySelectorAll("div"))
        .map((el) => el.textContent || "")
        .filter((t) => t.trim().length > 0);

      const textToCopy = lines.length > 0
        ? lines.join("\n")
        : (logConsole.innerText || logConsole.textContent || "");

      if (!textToCopy.trim()) return;

      await navigator.clipboard.writeText(textToCopy);

      const originalTitle = btnCopy.getAttribute("title") || "Copy execution log to clipboard";
      btnCopy.classList.add("copied");
      animateCopyConfirm(btnCopy.querySelector("ion-icon"), { holdMs: 1400 });
      btnCopy.setAttribute("title", "Copied to clipboard!");

      setTimeout(() => {
        btnCopy.classList.remove("copied");
        btnCopy.setAttribute("title", originalTitle);
      }, 1800);
    } catch (err) {
      console.warn("Failed to copy execution logs to clipboard:", err);
    }
  };
}
