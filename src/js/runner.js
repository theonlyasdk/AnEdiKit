// Task Execution Runner Module
let isRunning = false;
let currentProgressUnlisten = null;
let currentLogUnlisten = null;
let currentFinishedUnlisten = null;

export function isJobRunning() {
  return isRunning;
}

export function setControlsDisabledState(disabled) {
  const elements = document.querySelectorAll(
    "#tool-workspace input, #tool-workspace select, #tool-workspace button:not(#btn-execute), #tool-nav button, #ytdlp-nav button, #settings-nav button, #mobile-settings-nav button, #btn-reset, #btn-sidebar-toggle",
  );
  elements.forEach((el) => {
    if (el.id !== "btn-execute") {
      el.disabled = disabled;
    }
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
  const { time, fps, speed, bitrate, pct } = data;
  const bar = document.getElementById("job-progress-bar");
  const pctEl = document.getElementById("progress-pct");
  const statTime = document.getElementById("stat-time");
  const statFps = document.getElementById("stat-fps");
  const statSpeed = document.getElementById("stat-speed");
  const statBitrate = document.getElementById("stat-bitrate");

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

export async function executeFfmpegJob(commandObj, totalDuration = 0.0) {
  if (isRunning) {
    return;
  }

  const statusPanel = document.getElementById("execution-status-panel");
  const statusMsg = document.getElementById("status-message");
  const btnExecute = document.getElementById("btn-execute");

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
  if (window.__TAURI__?.core?.invoke && window.__TAURI__?.event?.listen) {
    try {
      const { listen } = window.__TAURI__.event;

      currentProgressUnlisten = await listen("ffmpeg-progress", (event) => {
        updateProgress(event.payload);
      });

      currentLogUnlisten = await listen("ffmpeg-log", (event) => {
        if (event.payload?.line) {
          appendLog(event.payload.line);
        }
      });

      currentFinishedUnlisten = await listen("ffmpeg-finished", (event) => {
        const { success, message, exit_code } = event.payload;
        onJobFinished(success, message);
      });

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

      return;
    } catch (err) {
      appendLog(`Execution error: ${err}`, true);
      onJobFinished(false, `Error: ${err}`);
      return;
    }
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
  if (!isRunning) return;

  if (window.__TAURI__?.core?.invoke) {
    try {
      await window.__TAURI__.core.invoke("cancel_ffmpeg");
    } catch (err) {
      console.warn("Cancel invoke error:", err);
    }
  }

  onJobFinished(false, "Job cancelled by user");
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
  }
}
