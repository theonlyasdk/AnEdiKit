// AnEdiKit - Output Filename and Path Management Submodule
import { formatSpeedValue } from "./format_sync.js";
import { getCurrentInputFile } from "./media.js";
import { getCurrentActiveTool } from "./navigation.js";
import { loadSettings, getLastOutputDir, saveLastOutputDir } from "./storage.js";
import { getMergeFiles } from "./merge.js";

let userHasCustomOutputName = false;
let cachedPathCharsWidth = 0;
let cachedPathCharsResult = 50;
let checkFileExistsTimer = null;

export function getUserHasCustomOutputName() {
  return userHasCustomOutputName;
}

export function setUserHasCustomOutputName(val) {
  userHasCustomOutputName = !!val;
}

export function getSmartOutputFileName(inputFile, toolId) {
  const rawInput = inputFile || "output.mp4";
  const baseName =
    rawInput
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "") || "output";
  const sourceExt = (rawInput.split(".").pop() || "mp4").toLowerCase();

  switch (toolId) {
    case "convert": {
      const container = document.getElementById("cvt-container")?.value || "mp4";
      return `${baseName}_converted.${container}`;
    }
    case "extract_audio": {
      const fmt = document.getElementById("aud-format")?.value || "mp3";
      return `${baseName}_extracted.${fmt}`;
    }
    case "trim": {
      const ext = (rawInput.split(".").pop() || "mp4").toLowerCase();
      return `${baseName}_trimmed.${ext}`;
    }
    case "speed_motion": {
      const container = document.getElementById("speed-container")?.value || "mp4";
      const spNum = parseFloat(document.getElementById("speed-preset")?.value) || 2.0;
      return `${baseName}_${formatSpeedValue(spNum)}x.${container}`;
    }
    case "aspect_crop": {
      const container = document.getElementById("crop-container")?.value || "mp4";
      const ratio = (document.getElementById("crop-ratio")?.value || "9:16").replace(":", "x");
      return `${baseName}_${ratio}.${container}`;
    }
    case "stabilize": {
      const container = document.getElementById("stab-container")?.value || "mp4";
      return `${baseName}_stabilized.${container}`;
    }
    case "loop_duration": {
      const container = document.getElementById("loop-container")?.value || "mp4";
      return `${baseName}_looped.${container}`;
    }
    case "normalize": {
      const videoMode = document.getElementById("norm-video-mode")?.value || "copy";
      const acodec = document.getElementById("norm-acodec")?.value || "aac";
      let ext = "mp4";
      if (videoMode === "strip") {
        ext = acodec === "libmp3lame" ? "mp3" : acodec === "libopus" ? "opus" : acodec === "flac" ? "flac" : acodec === "pcm_s16le" ? "wav" : "m4a";
      }
      return `${baseName}_normalized.${ext}`;
    }
    case "compress":
      return `${baseName}_compressed.mp4`;
    case "compress_audio": {
      const fmt = document.getElementById("comp-aud-format")?.value || "opus";
      return `${baseName}_compressed.${fmt}`;
    }
    case "audio_tags": {
      const ext = (rawInput.split(".").pop() || "mp3").toLowerCase();
      return `${baseName}_tagged.${ext}`;
    }
    case "merge": {
      const fmt = document.getElementById("merge-format")?.value || "mp4";
      return `${baseName}_merged.${fmt}`;
    }
    case "mute_replace":
      return `${baseName}_audio_edit.mp4`;
    case "gif_frames": {
      const mode = document.getElementById("gif-mode")?.value || "gif_hq";
      const snapFmt = document.getElementById("gif-snap-fmt")?.value || "png";
      if (mode === "snapshot") return `${baseName}_snapshot.${snapFmt}`;
      if (mode === "frames_seq") return `${baseName}_frame_%04d.${snapFmt}`;
      return `${baseName}_animated.gif`;
    }
    case "custom": {
      const ext = document.getElementById("custom-ext")?.value || "mp4";
      return `${baseName}_custom.${ext}`;
    }
    case "bg_remover":
      return `${baseName}_nobg.png`;
    case "ai_upscaler": {
      const s = document.getElementById("upscale-factor")?.value || "2";
      return `${baseName}_${s}x_upscaled.png`;
    }
    case "vectorizer":
      return `${baseName}_vector.svg`;
    case "restore_denoise":
      return `${baseName}_restored.${sourceExt}`;
    case "icon_generator":
      return `${baseName}_icons`;
    case "metadata_cleaner": {
      const fmt = document.getElementById("meta-out-format")?.value || "original";
      const targetExt = fmt === "original" ? sourceExt : fmt;
      return `${baseName}_clean.${targetExt}`;
    }
    default:
      return `${baseName}_out.mp4`;
  }
}

export function truncateMiddlePath(fullPath, maxChars = 50) {
  if (!fullPath || typeof fullPath !== "string") return "";
  if (fullPath.length <= maxChars) return fullPath;

  const isWindows = fullPath.includes("\\") || /^[a-zA-Z]:/.test(fullPath);
  const sep = isWindows ? "\\" : "/";
  const parts = fullPath.split(/[/\\]/).filter(Boolean);

  if (parts.length <= 1) {
    const keep = Math.max(4, Math.floor((maxChars - 1) / 2));
    return `${fullPath.slice(0, keep)}…${fullPath.slice(-keep)}`;
  }

  const filename = parts[parts.length - 1];
  const driveOrRoot = isWindows && /^[a-zA-Z]:/.test(fullPath)
    ? `${parts[0]}${sep}`
    : fullPath.startsWith("/")
      ? `/${parts[0]}`
      : parts[0];

  const minNeeded = driveOrRoot.length + filename.length + 3;
  if (minNeeded > maxChars) {
    const availForFilename = Math.max(10, maxChars - driveOrRoot.length - 4);
    const truncFilename =
      filename.length > availForFilename
        ? `…${filename.slice(-availForFilename)}`
        : filename;
    const prefix = driveOrRoot.endsWith(sep) ? driveOrRoot : `${driveOrRoot}${sep}`;
    return `${prefix}…${sep}${truncFilename}`;
  }

  const leftSegments = [parts[0]];
  const rightSegments = [filename];
  let leftIdx = 1;
  let rightIdx = parts.length - 2;
  let currentLen = driveOrRoot.length + filename.length + 3;

  while (leftIdx <= rightIdx) {
    const rightPart = parts[rightIdx];
    if (currentLen + rightPart.length + 1 <= maxChars) {
      rightSegments.unshift(rightPart);
      currentLen += rightPart.length + 1;
      rightIdx--;
    } else {
      break;
    }

    if (leftIdx <= rightIdx) {
      const leftPart = parts[leftIdx];
      if (currentLen + leftPart.length + 1 <= maxChars) {
        leftSegments.push(leftPart);
        currentLen += leftPart.length + 1;
        leftIdx++;
      } else {
        break;
      }
    }
  }

  const leftPath = isWindows && /^[a-zA-Z]:/.test(fullPath)
    ? (leftSegments.length === 1 ? `${leftSegments[0]}${sep}` : leftSegments.join(sep))
    : (fullPath.startsWith("/") ? `/${leftSegments.join(sep)}` : leftSegments.join(sep));

  const rightPath = rightSegments.join(sep);
  const leftClean = leftPath.endsWith(sep) ? leftPath : `${leftPath}${sep}`;
  return `${leftClean}…${sep}${rightPath}`;
}

export function getAvailablePathChars(inputEl) {
  if (!inputEl) return 50;
  const width = inputEl.clientWidth;
  if (width <= 0) return cachedPathCharsResult || 50;
  if (Math.abs(width - cachedPathCharsWidth) < 10) return cachedPathCharsResult;
  cachedPathCharsWidth = width;
  const avail = Math.floor((width - 30) / 7.5);
  cachedPathCharsResult = Math.max(25, avail);
  return cachedPathCharsResult;
}

export function debouncedCheckOutputTargetFileExists(delay = 80) {
  if (checkFileExistsTimer) clearTimeout(checkFileExistsTimer);
  checkFileExistsTimer = setTimeout(() => {
    checkOutputTargetFileExists();
  }, delay);
}

export async function checkOutputTargetFileExists() {
  const outputInput = document.getElementById("output-file-name");
  const warningEl = document.getElementById("output-file-exists-warning");
  const browseBtn = document.getElementById("btn-browse-output-dir");
  if (!outputInput || !warningEl) return;

  const targetPath = getOutputFilePath().trim();
  if (!targetPath || !targetPath.includes(".")) {
    warningEl.classList.add("d-none");
    outputInput.classList.remove("border-warning");
    if (browseBtn) {
      browseBtn.classList.remove("btn-warning", "text-dark");
      browseBtn.classList.add("btn-outline-secondary");
    }
    return;
  }

  let exists = false;
  if (window.__TAURI__?.core?.invoke) {
    try {
      exists = await window.__TAURI__.core.invoke("check_file_exists", { filePath: targetPath });
    } catch (e) {
      console.warn("check_file_exists error:", e);
    }
  }

  if (exists) {
    warningEl.classList.remove("d-none");
    outputInput.classList.add("border-warning");
    if (browseBtn) {
      browseBtn.classList.remove("btn-outline-secondary");
      browseBtn.classList.add("btn-warning", "text-dark");
    }
  } else {
    warningEl.classList.add("d-none");
    outputInput.classList.remove("border-warning");
    if (browseBtn) {
      browseBtn.classList.remove("btn-warning", "text-dark");
      browseBtn.classList.add("btn-outline-secondary");
    }
  }
}

export function setOutputFilePath(fullPath) {
  const outputInput = document.getElementById("output-file-name");
  if (!outputInput) return;
  outputInput.dataset.fullPath = fullPath;
  outputInput.title = fullPath;

  if (fullPath) {
    const lastSlash = Math.max(fullPath.lastIndexOf("\\"), fullPath.lastIndexOf("/"));
    if (lastSlash > 0) {
      const dir = fullPath.substring(0, lastSlash);
      if (dir) saveLastOutputDir(dir);
    }
  }

  if (document.activeElement === outputInput) {
    outputInput.value = fullPath;
  } else {
    const maxChars = getAvailablePathChars(outputInput);
    outputInput.value = truncateMiddlePath(fullPath, maxChars);
  }

  debouncedCheckOutputTargetFileExists();
}

export function getOutputFilePath() {
  const outputInput = document.getElementById("output-file-name");
  if (!outputInput) return "";
  return outputInput.dataset.fullPath || outputInput.value || "";
}

export function refreshOutputFilePathDisplay() {
  const outputInput = document.getElementById("output-file-name");
  if (!outputInput || document.activeElement === outputInput) return;
  const fullPath = outputInput.dataset.fullPath || outputInput.value;
  if (fullPath) {
    const maxChars = getAvailablePathChars(outputInput);
    outputInput.value = truncateMiddlePath(fullPath, maxChars);
  }
}

export function updateAutoOutputFilename(force = false) {
  const outputNameInput = document.getElementById("output-file-name");
  if (!outputNameInput) return;

  const currentInput = getCurrentInputFile();
  const activeTool = getCurrentActiveTool();

  // If active tool doesn't use the shared input/output filename card, skip entirely
  const isImageTool = [
    "bg_remover",
    "ai_upscaler",
    "vectorizer",
    "restore_denoise",
    "icon_generator",
    "metadata_cleaner",
  ].includes(activeTool);
  if (
    activeTool === "settings" ||
    activeTool === "audio_tags" ||
    activeTool?.startsWith("ytdlp_") ||
    activeTool?.startsWith("kit_") ||
    isImageTool
  ) {
    return;
  }

  let effectiveInput = currentInput;
  if (activeTool === "merge") {
    try {
      const mFiles = getMergeFiles ? getMergeFiles() : [];
      if (mFiles && mFiles.length > 0) {
        effectiveInput = mFiles[0];
      }
    } catch (_) {}
  }

  if (force || !userHasCustomOutputName || !getOutputFilePath().trim()) {
    const smartName = getSmartOutputFileName(effectiveInput, activeTool);
    const settings = loadSettings();
    let outDir = getLastOutputDir() || settings.outputDir || "C:\\Users\\User\\Videos";
    if (effectiveInput) {
      const lastSlash = Math.max(effectiveInput.lastIndexOf("\\"), effectiveInput.lastIndexOf("/"));
      if (lastSlash > 0) {
        outDir = effectiveInput.substring(0, lastSlash);
      }
    }
    saveLastOutputDir(outDir);
    const isWindows = outDir.includes("\\") || /^[a-zA-Z]:/.test(outDir);
    const sep = isWindows ? "\\" : "/";
    const fullPath = `${outDir.replace(/[/\\]+$/, "")}${sep}${smartName}`;

    setOutputFilePath(fullPath);
    if (force) userHasCustomOutputName = false;
  } else {
    debouncedCheckOutputTargetFileExists();
  }
}
