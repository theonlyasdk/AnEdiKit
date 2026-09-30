// AnEdiKit - Central media selection state (no DOM, no imports).
// Breaks the media.js <-> trimmer.js cycle: both read selection state from
// here instead of trimmer importing getters from media.js. media.js remains
// the writer (probe flow) and keeps backward-compatible getter exports;
// read-only consumers (trimmer, estimates, output_path) import this directly.
//
// Single shared object (not accessors-only) so existing mutation sites in
// media.js map mechanically: `currentInputFile = x` becomes
// `mediaState.currentInputFile = x` with identical semantics.

export const mediaState = {
  currentInputFile: "",
  currentMediaInfo: null,
  // Probe-result cache: filePath -> media info object.
  mediaInfoCache: new Map(),
};

export function getCurrentInputFile() {
  return mediaState.currentInputFile;
}

export function setCurrentInputFile(filePath) {
  mediaState.currentInputFile = filePath || "";
}

export function getCurrentMediaInfo() {
  return mediaState.currentMediaInfo;
}

export function setCurrentMediaInfo(info) {
  mediaState.currentMediaInfo = info || null;
}

export function getCachedMediaInfo(filePath) {
  if (!filePath) return null;
  return mediaState.mediaInfoCache.get(filePath) || null;
}

export function setCachedMediaInfo(filePath, info) {
  if (filePath) mediaState.mediaInfoCache.set(filePath, info);
}

export function clearMediaInfoCache() {
  mediaState.mediaInfoCache.clear();
}
