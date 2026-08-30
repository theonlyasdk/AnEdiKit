// LocalStorage Key System & Persistence Module
export const STORAGE_KEYS = {
  ACTIVE_TOOL: "anedikit:active_tool",
  SETTINGS: "anedikit:settings",
  LAST_INPUT_FILE: "anedikit:last_input_file",
  YTDLP_LAST_DOWNLOAD_DIR: "anedikit:last_ytdlp_out_dir",
  IMAGE_AI_LAST_OUT_DIR: "anedikit:last_image_ai_out_dir",
  BATCH_QUEUE: "anedikit:batch_queue",
  IMAGE_AI_QUEUE: "anedikit:image_ai_queue",
  AI_REPLACE_SOURCE: "anedikit:ai_replace_source",
  USER_KITS: "anedikit:user_kits",
  ACTIVE_KIT: "anedikit:active_kit",
  TOOL_PARAMS_PREFIX: "anedikit:tool_params:",
};

export const DEFAULT_SETTINGS = {
  outputDir: "C:\\Users\\User\\Videos",
  promptOverwrite: true,
  enableNotifications: true,
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
  ytdlpAutoPaste: true,
  ytdlpCustomArgs: "",
  ytdlpFilenameFormat: "%(title)s [%(id)s].%(ext)s",
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
  const raw = localStorage.getItem(STORAGE_KEYS.LAST_INPUT_FILE) || "";
  if (!raw) return "";
  try {
    let clean = raw;
    if (clean.includes("%") || clean.startsWith("file://")) {
      if (clean.startsWith("file:///")) clean = clean.slice(8);
      else if (clean.startsWith("file://")) clean = clean.slice(7);
      clean = decodeURIComponent(clean);
    }
    return clean;
  } catch (_) {
    return raw;
  }
}

export function saveInputFile(path) {
  try {
    let clean = path || "";
    if (clean.includes("%") || clean.startsWith("file://")) {
      if (clean.startsWith("file:///")) clean = clean.slice(8);
      else if (clean.startsWith("file://")) clean = clean.slice(7);
      clean = decodeURIComponent(clean);
    }
    localStorage.setItem(STORAGE_KEYS.LAST_INPUT_FILE, clean);
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

export function getLastImageAiOutDir() {
  return localStorage.getItem(STORAGE_KEYS.IMAGE_AI_LAST_OUT_DIR) || "";
}

export function saveLastImageAiOutDir(path) {
  try {
    localStorage.setItem(STORAGE_KEYS.IMAGE_AI_LAST_OUT_DIR, path || "");
  } catch (err) {
    console.warn("Failed to save last image AI out dir:", err);
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
      .map((item) => {
        let p = item.path;
        try {
          if (p.includes("%") || p.startsWith("file://")) {
            if (p.startsWith("file:///")) p = p.slice(8);
            else if (p.startsWith("file://")) p = p.slice(7);
            p = decodeURIComponent(p);
          }
        } catch (_) {}
        return {
          ...item,
          path: p,
          name: item.name && !item.name.includes("%") ? item.name : p.split(/[/\\]/).pop() || p,
          status: item.status === "processing" ? "pending" : item.status,
        };
      });
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

export function loadSavedImageAiQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.IMAGE_AI_QUEUE);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => item && item.path)
      .map((item) => ({
        ...item,
        status: item.status === "processing" ? "pending" : (item.status || "pending"),
      }));
  } catch (err) {
    console.warn("Failed to load Image AI queue from storage:", err);
    return [];
  }
}

export function saveImageAiQueue(queue) {
  try {
    localStorage.setItem(STORAGE_KEYS.IMAGE_AI_QUEUE, JSON.stringify(queue || []));
  } catch (err) {
    console.warn("Failed to save Image AI queue:", err);
  }
}

export function getSavedAiReplaceSource() {
  return localStorage.getItem(STORAGE_KEYS.AI_REPLACE_SOURCE) === "true";
}

export function saveAiReplaceSource(val) {
  try {
    localStorage.setItem(STORAGE_KEYS.AI_REPLACE_SOURCE, val ? "true" : "false");
  } catch (err) {
    console.warn("Failed to save AI replace source preference:", err);
  }
}

export function loadUserKits() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER_KITS);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn("Failed to load user kits from storage:", err);
    return [];
  }
}

export function saveUserKits(kits) {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_KITS, JSON.stringify(kits || []));
  } catch (err) {
    console.warn("Failed to save user kits:", err);
  }
}

export function getUserKitById(id) {
  const kits = loadUserKits();
  return kits.find((k) => k && k.id === id) || null;
}

export function saveUserKit(kit) {
  if (!kit || !kit.id) return;
  const kits = loadUserKits();
  const idx = kits.findIndex((k) => k && k.id === kit.id);
  if (idx >= 0) {
    kits[idx] = kit;
  } else {
    kits.push(kit);
  }
  saveUserKits(kits);
}

export function deleteUserKit(id) {
  const kits = loadUserKits();
  const filtered = kits.filter((k) => k && k.id !== id);
  saveUserKits(filtered);
}

export function getSavedActiveKit() {
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_KIT) || "";
}

export function saveActiveKit(id) {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_KIT, id || "");
  } catch (err) {
    console.warn("Failed to save active kit id:", err);
  }
}

export function getSavedKitParams(kitId) {
  if (!kitId) return {};
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.TOOL_PARAMS_PREFIX}kit_${kitId}`);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn(`Failed to load kit params for kit_${kitId}:`, err);
    return {};
  }
}

export function saveKitParams(kitId, params) {
  if (!kitId) return;
  try {
    localStorage.setItem(`${STORAGE_KEYS.TOOL_PARAMS_PREFIX}kit_${kitId}`, JSON.stringify(params || {}));
  } catch (err) {
    console.warn(`Failed to save kit params for kit_${kitId}:`, err);
  }
}



