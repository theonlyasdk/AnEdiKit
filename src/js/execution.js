// AnEdiKit - Command Building, Execution Orchestration, and Form Events Submodule
import { getAppSettings, saveSettingsFromUI } from "./app_settings.js";
import { saveSettings, getLastOutputDir, saveLastOutputDir, getLastImageAiOutDir, saveLastImageAiOutDir, saveAiReplaceSource } from "./storage.js";
import { saveActiveModuleState } from "./module_state.js";
import {
  selectMediaFile,
  selectMediaFiles,
  selectOutputFolder,
  getCurrentInputFile,
  getCurrentMediaInfo,
  syncMediaDurationToTools,
  getBatchQueue,
  clearBatchQueue,
  getImageAiQueue,
  addImageFilesToQueue,
  clearImageAiQueue,
  updateImageAiItemStatus,
  clearAllMediaPreviewCaches,
} from "./media.js";
import { buildCommandForTool } from "./commands.js";
import {
  executeFfmpegJob,
  executeBatchQueue,
  cancelFfmpegJob,
  isJobRunning,
  isCancelRequested,
  resetCancelFlag,
  showBatchFinishedNotification,
} from "./runner.js";
import { getCurrentActiveTool } from "./navigation.js";
import { TOOL_METADATA } from "./tool_metadata.js";
import { resolveExecuteButtonState } from "./execute_state.js";
import { animateCopyConfirm } from "./copy_anim.js";
import { checkToolsBeforeExecution } from "./tools_manager.js";
import { openComparisonModal, setComparisonShimmer } from "./comparison.js";
import { fixYoutubeUrl } from "./ytdlp_url.js";
import { executeActiveKit, resetActiveKit } from "../kits/index.js";
import {
  getAudioTagQueue,
  executeAudioTagsQueue,
  revertActiveTrack,
  isAudioTagsLoading,
} from "./audio_tags.js";
import { syncFormatSpecificUI } from "./format_sync.js";
import { updateEstimatesUI } from "./estimates.js";
import {
  getOutputFilePath,
  setOutputFilePath,
  refreshOutputFilePathDisplay,
  updateAutoOutputFilename,
  checkOutputTargetFileExists,
  getSmartOutputFileName,
  setUserHasCustomOutputName,
} from "./output_path.js";
import {
  getPlaylistVideos,
  isPlaylistFetching,
  getFetchedPlaylistUrl,
  fetchPlaylistVideosHandler,
  initPlaylistControls,
} from "./playlist.js";
import { getMergeFiles, initMergeControls } from "./merge.js";

export function updateExecuteButtonState() {
  // Thin DOM adapter: gather state, delegate branching to the pure
  // resolveExecuteButtonState() in execute_state.js, then apply to the button.
  const btnExecute = document.getElementById("btn-execute");
  const activeTool = getCurrentActiveTool();
  const currentInput = getCurrentInputFile();
  const currentUrl = document.getElementById("ytdlp-url-input")?.value?.trim() || "";

  if (!btnExecute) return;

  const queue = typeof getBatchQueue === "function" ? getBatchQueue() : [];
  const playlistVideos = typeof getPlaylistVideos === "function" ? getPlaylistVideos() : [];
  const imgQueue = typeof getImageAiQueue === "function" ? getImageAiQueue() : [];
  const audioQueue = typeof getAudioTagQueue === "function" ? getAudioTagQueue() : [];
  const cmdInput = document.getElementById("custom-args");

  const state = resolveExecuteButtonState({
    activeTool,
    currentUrl,
    fetchedPlaylistUrl: typeof getFetchedPlaylistUrl === "function" ? getFetchedPlaylistUrl() : "",
    playlistVideos,
    isFetchingPlaylist: typeof isPlaylistFetching === "function" ? isPlaylistFetching() : false,
    jobRunning: typeof isJobRunning === "function" ? isJobRunning() : false,
    batchQueueLen: queue ? queue.length : 0,
    hasInput: !!(currentInput && currentInput.trim().length > 0),
    imgQueueLen: imgQueue ? imgQueue.length : 0,
    audioQueueLen: audioQueue ? audioQueue.length : 0,
    audioLoading: typeof isAudioTagsLoading === "function" ? isAudioTagsLoading() : false,
    mergeFilesLen: typeof getMergeFiles === "function" ? (getMergeFiles() || []).length : 0,
    hasCustomArgs: !!(cmdInput && cmdInput.value.trim().length > 0),
  });

  if (state.mode === "hidden") {
    btnExecute.classList.add("d-none");
    btnExecute.disabled = true;
    return;
  }

  btnExecute.classList.remove("d-none");
  btnExecute.classList.remove("btn-shimmer");

  if (state.mode === "cancel") {
    btnExecute.disabled = false;
    btnExecute.textContent = state.text;
    btnExecute.className = "btn btn-danger btn-sm px-4";
    btnExecute.classList.remove("btn-shimmer");
    return;
  }

  if (state.mode === "loading") {
    btnExecute.textContent = state.text;
    btnExecute.disabled = true;
    btnExecute.className = "btn btn-primary btn-sm px-4";
    btnExecute.setAttribute("title", state.tooltip);
    return;
  }

  btnExecute.textContent = state.text;
  btnExecute.className = "btn btn-primary btn-sm px-4";
  btnExecute.disabled = !state.canExecute;
  if (state.tooltip) btnExecute.setAttribute("title", state.tooltip);
}

export function updateCommandPreview() {
  const activeTool = getCurrentActiveTool();
  const currentInput = getCurrentInputFile();
  const currentUrl = document.getElementById("ytdlp-url-input")?.value?.trim() || "";
  const cmdPreviewEl = document.getElementById("cmd-preview");
  const execFooter = document.getElementById("execution-footer-panel");

  updateExecuteButtonState();

  if (!cmdPreviewEl) return;

  if (activeTool === "settings") {
    if (execFooter) execFooter.classList.add("d-none");
    return;
  }
  if (execFooter) execFooter.classList.remove("d-none");

  const playlistVideos = getPlaylistVideos();
  const selectedIndices = activeTool === "ytdlp_playlist" && playlistVideos.length > 0
    ? playlistVideos.filter((v) => v.checked).map((v) => v.index)
    : null;

  const mergeFiles = getMergeFiles();
  const extraParams = { mergeFiles, url: currentUrl, selectedIndices };
  const appSettings = getAppSettings();

  const cmdObj = buildCommandForTool(
    activeTool,
    currentInput,
    appSettings.outputDir,
    appSettings,
    extraParams,
  );
  cmdPreviewEl.textContent = cmdObj.fullString;
  updateEstimatesUI(activeTool);
  return cmdObj;
}

export async function handleExecuteClick() {
  if (isJobRunning()) {
    cancelFfmpegJob();
    return;
  }

  // Immediately disable button and show shimmer effect on click
  const btnExecute = document.getElementById("btn-execute");
  if (btnExecute && btnExecute.textContent !== "Cancel") {
    btnExecute.disabled = true;
    btnExecute.classList.add("btn-shimmer");
  }

  // Verify required tools are installed before running any task
  const toolsReady = await checkToolsBeforeExecution();
  if (!toolsReady) {
    updateExecuteButtonState();
    return;
  }

  const activeTool = getCurrentActiveTool();
  const appSettings = getAppSettings();

  if (activeTool.startsWith("kit_")) {
    executeActiveKit();
    return;
  }

  const batchQueue = getBatchQueue();
  const isYtDlp = activeTool.startsWith("ytdlp_");
  const currentUrl = document.getElementById("ytdlp-url-input")?.value?.trim() || "";
  const playlistVideos = getPlaylistVideos();
  const fetchedPlaylistUrl = getFetchedPlaylistUrl();

  if (activeTool === "ytdlp_playlist") {
    const isUrlChanged = currentUrl !== fetchedPlaylistUrl;
    if (playlistVideos.length === 0 || isUrlChanged) {
      fetchPlaylistVideosHandler(() => {
        updateExecuteButtonState();
        updateCommandPreview();
      });
      return;
    }
  }

  const isImageTool = [
    "bg_remover",
    "ai_upscaler",
    "vectorizer",
    "restore_denoise",
    "icon_generator",
    "metadata_cleaner",
  ].includes(activeTool);

  if (isImageTool) {
    let imgQueue = getImageAiQueue();
    if (imgQueue.length === 0) {
      const picked = await selectMediaFiles("image");
      if (picked && picked.length > 0) {
        await addImageFilesToQueue(picked);
        imgQueue = getImageAiQueue();
      } else {
        updateExecuteButtonState();
        return;
      }
    }

    // Clear any stale cancellation from a previous run so the
    // isCancelRequested() checks below only fire for this batch.
    resetCancelFlag();

    const isBatch = imgQueue.length > 1;
    const batchStartTime = Date.now();
    let successCount = 0;
    let failCount = 0;
    let lastDestination = "";

    for (let i = 0; i < imgQueue.length; i++) {
      const item = imgQueue[i];

      // Stop the whole batch when the user cancels -- otherwise Cancel
      // only aborts the active item and the loop advances to the next one,
      // forcing one click per queued image.
      if (isCancelRequested()) break;

      // Automatically check and skip non-existent files
      if (window.__TAURI__?.core?.invoke && item.path) {
        try {
          const exists = await window.__TAURI__.core.invoke("check_file_exists", { filePath: item.path });
          if (!exists) {
            updateImageAiItemStatus(i, "skipped");
            continue;
          }
        } catch (e) {
          console.warn("Failed to check image file existence:", e);
        }
      }

      updateImageAiItemStatus(i, "processing");
      const cmdObj = buildCommandForTool(activeTool, item.path, appSettings.outputDir, appSettings);
      if (!cmdObj) {
        if (isCancelRequested()) break;
        continue;
      }
      if (isBatch) {
        cmdObj.suppressNotification = true;
      }
      const success = await executeFfmpegJob(cmdObj, 1.0);
      if (isCancelRequested()) {
        // Leave the interrupted item re-runnable instead of failed.
        updateImageAiItemStatus(i, "pending");
        break;
      }
      if (success) {
        successCount++;
        lastDestination = cmdObj.destination || lastDestination;
        updateImageAiItemStatus(i, "done", cmdObj.destination);
        // Only pop the comparison modal for single-item runs. In
        // multi-item batches the modals would stack and freeze the UI.
        if (imgQueue.length === 1) {
          openComparisonModal(item.path, cmdObj.destination, TOOL_METADATA[activeTool]?.title || "Enhanced Image");
        }
      } else {
        failCount++;
        updateImageAiItemStatus(i, "error");
      }
    }

    if (isBatch && !isCancelRequested() && successCount > 0) {
      const batchElapsedSeconds = batchStartTime > 0 ? ((Date.now() - batchStartTime) / 1000).toFixed(1) : "0.0";
      showBatchFinishedNotification({
        destination: lastDestination || appSettings.outputDir,
        toolName: TOOL_METADATA[activeTool]?.title || "Image AI",
        total: imgQueue.length,
        successCount,
        failCount,
        elapsedSeconds: batchElapsedSeconds,
      });
    }
    return;
  }

  if (activeTool === "audio_tags") {
    await executeAudioTagsQueue(executeFfmpegJob, isCancelRequested, resetCancelFlag);
    return;
  }

  if (!isYtDlp && activeTool !== "merge" && batchQueue.length > 0) {
    executeBatchQueue(batchQueue, activeTool, appSettings, buildCommandForTool);
    return;
  }

  const mergeFiles = getMergeFiles();
  let cmdObj = null;
  if (activeTool === "merge" && document.getElementById("merge-engine")?.value === "concat_demuxer") {
    let concatPath = null;
    if (window.__TAURI__?.core?.invoke && mergeFiles && mergeFiles.length > 0) {
      try {
        // FFmpeg concat demuxer treats backslash as an escape character,
        // so Windows paths must use forward slashes.
        const lines = mergeFiles.map((f) => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
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
  let totalDuration = 0.0;
  if (activeTool === "gif_frames") {
    const gifMode = document.getElementById("gif-mode")?.value || "gif_hq";
    if (gifMode === "snapshot") {
      totalDuration = 1.0;
    } else {
      totalDuration = parseFloat(document.getElementById("gif-dur")?.value) || 5.0;
    }
  } else if (activeTool === "trim") {
    const startStr = document.getElementById("trim-start")?.value || "00:00:00.000";
    const endStr = document.getElementById("trim-end")?.value || "00:01:00.000";
    const parseTs = (t) => {
      const parts = (t || "").split(":");
      if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
      }
      return 0;
    };
    const sSec = parseTs(startStr);
    const eSec = parseTs(endStr);
    totalDuration = Math.max(0.5, eSec - sSec);
  } else {
    totalDuration = cmdObj?.duration || mediaInfo?.duration_seconds || 0.0;
  }

  if (cmdObj) {
    executeFfmpegJob(cmdObj, totalDuration);
  }
}

export function bindFormEvents() {
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

  // Speed multiplier stepper buttons (conjoined -/preset/+ group): nudge
  // the slider by one step and fire input so the generic form pipeline
  // (sync, preview, save, filename) runs exactly as if slid by hand.
  const speedStep = (dir) => {
    const sl = document.getElementById("speed-preset");
    if (!sl) return;
    const step = parseFloat(sl.step) || 0.25;
    let v = (parseFloat(sl.value) || 2) + dir * step;
    v = Math.round(v * 100) / 100;
    const min = parseFloat(sl.min);
    const max = parseFloat(sl.max);
    if (Number.isFinite(min)) v = Math.max(min, v);
    if (Number.isFinite(max)) v = Math.min(max, v);
    sl.value = String(v);
    sl.dispatchEvent(new Event("input", { bubbles: true }));
  };
  document.getElementById("speed-step-down")?.addEventListener("click", () => speedStep(-1));
  document.getElementById("speed-step-up")?.addEventListener("click", () => speedStep(1));

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
        const { saveLastYtDlpOutDir } = await import("./storage.js");
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
