// AnEditKit - Modular Application Entry Point
import { loadSettings, saveSettings, getLastYtDlpOutDir, saveLastYtDlpOutDir } from "./js/storage.js";
import {
  selectMediaFile,
  selectMediaFiles,
  selectOutputFolder,
  initDragAndDrop,
  getCurrentInputFile,
  getCurrentMediaInfo,
  probeMedia,
  getBatchQueue,
  clearBatchQueue,
  moveBatchItemUp,
  moveBatchItemDown,
  initTrimmerControls,
  initSavedBatchQueue,
  syncMediaDurationToTools,
  syncVideoPreviewForActiveTool,
} from "./js/media.js";
import { buildCommandForTool } from "./js/commands.js";
import {
  executeFfmpegJob,
  executeBatchQueue,
  cancelFfmpegJob,
  isJobRunning,
  initJobRunner,
} from "./js/runner.js";
import { initNavigation, getCurrentActiveTool } from "./js/navigation.js";
import { initToolsManager } from "./js/tools_manager.js";
import { initThemeManager } from "./js/theme.js";

let appSettings = loadSettings();
let mergeFiles = [];
let userHasCustomOutputName = false;

let playlistVideos = [];
let isFetchingPlaylist = false;
let fetchedPlaylistUrl = "";

export function renderPlaylistEntries() {
  const container = document.getElementById("playlist-entries-panel");
  const list = document.getElementById("playlist-entries-list");
  const selectedCountEl = document.getElementById("playlist-selected-count");
  const totalCountEl = document.getElementById("playlist-total-count");
  const toggleAllBtn = document.getElementById("btn-playlist-toggle-all");
  const sortSelect = document.getElementById("playlist-sort-select");

  if (!container || !list) return;

  if (playlistVideos.length === 0) {
    container.classList.add("d-none");
    list.innerHTML = "";
    return;
  }

  container.classList.remove("d-none");

  const sortMode = sortSelect ? sortSelect.value : "original";
  const sorted = [...playlistVideos].sort((a, b) => {
    if (sortMode === "title_asc") return a.title.localeCompare(b.title);
    if (sortMode === "title_desc") return b.title.localeCompare(a.title);
    if (sortMode === "dur_asc") return (a.duration || 0) - (b.duration || 0);
    if (sortMode === "dur_desc") return (b.duration || 0) - (a.duration || 0);
    return a.index - b.index;
  });

  const selectedCount = playlistVideos.filter((v) => v.checked).length;
  if (selectedCountEl) selectedCountEl.textContent = selectedCount;
  if (totalCountEl) totalCountEl.textContent = playlistVideos.length;
  if (toggleAllBtn) {
    toggleAllBtn.textContent = selectedCount === playlistVideos.length ? "Deselect All" : "Select All";
  }

  list.innerHTML = sorted
    .map(
      (item) => `
    <label class="list-group-item d-flex align-items-center gap-3 py-2 text-start" style="cursor: pointer;">
      <input class="form-check-input flex-shrink-0 mt-0 playlist-item-check" type="checkbox" data-index="${item.index}" ${item.checked ? "checked" : ""} />
      <div class="flex-grow-1 text-truncate">
        <div class="d-flex align-items-center justify-content-between gap-2">
          <div class="fw-medium text-body text-truncate mb-0" title="${item.title}">${item.index}. ${item.title}</div>
          ${item.duration_string ? `<span class="badge text-bg-secondary flex-shrink-0 font-monospace">${item.duration_string}</span>` : ""}
        </div>
        <div class="text-body-secondary small text-truncate" style="font-size: 0.75rem;">${item.url}</div>
      </div>
    </label>
  `,
    )
    .join("");

  list.querySelectorAll(".playlist-item-check").forEach((chk) => {
    chk.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      const target = playlistVideos.find((v) => v.index === idx);
      if (target) {
        target.checked = e.target.checked;
      }
      const selCount = playlistVideos.filter((v) => v.checked).length;
      if (selectedCountEl) selectedCountEl.textContent = selCount;
      if (toggleAllBtn) {
        toggleAllBtn.textContent = selCount === playlistVideos.length ? "Deselect All" : "Select All";
      }
      updateExecuteButtonState();
      updateCommandPreview();
    });
  });
}

async function fetchPlaylistVideosHandler() {
  const urlInput = document.getElementById("ytdlp-url-input");
  const url = urlInput?.value?.trim();
  if (!url) return;

  isFetchingPlaylist = true;
  updateExecuteButtonState();

  const statusMsg = document.getElementById("status-message");
  if (statusMsg) statusMsg.textContent = "Fetching playlist items...";

  try {
    if (window.__TAURI__?.core?.invoke) {
      const results = await window.__TAURI__.core.invoke("fetch_playlist_videos", { url });
      if (results && results.length > 0) {
        playlistVideos = results.map((v) => ({ ...v, checked: true }));
        fetchedPlaylistUrl = url;
        renderPlaylistEntries();
        if (statusMsg) statusMsg.textContent = `Found ${results.length} videos in playlist`;
      } else {
        if (statusMsg) statusMsg.textContent = "No videos found in playlist";
      }
    } else {
      // Mock for web preview
      playlistVideos = Array.from({ length: 8 }, (_, i) => ({
        index: i + 1,
        id: `vid_${i + 1}`,
        title: `Video Item ${i + 1}: Sample Video Title for Download`,
        url: `https://www.youtube.com/watch?v=sample_${i + 1}`,
        duration: (i + 1) * 150,
        duration_string: `0${i + 2}:30`,
        checked: true,
      }));
      fetchedPlaylistUrl = url;
      renderPlaylistEntries();
      if (statusMsg) statusMsg.textContent = `Found 8 videos in playlist`;
    }
  } catch (err) {
    console.warn("fetch_playlist_videos error:", err);
    if (statusMsg) statusMsg.textContent = `Fetch error: ${err}`;
  } finally {
    isFetchingPlaylist = false;
    updateExecuteButtonState();
    updateCommandPreview();
  }
}

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
    case "compress_audio": {
      const fmt = document.getElementById("comp-aud-format")?.value || "opus";
      return `${baseName}_compressed.${fmt}`;
    }
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
    case "custom": {
      const ext = document.getElementById("custom-ext")?.value || "mp4";
      return `${baseName}_custom.${ext}`;
    }
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

export function updateExecuteButtonState() {
  const btnExecute = document.getElementById("btn-execute");
  const activeTool = getCurrentActiveTool();
  const currentInput = getCurrentInputFile();
  const currentUrl = document.getElementById("ytdlp-url-input")?.value?.trim() || "";

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

  const queue = getBatchQueue();
  let canExecute = false;

  if (activeTool === "ytdlp_playlist") {
    const isUrlChanged = currentUrl !== fetchedPlaylistUrl;
    if (playlistVideos.length === 0 || isUrlChanged) {
      btnExecute.textContent = isFetchingPlaylist ? "Fetching..." : "Fetch Playlist";
      canExecute = currentUrl.length > 0 && !isFetchingPlaylist;
    } else {
      const selectedCount = playlistVideos.filter((v) => v.checked).length;
      btnExecute.textContent = `Download (${selectedCount})`;
      canExecute = selectedCount > 0;
    }
  } else if (activeTool.startsWith("ytdlp_")) {
    btnExecute.textContent = "Download";
    canExecute = currentUrl.length > 0;
  } else if (queue && queue.length > 1 && activeTool !== "merge" && activeTool !== "settings") {
    btnExecute.textContent = `Execute (${queue.length})`;
    canExecute = !!(currentInput && currentInput.trim().length > 0);
  } else {
    btnExecute.textContent = "Execute";
    if (activeTool === "merge") {
      canExecute = mergeFiles && mergeFiles.length >= 2;
    } else if (activeTool === "custom") {
      const cmdInput = document.getElementById("custom-args");
      canExecute = !!(cmdInput && cmdInput.value.trim().length > 0);
    } else {
      canExecute = !!(currentInput && currentInput.trim().length > 0);
    }
  }

  btnExecute.className = "btn btn-primary btn-sm px-4";
  btnExecute.disabled = !canExecute;

  if (!canExecute) {
    btnExecute.setAttribute(
      "title",
      activeTool === "ytdlp_playlist"
        ? (playlistVideos.length > 0 ? "Select at least 1 video to download" : "Enter a playlist URL to fetch")
        : activeTool.startsWith("ytdlp_")
          ? "Enter a valid media URL to download"
          : activeTool === "merge"
            ? "Add at least 2 files to merge"
            : activeTool === "custom"
              ? "Enter custom arguments to execute"
              : "Select a file to execute operation",
    );
  } else {
    btnExecute.setAttribute(
      "title",
      activeTool === "ytdlp_playlist"
        ? (playlistVideos.length > 0 ? "Download selected playlist videos" : "Fetch videos from playlist URL")
        : activeTool.startsWith("ytdlp_") ? "Start download task" : "Run processing operation",
    );
  }
}

function updateCommandPreview() {
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

  const selectedIndices = activeTool === "ytdlp_playlist" && playlistVideos.length > 0
    ? playlistVideos.filter((v) => v.checked).map((v) => v.index)
    : null;

  const cmdObj = buildCommandForTool(
    activeTool,
    currentInput,
    appSettings.outputDir,
    appSettings,
    { mergeFiles, url: currentUrl, selectedIndices },
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
      if (e.target.id === "cvt-container" || e.target.id === "aud-format" || e.target.id === "comp-aud-format" || e.target.id === "gif-mode" || e.target.id === "merge-format") {
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
      if (e.target.id === "cvt-container" || e.target.id === "aud-format" || e.target.id === "comp-aud-format" || e.target.id === "gif-mode" || e.target.id === "merge-format") {
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
      const filterMode = (activeTool === "extract_audio" || activeTool === "compress_audio") ? "audio" : "all";
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
    const filterMode = (activeTool === "extract_audio" || activeTool === "compress_audio") ? "audio" : "all";
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

  // URL Paste, Clear & Download Output Folder
  const btnPasteUrl = document.getElementById("btn-paste-url");
  const btnClearUrl = document.getElementById("btn-clear-url");
  const ytdlpUrlInput = document.getElementById("ytdlp-url-input");
  const btnBrowseYtdlpOut = document.getElementById("btn-browse-ytdlp-outdir");
  const ytdlpOutInput = document.getElementById("ytdlp-output-dir");

  if (btnPasteUrl && ytdlpUrlInput) {
    btnPasteUrl.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          ytdlpUrlInput.value = text.trim();
          updateCommandPreview();
        }
      } catch (err) {
        console.warn("Clipboard paste error:", err);
      }
    });
  }

  // Brand Logo Credits Dialog & GitHub link
  const brandLogoTitle = document.getElementById("brand-logo-title");
  if (brandLogoTitle) {
    brandLogoTitle.addEventListener("click", (e) => {
      e.stopPropagation();
      const modalEl = document.getElementById("credits-modal");
      if (modalEl && window.bootstrap?.Modal) {
        window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }
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

  if (btnClearUrl && ytdlpUrlInput) {
    btnClearUrl.addEventListener("click", () => {
      ytdlpUrlInput.value = "";
      playlistVideos = [];
      fetchedPlaylistUrl = "";
      const panel = document.getElementById("playlist-entries-panel");
      if (panel) panel.classList.add("d-none");
      updateCommandPreview();
    });
  }

  if (ytdlpUrlInput) {
    ytdlpUrlInput.addEventListener("input", () => {
      const currentUrl = ytdlpUrlInput.value.trim();
      if (currentUrl !== fetchedPlaylistUrl) {
        playlistVideos = [];
        fetchedPlaylistUrl = "";
        const panel = document.getElementById("playlist-entries-panel");
        if (panel) panel.classList.add("d-none");
      }
      updateCommandPreview();
    });
  }

  // Playlist sorting & toggle all selection
  const sortSelect = document.getElementById("playlist-sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      renderPlaylistEntries();
    });
  }

  const toggleAllBtn = document.getElementById("btn-playlist-toggle-all");
  if (toggleAllBtn) {
    toggleAllBtn.addEventListener("click", () => {
      const allChecked = playlistVideos.length > 0 && playlistVideos.every((v) => v.checked);
      playlistVideos.forEach((v) => (v.checked = !allChecked));
      renderPlaylistEntries();
      updateExecuteButtonState();
      updateCommandPreview();
    });
  }

  if (btnBrowseYtdlpOut) {
    btnBrowseYtdlpOut.addEventListener("click", async () => {
      const folder = await selectOutputFolder();
      if (folder) {
        if (ytdlpOutInput) ytdlpOutInput.value = folder;
        saveLastYtDlpOutDir(folder);
        updateCommandPreview();
      }
    });
  }

  // Clear Media Input
  const btnClearInput = document.getElementById("btn-clear-input");
  if (btnClearInput) {
    btnClearInput.addEventListener("click", async () => {
      await clearBatchQueue();
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
        const batchQueue = getBatchQueue();
        const isYtDlp = activeTool.startsWith("ytdlp_");
        const currentUrl = document.getElementById("ytdlp-url-input")?.value?.trim() || "";

        if (activeTool === "ytdlp_playlist") {
          const isUrlChanged = currentUrl !== fetchedPlaylistUrl;
          if (playlistVideos.length === 0 || isUrlChanged) {
            fetchPlaylistVideosHandler();
            return;
          }
        }

        if (!isYtDlp && activeTool !== "merge" && batchQueue.length > 0) {
          executeBatchQueue(batchQueue, activeTool, appSettings, buildCommandForTool);
          return;
        }

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
        btnCopy.innerHTML = '<i class="bi bi-check2"></i>';
        btnCopy.classList.remove("btn-outline-secondary");
        btnCopy.classList.add("btn-success");
        setTimeout(() => {
          btnCopy.innerHTML = '<i class="bi bi-copy"></i>';
          btnCopy.classList.remove("btn-success");
          btnCopy.classList.add("btn-outline-secondary");
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
  const setDisableAnim = document.getElementById("set-disable-animations");
  const setHw = document.getElementById("set-hwaccel");
  const setThr = document.getElementById("set-threads");
  const setDefVc = document.getElementById("set-def-vcodec");
  const setDefSp = document.getElementById("set-def-speed");
  const setDefAf = document.getElementById("set-def-aformat");
  const setDefAb = document.getElementById("set-def-abitrate");

  const setYtCookies = document.getElementById("set-ytdlp-cookies");
  const setYtRate = document.getElementById("set-ytdlp-ratelimit");
  const setYtSponsor = document.getElementById("set-ytdlp-sponsorblock");
  const setYtGeo = document.getElementById("set-ytdlp-geo-bypass");
  const setYtCustom = document.getElementById("set-ytdlp-custom-args");

  if (setOutDir) setOutDir.value = appSettings.outputDir || "C:\\Users\\User\\Videos";
  if (setPromptOver) setPromptOver.checked = !!appSettings.promptOverwrite;
  if (setDisableAnim) setDisableAnim.checked = !!appSettings.disableAnimations;
  if (setHw) setHw.value = appSettings.hwAccel || "auto";
  if (setThr) setThr.value = appSettings.threads || "0";
  if (setDefVc) setDefVc.value = appSettings.defVCodec || "libx264";
  if (setDefSp) setDefSp.value = appSettings.defSpeed || "medium";
  if (setDefAf) setDefAf.value = appSettings.defAFmt || "mp3";
  if (setDefAb) setDefAb.value = appSettings.defABitrate || "256k";

  if (setYtCookies) setYtCookies.value = appSettings.ytdlpCookies || "none";
  if (setYtRate) setYtRate.value = appSettings.ytdlpRateLimit || "none";
  if (setYtSponsor) setYtSponsor.checked = !!appSettings.ytdlpSponsorblock;
  if (setYtGeo) setYtGeo.checked = appSettings.ytdlpGeoBypass !== false;
  if (setYtCustom) setYtCustom.value = appSettings.ytdlpCustomArgs || "";
}

function syncSettingsFromUI() {
  const setOutDir = document.getElementById("set-output-dir");
  const setPromptOver = document.getElementById("set-prompt-overwrite");
  const setDisableAnim = document.getElementById("set-disable-animations");
  const setHw = document.getElementById("set-hwaccel");
  const setThr = document.getElementById("set-threads");
  const setDefVc = document.getElementById("set-def-vcodec");
  const setDefSp = document.getElementById("set-def-speed");
  const setDefAf = document.getElementById("set-def-aformat");
  const setDefAb = document.getElementById("set-def-abitrate");

  const setYtCookies = document.getElementById("set-ytdlp-cookies");
  const setYtRate = document.getElementById("set-ytdlp-ratelimit");
  const setYtSponsor = document.getElementById("set-ytdlp-sponsorblock");
  const setYtGeo = document.getElementById("set-ytdlp-geo-bypass");
  const setYtCustom = document.getElementById("set-ytdlp-custom-args");

  if (setOutDir) appSettings.outputDir = setOutDir.value;
  if (setPromptOver) appSettings.promptOverwrite = setPromptOver.checked;
  if (setDisableAnim) appSettings.disableAnimations = setDisableAnim.checked;
  if (setHw) appSettings.hwAccel = setHw.value;
  if (setThr) appSettings.threads = setThr.value;
  if (setDefVc) appSettings.defVCodec = setDefVc.value;
  if (setDefSp) appSettings.defSpeed = setDefSp.value;
  if (setDefAf) appSettings.defAFmt = setDefAf.value;
  if (setDefAb) appSettings.defABitrate = setDefAb.value;

  if (setYtCookies) appSettings.ytdlpCookies = setYtCookies.value;
  if (setYtRate) appSettings.ytdlpRateLimit = setYtRate.value;
  if (setYtSponsor) appSettings.ytdlpSponsorblock = setYtSponsor.checked;
  if (setYtGeo) appSettings.ytdlpGeoBypass = setYtGeo.checked;
  if (setYtCustom) appSettings.ytdlpCustomArgs = setYtCustom.value;

  saveSettings(appSettings);
}

// App Initialization
document.addEventListener("DOMContentLoaded", () => {
  initThemeManager();
  populateSettingsUI();

  const ytdlpOutInput = document.getElementById("ytdlp-output-dir");
  if (ytdlpOutInput) {
    ytdlpOutInput.value = getLastYtDlpOutDir() || appSettings.outputDir || "C:\\Users\\User\\Downloads";
  }

  initToolsManager();
  initJobRunner();
  initTrimmerControls();
  initSavedBatchQueue();
  initDragAndDrop((mediaInfo) => {
    if (mediaInfo) {
      syncMediaDurationToTools(mediaInfo);
      syncVideoPreviewForActiveTool(getCurrentActiveTool());
    }
    updateAutoOutputFilename(true);
    updateCommandPreview();
  });
  bindFormEvents();
  initNavigation((toolId) => {
    const mediaInfo = getCurrentMediaInfo();
    if (mediaInfo) {
      syncMediaDurationToTools(mediaInfo);
      syncVideoPreviewForActiveTool(toolId);
    }
    const playlistPanel = document.getElementById("playlist-entries-panel");
    if (playlistPanel) {
      if (toolId === "ytdlp_playlist" && playlistVideos.length > 0) {
        playlistPanel.classList.remove("d-none");
      } else {
        playlistPanel.classList.add("d-none");
      }
    }
    updateAutoOutputFilename();
    updateCommandPreview();
  });
  updateAutoOutputFilename();
  updateCommandPreview();
});
