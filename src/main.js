// AnEditKit - Modular Application Entry Point
import { loadSettings, saveSettings } from "./js/storage.js";
import {
  selectMediaFile,
  selectOutputFolder,
  initDragAndDrop,
  getCurrentInputFile,
  getCurrentMediaInfo,
  probeMedia,
} from "./js/media.js";
import { buildCommandForTool } from "./js/commands.js";
import {
  executeFfmpegJob,
  cancelFfmpegJob,
  isJobRunning,
} from "./js/runner.js";
import { initNavigation, getCurrentActiveTool } from "./js/navigation.js";
import { initToolsManager } from "./js/tools_manager.js";

let appSettings = loadSettings();
let mergeFiles = [];
let userHasCustomOutputName = false;

export function getSmartOutputFileName(inputFile, toolId) {
  if (!inputFile) return "";
  const baseName =
    inputFile
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "") || "output";

  switch (toolId) {
    case "convert": {
      const container = document.getElementById("cvt-container")?.value || "mp4";
      return `${baseName}_converted.${container}`;
    }
    case "extract_audio": {
      const fmt = document.getElementById("aud-format")?.value || "mp3";
      return `${baseName}_extracted.${fmt}`;
    }
    case "trim": {
      const ext = (inputFile.split(".").pop() || "mp4").toLowerCase();
      return `${baseName}_trimmed.${ext}`;
    }
    case "compress":
      return `${baseName}_compressed.mp4`;
    case "merge": {
      const fmt = document.getElementById("merge-format")?.value || "mp4";
      return `${baseName}_merged.${fmt}`;
    }
    case "mute_replace":
      return `${baseName}_audio_edit.mp4`;
    case "gif_frames": {
      const mode = document.getElementById("gif-mode")?.value || "gif";
      return mode === "frames" ? `${baseName}_frame_%04d.png` : `${baseName}_animated.gif`;
    }
    case "custom":
      return `${baseName}_output.mp4`;
    default:
      return `${baseName}_out.mp4`;
  }
}

export function updateAutoOutputFilename(force = false) {
  const outputNameInput = document.getElementById("output-file-name");
  if (!outputNameInput) return;

  const currentInput = getCurrentInputFile();
  const activeTool = getCurrentActiveTool();

  if (force || !userHasCustomOutputName || !outputNameInput.value.trim()) {
    const smartName = getSmartOutputFileName(currentInput, activeTool);
    outputNameInput.value = smartName;
    if (force) userHasCustomOutputName = false;
  }
}

function syncMediaDurationToTools(mediaInfo) {
  if (!mediaInfo || !mediaInfo.duration_string) return;
  const trimEnd = document.getElementById("trim-end");
  if (trimEnd && (trimEnd.value === "00:01:00.000" || !trimEnd.value)) {
    trimEnd.value = `${mediaInfo.duration_string}.000`;
  }
}

export function updateExecuteButtonState() {
  const btnExecute = document.getElementById("btn-execute");
  const activeTool = getCurrentActiveTool();
  const currentInput = getCurrentInputFile();

  if (!btnExecute) return;

  if (activeTool === "settings") {
    btnExecute.classList.add("d-none");
    btnExecute.disabled = true;
    return;
  }

  btnExecute.classList.remove("d-none");

  if (isJobRunning()) {
    btnExecute.disabled = false;
    btnExecute.textContent = "Cancel";
    btnExecute.className = "btn btn-danger btn-sm px-4";
    return;
  }

  btnExecute.textContent = "Execute";
  btnExecute.className = "btn btn-primary btn-sm px-4";

  let canExecute = false;
  if (activeTool === "merge") {
    canExecute = mergeFiles && mergeFiles.length >= 2;
  } else if (activeTool === "custom") {
    const cmdInput = document.getElementById("custom-args");
    canExecute = !!(cmdInput && cmdInput.value.trim().length > 0);
  } else {
    canExecute = !!(currentInput && currentInput.trim().length > 0);
  }

  btnExecute.disabled = !canExecute;
  if (!canExecute) {
    btnExecute.setAttribute(
      "title",
      activeTool === "merge"
        ? "Add at least 2 files to merge"
        : activeTool === "custom"
          ? "Enter custom arguments to execute"
          : "Select a source media file to execute",
    );
  } else {
    btnExecute.setAttribute("title", "Run processing operation");
  }
}

function updateCommandPreview() {
  const activeTool = getCurrentActiveTool();
  const currentInput = getCurrentInputFile();
  const cmdPreviewEl = document.getElementById("cmd-preview");
  const execFooter = document.getElementById("execution-footer-panel");

  updateExecuteButtonState();

  if (!cmdPreviewEl) return;

  if (activeTool === "settings") {
    if (execFooter) execFooter.classList.add("d-none");
    return;
  }
  if (execFooter) execFooter.classList.remove("d-none");

  const cmdObj = buildCommandForTool(
    activeTool,
    currentInput,
    appSettings.outputDir,
    appSettings,
  );
  cmdPreviewEl.textContent = cmdObj.fullString;
  return cmdObj;
}

function bindFormEvents() {
  // Update command preview whenever any form element changes
  const formElements = document.querySelectorAll("select, input");
  formElements.forEach((el) => {
    el.addEventListener("input", (e) => {
      if (e.target.id === "output-file-name") {
        userHasCustomOutputName = true;
      }
      if (el.closest("#view-settings")) {
        syncSettingsFromUI();
      }
      if (e.target.id === "cvt-container" || e.target.id === "aud-format" || e.target.id === "gif-mode") {
        updateAutoOutputFilename();
      }
      updateCommandPreview();
    });
    el.addEventListener("change", (e) => {
      if (e.target.id === "output-file-name") {
        userHasCustomOutputName = true;
      }
      if (el.closest("#view-settings")) {
        syncSettingsFromUI();
      }
      if (e.target.id === "cvt-container" || e.target.id === "aud-format" || e.target.id === "gif-mode") {
        updateAutoOutputFilename();
      }
      updateCommandPreview();
    });
  });

  // Browse Media Input
  const btnBrowseInput = document.getElementById("btn-browse-input");
  if (btnBrowseInput) {
    btnBrowseInput.addEventListener("click", async () => {
      const activeTool = getCurrentActiveTool();
      const filterMode = activeTool === "extract_audio" ? "audio" : "all";
      const info = await selectMediaFile(filterMode);
      if (info) syncMediaDurationToTools(info);
      updateAutoOutputFilename(true);
      updateCommandPreview();
    });
  }

  // Clear Media Input
  const btnClearInput = document.getElementById("btn-clear-input");
  if (btnClearInput) {
    btnClearInput.addEventListener("click", async () => {
      await probeMedia("");
      const outputNameInput = document.getElementById("output-file-name");
      if (outputNameInput) outputNameInput.value = "";
      userHasCustomOutputName = false;
      updateCommandPreview();
    });
  }

  // Auto-detect Output Name button
  const btnAutodetectName = document.getElementById("btn-autodetect-output-name");
  if (btnAutodetectName) {
    btnAutodetectName.addEventListener("click", () => {
      updateAutoOutputFilename(true);
      updateCommandPreview();
    });
  }

  // Choose Output Folder on Output Name Row
  const btnBrowseOutputRow = document.getElementById("btn-browse-output-dir");
  if (btnBrowseOutputRow) {
    btnBrowseOutputRow.addEventListener("click", async () => {
      const currentInput = getCurrentInputFile();
      const folder = await selectOutputFolder(currentInput || null);
      if (folder) {
        appSettings.outputDir = folder;
        const setOutDirInput = document.getElementById("set-output-dir");
        if (setOutDirInput) setOutDirInput.value = folder;
        saveSettings(appSettings);
        updateCommandPreview();
      }
    });
  }

  // Browse Output Folder in Settings
  const btnBrowseOutDir = document.getElementById("btn-browse-outdir");
  const setOutDirInput = document.getElementById("set-output-dir");
  if (btnBrowseOutDir) {
    btnBrowseOutDir.addEventListener("click", async () => {
      const folder = await selectOutputFolder();
      if (folder) {
        appSettings.outputDir = folder;
        if (setOutDirInput) setOutDirInput.value = folder;
        saveSettings(appSettings);
        updateCommandPreview();
      }
    });
  }

  // Trim preset buttons
  const btnTrimStart0 = document.getElementById("btn-trim-set-start-0");
  const btnTrimEndDur = document.getElementById("btn-trim-set-end-dur");
  const trimStartInput = document.getElementById("trim-start");
  const trimEndInput = document.getElementById("trim-end");

  if (btnTrimStart0 && trimStartInput) {
    btnTrimStart0.addEventListener("click", () => {
      trimStartInput.value = "00:00:00.000";
      updateCommandPreview();
    });
  }

  if (btnTrimEndDur && trimEndInput) {
    btnTrimEndDur.addEventListener("click", () => {
      const mediaInfo = getCurrentMediaInfo();
      if (mediaInfo && mediaInfo.duration_string) {
        trimEndInput.value = `${mediaInfo.duration_string}.000`;
      }
      updateCommandPreview();
    });
  }

  // Execute / Cancel Button
  const btnExecute = document.getElementById("btn-execute");
  if (btnExecute) {
    btnExecute.addEventListener("click", () => {
      if (isJobRunning()) {
        cancelFfmpegJob();
      } else {
        const cmdObj = updateCommandPreview();
        const mediaInfo = getCurrentMediaInfo();
        const totalDuration = cmdObj?.duration || mediaInfo?.duration_seconds || 0.0;
        if (cmdObj) {
          executeFfmpegJob(cmdObj, totalDuration);
        }
      }
    });
  }

  // Reset Button
  const btnReset = document.getElementById("btn-reset");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      const activeView = document.querySelector(".tool-view:not(.d-none)");
      if (activeView) {
        activeView.querySelectorAll("select, input").forEach((input) => {
          if (input.type === "checkbox") {
            input.checked = input.defaultChecked;
          } else if (input.defaultValue !== undefined) {
            input.value = input.defaultValue;
          }
        });
      }
      const mediaInfo = getCurrentMediaInfo();
      if (mediaInfo) syncMediaDurationToTools(mediaInfo);
      updateAutoOutputFilename(true);
      updateCommandPreview();
    });
  }

  // Copy Command Button
  const btnCopy = document.getElementById("btn-copy-cmd");
  if (btnCopy) {
    btnCopy.addEventListener("click", () => {
      const cmdText = document.getElementById("cmd-preview")?.textContent || "";
      navigator.clipboard.writeText(cmdText).then(() => {
        btnCopy.innerHTML = '<i class="bi bi-check2"></i> Copied!';
        setTimeout(() => {
          btnCopy.innerHTML = '<i class="bi bi-clipboard"></i> Copy';
        }, 1500);
      });
    });
  }

  // Merge tool actions
  const btnMergeAdd = document.getElementById("btn-merge-add");
  const btnMergeClear = document.getElementById("btn-merge-clear");
  if (btnMergeAdd) {
    btnMergeAdd.addEventListener("click", async () => {
      const mockFile = `C:\\Users\\User\\Videos\\clip_${mergeFiles.length + 1}.mp4`;
      mergeFiles.push(mockFile);
      renderMergeList();
      updateCommandPreview();
    });
  }
  if (btnMergeClear) {
    btnMergeClear.addEventListener("click", () => {
      mergeFiles = [];
      renderMergeList();
      updateCommandPreview();
    });
  }

  // Mute / Replace tool toggle
  const muteAction = document.getElementById("mute-action");
  const secondAudioWrapper = document.getElementById("mute-second-audio-wrapper");
  if (muteAction && secondAudioWrapper) {
    muteAction.addEventListener("change", () => {
      const show = muteAction.value !== "strip";
      secondAudioWrapper.classList.toggle("d-none", !show);
      if (show) {
        secondAudioWrapper.classList.remove("ui-zoom-in");
        void secondAudioWrapper.offsetWidth;
        secondAudioWrapper.classList.add("ui-zoom-in");
      }
      updateCommandPreview();
    });
  }

  // Compression dynamic custom MB toggle
  const compPreset = document.getElementById("comp-preset");
  const compCustomWrapper = document.getElementById("comp-custom-wrapper");
  if (compPreset && compCustomWrapper) {
    compPreset.addEventListener("change", () => {
      const show = compPreset.value === "custom";
      compCustomWrapper.classList.toggle("d-none", !show);
      if (show) {
        compCustomWrapper.classList.remove("ui-zoom-in");
        void compCustomWrapper.offsetWidth;
        compCustomWrapper.classList.add("ui-zoom-in");
      }
      updateCommandPreview();
    });
  }
}

function renderMergeList() {
  const mergeList = document.getElementById("merge-file-list");
  if (!mergeList) return;

  if (mergeFiles.length === 0) {
    mergeList.innerHTML =
      '<div class="list-group-item text-body-secondary text-center py-4" id="merge-empty-msg">No files added. Click Add Files to queue items for merging.</div>';
    return;
  }

  mergeList.innerHTML = mergeFiles
    .map(
      (f, idx) => `
      <div class="list-group-item d-flex justify-content-between align-items-center py-2">
        <span class="text-truncate small"><strong class="me-2">${idx + 1}.</strong>${f}</span>
        <button class="btn btn-outline-danger btn-sm py-0 px-2 btn-merge-del" data-idx="${idx}" type="button"><i class="bi bi-x"></i></button>
      </div>
    `,
    )
    .join("");

  mergeList.querySelectorAll(".btn-merge-del").forEach((b) => {
    b.addEventListener("click", () => {
      const idx = parseInt(b.dataset.idx, 10);
      mergeFiles.splice(idx, 1);
      renderMergeList();
      updateCommandPreview();
    });
  });
}

function populateSettingsUI() {
  const setOutDir = document.getElementById("set-output-dir");
  const setPromptOver = document.getElementById("set-prompt-overwrite");
  const setHw = document.getElementById("set-hwaccel");
  const setThr = document.getElementById("set-threads");
  const setDefVc = document.getElementById("set-def-vcodec");
  const setDefSp = document.getElementById("set-def-speed");
  const setDefAf = document.getElementById("set-def-aformat");
  const setDefAb = document.getElementById("set-def-abitrate");

  if (setOutDir) setOutDir.value = appSettings.outputDir || "C:\\Users\\User\\Videos";
  if (setPromptOver) setPromptOver.checked = !!appSettings.promptOverwrite;
  if (setHw) setHw.value = appSettings.hwAccel || "auto";
  if (setThr) setThr.value = appSettings.threads || "0";
  if (setDefVc) setDefVc.value = appSettings.defVCodec || "libx264";
  if (setDefSp) setDefSp.value = appSettings.defSpeed || "medium";
  if (setDefAf) setDefAf.value = appSettings.defAFmt || "mp3";
  if (setDefAb) setDefAb.value = appSettings.defABitrate || "256k";
}

function syncSettingsFromUI() {
  const setOutDir = document.getElementById("set-output-dir");
  const setPromptOver = document.getElementById("set-prompt-overwrite");
  const setHw = document.getElementById("set-hwaccel");
  const setThr = document.getElementById("set-threads");
  const setDefVc = document.getElementById("set-def-vcodec");
  const setDefSp = document.getElementById("set-def-speed");
  const setDefAf = document.getElementById("set-def-aformat");
  const setDefAb = document.getElementById("set-def-abitrate");

  if (setOutDir) appSettings.outputDir = setOutDir.value;
  if (setPromptOver) appSettings.promptOverwrite = setPromptOver.checked;
  if (setHw) appSettings.hwAccel = setHw.value;
  if (setThr) appSettings.threads = setThr.value;
  if (setDefVc) appSettings.defVCodec = setDefVc.value;
  if (setDefSp) appSettings.defSpeed = setDefSp.value;
  if (setDefAf) appSettings.defAFmt = setDefAf.value;
  if (setDefAb) appSettings.defABitrate = setDefAb.value;

  saveSettings(appSettings);
}

// App Initialization
document.addEventListener("DOMContentLoaded", () => {
  populateSettingsUI();
  initToolsManager();
  initDragAndDrop((mediaInfo) => {
    if (mediaInfo) syncMediaDurationToTools(mediaInfo);
    updateAutoOutputFilename(true);
    updateCommandPreview();
  });
  bindFormEvents();
  initNavigation((toolId) => {
    const mediaInfo = getCurrentMediaInfo();
    if (mediaInfo) syncMediaDurationToTools(mediaInfo);
    updateAutoOutputFilename();
    updateCommandPreview();
  });
  updateAutoOutputFilename();
  updateCommandPreview();
});
