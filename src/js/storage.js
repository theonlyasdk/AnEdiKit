// LocalStorage Key System & Persistence Module
export const STORAGE_KEYS = {
  ACTIVE_TOOL: "anedikit:active_tool",
  SETTINGS: "anedikit:settings",
  LAST_INPUT_FILE: "anedikit:last_input_file",
  YTDLP_LAST_DOWNLOAD_DIR: "anedikit:last_ytdlp_out_dir",
  BATCH_QUEUE: "anedikit:batch_queue",
  TOOL_PARAMS_PREFIX: "anedikit:tool_params:",
};

export const DEFAULT_SETTINGS = {
  outputDir: "C:\\Users\\User\\Videos",
  promptOverwrite: true,
  disableAnimations: false,
  customFont: "",
  hwAccel: "auto",
  threads: "0",
  defVCodec: "libx264",
  defSpeed: "medium",
  defAFmt: "mp3",
  defABitrate: "256k",
  ytdlpCookies: "none",
  ytdlpRateLimit: "none",
  ytdlpSponsorblock: false,
  ytdlpGeoBypass: true,
  ytdlpCustomArgs: "",
  ffmpegBin: "ffmpeg (System PATH)",
  ffprobeBin: "ffprobe (System PATH)",
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (err) {
    console.warn("Failed to parse settings:", err);
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (err) {
    console.warn("Failed to save settings:", err);
  }
}

export function getSavedActiveTool(defaultTool = "convert") {
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_TOOL) || defaultTool;
}

export function saveActiveTool(toolId) {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_TOOL, toolId);
  } catch (err) {
    console.warn("Failed to save active tool:", err);
  }
}

export function getSavedInputFile() {
  return localStorage.getItem(STORAGE_KEYS.LAST_INPUT_FILE) || "";
}

export function saveInputFile(path) {
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_INPUT_FILE, path || "");
  } catch (err) {
    console.warn("Failed to save input file:", err);
  }
}

export function getLastYtDlpOutDir() {
  return localStorage.getItem(STORAGE_KEYS.YTDLP_LAST_DOWNLOAD_DIR) || "";
}

export function saveLastYtDlpOutDir(path) {
  try {
    localStorage.setItem(STORAGE_KEYS.YTDLP_LAST_DOWNLOAD_DIR, path || "");
  } catch (err) {
    console.warn("Failed to save last yt-dlp out dir:", err);
  }
}

export function loadSavedBatchQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BATCH_QUEUE);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    // Keep track of finished items and do not restore items with finished status
    return list
      .filter((item) => item && item.path && item.status !== "done")
      .map((item) => ({
        ...item,
        status: item.status === "processing" ? "pending" : item.status,
      }));
  } catch (err) {
    console.warn("Failed to load batch queue from storage:", err);
    return [];
  }
}

export function saveBatchQueue(queue) {
  try {
    localStorage.setItem(STORAGE_KEYS.BATCH_QUEUE, JSON.stringify(queue || []));
  } catch (err) {
    console.warn("Failed to save batch queue:", err);
  }
}
