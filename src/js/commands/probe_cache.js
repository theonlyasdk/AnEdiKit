// AnEdiKit - Probe-result cache + tri-state audio helpers (pure).
// Probed media metadata cache (populated by media.js after each probe and by
// main.js for merge list files). Lets synchronous command builders adapt to
// silent inputs / audio-only inputs without awaiting Tauri IPC.
// Entry: { audioCodec: string|null, videoCodec: string|null, duration: number|NaN }
const mediaProbeCache = new Map();

export function setCachedMediaProbe(filePath, info = {}) {
  if (!filePath) return;
  mediaProbeCache.set(filePath, {
    audioCodec: info.audio_codec ?? info.audioCodec ?? null,
    videoCodec: info.video_codec ?? info.videoCodec ?? null,
    duration: Number(info.duration_seconds ?? info.duration ?? NaN),
  });
}


export function getCachedMediaProbe(filePath) {
  if (!filePath) return null;
  return mediaProbeCache.get(filePath) || null;
}

// Tri-state audio presence from probed metadata: true / false / null (unknown).
// Missing-audio markers from the backend are "--" (no stream found) and
// "None" (image files); unknown means "assume present" (legacy behavior).


// Tri-state audio presence from probed metadata: true / false / null (unknown).
// Missing-audio markers from the backend are "--" (no stream found) and
// "None" (image files); unknown means "assume present" (legacy behavior).
export function probeHasAudio(filePath) {
  const probe = getCachedMediaProbe(filePath);
  if (!probe || probe.audioCodec == null) return null;
  const c = String(probe.audioCodec).trim().toLowerCase();
  if (!c || c === "--" || c === "none" || c === "n/a") return false;
  return true;
}

// Tri-state pure-audio detection: true when the probe confirms no video
// stream, false when a video codec is present, null when unknown.


// Tri-state pure-audio detection: true when the probe confirms no video
// stream, false when a video codec is present, null when unknown.
export function probeIsAudioOnly(filePath) {
  const probe = getCachedMediaProbe(filePath);
  if (!probe || probe.videoCodec == null) return null;
  const c = String(probe.videoCodec).trim().toLowerCase();
  if (c === "none" || c === "n/a") return true;
  if (!c || c === "--") return null;
  return false;
}

// Delegated to media_types.js (single source of truth). Kept here for
// backward compatibility — existing imports from commands.js keep working.
