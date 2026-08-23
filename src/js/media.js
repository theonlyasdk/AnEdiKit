import {
  saveInputFile,
  getSavedInputFile,
  loadSavedBatchQueue,
  saveBatchQueue,
  loadSavedImageAiQueue,
  saveImageAiQueue,
} from "./storage.js";
import { generateWaveformFromSource, renderWaveformToCanvas, clearWaveformCache } from "./waveform.js";
import { mediaPreviewManager } from "./preview_providers.js";
import { sharedPlaybackController, MediaPlaybackController } from "./playback.js";

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
  const previewCard = document.getElementById("media-preview-card");
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
    const isImage = ["png", "jpg", "jpeg", "webp", "bmp", "tiff", "tif", "gif", "svg", "ico", "avif", "heic"].includes(ext);
    const isAudio = !isImage && ["mp3", "wav", "flac", "m4a", "ogg", "opus", "wma", "aac", "alac", "aiff"].includes(ext);

    if (inputsCol) inputsCol.className = "col-12 col-lg-7 col-xl-7 col-xxl-8";
    if (previewCol) {
      previewCol.classList.remove("d-none", "preview-slide-in");
      previewCol.classList.add("d-flex");
      void previewCol.offsetWidth;
      previewCol.classList.add("preview-slide-in");
    }

    if (previewCard) {
      previewCard.classList.remove("d-none");
      if (isImage) {
        previewCard.classList.remove("video-mode", "audio-mode");
        previewCard.classList.add("image-mode");
      } else if (isAudio) {
        previewCard.classList.remove("video-mode", "image-mode");
        previewCard.classList.add("audio-mode");
        if (cdSpinner) cdSpinner.classList.remove("d-none");
        if (audioFallbackIcon) audioFallbackIcon.classList.add("d-none");
        if (audioArtImg) audioArtImg.classList.add("d-none");
        renderMarqueeSongTitle(filePath.split(/[/\\]/).pop() || "Audio Track");
        if (audioFormat) audioFormat.textContent = "Loading album art...";
      } else {
        previewCard.classList.remove("audio-mode", "image-mode");
        previewCard.classList.add("video-mode");
      }
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

const mediaChangeListeners = new Set();

export function onMediaChange(callback) {
  if (typeof callback === "function") {
    mediaChangeListeners.add(callback);
  }
  return () => mediaChangeListeners.delete(callback);
}

function notifyMediaChanged(info, filePath) {
  for (const listener of mediaChangeListeners) {
    try {
      listener(info, filePath);
    } catch (e) {
      console.warn("mediaChange listener error:", e);
    }
  }
}

export async function probeMedia(filePath, fileObject = null) {
  if (!filePath) {
    currentInputFile = "";
    currentMediaInfo = null;
    saveInputFile("");
    updateMetadataDisplay(null);
    notifyMediaChanged(null, "");
    return null;
  }

  // Normalize path (decode URL encoding e.g. C%3A%5CUsers -> C:\Users if present)
  let normalizedPath = filePath;
  try {
    if (typeof normalizedPath === "string" && (normalizedPath.includes("%") || normalizedPath.startsWith("file://"))) {
      if (normalizedPath.startsWith("file:///")) {
        normalizedPath = normalizedPath.slice(8);
      } else if (normalizedPath.startsWith("file://")) {
        normalizedPath = normalizedPath.slice(7);
      }
      normalizedPath = decodeURIComponent(normalizedPath);
    }
  } catch (_) {}

  // Normalize windows forward/back slashes
  if (typeof normalizedPath === "string") {
    normalizedPath = normalizedPath.trim();
  }

  filePath = normalizedPath;
  currentInputFile = filePath;
  saveInputFile(filePath);

  // Instant response if already cached
  if (mediaInfoCache.has(filePath)) {
    const cached = mediaInfoCache.get(filePath);
    currentMediaInfo = cached;
    updateMetadataDisplay(cached);
    syncMediaDurationToTools(cached);
    notifyMediaChanged(cached, filePath);
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
        notifyMediaChanged(info, filePath);
        return info;
      }
    } catch (err) {
      console.warn("Tauri get_media_info error:", err);
      // File could not be probed or is missing on disk: show placeholder preview card but hide bottom metadata
      if (thisToken === activeProbeToken) {
        const fileName = filePath.split(/[/\\]/).pop() || filePath;
        const missingInfo = {
          file_path: filePath,
          file_name: fileName,
          duration_seconds: 0.0,
          duration_string: "--:--:--",
          resolution: "--",
          video_codec: "--",
          audio_codec: "--",
          file_size_mb: 0.0,
          file_size_formatted: "-- MB",
          bitrate_kbps: 0,
        };
        currentMediaInfo = missingInfo;
        updateMetadataDisplay(missingInfo);
        syncMediaDurationToTools(missingInfo);
        notifyMediaChanged(missingInfo, filePath);
      }
      return null;
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
      notifyMediaChanged(mediaInfo, filePath);
      return mediaInfo;
    } catch (e) {
      console.warn("Browser media probe error:", e);
      if (thisToken === activeProbeToken) {
        currentMediaInfo = null;
        updateMetadataDisplay(null);
      }
      return null;
    }
  }

  if (thisToken === activeProbeToken) {
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    const placeholderInfo = {
      file_path: filePath,
      file_name: fileName,
      duration_seconds: 0.0,
      duration_string: "--:--:--",
      resolution: "--",
      video_codec: "--",
      audio_codec: "--",
      file_size_mb: 0.0,
      file_size_formatted: "-- MB",
      bitrate_kbps: 0,
    };
    currentMediaInfo = placeholderInfo;
    updateMetadataDisplay(placeholderInfo);
    notifyMediaChanged(placeholderInfo, filePath);
  }
  return null;
}

function probeInBrowser(file, filePath) {
  return new Promise((resolve) => {
    const ext = (file.name || filePath).split(".").pop().toLowerCase();
    const isImage = file.type.startsWith("image") || ["png", "jpg", "jpeg", "webp", "bmp", "tiff", "tif", "gif", "svg", "ico", "avif", "heic"].includes(ext);

    if (isImage) {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const sizeMb = file.size ? (file.size / (1024 * 1024)).toFixed(2) : "2.5";
        resolve({
          file_path: filePath,
          file_name: file.name,
          duration_seconds: 0.0,
          duration_string: "--:--:--",
          resolution: `${img.naturalWidth}x${img.naturalHeight}`,
          video_codec: ext.toUpperCase(),
          audio_codec: "None",
          file_size_mb: parseFloat(sizeMb),
          file_size_formatted: `${sizeMb} MB`,
          bitrate_kbps: 0,
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        const sizeMb = file.size ? (file.size / (1024 * 1024)).toFixed(2) : "2.5";
        resolve({
          file_path: filePath,
          file_name: file.name,
          duration_seconds: 0.0,
          duration_string: "--:--:--",
          resolution: "1920x1080",
          video_codec: ext.toUpperCase(),
          audio_codec: "None",
          file_size_mb: parseFloat(sizeMb),
          file_size_formatted: `${sizeMb} MB`,
          bitrate_kbps: 0,
        });
      };
      img.src = objectUrl;
      return;
    }

    const isVideo = file.type.startsWith("video");
    const mediaEl = document.createElement(isVideo ? "video" : "audio");
    const objectUrl = URL.createObjectURL(file);
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
const albumArtCache = new Map();

export async function extractAlbumArtAsync(filePath) {
  if (!filePath) return null;
  if (albumArtCache.has(filePath)) {
    return albumArtCache.get(filePath);
  }
  if (window.__TAURI__?.core?.invoke) {
    try {
      const dataUri = await window.__TAURI__.core.invoke("extract_album_art", {
        filePath,
      });
      if (dataUri) {
        albumArtCache.set(filePath, dataUri);
        return dataUri;
      }
    } catch (err) {
      console.warn("extract_album_art failed:", err);
    }
  }
  return null;
}

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

export function crossfadeVideoThumbnail(newSrc) {
  const currentImg = document.getElementById("video-action-frame-img");
  const prevImg = document.getElementById("video-action-frame-prev");
  const fallback = document.getElementById("video-preview-fallback");
  const overlay = document.getElementById("video-overlay-info");

  if (!currentImg) return;

  if (!newSrc) {
    currentImg.classList.add("d-none");
    currentImg.classList.remove("thumb-visible");
    if (prevImg) prevImg.classList.add("d-none");
    if (fallback) fallback.classList.remove("d-none");
    return;
  }

  if (fallback) fallback.classList.add("d-none");
  if (overlay) overlay.classList.remove("d-none");

  const oldSrc = currentImg.getAttribute("src");
  if (oldSrc && oldSrc !== newSrc && prevImg) {
    prevImg.src = oldSrc;
    prevImg.classList.remove("d-none");
  }

  currentImg.classList.remove("thumb-visible");
  currentImg.classList.remove("d-none");
  currentImg.src = newSrc;

  requestAnimationFrame(() => {
    currentImg.classList.add("thumb-visible");
    setTimeout(() => {
      if (prevImg) prevImg.classList.add("d-none");
    }, 400);
  });
}

export function crossfadeAudioThumbnail(newSrc) {
  const currentImg = document.getElementById("audio-art-img");
  const prevImg = document.getElementById("audio-art-prev");
  const cdSpinner = document.getElementById("audio-cd-spinner");
  const fallbackIcon = document.getElementById("audio-fallback-icon");

  if (cdSpinner) cdSpinner.classList.add("d-none");

  if (!currentImg) return;

  if (!newSrc) {
    currentImg.classList.add("d-none");
    currentImg.classList.remove("thumb-visible");
    if (prevImg) prevImg.classList.add("d-none");
    if (fallbackIcon) fallbackIcon.classList.remove("d-none");
    return;
  }

  if (fallbackIcon) fallbackIcon.classList.add("d-none");

  const oldSrc = currentImg.getAttribute("src");
  if (oldSrc && oldSrc !== newSrc && prevImg) {
    prevImg.src = oldSrc;
    prevImg.classList.remove("d-none");
  }

  currentImg.classList.remove("thumb-visible");
  currentImg.classList.remove("d-none");
  currentImg.src = newSrc;

  requestAnimationFrame(() => {
    currentImg.classList.add("thumb-visible");
    setTimeout(() => {
      if (prevImg) prevImg.classList.add("d-none");
    }, 400);
  });
}

export function updateMetadataDisplay(info) {
  const metaInfo = document.getElementById("input-meta-info");
  const pathInput = document.getElementById("input-file-path");

  // Media preview container elements
  const inputsCol = document.getElementById("media-inputs-col");
  const previewCol = document.getElementById("media-preview-col");
  const previewCard = document.getElementById("media-preview-card");
  const videoEl = document.getElementById("media-video-preview");
  const actionFrameImg = document.getElementById("video-action-frame-img");
  const actionFramePrev = document.getElementById("video-action-frame-prev");
  const audioEl = document.getElementById("media-audio-preview");

  if (pathInput) {
    pathInput.value = info ? info.file_path || currentInputFile : "";
  }

  if (info && info.file_path) {
    const ext = (info.file_name || info.file_path).split(".").pop().toLowerCase();
    const isImage = ["png", "jpg", "jpeg", "webp", "bmp", "tiff", "gif", "svg", "ico"].includes(ext);
    const isAudio =
      !isImage &&
      (info.resolution === "N/A" ||
      info.video_codec === "None" ||
      ["mp3", "wav", "flac", "m4a", "ogg", "opus", "wma", "aac"].includes(ext));

    let cleanPath = info.file_path;
    try {
      if (cleanPath.includes("%") || cleanPath.startsWith("file://")) {
        if (cleanPath.startsWith("file:///")) cleanPath = cleanPath.slice(8);
        else if (cleanPath.startsWith("file://")) cleanPath = cleanPath.slice(7);
        cleanPath = decodeURIComponent(cleanPath);
      }
    } catch (_) {}

    const assetSrc =
      window.__TAURI__?.core?.convertFileSrc && cleanPath
        ? window.__TAURI__.core.convertFileSrc(cleanPath)
        : cleanPath || "";

    const videoFallback = document.getElementById("video-preview-fallback");
    const videoFallbackName = document.getElementById("video-fallback-filename");
    const audioFormat = document.getElementById("audio-art-format");
    const cdSpinner = document.getElementById("audio-cd-spinner");
    const audioFallbackIcon = document.getElementById("audio-fallback-icon");
    const audioArtImg = document.getElementById("audio-art-img");
    const imageLayer = document.getElementById("image-preview-layer");
    const imageEl = document.getElementById("media-image-preview");
    const imageOverlayTitle = document.getElementById("image-overlay-title");
    const imageOverlayFormat = document.getElementById("image-overlay-format");
    const videoLayer = document.getElementById("video-preview-layer");
    const audioLayer = document.getElementById("audio-preview-layer");

    if (inputsCol) {
      inputsCol.className = "col-12 col-lg-7 col-xl-7 col-xxl-8";
    }

    if (previewCol) {
      previewCol.className = "col-12 col-lg-5 col-xl-5 col-xxl-4 d-flex flex-column align-self-stretch preview-slide-in";
    }

    if (previewCard) {
      previewCard.classList.remove("d-none");
    }

    // Render preview via Media Preview Provider System
    mediaPreviewManager.renderPreview({
      info,
      ext,
      assetSrc,
      previewCard,
      imageLayer,
      videoLayer,
      audioLayer,
      imageEl,
      imageOverlayTitle,
      imageOverlayFormat,
      videoEl,
      audioEl,
      actionFrameImg,
      actionFramePrev,
      cdSpinner,
      audioFallbackIcon,
      audioArtImg,
      audioFormat,
      videoFallback,
      videoFallbackName,
      videoOverlay: document.getElementById("video-overlay-info"),
      videoOverlayTitle: document.getElementById("video-overlay-title"),
      videoOverlayFormat: document.getElementById("video-overlay-format"),
      fallbackIcon: document.getElementById("video-fallback-icon"),
      waveformCanvas: document.getElementById("trim-waveform-canvas"),
      currentInputFile,
      getCurrentFile: () => currentInputFile,
      actionFrameCache,
      albumArtCache,
      crossfadeAudioThumbnail,
      crossfadeVideoThumbnail,
      renderMarqueeSongTitle,
      extractAlbumArtAsync,
      extractActionFrameAsync,
      generateWaveformFromSource,
      refreshWaveformDisplay,
    });
  } else {
    // If no media loaded, keep the layout clean:
    if (inputsCol) {
      inputsCol.className = "col-12";
    }
    if (previewCol) {
      previewCol.classList.remove("d-flex", "preview-slide-in");
      previewCol.classList.add("d-none");
    }
    if (previewCard) {
      previewCard.classList.add("d-none");
    }
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

  if (info && (info.duration_seconds > 0 || info.video_codec !== "--" || info.audio_codec !== "--" || info.file_size_mb > 0)) {
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

export function syncVideoPreviewForActiveTool(toolId) {
  if (!currentMediaInfo) return;
  const previewCard = document.getElementById("media-preview-card");
  const videoEl = document.getElementById("media-video-preview");
  const actionFrameImg = document.getElementById("video-action-frame-img");
  const videoFallback = document.getElementById("video-preview-fallback");
  const videoOverlay = document.getElementById("video-overlay-info");
  const audioLayer = document.getElementById("audio-preview-layer");
  const imageLayer = document.getElementById("image-preview-layer");
  const videoLayer = document.getElementById("video-preview-layer");

  const filePath = currentMediaInfo.file_path || currentInputFile;
  const isAudio = isAudioFile(filePath) || currentMediaInfo.video_codec === "None" || currentMediaInfo.resolution === "N/A";
  const isImage = isImageFile(filePath);

  if (isImage) {
    if (previewCard) {
      previewCard.classList.remove("d-none", "video-mode", "audio-mode");
      previewCard.classList.add("image-mode");
    }
    if (imageLayer) imageLayer.classList.remove("d-none");
    if (videoLayer) videoLayer.classList.add("d-none");
    if (audioLayer) audioLayer.classList.add("d-none");
    return;
  }

  if (isAudio) {
    if (previewCard) {
      previewCard.classList.remove("d-none", "video-mode", "image-mode");
      previewCard.classList.add("audio-mode");
    }
    if (audioLayer) audioLayer.classList.remove("d-none");
    if (videoLayer) videoLayer.classList.add("d-none");
    if (imageLayer) imageLayer.classList.add("d-none");
    if (videoEl) {
      videoEl.pause();
      videoEl.classList.add("d-none");
    }
    return;
  }

  // Video media
  if (previewCard) {
    previewCard.classList.remove("d-none", "audio-mode", "image-mode");
    previewCard.classList.add("video-mode");
  }
  if (videoLayer) videoLayer.classList.remove("d-none");
  if (audioLayer) audioLayer.classList.add("d-none");
  if (imageLayer) imageLayer.classList.add("d-none");

  if (toolId === "trim") {
    if (actionFrameImg) actionFrameImg.classList.add("d-none");
    if (videoFallback) videoFallback.classList.add("d-none");
    if (videoOverlay) videoOverlay.classList.remove("d-none");
    if (videoEl) {
      videoEl.classList.remove("d-none");
      const assetSrc =
        window.__TAURI__?.core?.convertFileSrc && currentMediaInfo.file_path
          ? window.__TAURI__.core.convertFileSrc(currentMediaInfo.file_path)
          : "";
      if (assetSrc && videoEl.src !== assetSrc) {
        videoEl.src = assetSrc;
      }
    }
  } else {
    if (actionFrameImg && actionFrameImg.getAttribute("src")) {
      actionFrameImg.classList.remove("d-none");
      if (videoFallback) videoFallback.classList.add("d-none");
      if (videoOverlay) videoOverlay.classList.remove("d-none");
      if (videoEl) {
        videoEl.pause();
        videoEl.classList.add("d-none");
      }
    }
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
      } else if (item.status === "error") {
        statusBadge = `<span class="badge bg-danger-subtle text-danger-emphasis"><i class="bi bi-x"></i> Failed</span>`;
      }

      let leadingCheckBtn = "";
      if (item.status === "done") {
        leadingCheckBtn = `<button class="btn btn-success btn-sm py-0 px-2 disabled me-2 border-0 flex-shrink-0" type="button" tabindex="-1" style="pointer-events: none;"><i class="bi bi-check-lg"></i></button>`;
      }

      const isSelected = idx === selectedBatchIdx;
      return `
        <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2 ${isSelected ? 'active' : ''}" data-batch-idx="${idx}" style="cursor: pointer;">
          <div class="d-flex align-items-center text-truncate me-2 flex-grow-1">
            ${leadingCheckBtn}
            <span class="text-truncate"><strong class="me-2">${idx + 1}.</strong>${item.name}</span>
          </div>
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

export function refreshWaveformDisplay(peaks = null) {
  if (peaks) {
    currentWaveformPeaks = peaks;
  }
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

export function isAudioFile(filePath) {
  if (!filePath) return false;
  const ext = filePath.split(/[?#]/)[0].split(".").pop().toLowerCase();
  return ["mp3", "wav", "flac", "m4a", "ogg", "opus", "wma", "aac", "aiff", "alac"].includes(ext);
}

export function isImageFile(filePath) {
  if (!filePath) return false;
  const ext = filePath.split(/[?#]/)[0].split(".").pop().toLowerCase();
  return ["png", "jpg", "jpeg", "webp", "bmp", "tiff", "gif", "svg", "ico"].includes(ext);
}

export function isVideoFile(filePath) {
  if (!filePath) return false;
  return !isAudioFile(filePath) && !isImageFile(filePath);
}

let currentTimelineExtractToken = 0;

export async function extractTimelineThumbnailsAsync(filePath, duration) {
  const container = document.getElementById("trim-filmstrip-container");
  const waveformCanvas = document.getElementById("trim-waveform-canvas");
  if (!container || !filePath) return;

  const thisToken = ++currentTimelineExtractToken;
  const isAudio = isAudioFile(filePath) || currentMediaInfo?.video_codec === "None" || currentMediaInfo?.resolution === "N/A";
  const isImage = isImageFile(filePath);

  if (isImage) {
    const emptyEl = document.getElementById("trim-filmstrip-empty");
    const unsupportedEl = document.getElementById("trim-filmstrip-unsupported");
    if (emptyEl) {
      emptyEl.classList.add("d-none");
      emptyEl.classList.remove("d-flex");
    }
    if (unsupportedEl) {
      unsupportedEl.classList.remove("d-none");
      unsupportedEl.classList.add("d-flex");
    }
    if (waveformCanvas) waveformCanvas.classList.add("d-none");
    return;
  }

  if (isAudio) {
    container.innerHTML = "";
    if (waveformCanvas) {
      waveformCanvas.classList.remove("d-none");
    }
    const targetAudioPath = filePath || currentInputFile;
    if (targetAudioPath) {
      generateWaveformFromSource(targetAudioPath)
        .then((peaks) => {
          if (thisToken !== currentTimelineExtractToken) return;
          currentWaveformPeaks = peaks;
          refreshWaveformDisplay(peaks);
        })
        .catch((err) => console.warn("Waveform generation failed:", err));
    }
    return;
  }

  if (waveformCanvas) waveformCanvas.classList.add("d-none");

  const frameCount = 12;
  const dur = Math.max(0.5, duration || 10.0);

  // Render individual frame slot placeholders for live progressive feedback
  let slotsHtml = "";
  for (let i = 0; i < frameCount; i++) {
    slotsHtml += `
      <div id="trim-slot-${i}" class="trim-timeline-frame-slot d-flex align-items-center justify-content-center bg-black bg-opacity-75 text-secondary position-relative overflow-hidden" style="flex: 1 1 0px; height: 100%; min-width: 0; border-right: 1px solid rgba(0,0,0,0.5);">
        <span class="spinner-border spinner-border-sm opacity-25" style="width: 0.85rem; height: 0.85rem;"></span>
      </div>
    `;
  }
  container.innerHTML = slotsHtml;

  if (window.__TAURI__?.core?.invoke) {
    // Extract frames with live progressive frame-by-frame updates
    for (let i = 0; i < frameCount; i++) {
      const ts = dur * ((i + 0.5) / frameCount);
      window.__TAURI__.core.invoke("extract_timeline_frame", {
        filePath,
        frameIndex: i + 1,
        timestampSeconds: ts,
      }).then((dataUri) => {
        if (thisToken !== currentTimelineExtractToken) return;
        const slotEl = document.getElementById(`trim-slot-${i}`);
        if (slotEl && dataUri) {
          slotEl.innerHTML = `<img class="trim-timeline-frame-item w-100 h-100 object-fit-cover" src="${dataUri}" alt="Frame ${i + 1}" />`;
        }
      }).catch((err) => {
        console.warn(`Frame ${i + 1} extraction error:`, err);
      });
    }
    return;
  }

  // Fallback if in web mode
  container.innerHTML = `
    <div class="w-100 h-100 d-flex align-items-center justify-content-center text-body-secondary small">
      <i class="bi bi-film me-2"></i> Video Timeline
    </div>
  `;
}

export function syncMediaDurationToTools(mediaInfo) {
  if (!mediaInfo) return;
  const durSec = mediaInfo.duration_seconds || 60;
  const durStr = mediaInfo.duration_string || "00:01:00";
  const formattedDur = durStr.includes(".") ? durStr : `${durStr}.000`;

  sharedPlaybackController.setDuration(durSec);
  sharedPlaybackController.setCurrentTime(0);

  const trimStart = document.getElementById("trim-start");
  const trimEnd = document.getElementById("trim-end");
  const trimPos = document.getElementById("trim-current-pos");
  const trimDur = document.getElementById("trim-clip-dur");
  const sliderStart = document.getElementById("trim-slider-start");
  const sliderEnd = document.getElementById("trim-slider-end");

  const dimmerLeft = document.getElementById("trim-dimmer-left");
  const dimmerRight = document.getElementById("trim-dimmer-right");
  const selectionWindow = document.getElementById("trim-selection-window");
  const playhead = document.getElementById("trim-playhead");

  const scaleStart = document.getElementById("trim-scale-start");
  const scaleMid = document.getElementById("trim-scale-mid");
  const scaleEnd = document.getElementById("trim-scale-end");

  if (trimStart) trimStart.value = "00:00:00.000";
  if (trimEnd) trimEnd.value = formattedDur;
  if (trimPos) trimPos.textContent = "00:00:00.000";
  if (trimDur) trimDur.textContent = formattedDur;
  if (sliderStart) sliderStart.value = "0";
  if (sliderEnd) sliderEnd.value = "100";

  if (dimmerLeft) dimmerLeft.style.width = "0%";
  if (dimmerRight) dimmerRight.style.width = "0%";
  if (selectionWindow) {
    selectionWindow.style.left = "0%";
    selectionWindow.style.width = "100%";
  }
  if (playhead) {
    playhead.style.left = "0%";
    playhead.style.display = "block";
  }

  if (scaleStart) scaleStart.textContent = "00:00:00.000";
  if (scaleMid) scaleMid.textContent = formatSecondsToTimestamp(durSec / 2);
  const filmstripEmpty = document.getElementById("trim-filmstrip-empty");
  const filmstripUnsupported = document.getElementById("trim-filmstrip-unsupported");
  const trimControlsCard = document.getElementById("trim-controls-card");
  const isImage = isImageFile(mediaInfo.file_path);
  const isUnsupported = isImage || (mediaInfo.duration_seconds <= 0 && mediaInfo.video_codec === "None" && mediaInfo.audio_codec === "None");

  if (isUnsupported) {
    if (filmstripEmpty) {
      filmstripEmpty.classList.add("d-none");
      filmstripEmpty.classList.remove("d-flex");
    }
    if (filmstripUnsupported) {
      filmstripUnsupported.classList.remove("d-none");
      filmstripUnsupported.classList.add("d-flex");
    }
    if (trimControlsCard) {
      trimControlsCard.classList.add("opacity-50", "pe-none");
    }
    if (trimStart) trimStart.disabled = true;
    if (trimEnd) trimEnd.disabled = true;
    const trimMode = document.getElementById("trim-mode");
    if (trimMode) trimMode.disabled = true;
  } else {
    if (filmstripUnsupported) {
      filmstripUnsupported.classList.add("d-none");
      filmstripUnsupported.classList.remove("d-flex");
    }
    if (trimControlsCard) {
      trimControlsCard.classList.remove("opacity-50", "pe-none");
    }
    if (trimStart) trimStart.disabled = false;
    if (trimEnd) trimEnd.disabled = false;
    const trimMode = document.getElementById("trim-mode");
    if (trimMode) trimMode.disabled = false;
  }

  if (mediaInfo.file_path && !isUnsupported) {
    extractTimelineThumbnailsAsync(mediaInfo.file_path, durSec);
  }

  refreshWaveformDisplay();
}

export function initTrimmerControls() {
  const sliderStart = document.getElementById("trim-slider-start");
  const sliderEnd = document.getElementById("trim-slider-end");
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
  const playheadEl = document.getElementById("trim-playhead");
  const trackEl = document.getElementById("trim-timeline-track");
  const tooltipPlayhead = document.getElementById("trim-tooltip-playhead");
  const tooltipStart = document.getElementById("trim-tooltip-start");
  const tooltipEnd = document.getElementById("trim-tooltip-end");

  sharedPlaybackController.setMediaElements({ videoEl, audioEl });

  const updateRangeBarUI = (startSec, endSec, totalDur) => {
    if (totalDur <= 0) totalDur = 1;
    const startPct = Math.min(100, Math.max(0, (startSec / totalDur) * 100));
    const endPct = Math.min(100, Math.max(0, (endSec / totalDur) * 100));
    const widthPct = Math.max(0, endPct - startPct);

    const dimmerLeft = document.getElementById("trim-dimmer-left");
    const dimmerRight = document.getElementById("trim-dimmer-right");
    const selectionWindow = document.getElementById("trim-selection-window");

    if (dimmerLeft) dimmerLeft.style.width = `${startPct}%`;
    if (dimmerRight) dimmerRight.style.width = `${Math.max(0, 100 - endPct)}%`;
    if (selectionWindow) {
      selectionWindow.style.left = `${startPct}%`;
      selectionWindow.style.width = `${widthPct}%`;
    }

    if (sliderStart) sliderStart.value = startPct.toString();
    if (sliderEnd) sliderEnd.value = endPct.toString();

    const diff = Math.max(0, endSec - startSec);
    if (clipDurBadge) clipDurBadge.textContent = formatSecondsToTimestamp(diff);

    refreshWaveformDisplay();
  };

  const showTooltip = (el, text, pct) => {
    if (!el) return;
    el.textContent = text;
    el.style.left = `${pct}%`;
    el.classList.remove("d-none");
  };

  const hideTooltip = (el) => {
    if (!el) return;
    el.classList.add("d-none");
  };

  const onTimestampInputsChanged = () => {
    const dur = currentMediaInfo?.duration_seconds || 120;
    const startSec = parseTimestampToSeconds(inputStart?.value);
    const endSec = parseTimestampToSeconds(inputEnd?.value) || dur;
    updateRangeBarUI(startSec, endSec, dur);
  };

  if (inputStart) inputStart.addEventListener("input", onTimestampInputsChanged);
  if (inputEnd) inputEnd.addEventListener("input", onTimestampInputsChanged);

  const stopSliderProp = (e) => e.stopPropagation();

  if (sliderStart) {
    sliderStart.addEventListener("mousedown", stopSliderProp);
    sliderStart.addEventListener("touchstart", stopSliderProp, { passive: true });
    sliderStart.addEventListener("pointerdown", stopSliderProp);

    sliderStart.addEventListener("input", (e) => {
      e.stopPropagation();
      const dur = currentMediaInfo?.duration_seconds || 120;
      let startVal = parseFloat(sliderStart.value);
      let endVal = parseFloat(sliderEnd ? sliderEnd.value : 100);
      if (startVal > endVal) {
        startVal = endVal;
        sliderStart.value = startVal.toString();
      }
      const startSec = (startVal / 100) * dur;
      const endSec = (endVal / 100) * dur;

      if (inputStart) inputStart.value = formatSecondsToTimestamp(startSec);
      updateRangeBarUI(startSec, endSec, dur);
      showTooltip(tooltipStart, formatSecondsToTimestamp(startSec), startVal);
    });
    sliderStart.addEventListener("pointerdown", () => {
      const dur = currentMediaInfo?.duration_seconds || 120;
      const startVal = parseFloat(sliderStart.value);
      const startSec = (startVal / 100) * dur;
      showTooltip(tooltipStart, formatSecondsToTimestamp(startSec), startVal);
    });
    sliderStart.addEventListener("pointerup", () => hideTooltip(tooltipStart));
    sliderStart.addEventListener("pointercancel", () => hideTooltip(tooltipStart));
    sliderStart.addEventListener("blur", () => hideTooltip(tooltipStart));
  }

  if (sliderEnd) {
    sliderEnd.addEventListener("mousedown", stopSliderProp);
    sliderEnd.addEventListener("touchstart", stopSliderProp, { passive: true });
    sliderEnd.addEventListener("pointerdown", stopSliderProp);

    sliderEnd.addEventListener("input", (e) => {
      e.stopPropagation();
      const dur = currentMediaInfo?.duration_seconds || 120;
      let startVal = parseFloat(sliderStart ? sliderStart.value : 0);
      let endVal = parseFloat(sliderEnd.value);
      if (endVal < startVal) {
        endVal = startVal;
        sliderEnd.value = endVal.toString();
      }
      const startSec = (startVal / 100) * dur;
      const endSec = (endVal / 100) * dur;

      if (inputEnd) inputEnd.value = formatSecondsToTimestamp(endSec);
      updateRangeBarUI(startSec, endSec, dur);
      showTooltip(tooltipEnd, formatSecondsToTimestamp(endSec), endVal);
    });
    sliderEnd.addEventListener("pointerdown", () => {
      const dur = currentMediaInfo?.duration_seconds || 120;
      const endVal = parseFloat(sliderEnd.value);
      const endSec = (endVal / 100) * dur;
      showTooltip(tooltipEnd, formatSecondsToTimestamp(endSec), endVal);
    });
    sliderEnd.addEventListener("pointerup", () => hideTooltip(tooltipEnd));
    sliderEnd.addEventListener("pointercancel", () => hideTooltip(tooltipEnd));
    sliderEnd.addEventListener("blur", () => hideTooltip(tooltipEnd));
  }

  // Bind full playback controls to sharedPlaybackController
  sharedPlaybackController.bindControls({
    btnPlayPause,
    posDisplay,
    playheadEl,
    trackEl,
    inputStart,
    inputEnd,
    tooltipPlayhead,
    btnMarkStart,
    btnMarkEnd,
    btnStepBack1,
    btnStepBackFrame,
    btnStepFwdFrame,
    btnStepFwd1,
    btnSetStart0,
    btnSetEndDur,
    onRangeChanged: onTimestampInputsChanged,
  });

  if (btnPreviewSegment) {
    btnPreviewSegment.addEventListener("click", () => {
      const dur = currentMediaInfo?.duration_seconds || 120;
      const startSec = parseTimestampToSeconds(inputStart?.value);
      const endSec = parseTimestampToSeconds(inputEnd?.value) || dur;
      sharedPlaybackController.setCurrentTime(startSec);
      sharedPlaybackController.play();

      const unsubscribe = sharedPlaybackController.onTimeUpdate((time) => {
        if (time >= endSec) {
          sharedPlaybackController.pause();
          unsubscribe();
        }
      });
    });
  }
}

export function initDragAndDrop(onFileSelected) {
  const activatePulse = () => {
    const group = document.querySelector("#shared-input-card .input-group");
    if (group) group.classList.add("input-drop-pulsing");

    const imgEmptyMsg = document.getElementById("image-ai-empty-msg");
    const imgDropLabel = document.getElementById("image-drop-label");
    if (imgEmptyMsg) {
      imgEmptyMsg.classList.add("image-drop-active");
    }
    if (imgDropLabel) {
      imgDropLabel.textContent = "Drop here to import";
    }

    const placeholder = document.getElementById("image-queue-drop-placeholder");
    if (placeholder) {
      placeholder.classList.remove("d-none");
      const listEl = document.getElementById("image-ai-queue-list");
      if (listEl) {
        listEl.scrollTo({ top: listEl.scrollHeight, behavior: "smooth" });
      }
    }
  };

  const deactivatePulse = () => {
    const group = document.querySelector("#shared-input-card .input-group");
    if (group) group.classList.remove("input-drop-pulsing");

    const imgEmptyMsg = document.getElementById("image-ai-empty-msg");
    const imgDropLabel = document.getElementById("image-drop-label");
    if (imgEmptyMsg) {
      imgEmptyMsg.classList.remove("image-drop-active");
    }
    if (imgDropLabel) {
      imgDropLabel.textContent = "Drop images here or click to select";
    }

    const placeholder = document.getElementById("image-queue-drop-placeholder");
    if (placeholder) {
      placeholder.classList.add("d-none");
    }
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
        (f) => f.path || f.name || "",
      ).filter(Boolean);

      const activeTool = document.querySelector("#tool-nav .nav-link.active, #image-ai-nav .nav-link.active")?.dataset?.tool;
      const isImageTool = [
        "bg_remover",
        "ai_upscaler",
        "vectorizer",
        "restore_denoise",
        "icon_generator",
        "metadata_cleaner",
      ].includes(activeTool);

      if (isImageTool) {
        await addImageFilesToQueue(filePaths);
      } else {
        await addFilesToBatch(filePaths);
        if (onFileSelected) onFileSelected(currentMediaInfo);
      }
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
              const activeTool = document.querySelector("#tool-nav .nav-link.active, #image-ai-nav .nav-link.active")?.dataset?.tool;
              const isImageTool = [
                "bg_remover",
                "ai_upscaler",
                "vectorizer",
                "restore_denoise",
                "icon_generator",
                "metadata_cleaner",
              ].includes(activeTool);

              if (isImageTool) {
                await addImageFilesToQueue(event.payload.paths);
              } else {
                await addFilesToBatch(event.payload.paths);
                if (onFileSelected) onFileSelected(currentMediaInfo);
              }
            }
          }
        });
      }
    } catch (err) {
      console.warn("Tauri drag drop init error:", err);
    }
  }
}

// Image AI Queue State & Management
let imageAiQueue = loadSavedImageAiQueue();

export function initSavedImageAiQueue() {
  imageAiQueue = loadSavedImageAiQueue();
  renderImageAiQueueUI();
}

export function getImageAiQueue() {
  return imageAiQueue;
}

export function updateImageAiItemStatus(idx, status, resultPath = null) {
  if (idx >= 0 && idx < imageAiQueue.length) {
    imageAiQueue[idx].status = status; // "pending", "processing", "done", "error"
    if (resultPath) {
      imageAiQueue[idx].resultPath = resultPath;
    }
    saveImageAiQueue(imageAiQueue);
    renderImageAiQueueUI();
  }
}

export function removeImageAiQueueItem(idx) {
  if (idx >= 0 && idx < imageAiQueue.length) {
    imageAiQueue.splice(idx, 1);
    saveImageAiQueue(imageAiQueue);
    renderImageAiQueueUI();
  }
}

export function clearImageAiQueue() {
  imageAiQueue = [];
  saveImageAiQueue(imageAiQueue);
  renderImageAiQueueUI();
}

export async function addImageFilesToQueue(paths) {
  if (!paths || paths.length === 0) return;
  for (const p of paths) {
    if (!p) continue;
    if (!imageAiQueue.some((item) => item.path === p)) {
      const fileName = p.split(/[/\\]/).pop() || p;
      imageAiQueue.push({
        path: p,
        name: fileName,
        status: "pending",
        resultPath: null,
      });
    }
  }
  saveImageAiQueue(imageAiQueue);
  renderImageAiQueueUI();
}

export function renderImageAiQueueUI() {
  const countEl = document.getElementById("image-ai-queue-count");
  const listEl = document.getElementById("image-ai-queue-list");
  const btnClear = document.getElementById("btn-image-clear");
  const btnExecute = document.getElementById("btn-execute");

  if (countEl) countEl.textContent = imageAiQueue.length.toString();
  if (btnClear) btnClear.classList.toggle("d-none", imageAiQueue.length === 0);

  if (imageAiQueue.length === 0) {
    listEl.className = "mb-3";
    listEl.style.maxHeight = "";
    listEl.style.overflowY = "visible";
    listEl.innerHTML = `
      <div class="list-group-item text-body-secondary text-center py-5 d-flex flex-column align-items-center justify-content-center gap-2 rounded bg-body-tertiary" id="image-ai-empty-msg" style="border: 2px dashed var(--bs-border-color); cursor: pointer; overscroll-behavior: none;">
        <i class="bi bi-images fs-2 text-secondary opacity-50 mb-1"></i>
        <span class="fw-medium text-body" id="image-drop-label">Drop images here or click to select</span>
        <span class="small text-body-secondary" id="image-drop-sublabel">Supports PNG, JPG, WebP, BMP, TIFF, SVG</span>
        <button class="btn btn-outline-primary btn-sm mt-2" type="button" id="btn-image-add-empty" title="Add images to queue">
          <i class="bi bi-folder2-open me-1"></i> Select Images
        </button>
      </div>
    `;
    const btnEmpty = document.getElementById("btn-image-add-empty");
    const emptyMsg = document.getElementById("image-ai-empty-msg");
    const pickHandler = async () => {
      const selected = await selectMediaFiles("image");
      if (selected && selected.length > 0) {
        await addImageFilesToQueue(selected);
      }
    };
    if (btnEmpty) btnEmpty.addEventListener("click", pickHandler);
    if (emptyMsg) emptyMsg.addEventListener("click", (e) => {
      if (!e.target.closest("button")) pickHandler();
    });

    if (btnExecute && btnExecute.textContent !== "Cancel") {
      btnExecute.textContent = "Execute";
    }
    return;
  }

  listEl.className = "list-group border rounded overflow-y-auto mb-3";
  listEl.style.maxHeight = "260px";
  listEl.style.overflowY = "auto";
  listEl.style.overscrollBehavior = "contain";

  if (btnExecute && btnExecute.textContent !== "Cancel") {
    btnExecute.textContent = imageAiQueue.length > 1 ? `Execute (${imageAiQueue.length})` : "Execute";
  }

  const placeholderHtml = `
    <div id="image-queue-drop-placeholder" class="list-group-item image-queue-drop-placeholder text-primary py-3 text-center d-flex align-items-center justify-content-center gap-2 d-none" style="cursor: pointer;">
      <i class="bi bi-cloud-arrow-up-fill fs-5 text-primary"></i>
      <span class="fw-semibold text-primary">Drop here to import</span>
    </div>
  `;

  listEl.innerHTML = imageAiQueue
    .map((item, idx) => {
      const assetSrc = window.__TAURI__?.core?.convertFileSrc
        ? window.__TAURI__.core.convertFileSrc(item.path)
        : "";

      let statusBadge = `<span class="badge bg-secondary-subtle text-secondary-emphasis">Ready</span>`;
      let compareBtn = "";

      if (item.status === "processing") {
        statusBadge = `<span class="badge bg-primary-subtle text-primary-emphasis d-inline-flex align-items-center gap-1"><span class="spinner-border spinner-border-sm" style="width: 10px; height: 10px;" role="status"></span> Processing</span>`;
      } else if (item.status === "done") {
        statusBadge = `<span class="badge bg-success-subtle text-success-emphasis"><i class="bi bi-check-lg"></i> Done</span>`;
        if (item.resultPath) {
          compareBtn = `<button class="btn btn-primary btn-sm py-0 px-2 btn-image-compare me-1" data-comp-idx="${idx}" type="button" title="View sliding comparison"><i class="bi bi-layout-split me-1"></i> Compare</button>`;
        }
      } else if (item.status === "error") {
        statusBadge = `<span class="badge bg-danger-subtle text-danger-emphasis"><i class="bi bi-x"></i> Failed</span>`;
      }

      return `
        <div class="list-group-item image-queue-item d-flex justify-content-between align-items-center py-2 px-3">
          <div class="d-flex align-items-center gap-3 text-truncate me-2 flex-grow-1 btn-image-preview-thumb" data-preview-idx="${idx}" style="cursor: pointer;" title="Click to expand preview">
            <div class="image-queue-thumb-wrapper transparency-grid border flex-shrink-0 position-relative">
              <img class="image-queue-thumb" src="${assetSrc}" alt="${item.name}" onerror="this.onerror=null; this.classList.add('d-none'); this.nextElementSibling?.classList.remove('d-none'); const qItem = this.closest('.image-queue-item'); if (qItem) { qItem.classList.add('image-item-deleted'); const title = qItem.querySelector('.image-queue-item-title'); if (title) { title.classList.remove('text-body'); title.classList.add('text-danger', 'text-decoration-line-through'); } const badge = qItem.querySelector('.image-queue-status-badge'); if (badge) { badge.className = 'badge bg-danger-subtle text-danger image-queue-status-badge'; badge.innerHTML = '<i class=\\'bi bi-exclamation-circle-fill me-1\\'></i>Deleted'; } }" />
              <div class="image-queue-thumb-fallback d-none position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-dark">
                <i class="bi bi-exclamation-circle-fill text-danger fs-5"></i>
              </div>
              <div class="image-queue-thumb-overlay">
                <i class="bi bi-arrows-angle-expand"></i>
              </div>
            </div>
            <div class="d-flex flex-column text-truncate">
              <span class="fw-medium text-body text-truncate image-queue-item-title" style="font-size: 0.88rem;">${item.name}</span>
              <span class="small text-body-secondary text-truncate" style="font-size: 0.75rem;">${item.path}</span>
            </div>
          </div>
          <div class="d-flex align-items-center gap-2 flex-shrink-0">
            <span class="image-queue-status-badge">${statusBadge}</span>
            ${compareBtn}
            <button class="btn btn-outline-danger btn-sm py-0 px-2 btn-image-del" data-del-img-idx="${idx}" type="button" title="Remove from queue">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      `;
    })
    .join("") + placeholderHtml;

  const dropPlaceholder = document.getElementById("image-queue-drop-placeholder");
  if (dropPlaceholder) {
    dropPlaceholder.addEventListener("click", async () => {
      const selected = await selectMediaFiles("image");
      if (selected && selected.length > 0) {
        await addImageFilesToQueue(selected);
      }
    });
  }

  // Event delegation for queue list interactions
  listEl.onclick = (e) => {
    // Preview click
    const previewBtn = e.target.closest(".btn-image-preview-thumb");
    if (previewBtn) {
      e.stopPropagation();
      const idx = parseInt(previewBtn.getAttribute("data-preview-idx"), 10);
      const item = imageAiQueue[idx];
      if (item && item.path) {
        const thumbEl = previewBtn.querySelector(".image-queue-thumb-wrapper") || previewBtn;
        openImageLightbox(item.path, item.name, thumbEl);
      }
      return;
    }

    // Delete click
    const delBtn = e.target.closest(".btn-image-del");
    if (delBtn) {
      e.stopPropagation();
      const idx = parseInt(delBtn.getAttribute("data-del-img-idx"), 10);
      removeImageAiQueueItem(idx);
      return;
    }

    // Compare click
    const compBtn = e.target.closest(".btn-image-compare");
    if (compBtn) {
      e.stopPropagation();
      const idx = parseInt(compBtn.getAttribute("data-comp-idx"), 10);
      const item = imageAiQueue[idx];
      if (item && item.resultPath) {
        import("./comparison.js").then((mod) => {
          mod.openComparisonModal(item.path, item.resultPath, "Enhanced Image");
        });
      }
      return;
    }
  };
}

let lastHeroSourceEl = null;
let lastHeroRect = null;
let lightboxOpenTimestamp = 0;
let isLightboxActive = false;
let lastFinalW = 800;
let lastFinalH = 600;

export function initImageLightbox() {
  const modal = document.getElementById("image-lightbox-modal");
  const card = document.getElementById("image-lightbox-card");
  const backdrop = document.getElementById("image-lightbox-backdrop");
  const btnClose = document.getElementById("btn-lightbox-close");
  if (!modal) return;

  const closeModal = () => {
    if (!isLightboxActive) return;
    isLightboxActive = false;

    // Cancel ongoing animations on card and backdrop
    if (card) card.getAnimations().forEach((a) => a.cancel());
    if (backdrop) backdrop.getAnimations().forEach((a) => a.cancel());

    const metaEl = document.getElementById("image-lightbox-meta");
    if (metaEl) metaEl.style.opacity = "0";

    const currentSourceRect = (lastHeroSourceEl && lastHeroSourceEl.isConnected)
      ? (lastHeroSourceEl.querySelector(".image-queue-thumb-wrapper") || lastHeroSourceEl).getBoundingClientRect()
      : lastHeroRect;

    const sourceRect = (currentSourceRect && currentSourceRect.width > 0)
      ? currentSourceRect
      : {
          left: window.innerWidth / 2 - 22,
          top: window.innerHeight / 2 - 22,
          width: 44,
          height: 44,
        };

    const finalW = Math.max(100, lastFinalW);
    const finalH = Math.max(100, lastFinalH);

    const scale = Math.max(sourceRect.width / finalW, sourceRect.height / finalH);

    const thumbCenterX = sourceRect.left + sourceRect.width / 2;
    const thumbCenterY = sourceRect.top + sourceRect.height / 2;
    const destCenterX = window.innerWidth / 2;
    const destCenterY = (window.innerHeight - 30) / 2;

    const deltaX = thumbCenterX - destCenterX;
    const deltaY = thumbCenterY - destCenterY;

    // Animate backdrop fade out
    if (backdrop && backdrop.animate) {
      backdrop.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 220, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
      );
    }

    // Animate card smoothly back to thumbnail with opacity fade out
    if (card && card.animate) {
      const anim = card.animate(
        [
          { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
          { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scale})`, opacity: 0 }
        ],
        {
          duration: 220,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)"
        }
      );

      anim.onfinish = () => {
        modal.classList.add("d-none");
        card.style.transform = "";
        card.style.opacity = "";
        if (backdrop) backdrop.style.opacity = "";
        if (metaEl) metaEl.style.opacity = "";
      };
      anim.oncancel = () => {
        modal.classList.add("d-none");
        card.style.transform = "";
        card.style.opacity = "";
      };
    } else {
      modal.classList.add("d-none");
    }
  };

  if (btnClose) {
    btnClose.addEventListener("click", (e) => {
      e.stopPropagation();
      closeModal();
    });
  }

  modal.addEventListener("click", (e) => {
    if (Date.now() - lightboxOpenTimestamp < 220) return;
    if (e.target === modal || e.target.id === "image-lightbox-backdrop") {
      closeModal();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isLightboxActive) {
      closeModal();
    }
  });
}

export function openImageLightbox(filePath, fileName = "Image Preview", sourceElement = null) {
  try {
    const modal = document.getElementById("image-lightbox-modal");
    const card = document.getElementById("image-lightbox-card");
    const backdrop = document.getElementById("image-lightbox-backdrop");
    const imgEl = document.getElementById("image-lightbox-img");
    const titleEl = document.getElementById("image-lightbox-title");
    const detailsEl = document.getElementById("image-lightbox-details");
    const metaEl = document.getElementById("image-lightbox-meta");
    const wrapper = document.getElementById("image-lightbox-wrapper");

    if (!modal || !imgEl || !card) return;

    lightboxOpenTimestamp = Date.now();
    isLightboxActive = true;
    lastHeroSourceEl = sourceElement;

    // Cancel any previous animations and clear inline transform/opacity
    card.getAnimations().forEach((a) => a.cancel());
    if (backdrop) backdrop.getAnimations().forEach((a) => a.cancel());
    card.style.transform = "";
    card.style.opacity = "";

    const assetSrc = window.__TAURI__?.core?.convertFileSrc && filePath
      ? window.__TAURI__.core.convertFileSrc(filePath)
      : filePath;

    const thumbImg = sourceElement ? (sourceElement.querySelector("img") || sourceElement) : null;
    const initialSrc = (thumbImg && thumbImg.src) ? thumbImg.src : assetSrc;

    if (titleEl) {
      titleEl.className = "mb-0 fw-medium text-truncate";
      titleEl.textContent = fileName || (filePath ? filePath.split(/[/\\]/).pop() : "Image Preview");
    }
    if (detailsEl) {
      const ext = (fileName || filePath).split(".").pop().toUpperCase();
      detailsEl.className = "small text-white-50";
      detailsEl.textContent = `${ext} Image • ${filePath}`;
    }

    imgEl.onerror = () => {
      if (titleEl) {
        titleEl.className = "mb-0 fw-medium text-truncate text-danger text-decoration-line-through";
      }
      if (detailsEl) {
        detailsEl.textContent = "Image was deleted";
        detailsEl.className = "small text-danger";
      }
    };

    // Get reliable source rect (from thumbnail wrapper or source element)
    const targetSourceEl = sourceElement
      ? (sourceElement.querySelector(".image-queue-thumb-wrapper") || sourceElement)
      : null;
    const rawStartRect = targetSourceEl ? targetSourceEl.getBoundingClientRect() : null;

    const startRect = (rawStartRect && rawStartRect.width > 0 && rawStartRect.height > 0)
      ? rawStartRect
      : {
          left: window.innerWidth / 2 - 22,
          top: window.innerHeight / 2 - 22,
          width: 44,
          height: 44,
        };
    lastHeroRect = startRect;

    if (metaEl) {
      metaEl.style.opacity = "0";
      metaEl.style.transition = "none";
    }

    const runHeroAnimation = (natW, natH) => {
      // Calculate responsive destination size maintaining exact natural aspect ratio
      const maxW = Math.min(window.innerWidth * 0.84, 1200);
      const maxH = Math.min(window.innerHeight * 0.74, 800);
      const aspect = (natW > 0 && natH > 0) ? (natW / natH) : (16 / 9);

      let finalW, finalH;
      if (maxW / maxH > aspect) {
        finalH = maxH;
        finalW = maxH * aspect;
      } else {
        finalW = maxW;
        finalH = maxW / aspect;
      }

      lastFinalW = finalW;
      lastFinalH = finalH;

      if (wrapper) {
        wrapper.style.width = `${Math.round(finalW)}px`;
        wrapper.style.height = `${Math.round(finalH)}px`;
      }
      imgEl.style.width = "100%";
      imgEl.style.height = "100%";

      // Show modal container
      modal.classList.remove("d-none");
      if (backdrop) backdrop.style.opacity = "1";

      // Compute exact geometry from viewport center (never top-left 0,0)
      const scale = Math.max(startRect.width / finalW, startRect.height / finalH);

      const thumbCenterX = startRect.left + startRect.width / 2;
      const thumbCenterY = startRect.top + startRect.height / 2;
      const destCenterX = window.innerWidth / 2;
      const destCenterY = (window.innerHeight - 30) / 2;

      const deltaX = thumbCenterX - destCenterX;
      const deltaY = thumbCenterY - destCenterY;

      // Animate backdrop fade in
      if (backdrop && backdrop.animate) {
        backdrop.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: 250, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
        );
      }

      // Animate Card hero expansion directly from thumbnail center
      if (card.animate) {
        const anim = card.animate(
          [
            {
              transform: `translate(${deltaX}px, ${deltaY}px) scale(${scale})`,
              opacity: 0.2
            },
            {
              transform: "translate(0px, 0px) scale(1)",
              opacity: 1
            }
          ],
          {
            duration: 260,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)"
          }
        );
        anim.onfinish = () => {
          card.style.transform = "";
          card.style.opacity = "1";
          if (metaEl) {
            metaEl.style.transition = "opacity 0.18s ease";
            metaEl.style.opacity = "1";
          }
        };
      } else if (metaEl) {
        metaEl.style.opacity = "1";
      }
    };

    imgEl.src = initialSrc;

    if (thumbImg && thumbImg.naturalWidth > 0 && thumbImg.naturalHeight > 0) {
      runHeroAnimation(thumbImg.naturalWidth, thumbImg.naturalHeight);
    } else if (imgEl.complete && imgEl.naturalWidth > 0) {
      runHeroAnimation(imgEl.naturalWidth, imgEl.naturalHeight);
    } else {
      const tempImg = new Image();
      tempImg.onload = () => {
        runHeroAnimation(tempImg.naturalWidth, tempImg.naturalHeight);
      };
      tempImg.onerror = () => {
        runHeroAnimation(800, 600);
      };
      tempImg.src = initialSrc;
    }

    // Upgrade to full resolution data URI in background
    if (window.__TAURI__?.core?.invoke && filePath) {
      window.__TAURI__.core.invoke("read_image_data", { filePath })
        .then((dataUri) => {
          if (dataUri && isLightboxActive) {
            imgEl.src = dataUri;
          }
        })
        .catch(() => {
          if (titleEl) {
            titleEl.className = "mb-0 fw-medium text-truncate text-danger text-decoration-line-through";
          }
          if (detailsEl) {
            detailsEl.textContent = "Image was deleted";
            detailsEl.className = "small text-danger";
          }
        });
    }
  } catch (err) {
    console.error("Failed to open image lightbox:", err);
  }
}

export function clearAllMediaPreviewCaches() {
  let totalBytes = 0;

  // Calculate size in mediaInfoCache
  for (const [k, v] of mediaInfoCache.entries()) {
    totalBytes += (k.length * 2) + JSON.stringify(v).length * 2;
  }
  mediaInfoCache.clear();

  // Calculate size in actionFrameCache (data URIs)
  for (const [k, v] of actionFrameCache.entries()) {
    totalBytes += (k.length * 2) + (typeof v === "string" ? v.length * 2 : 1024);
  }
  actionFrameCache.clear();

  // Calculate size in albumArtCache (data URIs)
  for (const [k, v] of albumArtCache.entries()) {
    totalBytes += (k.length * 2) + (typeof v === "string" ? v.length * 2 : 1024);
  }
  albumArtCache.clear();

  // Clear waveform peaks cache
  totalBytes += clearWaveformCache();

  // Calculate MB gained (min 0.1 MB for clear user feedback if empty)
  const mbGained = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(2) : "0.00";
  return parseFloat(mbGained);
}
