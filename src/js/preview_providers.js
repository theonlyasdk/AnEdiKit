// Media Preview Provider System
// Extensible architecture for rendering and managing preview layers (Video, Audio, Image, etc.)

export class MediaPreviewProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * Determine if this provider handles the media item
   * @param {Object} info Media info descriptor
   * @param {string} ext File extension in lowercase
   * @returns {boolean}
   */
  canHandle(info, ext) {
    return false;
  }

  /**
   * Render preview into the preview container
   * @param {Object} context Context object containing DOM elements and media properties
   */
  render(context) {}

  /**
   * Cleanup any active playback, timers, or object URLs
   * @param {Object} context
   */
  cleanup(context) {}
}

/**
 * Image Media Preview Provider
 * Supports PNG, JPG, JPEG, WEBP, BMP, TIFF, GIF, SVG, ICO, AVIF, HEIC
 */
export class ImagePreviewProvider extends MediaPreviewProvider {
  constructor() {
    super("image");
    this.supportedExtensions = new Set([
      "png",
      "jpg",
      "jpeg",
      "webp",
      "bmp",
      "tiff",
      "tif",
      "gif",
      "svg",
      "ico",
      "avif",
      "heic",
    ]);
  }

  canHandle(info, ext) {
    if (!ext && info?.file_path) {
      ext = info.file_path.split(".").pop().toLowerCase();
    }
    return this.supportedExtensions.has(ext);
  }

  render(context) {
    const {
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
      waveformCanvas,
    } = context;

    if (previewCard) {
      previewCard.classList.remove("video-mode", "audio-mode");
      previewCard.classList.add("image-mode");
    }

    if (imageLayer) imageLayer.classList.remove("d-none");
    if (videoLayer) videoLayer.classList.add("d-none");
    if (audioLayer) audioLayer.classList.add("d-none");

    const targetImgPath = info?.file_path || currentInputFile;
    const imageFallback = document.getElementById("image-preview-fallback");
    const imageFallbackName = document.getElementById("image-fallback-filename");
    const imageFallbackSpinner = document.getElementById("image-fallback-spinner");
    const imageFallbackIcon = document.getElementById("image-fallback-icon");
    const imageFallbackBadge = document.getElementById("image-fallback-badge");
    const displayName =
      info?.file_name ||
      (info?.file_path ? info.file_path.split(/[/\\]/).pop() : "Image Preview");

    const showDeletedState = () => {
      if (imageEl) imageEl.classList.add("d-none");
      if (imageFallback) imageFallback.classList.remove("d-none");
      if (imageFallbackSpinner) imageFallbackSpinner.classList.add("d-none");
      if (imageFallbackIcon) {
        imageFallbackIcon.className = "bi bi-exclamation-circle-fill fs-1 text-danger mb-1";
        imageFallbackIcon.classList.remove("d-none");
      }
      if (imageFallbackBadge) {
        imageFallbackBadge.classList.remove("d-none");
        imageFallbackBadge.textContent = "Image was deleted";
      }
      if (imageFallbackName) {
        imageFallbackName.className = "small text-danger text-decoration-line-through text-truncate w-100";
        imageFallbackName.textContent = displayName;
      }
      if (imageOverlayInfo) imageOverlayInfo.classList.add("d-none");
    };

    if (imageFallbackName) {
      imageFallbackName.className = "small text-body-secondary text-truncate w-100";
      imageFallbackName.textContent = displayName;
    }

    const imageOverlayInfo = document.getElementById("image-overlay-info");

    // Hide overlay text until image successfully renders
    if (imageOverlayInfo) imageOverlayInfo.classList.add("d-none");

    if (imageEl) {
      // Show initial loading spinner in fallback layer
      if (imageFallback) imageFallback.classList.remove("d-none");
      if (imageFallbackSpinner) imageFallbackSpinner.classList.remove("d-none");
      if (imageFallbackIcon) imageFallbackIcon.classList.add("d-none");
      if (imageFallbackBadge) imageFallbackBadge.classList.add("d-none");

      imageEl.onload = () => {
        imageEl.classList.remove("d-none");
        if (imageFallback) imageFallback.classList.add("d-none");
        if (imageOverlayInfo) imageOverlayInfo.classList.remove("d-none");

        // Update resolution accurately from image natural dimensions if not already provided
        const w = imageEl.naturalWidth;
        const h = imageEl.naturalHeight;
        const res = (w && h) ? `${w}x${h}` : (info?.resolution && info.resolution !== "--" && info.resolution !== "N/A" ? info.resolution : "");
        const formatText = `${(ext || "img").toUpperCase()} Image`;
        const sizeText = info?.file_size_formatted || (info?.file_size_mb ? `${info.file_size_mb} MB` : "");

        const metaParts = [formatText];
        if (res) metaParts.push(res);
        if (sizeText) metaParts.push(sizeText);

        if (imageOverlayFormat) {
          imageOverlayFormat.textContent = metaParts.join(" • ");
        }

        const imageOverlayPath = document.getElementById("image-overlay-path");
        if (imageOverlayPath) {
          imageOverlayPath.textContent = targetImgPath || "";
        }
      };

      imageEl.onerror = () => {
        showDeletedState();
      };

      if (window.__TAURI__?.core?.invoke && targetImgPath) {
        window.__TAURI__.core.invoke("read_image_data", { filePath: targetImgPath })
          .then((dataUri) => {
            if (dataUri) {
              imageEl.src = dataUri;
            } else if (assetSrc) {
              imageEl.src = assetSrc;
            } else {
              showDeletedState();
            }
          })
          .catch((err) => {
            console.warn("read_image_data failed, falling back to assetSrc:", err);
            if (assetSrc) {
              imageEl.src = assetSrc;
            } else {
              showDeletedState();
            }
          });
      } else if (assetSrc) {
        imageEl.src = assetSrc;
      } else {
        showDeletedState();
      }
    }

    if (imageOverlayTitle) {
      imageOverlayTitle.textContent = displayName;
    }

    if (imageOverlayFormat) {
      const res =
        info?.resolution && info.resolution !== "--" && info.resolution !== "N/A"
          ? info.resolution
          : "";
      const formatText = `${(ext || "img").toUpperCase()} Image`;
      const sizeText = info?.file_size_formatted || (info?.file_size_mb ? `${info.file_size_mb} MB` : "");
      const metaParts = [formatText];
      if (res) metaParts.push(res);
      if (sizeText) metaParts.push(sizeText);
      imageOverlayFormat.textContent = metaParts.join(" • ");
    }

    const imageOverlayPath = document.getElementById("image-overlay-path");
    if (imageOverlayPath) {
      imageOverlayPath.textContent = targetImgPath || "";
    }

    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute("src");
    }
    if (audioEl) {
      audioEl.pause();
      audioEl.removeAttribute("src");
    }
    if (waveformCanvas) {
      waveformCanvas.classList.add("d-none");
    }
  }

  cleanup(context) {
    const { imageEl, imageLayer } = context;
    if (imageEl) imageEl.removeAttribute("src");
    if (imageLayer) imageLayer.classList.add("d-none");
  }
}

/**
 * Audio Media Preview Provider
 * Supports MP3, WAV, FLAC, M4A, OGG, OPUS, WMA, AAC, ALAC, AIFF
 */
export class AudioPreviewProvider extends MediaPreviewProvider {
  constructor() {
    super("audio");
    this.supportedExtensions = new Set([
      "mp3",
      "wav",
      "flac",
      "m4a",
      "ogg",
      "opus",
      "wma",
      "aac",
      "alac",
      "aiff",
      "oga",
    ]);
  }

  canHandle(info, ext) {
    if (!ext && info?.file_path) {
      ext = info.file_path.split(".").pop().toLowerCase();
    }
    if (this.supportedExtensions.has(ext)) return true;
    return info?.resolution === "N/A" || info?.video_codec === "None";
  }

  render(context) {
    const {
      info,
      ext,
      assetSrc,
      previewCard,
      imageLayer,
      videoLayer,
      audioLayer,
      videoEl,
      actionFrameImg,
      actionFramePrev,
      cdSpinner,
      audioFallbackIcon,
      audioArtImg,
      audioFormat,
      audioEl,
      currentInputFile,
      albumArtCache,
      crossfadeAudioThumbnail,
      renderMarqueeSongTitle,
      extractAlbumArtAsync,
      waveformCanvas,
      generateWaveformFromSource,
      refreshWaveformDisplay,
    } = context;

    if (imageLayer) imageLayer.classList.add("d-none");
    if (audioLayer) audioLayer.classList.remove("d-none");
    if (videoLayer) videoLayer.classList.add("d-none");

    if (previewCard) {
      previewCard.classList.remove("video-mode", "image-mode");
      previewCard.classList.add("audio-mode");
    }

    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute("src");
      videoEl.removeAttribute("poster");
    }
    if (actionFrameImg) {
      actionFrameImg.classList.add("d-none");
      actionFrameImg.removeAttribute("src");
      actionFrameImg.classList.remove("thumb-visible");
    }
    if (actionFramePrev) actionFramePrev.classList.add("d-none");

    const targetAudioPath = info?.file_path || currentInputFile;

    if (info?.album_art_url) {
      crossfadeAudioThumbnail(info.album_art_url);
    } else if (targetAudioPath && albumArtCache && albumArtCache.has(targetAudioPath)) {
      crossfadeAudioThumbnail(albumArtCache.get(targetAudioPath));
    } else if (targetAudioPath && typeof extractAlbumArtAsync === "function") {
      if (cdSpinner) cdSpinner.classList.remove("d-none");
      if (audioFallbackIcon) audioFallbackIcon.classList.add("d-none");
      if (audioArtImg) {
        audioArtImg.classList.add("d-none");
        audioArtImg.classList.remove("thumb-visible");
      }
      extractAlbumArtAsync(targetAudioPath).then((artUrl) => {
        if (context.getCurrentFile && context.getCurrentFile() === targetAudioPath) {
          crossfadeAudioThumbnail(artUrl);
        }
      });
    } else {
      crossfadeAudioThumbnail(null);
    }

    const titleStr =
      info?.file_name ||
      (info?.file_path ? info.file_path.split(/[/\\]/).pop() : "Audio Track");
    if (typeof renderMarqueeSongTitle === "function") {
      renderMarqueeSongTitle(titleStr);
    }

    if (audioFormat) {
      audioFormat.textContent = `${(info?.audio_codec || ext || "audio").toUpperCase()} Audio`;
    }
    if (audioEl && assetSrc) {
      audioEl.src = assetSrc;
    }

    if (waveformCanvas && typeof generateWaveformFromSource === "function") {
      waveformCanvas.classList.remove("d-none");
      generateWaveformFromSource(targetAudioPath)
        .then((peaks) => {
          if (typeof refreshWaveformDisplay === "function") {
            refreshWaveformDisplay(peaks);
          }
        })
        .catch((err) => console.warn("Waveform generation failed:", err));
    }
  }

  cleanup(context) {
    const { audioEl, audioLayer } = context;
    if (audioEl) {
      audioEl.pause();
      audioEl.removeAttribute("src");
    }
    if (audioLayer) audioLayer.classList.add("d-none");
  }
}

/**
 * Video Media Preview Provider
 * Supports MP4, MKV, WEBM, MOV, AVI, FLV, TS, WMV, M4V, 3GP, MPG, VOB, OGV
 */
export class VideoPreviewProvider extends MediaPreviewProvider {
  constructor() {
    super("video");
  }

  canHandle(info, ext) {
    // Default video provider handles all non-image and non-audio media
    return true;
  }

  render(context) {
    const {
      info,
      ext,
      assetSrc,
      previewCard,
      imageLayer,
      videoLayer,
      audioLayer,
      videoEl,
      audioEl,
      actionFrameImg,
      actionFramePrev,
      videoFallback,
      videoFallbackName,
      videoOverlay,
      videoOverlayTitle,
      videoOverlayFormat,
      fallbackIcon,
      waveformCanvas,
      currentInputFile,
      actionFrameCache,
      extractActionFrameAsync,
      crossfadeVideoThumbnail,
    } = context;

    if (imageLayer) imageLayer.classList.add("d-none");
    if (videoLayer) videoLayer.classList.remove("d-none");
    if (audioLayer) audioLayer.classList.add("d-none");

    if (waveformCanvas) {
      waveformCanvas.classList.add("d-none");
    }
    if (audioEl) {
      audioEl.pause();
      audioEl.removeAttribute("src");
    }

    if (previewCard) {
      previewCard.classList.remove("audio-mode", "image-mode");
      previewCard.classList.add("video-mode");
    }

    if (videoEl) {
      if (assetSrc) {
        videoEl.src = assetSrc;
      } else {
        videoEl.removeAttribute("src");
      }
    }

    const activeTool =
      document.querySelector(
        "#tool-nav .nav-link.active, #ytdlp-nav .nav-link.active"
      )?.dataset?.tool || "trim";

    if (activeTool === "trim") {
      if (videoEl) videoEl.classList.remove("d-none");
      if (actionFrameImg) actionFrameImg.classList.add("d-none");
      if (actionFramePrev) actionFramePrev.classList.add("d-none");
      if (videoFallback) videoFallback.classList.add("d-none");
      if (videoOverlay) videoOverlay.classList.remove("d-none");
    } else {
      if (videoEl) videoEl.classList.add("d-none");
      if (videoOverlay) videoOverlay.classList.add("d-none");
    }

    if (videoOverlayTitle) {
      videoOverlayTitle.textContent =
        info?.file_name ||
        (info?.file_path ? info.file_path.split(/[/\\]/).pop() : "Video Track");
    }

    if (videoOverlayFormat) {
      const codecStr = (info?.video_codec || ext || "video").toUpperCase();
      const resStr =
        info?.resolution && info.resolution !== "--" && info.resolution !== "N/A"
          ? ` • ${info.resolution}`
          : "";
      videoOverlayFormat.textContent = `${codecStr} Video${resStr}`;
    }

    if (fallbackIcon && activeTool !== "trim") {
      fallbackIcon.classList.add("icon-loading-pulse");
    }

    const targetVideoPath = info?.file_path || currentInputFile;
    if (targetVideoPath) {
      if (actionFrameCache && actionFrameCache.has(targetVideoPath)) {
        const cachedUri = actionFrameCache.get(targetVideoPath);
        if (fallbackIcon) fallbackIcon.classList.remove("icon-loading-pulse");
        const curTool =
          document.querySelector(
            "#tool-nav .nav-link.active, #ytdlp-nav .nav-link.active"
          )?.dataset?.tool || "trim";
        if (curTool !== "trim" && typeof crossfadeVideoThumbnail === "function") {
          crossfadeVideoThumbnail(cachedUri);
        }
      } else if (typeof extractActionFrameAsync === "function") {
        if (actionFrameImg) {
          actionFrameImg.classList.add("d-none");
          actionFrameImg.removeAttribute("src");
          actionFrameImg.classList.remove("thumb-visible");
        }
        if (videoFallback) {
          videoFallback.classList.remove("d-none");
          if (videoFallbackName) {
            videoFallbackName.textContent = info?.file_name || "Video Preview";
          }
        }
        extractActionFrameAsync(targetVideoPath, info?.duration_seconds || 10)
          .then((dataUri) => {
            if (fallbackIcon) fallbackIcon.classList.remove("icon-loading-pulse");
            if (dataUri && targetVideoPath === currentInputFile) {
              const curTool =
                document.querySelector(
                  "#tool-nav .nav-link.active, #ytdlp-nav .nav-link.active"
                )?.dataset?.tool || "trim";
              if (curTool !== "trim" && typeof crossfadeVideoThumbnail === "function") {
                crossfadeVideoThumbnail(dataUri);
              }
            }
          })
          .catch(() => {
            if (fallbackIcon) fallbackIcon.classList.remove("icon-loading-pulse");
          });
      }
    }
  }

  cleanup(context) {
    const { videoEl, videoLayer } = context;
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute("src");
    }
    if (videoLayer) videoLayer.classList.add("d-none");
  }
}

/**
 * Registry managing media preview providers
 */
class MediaPreviewManager {
  constructor() {
    this.providers = [];
    // Register default built-in providers (order matters: image, audio, video fallback)
    this.registerProvider(new ImagePreviewProvider());
    this.registerProvider(new AudioPreviewProvider());
    this.registerProvider(new VideoPreviewProvider());
  }

  registerProvider(provider) {
    if (provider instanceof MediaPreviewProvider) {
      this.providers.push(provider);
    }
  }

  getProvider(info, ext) {
    for (const provider of this.providers) {
      if (provider.canHandle(info, ext)) {
        return provider;
      }
    }
    return null;
  }

  renderPreview(context) {
    const ext = (context.info?.file_name || context.info?.file_path || "")
      .split(".")
      .pop()
      .toLowerCase();
    const provider = this.getProvider(context.info, ext);
    if (provider) {
      provider.render({ ...context, ext });
      return provider;
    }
    return null;
  }
}

export const mediaPreviewManager = new MediaPreviewManager();
