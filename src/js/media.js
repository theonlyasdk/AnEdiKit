// Media Probing & File Interaction Module
import { saveInputFile } from "./storage.js";

let currentInputFile = "";
let currentMediaInfo = null;

export function getCurrentInputFile() {
  return currentInputFile;
}

export function getCurrentMediaInfo() {
  return currentMediaInfo;
}

export function showMetadataLoading(filePath) {
  const metaInfo = document.getElementById("input-meta-info");
  const pathInput = document.getElementById("input-file-path");
  const previewCol = document.getElementById("media-preview-col");
  const inputsCol = document.getElementById("media-inputs-col");
  const videoWrapper = document.getElementById("video-preview-wrapper");
  const audioWrapper = document.getElementById("audio-preview-wrapper");
  const cdSpinner = document.getElementById("audio-cd-spinner");
  const audioFallbackIcon = document.getElementById("audio-fallback-icon");
  const audioArtImg = document.getElementById("audio-art-img");
  const audioTitle = document.getElementById("audio-art-title");
  const audioFormat = document.getElementById("audio-art-format");

  if (pathInput) {
    pathInput.value = filePath || "";
  }

  if (filePath) {
    const ext = filePath.split(".").pop().toLowerCase();
    const isAudio = ["mp3", "wav", "flac", "m4a", "ogg", "opus", "wma", "aac"].includes(ext);

    if (inputsCol) inputsCol.className = "col-12 col-lg-8 col-xl-8 col-xxl-9";
    if (previewCol) {
      previewCol.classList.remove("d-none", "preview-slide-in");
      previewCol.classList.add("d-flex");
      void previewCol.offsetWidth;
      previewCol.classList.add("preview-slide-in");
    }

    if (isAudio && audioWrapper) {
      if (videoWrapper) videoWrapper.classList.add("d-none");
      audioWrapper.classList.remove("d-none");
      if (cdSpinner) cdSpinner.classList.remove("d-none");
      if (audioFallbackIcon) audioFallbackIcon.classList.add("d-none");
      if (audioArtImg) audioArtImg.classList.add("d-none");
      if (audioTitle) audioTitle.textContent = filePath.split(/[/\\]/).pop() || "Audio Track";
      if (audioFormat) audioFormat.textContent = "Loading album art...";
    }
  }

  if (metaInfo) {
    document.getElementById("meta-duration").innerHTML =
      '<span class="meta-loading-pulse">...</span>';
    document.getElementById("meta-resolution").innerHTML =
      '<span class="meta-loading-pulse">...</span>';
    document.getElementById("meta-vcodec").innerHTML =
      '<span class="meta-loading-pulse">...</span>';
    document.getElementById("meta-acodec").innerHTML =
      '<span class="meta-loading-pulse">...</span>';
    document.getElementById("meta-size").innerHTML =
      '<span class="meta-loading-pulse">...</span>';

    if (metaInfo.classList.contains("d-none")) {
      metaInfo.classList.remove("d-none");
      metaInfo.classList.add("d-flex", "ui-zoom-in");
    }
  }
}

export async function probeMedia(filePath, fileObject = null) {
  if (!filePath) {
    currentInputFile = "";
    currentMediaInfo = null;
    saveInputFile("");
    updateMetadataDisplay(null);
    return null;
  }

  currentInputFile = filePath;
  saveInputFile(filePath);
  showMetadataLoading(filePath);

  // Try Tauri IPC if available
  if (window.__TAURI__?.core?.invoke) {
    try {
      const info = await window.__TAURI__.core.invoke("get_media_info", {
        filePath,
      });
      if (
        info &&
        (info.duration_seconds > 0 ||
          info.resolution !== "--" ||
          info.video_codec !== "--")
      ) {
        currentMediaInfo = info;
        updateMetadataDisplay(info);
        return info;
      }
    } catch (err) {
      console.warn("Tauri get_media_info error:", err);
    }
  }

  // Browser video/audio element fallback when running with file object
  if (fileObject instanceof Blob || fileObject instanceof File) {
    try {
      const mediaInfo = await probeInBrowser(fileObject, filePath);
      currentMediaInfo = mediaInfo;
      updateMetadataDisplay(mediaInfo);
      return mediaInfo;
    } catch (e) {
      console.warn("Browser media probe error:", e);
    }
  }

  // Simulated fallback for demo/mock file paths
  const fileName = filePath.split(/[/\\]/).pop() || "sample_video.mp4";
  const ext = (fileName.split(".").pop() || "mp4").toLowerCase();
  const isAudio = ["mp3", "wav", "flac", "m4a", "ogg", "opus"].includes(ext);

  const mockInfo = {
    file_path: filePath,
    file_name: fileName,
    duration_seconds: 135.0,
    duration_string: "00:02:15",
    resolution: isAudio ? "N/A" : "1920x1080",
    video_codec: isAudio ? "None" : ext === "webm" ? "vp9" : "h264",
    audio_codec: ext === "flac" ? "flac" : ext === "wav" ? "pcm" : "aac",
    file_size_mb: 42.5,
    file_size_formatted: "42.5 MB",
    bitrate_kbps: 2600,
  };

  // Small delay for smooth pulsing ellipsis appearance
  await new Promise((res) => setTimeout(res, 200));
  currentMediaInfo = mockInfo;
  updateMetadataDisplay(mockInfo);
  return mockInfo;
}

function probeInBrowser(file, filePath) {
  return new Promise((resolve) => {
    const isVideo = file.type.startsWith("video");
    const mediaEl = document.createElement(isVideo ? "video" : "audio");
    const objectUrl = URL.createObjectURL(file);

    mediaEl.preload = "metadata";
    mediaEl.src = objectUrl;

    mediaEl.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      const durSec = mediaEl.duration || 0;
      const h = Math.floor(durSec / 3600);
      const m = Math.floor((durSec % 3600) / 60);
      const s = Math.floor(durSec % 60);
      const durStr = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      const sizeMb = file.size
        ? (file.size / (1024 * 1024)).toFixed(2)
        : "42.5";

      resolve({
        file_path: filePath,
        file_name: file.name,
        duration_seconds: durSec,
        duration_string: durStr,
        resolution: isVideo
          ? `${mediaEl.videoWidth}x${mediaEl.videoHeight}`
          : "N/A",
        video_codec: isVideo ? "h264" : "None",
        audio_codec: "aac",
        file_size_mb: parseFloat(sizeMb),
        file_size_formatted: `${sizeMb} MB`,
        bitrate_kbps: 0,
      });
    };

    mediaEl.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const sizeMb = file.size
        ? (file.size / (1024 * 1024)).toFixed(2)
        : "42.5";
      resolve({
        file_path: filePath,
        file_name: file.name,
        duration_seconds: 0.0,
        duration_string: "--:--:--",
        resolution: "--",
        video_codec: "--",
        audio_codec: "--",
        file_size_mb: parseFloat(sizeMb),
        file_size_formatted: `${sizeMb} MB`,
        bitrate_kbps: 0,
      });
    };
  });
}

export function updateMetadataDisplay(info) {
  const metaInfo = document.getElementById("input-meta-info");
  const pathInput = document.getElementById("input-file-path");

  // Media preview container elements
  const inputsCol = document.getElementById("media-inputs-col");
  const previewCol = document.getElementById("media-preview-col");
  const videoWrapper = document.getElementById("video-preview-wrapper");
  const videoEl = document.getElementById("media-video-preview");
  const audioWrapper = document.getElementById("audio-preview-wrapper");
  const audioTitle = document.getElementById("audio-art-title");
  const audioEl = document.getElementById("media-audio-preview");

  if (pathInput) {
    pathInput.value = info ? info.file_path || currentInputFile : "";
  }

  if (info && info.file_path) {
    const ext = (info.file_name || info.file_path).split(".").pop().toLowerCase();
    const isAudio =
      info.resolution === "N/A" ||
      info.video_codec === "None" ||
      ["mp3", "wav", "flac", "m4a", "ogg", "opus", "wma", "aac"].includes(ext);

    const assetSrc =
      window.__TAURI__?.core?.convertFileSrc && info.file_path
        ? window.__TAURI__.core.convertFileSrc(info.file_path)
        : "";

    const videoFallback = document.getElementById("video-preview-fallback");
    const videoFallbackName = document.getElementById("video-fallback-filename");
    const audioFormat = document.getElementById("audio-art-format");
    const cdSpinner = document.getElementById("audio-cd-spinner");
    const audioFallbackIcon = document.getElementById("audio-fallback-icon");
    const audioArtImg = document.getElementById("audio-art-img");

    if (inputsCol) {
      inputsCol.className = "col-12 col-lg-8 col-xl-8 col-xxl-9";
    }

    if (previewCol) {
      previewCol.classList.remove("d-none", "preview-slide-in");
      previewCol.classList.add("d-flex");
      void previewCol.offsetWidth; // reflow
      previewCol.classList.add("preview-slide-in");
    }

    if (isAudio) {
      if (videoWrapper) videoWrapper.classList.add("d-none");
      if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute("src");
      }
      if (audioWrapper) audioWrapper.classList.remove("d-none");
      if (cdSpinner) cdSpinner.classList.add("d-none");
      if (info.album_art_url) {
        if (audioArtImg) {
          audioArtImg.src = info.album_art_url;
          audioArtImg.classList.remove("d-none");
        }
        if (audioFallbackIcon) audioFallbackIcon.classList.add("d-none");
      } else {
        if (audioArtImg) audioArtImg.classList.add("d-none");
        if (audioFallbackIcon) audioFallbackIcon.classList.remove("d-none");
      }
      if (audioTitle) audioTitle.textContent = info.file_name || "Audio Track";
      if (audioFormat) audioFormat.textContent = `${(info.audio_codec || ext || "audio").toUpperCase()} Audio`;
      if (audioEl && assetSrc) audioEl.src = assetSrc;
    } else {
      if (audioWrapper) audioWrapper.classList.add("d-none");
      if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute("src");
      }
      if (videoWrapper) videoWrapper.classList.remove("d-none");
      if (videoEl) {
        if (assetSrc) {
          videoEl.classList.remove("d-none");
          if (videoFallback) videoFallback.classList.add("d-none");
          videoEl.src = assetSrc;
          videoEl.onerror = () => {
            videoEl.classList.add("d-none");
            if (videoFallback) {
              videoFallback.classList.remove("d-none");
              if (videoFallbackName) videoFallbackName.textContent = info.file_name || "Video Preview";
            }
          };
        } else {
          videoEl.classList.add("d-none");
          if (videoFallback) {
            videoFallback.classList.remove("d-none");
            if (videoFallbackName) videoFallbackName.textContent = info.file_name || "Video Preview";
          }
        }
      }
    }
  } else {
    if (inputsCol) {
      inputsCol.className = "col-12";
    }
    if (previewCol) {
      previewCol.classList.remove("d-flex", "preview-slide-in");
      previewCol.classList.add("d-none");
    }
    if (videoWrapper) videoWrapper.classList.add("d-none");
    if (audioWrapper) audioWrapper.classList.add("d-none");
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute("src");
    }
    if (audioEl) {
      audioEl.pause();
      audioEl.removeAttribute("src");
    }
  }

  if (!metaInfo) return;

  if (info) {
    document.getElementById("meta-duration").textContent =
      info.duration_string || "--:--:--";
    document.getElementById("meta-resolution").textContent =
      info.resolution || "--";
    document.getElementById("meta-vcodec").textContent =
      info.video_codec || "--";
    document.getElementById("meta-acodec").textContent =
      info.audio_codec || "--";
    document.getElementById("meta-size").textContent =
      info.file_size_formatted || `${info.file_size_mb || 0} MB`;

    if (metaInfo.classList.contains("d-none")) {
      metaInfo.classList.remove("d-none");
      metaInfo.classList.add("d-flex", "ui-zoom-in");
    }
  } else {
    document.getElementById("meta-duration").textContent = "--:--:--";
    document.getElementById("meta-resolution").textContent = "--";
    document.getElementById("meta-vcodec").textContent = "--";
    document.getElementById("meta-acodec").textContent = "--";
    document.getElementById("meta-size").textContent = "-- MB";
    metaInfo.classList.remove("d-flex", "ui-zoom-in");
    metaInfo.classList.add("d-none");
  }
}

export async function selectMediaFile(filterMode = "all") {
  if (window.__TAURI__?.core?.invoke) {
    try {
      const selected = await window.__TAURI__.core.invoke("pick_files", {
        filterMode,
      });
      if (selected && selected.length > 0) {
        await addFilesToBatch(selected);
        return currentMediaInfo;
      }
      return null;
    } catch (err) {
      console.warn("Tauri pick_files error:", err);
    }
  }

  // Web fallback simulation
  const mockPath = `C:\\Users\\User\\Videos\\sample_media_${Date.now().toString().slice(-4)}.mp4`;
  await addFilesToBatch([mockPath]);
  return currentMediaInfo;
}

export async function selectMediaFiles(filterMode = "all") {
  if (window.__TAURI__?.core?.invoke) {
    try {
      const selected = await window.__TAURI__.core.invoke("pick_files", {
        filterMode,
      });
      if (selected && selected.length > 0) {
        await addFilesToBatch(selected);
        return selected;
      }
      return [];
    } catch (err) {
      console.warn("Tauri pick_files error:", err);
    }
  }
  return [];
}

export async function selectOutputFolder(defaultPath = null) {
  if (window.__TAURI__?.core?.invoke) {
    try {
      const selected = await window.__TAURI__.core.invoke("pick_folder", {
        defaultPath: defaultPath || null,
      });
      return selected || null;
    } catch (err) {
      console.warn("Tauri pick_folder error:", err);
    }
  }
  return null;
}

// Batch Queue State & Management
let batchQueue = [];
let selectedBatchIdx = -1;

export function getBatchQueue() {
  return batchQueue;
}

export function getSelectedBatchIdx() {
  return selectedBatchIdx;
}

export function setSelectedBatchIdx(idx) {
  selectedBatchIdx = idx;
  renderBatchQueueUI();
}

export async function clearBatchQueue() {
  batchQueue = [];
  selectedBatchIdx = -1;
  await probeMedia("");
  renderBatchQueueUI();
}

export async function removeBatchItem(index) {
  if (index >= 0 && index < batchQueue.length) {
    const wasActive = index === selectedBatchIdx;
    batchQueue.splice(index, 1);
    if (batchQueue.length === 0) {
      selectedBatchIdx = -1;
      await probeMedia("");
    } else {
      if (selectedBatchIdx >= batchQueue.length) {
        selectedBatchIdx = batchQueue.length - 1;
      }
      if (wasActive || !currentInputFile) {
        await probeMedia(batchQueue[selectedBatchIdx >= 0 ? selectedBatchIdx : 0].path);
      }
    }
    renderBatchQueueUI();
  }
}

export function moveBatchIndexUp(idx) {
  if (idx > 0 && idx < batchQueue.length) {
    const temp = batchQueue[idx];
    batchQueue[idx] = batchQueue[idx - 1];
    batchQueue[idx - 1] = temp;
    selectedBatchIdx = idx - 1;
    renderBatchQueueUI();
  }
}

export function moveBatchIndexDown(idx) {
  if (idx >= 0 && idx < batchQueue.length - 1) {
    const temp = batchQueue[idx];
    batchQueue[idx] = batchQueue[idx + 1];
    batchQueue[idx + 1] = temp;
    selectedBatchIdx = idx + 1;
    renderBatchQueueUI();
  }
}

export function moveBatchItemUp() {
  if (selectedBatchIdx > 0) {
    moveBatchIndexUp(selectedBatchIdx);
  }
}

export function moveBatchItemDown() {
  if (selectedBatchIdx >= 0 && selectedBatchIdx < batchQueue.length - 1) {
    moveBatchIndexDown(selectedBatchIdx);
  }
}

export async function addFilesToBatch(paths) {
  if (!paths || paths.length === 0) return;
  for (const p of paths) {
    if (!p) continue;
    if (!batchQueue.some((item) => item.path === p)) {
      const fileName = p.split(/[/\\]/).pop() || p;
      batchQueue.push({
        path: p,
        name: fileName,
        status: "pending", // pending, processing, done, error
      });
    }
  }

  if (batchQueue.length > 0) {
    const targetIdx = selectedBatchIdx >= 0 && selectedBatchIdx < batchQueue.length
      ? selectedBatchIdx
      : 0;
    await probeMedia(batchQueue[targetIdx].path);
  }

  renderBatchQueueUI();
}

export function updateBatchItemStatus(index, status) {
  if (index >= 0 && index < batchQueue.length) {
    batchQueue[index].status = status;
    renderBatchQueueUI();
  }
}

export function renderBatchQueueUI() {
  const container = document.getElementById("batch-queue-container");
  const list = document.getElementById("batch-queue-list");
  const countEl = document.getElementById("batch-queue-count");
  const headerActions = document.getElementById("batch-header-actions");
  const inputPathEl = document.getElementById("input-file-path");
  const btnExecute = document.getElementById("btn-execute");

  if (!container || !list) return;

  if (countEl) countEl.textContent = batchQueue.length.toString();

  if (batchQueue.length === 0) {
    if (headerActions) headerActions.classList.add("d-none");
    list.innerHTML = `
      <div class="list-group-item text-body-secondary text-center py-4 d-flex flex-column align-items-center justify-content-center gap-2" id="batch-empty-msg">
        <span>No files queued.</span>
        <button class="btn btn-outline-primary btn-sm" type="button" id="btn-batch-add-empty" title="Add files to batch queue">
          <i class="bi bi-plus-lg"></i> Add to Queue...
        </button>
      </div>
    `;
    const btnEmptyAdd = document.getElementById("btn-batch-add-empty");
    if (btnEmptyAdd) {
      btnEmptyAdd.addEventListener("click", async () => {
        await selectMediaFiles("all");
      });
    }
    if (btnExecute && btnExecute.textContent.startsWith("Execute Batch")) {
      btnExecute.textContent = "Execute";
    }
    return;
  }

  if (headerActions) headerActions.classList.remove("d-none");

  if (inputPathEl) {
    if (batchQueue.length === 1) {
      inputPathEl.value = batchQueue[0].path;
    } else {
      inputPathEl.value = `[Batch Queue: ${batchQueue.length} files queued]`;
    }
  }

  if (btnExecute && btnExecute.textContent !== "Cancel") {
    btnExecute.textContent = `Execute Batch (${batchQueue.length} items)`;
  }

  list.innerHTML = batchQueue
    .map((item, idx) => {
      let statusBadge = "";
      if (item.status === "processing") {
        statusBadge = `<span class="badge bg-primary-subtle text-primary-emphasis d-inline-flex align-items-center gap-1"><span class="spinner-border spinner-border-sm" style="width: 10px; height: 10px;" role="status"></span> Active</span>`;
      } else if (item.status === "done") {
        statusBadge = `<span class="badge bg-success-subtle text-success-emphasis"><i class="bi bi-check2"></i> Done</span>`;
      } else if (item.status === "error") {
        statusBadge = `<span class="badge bg-danger-subtle text-danger-emphasis"><i class="bi bi-x"></i> Failed</span>`;
      }

      const isSelected = idx === selectedBatchIdx;
      return `
        <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2 ${isSelected ? 'active' : ''}" data-batch-idx="${idx}" style="cursor: pointer;">
          <span class="text-truncate small"><strong class="me-2">${idx + 1}.</strong>${item.name}</span>
          <div class="d-flex align-items-center gap-1 flex-shrink-0">
            ${statusBadge}
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-secondary btn-sm py-0 px-2 btn-batch-item-up ${isSelected ? 'btn-outline-light' : ''}" data-up-batch-idx="${idx}" type="button" title="Move Up" ${idx === 0 ? 'disabled' : ''}>
                <i class="bi bi-arrow-up"></i>
              </button>
              <button class="btn btn-outline-secondary btn-sm py-0 px-2 btn-batch-item-down ${isSelected ? 'btn-outline-light' : ''}" data-down-batch-idx="${idx}" type="button" title="Move Down" ${idx === batchQueue.length - 1 ? 'disabled' : ''}>
                <i class="bi bi-arrow-down"></i>
              </button>
            </div>
            <button class="btn btn-outline-danger btn-sm py-0 px-2 btn-batch-del ${isSelected ? 'btn-outline-light' : ''}" data-del-batch-idx="${idx}" type="button" title="Delete file from queue">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  list.querySelectorAll(".list-group-item-action").forEach((el) => {
    el.addEventListener("click", async (e) => {
      if (e.target.closest("button")) return;
      const idx = parseInt(el.getAttribute("data-batch-idx"), 10);
      selectedBatchIdx = idx;
      if (idx >= 0 && idx < batchQueue.length) {
        await probeMedia(batchQueue[idx].path);
      }
      renderBatchQueueUI();
    });
  });

  list.querySelectorAll(".btn-batch-item-up").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute("data-up-batch-idx"), 10);
      moveBatchIndexUp(idx);
    });
  });

  list.querySelectorAll(".btn-batch-item-down").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute("data-down-batch-idx"), 10);
      moveBatchIndexDown(idx);
    });
  });

  list.querySelectorAll(".btn-batch-del").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute("data-del-batch-idx"), 10);
      removeBatchItem(idx);
    });
  });
}

// Trimmer Seekbar & Live Preview Controller
export function formatSecondsToTimestamp(seconds) {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

export function parseTimestampToSeconds(ts) {
  if (!ts) return 0;
  const parts = ts.trim().split(":");
  if (parts.length === 3) {
    const h = parseFloat(parts[0]) || 0;
    const m = parseFloat(parts[1]) || 0;
    const s = parseFloat(parts[2]) || 0;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const m = parseFloat(parts[0]) || 0;
    const s = parseFloat(parts[1]) || 0;
    return m * 60 + s;
  }
  return parseFloat(ts) || 0;
}

export function initTrimmerControls() {
  const sliderStart = document.getElementById("trim-slider-start");
  const sliderEnd = document.getElementById("trim-slider-end");
  const rangeBar = document.getElementById("trim-selected-range-bar");
  const inputStart = document.getElementById("trim-start");
  const inputEnd = document.getElementById("trim-end");
  const posDisplay = document.getElementById("trim-current-pos");
  const clipDurBadge = document.getElementById("trim-clip-dur");
  const videoEl = document.getElementById("media-video-preview");
  const audioEl = document.getElementById("media-audio-preview");

  const btnPlayPause = document.getElementById("btn-trim-play-pause");
  const playIcon = document.getElementById("trim-play-icon");
  const btnMarkStart = document.getElementById("btn-trim-mark-start");
  const btnMarkEnd = document.getElementById("btn-trim-mark-end");
  const btnStepBack1 = document.getElementById("btn-trim-step-back-1");
  const btnStepBackFrame = document.getElementById("btn-trim-step-back-frame");
  const btnStepFwdFrame = document.getElementById("btn-trim-step-fwd-frame");
  const btnStepFwd1 = document.getElementById("btn-trim-step-fwd-1");
  const btnPreviewSegment = document.getElementById("btn-trim-preview-segment");
  const btnSetStart0 = document.getElementById("btn-trim-set-start-0");
  const btnSetEndDur = document.getElementById("btn-trim-set-end-dur");

  const getActiveMediaEl = () => {
    if (videoEl && !videoEl.classList.contains("d-none") && videoEl.src) return videoEl;
    if (audioEl && audioEl.src) return audioEl;
    return null;
  };

  const updateRangeBarUI = (startSec, endSec, totalDur) => {
    if (totalDur <= 0) totalDur = 1;
    const startPct = Math.min(100, Math.max(0, (startSec / totalDur) * 100));
    const endPct = Math.min(100, Math.max(0, (endSec / totalDur) * 100));
    const widthPct = Math.max(0, endPct - startPct);

    if (rangeBar) {
      rangeBar.style.marginLeft = `${startPct}%`;
      rangeBar.style.width = `${widthPct}%`;
    }

    if (sliderStart) sliderStart.value = startPct.toString();
    if (sliderEnd) sliderEnd.value = endPct.toString();

    const diff = Math.max(0, endSec - startSec);
    if (clipDurBadge) clipDurBadge.textContent = formatSecondsToTimestamp(diff);
  };

  // Sync when sliders change
  if (sliderStart && sliderEnd) {
    sliderStart.addEventListener("input", () => {
      const dur = currentMediaInfo?.duration_seconds || 120;
      let startVal = parseFloat(sliderStart.value);
      let endVal = parseFloat(sliderEnd.value);
      if (startVal > endVal) {
        startVal = endVal;
        sliderStart.value = startVal.toString();
      }
      const startSec = (startVal / 100) * dur;
      const endSec = (endVal / 100) * dur;

      if (inputStart) inputStart.value = formatSecondsToTimestamp(startSec);
      updateRangeBarUI(startSec, endSec, dur);

      const media = getActiveMediaEl();
      if (media) media.currentTime = startSec;
      if (posDisplay) posDisplay.textContent = formatSecondsToTimestamp(startSec);
    });

    sliderEnd.addEventListener("input", () => {
      const dur = currentMediaInfo?.duration_seconds || 120;
      let startVal = parseFloat(sliderStart.value);
      let endVal = parseFloat(sliderEnd.value);
      if (endVal < startVal) {
        endVal = startVal;
        sliderEnd.value = endVal.toString();
      }
      const startSec = (startVal / 100) * dur;
      const endSec = (endVal / 100) * dur;

      if (inputEnd) inputEnd.value = formatSecondsToTimestamp(endSec);
      updateRangeBarUI(startSec, endSec, dur);

      const media = getActiveMediaEl();
      if (media) media.currentTime = endSec;
      if (posDisplay) posDisplay.textContent = formatSecondsToTimestamp(endSec);
    });
  }

  // Sync when text inputs change
  const onTimestampInputsChanged = () => {
    const dur = currentMediaInfo?.duration_seconds || 120;
    const startSec = parseTimestampToSeconds(inputStart?.value);
    const endSec = parseTimestampToSeconds(inputEnd?.value) || dur;
    updateRangeBarUI(startSec, endSec, dur);
  };

  if (inputStart) inputStart.addEventListener("input", onTimestampInputsChanged);
  if (inputEnd) inputEnd.addEventListener("input", onTimestampInputsChanged);

  // Playhead position updates from media player
  const onTimeUpdate = (media) => {
    if (!media) return;
    if (posDisplay) posDisplay.textContent = formatSecondsToTimestamp(media.currentTime);
  };

  if (videoEl) videoEl.addEventListener("timeupdate", () => onTimeUpdate(videoEl));
  if (audioEl) audioEl.addEventListener("timeupdate", () => onTimeUpdate(audioEl));

  // Mark In & Mark Out
  if (btnMarkStart) {
    btnMarkStart.addEventListener("click", () => {
      const media = getActiveMediaEl();
      const cur = media ? media.currentTime : 0;
      if (inputStart) inputStart.value = formatSecondsToTimestamp(cur);
      onTimestampInputsChanged();
    });
  }

  if (btnMarkEnd) {
    btnMarkEnd.addEventListener("click", () => {
      const media = getActiveMediaEl();
      const dur = currentMediaInfo?.duration_seconds || 120;
      const cur = media ? media.currentTime : dur;
      if (inputEnd) inputEnd.value = formatSecondsToTimestamp(cur);
      onTimestampInputsChanged();
    });
  }

  // Quick reset buttons
  if (btnSetStart0) {
    btnSetStart0.addEventListener("click", () => {
      if (inputStart) inputStart.value = "00:00:00.000";
      onTimestampInputsChanged();
      const media = getActiveMediaEl();
      if (media) media.currentTime = 0;
    });
  }

  if (btnSetEndDur) {
    btnSetEndDur.addEventListener("click", () => {
      const dur = currentMediaInfo?.duration_seconds || 60;
      if (inputEnd) inputEnd.value = formatSecondsToTimestamp(dur);
      onTimestampInputsChanged();
    });
  }

  // Play / Pause
  if (btnPlayPause) {
    btnPlayPause.addEventListener("click", () => {
      const media = getActiveMediaEl();
      if (!media) return;
      if (media.paused) {
        media.play();
        if (playIcon) playIcon.className = "bi bi-pause-fill";
      } else {
        media.pause();
        if (playIcon) playIcon.className = "bi bi-play-fill";
      }
    });
  }

  // Frame Stepping
  const stepMedia = (delta) => {
    const media = getActiveMediaEl();
    if (!media) return;
    media.currentTime = Math.max(0, media.currentTime + delta);
    if (posDisplay) posDisplay.textContent = formatSecondsToTimestamp(media.currentTime);
  };

  if (btnStepBack1) btnStepBack1.addEventListener("click", () => stepMedia(-1.0));
  if (btnStepBackFrame) btnStepBackFrame.addEventListener("click", () => stepMedia(-0.1));
  if (btnStepFwdFrame) btnStepFwdFrame.addEventListener("click", () => stepMedia(0.1));
  if (btnStepFwd1) btnStepFwd1.addEventListener("click", () => stepMedia(1.0));

  // Preview Segment
  if (btnPreviewSegment) {
    btnPreviewSegment.addEventListener("click", () => {
      const media = getActiveMediaEl();
      if (!media) return;
      const startSec = parseTimestampToSeconds(inputStart?.value);
      const endSec = parseTimestampToSeconds(inputEnd?.value) || (currentMediaInfo?.duration_seconds || 120);
      media.currentTime = startSec;
      media.play();
      if (playIcon) playIcon.className = "bi bi-pause-fill";

      const checkEnd = () => {
        if (media.currentTime >= endSec) {
          media.pause();
          if (playIcon) playIcon.className = "bi bi-play-fill";
          media.removeEventListener("timeupdate", checkEnd);
        }
      };
      media.addEventListener("timeupdate", checkEnd);
    });
  }
}

export function initDragAndDrop(onFileSelected) {
  const activatePulse = () => {
    const group = document.querySelector("#shared-input-card .input-group");
    if (group) group.classList.add("input-drop-pulsing");
  };

  const deactivatePulse = () => {
    const group = document.querySelector("#shared-input-card .input-group");
    if (group) group.classList.remove("input-drop-pulsing");
  };

  let dragCounter = 0;

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    window.addEventListener(
      eventName,
      (e) => {
        e.preventDefault();
      },
      false,
    );
    document.addEventListener(
      eventName,
      (e) => {
        e.preventDefault();
      },
      false,
    );
  });

  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    activatePulse();
  });

  window.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    activatePulse();
  });

  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0 || e.clientX === 0 || e.clientY === 0) {
      dragCounter = 0;
      deactivatePulse();
    }
  });

  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragCounter = 0;
    deactivatePulse();

    if (
      e.dataTransfer &&
      e.dataTransfer.files &&
      e.dataTransfer.files.length > 0
    ) {
      const filePaths = Array.from(e.dataTransfer.files).map(
        (f) => f.path || f.name || "C:\\Users\\User\\Videos\\dropped_media.mp4",
      );
      await addFilesToBatch(filePaths);
      if (onFileSelected) onFileSelected(currentMediaInfo);
    }
  });

  // Tauri v2 native window drag-drop event support
  if (window.__TAURI__) {
    try {
      const webviewWin =
        window.__TAURI__.webviewWindow?.getCurrentWebviewWindow?.() ||
        window.__TAURI__.window?.getCurrentWindow?.();
      if (webviewWin && typeof webviewWin.onDragDropEvent === "function") {
        webviewWin.onDragDropEvent(async (event) => {
          if (!event || !event.payload) return;
          if (event.payload.type === "enter" || event.payload.type === "over") {
            activatePulse();
          } else if (event.payload.type === "leave") {
            deactivatePulse();
          } else if (event.payload.type === "drop") {
            deactivatePulse();
            if (event.payload.paths && event.payload.paths.length > 0) {
              await addFilesToBatch(event.payload.paths);
              if (onFileSelected) onFileSelected(currentMediaInfo);
            }
          }
        });
      }
    } catch (err) {
      console.warn("Tauri drag drop init error:", err);
    }
  }
}
