// AnEdiKit - Single ffmpeg job execution + cancellation.
import { runnerState } from "./state.js";
import { loadSettings } from "../storage.js";
import { animateCopyConfirm } from "../copy_anim.js";
import { TOOL_METADATA } from "../tool_metadata.js";
import { appendLog, clearLogs, setProcessingHeading, updateProgress, attachTauriListeners, setControlsDisabledState, forwardJobLog, forwardJobProgress, onJobFinished, setupExecutionStatusAutoScroll } from "./progress.js";

export function executeFfmpegJob(commandObj, totalDuration = 0.0) {
  if (runnerState.isRunning) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    runnerState.jobCompletionResolver = resolve;
    runnerState.jobStartTime = Date.now();
    runnerState.activeJobInfo = {
      destination: commandObj.destination || "",
      toolName: commandObj.executable === "yt-dlp" ? "Download" : "Conversion",
      suppressNotification: !!commandObj.suppressNotification,
    };
    // Capture kit (or other caller) event sinks so live logs/progress reach
    // dedicated UI panels instead of only the shared job console.
    runnerState.activeJobCallbacks =
      typeof commandObj.onLog === "function" || typeof commandObj.onProgress === "function"
        ? { onLog: commandObj.onLog, onProgress: commandObj.onProgress }
        : null;

  const statusPanel = document.getElementById("execution-status-panel");
  const statusMsg = document.getElementById("status-message");
  const btnExecute = document.getElementById("btn-execute");
  const currentItemWrapper = document.getElementById("current-item-wrapper");
  const currentHeading = document.getElementById("current-processing-heading");
  const statItemCount = document.getElementById("stat-item-count");
  const progressContainer = document.getElementById("exec-progress-container");

  const srcFile = commandObj.args ? commandObj.args[commandObj.args.indexOf("-i") + 1] : "";
  let displayName = srcFile ? srcFile.split(/[/\\]/).pop() : "";
  if (!displayName && commandObj.destination) {
    const destName = commandObj.destination.split(/[/\\]/).pop();
    // If destination is a directory (no file extension) and executable is yt-dlp, show a clean indicator
    if (commandObj.executable === "yt-dlp") {
      displayName = "media stream / download";
    } else {
      displayName = destName || "media file";
    }
  }
  if (!displayName) displayName = "media file";
  setProcessingHeading(`Processing: ${displayName}`);
  if (statItemCount) statItemCount.classList.add("d-none");
  if (progressContainer) progressContainer.classList.remove("d-none");

  if (statusPanel) {
    statusPanel.classList.remove("d-none", "ui-zoom-in");
    void statusPanel.offsetWidth;
    statusPanel.classList.add("ui-zoom-in");
    setupExecutionStatusAutoScroll();
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

  runnerState.isRunning = true;
  setControlsDisabledState(true);

  if (statusMsg) statusMsg.textContent = "Processing task...";
  if (btnExecute) {
    btnExecute.disabled = false;
    btnExecute.textContent = "Cancel";
    btnExecute.className = "btn btn-danger btn-sm px-4";
    btnExecute.classList.remove("btn-shimmer");
    btnExecute.title = "Cancel active task";
  }

  // Auto-scroll to execution status when it becomes visible
  const workspace = document.getElementById("tool-workspace");
  const logConsole = document.getElementById("log-console");
  if (statusPanel && workspace) {
    setTimeout(() => {
      try {
        statusPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        if (logConsole) logConsole.scrollTop = logConsole.scrollHeight;
      } catch (_) {
        workspace.scrollTo({ top: workspace.scrollHeight, behavior: "smooth" });
      }
    }, 120);
  } else if (workspace) {
    setTimeout(() => {
      workspace.scrollTo({ top: workspace.scrollHeight, behavior: "smooth" });
    }, 60);
  }
  if (logConsole && !statusPanel) {
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
    if (!runnerState.isRunning) {
      clearInterval(simInterval);
      return;
    }
    simPct += 15;
    const curSec = Math.round((simPct / 100) * (totalDuration || 120));
    const m = Math.floor(curSec / 60);
    const s = curSec % 60;
    const timeStr = `00:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;

    const simPayload = {
      time: timeStr,
      fps: "60",
      speed: "2.4x",
      bitrate: "3200 kbits/s",
      pct: simPct,
      current_item_title: displayName,
    };
    const simLine = `frame= ${simPct * 12} fps=60 q=-1.0 size= ${simPct * 80}kB time=${timeStr} bitrate=3200kbits/s speed=2.4x`;

    updateProgress(simPayload);
    forwardJobProgress(simPayload);
    appendLog(simLine);
    forwardJobLog(simLine);

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
  if (!runnerState.isRunning && !runnerState.isBatchRunning) return;

  runnerState.batchCancelRequested = true;
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
