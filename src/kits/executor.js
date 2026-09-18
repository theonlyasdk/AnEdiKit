// AnEdiKit - User Kits Execution Engine
import { getActiveKit, getKitRuntimeValues } from "./state.js";
import { loadSettings, saveKitParams } from "./storage.js";
import { showCustomKitAlert, showCustomKitPrompt } from "./modals.js";
import { executeFfmpegJob, cancelFfmpegJob, isJobRunning } from "../js/runner.js";
import { selectAndOpenKit } from "./workspace.js";

// Evaluate script with current runtime values to generate live command arguments
export async function evaluateKitCommand(kit, values, interactive = false) {
  if (!kit || !kit.script) return [];

  const appSettings = loadSettings();

  const customAlert = (msg, title) => (interactive ? showCustomKitAlert(msg, title || "Kit Alert") : Promise.resolve());
  const customPrompt = (msg, def, title) => (interactive ? showCustomKitPrompt(msg, def || "", title || "Kit Prompt") : Promise.resolve(def || ""));

  const helpers = {
    getDefaultOutputDir: () => appSettings.outputDir || "C:\\Users\\User\\Videos",
    getSettings: () => ({ ...appSettings }),
    joinPath: (dir, file) => {
      if (!dir) return file || "";
      const cleanDir = dir.replace(/[/\\]+$/, "");
      const cleanFile = (file || "").replace(/^[/\\]+/, "");
      return `${cleanDir}\\${cleanFile}`;
    },
    splitArgs: (str) => {
      if (!str || typeof str !== "string") return [];
      const matches = str.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
      return matches ? matches.map((m) => m.replace(/^['"]|['"]$/g, "")) : [];
    },
    alert: customAlert,
    prompt: customPrompt,
  };

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(
      "ctx",
      "alert",
      "prompt",
      `
      const window = { alert, prompt };
      ${kit.script}
      if (typeof buildCommand === 'function') {
        return await buildCommand(ctx);
      }
      return [];
      `
    );
    const result = await fn(
      { values: { ...values }, helpers, alert: customAlert, prompt: customPrompt },
      customAlert,
      customPrompt
    );
    return Array.isArray(result) ? result : [];
  } catch (err) {
    return [`# Script Error: ${err.message}`];
  }
}

export async function updateKitLivePreview() {
  const activeKit = getActiveKit();
  const kitRuntimeValues = getKitRuntimeValues();
  const container = document.getElementById("kit-tab-content");
  if (!container || !activeKit) return;

  const pre = container.querySelector("#kit-cmd-preview");
  if (!pre) return;

  const args = await evaluateKitCommand(activeKit, kitRuntimeValues, false);
  if (args.length === 0) {
    pre.textContent = "ffmpeg [waiting for input media selection...]";
  } else if (args[0] && args[0].startsWith("# Script Error:")) {
    pre.textContent = args[0];
    pre.classList.add("text-danger");
  } else {
    pre.classList.remove("text-danger");
    const engine = activeKit.engine || "ffmpeg";
    pre.textContent = `${engine} ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`;
  }
}

// Global Execute Active Kit handler for bottom control bar
export async function executeActiveKit() {
  const activeKit = getActiveKit();
  const kitRuntimeValues = getKitRuntimeValues();
  if (!activeKit) return;

  const container = document.getElementById("kit-tab-content");
  const statusPanel = container?.querySelector("#kit-execution-status-panel");
  const logBox = container?.querySelector("#kit-log-console");
  const progBar = container?.querySelector("#kit-job-progress-bar");
  const pctLabel = container?.querySelector("#kit-progress-pct");
  const statTime = container?.querySelector("#kit-stat-time");
  const statFps = container?.querySelector("#kit-stat-fps");
  const statSpeed = container?.querySelector("#kit-stat-speed");
  const statBitrate = container?.querySelector("#kit-stat-bitrate");
  const statusMsg = document.getElementById("status-message");

  if (isJobRunning()) {
    cancelFfmpegJob();
    return;
  }

  // Validate required fields
  const missingRequired = (activeKit.blocks || []).filter((b) => {
    if (!b.required) return false;
    if (b.type === "alert_box") return false;
    const val = kitRuntimeValues[b.id];
    if (val === undefined || val === null || val === "") return true;
    if (typeof val === "string" && val.trim() === "") return true;
    return false;
  });

  if (missingRequired.length > 0) {
    const names = missingRequired.map((b) => b.label || b.id).join(", ");
    await showCustomKitAlert(`Please provide required input for: ${names}`, "Missing Required Field");
    return;
  }

  const args = await evaluateKitCommand(activeKit, kitRuntimeValues, true);
  if (!args || args.length === 0) {
    await showCustomKitAlert("The kit script produced no command arguments. Please select an input file or verify buildCommand() in the Script Editor.", "No Command Generated");
    return;
  }
  if (args[0] && args[0].startsWith("# Script Error:")) {
    await showCustomKitAlert(args[0], "Script Error");
    return;
  }

  if (statusPanel) statusPanel.classList.remove("d-none");
  if (progBar) progBar.style.width = "0%";
  if (pctLabel) pctLabel.textContent = "0%";
  if (statTime) statTime.textContent = "Time: 00:00:00";
  if (statFps) statFps.textContent = "FPS: 0";
  if (statSpeed) statSpeed.textContent = "Speed: 0x";
  if (statBitrate) statBitrate.textContent = "Bitrate: 0 kbits/s";
  if (logBox) logBox.innerHTML = '<div class="text-info">Starting Kit Execution...</div>';
  if (statusMsg) statusMsg.textContent = `Running ${activeKit.name}...`;

  try {
    const engine = activeKit.engine || "ffmpeg";
    const jobPromise = executeFfmpegJob({
      executable: engine,
      args,
      destination: "",
      fullString: `${engine} ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
      totalDuration: 0,
      onLog: (line) => {
        if (!logBox) return;
        const d = document.createElement("div");
        d.textContent = line;
        logBox.appendChild(d);
        logBox.scrollTop = logBox.scrollHeight;
      },
      onProgress: (p) => {
        if (progBar) progBar.style.width = `${p.pct}%`;
        if (pctLabel) pctLabel.textContent = `${Math.round(p.pct)}%`;
        if (p.time && statTime) statTime.textContent = `Time: ${p.time}`;
        if (p.fps && statFps) statFps.textContent = `FPS: ${p.fps}`;
        if (p.speed && statSpeed) statSpeed.textContent = `Speed: ${p.speed}`;
        if (p.bitrate && statBitrate) statBitrate.textContent = `Bitrate: ${p.bitrate}`;
      },
    });

    await jobPromise;
    if (statusMsg) statusMsg.textContent = "Operation Completed";
  } catch (err) {
    if (logBox) {
      const errDiv = document.createElement("div");
      errDiv.className = "text-danger";
      errDiv.textContent = `Execution failed: ${err?.message || err}`;
      logBox.appendChild(errDiv);
    }
    if (statusMsg) statusMsg.textContent = "Error";
  } finally {
    if (progBar) progBar.style.width = "100%";
    if (pctLabel) pctLabel.textContent = "100%";
  }
}

// Global Reset Active Kit handler
export function resetActiveKit() {
  const activeKit = getActiveKit();
  if (!activeKit) return;
  saveKitParams(activeKit.id, {});
  selectAndOpenKit(activeKit.id);
}
