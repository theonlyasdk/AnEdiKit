// Task Execution Runner Module
import { updateBatchItemStatus, updateActiveImageAiProgress } from "./media.js";
import { loadSettings } from "./storage.js";

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

  // Disable and grey out all sidebar tool buttons except Settings
  const allToolButtons = document.querySelectorAll("#tool-nav button, #ytdlp-nav button");
  allToolButtons.forEach((btn) => {
    btn.disabled = disabled;
    btn.classList.toggle("opacity-50", disabled);
    btn.style.pointerEvents = disabled ? "none" : "";
    btn.style.cursor = disabled ? "not-allowed" : "";
  });

  // Settings button remains enabled and clickable at all times
  const settingsButtons = document.querySelectorAll('button[data-tool="settings"], #settings-nav button');
  settingsButtons.forEach((btn) => {
    btn.disabled = false;
    btn.classList.remove("opacity-50");
    btn.style.pointerEvents = "";
    btn.style.cursor = "";
  });
}

export function appendLog(text, isError = false) {
  const logConsole = document.getElementById("log-console");
  if (!logConsole || !text) return;

  const lineEl = document.createElement("div");
  const lower = text.toLowerCase();
  // WARNING lines (e.g. yt-dlp PO-token notices mentioning "Error 403") are
  // advisories, not failures -- check warning first so they stay yellow.
  const isWarn = lower.startsWith("warning") || lower.includes("warning:");
  const isErr = !isWarn && (isError || lower.includes("error") || lower.includes("failed"));
  const isSuccess = !isErr && !isWarn && (lower.includes("success") || lower.includes("100%"));

  if (isErr) {
    lineEl.className = "text-danger";
  } else if (isWarn) {
    lineEl.className = "text-warning";
  } else if (isSuccess) {
    lineEl.className = "text-success";
  } else {
    lineEl.className = "text-body-secondary";
  }

  lineEl.textContent = text;
  logConsole.appendChild(lineEl);

  if (logConsole.childElementCount > 500) {
    logConsole.removeChild(logConsole.firstElementChild);
  }

  logConsole.scrollTop = logConsole.scrollHeight;
}

export function clearLogs() {
  const logConsole = document.getElementById("log-console");
  if (logConsole) {
    logConsole.innerHTML = "";
  }
}

export function updateProgress(data) {
  const { time, eta, fps, speed, bitrate, pct, playlist_item, playlist_total, current_item_title } = data;
  const bar = document.getElementById("job-progress-bar");
  const pctEl = document.getElementById("progress-pct");
  const statTime = document.getElementById("stat-time");
  const statEta = document.getElementById("stat-eta");
  const statFps = document.getElementById("stat-fps");
  const statSpeed = document.getElementById("stat-speed");
  const statBitrate = document.getElementById("stat-bitrate");
  const statusMsg = document.getElementById("status-message");

  // Currently processing item and heading
  const currentItemWrapper = document.getElementById("current-item-wrapper");
  const currentHeading = document.getElementById("current-processing-heading");
  const currentItemName = document.getElementById("current-item-name");

  if (playlist_total && playlist_total > 1) {
    const itemNum = playlist_item || 1;
    if (currentItemWrapper) currentItemWrapper.classList.remove("d-none");
    if (currentHeading) currentHeading.textContent = `Currently processing: (${itemNum} of ${playlist_total})`;
  } else if (current_item_title) {
    if (currentItemWrapper) currentItemWrapper.classList.remove("d-none");
    if (currentHeading) currentHeading.textContent = `Currently processing: (1 of 1)`;
  } else if (isRunning) {
    if (currentItemWrapper) currentItemWrapper.classList.remove("d-none");
    if (currentHeading) currentHeading.textContent = `Currently processing: (1 of 1)`;
  }

  if (current_item_title && currentItemName) {
    currentItemName.textContent = current_item_title;
  }

  // Format message / time readout
  if (time && statTime) {
    if (
      time.startsWith("Time:") ||
      time.startsWith("Size:") ||
      time.startsWith("Downloading") ||
      time.startsWith("Connecting") ||
      time.startsWith("Loading") ||
      time.startsWith("Executing") ||
      time.startsWith("Completed")
    ) {
      statTime.textContent = time;
    } else {
      statTime.textContent = `Time: ${time}`;
    }
  }

  // Live status message at bottom bar
  if (statusMsg && time) {
    if (time.toLowerCase().includes("downloading") || time.toLowerCase().includes("model") || time.toLowerCase().includes("segmentation") || time.toLowerCase().includes("upscal")) {
      statusMsg.textContent = time;
    }
  }

  // ETA readout
  if (statEta) {
    if (eta && eta !== "--:--" && eta !== "--:--:--") {
      statEta.textContent = eta.startsWith("ETA:") || eta.startsWith("Remaining:") ? eta : `ETA: ${eta}`;
      statEta.classList.remove("d-none");
    } else if (pct >= 100) {
      statEta.textContent = "ETA: 00:00:00";
      statEta.classList.remove("d-none");
    } else {
      statEta.textContent = "ETA: --:--:--";
    }
  }

  // FPS readout (hidden if empty or not video processing)
  if (statFps) {
    if (fps && fps !== "0" && fps !== "0.0") {
      statFps.textContent = fps.startsWith("FPS:") ? fps : `FPS: ${fps}`;
      statFps.classList.remove("d-none");
    } else {
      statFps.classList.add("d-none");
    }
  }

  // Speed readout (shown for ffmpeg, yt-dlp, and python model downloads)
  if (statSpeed) {
    if (speed && speed !== "0x" && speed !== "0" && speed !== "0 MiB/s" && speed !== "0.00 MB/s") {
      statSpeed.textContent = speed.startsWith("Speed:") ? speed : `Speed: ${speed}`;
      statSpeed.classList.remove("d-none");
    } else {
      statSpeed.classList.add("d-none");
    }
  }

  // Bitrate / Size readout
  if (statBitrate) {
    const isDownloadProgress = time && (time.startsWith("Downloading") || time.startsWith("Size:"));
    if (bitrate && bitrate !== "0 kbits/s" && bitrate !== "0" && !isDownloadProgress) {
      const isSize = bitrate.toLowerCase().includes("mb") || bitrate.toLowerCase().includes("kb") || bitrate.toLowerCase().includes("gb");
      const prefix = isSize ? "Size: " : "Bitrate: ";
      statBitrate.textContent = bitrate.startsWith("Bitrate:") || bitrate.startsWith("Size:") ? bitrate : `${prefix}${bitrate}`;
      statBitrate.classList.remove("d-none");
    } else {
      statBitrate.classList.add("d-none");
    }
  }

  // Progress percentage and bar width
  const numPct = typeof pct === "number" ? pct : parseInt(pct, 10) || 0;
  const clamped = Math.min(100, Math.max(0, numPct));

  if (bar && pctEl) {
    pctEl.textContent = `${clamped}%`;
    if (clamped === 0) {
      bar.classList.remove("bg-success", "bg-danger", "progress-bar-striped", "progress-bar-animated");
      bar.classList.add("progress-bar-material-indeterminate");
      bar.style.width = "100%";
    } else if (clamped >= 100) {
      bar.classList.remove("progress-bar-striped", "progress-bar-animated", "progress-bar-material-indeterminate", "bg-danger");
      bar.classList.add("bg-success");
      bar.style.width = "100%";
    } else {
      bar.classList.remove("progress-bar-striped", "progress-bar-animated", "progress-bar-material-indeterminate", "bg-success", "bg-danger");
      bar.style.width = `${clamped}%`;
    }
  }

  // Update active item badge in Image AI queue if present
  if (typeof updateActiveImageAiProgress === "function") {
    updateActiveImageAiProgress(time, clamped);
  }
}

let activeJobInfo = null;
let jobStartTime = 0;
let jobCompletionResolver = null;

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
        // yt-dlp reports the real output file as "filepath:<abs path>"
        // (backend adds --print after_move:filepath:...). Point the finished
        // toast at the file instead of the output folder so "Open file" works.
        if (event.payload.line.startsWith("filepath:")) {
          const fp = event.payload.line.slice(9).trim();
          if (fp && fp !== "NA" && activeJobInfo) {
            activeJobInfo.destination = fp;
          }
          appendLog(`[Saved: ${fp}]`);
          return;
        }
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
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    jobCompletionResolver = resolve;
    jobStartTime = Date.now();
    activeJobInfo = {
      destination: commandObj.destination || "",
      toolName: commandObj.executable === "yt-dlp" ? "Download" : "Conversion",
    };

  const statusPanel = document.getElementById("execution-status-panel");
  const statusMsg = document.getElementById("status-message");
  const btnExecute = document.getElementById("btn-execute");
  const currentItemWrapper = document.getElementById("current-item-wrapper");
  const currentHeading = document.getElementById("current-processing-heading");
  const currentItemName = document.getElementById("current-item-name");

  if (currentItemWrapper) currentItemWrapper.classList.remove("d-none");
  if (currentHeading) currentHeading.textContent = "Currently processing: (1 of 1)";
  const srcFile = commandObj.args ? commandObj.args[commandObj.args.indexOf("-i") + 1] : "";
  const displayName = srcFile ? srcFile.split(/[/\\]/).pop() : (commandObj.destination ? commandObj.destination.split(/[/\\]/).pop() : "Processing media file...");
  if (currentItemName) currentItemName.textContent = displayName;

  if (statusPanel) {
    statusPanel.classList.remove("d-none", "ui-zoom-in");
    void statusPanel.offsetWidth;
    statusPanel.classList.add("ui-zoom-in");
  }

  clearLogs();
  appendLog(`[Starting job: ${commandObj.fullString}]`);
  
  const bar = document.getElementById("job-progress-bar");
  if (bar) {
    bar.classList.remove("bg-success", "bg-danger", "progress-bar-striped", "progress-bar-animated");
    bar.classList.add("progress-bar-material-indeterminate");
    bar.style.width = "100%";
  }

  updateProgress({
    time: "00:00:00",
    eta: "--:--:--",
    fps: "0",
    speed: "0x",
    bitrate: "0 kbits/s",
    pct: 0,
    current_item_title: displayName,
  });

  isRunning = true;
  setControlsDisabledState(true);

  if (statusMsg) statusMsg.textContent = "Processing task...";
  if (btnExecute) {
    btnExecute.disabled = false;
    btnExecute.textContent = "Cancel";
    btnExecute.className = "btn btn-danger btn-sm px-4";
    btnExecute.title = "Cancel active task";
  }

  // Smoothly scroll workspace to bottom to view logs and status
  const workspace = document.getElementById("tool-workspace");
  if (workspace) {
    setTimeout(() => {
      workspace.scrollTo({ top: workspace.scrollHeight, behavior: "smooth" });
    }, 60);
  }
  const logConsole = document.getElementById("log-console");
  if (logConsole) {
    logConsole.scrollTop = logConsole.scrollHeight;
  }

  // Tauri IPC execution
  if (window.__TAURI__?.core?.invoke) {
    (async () => {
      try {
        await attachTauriListeners();

        if (commandObj.executable === "image_ai" || commandObj.executable === "python") {
          await window.__TAURI__.core.invoke("execute_image_ai", {
            task: commandObj.task,
            params: typeof commandObj.params === "string" ? commandObj.params : JSON.stringify(commandObj.params || {}),
          });
        } else if (commandObj.executable === "yt-dlp") {
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
      current_item_title: displayName,
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
  });
}

export function cancelFfmpegJob() {
  if (!isRunning && !isBatchRunning) return;

  batchCancelRequested = true;
  appendLog("[Cancelling operation...]");

  if (window.__TAURI__?.core?.invoke) {
    window.__TAURI__.core.invoke("cancel_ffmpeg").catch((err) => {
      console.warn("Cancel ffmpeg error:", err);
    });
    window.__TAURI__.core.invoke("cancel_job").catch((err) => {
      console.warn("Cancel job error:", err);
    });
  }

  onJobFinished(false, "Job cancelled by user");
}

export async function executeBatchQueue(queue, toolId, settings, buildCommandFn) {
  if (isBatchRunning || isRunning) return;
  if (!queue || queue.length === 0) return;

  isBatchRunning = true;
  batchCancelRequested = false;
  setControlsDisabledState(true);

  const statusPanel = document.getElementById("execution-status-panel");
  const statusMsg = document.getElementById("status-message");
  const btnExecute = document.getElementById("btn-execute");
  const currentItemWrapper = document.getElementById("current-item-wrapper");
  const currentHeading = document.getElementById("current-processing-heading");
  const currentItemName = document.getElementById("current-item-name");

  if (statusPanel) {
    statusPanel.classList.remove("d-none", "ui-zoom-in");
    void statusPanel.offsetWidth;
    statusPanel.classList.add("ui-zoom-in");
  }

  if (currentItemWrapper) currentItemWrapper.classList.remove("d-none");

  if (btnExecute) {
    btnExecute.disabled = false;
    btnExecute.textContent = "Cancel Batch";
    btnExecute.className = "btn btn-danger btn-sm px-4";
    btnExecute.title = "Cancel active batch operation";
  }

  const workspace = document.getElementById("tool-workspace");
  if (workspace) {
    setTimeout(() => {
      workspace.scrollTo({ top: workspace.scrollHeight, behavior: "smooth" });
    }, 60);
  }

  clearLogs();
  appendLog(`[Starting Batch Queue: ${queue.length} items]`);

  for (let i = 0; i < queue.length; i++) {
    if (batchCancelRequested) {
      appendLog(`[Batch queue stopped by user at item ${i + 1}]`, true);
      break;
    }

    const item = queue[i];

    // Check if source file exists before executing
    if (window.__TAURI__?.core?.invoke && item.path) {
      try {
        const exists = await window.__TAURI__.core.invoke("check_file_exists", { filePath: item.path });
        if (!exists) {
          item.status = "skipped";
          updateBatchItemStatus(i, "skipped");
          appendLog(`[Item ${i + 1}/${queue.length}: Skipped non-existent file: ${item.name} (${item.path})]`, true);
          continue;
        }
      } catch (e) {
        console.warn("Failed to check file existence:", e);
      }
    }

    item.status = "processing";
    updateBatchItemStatus(i, "processing");

    if (currentHeading) currentHeading.textContent = `Currently processing: (${i + 1} of ${queue.length})`;
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
              if (ev.payload?.line) {
                if (ev.payload.line.startsWith("filepath:")) {
                  const fp = ev.payload.line.slice(9).trim();
                  if (fp && fp !== "NA" && activeJobInfo) {
                    activeJobInfo.destination = fp;
                  }
                  appendLog(`[Saved: ${fp}]`);
                  return;
                }
                appendLog(ev.payload.line);
              }
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

  if (!batchCancelRequested) {
    const bar = document.getElementById("job-progress-bar");
    const pctEl = document.getElementById("progress-pct");
    const statEta = document.getElementById("stat-eta");
    const statTime = document.getElementById("stat-time");
    if (bar && pctEl) {
      bar.classList.remove("progress-bar-striped", "progress-bar-animated", "bg-danger");
      bar.classList.add("bg-success");
      bar.style.width = "100%";
      pctEl.textContent = "100%";
      if (statEta) statEta.textContent = "ETA: 00:00:00";
      if (statTime) statTime.textContent = "Time: Completed";
    }
  }

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

  const bar = document.getElementById("job-progress-bar");
  const pctEl = document.getElementById("progress-pct");
  const statEta = document.getElementById("stat-eta");
  const statTime = document.getElementById("stat-time");

  if (bar && pctEl) {
    bar.classList.remove("progress-bar-striped", "progress-bar-animated");
    if (success) {
      bar.classList.remove("bg-danger");
      bar.classList.add("bg-success");
      bar.style.width = "100%";
      pctEl.textContent = "100%";
      if (statEta) statEta.textContent = "ETA: 00:00:00";
      if (statTime) statTime.textContent = "Time: Completed";
    } else {
      bar.classList.remove("bg-success");
      bar.classList.add("bg-danger");
    }
  }

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
  window.dispatchEvent(new CustomEvent("anedikit:job_finished"));

  if (jobCompletionResolver) {
    const resolver = jobCompletionResolver;
    jobCompletionResolver = null;
    resolver(success);
  }

  appendLog(`[${message}]`, !success);
  if (success) {
    const elapsedSeconds = jobStartTime > 0 ? ((Date.now() - jobStartTime) / 1000).toFixed(1) : "0.0";
    if (activeJobInfo && activeJobInfo.destination) {
      showFinishedNotification(activeJobInfo.destination, activeJobInfo.toolName, elapsedSeconds);
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

  // Bind Log Copy button
  initLogCopyButton();

  // Prevent accidental reload/unload when job is active
  window.addEventListener("beforeunload", (e) => {
    if (isRunning) {
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
      btnCopy.innerHTML = `<ion-icon name="checkmark-outline"></ion-icon>`;
      btnCopy.setAttribute("title", "Copied to clipboard!");

      setTimeout(() => {
        btnCopy.classList.remove("copied");
        btnCopy.innerHTML = `<ion-icon name="copy-outline"></ion-icon>`;
        btnCopy.setAttribute("title", originalTitle);
      }, 1800);
    } catch (err) {
      console.warn("Failed to copy execution logs to clipboard:", err);
    }
  };
}

