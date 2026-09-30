// AnEdiKit - Batch queue execution + job-finish handling.
import { runnerState } from "./state.js";
import { loadSettings } from "../storage.js";
import { updateBatchItemStatus, getBatchQueue } from "../media.js";
import { updateActiveImageAiProgress } from "../image_queue.js";
import { appendLog, clearLogs, setProcessingHeading, updateProgress, setControlsDisabledState, setupExecutionStatusAutoScroll } from "./progress.js";
import { TOOL_METADATA } from "../tool_metadata.js";
import { executeFfmpegJob } from "./job.js";
import { showBatchFinishedNotification } from "./notify.js";

export async function executeBatchQueue(queue, toolId, settings, buildCommandFn) {
  if (runnerState.isBatchRunning || runnerState.isRunning) return;
  if (!queue || queue.length === 0) return;

  runnerState.isBatchRunning = true;
  runnerState.batchCancelRequested = false;
  setControlsDisabledState(true);

  const statusPanel = document.getElementById("execution-status-panel");
  const statusMsg = document.getElementById("status-message");
  const btnExecute = document.getElementById("btn-execute");
  const currentItemWrapper = document.getElementById("current-item-wrapper");
  const currentHeading = document.getElementById("current-processing-heading");
  const statItemCount = document.getElementById("stat-item-count");
  const progressContainer = document.getElementById("exec-progress-container");

  if (progressContainer) progressContainer.classList.remove("d-none");
  if (statusPanel) {
    statusPanel.classList.remove("d-none", "ui-zoom-in");
    void statusPanel.offsetWidth;
    statusPanel.classList.add("ui-zoom-in");
    setupExecutionStatusAutoScroll();
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

  const batchStartTime = Date.now();
  let successCount = 0;
  let failCount = 0;
  let lastDestination = "";

  for (let i = 0; i < queue.length; i++) {
    if (runnerState.batchCancelRequested) {
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

    setProcessingHeading(`Processing: ${item.name}`);
    if (statItemCount) {
      statItemCount.textContent = `${i + 1} of ${queue.length}`;
      statItemCount.classList.remove("d-none");
    }
    if (progressContainer) progressContainer.classList.remove("d-none");

    const commandObj = buildCommandFn(toolId, item.path, settings.outputDir, settings);
    appendLog(`[Item ${i + 1}/${queue.length}: Processing ${item.name}]`);

    const result = await new Promise((resolve) => {
      runnerState.jobStartTime = Date.now();
      runnerState.activeJobInfo = {
        destination: commandObj.destination || "",
        toolName: commandObj.executable === "yt-dlp" ? "Download" : "Conversion",
      };
      runnerState.isRunning = true;

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
                  if (fp && fp !== "NA" && runnerState.activeJobInfo) {
                    runnerState.activeJobInfo.destination = fp;
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
              runnerState.isRunning = false;
              resolve(ev.payload.success);
            });

            if (commandObj.executable === "yt-dlp") {
              await window.__TAURI__.core.invoke("execute_ytdlp", { args: commandObj.args });
            } else {
              await window.__TAURI__.core.invoke("execute_ffmpeg", { args: commandObj.args, totalDuration: commandObj.duration || 0.0 });
            }
          } catch (e) {
            appendLog(`Item error: ${e}`, true);
            runnerState.isRunning = false;
            resolve(false);
          }
        })();
      } else {
        setTimeout(() => {
          runnerState.isRunning = false;
          resolve(true);
        }, 1200);
      }
    });

    if (result) {
      item.status = "done";
      updateBatchItemStatus(i, "done");
      appendLog(`[Item ${i + 1}/${queue.length}: Done ${item.name}]`);
      successCount++;
      lastDestination = commandObj.destination || lastDestination;
    } else {
      item.status = "error";
      updateBatchItemStatus(i, "error");
      appendLog(`[Item ${i + 1}/${queue.length}: Failed ${item.name}]`, true);
      failCount++;
    }
  }

  runnerState.isBatchRunning = false;
  runnerState.isRunning = false;
  setControlsDisabledState(false);

  if (progressContainer) {
    progressContainer.classList.add("d-none");
  }

  if (!runnerState.batchCancelRequested) {
    const bar = document.getElementById("job-progress-bar");
    const pctEl = document.getElementById("progress-pct");
    const statEta = document.getElementById("stat-eta");
    const statTime = document.getElementById("stat-time");
    if (bar && pctEl) {
      bar.classList.remove("progress-bar-striped", "progress-bar-animated", "progress-bar-material-indeterminate", "bg-danger");
      bar.classList.add("bg-success");
      bar.style.width = "100%";
      pctEl.textContent = "100%";
      if (statEta) statEta.textContent = "ETA: 00:00:00";
      if (statTime) statTime.textContent = "Time: Completed";
    }

    if (successCount > 0) {
      const batchElapsedSeconds = batchStartTime > 0 ? ((Date.now() - batchStartTime) / 1000).toFixed(1) : "0.0";
      showBatchFinishedNotification({
        destination: lastDestination || settings.outputDir,
        toolName: TOOL_METADATA[toolId]?.title || "Batch Processing",
        total: queue.length,
        successCount,
        failCount,
        elapsedSeconds: batchElapsedSeconds,
      });
    }
  }

  if (btnExecute) {
    btnExecute.textContent = `Execute Batch (${queue.length} items)`;
    btnExecute.classList.remove("btn-danger", "btn-shimmer");
    btnExecute.classList.add("btn-primary");
  }
  if (statusMsg) statusMsg.textContent = runnerState.batchCancelRequested ? "Batch cancelled" : "Batch completed successfully";
  appendLog(runnerState.batchCancelRequested ? "[Batch queue stopped]" : "[Batch queue completed successfully]");
}


export { onJobFinished } from "./progress.js";

