// AnEdiKit - Job progress, log console, and Tauri event forwarding.
import { runnerState } from "./state.js";
import { classifyLogLine, logKindToCssClass } from "../log_classify.js";
import { showFinishedNotification } from "./notify.js";
import { updateActiveImageAiProgress } from "../image_queue.js";


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

  // Disable all sidebar items while a task is running — every nav link/button
  // in the sidebar becomes non-interactive and visually muted.
  const allSidebarItems = document.querySelectorAll(
    "#main-sidebar button, #main-sidebar .nav-link, #sidebar-scroll-container button, #sidebar-scroll-container .nav-link, #all-tools-nav button",
  );
  allSidebarItems.forEach((btn) => {
    btn.disabled = disabled;
    btn.classList.toggle("opacity-50", disabled);
    btn.style.pointerEvents = disabled ? "none" : "";
    btn.style.cursor = disabled ? "not-allowed" : "";
  });
}


export function appendLog(text, isError = false) {
  const logConsole = document.getElementById("log-console");
  if (!logConsole || !text) return;

  const lineEl = document.createElement("div");
  lineEl.className = logKindToCssClass(classifyLogLine(text, isError));

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


export function setProcessingHeading(text) {
  const currentHeading = document.getElementById("current-processing-heading");
  const currentItemWrapper = document.getElementById("current-item-wrapper");
  if (!currentHeading) return;

  currentHeading.textContent = text;
  if (currentItemWrapper) {
    currentItemWrapper.classList.remove("d-none");
    currentHeading.classList.remove("is-marquee");
    currentItemWrapper.classList.remove("has-marquee-fade");
    currentHeading.style.removeProperty("--marquee-overflow-dist");
    currentHeading.style.removeProperty("--marquee-duration");

    const containerWidth = currentItemWrapper.clientWidth;
    const textWidth = currentHeading.scrollWidth;

    if (containerWidth > 0 && textWidth > containerWidth - 32) {
      const overflowDist = textWidth - (containerWidth - 32) + 16;
      const duration = Math.max(6, Math.round(overflowDist / 30)) + "s";
      currentHeading.style.setProperty("--marquee-overflow-dist", `-${overflowDist}px`);
      currentHeading.style.setProperty("--marquee-duration", duration);
      currentHeading.classList.add("is-marquee");
      currentItemWrapper.classList.add("has-marquee-fade");
    }
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
  const currentHeading = document.getElementById("current-processing-heading");
  const statItemCount = document.getElementById("stat-item-count");
  const progressContainer = document.getElementById("exec-progress-container");

  if (progressContainer) {
    progressContainer.classList.remove("d-none");
  }

  const displayName = current_item_title || (data.fileName ? data.fileName : "");
  if (displayName) {
    setProcessingHeading(`Processing: ${displayName}`);
  } else if (!currentHeading?.textContent || currentHeading.textContent === "Processing: ...") {
    setProcessingHeading("Processing...");
  }

  // Item count readout in status strip (e.g. 1 of 5)
  if (statItemCount) {
    if (playlist_total && playlist_total > 1) {
      const itemNum = playlist_item || 1;
      statItemCount.textContent = `${itemNum} of ${playlist_total}`;
      statItemCount.classList.remove("d-none");
    } else {
      statItemCount.classList.add("d-none");
    }
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
  if (statusMsg) {
    const parts = [];
    if (playlist_total && playlist_total > 1) {
      parts.push(`${playlist_item || 1} of ${playlist_total}`);
    }
    if (time) parts.push(time);
    if (eta && eta !== "--:--" && eta !== "--:--:--") {
      parts.push(eta.startsWith("ETA:") ? eta : `ETA: ${eta}`);
    } else if (pct >= 100) {
      parts.push("ETA: 00:00:00");
    }
    if (speed && speed !== "0x" && speed !== "0") {
      parts.push(speed.startsWith("Speed:") ? speed : `Speed: ${speed}`);
    }
    if (parts.length > 0) {
      statusMsg.textContent = parts.join(" • ");
      statusMsg.classList.remove("d-none");
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

export function forwardJobLog(line) {
  try {
    if (line != null) runnerState.activeJobCallbacks?.onLog?.(String(line));
  } catch (err) {
    console.warn("Job onLog callback error:", err);
  }
}


export function forwardJobProgress(payload) {
  try {
    if (payload) runnerState.activeJobCallbacks?.onProgress?.(payload);
  } catch (err) {
    console.warn("Job onProgress callback error:", err);
  }
}


export async function attachTauriListeners() {
  setupExecutionStatusAutoScroll();
  if (!window.__TAURI__?.event?.listen) return;
  const { listen } = window.__TAURI__.event;

  if (!runnerState.currentProgressUnlisten) {
    runnerState.currentProgressUnlisten = await listen("ffmpeg-progress", (event) => {
      updateProgress(event.payload);
      forwardJobProgress(event.payload);
    });
  }

  if (!runnerState.currentLogUnlisten) {
    runnerState.currentLogUnlisten = await listen("ffmpeg-log", (event) => {
      if (event.payload?.line) {
        forwardJobLog(event.payload.line);
        // yt-dlp reports the real output file as "filepath:<abs path>"
        // (backend adds --print after_move:filepath:...). Point the finished
        // toast at the file instead of the output folder so "Open file" works.
        if (event.payload.line.startsWith("filepath:")) {
          const fp = event.payload.line.slice(9).trim();
          if (fp && fp !== "NA") {
            if (runnerState.activeJobInfo) {
              runnerState.activeJobInfo.destination = fp;
            }
            const fname = fp.split(/[/\\]/).pop();
            if (fname) {
              setProcessingHeading(`Processing: ${fname}`);
            }
          }
          appendLog(`[Saved: ${fp}]`);
          return;
        }
        appendLog(event.payload.line);
      }
    });
  }

  if (!runnerState.currentFinishedUnlisten) {
    runnerState.currentFinishedUnlisten = await listen("ffmpeg-finished", (event) => {
      const { success, message } = event.payload;
      onJobFinished(success, message);
    });
  }
}

export function onJobFinished(success, message) {
  runnerState.isRunning = false;
  setControlsDisabledState(false);
  runnerState.activeJobCallbacks = null;

  const progressContainer = document.getElementById("exec-progress-container");
  if (progressContainer) progressContainer.classList.add("d-none");

  const bar = document.getElementById("job-progress-bar");
  const pctEl = document.getElementById("progress-pct");
  const statEta = document.getElementById("stat-eta");
  const statTime = document.getElementById("stat-time");

  if (bar && pctEl) {
    bar.classList.remove("progress-bar-striped", "progress-bar-animated", "progress-bar-material-indeterminate");
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

  if (runnerState.currentProgressUnlisten) {
    runnerState.currentProgressUnlisten();
    runnerState.currentProgressUnlisten = null;
  }
  if (runnerState.currentLogUnlisten) {
    runnerState.currentLogUnlisten();
    runnerState.currentLogUnlisten = null;
  }
  if (runnerState.currentFinishedUnlisten) {
    runnerState.currentFinishedUnlisten();
    runnerState.currentFinishedUnlisten = null;
  }

  const statusMsg = document.getElementById("status-message");
  const btnExecute = document.getElementById("btn-execute");

  if (statusMsg) statusMsg.textContent = message;
  if (btnExecute) {
    btnExecute.textContent = "Execute";
    btnExecute.classList.remove("btn-danger", "btn-shimmer");
    btnExecute.classList.add("btn-primary");
  }
  window.dispatchEvent(new CustomEvent("anedikit:job_finished"));

  if (runnerState.jobCompletionResolver) {
    const resolver = runnerState.jobCompletionResolver;
    runnerState.jobCompletionResolver = null;
    resolver(success);
  }

  appendLog(`[${message}]`, !success);
  if (success) {
    const elapsedSeconds = runnerState.jobStartTime > 0 ? ((Date.now() - runnerState.jobStartTime) / 1000).toFixed(1) : "0.0";
    if (runnerState.activeJobInfo && runnerState.activeJobInfo.destination && !runnerState.activeJobInfo.suppressNotification && !runnerState.isBatchRunning) {
      showFinishedNotification(runnerState.activeJobInfo.destination, runnerState.activeJobInfo.toolName, elapsedSeconds);
    }
  }
}

export function setupExecutionStatusAutoScroll() {
  const panel = document.getElementById("execution-status-panel");
  const workspace = document.getElementById("tool-workspace");
  if (!panel || !workspace || panel.dataset.autoScrollBound) return;
  panel.dataset.autoScrollBound = "1";
  const scrollToPanel = () => {
    if (panel.classList.contains("d-none")) return;
    try {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (_) {
      workspace.scrollTo({ top: workspace.scrollHeight, behavior: "smooth" });
    }
  };
  const obs = new MutationObserver(scrollToPanel);
  obs.observe(panel, { attributes: true, attributeFilter: ["class"] });
  // also handle initial visible state (e.g., after reload with active job)
  if (!panel.classList.contains("d-none")) setTimeout(scrollToPanel, 80);
}

