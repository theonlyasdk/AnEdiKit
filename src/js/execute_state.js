// AnEdiKit - Pure execute-button state resolution (no DOM).
// Extracted from execution.js updateExecuteButtonState(), which mixed
// queue inspection, tool branching, and direct button mutation across
// ~130 lines. This module returns a plain decision object; execution.js
// applies it to the DOM.

export const IMAGE_AI_TOOLS = new Set([
  "bg_remover",
  "ai_upscaler",
  "vectorizer",
  "restore_denoise",
  "icon_generator",
  "metadata_cleaner",
]);

export function isImageAiTool(toolId) {
  return IMAGE_AI_TOOLS.has(toolId);
}

// All inputs are plain values — no document, no store access.
// playlistVideos: array of {checked:boolean}
export function resolveExecuteButtonState({
  activeTool = "convert",
  currentUrl = "",
  fetchedPlaylistUrl = "",
  playlistVideos = [],
  isFetchingPlaylist = false,
  jobRunning = false,
  batchQueueLen = 0,
  hasInput = false,
  imgQueueLen = 0,
  audioQueueLen = 0,
  audioLoading = false,
  mergeFilesLen = 0,
  hasCustomArgs = false,
} = {}) {
  if (activeTool === "settings") {
    return { mode: "hidden", text: "", canExecute: false, disabled: true };
  }
  if (jobRunning) {
    return { mode: "cancel", text: "Cancel", canExecute: true, disabled: false };
  }
  if (activeTool === "audio_tags" && audioLoading) {
    return {
      mode: "loading",
      text: "Loading...",
      canExecute: false,
      disabled: true,
      tooltip: "Reading audio metadata and artwork...",
    };
  }

  const isImageAi = isImageAiTool(activeTool);
  let text = "Execute";
  let canExecute = false;

  if (activeTool === "ytdlp_playlist") {
    const isUrlChanged = currentUrl !== fetchedPlaylistUrl;
    if (playlistVideos.length === 0 || isUrlChanged) {
      text = isFetchingPlaylist ? "Fetching..." : "Fetch Playlist";
      canExecute = currentUrl.length > 0 && !isFetchingPlaylist;
    } else {
      const selectedCount = playlistVideos.filter((v) => v.checked).length;
      text = `Download (${selectedCount})`;
      canExecute = selectedCount > 0;
    }
  } else if (activeTool.startsWith("kit_")) {
    text = "Execute Kit";
    canExecute = true;
  } else if (activeTool.startsWith("ytdlp_")) {
    text = "Download";
    canExecute = currentUrl.length > 0;
  } else if (isImageAi) {
    text = imgQueueLen > 1 ? `Execute (${imgQueueLen})` : "Execute";
    canExecute = imgQueueLen > 0;
  } else if (activeTool === "audio_tags") {
    text = audioQueueLen > 1 ? `Apply (${audioQueueLen})` : "Apply";
    canExecute = audioQueueLen > 0;
  } else if (batchQueueLen > 1 && activeTool !== "merge" && activeTool !== "settings") {
    text = `Execute (${batchQueueLen})`;
    canExecute = hasInput;
  } else {
    text = "Execute";
    if (activeTool === "merge") {
      canExecute = mergeFilesLen >= 2;
    } else if (activeTool === "custom") {
      canExecute = hasCustomArgs;
    } else {
      canExecute = hasInput;
    }
  }

  return {
    mode: "normal",
    text,
    canExecute,
    disabled: !canExecute,
    tooltip: resolveExecuteTooltip({
      activeTool,
      canExecute,
      playlistVideos,
      isImageAi,
      imgQueueLen,
      audioQueueLen,
      currentUrl,
      fetchedPlaylistUrl,
    }),
  };
}

export function resolveExecuteTooltip({
  activeTool = "convert",
  canExecute = false,
  playlistVideos = [],
  isImageAi = false,
  imgQueueLen = 0,
  audioQueueLen = 0,
} = {}) {
  if (!canExecute) {
    if (activeTool === "ytdlp_playlist") {
      return playlistVideos.length > 0
        ? "Select at least 1 video to download"
        : "Enter a playlist URL to fetch";
    }
    if (activeTool.startsWith("ytdlp_")) return "Enter a valid media URL to download";
    if (activeTool === "merge") return "Add at least 2 files to merge";
    if (activeTool === "custom") return "Enter custom arguments to execute";
    if (isImageAi) return "Add images to the queue to execute operation";
    if (activeTool === "audio_tags") return "Add audio tracks to the queue to apply tags";
    return "Select a file to execute operation";
  }
  if (activeTool.startsWith("kit_")) return "Execute current User Kit";
  if (activeTool === "ytdlp_playlist") {
    return playlistVideos.length > 0
      ? "Download selected playlist videos"
      : "Fetch videos from playlist URL";
  }
  if (activeTool.startsWith("ytdlp_")) return "Start download task";
  if (isImageAi) return `Run image processing queue (${imgQueueLen})`;
  if (activeTool === "audio_tags") return `Apply metadata changes to ${audioQueueLen} track(s)`;
  return "Run processing operation";
}
