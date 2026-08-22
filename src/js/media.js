// Media Probing & File Interaction Module
import { saveInputFile, getSavedInputFile, loadSavedBatchQueue, saveBatchQueue } from "./storage.js";
import { generateWaveformFromSource, renderWaveformToCanvas } from "./waveform.js";

let currentInputFile = "";
let currentMediaInfo = null;
let currentWaveformPeaks = null;
const mediaInfoCache = new Map();
let activeProbeToken = 0;

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

    if (inputsCol) inputsCol.className = "col-12 col-lg-7 col-xl-7 col-xxl-8";
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
      renderMarqueeSongTitle(filePath.split(/[/\\]/).pop() || "Audio Track");
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

  // Instant response if already cached
  if (mediaInfoCache.has(filePath)) {
    const cached = mediaInfoCache.get(filePath);
    currentMediaInfo = cached;
    updateMetadataDisplay(cached);
    syncMediaDurationToTools(cached);
    return cached;
  }

  showMetadataLoading(filePath);
  const thisToken = ++activeProbeToken;

  // Try Tauri IPC if available
  if (window.__TAURI__?.core?.invoke) {
    try {
      const info = await window.__TAURI__.core.invoke("get_media_info", {
        filePath,
      });
      if (thisToken !== activeProbeToken) return null;
      if (info && (info.duration_seconds > 0 || info.file_path || info.file_name)) {
        mediaInfoCache.set(filePath, info);
        currentMediaInfo = info;
        updateMetadataDisplay(info);
        syncMediaDurationToTools(info);
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
      if (thisToken !== activeProbeToken) return null;
      mediaInfoCache.set(filePath, mediaInfo);
      currentMediaInfo = mediaInfo;
      updateMetadataDisplay(mediaInfo);
      syncMediaDurationToTools(mediaInfo);
      return mediaInfo;
    } catch (e) {
      console.warn("Browser media probe error:", e);
    }
  }

  // Simulated fallback for demo/mock file paths
  const fileName = filePath.split(/[/\\]/).pop() || "sample_video.mp4";
  const ext = (fileName.split(".").pop() || "mp4").toLowerCase();
  const isAudio = ["mp3", "wav", "flac", "m4a", "ogg", "opus", "wma", "aac"].includes(ext);
  const detectedAudioCodec = ext === "mp3" ? "mp3" : ext === "flac" ? "flac" : ext === "wav" ? "pcm" : ext === "ogg" ? "vorbis" : ext === "opus" ? "opus" : ext === "wma" ? "wma" : "aac";

  const mockInfo = {
    file_path: filePath,
    file_name: fileName,
    duration_seconds: 135.0,
    duration_string: "00:02:15",
    resolution: isAudio ? "N/A" : "1920x1080",
    video_codec: isAudio ? "None" : ext === "webm" ? "vp9" : "h264",
    audio_codec: detectedAudioCodec,
    file_size_mb: 42.5,
    file_size_formatted: "42.5 MB",
    bitrate_kbps: 2600,
  };

  if (thisToken === activeProbeToken) {
    mediaInfoCache.set(filePath, mockInfo);
    currentMediaInfo = mockInfo;
    updateMetadataDisplay(mockInfo);
    syncMediaDurationToTools(mockInfo);
  }
  return mockInfo;
}

function probeInBrowser(file, filePath) {
  return new Promise((resolve) => {
    const isVideo = file.type.startsWith("video");
    const mediaEl = document.createElement(isVideo ? "video" : "audio");
    const objectUrl = URL.createObjectURL(file);
    const ext = (file.name || filePath).split(".").pop().toLowerCase();
    const browserAudioCodec = ext === "mp3" ? "mp3" : ext === "flac" ? "flac" : ext === "wav" ? "pcm" : ext === "ogg" ? "vorbis" : ext === "opus" ? "opus" : ext === "wma" ? "wma" : "aac";

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
        audio_codec: browserAudioCodec,
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

function renderMarqueeSongTitle(titleText) {
  const audioTitle = document.getElementById("audio-art-title");
  if (!audioTitle) return;
  const safeText = titleText || "Audio Track";
  if (safeText.length > 20) {
    audioTitle.innerHTML = `
      <div class="marquee-scroll-wrap">
        <span class="me-4">${safeText}</span>
        <span class="me-4">${safeText}</span>
      </div>
    `;
  } else {
    audioTitle.textContent = safeText;
  }
}

const actionFrameCache = new Map();

export async function extractActionFrameAsync(filePath, durationSec = 10) {
  if (!filePath) return null;
  if (actionFrameCache.has(filePath)) {
    return actionFrameCache.get(filePath);
  }
  if (window.__TAURI__?.core?.invoke) {
    try {
      const dataUri = await window.__TAURI__.core.invoke("extract_action_frame", {
        filePath,
        durationSeconds: durationSec || 10.0,
      });
      if (dataUri) {
        actionFrameCache.set(filePath, dataUri);
        return dataUri;
      }
    } catch (err) {
      console.warn("extract_action_frame failed:", err);
    }
  }
  return null;
}

export function updateMetadataDisplay(info) {
  const metaInfo = document.getElementById("input-meta-info");
  const pathInput = document.getElementById("input-file-path");

  // Media preview container elements
  const inputsCol = document.getElementById("media-inputs-col");
  const previewCol = document.getElementById("media-preview-col");
  const videoWrapper = document.getElementById("video-preview-wrapper");
  const videoEl = document.getElementById("media-video-preview");
  const actionFrameImg = document.getElementById("video-action-frame-img");
  const audioWrapper = document.getElementById("audio-preview-wrapper");
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
      inputsCol.className = "col-12 col-lg-7 col-xl-7 col-xxl-8";
    }

    if (previewCol) {
      previewCol.className = "col-12 col-lg-5 col-xl-5 col-xxl-4 d-flex flex-column align-self-stretch preview-slide-in";
    }

    if (isAudio) {
      if (videoWrapper) videoWrapper.classList.add("d-none");
      if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute("src");
        videoEl.removeAttribute("poster");
      }
      if (actionFrameImg) {
        actionFrameImg.classList.add("d-none");
        actionFrameImg.removeAttribute("src");
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
      renderMarqueeSongTitle(info.file_name || (info.file_path ? info.file_path.split(/[/\\]/).pop() : "Audio Track"));
      if (audioFormat) audioFormat.textContent = `${(info.audio_codec || ext || "audio").toUpperCase()} Audio`;
      if (audioEl && assetSrc) audioEl.src = assetSrc;

      const waveformCanvas = document.getElementById("trim-waveform-canvas");
      if (waveformCanvas) {
        waveformCanvas.classList.remove("d-none");
        const targetAudioPath = info.file_path || currentInputFile;
        generateWaveformFromSource(targetAudioPath)
          .then((peaks) => {
            currentWaveformPeaks = peaks;
            refreshWaveformDisplay();
          })
          .catch((err) => {
            console.warn("Waveform generation failed:", err);
          });
      }
    } else {
      currentWaveformPeaks = null;
      const waveformCanvas = document.getElementById("trim-waveform-canvas");
      if (waveformCanvas) {
        waveformCanvas.classList.add("d-none");
      }
      if (audioWrapper) audioWrapper.classList.add("d-none");
      if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute("src");
      }
      if (videoWrapper) videoWrapper.classList.remove("d-none");
      if (videoFallback) {
        videoFallback.classList.remove("d-none");
        if (videoFallbackName) videoFallbackName.textContent = info.file_name || "Video Preview";
      }

      if (actionFrameImg) {
        actionFrameImg.classList.add("d-none");
        actionFrameImg.removeAttribute("src");
      }

      if (videoEl) {
        if (assetSrc) {
          videoEl.src = assetSrc;
        } else {
          videoEl.removeAttribute("src");
        }
      }

      // Asynchronously extract and display action frame thumbnail
      const targetVideoPath = info.file_path || currentInputFile;
      if (targetVideoPath) {
        extractActionFrameAsync(targetVideoPath, info.duration_seconds).then((dataUri) => {
          if (dataUri && currentInputFile === targetVideoPath) {
            if (actionFrameImg) {
              actionFrameImg.src = dataUri;
              actionFrameImg.classList.remove("d-none");
            }
            if (videoFallback) videoFallback.classList.add("d-none");
          }
        });
      }
    }
  } else {
    currentWaveformPeaks = null;
    const waveformCanvas = document.getElementById("trim-waveform-canvas");
    if (waveformCanvas) {
      waveformCanvas.classList.add("d-none");
    }
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
let batchQueue = loadSavedBatchQueue();
let selectedBatchIdx = batchQueue.length > 0 ? 0 : -1;

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

export async function initSavedBatchQueue() {
  batchQueue = loadSavedBatchQueue();
  const lastInput = getSavedInputFile();

  if (batchQueue.length === 0 && lastInput) {
    const fileName = lastInput.split(/[/\\]/).pop() || lastInput;
    batchQueue.push({
      path: lastInput,
      name: fileName,
      status: "pending",
    });
    saveBatchQueue(batchQueue);
  }

  if (batchQueue.length > 0) {
    selectedBatchIdx = 0;
    const targetPath = batchQueue[0].path;
    const info = await probeMedia(targetPath);
    if (info) {
      updateMetadataDisplay(info);
    }
  } else if (lastInput) {
    const info = await probeMedia(lastInput);
    if (info) {
      updateMetadataDisplay(info);
    }
  } else {
    updateMetadataDisplay(null);
  }
  renderBatchQueueUI();
}

export async function clearBatchQueue() {
  batchQueue = [];
  selectedBatchIdx = -1;
  saveBatchQueue(batchQueue);
  await probeMedia("");
  renderBatchQueueUI();
}

export async function removeBatchItem(index) {
  if (index >= 0 && index < batchQueue.length) {
    const wasActive = index === selectedBatchIdx;
    batchQueue.splice(index, 1);
    saveBatchQueue(batchQueue);
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
    saveBatchQueue(batchQueue);
    renderBatchQueueUI();
  }
}

export function moveBatchIndexDown(idx) {
  if (idx >= 0 && idx < batchQueue.length - 1) {
    const temp = batchQueue[idx];
    batchQueue[idx] = batchQueue[idx + 1];
    batchQueue[idx + 1] = temp;
    selectedBatchIdx = idx + 1;
    saveBatchQueue(batchQueue);
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

  saveBatchQueue(batchQueue);

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
    saveBatchQueue(batchQueue);
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
    if (btnExecute && btnExecute.textContent !== "Cancel") {
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
    btnExecute.textContent = batchQueue.length > 1 ? `Execute (${batchQueue.length})` : "Execute";
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
          <span class="text-truncate"><strong class="me-2">${idx + 1}.</strong>${item.name}</span>
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
    el.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      const idx = parseInt(el.getAttribute("data-batch-idx"), 10);
      if (idx === selectedBatchIdx) return;
      selectedBatchIdx = idx;

      // Update UI active selection immediately (0ms latency)
      list.querySelectorAll(".list-group-item-action").forEach((itemEl, i) => {
        const isCurrent = i === idx;
        itemEl.classList.toggle("active", isCurrent);
        itemEl.querySelectorAll(".btn-batch-item-up, .btn-batch-item-down, .btn-batch-del").forEach((b) => {
          b.classList.toggle("btn-outline-light", isCurrent);
        });
      });

      // Asynchronously probe media in background without blocking UI
      if (idx >= 0 && idx < batchQueue.length) {
        probeMedia(batchQueue[idx].path);
      }
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

export function refreshWaveformDisplay() {
  const waveformCanvas = document.getElementById("trim-waveform-canvas");
  if (!waveformCanvas || !currentWaveformPeaks) return;
  const dur = currentMediaInfo?.duration_seconds || 120;
  const inputStart = document.getElementById("trim-start");
  const inputEnd = document.getElementById("trim-end");
  const startSec = parseTimestampToSeconds(inputStart?.value);
  const endSec = parseTimestampToSeconds(inputEnd?.value) || dur;
  const startPct = Math.min(100, Math.max(0, (startSec / dur) * 100));
  const endPct = Math.min(100, Math.max(0, (endSec / dur) * 100));

  renderWaveformToCanvas(waveformCanvas, currentWaveformPeaks, {
    startPct,
    endPct,
  });
}

export function syncMediaDurationToTools(mediaInfo) {
  if (!mediaInfo) return;
  const durStr = mediaInfo.duration_string || "00:01:00";
  const formattedDur = durStr.includes(".") ? durStr : `${durStr}.000`;

  const trimStart = document.getElementById("trim-start");
  const trimEnd = document.getElementById("trim-end");
  const trimPos = document.getElementById("trim-current-pos");
  const trimDur = document.getElementById("trim-clip-dur");
  const sliderStart = document.getElementById("trim-slider-start");
  const sliderEnd = document.getElementById("trim-slider-end");
  const rangeBar = document.getElementById("trim-selected-range-bar");

  if (trimStart) trimStart.value = "00:00:00.000";
  if (trimEnd) trimEnd.value = formattedDur;
  if (trimPos) trimPos.textContent = "00:00:00.000";
  if (trimDur) trimDur.textContent = formattedDur;
  if (sliderStart) sliderStart.value = "0";
  if (sliderEnd) sliderEnd.value = "100";
  if (rangeBar) {
    rangeBar.style.marginLeft = "0%";
    rangeBar.style.width = "100%";
  }

  refreshWaveformDisplay();
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
  const btnMarkStart = document.getElementById("btn-trim-mark-start");
  const btnMarkEnd = document.getElementById("btn-trim-mark-end");
  const btnStepBack1 = document.getElementById("btn-trim-step-back-1");
  const btnStepBackFrame = document.getElementById("btn-trim-step-back-frame");
  const btnStepFwdFrame = document.getElementById("btn-trim-step-fwd-frame");
  const btnStepFwd1 = document.getElementById("btn-trim-step-fwd-1");
  const btnPreviewSegment = document.getElementById("btn-trim-preview-segment");
  const btnSetStart0 = document.getElementById("btn-trim-set-start-0");
  const btnSetEndDur = document.getElementById("btn-trim-set-end-dur");

  let fallbackCurrentTime = 0;
  let simPlayInterval = null;

  const getActiveMediaEl = () => {
    if (videoEl && videoEl.src && !videoEl.classList.contains("d-none")) return videoEl;
    if (audioEl && audioEl.src && !audioEl.classList.contains("d-none")) return audioEl;
    if (videoEl && videoEl.src) return videoEl;
    if (audioEl && audioEl.src) return audioEl;
    return null;
  };

  const syncPlayIcon = (isPlaying) => {
    if (btnPlayPause) {
      btnPlayPause.innerHTML = isPlaying
        ? '<i class="bi bi-pause-fill" id="trim-play-icon"></i> Pause'
        : '<i class="bi bi-play-fill" id="trim-play-icon"></i> Play';
    }
  };

  const getMediaCurrentTime = () => {
    const media = getActiveMediaEl();
    if (media && !isNaN(media.currentTime) && media.duration > 0) {
      return media.currentTime;
    }
    return fallbackCurrentTime;
  };

  const setMediaCurrentTime = (timeInSec) => {
    const dur = currentMediaInfo?.duration_seconds || 120;
    fallbackCurrentTime = Math.max(0, Math.min(dur, timeInSec));
    const media = getActiveMediaEl();
    if (media && !isNaN(media.duration) && media.duration > 0) {
      try {
        media.currentTime = fallbackCurrentTime;
      } catch (_) {}
    }
    if (posDisplay) {
      posDisplay.textContent = formatSecondsToTimestamp(fallbackCurrentTime);
    }
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

    refreshWaveformDisplay();
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
      setMediaCurrentTime(startSec);
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
      setMediaCurrentTime(endSec);
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
    if (!media || isNaN(media.currentTime)) return;
    fallbackCurrentTime = media.currentTime;
    if (posDisplay) posDisplay.textContent = formatSecondsToTimestamp(media.currentTime);
  };

  if (videoEl) {
    videoEl.addEventListener("timeupdate", () => onTimeUpdate(videoEl));
    videoEl.addEventListener("play", () => syncPlayIcon(true));
    videoEl.addEventListener("pause", () => syncPlayIcon(false));
    videoEl.addEventListener("ended", () => syncPlayIcon(false));
  }
  if (audioEl) {
    audioEl.addEventListener("timeupdate", () => onTimeUpdate(audioEl));
    audioEl.addEventListener("play", () => syncPlayIcon(true));
    audioEl.addEventListener("pause", () => syncPlayIcon(false));
    audioEl.addEventListener("ended", () => syncPlayIcon(false));
  }

  // Mark In & Mark Out
  if (btnMarkStart) {
    btnMarkStart.addEventListener("click", () => {
      const cur = getMediaCurrentTime();
      if (inputStart) inputStart.value = formatSecondsToTimestamp(cur);
      onTimestampInputsChanged();
    });
  }

  if (btnMarkEnd) {
    btnMarkEnd.addEventListener("click", () => {
      const dur = currentMediaInfo?.duration_seconds || 120;
      const cur = getMediaCurrentTime() || dur;
      if (inputEnd) inputEnd.value = formatSecondsToTimestamp(cur);
      onTimestampInputsChanged();
    });
  }

  // Quick reset buttons
  if (btnSetStart0) {
    btnSetStart0.addEventListener("click", () => {
      if (inputStart) inputStart.value = "00:00:00.000";
      onTimestampInputsChanged();
      setMediaCurrentTime(0);
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
  const startSimulatedPlayback = () => {
    if (simPlayInterval) clearInterval(simPlayInterval);
    syncPlayIcon(true);
    const dur = currentMediaInfo?.duration_seconds || 120;
    simPlayInterval = setInterval(() => {
      let cur = getMediaCurrentTime() + 0.1;
      if (cur >= dur) {
        cur = dur;
        clearInterval(simPlayInterval);
        simPlayInterval = null;
        syncPlayIcon(false);
      }
      setMediaCurrentTime(cur);
    }, 100);
  };

  if (btnPlayPause) {
    btnPlayPause.addEventListener("click", () => {
      const media = getActiveMediaEl();
      if (media && !media.error && media.readyState >= 1) {
        if (media.paused) {
          media.play().catch(() => {
            startSimulatedPlayback();
          });
        } else {
          media.pause();
        }
      } else {
        if (simPlayInterval) {
          clearInterval(simPlayInterval);
          simPlayInterval = null;
          syncPlayIcon(false);
        } else {
          startSimulatedPlayback();
        }
      }
    });
  }

  // Frame Stepping
  const stepMedia = (delta) => {
    const cur = getMediaCurrentTime();
    setMediaCurrentTime(cur + delta);
  };

  if (btnStepBack1) btnStepBack1.addEventListener("click", () => stepMedia(-1.0));
  if (btnStepBackFrame) btnStepBackFrame.addEventListener("click", () => stepMedia(-0.1));
  if (btnStepFwdFrame) btnStepFwdFrame.addEventListener("click", () => stepMedia(0.1));
  if (btnStepFwd1) btnStepFwd1.addEventListener("click", () => stepMedia(1.0));

  // Preview Segment
  const startSimulatedSegment = (startSec, endSec) => {
    if (simPlayInterval) clearInterval(simPlayInterval);
    syncPlayIcon(true);
    simPlayInterval = setInterval(() => {
      let cur = getMediaCurrentTime() + 0.1;
      if (cur >= endSec) {
        cur = endSec;
        clearInterval(simPlayInterval);
        simPlayInterval = null;
        syncPlayIcon(false);
      }
      setMediaCurrentTime(cur);
    }, 100);
  };

  if (btnPreviewSegment) {
    btnPreviewSegment.addEventListener("click", () => {
      const startSec = parseTimestampToSeconds(inputStart?.value);
      const endSec = parseTimestampToSeconds(inputEnd?.value) || (currentMediaInfo?.duration_seconds || 120);
      setMediaCurrentTime(startSec);

      const media = getActiveMediaEl();
      if (media && !media.error && media.readyState >= 1) {
        media.play().catch(() => {
          startSimulatedSegment(startSec, endSec);
        });
        const checkEnd = () => {
          if (media.currentTime >= endSec) {
            media.pause();
            media.removeEventListener("timeupdate", checkEnd);
          }
        };
        media.addEventListener("timeupdate", checkEnd);
      } else {
        startSimulatedSegment(startSec, endSec);
      }
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
