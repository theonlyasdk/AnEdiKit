// AnEdiKit - Path/audio-container helpers + timestamp delegate.
import { isAudioPath as isAudioPathPure } from "../media_types.js";
import { resolveDestinationPathPure } from "../path_resolve.js";
import { parseTimestampToSeconds as parseTimestampPure } from "../time_format.js";

// Delegated to media_types.js (single source of truth). Kept here for
// backward compatibility — existing imports from commands.js keep working.
export function isAudioPath(filePath) {
  return isAudioPathPure(filePath);
}

// Map a source audio codec to a container that can mux it with `-c:a copy`.
// Returns null when no confident mapping exists (caller keeps its default).


// Map a source audio codec to a container that can mux it with `-c:a copy`.
// Returns null when no confident mapping exists (caller keeps its default).
export function audioCodecToContainer(codec) {
  const c = String(codec || "").trim().toLowerCase();
  if (!c) return null;
  if (c === "aac" || c === "alac") return "m4a";
  if (c === "mp3") return "mp3";
  if (c === "opus") return "opus";
  if (c === "vorbis") return "ogg";
  if (c === "flac") return "flac";
  if (c === "ac3") return "ac3";
  if (c === "eac3") return "eac3";
  if (c === "dts" || c === "dca") return "dts";
  if (c === "amr" || c === "libopencore_amrnb") return "amr";
  if (c === "wmav1" || c === "wmav2" || c === "wma") return "wma";
  if (c === "pcm" || c.startsWith("pcm_")) return "wav";
  return null;
}


export function resolveDestinationPath(defaultFileName, settings = {}, inputFile = "") {
  // Thin DOM adapter over the pure resolver in path_resolve.js.
  const currentInput = inputFile || document.getElementById("input-file-path")?.value?.trim() || "";
  const customNameInput = document.getElementById("output-file-name");
  const fullPath = customNameInput?.dataset?.fullPath || "";
  const customName = customNameInput?.value?.trim() || "";
  return resolveDestinationPathPure(defaultFileName, settings, currentInput, customName, fullPath);
}

let detectedHardwareInfo = null;


// Delegated to time_format.js (was a duplicate copy).
export function parseTimestampToSeconds(ts) {
  return parseTimestampPure(ts);
}
