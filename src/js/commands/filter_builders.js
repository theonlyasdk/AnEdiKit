// AnEdiKit - Filter-graph builders (speed/crop/stabilize/normalize).
import { probeIsAudioOnly, probeHasAudio } from "./probe_cache.js";
import { isAudioPath, resolveDestinationPath } from "./path_helpers.js";
import { getResolvedHwaccel, getHwaccelInputArgs, applyVideoEncoderOptions } from "./hwaccel.js";

function buildAtempoFilter(speed) {
  // Sanitize first: non-finite or non-positive speeds would spin the
  // halving/doubling loops below forever and freeze the tab. Clamp to the
  // UI slider range (0.25x–16x).
  let remaining = Number(speed);
  if (!Number.isFinite(remaining) || remaining <= 0) remaining = 2.0;
  remaining = Math.min(16, Math.max(0.25, remaining));
  const filters = [];
  while (remaining > 2.0) {
    filters.push("atempo=2.0");
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters.join(",");
}


export function buildSpeedMotionCommand(inputFile, outputDir, settings = {}, durationSec = null) {
  const args = ["-y"];
  const src = inputFile || "C:\\Users\\User\\Videos\\input_sample.mp4";
  const baseName = src.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, "") || "output";

  const presetVal = document.getElementById("speed-preset")?.value || "2.0";
  let speed = 2.0;
  if (presetVal === "custom") {
    speed = parseFloat(document.getElementById("speed-custom-val")?.value) || 2.0;
  } else {
    speed = parseFloat(presetVal) || 2.0;
  }
  if (speed <= 0) speed = 1.0;

  const audioMode = document.getElementById("speed-audio-mode")?.value || "atempo";
  const interpMode = document.getElementById("speed-interp")?.value || "none";
  const container = document.getElementById("speed-container")?.value || "mp4";

  const dst = resolveDestinationPath(`${baseName}_${speed}x.${container}`, settings, src);

  const hwChoice = getResolvedHwaccel(settings);
  args.push(...getHwaccelInputArgs(hwChoice));

  args.push("-i", src);

  // Video Filter
  const vFilters = [`setpts=${(1 / speed).toFixed(6)}*PTS`];
  if (interpMode === "blend") {
    vFilters.push("tblend=all_mode=average");
  } else if (interpMode === "minterpolate") {
    vFilters.push("minterpolate=mi_mode=mci:mc_mode=aobmc:search_param=8:scd=fdiff:fps=60");
  }

  // Audio filter handling
  if (audioMode === "strip") {
    args.push("-vf", vFilters.join(","), "-an");
  } else if (audioMode === "drop") {
    args.push("-vf", vFilters.join(","), "-c:a", "copy");
  } else {
    // Pitch corrected audio
    const atempoStr = buildAtempoFilter(speed);
    args.push("-filter_complex", `[0:v]${vFilters.join(",")}[v];[0:a]${atempoStr}[a]`, "-map", "[v]", "-map", "[a]");
  }

  applyVideoEncoderOptions(args, "libx264", settings, { crf: "22", preset: "medium" });
  if (audioMode === "atempo") {
    args.push("-c:a", "aac", "-b:a", "192k");
  }

  args.push("-progress", "pipe:1", dst);

  const newDur = durationSec ? durationSec / speed : null;

  return {
    executable: "ffmpeg",
    args,
    destination: dst,
    duration: newDur,
    fullString: `ffmpeg ${args.map((a) => (a.includes(" ") || a.includes("[") ? `"${a}"` : a)).join(" ")}`,
  };
}


export function buildAspectCropCommand(inputFile, outputDir, settings = {}, durationSec = null) {
  const args = ["-y"];
  const src = inputFile || "C:\\Users\\User\\Videos\\input_sample.mp4";
  const baseName = src.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, "") || "output";

  const ratio = document.getElementById("crop-ratio")?.value || "9:16";
  const mode = document.getElementById("crop-mode")?.value || "center_crop";
  const crf = document.getElementById("crop-crf")?.value || "23";
  const container = document.getElementById("crop-container")?.value || "mp4";

  const dst = resolveDestinationPath(`${baseName}_${ratio.replace(":", "x")}.${container}`, settings, src);

  const hwChoice = getResolvedHwaccel(settings);
  args.push(...getHwaccelInputArgs(hwChoice));

  args.push("-i", src);

  // Ratio dimensions mapping
  let [rw, rh] = ratio.split(":").map((v) => parseFloat(v));
  if (!rw || !rh) { rw = 9; rh = 16; }

  if (mode === "center_crop") {
    args.push("-vf", `crop='min(iw,ih*(${rw}/${rh}))':'min(ih,iw*(${rh}/${rw}))'`);
    applyVideoEncoderOptions(args, "libx264", settings, { crf, preset: "medium" });
    args.push("-c:a", "copy");
  } else if (mode === "pad_black") {
    args.push("-vf", `pad='max(iw,ih*(${rw}/${rh}))':'max(ih,iw*(${rh}/${rw}))':(ow-iw)/2:(oh-ih)/2:black`);
    applyVideoEncoderOptions(args, "libx264", settings, { crf, preset: "medium" });
    args.push("-c:a", "copy");
  } else if (mode === "pad_blur") {
    let targetW = 1080;
    let targetH = Math.round(targetW * (rh / rw));
    if (targetH % 2 !== 0) targetH++;
    args.push(
      "-filter_complex",
      `[0:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},boxblur=20:5[bg];[0:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[v]`,
      "-map", "[v]",
      "-map", "0:a?",
    );
    applyVideoEncoderOptions(args, "libx264", settings, { crf, preset: "medium" });
    args.push("-c:a", "copy");
  } else {
    let targetW = 1080;
    let targetH = Math.round(targetW * (rh / rw));
    if (targetH % 2 !== 0) targetH++;
    args.push("-vf", `scale=${targetW}:${targetH}`);
    applyVideoEncoderOptions(args, "libx264", settings, { crf, preset: "medium" });
    args.push("-c:a", "copy");
  }

  args.push("-progress", "pipe:1", dst);

  return {
    executable: "ffmpeg",
    args,
    destination: dst,
    duration: durationSec,
    fullString: `ffmpeg ${args.map((a) => (a.includes(" ") || a.includes("[") ? `"${a}"` : a)).join(" ")}`,
  };
}


export function buildStabilizeCommand(inputFile, outputDir, settings = {}, durationSec = null) {
  const args = ["-y"];
  const src = inputFile || "C:\\Users\\User\\Videos\\input_sample.mp4";
  const baseName = src.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, "") || "output";

  const smooth = document.getElementById("stab-smooth")?.value || "medium";
  const border = document.getElementById("stab-border")?.value || "crop";
  const container = document.getElementById("stab-container")?.value || "mp4";

  const dst = resolveDestinationPath(`${baseName}_stabilized.${container}`, settings, src);

  const hwChoice = getResolvedHwaccel(settings);
  args.push(...getHwaccelInputArgs(hwChoice));

  args.push("-i", src);

  let rx = 32;
  let ry = 32;
  if (smooth === "low") { rx = 16; ry = 16; }
  else if (smooth === "high") { rx = 64; ry = 64; }
  else if (smooth === "tripod") { rx = 64; ry = 64; }

  let edgeStr = border === "black" ? "blank" : "mirror";
  let filterStr = `deshake=rx=${rx}:ry=${ry}:edge=${edgeStr}:blocksize=32:contrast=125:search=0`;
  if (border === "crop") {
    filterStr += ",crop=iw*0.92:ih*0.92,scale=iw:ih";
  }

  args.push("-vf", filterStr);
  applyVideoEncoderOptions(args, "libx264", settings, { crf: "20", preset: "medium" });
  args.push("-c:a", "copy", "-progress", "pipe:1", dst);

  return {
    executable: "ffmpeg",
    args,
    destination: dst,
    duration: durationSec,
    fullString: `ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}


export function buildNormalizeCommand(inputFile, outputDir, settings = {}, durationSec = null) {
  const args = ["-y"];
  const src = inputFile || "C:\\Users\\User\\Videos\\input_sample.mp4";
  const baseName = src.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, "") || "output";

  const target = document.getElementById("norm-target")?.value || "spotify_youtube";
  const customLufs = document.getElementById("norm-custom-lufs")?.value || "-14";
  const tp = document.getElementById("norm-tp")?.value || "-1.0";
  const videoMode = document.getElementById("norm-video-mode")?.value || "copy";
  const acodec = document.getElementById("norm-acodec")?.value || "aac";

  // Pure-audio inputs have no video stream: `-c:v copy` fails and .mp4 is the
  // wrong container. Detect via probe (authoritative) with an extension
  // heuristic fallback, then emit audio-only output in a matching container.
  const probedAudioOnly = probeIsAudioOnly(src);
  const inputIsAudio = probedAudioOnly === true || (probedAudioOnly == null && isAudioPath(src));

  const acodecExt = acodec === "libmp3lame" ? "mp3" : acodec === "libopus" ? "opus" : acodec === "flac" ? "flac" : acodec === "pcm_s16le" ? "wav" : "m4a";

  let ext = "mp4";
  if (videoMode === "strip" || inputIsAudio) {
    ext = acodecExt;
  }

  const dst = resolveDestinationPath(`${baseName}_normalized.${ext}`, settings, src);

  args.push("-i", src);

  let afFilter = `loudnorm=I=-14:TP=${tp}:LRA=11`;
  if (target === "apple_podcast") {
    afFilter = `loudnorm=I=-16:TP=${tp}:LRA=11`;
  } else if (target === "ebu_r128") {
    afFilter = `loudnorm=I=-23:TP=${tp}:LRA=11`;
  } else if (target === "custom") {
    afFilter = `loudnorm=I=${customLufs}:TP=${tp}:LRA=11`;
  } else if (target === "dynaudnorm") {
    afFilter = "dynaudnorm=f=150:g=15:p=0.95";
  } else if (target === "peak") {
    afFilter = "volume=0dB";
  }

  if (videoMode === "strip" || inputIsAudio) {
    args.push("-vn", "-af", afFilter, "-c:a", acodec);
  } else {
    args.push("-c:v", "copy", "-af", afFilter, "-c:a", acodec);
  }

  if (acodec === "aac" || acodec === "libmp3lame") {
    args.push("-b:a", "256k");
  }

  args.push("-progress", "pipe:1", dst);

  return {
    executable: "ffmpeg",
    args,
    destination: dst,
    duration: durationSec,
    fullString: `ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}
