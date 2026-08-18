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

export async function probeMedia(filePath) {
  if (!filePath) {
    currentInputFile = "";
    currentMediaInfo = null;
    saveInputFile("");
    updateMetadataDisplay(null);
    return null;
  }

  currentInputFile = filePath;
  saveInputFile(filePath);

  // Try Tauri IPC if available
  if (window.__TAURI__?.core?.invoke) {
    try {
      const info = await window.__TAURI__.core.invoke("get_media_info", {
        filePath,
      });
      currentMediaInfo = info;
      updateMetadataDisplay(info);
      return info;
    } catch (err) {
      console.warn("Tauri get_media_info error:", err);
    }
  }

  // Fallback metadata for browser simulation
  const fileName = filePath.split(/[/\\]/).pop() || "sample_video.mp4";
  const mockInfo = {
    file_path: filePath,
    file_name: fileName,
    duration_seconds: 135.0,
    duration_string: "00:02:15",
    resolution: "1920x1080",
    video_codec: "h264",
    audio_codec: "aac",
    file_size_mb: 42.5,
    file_size_formatted: "42.5 MB",
    bitrate_kbps: 2600,
  };
  currentMediaInfo = mockInfo;
  updateMetadataDisplay(mockInfo);
  return mockInfo;
}

export function updateMetadataDisplay(info) {
  const metaInfo = document.getElementById("input-meta-info");
  const pathInput = document.getElementById("input-file-path");

  if (pathInput) {
    pathInput.value = info ? info.file_path || currentInputFile : "";
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

export async function selectOutputFolder() {
  if (window.__TAURI__?.core?.invoke) {
    try {
      const selected = await window.__TAURI__.core.invoke("pick_folder");
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
      const info = await probeMedia(filePath);
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
