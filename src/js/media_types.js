// AnEdiKit - Pure media file-type helpers (no DOM, no storage, no cycles).
// Single source of truth for audio/image/video classification.
// Previously duplicated across commands.js (isAudioPath), trimmer.js
// (isAudioFile/isImageFile/isVideoFile) and media.js re-exports.

export const AUDIO_EXTS = new Set([
  "mp3",
  "wav",
  "flac",
  "m4a",
  "ogg",
  "opus",
  "wma",
  "aac",
  "aiff",
  "alac",
]);

export const IMAGE_EXTS = new Set([
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

export function getExtension(filePath) {
  if (!filePath) return "";
  return String(filePath).split(/[?#]/)[0].split(".").pop().toLowerCase();
}

// Legacy name from commands.js — extension-based audio detection.
export function isAudioPath(filePath) {
  if (!filePath) return false;
  return AUDIO_EXTS.has(getExtension(filePath));
}

// Canonical names used by trimmer.js / media.js.
export function isAudioFile(filePath) {
  return isAudioPath(filePath);
}

export function isImageFile(filePath) {
  if (!filePath) return false;
  return IMAGE_EXTS.has(getExtension(filePath));
}

export function isVideoFile(filePath) {
  if (!filePath) return false;
  return !isAudioFile(filePath) && !isImageFile(filePath);
}
