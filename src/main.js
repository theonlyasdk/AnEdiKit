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

let appSettings = loadSettings();
let mergeFiles = [];

function updateCommandPreview() {
  const activeTool = getCurrentActiveTool();
  const currentInput = getCurrentInputFile();
  const cmdPreviewEl = document.getElementById("cmd-preview");
  const execFooter = document.getElementById("execution-footer-panel");

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
    el.addEventListener("input", () => {
      if (el.closest("#view-settings")) {
        syncSettingsFromUI();
      }
      updateCommandPreview();
    });
    el.addEventListener("change", () => {
      if (el.closest("#view-settings")) {
        syncSettingsFromUI();
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
      await selectMediaFile(filterMode);
      updateCommandPreview();
    });
  }

  // Clear Media Input
  const btnClearInput = document.getElementById("btn-clear-input");
  if (btnClearInput) {
    btnClearInput.addEventListener("click", async () => {
      await probeMedia("");
      updateCommandPreview();
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

  // Execute / Cancel Button
  const btnExecute = document.getElementById("btn-execute");
  if (btnExecute) {
    btnExecute.addEventListener("click", () => {
      if (isJobRunning()) {
        cancelFfmpegJob();
      } else {
        const cmdObj = updateCommandPreview();
        const mediaInfo = getCurrentMediaInfo();
        const totalDuration = mediaInfo?.duration_seconds || 0.0;
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

  // Mute / Replace audio dynamic section toggle
  const muteAction = document.getElementById("mute-action");
  const secondAudioWrapper = document.getElementById("second-audio-wrapper");
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
      (file, idx) => `
    <div class="list-group-item d-flex justify-content-between align-items-center py-2 px-3 ui-zoom-in">
      <span class="text-truncate" style="max-width: 80%;">${file}</span>
      <span class="badge text-bg-secondary">#${idx + 1}</span>
    </div>
  `,
    )
    .join("");
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

  if (setOutDir) setOutDir.value = appSettings.outputDir;
  if (setPromptOver) setPromptOver.checked = appSettings.promptOverwrite;
  if (setHw) setHw.value = appSettings.hwAccel;
  if (setThr) setThr.value = appSettings.threads;
  if (setDefVc) setDefVc.value = appSettings.defVCodec;
  if (setDefSp) setDefSp.value = appSettings.defSpeed;
  if (setDefAf) setDefAf.value = appSettings.defAFmt;
  if (setDefAb) setDefAb.value = appSettings.defABitrate;
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
  initDragAndDrop((mediaInfo) => {
    updateCommandPreview();
  });
  bindFormEvents();
  initNavigation((toolId) => {
    updateCommandPreview();
  });
  updateCommandPreview();
});
