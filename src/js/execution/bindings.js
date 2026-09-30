// AnEdiKit - Form-event wiring for the execution workspace.
// Handlers live in ../execution.js. Safe to call repeatedly: every binding
// is keyed via dom_bind.js (bindKeyed), so injecting a lazy view and calling
// bindFormEvents(root) hydrates only the new fragment.

import { getAppSettings, saveSettingsFromUI } from "../app_settings.js";
import { saveSettings, getLastOutputDir, saveLastOutputDir, getLastImageAiOutDir, saveLastImageAiOutDir, getLastYtDlpOutDir, saveAiReplaceSource } from "../storage.js";

import { saveActiveModuleState } from "../module_state.js";
import {
  selectMediaFile,
  selectMediaFiles,
  selectOutputFolder,
  getCurrentInputFile,
  getCurrentMediaInfo,
  syncMediaDurationToTools,
  getBatchQueue,
  clearBatchQueue,
  clearAllMediaPreviewCaches,
} from "../media.js";
import {
  getImageAiQueue,
  addImageFilesToQueue,
  clearImageAiQueue,
  updateImageAiItemStatus,
} from "../image_queue.js";
import { buildCommandForTool } from "../commands.js";
import {
  executeFfmpegJob,
  executeBatchQueue,
  cancelFfmpegJob,
  isJobRunning,
  isCancelRequested,
  resetCancelFlag,
  showBatchFinishedNotification,
} from "../runner.js";
import { getCurrentActiveTool } from "../active_tool.js";
import { TOOL_METADATA } from "../tool_metadata.js";
import { resolveExecuteButtonState } from "../execute_state.js";
import { animateCopyConfirm } from "../copy_anim.js";
import { checkToolsBeforeExecution } from "../tools_manager.js";
import { openComparisonModal, setComparisonShimmer } from "../comparison.js";
import { fixYoutubeUrl } from "../ytdlp_url.js";
import { executeActiveKit, resetActiveKit } from "../../kits/index.js";
import {
  getAudioTagQueue,
  executeAudioTagsQueue,
  revertActiveTrack,
  isAudioTagsLoading,
} from "../audio_tags.js";
import { syncFormatSpecificUI } from "../format_sync.js";
import { updateEstimatesUI } from "../estimates.js";
import {
  getOutputFilePath,
  setOutputFilePath,
  refreshOutputFilePathDisplay,
  updateAutoOutputFilename,
  checkOutputTargetFileExists,
  getSmartOutputFileName,
  setUserHasCustomOutputName,
} from "../output_path.js";
import {
  getPlaylistVideos,
  isPlaylistFetching,
  getFetchedPlaylistUrl,
  fetchPlaylistVideosHandler,
  initPlaylistControls,
} from "../playlist.js";
import { bindKeyed } from "../dom_bind.js";
import { getMergeFiles, initMergeControls } from "../merge.js";
import { handleExecuteClick, updateCommandPreview, updateExecuteButtonState } from "../execution.js";

let formEventsBound = false;

// Narrow wiring for the lazy-loaded custom view (called after injection).
function wireCustomView(root) {
  const sel = root.querySelector("#custom-preset-select");
  const input = root.querySelector("#custom-args");
  if (sel && input) {
    bindKeyed(sel, "custom:preset", "change", () => {
      if (sel.value) {
        input.value = sel.value;
        updateCommandPreview();
      }
    });
  }
  const compPreset = root.querySelector("#comp-preset");
  const compWrap = root.querySelector("#comp-custom-wrapper");
  if (compPreset && compWrap) {
    bindKeyed(compPreset, "custom:comp-preset", "change", () => {
      const isCustom = compPreset.value === "custom";
      compWrap.classList.toggle("d-none", !isCustom);
      saveActiveModuleState(getCurrentActiveTool());
      syncFormatSpecificUI();
      updateEstimatesUI();
      updateCommandPreview();
    });
  }
}

// Exposed for view_loader.js (via window hook).
if (typeof window !== "undefined") {
  window.__ANEDIKIT_WIRE_LAZY = (root) => {
    try { wireCustomView(root); } catch (_) {}
  };
}

export function bindFormEvents() {
  if (formEventsBound) return;
  formEventsBound = true;
  const outputNameInput = document.getElementById("output-file-name");
  if (outputNameInput) {
    outputNameInput.addEventListener("focus", () => {
      outputNameInput.value = outputNameInput.dataset.fullPath || outputNameInput.value;
    });
    outputNameInput.addEventListener("input", () => {
      outputNameInput.dataset.fullPath = outputNameInput.value;
      outputNameInput.title = outputNameInput.value;
      setUserHasCustomOutputName(true);
      checkOutputTargetFileExists();
    });
    outputNameInput.addEventListener("change", () => {
      checkOutputTargetFileExists();
    });
    outputNameInput.addEventListener("blur", () => {
      refreshOutputFilePathDisplay();
      checkOutputTargetFileExists();
    });
  }

  window.addEventListener("resize", () => {
    refreshOutputFilePathDisplay();
  });

  // Update command preview and save settings whenever any form element changes
  const formElements = document.querySelectorAll("select, input, textarea");
  const handleFormEvent = (e) => {
    if (e.target.id === "output-file-name") {
      setUserHasCustomOutputName(true);
    }
    // Preset dropdown pushes into the slider first so everything downstream
    if (e.target.id === "speed-preset-select") {
      const sl = document.getElementById("speed-preset");
      const sv = parseFloat(e.target.value);
      if (sl && Number.isFinite(sv)) sl.value = String(Math.min(16, Math.max(0.25, sv)));
    }
    if (e.target.closest("#view-settings") || (e.target.id && e.target.id.startsWith("set-"))) {
      saveSettingsFromUI();
    } else {
      saveActiveModuleState(getCurrentActiveTool());
    }
    syncFormatSpecificUI();
    if (
      e.target.id === "cvt-container" ||
      e.target.id === "aud-format" ||
      e.target.id === "comp-aud-format" ||
      e.target.id === "gif-mode" ||
      e.target.id === "merge-format" ||
      e.target.id === "speed-container" ||
      e.target.id === "speed-preset" ||
      e.target.id === "speed-custom-val" ||
      e.target.id === "crop-container" ||
      e.target.id === "crop-ratio" ||
      e.target.id === "stab-container" ||
      e.target.id === "loop-container" ||
      e.target.id === "loop-mode" ||
      e.target.id === "loop-engine" ||
      e.target.id === "loop-vcodec" ||
      e.target.id === "loop-audio-mode" ||
      e.target.id === "loop-concat" ||
      e.target.id === "norm-video-mode" ||
      e.target.id === "norm-acodec"
    ) {
      updateAutoOutputFilename(true);
    }
    if (
      e.target.id === "loop-target-hh" ||
      e.target.id === "loop-target-mm" ||
      e.target.id === "loop-target-ss"
    ) {
      syncLoopPresetActiveButtons();
    }
    updateCommandPreview();
  };

  formElements.forEach((el) => {
    el.addEventListener("input", handleFormEvent);
    el.addEventListener("change", handleFormEvent);
  });


  function syncLoopPresetActiveButtons() {
    const inH = parseInt(document.getElementById("loop-target-hh")?.value, 10) || 0;
    const inM = parseInt(document.getElementById("loop-target-mm")?.value, 10) || 0;
    const inS = parseInt(document.getElementById("loop-target-ss")?.value, 10) || 0;
    const totalSec = inH * 3600 + inM * 60 + inS;
    document.querySelectorAll(".btn-loop-preset").forEach((btn) => {
      const sec = parseInt(btn.dataset.sec, 10);
      btn.classList.toggle("active", sec === totalSec);
    });
  }

  // Loop & Duration Extender preset buttons
  document.querySelectorAll(".btn-loop-preset").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".btn-loop-preset").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const sec = parseInt(btn.dataset.sec, 10) || 3600;
      const hh = Math.floor(sec / 3600);
      const mm = Math.floor((sec % 3600) / 60);
      const ss = sec % 60;
      const inH = document.getElementById("loop-target-hh");
      const inM = document.getElementById("loop-target-mm");
      const inS = document.getElementById("loop-target-ss");
      if (inH) inH.value = hh;
      if (inM) inM.value = mm;
      if (inS) inS.value = ss;
      syncFormatSpecificUI();
      updateEstimatesUI();
      updateCommandPreview();
    });
  });

  window.addEventListener("anedikit:format_updated", () => {
    saveActiveModuleState(getCurrentActiveTool());
    updateCommandPreview();
  });

  window.addEventListener("anedikit:job_finished", () => {
    updateExecuteButtonState();
  });

  // Live preview regeneration listener for fake transparency in comparison modal
  window.addEventListener("anedikit:regenerate_comparison", async (e) => {
    const { origPath, resultPath, taskName } = e.detail || {};
    if (!origPath) return;

    try {
      setComparisonShimmer(true);
      const appSettings = getAppSettings();
      const cmdObj = buildCommandForTool("bg_remover", origPath, appSettings.outputDir, appSettings);
      if (cmdObj) {
        const ok = await executeFfmpegJob(cmdObj, 1.0);
        if (ok) {
          openComparisonModal(origPath, cmdObj.destination, taskName || "Fake Transparency");
        }
      }
    } catch (err) {
      console.warn("Live comparison regeneration error:", err);
    } finally {
      setComparisonShimmer(false);
      const btnReapply = document.getElementById("btn-comp-reapply");
      if (btnReapply) {
        btnReapply.disabled = false;
        btnReapply.innerHTML = `<ion-icon name="refresh-outline"></ion-icon> Re-apply &amp; Update`;
      }
    }
  });

  // Color picker sync
  const bgColorPicker = document.getElementById("bg-color-picker");
  const bgColorInput = document.getElementById("bg-color");
  if (bgColorPicker && bgColorInput) {
    bgColorPicker.addEventListener("input", () => {
      bgColorInput.value = bgColorPicker.value;
      updateCommandPreview();
    });
    bgColorInput.addEventListener("input", () => {
      if (/^#[0-9A-Fa-f]{6}$/.test(bgColorInput.value)) {
        bgColorPicker.value = bgColorInput.value;
      }
      updateCommandPreview();
    });
  }

  // Browse Media Input
  const btnBrowseInput = document.getElementById("btn-browse-input");
  if (btnBrowseInput) {
    btnBrowseInput.addEventListener("click", async () => {
      const activeTool = getCurrentActiveTool();
      const isImageTool = [
        "bg_remover",
        "ai_upscaler",
        "vectorizer",
        "restore_denoise",
        "icon_generator",
        "metadata_cleaner",
      ].includes(activeTool);
      const filterMode = (activeTool === "extract_audio" || activeTool === "compress_audio" || activeTool === "audio_tags")
        ? "audio"
        : isImageTool
          ? "image"
          : "all";
      const info = await selectMediaFile(filterMode);
      if (info) syncMediaDurationToTools(info);
      updateAutoOutputFilename(true);
      updateCommandPreview();
    });
  }

  // Batch Queue Add & Clear
  const btnBatchAdd = document.getElementById("btn-batch-add");
  const btnBatchClear = document.getElementById("btn-batch-clear");

  const onBatchPick = async () => {
    const activeTool = getCurrentActiveTool();
    const isImageTool = [
      "bg_remover",
      "ai_upscaler",
      "vectorizer",
      "restore_denoise",
      "icon_generator",
      "metadata_cleaner",
    ].includes(activeTool);
    const filterMode = (activeTool === "extract_audio" || activeTool === "compress_audio" || activeTool === "audio_tags")
      ? "audio"
      : isImageTool
        ? "image"
        : "all";
    const picked = await selectMediaFiles(filterMode);
    if (picked && picked.length > 0) {
      updateAutoOutputFilename(true);
      updateCommandPreview();
    }
  };

  if (btnBatchAdd) btnBatchAdd.addEventListener("click", onBatchPick);
  if (btnBatchClear) {
    btnBatchClear.addEventListener("click", () => {
      clearBatchQueue();
      updateCommandPreview();
    });
  }

  // Image & AI Queue Add & Clear
  const btnImageAdd = document.getElementById("btn-image-add");
  const btnImageClear = document.getElementById("btn-image-clear");
  if (btnImageAdd) {
    btnImageAdd.addEventListener("click", async () => {
      const picked = await selectMediaFiles("image");
      if (picked && picked.length > 0) {
        await addImageFilesToQueue(picked);
      }
    });
  }
  if (btnImageClear) {
    btnImageClear.addEventListener("click", () => {
      clearImageAiQueue();
    });
  }

  // URL Paste, Clear & Download Output Folder
  const btnPasteUrl = document.getElementById("btn-paste-url");
  const ytdlpUrlInput = document.getElementById("ytdlp-url-input");
  const btnBrowseYtdlpOut = document.getElementById("btn-browse-ytdlp-outdir");
  const ytdlpOutInput = document.getElementById("ytdlp-output-dir");

  if (btnPasteUrl && ytdlpUrlInput) {
    btnPasteUrl.addEventListener("click", async () => {
      try {
        let text = await navigator.clipboard.readText();
        if (text) {
          text = text.trim();
          const appSettings = getAppSettings();
          if (appSettings.ytdlpAutoFixUrl !== false) {
            text = fixYoutubeUrl(text);
          }
          ytdlpUrlInput.value = text;
          updateCommandPreview();
        }
      } catch (err) {
        console.warn("Clipboard paste error:", err);
      }
    });
  }

  // Brand Logo Credits Dialog & Special Debug Dialog (Shift + Click)
  const brandLogoTitle = document.getElementById("brand-logo-title");
  if (brandLogoTitle) {
    brandLogoTitle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.shiftKey) {
        // Shift + Click opens special Debug Dialog
        const debugModalEl = document.getElementById("modal-debug-dialog");
        if (debugModalEl && window.bootstrap?.Modal) {
          const btnClear = document.getElementById("btn-clear-preview-cache");
          if (btnClear) {
            btnClear.textContent = "Clear Preview Cache";
            btnClear.className = "btn btn-outline-danger btn-sm w-100 py-2";
          }
          // Rendering diagnostics: backdrop blur lives or dies by the
          // WebView2/Chromium build, so surface the exact versions here.
          const dbgInfo = document.getElementById("debug-render-info");
          if (dbgInfo) {
            const ua = navigator.userAgent || "";
            const chromeM = ua.match(/Chrome\/([\d.]+)/);
            const edgM = ua.match(/Edg\/([\d.]+)/);
            const cssOK = !!(window.CSS && window.CSS.supports && window.CSS.supports("backdrop-filter", "blur(8px)"));
            const cs = getComputedStyle(document.documentElement);
            dbgInfo.textContent =
              `Chromium: ${chromeM ? chromeM[1] : "n/a"}\n` +
              `Edge/WebView2: ${edgM ? edgM[1] : "n/a"}\n` +
              `backdrop-filter parsed: ${cssOK ? "yes" : "no"}\n` +
              `blur flag: ${cs.getPropertyValue("--anedikit-blur-enabled").trim() || "unset"}`;
          }
          window.bootstrap.Modal.getOrCreateInstance(debugModalEl).show();
        }
        return;
      }
      const modalEl = document.getElementById("credits-modal");
      if (modalEl && window.bootstrap?.Modal) {
        window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }
    });
  }

  // Debug Dialog: Clear Preview Cache Button
  const btnClearCache = document.getElementById("btn-clear-preview-cache");
  if (btnClearCache) {
    btnClearCache.addEventListener("click", () => {
      const mbGained = clearAllMediaPreviewCaches();
      btnClearCache.textContent = `Cleared ${mbGained.toFixed(2)} MB`;
      btnClearCache.className = "btn btn-success btn-sm w-100 py-2";
    });
  }

  const btnOpenGithub = document.getElementById("btn-open-github");
  if (btnOpenGithub) {
    btnOpenGithub.addEventListener("click", () => {
      const url = "https://github.com/theonlyasdk";
      if (window.__TAURI__?.opener?.openUrl) {
        window.__TAURI__.opener.openUrl(url);
      } else {
        window.open(url, "_blank");
      }
    });
  }

  // Initialize playlist controls
  initPlaylistControls(() => {
    updateExecuteButtonState();
    updateCommandPreview();
  });

  if (btnBrowseYtdlpOut) {
    btnBrowseYtdlpOut.addEventListener("click", async () => {
      const folder = await selectOutputFolder();
      if (folder) {
        if (ytdlpOutInput) ytdlpOutInput.value = folder;
        const { saveLastYtDlpOutDir } = await import("../storage.js");
        saveLastYtDlpOutDir(folder);
        saveActiveModuleState(getCurrentActiveTool());
        updateCommandPreview();
      }
    });
  }

  // Clear Media Input
  const btnClearInput = document.getElementById("btn-clear-input");
  if (btnClearInput) {
    btnClearInput.addEventListener("click", async () => {
      await clearBatchQueue();
      setOutputFilePath("");
      setUserHasCustomOutputName(false);
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
        const appSettings = getAppSettings();
        appSettings.outputDir = folder;
        const setOutDirInput = document.getElementById("set-output-dir");
        if (setOutDirInput) setOutDirInput.value = folder;
        saveSettings(appSettings);
        saveLastOutputDir(folder);

        const curFullPath = getOutputFilePath();
        const curFileName = curFullPath
          ? curFullPath.split(/[/\\]/).pop()
          : getSmartOutputFileName(currentInput, getCurrentActiveTool());
        const isWindows = folder.includes("\\") || /^[a-zA-Z]:/.test(folder);
        const sep = isWindows ? "\\" : "/";
        const newFullPath = `${folder.replace(/[/\\]+$/, "")}${sep}${curFileName}`;
        setOutputFilePath(newFullPath);
        setUserHasCustomOutputName(true);

        updateCommandPreview();
      }
    });
  }

  // Open Output Folder on Output Name Row in File Explorer
  const btnOpenOutputRow = document.getElementById("btn-open-output-dir");
  if (btnOpenOutputRow) {
    btnOpenOutputRow.addEventListener("click", async () => {
      const fullPath = getOutputFilePath() || document.getElementById("output-file-name")?.value;
      const appSettings = getAppSettings();
      let targetDir = getLastOutputDir() || appSettings.outputDir || "";
      if (fullPath) {
        const lastSlash = Math.max(fullPath.lastIndexOf("\\"), fullPath.lastIndexOf("/"));
        targetDir = lastSlash > 0 ? fullPath.substring(0, lastSlash) : fullPath;
      }
      if (targetDir && window.__TAURI__?.core?.invoke) {
        try {
          await window.__TAURI__.core.invoke("show_in_folder", { filePath: targetDir });
        } catch (e) {
          console.warn("Open output folder error:", e);
        }
      }
    });
  }

  // Browse Output Folder for Image & AI Tools
  const btnBrowseImageOutDir = document.getElementById("btn-browse-image-outdir");
  const imageAiOutDirInput = document.getElementById("image-ai-output-dir");
  if (imageAiOutDirInput) {
    const appSettings = getAppSettings();
    const savedImageDir = getLastImageAiOutDir() || getLastOutputDir() || appSettings.outputDir || "C:\\Users\\User\\Pictures";
    imageAiOutDirInput.value = savedImageDir;
  }
  if (btnBrowseImageOutDir) {
    btnBrowseImageOutDir.addEventListener("click", async () => {
      const currentDir = imageAiOutDirInput?.value || null;
      const folder = await selectOutputFolder(currentDir);
      if (folder) {
        if (imageAiOutDirInput) imageAiOutDirInput.value = folder;
        saveLastImageAiOutDir(folder);
        saveLastOutputDir(folder);
        saveActiveModuleState(getCurrentActiveTool());
        updateCommandPreview();
      }
    });
  }

  // Open Image & AI Output Folder in File Explorer
  const btnOpenImageOutDir = document.getElementById("btn-open-image-outdir");
  if (btnOpenImageOutDir) {
    btnOpenImageOutDir.addEventListener("click", async () => {
      const dir = document.getElementById("image-ai-output-dir")?.value || getLastImageAiOutDir() || getLastOutputDir() || getAppSettings().outputDir;
      if (dir && window.__TAURI__?.core?.invoke) {
        try {
          await window.__TAURI__.core.invoke("show_in_folder", { filePath: dir });
        } catch (e) {
          console.warn("Open image output folder error:", e);
        }
      }
    });
  }

  // Open YT-DLP Download Folder in File Explorer
  const btnOpenYtdlpOut = document.getElementById("btn-open-ytdlp-outdir");
  if (btnOpenYtdlpOut) {
    btnOpenYtdlpOut.addEventListener("click", async () => {
      const dir = document.getElementById("ytdlp-output-dir")?.value || getLastYtDlpOutDir() || getLastOutputDir() || getAppSettings().outputDir;
      if (dir && window.__TAURI__?.core?.invoke) {
        try {
          await window.__TAURI__.core.invoke("show_in_folder", { filePath: dir });
        } catch (e) {
          console.warn("Open ytdlp output folder error:", e);
        }
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
        const appSettings = getAppSettings();
        appSettings.outputDir = folder;
        if (setOutDirInput) setOutDirInput.value = folder;
        saveSettings(appSettings);
        saveLastOutputDir(folder);
        updateCommandPreview();
      }
    });
  }

  // Open Settings Output Folder in File Explorer
  const btnOpenSettingsOutDir = document.getElementById("btn-open-settings-outdir");
  if (btnOpenSettingsOutDir) {
    btnOpenSettingsOutDir.addEventListener("click", async () => {
      const dir = document.getElementById("set-output-dir")?.value || getAppSettings().outputDir;
      if (dir && window.__TAURI__?.core?.invoke) {
        try {
          await window.__TAURI__.core.invoke("show_in_folder", { filePath: dir });
        } catch (e) {
          console.warn("Open settings output folder error:", e);
        }
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
    btnExecute.addEventListener("click", handleExecuteClick);
  }

  // Reset Button
  const btnReset = document.getElementById("btn-reset");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      const activeTool = getCurrentActiveTool();
      if (activeTool.startsWith("kit_")) {
        resetActiveKit();
        return;
      }
      if (activeTool === "audio_tags") {
        revertActiveTrack();
        return;
      }

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
      saveActiveModuleState(activeTool);
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
        btnCopy.classList.remove("btn-outline-secondary");
        btnCopy.classList.add("btn-success");
        animateCopyConfirm(btnCopy.querySelector("ion-icon"), { holdMs: 1200 });
        setTimeout(() => {
          btnCopy.classList.remove("btn-success");
          btnCopy.classList.add("btn-outline-secondary");
        }, 1500);
      });
    });
  }

  // Initialize merge controls
  initMergeControls(() => {
    updateAutoOutputFilename(true);
    updateCommandPreview();
  });

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

  // Custom preset dropdown selector
  const customPresetSelect = document.getElementById("custom-preset-select");
  const customArgsInput = document.getElementById("custom-args");
  if (customPresetSelect && customArgsInput) {
    customPresetSelect.addEventListener("change", () => {
      if (customPresetSelect.value) {
        customArgsInput.value = customPresetSelect.value;
        updateCommandPreview();
      }
    });
  }

  // Compress Video dynamic custom MB toggle
  const compPreset = document.getElementById("comp-preset");
  const compCustomWrapper = document.getElementById("comp-custom-wrapper");
  if (compPreset && compCustomWrapper) {
    compPreset.addEventListener("change", () => {
      const isCustom = compPreset.value === "custom";
      compCustomWrapper.classList.toggle("d-none", !isCustom);
      if (isCustom) {
        compCustomWrapper.classList.remove("ui-zoom-in");
        void compCustomWrapper.offsetWidth;
        compCustomWrapper.classList.add("ui-zoom-in");
      }
      updateCommandPreview();
    });
  }

  // Compress Audio dynamic custom MB toggle
  const compAudPreset = document.getElementById("comp-aud-preset");
  const compAudCustomWrapper = document.getElementById("comp-aud-custom-wrapper");
  if (compAudPreset && compAudCustomWrapper) {
    compAudPreset.addEventListener("change", () => {
      const isCustomMb = compAudPreset.value === "custom_mb";
      compAudCustomWrapper.classList.toggle("d-none", !isCustomMb);
      if (isCustomMb) {
        compAudCustomWrapper.classList.remove("ui-zoom-in");
        void compAudCustomWrapper.offsetWidth;
        compAudCustomWrapper.classList.add("ui-zoom-in");
      }
      updateCommandPreview();
    });
  }

  // AI Replace Source toggle
  const aiReplaceSwitch = document.getElementById("ai-replace-source");
  if (aiReplaceSwitch) {
    aiReplaceSwitch.addEventListener("change", () => {
      saveAiReplaceSource(aiReplaceSwitch.checked);
      saveActiveModuleState(getCurrentActiveTool());
      updateCommandPreview();
    });
  }
}
