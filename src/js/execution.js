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
  clearAllMediaPreviewCaches,
} from "./media.js";
import {
  getImageAiQueue,
  addImageFilesToQueue,
  clearImageAiQueue,
  updateImageAiItemStatus,
} from "./image_queue.js";
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
import { getCurrentActiveTool } from "./active_tool.js";
import { TOOL_METADATA } from "./tool_metadata.js";
import { resolveExecuteButtonState } from "./execute_state.js";
import { animateCopyConfirm } from "./copy_anim.js";
import { checkToolsBeforeExecution } from "./tools_manager.js";
import { openComparisonModal, setComparisonShimmer } from "./comparison.js";
import { fixYoutubeUrl, isPlaylistOrAlbumUrl } from "./ytdlp_url.js";
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
  cmdPreviewEl.textContent = cmdObj?.fullString ?? "";
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

  if (activeTool === "ytdlp_audio" && isPlaylistOrAlbumUrl(currentUrl)) {
    updateExecuteButtonState();
    const modalEl = document.getElementById("playlist-album-warning-modal");
    if (modalEl && window.bootstrap?.Modal) {
      const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      const btnConfirmSwitch = document.getElementById("btn-confirm-playlist-switch");
      if (btnConfirmSwitch) {
        btnConfirmSwitch.onclick = () => {
          modal.hide();
          const playlistNavBtn = document.querySelector("#ytdlp-nav [data-tool='ytdlp_playlist'], [data-tool='ytdlp_playlist']");
          if (playlistNavBtn) {
            playlistNavBtn.click();
          }
        };
      }
      modal.show();
      return;
    }
    // Fallback if modal is unavailable:
    const warningEl = document.getElementById("ytdlp-playlist-detected-warning");
    if (warningEl) {
      warningEl.classList.remove("d-none");
    }
    return;
  }

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
