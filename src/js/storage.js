// LocalStorage Key System & Persistence Module
export const STORAGE_KEYS = {
  ACTIVE_TOOL: "anedikit:active_tool",
  SETTINGS: "anedikit:settings",
  LAST_INPUT_FILE: "anedikit:last_input_file",
  TOOL_PARAMS_PREFIX: "anedikit:tool_params:",
};

export const DEFAULT_SETTINGS = {
  outputDir: "C:\\Users\\User\\Videos",
  promptOverwrite: true,
  hwAccel: "auto",
  threads: "0",
  defVCodec: "libx264",
  defSpeed: "medium",
  defAFmt: "mp3",
  defABitrate: "256k",
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
