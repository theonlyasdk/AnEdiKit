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
      const mode = document.getElementById("gif-mode")?.value || "gif_hq";
      const snapFmt = document.getElementById("gif-snap-fmt")?.value || "png";
      if (mode === "snapshot") return `${baseName}_snapshot.${snapFmt}`;
      if (mode === "frames_seq") return `${baseName}_frame_%04d.${snapFmt}`;
      return `${baseName}_animated.gif`;
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
    { mergeFiles },
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
      if (e.target.id === "cvt-container" || e.target.id === "aud-format" || e.target.id === "gif-mode" || e.target.id === "merge-format") {
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
      if (e.target.id === "cvt-container" || e.target.id === "aud-format" || e.target.id === "gif-mode" || e.target.id === "merge-format") {
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
    btnExecute.addEventListener("click", async () => {
      if (isJobRunning()) {
        cancelFfmpegJob();
      } else {
        const activeTool = getCurrentActiveTool();
        let cmdObj = null;
        if (activeTool === "merge" && document.getElementById("merge-engine")?.value === "concat_demuxer") {
          let concatPath = null;
          if (window.__TAURI__?.core?.invoke && mergeFiles && mergeFiles.length > 0) {
            try {
              const lines = mergeFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`);
              const content = lines.join("\n");
              concatPath = await window.__TAURI__.core.invoke("write_temp_text_file", {
                filename: `anedikit_concat_${Date.now()}.txt`,
                content,
              });
            } catch (e) {
              console.warn("Failed to write concat file:", e);
            }
          }
          cmdObj = buildCommandForTool("merge", null, appSettings.outputDir, appSettings, {
            mergeFiles,
            concatListPath: concatPath,
          });
        } else {
          cmdObj = updateCommandPreview();
        }

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
  let selectedMergeIdx = -1;
  const btnMergeAdd = document.getElementById("btn-merge-add");
  const btnMergeUp = document.getElementById("btn-merge-up");
  const btnMergeDown = document.getElementById("btn-merge-down");
  const btnMergeClear = document.getElementById("btn-merge-clear");

  if (btnMergeAdd) {
    btnMergeAdd.addEventListener("click", async () => {
      if (window.__TAURI__?.core?.invoke) {
        try {
          const picked = await window.__TAURI__.core.invoke("pick_files", { filter_mode: "all" });
          if (picked && picked.length > 0) {
            mergeFiles.push(...picked);
            renderMergeList();
            updateCommandPreview();
          }
        } catch (e) {
          console.warn("pick_files error:", e);
        }
      } else {
        const mockFile = `C:\\Users\\User\\Videos\\clip_${mergeFiles.length + 1}.mp4`;
        mergeFiles.push(mockFile);
        renderMergeList();
        updateCommandPreview();
      }
    });
  }

  if (btnMergeUp) {
    btnMergeUp.addEventListener("click", () => {
      if (selectedMergeIdx > 0 && selectedMergeIdx < mergeFiles.length) {
        const temp = mergeFiles[selectedMergeIdx];
        mergeFiles[selectedMergeIdx] = mergeFiles[selectedMergeIdx - 1];
        mergeFiles[selectedMergeIdx - 1] = temp;
        selectedMergeIdx--;
        renderMergeList();
        updateCommandPreview();
      }
    });
  }

  if (btnMergeDown) {
    btnMergeDown.addEventListener("click", () => {
      if (selectedMergeIdx >= 0 && selectedMergeIdx < mergeFiles.length - 1) {
        const temp = mergeFiles[selectedMergeIdx];
        mergeFiles[selectedMergeIdx] = mergeFiles[selectedMergeIdx + 1];
        mergeFiles[selectedMergeIdx + 1] = temp;
        selectedMergeIdx++;
        renderMergeList();
        updateCommandPreview();
      }
    });
  }

  if (btnMergeClear) {
    btnMergeClear.addEventListener("click", () => {
      mergeFiles = [];
      selectedMergeIdx = -1;
      renderMergeList();
      updateCommandPreview();
    });
  }

  // Mute / Replace tool toggle
  const muteAction = document.getElementById("mute-action");
  const secondAudioWrapper = document.getElementById("second-audio-wrapper");
  const secondAudioVolWrapper = document.getElementById("second-audio-vol-wrapper");
  const btnBrowseAudio = document.getElementById("btn-browse-audio");
  const secondAudioPathInput = document.getElementById("second-audio-path");

  if (muteAction) {
    muteAction.addEventListener("change", () => {
      const show = muteAction.value !== "strip";
      if (secondAudioWrapper) {
        secondAudioWrapper.classList.toggle("d-none", !show);
        if (show) {
          secondAudioWrapper.classList.remove("ui-zoom-in");
          void secondAudioWrapper.offsetWidth;
          secondAudioWrapper.classList.add("ui-zoom-in");
        }
      }
      if (secondAudioVolWrapper) {
        secondAudioVolWrapper.classList.toggle("d-none", !show);
        if (show) {
          secondAudioVolWrapper.classList.remove("ui-zoom-in");
          void secondAudioVolWrapper.offsetWidth;
          secondAudioVolWrapper.classList.add("ui-zoom-in");
        }
      }
      updateCommandPreview();
    });
  }

  if (btnBrowseAudio && secondAudioPathInput) {
    btnBrowseAudio.addEventListener("click", async () => {
      if (window.__TAURI__?.core?.invoke) {
        try {
          const picked = await window.__TAURI__.core.invoke("pick_file", { filter_mode: "audio" });
          if (picked) {
            secondAudioPathInput.value = picked;
            updateCommandPreview();
          }
        } catch (e) {
          console.warn("pick_file audio error:", e);
        }
      } else {
        secondAudioPathInput.value = "C:\\Users\\User\\Music\\background_track.mp3";
        updateCommandPreview();
      }
    });
  }

  // GIF / Frames dynamic controls toggle
  const gifMode = document.getElementById("gif-mode");
  const gifFpsWrapper = document.getElementById("gif-fps-wrapper");
  const gifDurWrapper = document.getElementById("gif-dur-wrapper");
  const gifSnapWrapper = document.getElementById("gif-snap-wrapper");

  if (gifMode) {
    gifMode.addEventListener("change", () => {
      const mode = gifMode.value;
      const isSnapshot = mode === "snapshot";
      const isSeq = mode === "frames_seq";

      if (gifFpsWrapper) gifFpsWrapper.classList.toggle("d-none", isSnapshot);
      if (gifDurWrapper) gifDurWrapper.classList.toggle("d-none", isSnapshot);
      if (gifSnapWrapper) {
        gifSnapWrapper.classList.toggle("d-none", !(isSnapshot || isSeq));
        if (isSnapshot || isSeq) {
          gifSnapWrapper.classList.remove("ui-zoom-in");
          void gifSnapWrapper.offsetWidth;
          gifSnapWrapper.classList.add("ui-zoom-in");
        }
      }
      updateAutoOutputFilename(true);
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
      <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2 ${idx === selectedMergeIdx ? 'active' : ''}" data-item-idx="${idx}" style="cursor: pointer;">
        <span class="text-truncate small"><strong class="me-2">${idx + 1}.</strong>${f}</span>
        <button class="btn btn-outline-danger btn-sm py-0 px-2 btn-merge-del ${idx === selectedMergeIdx ? 'btn-outline-light' : ''}" data-idx="${idx}" type="button"><i class="bi bi-x"></i></button>
      </div>
    `,
    )
    .join("");

  mergeList.querySelectorAll(".list-group-item-action").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".btn-merge-del")) return;
      selectedMergeIdx = parseInt(item.dataset.itemIdx, 10);
      renderMergeList();
    });
  });

  mergeList.querySelectorAll(".btn-merge-del").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(b.dataset.idx, 10);
      mergeFiles.splice(idx, 1);
      if (selectedMergeIdx === idx) selectedMergeIdx = -1;
      else if (selectedMergeIdx > idx) selectedMergeIdx--;
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
