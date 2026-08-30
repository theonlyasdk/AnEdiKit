// AnEdiKit - Modular Application Entry Point
import { loadSettings, saveSettings, getLastYtDlpOutDir, saveLastYtDlpOutDir, getLastImageAiOutDir, saveLastImageAiOutDir, saveAiReplaceSource } from "./js/storage.js";
import {
  selectMediaFile,
  selectMediaFiles,
  selectOutputFolder,
  initDragAndDrop,
  getCurrentInputFile,
  getCurrentMediaInfo,
  probeMedia,
  onMediaChange,
  getBatchQueue,
  clearBatchQueue,
  moveBatchItemUp,
  moveBatchItemDown,
  initTrimmerControls,
  initSavedBatchQueue,
  initSavedImageAiQueue,
  syncMediaDurationToTools,
  syncVideoPreviewForActiveTool,
  getImageAiQueue,
  addImageFilesToQueue,
  clearImageAiQueue,
  updateImageAiItemStatus,
  renderImageAiQueueUI,
  initImageLightbox,
  clearAllMediaPreviewCaches,
} from "./js/media.js";
import { buildCommandForTool, setDetectedHardware } from "./js/commands.js";
import {
  executeFfmpegJob,
  executeBatchQueue,
  cancelFfmpegJob,
  isJobRunning,
  initJobRunner,
} from "./js/runner.js";
import { initNavigation, getCurrentActiveTool, TOOL_METADATA } from "./js/navigation.js";
import { initToolsManager } from "./js/tools_manager.js";
import { initThemeManager } from "./js/theme.js";
import { initComparisonModal, openComparisonModal, setComparisonShimmer } from "./js/comparison.js";
import { initYtDlpFormatEditor } from "./js/ytdlp_format.js";
import { initKitsManager, executeActiveKit, resetActiveKit } from "./js/kits.js";

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
  const rawInput = inputFile || "output.mp4";
  const baseName =
    rawInput
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
      const ext = (rawInput.split(".").pop() || "mp4").toLowerCase();
      return `${baseName}_trimmed.${ext}`;
    }
    case "speed_motion": {
      const container = document.getElementById("speed-container")?.value || "mp4";
      const preset = document.getElementById("speed-preset")?.value || "2.0";
      const sp = preset === "custom" ? (document.getElementById("speed-custom-val")?.value || "2.0") : preset;
      return `${baseName}_${sp}x.${container}`;
    }
    case "aspect_crop": {
      const container = document.getElementById("crop-container")?.value || "mp4";
      const ratio = (document.getElementById("crop-ratio")?.value || "9:16").replace(":", "x");
      return `${baseName}_${ratio}.${container}`;
    }
    case "stabilize": {
      const container = document.getElementById("stab-container")?.value || "mp4";
      return `${baseName}_stabilized.${container}`;
    }
    case "normalize": {
      const videoMode = document.getElementById("norm-video-mode")?.value || "copy";
      const acodec = document.getElementById("norm-acodec")?.value || "aac";
      let ext = "mp4";
      if (videoMode === "strip") {
        ext = acodec === "libmp3lame" ? "mp3" : acodec === "libopus" ? "opus" : acodec === "flac" ? "flac" : acodec === "pcm_s16le" ? "wav" : "m4a";
      }
      return `${baseName}_normalized.${ext}`;
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
    case "bg_remover":
      return `${baseName}_nobg.png`;
    case "ai_upscaler": {
      const s = document.getElementById("upscale-factor")?.value || "2";
      return `${baseName}_${s}x_upscaled.png`;
    }
    case "vectorizer":
      return `${baseName}_vector.svg`;
    case "restore_denoise":
      return `${baseName}_restored.${ext}`;
    case "icon_generator":
      return `${baseName}_icons`;
    case "metadata_cleaner": {
      const fmt = document.getElementById("meta-out-format")?.value || "original";
      const targetExt = fmt === "original" ? ext : fmt;
      return `${baseName}_clean.${targetExt}`;
    }
    default:
      return `${baseName}_out.mp4`;
  }
}

export function truncateMiddlePath(fullPath, maxChars = 50) {
  if (!fullPath || typeof fullPath !== "string") return "";
  if (fullPath.length <= maxChars) return fullPath;

  const isWindows = fullPath.includes("\\") || /^[a-zA-Z]:/.test(fullPath);
  const sep = isWindows ? "\\" : "/";
  const parts = fullPath.split(/[/\\]/).filter(Boolean);

  if (parts.length <= 1) {
    const keep = Math.max(4, Math.floor((maxChars - 1) / 2));
    return `${fullPath.slice(0, keep)}…${fullPath.slice(-keep)}`;
  }

  const filename = parts[parts.length - 1];
  const driveOrRoot = isWindows && /^[a-zA-Z]:/.test(fullPath)
    ? `${parts[0]}${sep}`
    : fullPath.startsWith("/")
      ? `/${parts[0]}`
      : parts[0];

  const minNeeded = driveOrRoot.length + filename.length + 3;
  if (minNeeded > maxChars) {
    const availForFilename = Math.max(10, maxChars - driveOrRoot.length - 4);
    const truncFilename =
      filename.length > availForFilename
        ? `…${filename.slice(-availForFilename)}`
        : filename;
    const prefix = driveOrRoot.endsWith(sep) ? driveOrRoot : `${driveOrRoot}${sep}`;
    return `${prefix}…${sep}${truncFilename}`;
  }

  const leftSegments = [parts[0]];
  const rightSegments = [filename];
  let leftIdx = 1;
  let rightIdx = parts.length - 2;
  let currentLen = driveOrRoot.length + filename.length + 3;

  while (leftIdx <= rightIdx) {
    const rightPart = parts[rightIdx];
    if (currentLen + rightPart.length + 1 <= maxChars) {
      rightSegments.unshift(rightPart);
      currentLen += rightPart.length + 1;
      rightIdx--;
    } else {
      break;
    }

    if (leftIdx <= rightIdx) {
      const leftPart = parts[leftIdx];
      if (currentLen + leftPart.length + 1 <= maxChars) {
        leftSegments.push(leftPart);
        currentLen += leftPart.length + 1;
        leftIdx++;
      } else {
        break;
      }
    }
  }

  const leftPath = isWindows && /^[a-zA-Z]:/.test(fullPath)
    ? (leftSegments.length === 1 ? `${leftSegments[0]}${sep}` : leftSegments.join(sep))
    : (fullPath.startsWith("/") ? `/${leftSegments.join(sep)}` : leftSegments.join(sep));

  const rightPath = rightSegments.join(sep);
  const leftClean = leftPath.endsWith(sep) ? leftPath : `${leftPath}${sep}`;
  return `${leftClean}…${sep}${rightPath}`;
}

export function getAvailablePathChars(inputEl) {
  if (!inputEl) return 50;
  const width = inputEl.clientWidth || 300;
  const avail = Math.floor((width - 30) / 7.5);
  return Math.max(25, avail);
}

export async function checkOutputTargetFileExists() {
  const outputInput = document.getElementById("output-file-name");
  const warningEl = document.getElementById("output-file-exists-warning");
  const browseBtn = document.getElementById("btn-browse-output-dir");
  if (!outputInput || !warningEl) return;

  const targetPath = getOutputFilePath().trim();
  if (!targetPath || !targetPath.includes(".")) {
    warningEl.classList.add("d-none");
    outputInput.classList.remove("border-warning");
    if (browseBtn) {
      browseBtn.classList.remove("btn-warning", "text-dark");
      browseBtn.classList.add("btn-outline-secondary");
    }
    return;
  }

  let exists = false;
  if (window.__TAURI__?.core?.invoke) {
    try {
      exists = await window.__TAURI__.core.invoke("check_file_exists", { filePath: targetPath });
    } catch (e) {
      console.warn("check_file_exists error:", e);
    }
  }

  if (exists) {
    warningEl.classList.remove("d-none");
    outputInput.classList.add("border-warning");
    if (browseBtn) {
      browseBtn.classList.remove("btn-outline-secondary");
      browseBtn.classList.add("btn-warning", "text-dark");
    }
  } else {
    warningEl.classList.add("d-none");
    outputInput.classList.remove("border-warning");
    if (browseBtn) {
      browseBtn.classList.remove("btn-warning", "text-dark");
      browseBtn.classList.add("btn-outline-secondary");
    }
  }
}

export function setOutputFilePath(fullPath) {
  const outputInput = document.getElementById("output-file-name");
  if (!outputInput) return;
  outputInput.dataset.fullPath = fullPath;
  outputInput.title = fullPath;

  if (document.activeElement === outputInput) {
    outputInput.value = fullPath;
  } else {
    const maxChars = getAvailablePathChars(outputInput);
    outputInput.value = truncateMiddlePath(fullPath, maxChars);
  }

  checkOutputTargetFileExists();
}

export function getOutputFilePath() {
  const outputInput = document.getElementById("output-file-name");
  if (!outputInput) return "";
  return outputInput.dataset.fullPath || outputInput.value || "";
}

export function refreshOutputFilePathDisplay() {
  const outputInput = document.getElementById("output-file-name");
  if (!outputInput || document.activeElement === outputInput) return;
  const fullPath = outputInput.dataset.fullPath || outputInput.value;
  if (fullPath) {
    const maxChars = getAvailablePathChars(outputInput);
    outputInput.value = truncateMiddlePath(fullPath, maxChars);
  }
}

export function updateAutoOutputFilename(force = false) {
  const outputNameInput = document.getElementById("output-file-name");
  if (!outputNameInput) return;

  const currentInput = getCurrentInputFile();
  const activeTool = getCurrentActiveTool();

  if (force || !userHasCustomOutputName || !getOutputFilePath().trim()) {
    const smartName = getSmartOutputFileName(currentInput, activeTool);
    const settings = appSettings || loadSettings();
    let outDir = settings.outputDir || "C:\\Users\\User\\Videos";
    if (currentInput) {
      const lastSlash = Math.max(currentInput.lastIndexOf("\\"), currentInput.lastIndexOf("/"));
      if (lastSlash > 0) {
        outDir = currentInput.substring(0, lastSlash);
      }
    }
    const isWindows = outDir.includes("\\") || /^[a-zA-Z]:/.test(outDir);
    const sep = isWindows ? "\\" : "/";
    const fullPath = `${outDir.replace(/[/\\]+$/, "")}${sep}${smartName}`;

    setOutputFilePath(fullPath);
    if (force) userHasCustomOutputName = false;
  }
  checkOutputTargetFileExists();
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
  } else if (activeTool.startsWith("kit_")) {
    btnExecute.textContent = "Execute Kit";
    canExecute = true;
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
      activeTool.startsWith("kit_")
        ? "Execute current User Kit"
        : activeTool === "ytdlp_playlist"
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
  updateEstimatesUI();
  return cmdObj;
}

export function updateEstimatesUI() {
  const mediaInfo = getCurrentMediaInfo();
  const durSec = mediaInfo?.duration_seconds > 0 ? mediaInfo.duration_seconds : 120.0;
  const srcSizeMb = mediaInfo?.file_size_mb > 0 ? mediaInfo.file_size_mb : 42.5;
  const srcBitrateKbps = mediaInfo?.bitrate_kbps > 0
    ? mediaInfo.bitrate_kbps
    : Math.round((srcSizeMb * 8192) / durSec);

  // Extract source dimensions
  let srcW = 1920;
  let srcH = 1080;
  if (mediaInfo?.resolution && mediaInfo.resolution.includes("x")) {
    const [w, h] = mediaInfo.resolution.split("x").map((v) => parseInt(v, 10));
    if (w > 0 && h > 0) {
      srcW = w;
      srcH = h;
    }
  }
  const srcPixels = srcW * srcH;

  // Helper to format MB / GB / KB nicely
  const formatSize = (mb) => {
    if (isNaN(mb) || mb <= 0) return "~0.1 MB";
    if (mb >= 1024) return `~${(mb / 1024).toFixed(2)} GB`;
    if (mb < 0.1) return `~${Math.round(mb * 1024)} KB`;
    return `~${mb.toFixed(1)} MB`;
  };

  // 1. Convert Video Estimate
  const cvtTarget = document.getElementById("cvt-est-target");
  const cvtVbitrate = document.getElementById("cvt-est-vbitrate");
  const cvtSize = document.getElementById("cvt-est-size");
  if (cvtTarget && cvtVbitrate && cvtSize) {
    const container = document.getElementById("cvt-container")?.value || "mp4";
    const vcodec = document.getElementById("cvt-vcodec")?.value || "libx264";
    const acodec = document.getElementById("cvt-acodec")?.value || "aac";
    const crf = parseInt(document.getElementById("cvt-crf")?.value || "23", 10);
    const scale = document.getElementById("cvt-scale")?.value || "original";

    let targetW = srcW;
    let targetH = srcH;
    if (scale !== "original" && scale.includes(":")) {
      const [sw, sh] = scale.split(":").map((v) => parseInt(v, 10));
      if (sw > 0 && sh > 0) {
        targetW = sw;
        targetH = sh;
      }
    }
    const targetPixels = targetW * targetH;
    const pixelRatio = targetPixels / srcPixels;

    if (container === "gif") {
      const gifFps = parseInt(document.getElementById("cvt-gif-fps")?.value || "15", 10);
      const quality = document.getElementById("cvt-gif-quality")?.value || "palette_diff";
      cvtTarget.textContent = `Animated GIF (${gifFps} FPS)`;
      cvtVbitrate.textContent = `PaletteGen (${quality === "palette_bayer" ? "Bayer" : "Floyd-Steinberg"})`;
      // PaletteGen GIF: ~0.20-0.28 bytes per pixel per frame depending on dithering
      const bytesPerPx = quality === "palette_bayer" ? 0.19 : 0.25;
      const totalBytes = durSec * gifFps * targetW * targetH * bytesPerPx;
      const estMb = totalBytes / (1024 * 1024);
      cvtSize.textContent = formatSize(estMb);
    } else if (container === "webp") {
      const webpFps = parseInt(document.getElementById("cvt-webp-fps")?.value || "24", 10);
      const webpQuality = parseInt(document.getElementById("cvt-webp-quality")?.value || "75", 10);
      cvtTarget.textContent = `Animated WebP (${webpFps} FPS, Q${webpQuality})`;
      // WebP compression efficiency
      const bpp = (webpQuality / 100) * 0.042;
      const estVBitrateKbps = Math.round((targetPixels * webpFps * bpp) / 1000);
      cvtVbitrate.textContent = `~${estVBitrateKbps.toLocaleString()} kbps`;
      const estMb = ((estVBitrateKbps * 1000 / 8) * durSec) / (1024 * 1024);
      cvtSize.textContent = formatSize(estMb);
    } else {
      let targetVBitrateKbps = 2500;
      let targetABitrateKbps = 192;
      let containerOverhead = 1.015; // 1.5% for MP4/MOV, 1% MKV, 2.5% AVI

      if (container === "mkv" || container === "webm") containerOverhead = 1.01;
      else if (container === "avi") containerOverhead = 1.025;
      else if (container === "mov") containerOverhead = 1.018;

      // Audio stream bitrate
      if (acodec === "copy") {
        targetABitrateKbps = Math.min(320, Math.max(96, Math.round(srcBitrateKbps * 0.08)));
      } else if (acodec === "libmp3lame") {
        targetABitrateKbps = 256;
      } else if (acodec === "libopus") {
        targetABitrateKbps = 128;
      } else if (acodec === "flac") {
        targetABitrateKbps = 850;
      } else {
        targetABitrateKbps = 192;
      }

      // Video stream bitrate calculation from source bitrate, CRF, resolution, and codec
      if (vcodec === "copy") {
        // Direct stream copy preserves exact input video stream bitrate
        const srcAudioBitrate = Math.round(srcBitrateKbps * 0.08);
        targetVBitrateKbps = Math.max(100, srcBitrateKbps - srcAudioBitrate);
        cvtVbitrate.textContent = `Stream Copy (~${targetVBitrateKbps.toLocaleString()} kbps)`;
      } else {
        // Base bitrate for H.264 at 1080p CRF 23
        const crfFactor = Math.pow(2, (23 - crf) / 6);
        // Base bitrate per 1080p pixel ~0.0012 kbps
        let base1080pKbps = 2600 * crfFactor;
        // Bound by source bitrate if downscaling / recompressing
        if (srcBitrateKbps > 500 && crf >= 23) {
          base1080pKbps = Math.min(base1080pKbps, (srcBitrateKbps * 0.9));
        }

        let codecEfficiency = 1.0; // H.264 baseline
        if (vcodec === "libx265") codecEfficiency = 0.55; // HEVC: 45% lower bitrate
        else if (vcodec === "libsvtav1") codecEfficiency = 0.45; // AV1: 55% lower bitrate
        else if (vcodec === "libvpx-vp9") codecEfficiency = 0.65; // VP9: 35% lower bitrate
        else if (vcodec.startsWith("prores")) {
          // Apple ProRes 422 standard in MOV (~147 Mbps at 1080p)
          codecEfficiency = 147000 / 2600;
        }

        targetVBitrateKbps = Math.round(base1080pKbps * pixelRatio * codecEfficiency);
        targetVBitrateKbps = Math.max(120, targetVBitrateKbps);
        cvtVbitrate.textContent = `~${targetVBitrateKbps.toLocaleString()} kbps`;
      }

      const vName = vcodec === "copy" ? "Stream Copy" : vcodec === "libx265" ? "HEVC" : vcodec === "libvpx-vp9" ? "VP9" : vcodec === "libsvtav1" ? "AV1" : vcodec.startsWith("prores") ? "ProRes" : "H.264";
      const aName = acodec === "copy" ? "Keep Original" : acodec.toUpperCase();
      cvtTarget.textContent = `${container.toUpperCase()} (${vName} / ${aName})`;

      const totalKbps = targetVBitrateKbps + targetABitrateKbps;
      const estMb = ((totalKbps * 1000 / 8) * durSec * containerOverhead) / (1024 * 1024);
      cvtSize.textContent = formatSize(estMb);
    }
  }

  // 2. Extract Audio Estimate
  const audTarget = document.getElementById("aud-est-target");
  const audBitrate = document.getElementById("aud-est-bitrate");
  const audSize = document.getElementById("aud-est-size");
  if (audTarget && audBitrate && audSize) {
    const fmt = document.getElementById("aud-format")?.value || "mp3";
    const brVal = document.getElementById("aud-bitrate")?.value || "256k";
    const bitdepth = parseInt(document.getElementById("aud-bitdepth")?.value || "16", 10);
    const channels = 2;
    const sampleRate = 44100;

    if (["wav", "aiff"].includes(fmt)) {
      audTarget.textContent = `${fmt.toUpperCase()} (${bitdepth}-bit PCM)`;
      const pcmBitrate = (sampleRate * channels * bitdepth) / 1000;
      audBitrate.textContent = `${pcmBitrate.toLocaleString()} kbps`;
      const bytesPerSec = (sampleRate * channels * bitdepth) / 8;
      const estMb = (durSec * bytesPerSec) / (1024 * 1024);
      audSize.textContent = formatSize(estMb);
    } else if (fmt === "flac") {
      audTarget.textContent = `FLAC Lossless (${bitdepth}-bit)`;
      const flacBitrate = Math.round(((sampleRate * channels * bitdepth) / 1000) * 0.58);
      audBitrate.textContent = `~${flacBitrate.toLocaleString()} kbps`;
      const estMb = ((flacBitrate * 1000 / 8) * durSec) / (1024 * 1024);
      audSize.textContent = formatSize(estMb);
    } else {
      let kbps = 256;
      if (brVal === "copy") {
        kbps = Math.min(320, Math.max(128, Math.round(srcBitrateKbps * 0.08)));
      } else {
        kbps = parseInt(brVal, 10) || 256;
      }
      audTarget.textContent = `${fmt.toUpperCase()} (${kbps} kbps)`;
      audBitrate.textContent = `${kbps} kbps`;
      const estMb = ((kbps * 1000 / 8) * durSec * 1.01) / (1024 * 1024);
      audSize.textContent = formatSize(estMb);
    }
  }

  // 3. Trim & Cut Estimate
  const trimDurationEl = document.getElementById("trim-est-duration");
  const trimModeEl = document.getElementById("trim-est-mode");
  const trimSizeEl = document.getElementById("trim-est-size");
  if (trimDurationEl && trimModeEl && trimSizeEl) {
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
    const clipDur = Math.max(0.1, eSec - sSec);
    const m = Math.floor(clipDur / 60);
    const s = Math.floor(clipDur % 60);
    trimDurationEl.textContent = `00:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    const mode = document.getElementById("trim-mode")?.value || "copy";
    trimModeEl.textContent = mode === "copy" ? "Stream Copy (Lossless)" : "Accurate Cut (Re-encode)";

    if (mode === "copy") {
      const ratio = durSec > 0 ? clipDur / durSec : 0.5;
      const estMb = srcSizeMb * ratio;
      trimSizeEl.textContent = formatSize(estMb);
    } else {
      // Re-encode at CRF 20 (~3200 kbps total)
      const estMb = ((3200 * 1000 / 8) * clipDur) / (1024 * 1024);
      trimSizeEl.textContent = formatSize(estMb);
    }
  }

  // 3.5. Speed & Motion Estimate
  const speedFactorEl = document.getElementById("speed-est-factor");
  const speedDurEl = document.getElementById("speed-est-duration");
  const speedSizeEl = document.getElementById("speed-est-size");
  if (speedFactorEl && speedDurEl && speedSizeEl) {
    const preset = document.getElementById("speed-preset")?.value || "2.0";
    const speed = preset === "custom" ? (parseFloat(document.getElementById("speed-custom-val")?.value) || 2.0) : (parseFloat(preset) || 2.0);
    speedFactorEl.textContent = `${speed}x`;
    const newDur = Math.max(0.1, durSec / speed);
    const m = Math.floor(newDur / 60);
    const s = Math.floor(newDur % 60);
    speedDurEl.textContent = `00:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    const estMb = Math.max(0.1, (srcSizeMb / speed) * 1.05);
    speedSizeEl.textContent = formatSize(estMb);
  }

  // 3.6. Aspect Ratio & Crop Estimate
  const cropRatioEl = document.getElementById("crop-est-ratio");
  const cropModeEl = document.getElementById("crop-est-mode");
  const cropSizeEl = document.getElementById("crop-est-size");
  if (cropRatioEl && cropModeEl && cropSizeEl) {
    const ratio = document.getElementById("crop-ratio")?.value || "9:16";
    const mode = document.getElementById("crop-mode")?.value || "center_crop";
    cropRatioEl.textContent = ratio === "9:16" ? "9:16 (Vertical)" : ratio === "1:1" ? "1:1 (Square)" : ratio;
    cropModeEl.textContent = mode === "center_crop" ? "Center Crop" : mode === "pad_blur" ? "Blurred Background" : mode === "pad_black" ? "Letterbox" : "Fit & Scale";
    const crf = parseInt(document.getElementById("crop-crf")?.value || "23", 10);
    const crfFactor = Math.pow(2, (23 - crf) / 6);
    const estMb = ((2800 * crfFactor * 1000 / 8) * durSec) / (1024 * 1024);
    cropSizeEl.textContent = formatSize(estMb);
  }

  // 3.7. Video Stabilization Estimate
  const stabEngineEl = document.getElementById("stab-est-engine");
  const stabSmoothEl = document.getElementById("stab-est-smooth");
  const stabSizeEl = document.getElementById("stab-est-size");
  if (stabEngineEl && stabSmoothEl && stabSizeEl) {
    const engine = document.getElementById("stab-engine")?.value || "deshake";
    const smooth = document.getElementById("stab-smooth")?.value || "medium";
    stabEngineEl.textContent = engine === "deshake" ? "FFmpeg Deshake" : "VidStab 2-Pass";
    stabSmoothEl.textContent = smooth.charAt(0).toUpperCase() + smooth.slice(1);
    stabSizeEl.textContent = formatSize(srcSizeMb * 1.02);
  }

  // 3.8. Volume Normalization Estimate
  const normTargetEl = document.getElementById("norm-est-target");
  const normVideoEl = document.getElementById("norm-est-video");
  const normSizeEl = document.getElementById("norm-est-size");
  if (normTargetEl && normVideoEl && normSizeEl) {
    const target = document.getElementById("norm-target")?.value || "spotify_youtube";
    const videoMode = document.getElementById("norm-video-mode")?.value || "copy";
    normTargetEl.textContent = target === "spotify_youtube" ? "-14 LUFS (YouTube/Spotify)" : target === "apple_podcast" ? "-16 LUFS (Apple/Podcasts)" : target === "ebu_r128" ? "-23 LUFS (Broadcast)" : target === "dynaudnorm" ? "Dynamic Normalizer" : "Peak 0dB";
    normVideoEl.textContent = videoMode === "copy" ? "Stream Copy" : "Audio Only";
    const estMb = videoMode === "strip" ? Math.max(0.1, ((256 * 1000 / 8) * durSec) / (1024 * 1024)) : srcSizeMb;
    normSizeEl.textContent = formatSize(estMb);
  }

  // 4. Merge Estimate
  const mergeCountEl = document.getElementById("merge-est-count");
  const mergeFormatEl = document.getElementById("merge-est-format");
  const mergeEngineEl = document.getElementById("merge-est-engine");
  if (mergeCountEl && mergeFormatEl && mergeEngineEl) {
    mergeCountEl.textContent = `${mergeFiles.length} files`;
    mergeFormatEl.textContent = (document.getElementById("merge-format")?.value || "mp4").toUpperCase();
    const engine = document.getElementById("merge-engine")?.value || "concat_demuxer";
    mergeEngineEl.textContent = engine === "concat_demuxer" ? "Fast Concat (Stream Copy)" : "Re-encode Concat";
  }

  // 5. Mute / Replace Estimate
  const muteActionEl = document.getElementById("mute-est-action");
  const muteVideoEl = document.getElementById("mute-est-video");
  const muteSizeEl = document.getElementById("mute-est-size");
  if (muteActionEl && muteVideoEl && muteSizeEl) {
    const action = document.getElementById("mute-action")?.value || "strip";
    muteActionEl.textContent = action === "strip" ? "Mute / Strip Audio" : action === "replace" ? "Replace Audio Track" : "Mix Background Track";
    muteVideoEl.textContent = "Stream Copy (Lossless)";
    const audioStreamSizeMb = ((Math.min(320, Math.max(128, srcBitrateKbps * 0.08)) * 1000 / 8) * durSec) / (1024 * 1024);
    const estMb = action === "strip" ? Math.max(0.1, srcSizeMb - audioStreamSizeMb) : srcSizeMb;
    muteSizeEl.textContent = formatSize(estMb);
  }

  // 6. GIF & Frames Estimate
  const gifModeEl = document.getElementById("gif-est-mode");
  const gifFpsEl = document.getElementById("gif-est-fps");
  const gifSizeEl = document.getElementById("gif-est-size");
  if (gifModeEl && gifFpsEl && gifSizeEl) {
    const mode = document.getElementById("gif-mode")?.value || "gif_hq";
    const fps = parseInt(document.getElementById("gif-fps")?.value || "15", 10);
    const clipDur = parseFloat(document.getElementById("gif-dur")?.value) || 5.0;
    const widthSetting = document.getElementById("gif-width")?.value || "480";
    const targetW = widthSetting === "original" ? srcW : parseInt(widthSetting, 10) || 480;
    const targetH = Math.round(targetW * (srcH / srcW));

    if (mode === "snapshot") {
      const snapFmt = document.getElementById("gif-snap-fmt")?.value || "png";
      gifModeEl.textContent = `Single Frame (${snapFmt.toUpperCase()})`;
      gifFpsEl.textContent = "1 Frame";
      const bpp = snapFmt === "png" ? 0.9 : snapFmt === "jpg" ? 0.15 : 0.08;
      const estMb = (targetW * targetH * bpp) / (1024 * 1024);
      gifSizeEl.textContent = formatSize(estMb);
    } else if (mode === "frames_seq") {
      gifModeEl.textContent = "Frame Sequence";
      gifFpsEl.textContent = `${fps} FPS`;
      const totalFrames = Math.round(clipDur * fps);
      const estMb = (totalFrames * targetW * targetH * 0.15) / (1024 * 1024);
      gifSizeEl.textContent = `${formatSize(estMb)} (${totalFrames} frames)`;
    } else {
      gifModeEl.textContent = "High-Quality Animated GIF";
      gifFpsEl.textContent = `${fps} FPS`;
      const totalBytes = clipDur * fps * targetW * targetH * 0.22;
      const estMb = totalBytes / (1024 * 1024);
      gifSizeEl.textContent = formatSize(estMb);
    }
  }

  // 7. Custom Command Estimate
  const customFormatEl = document.getElementById("custom-est-format");
  const customDurEl = document.getElementById("custom-est-duration");
  if (customFormatEl && customDurEl) {
    customFormatEl.textContent = `.${document.getElementById("custom-ext")?.value || "mp4"}`;
    customDurEl.textContent = mediaInfo?.duration_string || "00:02:15";
  }
}

export function syncFormatSpecificUI() {
  // 1. Convert Video tool format sync
  const cvtContainer = document.getElementById("cvt-container")?.value || "mp4";
  const cvtVcodecWrapper = document.getElementById("cvt-vcodec-wrapper");
  const cvtAcodecWrapper = document.getElementById("cvt-acodec-wrapper");
  const cvtCrfWrapper = document.getElementById("cvt-crf-wrapper");
  const cvtPresetWrapper = document.getElementById("cvt-preset-wrapper");
  const cvtGifFpsWrapper = document.getElementById("cvt-gif-fps-wrapper");
  const cvtGifQualityWrapper = document.getElementById("cvt-gif-quality-wrapper");
  const cvtWebpFpsWrapper = document.getElementById("cvt-webp-fps-wrapper");
  const cvtWebpQualityWrapper = document.getElementById("cvt-webp-quality-wrapper");
  const cvtVcodec = document.getElementById("cvt-vcodec")?.value || "libx264";

  if (cvtContainer === "gif") {
    // For GIF: Hide video codec, audio codec, CRF, speed preset
    if (cvtVcodecWrapper) cvtVcodecWrapper.classList.add("d-none");
    if (cvtAcodecWrapper) cvtAcodecWrapper.classList.add("d-none");
    if (cvtCrfWrapper) cvtCrfWrapper.classList.add("d-none");
    if (cvtPresetWrapper) cvtPresetWrapper.classList.add("d-none");
    // Show GIF-specific options
    if (cvtGifFpsWrapper) cvtGifFpsWrapper.classList.remove("d-none");
    if (cvtGifQualityWrapper) cvtGifQualityWrapper.classList.remove("d-none");
    if (cvtWebpFpsWrapper) cvtWebpFpsWrapper.classList.add("d-none");
    if (cvtWebpQualityWrapper) cvtWebpQualityWrapper.classList.add("d-none");
  } else if (cvtContainer === "webp") {
    // For WebP: Hide standard video/audio codec, CRF, speed preset
    if (cvtVcodecWrapper) cvtVcodecWrapper.classList.add("d-none");
    if (cvtAcodecWrapper) cvtAcodecWrapper.classList.add("d-none");
    if (cvtCrfWrapper) cvtCrfWrapper.classList.add("d-none");
    if (cvtPresetWrapper) cvtPresetWrapper.classList.add("d-none");
    // Show WebP-specific options
    if (cvtGifFpsWrapper) cvtGifFpsWrapper.classList.add("d-none");
    if (cvtGifQualityWrapper) cvtGifQualityWrapper.classList.add("d-none");
    if (cvtWebpFpsWrapper) cvtWebpFpsWrapper.classList.remove("d-none");
    if (cvtWebpQualityWrapper) cvtWebpQualityWrapper.classList.remove("d-none");
  } else {
    // Standard video formats (MP4, MKV, WebM, MOV, AVI, etc.)
    if (cvtVcodecWrapper) cvtVcodecWrapper.classList.remove("d-none");
    if (cvtAcodecWrapper) cvtAcodecWrapper.classList.remove("d-none");
    if (cvtGifFpsWrapper) cvtGifFpsWrapper.classList.add("d-none");
    if (cvtGifQualityWrapper) cvtGifQualityWrapper.classList.add("d-none");
    if (cvtWebpFpsWrapper) cvtWebpFpsWrapper.classList.add("d-none");
    if (cvtWebpQualityWrapper) cvtWebpQualityWrapper.classList.add("d-none");

    // If stream copy is selected for video, CRF and Preset don't apply
    if (cvtVcodec === "copy") {
      if (cvtCrfWrapper) cvtCrfWrapper.classList.add("d-none");
      if (cvtPresetWrapper) cvtPresetWrapper.classList.add("d-none");
    } else {
      if (cvtCrfWrapper) cvtCrfWrapper.classList.remove("d-none");
      if (cvtPresetWrapper) cvtPresetWrapper.classList.remove("d-none");
    }
  }

  // 2. Extract Audio format sync
  const audFormat = document.getElementById("aud-format")?.value || "mp3";
  const audBitrateWrapper = document.getElementById("aud-bitrate-wrapper");
  const audBitdepthWrapper = document.getElementById("aud-bitdepth-wrapper");

  if (["flac", "wav", "aiff"].includes(audFormat)) {
    if (audBitrateWrapper) audBitrateWrapper.classList.add("d-none");
    if (audBitdepthWrapper) audBitdepthWrapper.classList.remove("d-none");
  } else {
    if (audBitrateWrapper) audBitrateWrapper.classList.remove("d-none");
    if (audBitdepthWrapper) audBitdepthWrapper.classList.add("d-none");
  }

  // 3. GIF and Frames tool mode sync
  const gifMode = document.getElementById("gif-mode")?.value || "gif_hq";
  const gifFpsWrapper = document.getElementById("gif-fps-wrapper");
  const gifDurWrapper = document.getElementById("gif-dur-wrapper");
  const gifSnapWrapper = document.getElementById("gif-snap-wrapper");

  if (gifMode === "snapshot") {
    if (gifFpsWrapper) gifFpsWrapper.classList.add("d-none");
    if (gifDurWrapper) gifDurWrapper.classList.add("d-none");
    if (gifSnapWrapper) gifSnapWrapper.classList.remove("d-none");
  } else if (gifMode === "frames_seq") {
    if (gifFpsWrapper) gifFpsWrapper.classList.remove("d-none");
    if (gifDurWrapper) gifDurWrapper.classList.remove("d-none");
    if (gifSnapWrapper) gifSnapWrapper.classList.remove("d-none");
  } else {
    if (gifFpsWrapper) gifFpsWrapper.classList.remove("d-none");
    if (gifDurWrapper) gifDurWrapper.classList.remove("d-none");
    if (gifSnapWrapper) gifSnapWrapper.classList.add("d-none");
  }

  // 4. Speed & Motion tool custom wrapper sync
  const speedPreset = document.getElementById("speed-preset")?.value || "2.0";
  const speedCustomWrapper = document.getElementById("speed-custom-wrapper");
  if (speedCustomWrapper) {
    speedCustomWrapper.classList.toggle("d-none", speedPreset !== "custom");
  }

  // 5. Volume Normalization custom LUFS wrapper sync
  const normTarget = document.getElementById("norm-target")?.value || "spotify_youtube";
  const normCustomWrapper = document.getElementById("norm-custom-wrapper");
  if (normCustomWrapper) {
    normCustomWrapper.classList.toggle("d-none", normTarget !== "custom");
  }

  // 6. Background Remover mode wrappers sync
  const bgModel = document.getElementById("bg-model")?.value || "u2net";
  const bgMode = document.getElementById("bg-output-mode")?.value || "transparent";
  const bgColorWrapper = document.getElementById("bg-color-wrapper");
  const bgBlurWrapper = document.getElementById("bg-blur-wrapper");
  const fakeTransparencyOptions = document.getElementById("fake-transparency-options");

  if (bgColorWrapper) {
    bgColorWrapper.classList.toggle("d-none", bgMode !== "solid_color");
  }
  if (bgBlurWrapper) {
    bgBlurWrapper.classList.toggle("d-none", bgMode !== "blur_bg");
  }
  if (fakeTransparencyOptions) {
    fakeTransparencyOptions.classList.toggle("d-none", bgModel !== "fake_transparency");
  }

  // Sync fake transparency range readout values
  const gridTolSlider = document.getElementById("fake-grid-tolerance");
  const gridTolVal = document.getElementById("fake-grid-tolerance-val");
  if (gridTolSlider && gridTolVal) {
    gridTolVal.textContent = gridTolSlider.value;
  }
  const gapThreshSlider = document.getElementById("fake-gap-threshold");
  const gapThreshVal = document.getElementById("fake-gap-threshold-val");
  if (gapThreshSlider && gapThreshVal) {
    gapThreshVal.textContent = gapThreshSlider.value;
  }

  // 7. Vectorizer mode wrappers sync
  const vecMode = document.getElementById("vec-mode")?.value || "color";
  const vecColorsWrapper = document.getElementById("vec-colors-wrapper");
  const vecMonoWrapper = document.getElementById("vec-mono-color-wrapper");
  if (vecColorsWrapper) {
    vecColorsWrapper.classList.toggle("d-none", vecMode !== "color");
  }
  if (vecMonoWrapper) {
    vecMonoWrapper.classList.toggle("d-none", vecMode !== "monochrome");
  }
}

function bindFormEvents() {
  const outputNameInput = document.getElementById("output-file-name");
  if (outputNameInput) {
    outputNameInput.addEventListener("focus", () => {
      outputNameInput.value = outputNameInput.dataset.fullPath || outputNameInput.value;
    });
    outputNameInput.addEventListener("input", () => {
      outputNameInput.dataset.fullPath = outputNameInput.value;
      outputNameInput.title = outputNameInput.value;
      userHasCustomOutputName = true;
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
        e.target.id === "norm-video-mode" ||
        e.target.id === "norm-acodec"
      ) {
        updateAutoOutputFilename(true);
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
        e.target.id === "norm-video-mode" ||
        e.target.id === "norm-acodec"
      ) {
        updateAutoOutputFilename(true);
      }
      updateCommandPreview();
    });
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
        btnReapply.innerHTML = `<i class="bi bi-arrow-clockwise"></i> Re-apply &amp; Update`;
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
      const filterMode = (activeTool === "extract_audio" || activeTool === "compress_audio")
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
    const filterMode = (activeTool === "extract_audio" || activeTool === "compress_audio")
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
      setOutputFilePath("");
      userHasCustomOutputName = false;
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

        const curFullPath = getOutputFilePath();
        const curFileName = curFullPath
          ? curFullPath.split(/[/\\]/).pop()
          : getSmartOutputFileName(currentInput, getCurrentActiveTool());
        const isWindows = folder.includes("\\") || /^[a-zA-Z]:/.test(folder);
        const sep = isWindows ? "\\" : "/";
        const newFullPath = `${folder.replace(/[/\\]+$/, "")}${sep}${curFileName}`;
        setOutputFilePath(newFullPath);
        userHasCustomOutputName = true;

        updateCommandPreview();
      }
    });
  }

  // Browse Output Folder for Image & AI Tools
  const btnBrowseImageOutDir = document.getElementById("btn-browse-image-outdir");
  const imageAiOutDirInput = document.getElementById("image-ai-output-dir");
  if (imageAiOutDirInput) {
    const savedImageDir = getLastImageAiOutDir() || appSettings.outputDir || "C:\\Users\\User\\Pictures";
    imageAiOutDirInput.value = savedImageDir;
  }
  if (btnBrowseImageOutDir) {
    btnBrowseImageOutDir.addEventListener("click", async () => {
      const currentDir = imageAiOutDirInput?.value || null;
      const folder = await selectOutputFolder(currentDir);
      if (folder) {
        if (imageAiOutDirInput) imageAiOutDirInput.value = folder;
        saveLastImageAiOutDir(folder);
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

        if (activeTool.startsWith("kit_")) {
          executeActiveKit();
          return;
        }

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
              return;
            }
          }

          for (let i = 0; i < imgQueue.length; i++) {
            const item = imgQueue[i];

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
            if (!cmdObj) continue;
            const success = await executeFfmpegJob(cmdObj, 1.0);
            if (success) {
              updateImageAiItemStatus(i, "done", cmdObj.destination);
              openComparisonModal(item.path, cmdObj.destination, TOOL_METADATA[activeTool]?.title || "Enhanced Image");
            } else {
              updateImageAiItemStatus(i, "error");
            }
          }
          return;
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
    });
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

  // AI Replace Source toggle
  const aiReplaceSwitch = document.getElementById("ai-replace-source");
  if (aiReplaceSwitch) {
    aiReplaceSwitch.addEventListener("change", () => {
      saveAiReplaceSource(aiReplaceSwitch.checked);
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

export async function populateHardwareInfo() {
  const setHw = document.getElementById("set-hwaccel");
  if (!setHw) return;

  let hwInfo = null;
  if (window.__TAURI__?.core?.invoke) {
    try {
      hwInfo = await window.__TAURI__.core.invoke("get_hardware_info");
    } catch (err) {
      console.warn("Failed to get hardware info:", err);
    }
  }

  setDetectedHardware(hwInfo);

  const currentVal = appSettings.hwAccel || "auto";

  // Auto label: prefers GPU first then CPU
  const autoTargetName = hwInfo?.nvidia_gpu || hwInfo?.intel_gpu || hwInfo?.amd_gpu || hwInfo?.cpu_name || "";
  const autoLabel = autoTargetName ? `Auto (${autoTargetName})` : "Auto";

  // CPU label: CPU (Host CPU Name)
  const cpuLabel = hwInfo?.cpu_name ? `CPU (${hwInfo.cpu_name})` : "CPU";

  // NVIDIA label: NVIDIA NVENC (CUDA) (GPU Name) if available, else NVIDIA NVENC (CUDA)
  const cudaLabel = hwInfo?.nvidia_gpu ? `NVIDIA NVENC (CUDA) (${hwInfo.nvidia_gpu})` : "NVIDIA NVENC (CUDA)";

  // Intel label: Intel QuickSync (QSV) (GPU Name) if available, else Intel QuickSync (QSV)
  const qsvLabel = hwInfo?.intel_gpu ? `Intel QuickSync (QSV) (${hwInfo.intel_gpu})` : "Intel QuickSync (QSV)";

  // AMD label: AMD AMF (GPU Name) if available, else AMD AMF
  const amfLabel = hwInfo?.amd_gpu ? `AMD AMF (${hwInfo.amd_gpu})` : "AMD AMF";

  setHw.innerHTML = `
    <option value="auto">${autoLabel}</option>
    <option value="cuda">${cudaLabel}</option>
    <option value="qsv">${qsvLabel}</option>
    <option value="amf">${amfLabel}</option>
    <option value="cpu">${cpuLabel}</option>
  `;

  setHw.value = currentVal;
}

function populateSettingsUI() {
  const setOutDir = document.getElementById("set-output-dir");
  const setPromptOver = document.getElementById("set-prompt-overwrite");
  const setEnableNotif = document.getElementById("set-enable-notifications");
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
  const setYtAutoPaste = document.getElementById("set-ytdlp-autopaste");
  const setYtCustom = document.getElementById("set-ytdlp-custom-args");

  if (setOutDir) setOutDir.value = appSettings.outputDir || "C:\\Users\\User\\Videos";
  if (setPromptOver) setPromptOver.checked = !!appSettings.promptOverwrite;
  if (setEnableNotif) setEnableNotif.checked = appSettings.enableNotifications !== false;
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
  if (setYtAutoPaste) setYtAutoPaste.checked = appSettings.ytdlpAutoPaste !== false;
  if (setYtCustom) setYtCustom.value = appSettings.ytdlpCustomArgs || "";

  populateHardwareInfo();
}

function syncSettingsFromUI() {
  const setOutDir = document.getElementById("set-output-dir");
  const setPromptOver = document.getElementById("set-prompt-overwrite");
  const setEnableNotif = document.getElementById("set-enable-notifications");
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
  const setYtAutoPaste = document.getElementById("set-ytdlp-autopaste");
  const setYtCustom = document.getElementById("set-ytdlp-custom-args");

  if (setOutDir) appSettings.outputDir = setOutDir.value;
  if (setPromptOver) appSettings.promptOverwrite = setPromptOver.checked;
  if (setEnableNotif) appSettings.enableNotifications = setEnableNotif.checked;
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
  if (setYtAutoPaste) appSettings.ytdlpAutoPaste = setYtAutoPaste.checked;
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

  initYtDlpFormatEditor();
  initJobRunner();
  initTrimmerControls();
  initSavedBatchQueue();
  initSavedImageAiQueue();
  initDragAndDrop((mediaInfo) => {
    if (mediaInfo) {
      syncMediaDurationToTools(mediaInfo);
      syncVideoPreviewForActiveTool(getCurrentActiveTool());
    }
    updateAutoOutputFilename(true);
    updateCommandPreview();
  });
  bindFormEvents();
  onMediaChange(() => {
    updateAutoOutputFilename(true);
    updateCommandPreview();
  });
  async function tryAutoPasteYtDlpUrl() {
    if (appSettings.ytdlpAutoPaste === false) return;
    const currentTool = getCurrentActiveTool();
    if (!currentTool || !currentTool.startsWith("ytdlp_")) return;

    const ytdlpUrlInput = document.getElementById("ytdlp-url-input");
    if (!ytdlpUrlInput) return;

    try {
      const text = await navigator.clipboard.readText();
      if (text && typeof text === "string") {
        const trimmed = text.trim();
        if (
          (trimmed.startsWith("http://") || trimmed.startsWith("https://")) &&
          (trimmed.includes("youtube.com") ||
            trimmed.includes("youtu.be") ||
            trimmed.includes("twitch.tv") ||
            trimmed.includes("twitter.com") ||
            trimmed.includes("x.com") ||
            trimmed.includes("tiktok.com") ||
            trimmed.includes("vimeo.com") ||
            trimmed.includes("soundcloud.com") ||
            trimmed.includes("instagram.com"))
        ) {
          if (!ytdlpUrlInput.value || ytdlpUrlInput.value !== trimmed) {
            ytdlpUrlInput.value = trimmed;
            updateCommandPreview();
          }
        }
      }
    } catch (_) {}
  }

  window.addEventListener("focus", () => {
    tryAutoPasteYtDlpUrl();
  });

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
    if (toolId && toolId.startsWith("ytdlp_")) {
      tryAutoPasteYtDlpUrl();
    }
    syncFormatSpecificUI();
    updateAutoOutputFilename();
    updateCommandPreview();
  });

  initComparisonModal();
  initImageLightbox();
  initToolsManager();
  initKitsManager();
  syncFormatSpecificUI();
  updateAutoOutputFilename(true);
  updateCommandPreview();
});
