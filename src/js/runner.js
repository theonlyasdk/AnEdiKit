// Task Execution Runner Module
import { updateBatchItemStatus } from "./media.js";

let isRunning = false;
let isBatchRunning = false;
let batchCancelRequested = false;
let currentProgressUnlisten = null;
let currentLogUnlisten = null;
let currentFinishedUnlisten = null;

export function isJobRunning() {
  return isRunning || isBatchRunning;
}

export function isBatchJobActive() {
  return isBatchRunning;
}

export function setControlsDisabledState(disabled) {
  const elements = document.querySelectorAll(
    "#tool-workspace input, #tool-workspace select, #btn-reset",
  );
  elements.forEach((el) => {
    el.disabled = disabled;
  });

  const sharedInput = document.getElementById("shared-input-card");
  const sharedUrl = document.getElementById("shared-url-card");
  if (sharedInput) sharedInput.classList.toggle("opacity-75", disabled);
  if (sharedUrl) sharedUrl.classList.toggle("opacity-75", disabled);
}

export function appendLog(text, isError = false) {
  const logConsole = document.getElementById("log-console");
  if (!logConsole) return;

  const lineEl = document.createElement("div");
  lineEl.className = isError ? "text-danger" : "text-success-emphasis";
  lineEl.textContent = text;
  logConsole.appendChild(lineEl);
  logConsole.scrollTop = logConsole.scrollHeight;
}

export function clearLogs() {
  const logConsole = document.getElementById("log-console");
  if (logConsole) {
    logConsole.innerHTML = "";
  }
}

export function updateProgress(data) {
  const { time, fps, speed, bitrate, pct, playlist_item, playlist_total, current_item_title } = data;
  const bar = document.getElementById("job-progress-bar");
  const pctEl = document.getElementById("progress-pct");
  const statTime = document.getElementById("stat-time");
  const statFps = document.getElementById("stat-fps");
  const statSpeed = document.getElementById("stat-speed");
  const statBitrate = document.getElementById("stat-bitrate");

  // Playlist / Batch total items progress
  const playlistWrapper = document.getElementById("playlist-progress-wrapper");
  const playlistText = document.getElementById("playlist-progress-text");
  const playlistBar = document.getElementById("playlist-progress-bar");
  if (playlist_total && playlist_total > 1) {
    if (playlistWrapper) playlistWrapper.classList.remove("d-none");
    const itemNum = playlist_item || 1;
    const itemPct = Math.min(100, Math.max(0, Math.round((itemNum / playlist_total) * 100)));
    if (playlistText) playlistText.textContent = `Item ${itemNum} of ${playlist_total} (${itemPct}%)`;
    if (playlistBar) playlistBar.style.width = `${itemPct}%`;
  } else if (!playlist_total && playlistWrapper && !isRunning) {
    playlistWrapper.classList.add("d-none");
  }

  // Currently downloading item title
  const currentItemWrapper = document.getElementById("current-item-wrapper");
  const currentItemName = document.getElementById("current-item-name");
  if (current_item_title) {
    if (currentItemWrapper) currentItemWrapper.classList.remove("d-none");
    if (currentItemName) currentItemName.textContent = current_item_title;
  } else if (!current_item_title && currentItemWrapper && !isRunning) {
    currentItemWrapper.classList.add("d-none");
  }

  if (time && statTime) statTime.textContent = `Time: ${time}`;
  if (fps && statFps) statFps.textContent = `FPS: ${fps}`;
  if (speed && statSpeed) statSpeed.textContent = `Speed: ${speed}`;
  if (bitrate && statBitrate) statBitrate.textContent = `Bitrate: ${bitrate}`;

  if (bar && pctEl) {
    if (pct <= 0) {
      pctEl.textContent = "0%";
      bar.classList.add("progress-bar-striped", "progress-bar-animated");
      bar.style.width = "100%";
    } else {
      const clamped = Math.min(100, Math.max(0, Math.round(pct)));
      pctEl.textContent = `${clamped}%`;
      bar.classList.remove("progress-bar-striped", "progress-bar-animated");
      bar.style.width = `${clamped}%`;
    }
  }
}

let activeJobInfo = null;
let jobStartTime = 0;

export async function attachTauriListeners() {
  if (!window.__TAURI__?.event?.listen) return;
  const { listen } = window.__TAURI__.event;

  if (!currentProgressUnlisten) {
    currentProgressUnlisten = await listen("ffmpeg-progress", (event) => {
      updateProgress(event.payload);
    });
  }

  if (!currentLogUnlisten) {
    currentLogUnlisten = await listen("ffmpeg-log", (event) => {
      if (event.payload?.line) {
        appendLog(event.payload.line);
      }
    });
  }

  if (!currentFinishedUnlisten) {
    currentFinishedUnlisten = await listen("ffmpeg-finished", (event) => {
      const { success, message } = event.payload;
      onJobFinished(success, message);
    });
  }
}

export function executeFfmpegJob(commandObj, totalDuration = 0.0) {
  if (isRunning) {
    return;
  }

  jobStartTime = Date.now();
  activeJobInfo = {
    destination: commandObj.destination || "",
    toolName: commandObj.executable === "yt-dlp" ? "Download" : "Conversion",
  };

  const statusPanel = document.getElementById("execution-status-panel");
  const statusMsg = document.getElementById("status-message");
  const btnExecute = document.getElementById("btn-execute");
  const playlistWrapper = document.getElementById("playlist-progress-wrapper");
  const currentItemWrapper = document.getElementById("current-item-wrapper");

  if (playlistWrapper) playlistWrapper.classList.add("d-none");
  if (currentItemWrapper) currentItemWrapper.classList.add("d-none");

  if (statusPanel) {
    statusPanel.classList.remove("d-none", "ui-zoom-in");
    void statusPanel.offsetWidth;
    statusPanel.classList.add("ui-zoom-in");
  }

  clearLogs();
  appendLog(`[Starting job: ${commandObj.fullString}]`);
  updateProgress({
    time: "00:00:00",
    fps: "0",
    speed: "0x",
    bitrate: "0 kbits/s",
    pct: 0,
  });

  isRunning = true;
  setControlsDisabledState(true);

  if (statusMsg) statusMsg.textContent = "Processing task...";
  if (btnExecute) {
    btnExecute.textContent = "Cancel";
    btnExecute.classList.remove("btn-primary");
    btnExecute.classList.add("btn-danger");
  }

  // Smoothly scroll workspace to bottom to view logs and status
  const workspace = document.getElementById("tool-workspace");
  if (workspace) {
    setTimeout(() => {
      workspace.scrollTo({ top: workspace.scrollHeight, behavior: "smooth" });
    }, 60);
  }

  // Tauri IPC execution
  if (window.__TAURI__?.core?.invoke) {
    (async () => {
      try {
        await attachTauriListeners();

        if (commandObj.executable === "yt-dlp") {
          await window.__TAURI__.core.invoke("execute_ytdlp", {
            args: commandObj.args,
          });
        } else {
          await window.__TAURI__.core.invoke("execute_ffmpeg", {
            args: commandObj.args,
            totalDuration: totalDuration || 0.0,
          });
        }
      } catch (err) {
        appendLog(`Execution error: ${err}`, true);
        onJobFinished(false, `Error: ${err}`);
      }
    })();
    return;
  }

  // Browser Simulation Fallback
  let simPct = 0;
  const simInterval = setInterval(() => {
    if (!isRunning) {
      clearInterval(simInterval);
      return;
    }
    simPct += 15;
    const curSec = Math.round((simPct / 100) * (totalDuration || 120));
    const m = Math.floor(curSec / 60);
    const s = curSec % 60;
    const timeStr = `00:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;

    updateProgress({
      time: timeStr,
      fps: "60",
      speed: "2.4x",
      bitrate: "3200 kbits/s",
      pct: simPct,
    });
    appendLog(
      `frame= ${simPct * 12} fps=60 q=-1.0 size= ${simPct * 80}kB time=${timeStr} bitrate=3200kbits/s speed=2.4x`,
    );

    if (simPct >= 100) {
      clearInterval(simInterval);
      onJobFinished(
        true,
        `Conversion complete. Saved to ${commandObj.destination}`,
      );
    }
  }, 400);
}

export async function cancelFfmpegJob() {
  if (isBatchRunning) {
    batchCancelRequested = true;
  }
  if (!isRunning && !isBatchRunning) return;

  if (window.__TAURI__?.core?.invoke) {
    try {
      await window.__TAURI__.core.invoke("cancel_ffmpeg");
    } catch (err) {
      console.warn("Cancel invoke error:", err);
    }
  }

  if (!isBatchRunning) {
    onJobFinished(false, "Job cancelled by user");
  }
}

export async function executeBatchQueue(queue, toolId, settings, buildCommandFn) {
  if (isRunning || isBatchRunning) return;
  if (!queue || queue.length === 0) return;

  isBatchRunning = true;
  batchCancelRequested = false;
  setControlsDisabledState(true);

  const statusPanel = document.getElementById("execution-status-panel");
  const statusMsg = document.getElementById("status-message");
  const btnExecute = document.getElementById("btn-execute");
  const playlistWrapper = document.getElementById("playlist-progress-wrapper");
  const playlistText = document.getElementById("playlist-progress-text");
  const playlistBar = document.getElementById("playlist-progress-bar");
  const currentItemWrapper = document.getElementById("current-item-wrapper");
  const currentItemName = document.getElementById("current-item-name");

  if (statusPanel) {
    statusPanel.classList.remove("d-none", "ui-zoom-in");
    void statusPanel.offsetWidth;
    statusPanel.classList.add("ui-zoom-in");
  }

  if (playlistWrapper) playlistWrapper.classList.remove("d-none");
  if (currentItemWrapper) currentItemWrapper.classList.remove("d-none");

  if (btnExecute) {
    btnExecute.textContent = "Cancel Batch";
    btnExecute.classList.remove("btn-primary");
    btnExecute.classList.add("btn-danger");
  }

  clearLogs();
  appendLog(`[Starting Batch Queue: ${queue.length} items]`);

  for (let i = 0; i < queue.length; i++) {
    if (batchCancelRequested) {
      appendLog(`[Batch queue stopped by user at item ${i + 1}]`, true);
      break;
    }

    const item = queue[i];
    item.status = "processing";
    updateBatchItemStatus(i, "processing");

    const itemPct = Math.round(((i + 1) / queue.length) * 100);
    if (playlistText) playlistText.textContent = `Item ${i + 1} of ${queue.length} (${itemPct}%)`;
    if (playlistBar) playlistBar.style.width = `${itemPct}%`;
    if (currentItemName) currentItemName.textContent = item.name;

    const commandObj = buildCommandFn(toolId, item.path, settings.outputDir, settings);
    appendLog(`[Item ${i + 1}/${queue.length}: Processing ${item.name}]`);

    const result = await new Promise((resolve) => {
      jobStartTime = Date.now();
      activeJobInfo = {
        destination: commandObj.destination || "",
        toolName: commandObj.executable === "yt-dlp" ? "Download" : "Conversion",
      };
      isRunning = true;

      if (window.__TAURI__?.core?.invoke) {
        let unlistenProgress = null;
        let unlistenLog = null;
        let unlistenFinished = null;

        (async () => {
          try {
            const { listen } = window.__TAURI__.event;
            unlistenProgress = await listen("ffmpeg-progress", (ev) => {
              updateProgress({
                ...ev.payload,
                playlist_item: i + 1,
                playlist_total: queue.length,
                current_item_title: item.name,
              });
            });
            unlistenLog = await listen("ffmpeg-log", (ev) => {
              if (ev.payload?.line) appendLog(ev.payload.line);
            });
            unlistenFinished = await listen("ffmpeg-finished", (ev) => {
              if (unlistenProgress) unlistenProgress();
              if (unlistenLog) unlistenLog();
              if (unlistenFinished) unlistenFinished();
              isRunning = false;
              resolve(ev.payload.success);
            });

            if (commandObj.executable === "yt-dlp") {
              await window.__TAURI__.core.invoke("execute_ytdlp", { args: commandObj.args });
            } else {
              await window.__TAURI__.core.invoke("execute_ffmpeg", { args: commandObj.args, totalDuration: commandObj.duration || 0.0 });
            }
          } catch (e) {
            appendLog(`Item error: ${e}`, true);
            isRunning = false;
            resolve(false);
          }
        })();
      } else {
        setTimeout(() => {
          isRunning = false;
          resolve(true);
        }, 1200);
      }
    });

    if (result) {
      item.status = "done";
      updateBatchItemStatus(i, "done");
      appendLog(`[Item ${i + 1}/${queue.length}: Done ${item.name}]`);
    } else {
      item.status = "error";
      updateBatchItemStatus(i, "error");
      appendLog(`[Item ${i + 1}/${queue.length}: Failed ${item.name}]`, true);
    }
  }

  isBatchRunning = false;
  isRunning = false;
  setControlsDisabledState(false);

  if (btnExecute) {
    btnExecute.textContent = `Execute Batch (${queue.length} items)`;
    btnExecute.classList.remove("btn-danger");
    btnExecute.classList.add("btn-primary");
  }
  if (statusMsg) statusMsg.textContent = batchCancelRequested ? "Batch cancelled" : "Batch completed successfully";
  appendLog(batchCancelRequested ? "[Batch queue stopped]" : "[Batch queue completed successfully]");
}

export function onJobFinished(success, message) {
  isRunning = false;
  setControlsDisabledState(false);

  if (currentProgressUnlisten) {
    currentProgressUnlisten();
    currentProgressUnlisten = null;
  }
  if (currentLogUnlisten) {
    currentLogUnlisten();
    currentLogUnlisten = null;
  }
  if (currentFinishedUnlisten) {
    currentFinishedUnlisten();
    currentFinishedUnlisten = null;
  }

  const statusMsg = document.getElementById("status-message");
  const btnExecute = document.getElementById("btn-execute");

  if (statusMsg) statusMsg.textContent = message;
  if (btnExecute) {
    btnExecute.textContent = "Execute";
    btnExecute.classList.remove("btn-danger");
    btnExecute.classList.add("btn-primary");
  }

  appendLog(`[${message}]`, !success);
  if (success) {
    updateProgress({
      time: "",
      fps: "",
      speed: "",
      bitrate: "",
      pct: 100,
    });

    const elapsedSeconds = jobStartTime > 0 ? ((Date.now() - jobStartTime) / 1000).toFixed(1) : "0.0";
    if (activeJobInfo && activeJobInfo.destination) {
      showFinishedNotification(activeJobInfo.destination, activeJobInfo.toolName, elapsedSeconds);
    }
  }
}

export async function showFinishedNotification(destination, toolName = "Conversion", elapsedSeconds = "0.0") {
  if (!destination) return;

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
    toast.show();
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

export async function initJobRunner() {
  // Check if a background task is already executing (e.g. after page reload)
  if (window.__TAURI__?.core?.invoke) {
    try {
      const active = await window.__TAURI__.core.invoke("is_job_active");
      if (active) {
        isRunning = true;
        setControlsDisabledState(true);

        const statusPanel = document.getElementById("execution-status-panel");
        const statusMsg = document.getElementById("status-message");
        const btnExecute = document.getElementById("btn-execute");

        if (statusPanel) {
          statusPanel.classList.remove("d-none");
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

  // Prevent accidental reload/unload when job is active
  window.addEventListener("beforeunload", (e) => {
    if (isRunning) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}
