// AnEdiKit - Completion notifications + reveal-in-folder helpers.
import { runnerState } from "./state.js";
import { loadSettings } from "../storage.js";

export async function showBatchFinishedNotification({
  destination = "",
  toolName = "Batch Processing",
  total = 0,
  successCount = 0,
  failCount = 0,
  elapsedSeconds = "0.0",
} = {}) {
  const currentSettings = loadSettings();
  if (currentSettings.enableNotifications === false) {
    return;
  }

  const destFolder = destination
    ? (destination.includes(".") && (destination.includes("\\") || destination.includes("/"))
        ? destination.substring(0, Math.max(destination.lastIndexOf("\\"), destination.lastIndexOf("/")))
        : destination)
    : "";

  const title = `${toolName} Completed`;
  const summary = failCount > 0
    ? `Completed ${successCount} of ${total} items (${failCount} failed) in ${elapsedSeconds}s`
    : `Successfully processed ${successCount} item${successCount === 1 ? "" : "s"} in ${elapsedSeconds}s`;

  // 1. Send native Windows system notification
  if (window.__TAURI__?.core?.invoke) {
    window.__TAURI__.core.invoke("send_system_notification", {
      title,
      body: summary,
    }).catch((err) => console.warn("System notification error:", err));
  }

  // 2. Also try HTML5 Notification if supported
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, {
        body: summary,
      });
    }
  } catch (err) {
    console.warn("Web Notification error:", err);
  }

  // 3. Show actionable UI Toast in the application
  const toastEl = document.getElementById("finished-toast");
  const toastTitle = document.getElementById("toast-title");
  const toastFileName = document.getElementById("toast-filename");
  const toastMetaDetails = document.getElementById("toast-meta-details");
  const toastTimestamp = document.getElementById("toast-timestamp");
  const btnOpenFile = document.getElementById("toast-btn-open-file");
  const btnOpenFolder = document.getElementById("toast-btn-open-folder");

  if (toastTitle) toastTitle.textContent = title;
  if (toastFileName) {
    toastFileName.textContent = `${successCount} item${successCount === 1 ? "" : "s"} processed`;
    toastFileName.title = destFolder || destination;
  }

  if (toastMetaDetails) {
    const statusText = failCount > 0 ? `${failCount} failed` : "All items succeeded";
    toastMetaDetails.innerHTML = `Time taken: <strong class="text-body fw-medium">${elapsedSeconds}s</strong> &bull; <span class="${failCount > 0 ? 'text-warning' : 'text-success'}">${statusText}</span>`;
  }

  if (toastTimestamp) {
    toastTimestamp.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  if (btnOpenFile) {
    btnOpenFile.onclick = () => {
      if (destination && destination.includes(".")) {
        openFile(destination);
      } else if (destFolder) {
        showInFolder(destFolder);
      }
    };
  }

  if (btnOpenFolder) {
    btnOpenFolder.onclick = () => {
      showInFolder(destFolder || destination);
    };
  }

  if (toastEl && window.bootstrap?.Toast) {
    const toast = window.bootstrap.Toast.getOrCreateInstance(toastEl);
    toastEl.classList.remove("toast-sliding-out");
    toast.show();

    const closeBtn = toastEl.querySelector(".btn-close");
    if (closeBtn && !closeBtn.dataset.slideBound) {
      closeBtn.dataset.slideBound = "true";
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toastEl.classList.add("toast-sliding-out");
        setTimeout(() => {
          toastEl.classList.remove("toast-sliding-out");
          toast.hide();
        }, 350);
      });
    }
  }
}


export async function showFinishedNotification(destination, toolName = "Conversion", elapsedSeconds = "0.0") {
  if (!destination) return;

  const currentSettings = loadSettings();
  if (currentSettings.enableNotifications === false) {
    return;
  }

  const fileName = destination.split(/[/\\]/).pop() || destination;

  // Query final file size
  let finalSizeStr = "";
  if (window.__TAURI__?.core?.invoke) {
    try {
      const info = await window.__TAURI__.core.invoke("get_media_info", { filePath: destination });
      if (info && info.file_size_formatted) {
        finalSizeStr = info.file_size_formatted;
      }
    } catch (e) {
      console.warn("Failed to probe final file size:", e);
    }
  }

  // 1. Send native Windows system notification
  if (window.__TAURI__?.core?.invoke) {
    const detailMsg = finalSizeStr
      ? `Finished in ${elapsedSeconds}s (${finalSizeStr})`
      : `Finished in ${elapsedSeconds}s`;
    window.__TAURI__.core.invoke("send_system_notification", {
      title: `${toolName} Completed`,
      body: `${fileName} - ${detailMsg}`,
    }).catch((err) => console.warn("System notification error:", err));
  }

  // 2. Also try HTML5 Notification if supported
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`${toolName} Completed`, {
        body: `${fileName} (${elapsedSeconds}s)`,
      });
    }
  } catch (err) {
    console.warn("Web Notification error:", err);
  }

  // 3. Show actionable UI Toast in the application
  const toastEl = document.getElementById("finished-toast");
  const toastTitle = document.getElementById("toast-title");
  const toastFileName = document.getElementById("toast-filename");
  const toastMetaDetails = document.getElementById("toast-meta-details");
  const toastTimestamp = document.getElementById("toast-timestamp");
  const btnOpenFile = document.getElementById("toast-btn-open-file");
  const btnOpenFolder = document.getElementById("toast-btn-open-folder");

  if (toastTitle) toastTitle.textContent = `${toolName} Completed`;
  if (toastFileName) {
    toastFileName.textContent = fileName;
    toastFileName.title = destination;
  }

  if (toastMetaDetails) {
    const sizeText = finalSizeStr ? `Final size: <strong class="text-body fw-medium">${finalSizeStr}</strong>` : "";
    toastMetaDetails.innerHTML = `Time taken: <strong class="text-body fw-medium">${elapsedSeconds}s</strong>${sizeText ? ` &bull; ${sizeText}` : ""}`;
  }

  if (toastTimestamp) {
    toastTimestamp.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  if (btnOpenFile) {
    btnOpenFile.onclick = () => {
      openFile(destination);
    };
  }

  if (btnOpenFolder) {
    btnOpenFolder.onclick = () => {
      showInFolder(destination);
    };
  }

  if (toastEl && window.bootstrap?.Toast) {
    const toast = window.bootstrap.Toast.getOrCreateInstance(toastEl);
    toastEl.classList.remove("toast-sliding-out");
    toast.show();

    const closeBtn = toastEl.querySelector(".btn-close");
    if (closeBtn && !closeBtn.dataset.slideBound) {
      closeBtn.dataset.slideBound = "true";
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toastEl.classList.add("toast-sliding-out");
        setTimeout(() => {
          toastEl.classList.remove("toast-sliding-out");
          toast.hide();
        }, 350);
      });
    }
  }
}


export async function openFile(filePath) {
  if (!filePath) return;
  if (window.__TAURI__?.core?.invoke) {
    try {
      await window.__TAURI__.core.invoke("open_file", { filePath });
    } catch (e) {
      console.warn("open_file error:", e);
    }
  } else if (window.__TAURI__?.opener?.openPath) {
    window.__TAURI__.opener.openPath(filePath);
  }
}


export async function showInFolder(filePath) {
  if (!filePath) return;
  if (window.__TAURI__?.core?.invoke) {
    try {
      await window.__TAURI__.core.invoke("show_in_folder", { filePath });
    } catch (e) {
      console.warn("show_in_folder error:", e);
    }
  }
}
