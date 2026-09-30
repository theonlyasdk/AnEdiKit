// AnEdiKit - Metadata display, preview visibility, and preview sync.
import { mediaState, getCurrentMediaInfo } from "../media_store.js";
import { loadSettings } from "../storage.js";
import { mediaPreviewManager, setMediaSrc } from "../preview_providers.js";
import { syncMediaDurationToTools, isAudioFile, isImageFile, refreshWaveformDisplay } from "../trimmer.js";
import { generateWaveformFromSource } from "../waveform.js";
import { renderMarqueeSongTitle, extractAlbumArtAsync, extractActionFrameAsync, crossfadeVideoThumbnail, crossfadeAudioThumbnail, actionFrameCache, albumArtCache } from "./artwork.js";
import { reportError } from "../errors.js";

export function applyMediaPreviewVisibility() {
  const show = loadSettings().showMediaPreview !== false;
  if (show) {
    updateMetadataDisplay(getCurrentMediaInfo());
    return;
  }
  const previewCol = document.getElementById("media-preview-col");
  const previewCard = document.getElementById("media-preview-card");
  const inputsCol = document.getElementById("media-inputs-col");
  const videoEl = document.getElementById("media-video-preview");
  const audioEl = document.getElementById("media-audio-preview");
  if (videoEl) {
    try {
      videoEl.pause();
    } catch (caughtErr) { reportError("js/media/metadata_ui.js:applyMediaPreviewVisibility", caughtErr); }
    setMediaSrc(videoEl, null);
  }
  if (audioEl) {
    try {
      audioEl.pause();
    } catch (caughtErr) { reportError("js/media/metadata_ui.js:applyMediaPreviewVisibility", caughtErr); }
    setMediaSrc(audioEl, null);
  }
  if (inputsCol) inputsCol.className = "col-12";
  if (previewCol) {
    previewCol.classList.remove("d-flex", "preview-slide-in");
    previewCol.classList.add("d-none");
  }
  if (previewCard) previewCard.classList.add("d-none");
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

  const showPreview = loadSettings().showMediaPreview !== false;

  if (filePath && showPreview) {
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
  } else {
    if (inputsCol) inputsCol.className = "col-12";
    if (previewCol) {
      previewCol.classList.remove("d-flex", "preview-slide-in");
      previewCol.classList.add("d-none");
    }
    if (previewCard) previewCard.classList.add("d-none");
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
    pathInput.value = info ? info.file_path || mediaState.currentInputFile : "";
  }

  const showPreview = loadSettings().showMediaPreview !== false;

  if (info && info.file_path && showPreview) {
    const ext = (info.file_name || info.file_path).split(".").pop().toLowerCase();
    const isImage = ["png", "jpg", "jpeg", "webp", "bmp", "tiff", "gif", "svg", "ico"].includes(ext);
    const isAudio =
      !isImage &&
      (info.resolution === "N/A" ||
      info.video_codec === "None" ||
      ["mp3", "wav", "flac", "m4a", "ogg", "opus", "wma", "aac"].includes(ext));

    let cleanPath = info.file_path;
    try {
      if (typeof cleanPath === "string" && cleanPath.trim().startsWith("file://")) {
        let p = cleanPath.trim().slice("file://".length);
        if (p.startsWith("localhost/")) p = p.slice("localhost/".length);
        else if (p.startsWith("localhost")) p = p.slice("localhost".length);
        if (/^\/[A-Za-z][:|]/.test(p)) {
          p = p.slice(1).replace(/^([A-Za-z])\|/, "$1:");
        }
        cleanPath = decodeURIComponent(p);
      }
    } catch (caughtErr) { reportError("js/media/metadata_ui.js:updateMetadataDisplay", caughtErr); }

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
      currentInputFile: mediaState.currentInputFile,
      getCurrentFile: () => mediaState.currentInputFile,
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
      setMediaSrc(videoEl, null);
    }
    if (audioEl) {
      audioEl.pause();
      setMediaSrc(audioEl, null);
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
  if (!mediaState.currentMediaInfo) return;
  // Disabled previews stay hidden across tool switches: layer toggles below
  // would otherwise resurface the card without its column.
  if (loadSettings().showMediaPreview === false) {
    applyMediaPreviewVisibility();
    return;
  }
  const previewCard = document.getElementById("media-preview-card");
  const videoEl = document.getElementById("media-video-preview");
  const actionFrameImg = document.getElementById("video-action-frame-img");
  const videoFallback = document.getElementById("video-preview-fallback");
  const videoOverlay = document.getElementById("video-overlay-info");
  const audioLayer = document.getElementById("audio-preview-layer");
  const imageLayer = document.getElementById("image-preview-layer");
  const videoLayer = document.getElementById("video-preview-layer");

  const filePath = mediaState.currentMediaInfo.file_path || mediaState.currentInputFile;
  const isAudio = isAudioFile(filePath) || mediaState.currentMediaInfo.video_codec === "None" || mediaState.currentMediaInfo.resolution === "N/A";
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
        window.__TAURI__?.core?.convertFileSrc && mediaState.currentMediaInfo.file_path
          ? window.__TAURI__.core.convertFileSrc(mediaState.currentMediaInfo.file_path)
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
