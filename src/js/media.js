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

  if (pathInput) {
    pathInput.value = filePath || "";
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
  const videoWrapper = document.getElementById("video-preview-wrapper");
  const videoEl = document.getElementById("media-video-preview");
  const audioWrapper = document.getElementById("audio-preview-wrapper");
  const audioTitle = document.getElementById("audio-art-title");
  const audioEl = document.getElementById("media-audio-preview");
  const previewEmpty = document.getElementById("media-preview-empty");

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

    if (isAudio) {
      if (videoWrapper) videoWrapper.classList.add("d-none");
      if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute("src");
      }
      if (audioWrapper) audioWrapper.classList.remove("d-none");
      if (audioTitle) audioTitle.textContent = info.file_name || "Audio Track";
      if (audioEl && assetSrc) audioEl.src = assetSrc;
      if (previewEmpty) previewEmpty.classList.add("d-none");
    } else {
      if (audioWrapper) audioWrapper.classList.add("d-none");
      if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute("src");
      }
      if (videoWrapper) videoWrapper.classList.remove("d-none");
      if (videoEl && assetSrc) {
        videoEl.src = assetSrc;
      }
      if (previewEmpty) previewEmpty.classList.add("d-none");
    }
  } else {
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
    if (previewEmpty) previewEmpty.classList.remove("d-none");
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
      const selected = await window.__TAURI__.core.invoke("pick_file", {
        filterMode,
      });
      if (selected) {
        return await probeMedia(selected);
      }
      return null;
    } catch (err) {
      console.warn("Tauri pick_file error:", err);
    }
  }

  // Web fallback simulation
  const mockPath = `C:\\Users\\User\\Videos\\sample_media_${Date.now().toString().slice(-4)}.mp4`;
  return await probeMedia(mockPath);
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
      const file = e.dataTransfer.files[0];
      const filePath =
        file.path || file.name || "C:\\Users\\User\\Videos\\dropped_media.mp4";
      const info = await probeMedia(filePath, file);
      if (onFileSelected) onFileSelected(info);
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
              const info = await probeMedia(event.payload.paths[0]);
              if (onFileSelected) onFileSelected(info);
            }
          }
        });
      }
    } catch (err) {
      console.warn("Tauri drag drop init error:", err);
    }
  }
}
