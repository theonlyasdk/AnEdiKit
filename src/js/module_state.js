// AnEdiKit - Module State Persistence and Restoration Submodule
import { getSavedToolParams, saveToolParams } from "./storage.js";
import { TOOL_METADATA } from "./navigation.js";
import { syncSpeedSliderUI, syncFormatSpecificUI } from "./format_sync.js";

export function saveActiveModuleState(toolId) {
  if (!toolId || toolId === "settings" || toolId.startsWith("kit_")) return;
  const viewId = TOOL_METADATA[toolId]?.viewId || `view-${toolId}`;
  const viewEl = document.getElementById(viewId);
  if (!viewEl) return;

  const properties = [];

  // 1. Collect all inputs, selects, and textareas inside the tool view
  const inputs = viewEl.querySelectorAll("select, input, textarea");
  inputs.forEach((el) => {
    if (!el.id && !el.name) return;
    const propId = el.id || el.name;
    if (el.type === "checkbox") {
      properties.push({ id: propId, value: el.checked, type: "checkbox" });
    } else if (el.type === "radio") {
      if (el.checked) {
        properties.push({ id: propId, value: el.value, type: "radio" });
      }
    } else if (el.type === "range" || el.type === "number") {
      properties.push({ id: propId, value: el.value, type: el.type });
    } else {
      properties.push({ id: propId, value: el.value, type: el.type || "text" });
    }
  });

  // 2. Collect shared context for yt-dlp downloader modules
  if (toolId.startsWith("ytdlp_")) {
    const ytdlpOut = document.getElementById("ytdlp-output-dir");
    if (ytdlpOut) {
      properties.push({ id: "ytdlp-output-dir", value: ytdlpOut.value || "", type: "text" });
    }
    const ytdlpFmt = document.getElementById("ytdlp-filename-format");
    if (ytdlpFmt) {
      properties.push({ id: "ytdlp-filename-format", value: ytdlpFmt.value || "", type: "text" });
    }
  }

  // 3. Collect shared context for Image & AI modules
  const isImageTool = [
    "bg_remover",
    "ai_upscaler",
    "vectorizer",
    "restore_denoise",
    "icon_generator",
    "metadata_cleaner",
  ].includes(toolId);

  if (isImageTool) {
    const imgOut = document.getElementById("image-ai-output-dir");
    if (imgOut) {
      properties.push({ id: "image-ai-output-dir", value: imgOut.value || "", type: "text" });
    }
    const replaceSw = document.getElementById("ai-replace-source");
    if (replaceSw) {
      properties.push({ id: "ai-replace-source", value: replaceSw.checked, type: "checkbox" });
    }
  }

  saveToolParams(toolId, { moduleId: toolId, properties });
}

export function restoreModuleState(toolId) {
  if (!toolId || toolId === "settings" || toolId.startsWith("kit_")) return;
  const saved = getSavedToolParams(toolId);
  if (!saved || !Array.isArray(saved.properties)) return;

  for (const prop of saved.properties) {
    if (!prop || !prop.id) continue;
    const el = document.getElementById(prop.id);
    if (!el) continue;

    if (prop.type === "checkbox" || el.type === "checkbox") {
      el.checked = !!prop.value;
    } else if (prop.type === "radio" || el.type === "radio") {
      if (el.value === prop.value) el.checked = true;
    } else if (prop.value !== undefined && prop.value !== null) {
      el.value = prop.value;
    }
  }

  // Sync range slider labels if any
  const gridTol = document.getElementById("fake-grid-tolerance");
  const gridTolVal = document.getElementById("fake-grid-tolerance-val");
  if (gridTol && gridTolVal) gridTolVal.textContent = gridTol.value;

  const gapThresh = document.getElementById("fake-gap-threshold");
  const gapThreshVal = document.getElementById("fake-gap-threshold-val");
  if (gapThresh && gapThreshVal) gapThreshVal.textContent = gapThresh.value;

  const bgColorPicker = document.getElementById("bg-color-picker");
  const bgColorInput = document.getElementById("bg-color");
  if (bgColorPicker && bgColorInput && /^#[0-9A-Fa-f]{6}$/.test(bgColorInput.value)) {
    bgColorPicker.value = bgColorInput.value;
  }

  // Sync speed slider badge/number (restoring .value fires no events)
  syncSpeedSliderUI();
  syncFormatSpecificUI(toolId);
}

export function restoreAllModulesState() {
  const tools = [
    "convert",
    "compress",
    "trim",
    "speed_motion",
    "aspect_crop",
    "stabilize",
    "normalize",
    "mute_replace",
    "gif_frames",
    "extract_audio",
    "compress_audio",
    "audio_tags",
    "merge",
    "custom",
    "bg_remover",
    "ai_upscaler",
    "vectorizer",
    "restore_denoise",
    "icon_generator",
    "metadata_cleaner",
    "ytdlp_video",
    "ytdlp_playlist",
    "ytdlp_audio",
    "ytdlp_subtitles",
  ];
  for (const toolId of tools) {
    restoreModuleState(toolId);
  }
  syncFormatSpecificUI();
}
