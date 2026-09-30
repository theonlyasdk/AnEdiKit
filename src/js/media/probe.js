// AnEdiKit - Media probing + media-change listener registry.
import { mediaState } from "../media_store.js";
import { saveInputFile } from "../storage.js";
import { setCachedMediaProbe } from "../commands.js";
import { syncMediaDurationToTools } from "../trimmer.js";
import { updateMetadataDisplay, showMetadataLoading } from "./metadata_ui.js";
import { reportError } from "../errors.js";

const mediaChangeListeners = new Set();
let activeProbeToken = 0;

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
    mediaState.currentInputFile = "";
    mediaState.currentMediaInfo = null;
    saveInputFile("");
    updateMetadataDisplay(null);
    notifyMediaChanged(null, "");
    return null;
  }

  // Normalize file:// URLs only. Plain filesystem paths (which may contain
  // literal '%' e.g. `Promo_100%_Final.mp4`) must never be URL-decoded.
  let normalizedPath = filePath;
  try {
    if (typeof normalizedPath === "string" && normalizedPath.trim().startsWith("file://")) {
      let p = normalizedPath.trim().slice("file://".length);
      if (p.startsWith("localhost/")) p = p.slice("localhost/".length);
      else if (p.startsWith("localhost")) p = p.slice("localhost".length);
      // Normalize Windows drive: "/C:/..." -> "C:/...", "/C|/..." -> "C:/..."
      if (/^\/[A-Za-z][:|]/.test(p)) {
        p = p.slice(1).replace(/^([A-Za-z])\|/, "$1:");
      }
      normalizedPath = decodeURIComponent(p);
    }
  } catch (caughtErr) { reportError("js/media/probe.js:probeMedia", caughtErr); }

  // Normalize windows forward/back slashes
  if (typeof normalizedPath === "string") {
    normalizedPath = normalizedPath.trim();
  }

  filePath = normalizedPath;
  mediaState.currentInputFile = filePath;
  saveInputFile(filePath);

  // Instant response if already cached
  if (mediaState.mediaInfoCache.has(filePath)) {
    const cached = mediaState.mediaInfoCache.get(filePath);
    mediaState.currentMediaInfo = cached;
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
        mediaState.mediaInfoCache.set(filePath, info);
        mediaState.currentMediaInfo = info;
        updateMetadataDisplay(info);
        syncMediaDurationToTools(info);
        notifyMediaChanged(info, filePath);
        // Feed command builders (silent-input / audio-only adaptation) and
        // refresh the preview, which may have been built before probing done.
        try {
          setCachedMediaProbe(filePath, info);
        } catch (caughtErr) { reportError("js/media/probe.js:probeMedia", caughtErr); }
        try {
          window.dispatchEvent(new CustomEvent("anedikit:media_probed", { detail: { filePath } }));
        } catch (caughtErr) { reportError("js/media/probe.js:probeMedia", caughtErr); }
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
        mediaState.currentMediaInfo = missingInfo;
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
      mediaState.mediaInfoCache.set(filePath, mediaInfo);
      mediaState.currentMediaInfo = mediaInfo;
      updateMetadataDisplay(mediaInfo);
      syncMediaDurationToTools(mediaInfo);
      notifyMediaChanged(mediaInfo, filePath);
      try {
        setCachedMediaProbe(filePath, mediaInfo);
      } catch (caughtErr) { reportError("js/media/probe.js:probeMedia", caughtErr); }
      try {
        window.dispatchEvent(new CustomEvent("anedikit:media_probed", { detail: { filePath } }));
      } catch (caughtErr) { reportError("js/media/probe.js:probeMedia", caughtErr); }
      return mediaInfo;
    } catch (e) {
      console.warn("Browser media probe error:", e);
      if (thisToken === activeProbeToken) {
        mediaState.currentMediaInfo = null;
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
    mediaState.currentMediaInfo = placeholderInfo;
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
