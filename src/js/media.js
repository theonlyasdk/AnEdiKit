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
import {
  refreshWaveformDisplay,
  syncMediaDurationToTools,
  isAudioFile,
  isImageFile,
  isVideoFile,
  formatSecondsToTimestamp,
  parseTimestampToSeconds,
  extractTimelineThumbnailsAsync,
  initTrimmerControls,
} from "./trimmer.js";
import { addImageFilesToQueue } from "./image_queue.js";

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
  }

  // Render initial queue immediately for 0ms initial layout freeze
  if (batchQueue.length > 0) {
    selectedBatchIdx = 0;
  } else {
    selectedBatchIdx = -1;
  }
  renderBatchQueueUI();

  if (window.__TAURI__?.core?.invoke && batchQueue.length > 0) {
    try {
      const checkResults = await Promise.all(
        batchQueue.map(async (item) => {
          try {
            const exists = await window.__TAURI__.core.invoke("check_file_exists", { filePath: item.path });
            return exists ? item : null;
          } catch (_) {
            return null;
          }
        }),
      );
      const validQueue = checkResults.filter(Boolean);
      batchQueue = validQueue;
      saveBatchQueue(batchQueue);
    } catch (_) {}
  }

  if (batchQueue.length > 0) {
    selectedBatchIdx = 0;
    const targetPath = batchQueue[0].path;
    saveInputFile(targetPath);
    probeMedia(targetPath).then((info) => {
      if (info) {
        updateMetadataDisplay(info);
      }
    });
  } else {
    selectedBatchIdx = -1;
    saveInputFile("");
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
          <ion-icon name="add-outline"></ion-icon> Add to Queue...
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
      } else if (item.status === "skipped") {
        statusBadge = `<span class="badge bg-warning-subtle text-warning-emphasis"><ion-icon name="warning-outline"></ion-icon> Skipped (Missing)</span>`;
      } else if (item.status === "error") {
        statusBadge = `<span class="badge bg-danger-subtle text-danger-emphasis"><ion-icon name="close-outline"></ion-icon> Failed</span>`;
      }

      let leadingCheckBtn = "";
      if (item.status === "done") {
        leadingCheckBtn = `<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1 fs-7 flex-shrink-0"><ion-icon name="checkmark-outline"></ion-icon></span>`;
      }

      const isSelected = idx === selectedBatchIdx;
      return `
        <div class="batch-queue-item list-group-item list-group-item-action ${isSelected ? 'active' : 'bg-body-tertiary'} px-3 py-1 d-flex flex-row align-items-center justify-content-between gap-2" data-batch-idx="${idx}" style="cursor: pointer;">
          <div class="d-flex align-items-center gap-2 flex-grow-1 overflow-hidden">
            <span class="batch-queue-drag-handle format-drag-handle ${isSelected ? 'text-white' : 'text-secondary'} cursor-grab p-1 flex-shrink-0" data-drag-idx="${idx}" title="Drag vertically to reorder">
              <ion-icon name="reorder-two-outline" class="fs-5"></ion-icon>
            </span>
            ${leadingCheckBtn}
            <span class="fw-medium ${isSelected ? 'text-white' : 'text-body'} text-truncate" style="font-size: 0.88rem;"><strong class="me-2 ${isSelected ? 'text-white' : 'text-body-secondary'}">${idx + 1}.</strong>${item.name}</span>
          </div>
          <div class="d-flex align-items-center gap-2 flex-shrink-0">
            ${statusBadge}
            <button class="btn btn-outline-danger btn-sm py-0 px-2 btn-batch-del btn-item-delete ${isSelected ? 'btn-outline-light text-white' : ''}" data-del-batch-idx="${idx}" type="button" title="Delete file from queue">
              <ion-icon name="trash-outline"></ion-icon>
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  // Setup interactive vertical pointer drag with real-time shift animation for all batch queue items
  const itemEls = list.querySelectorAll(".batch-queue-item");
  itemEls.forEach((itemEl, index) => {
    const handle = itemEl.querySelector(".batch-queue-drag-handle");
    if (handle) {
      setupBatchQueueItemDrag(itemEl, handle, index, list);
    }
  });

  list.querySelectorAll(".batch-queue-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest(".batch-queue-drag-handle")) return;
      const idx = parseInt(el.getAttribute("data-batch-idx"), 10);
      if (idx === selectedBatchIdx) return;
      selectedBatchIdx = idx;

      // Update UI active selection immediately (0ms latency)
      list.querySelectorAll(".batch-queue-item").forEach((itemEl, i) => {
        const isCurrent = i === idx;
        itemEl.classList.toggle("active", isCurrent);
        itemEl.classList.toggle("bg-body-tertiary", !isCurrent);

        const handle = itemEl.querySelector(".batch-queue-drag-handle");
        if (handle) {
          handle.classList.toggle("text-white", isCurrent);
          handle.classList.toggle("text-secondary", !isCurrent);
        }

        const titleText = itemEl.querySelector(".fw-medium");
        if (titleText) {
          titleText.classList.toggle("text-white", isCurrent);
          titleText.classList.toggle("text-body", !isCurrent);
        }

        const strongNum = itemEl.querySelector("strong");
        if (strongNum) {
          strongNum.classList.toggle("text-white", isCurrent);
          strongNum.classList.toggle("text-body-secondary", !isCurrent);
        }

        const delBtn = itemEl.querySelector(".btn-batch-del");
        if (delBtn) {
          delBtn.classList.toggle("btn-outline-light", isCurrent);
          delBtn.classList.toggle("text-white", isCurrent);
        }
      });

      // Asynchronously probe media in background without blocking UI
      if (idx >= 0 && idx < batchQueue.length) {
        probeMedia(batchQueue[idx].path);
      }
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

function setupBatchQueueItemDrag(itemEl, dragHandle, index, listContainer) {
  dragHandle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const allItemEls = Array.from(listContainer.querySelectorAll(".batch-queue-item"));
    if (allItemEls.length <= 1) return;

    const startY = e.clientY;
    const startIndex = index;
    let targetIndex = index;

    // Get initial geometry
    const rects = allItemEls.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height, mid: r.top + r.height / 2 };
    });

    // Lock main workspace scroll during drag to prevent outer view from scrolling
    const workspaceEl = document.getElementById("tool-workspace");
    const originalWorkspaceOverflowY = workspaceEl ? workspaceEl.style.overflowY : "";
    if (workspaceEl) workspaceEl.style.overflowY = "hidden";

    // Prevent listbox overflow clipping and scrollbar flicker during active drag
    const originalOverflowY = listContainer.style.overflowY;
    const originalOverflowX = listContainer.style.overflowX;
    listContainer.style.overflowY = "visible";
    listContainer.style.overflowX = "visible";

    itemEl.classList.add("is-dragging");
    try {
      dragHandle.setPointerCapture(e.pointerId);
    } catch (_) {}

    const startScrollTop = listContainer.scrollTop;
    let autoScrollRaf = null;
    let lastClientY = startY;

    const updateItemPosition = () => {
      const scrollDelta = listContainer.scrollTop - startScrollTop;
      const pointerDeltaY = lastClientY - startY;
      const totalDeltaY = pointerDeltaY + scrollDelta;

      // Strictly locked to vertical Y axis
      itemEl.style.transform = `translateY(${totalDeltaY}px)`;

      const currentMid = rects[startIndex].mid + totalDeltaY;

      // Determine target slot
      let newTarget = startIndex;
      for (let i = 0; i < rects.length; i++) {
        if (i < startIndex) {
          if (currentMid < rects[i].top + rects[i].height * 0.5) {
            newTarget = i;
            break;
          }
        } else if (i > startIndex) {
          if (currentMid > rects[i].top + rects[i].height * 0.5) {
            newTarget = i;
          }
        }
      }
      targetIndex = newTarget;

      // Smoothly shift other items
      allItemEls.forEach((otherEl, i) => {
        if (i === startIndex) return;
        if (startIndex < targetIndex) {
          if (i > startIndex && i <= targetIndex) {
            otherEl.style.transform = `translateY(-${draggedHeight + gap}px)`;
          } else {
            otherEl.style.transform = "translateY(0)";
          }
        } else if (startIndex > targetIndex) {
          if (i < startIndex && i >= targetIndex) {
            otherEl.style.transform = `translateY(${draggedHeight + gap}px)`;
          } else {
            otherEl.style.transform = "translateY(0)";
          }
        } else {
          otherEl.style.transform = "translateY(0)";
        }
      });
    };

    const checkAutoScroll = () => {
      const containerRect = listContainer.getBoundingClientRect();
      const edgeZone = 40; // 40px top/bottom threshold zone
      const topThreshold = containerRect.top + edgeZone;
      const bottomThreshold = containerRect.bottom - edgeZone;

      let scrolled = false;
      if (lastClientY < topThreshold && listContainer.scrollTop > 0) {
        const ratio = Math.max(0.2, (topThreshold - lastClientY) / edgeZone);
        const speed = Math.max(2, Math.round(ratio * 8));
        listContainer.scrollTop -= speed;
        scrolled = true;
      } else if (lastClientY > bottomThreshold && listContainer.scrollTop < listContainer.scrollHeight - listContainer.clientHeight) {
        const ratio = Math.max(0.2, (lastClientY - bottomThreshold) / edgeZone);
        const speed = Math.max(2, Math.round(ratio * 8));
        listContainer.scrollTop += speed;
        scrolled = true;
      }

      if (scrolled) {
        updateItemPosition();
        autoScrollRaf = requestAnimationFrame(checkAutoScroll);
      } else {
        autoScrollRaf = null;
      }
    };

    const onPointerMove = (moveEvt) => {
      lastClientY = moveEvt.clientY;
      updateItemPosition();

      const containerRect = listContainer.getBoundingClientRect();
      const edgeZone = 40;
      const nearEdge = (lastClientY < containerRect.top + edgeZone && listContainer.scrollTop > 0) ||
                       (lastClientY > containerRect.bottom - edgeZone && listContainer.scrollTop < listContainer.scrollHeight - listContainer.clientHeight);

      if (nearEdge && !autoScrollRaf) {
        autoScrollRaf = requestAnimationFrame(checkAutoScroll);
      } else if (!nearEdge && autoScrollRaf) {
        cancelAnimationFrame(autoScrollRaf);
        autoScrollRaf = null;
      }
    };

    const onPointerUp = (upEvt) => {
      try {
        dragHandle.releasePointerCapture(upEvt.pointerId);
      } catch (_) {}
      dragHandle.removeEventListener("pointermove", onPointerMove);
      dragHandle.removeEventListener("pointerup", onPointerUp);
      dragHandle.removeEventListener("pointercancel", onPointerUp);

      if (workspaceEl) workspaceEl.style.overflowY = originalWorkspaceOverflowY;

      // Calculate final resting position offset for smooth release transition
      let finalTranslateY = 0;
      if (targetIndex !== startIndex) {
        if (targetIndex > startIndex) {
          finalTranslateY = rects[targetIndex].bottom - rects[startIndex].bottom;
        } else {
          finalTranslateY = rects[targetIndex].top - rects[startIndex].top;
        }
      }

      itemEl.classList.add("is-releasing");
      itemEl.style.setProperty("transition", "transform 0.15s cubic-bezier(0.2, 0.9, 0.3, 1), box-shadow 0.15s ease", "important");
      itemEl.style.transform = `translateY(${finalTranslateY}px)`;
      itemEl.style.boxShadow = "none";

      const onTransitionEnd = () => {
        itemEl.removeEventListener("transitionend", onTransitionEnd);
        listContainer.style.overflowY = originalOverflowY;
        listContainer.style.overflowX = originalOverflowX;

        itemEl.classList.remove("is-dragging", "is-releasing");
        itemEl.style.transition = "";
        itemEl.style.transform = "";
        itemEl.style.boxShadow = "";
        allItemEls.forEach((el) => {
          el.style.transform = "";
        });

        const finalIdx = targetIndex;
        if (targetIndex !== startIndex && targetIndex >= 0 && targetIndex < batchQueue.length) {
          const moved = batchQueue.splice(startIndex, 1)[0];
          batchQueue.splice(targetIndex, 0, moved);
          if (selectedBatchIdx === startIndex) {
            selectedBatchIdx = targetIndex;
          } else if (startIndex < selectedBatchIdx && targetIndex >= selectedBatchIdx) {
            selectedBatchIdx--;
          } else if (startIndex > selectedBatchIdx && targetIndex <= selectedBatchIdx) {
            selectedBatchIdx++;
          }
          saveBatchQueue(batchQueue);
        }
        renderBatchQueueUI();

        // Trigger smooth accent drop pulse on the placed row
        const droppedEl = listContainer.querySelector(`[data-batch-idx="${finalIdx}"]`);
        if (droppedEl) {
          droppedEl.classList.add("item-dropped-highlight");
          setTimeout(() => droppedEl.classList.remove("item-dropped-highlight"), 500);
        }
      };

      itemEl.addEventListener("transitionend", onTransitionEnd);
      // Fallback in case transitionend does not fire
      setTimeout(onTransitionEnd, 180);
    };

    dragHandle.addEventListener("pointermove", onPointerMove);
    dragHandle.addEventListener("pointerup", onPointerUp);
    dragHandle.addEventListener("pointercancel", onPointerUp);
  });
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

// Re-export trimmer and timeline utilities from trimmer.js
export {
  formatSecondsToTimestamp,
  parseTimestampToSeconds,
  refreshWaveformDisplay,
  isAudioFile,
  isImageFile,
  isVideoFile,
  extractTimelineThumbnailsAsync,
  syncMediaDurationToTools,
  initTrimmerControls,
} from "./trimmer.js";

// Re-export image AI queue and lightbox utilities from image_queue.js
export {
  initSavedImageAiQueue,
  getImageAiQueue,
  updateImageAiItemStatus,
  updateActiveImageAiProgress,
  removeImageAiQueueItem,
  clearImageAiQueue,
  addImageFilesToQueue,
  renderImageAiQueueUI,
  initImageLightbox,
  openImageLightbox,
} from "./image_queue.js";

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
