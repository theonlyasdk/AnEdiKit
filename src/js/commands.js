import { getLastYtDlpOutDir } from "./storage.js";
import { getSavedYtDlpFormat } from "./ytdlp_format.js";

export function resolveDestinationPath(defaultFileName, settings = {}, inputFile = "") {
  const currentInput = inputFile || document.getElementById("input-file-path")?.value?.trim() || "";
  let outDir = "";

  // 1. If explicit custom output directory specified
  if (settings.customOutputDir && settings.customOutputDir.trim()) {
    outDir = settings.customOutputDir.trim();
  }

  // 2. Default directly to the enclosing directory of the source file
  if (!outDir && currentInput) {
    const lastSlash = Math.max(currentInput.lastIndexOf("\\"), currentInput.lastIndexOf("/"));
    if (lastSlash > 0) {
      outDir = currentInput.substring(0, lastSlash);
    }
  }

  // 3. Fallback to settings outputDir or system Videos directory
  if (!outDir) {
    outDir = settings.outputDir || "C:\\Users\\User\\Videos";
  }

  const customNameInput = document.getElementById("output-file-name");
  let targetName = customNameInput?.dataset?.fullPath || customNameInput?.value?.trim() || "";

  if (!targetName) {
    targetName = defaultFileName;
  }

  if (targetName.includes("\\") || targetName.includes("/")) {
    return targetName;
  }

  return `${outDir.replace(/[/\\]+$/, "")}\\${targetName}`;
}

let detectedHardwareInfo = null;

export function setDetectedHardware(info) {
  detectedHardwareInfo = info;
}

export function getResolvedHwaccel(settings = {}) {
  const mode = settings.hwAccel || "auto";
  if (mode === "auto") {
    if (detectedHardwareInfo?.nvidia_gpu) return "cuda";
    if (detectedHardwareInfo?.intel_gpu) return "qsv";
    if (detectedHardwareInfo?.amd_gpu) return "amf";
    return "cpu";
  }
  return mode;
}

export function mapHardwareEncoder(targetCodec, hwChoice) {
  if (hwChoice === "cuda") {
    if (targetCodec === "libx264" || targetCodec === "h264") return "h264_nvenc";
    if (targetCodec === "libx265" || targetCodec === "hevc" || targetCodec === "h265") return "hevc_nvenc";
    if (targetCodec === "libsvtav1" || targetCodec === "av1") return "av1_nvenc";
  } else if (hwChoice === "qsv") {
    if (targetCodec === "libx264" || targetCodec === "h264") return "h264_qsv";
    if (targetCodec === "libx265" || targetCodec === "hevc" || targetCodec === "h265") return "hevc_qsv";
    if (targetCodec === "libsvtav1" || targetCodec === "av1") return "av1_qsv";
    if (targetCodec === "libvpx-vp9" || targetCodec === "vp9") return "vp9_qsv";
  } else if (hwChoice === "amf") {
    if (targetCodec === "libx264" || targetCodec === "h264") return "h264_amf";
    if (targetCodec === "libx265" || targetCodec === "hevc" || targetCodec === "h265") return "hevc_amf";
    if (targetCodec === "libsvtav1" || targetCodec === "av1") return "av1_amf";
  }
  return targetCodec;
}

export function applyVideoEncoderOptions(args, targetCodec, settings = {}, options = {}) {
  const hwChoice = getResolvedHwaccel(settings);
  const crf = options.crf || "23";
  const preset = options.preset || "medium";
  const bitrate = options.bitrate || null;

  if (targetCodec === "copy") {
    args.push("-c:v", "copy");
    return;
  }

  const mappedEncoder = mapHardwareEncoder(targetCodec, hwChoice);
  args.push("-c:v", mappedEncoder);

  if (bitrate) {
    args.push("-b:v", bitrate);
    if (options.maxrate) args.push("-maxrate", options.maxrate);
    if (options.bufsize) args.push("-bufsize", options.bufsize);
  }

  if (mappedEncoder.endsWith("_nvenc")) {
    if (!bitrate) {
      args.push("-cq", crf);
    }
    const nvPreset = preset === "ultrafast" ? "p1" : preset === "veryfast" ? "p2" : preset === "fast" ? "p3" : preset === "slow" ? "p6" : "p4";
    args.push("-preset", nvPreset);
    args.push("-pix_fmt", "yuv420p");
  } else if (mappedEncoder.endsWith("_qsv")) {
    if (!bitrate) {
      args.push("-global_quality", crf);
    }
    args.push("-preset", preset);
    args.push("-pix_fmt", "nv12");
  } else if (mappedEncoder.endsWith("_amf")) {
    if (!bitrate) {
      args.push("-rc", "cqp", "-qp_i", crf, "-qp_p", crf);
    }
    args.push("-pix_fmt", "yuv420p");
  } else {
    // Software CPU Encoder
    if (!bitrate) {
      args.push("-crf", crf);
    }
    if (mappedEncoder === "libsvtav1") {
      args.push("-preset", preset === "ultrafast" ? "8" : preset === "fast" ? "7" : preset === "slow" ? "4" : "6");
    } else {
      args.push("-preset", preset);
    }
    if (mappedEncoder === "libx264" || mappedEncoder === "libx265") {
      args.push("-pix_fmt", "yuv420p");
    }
  }
}

export function buildConvertCommand(inputFile, outputDir, settings = {}) {
  const args = [];
  const src = inputFile || "C:\\Users\\User\\Videos\\input_sample.mp4";
  const baseName =
    src
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "") || "output";

  const container =
    document.getElementById("cvt-container")?.value || "mp4";
  const scale = document.getElementById("cvt-scale")?.value || "original";

  const dst = resolveDestinationPath(`${baseName}_converted.${container}`, settings, src);

  // Overwrite flag
  args.push("-y");

  // Hardware acceleration (only for standard video formats, not GIF)
  const hwChoice = getResolvedHwaccel(settings);
  if (container !== "gif" && container !== "webp") {
    if (hwChoice === "cuda") {
      args.push("-hwaccel", "cuda");
    } else if (hwChoice === "qsv") {
      args.push("-hwaccel", "qsv");
    } else if (hwChoice === "amf") {
      args.push("-hwaccel", "d3d11va");
    }
  }

  // Encoding threads
  const threads = settings.threads || "0";
  if (threads !== "0") {
    args.push("-threads", threads);
  }

  // Input file
  args.push("-i", src);

  if (container === "gif") {
    const fps = document.getElementById("cvt-gif-fps")?.value || "15";
    const quality = document.getElementById("cvt-gif-quality")?.value || "palettegen";
    let scaleFilter = scale !== "original"
      ? (scale.includes(":") ? scale.split(":")[0] : scale)
      : "480";
    if (scaleFilter === "original") scaleFilter = "-1";

    if (quality === "palettegen") {
      args.push(
        "-vf",
        `fps=${fps},scale=${scaleFilter}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      );
    } else {
      args.push("-vf", `fps=${fps},scale=${scaleFilter}:-1:flags=lanczos`);
    }
    args.push("-an");
  } else if (container === "webp") {
    const fps = document.getElementById("cvt-webp-fps")?.value || "24";
    const quality = document.getElementById("cvt-webp-quality")?.value || "75";
    let vfList = [`fps=${fps}`];
    if (scale !== "original") {
      const [w, h] = scale.split(":");
      vfList.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`);
    }
    args.push("-vf", vfList.join(","));
    args.push("-c:v", "libwebp", "-loop", "0");
    if (quality === "lossless") {
      args.push("-lossless", "1");
    } else {
      args.push("-q:v", quality);
    }
    args.push("-an");
  } else {
    const vcodec = document.getElementById("cvt-vcodec")?.value || "libx264";
    const acodec = document.getElementById("cvt-acodec")?.value || "aac";
    const crf = document.getElementById("cvt-crf")?.value || "23";
    const preset = document.getElementById("cvt-preset")?.value || "medium";

    // Video resolution filter
    if (scale !== "original") {
      const [w, h] = scale.split(":");
      args.push(
        "-vf",
        `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`,
      );
    }

    // Video Codec with hardware encoder mapping
    applyVideoEncoderOptions(args, vcodec, settings, { crf, preset });

    // Audio Codec
    if (acodec === "copy") {
      args.push("-c:a", "copy");
    } else {
      const audioCodecMap = {
        aac: "aac",
        mp3: "libmp3lame",
        opus: "libopus",
        flac: "flac",
      };
      const mappedAcodec = audioCodecMap[acodec] || "aac";
      args.push("-c:a", mappedAcodec);
      if (mappedAcodec !== "flac") {
        args.push("-b:a", "192k");
      }
    }
  }

  // Standard progress output for real-time tracking
  args.push("-progress", "pipe:1");
  args.push(dst);

  const fullString = `ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`;

  return {
    executable: "ffmpeg",
    args,
    destination: dst,
    fullString,
  };
}

export function buildAudioExtractCommand(inputFile, outputDir, settings = {}) {
  const args = ["-y"];
  const src = inputFile || "C:\\Users\\User\\Videos\\input_sample.mp4";
  const baseName =
    src
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "") || "output_audio";
  const fmt = document.getElementById("aud-format")?.value || "mp3";
  const bitrate = document.getElementById("aud-bitrate")?.value || "256k";
  const bitdepth = document.getElementById("aud-bitdepth")?.value || "16";
  const channels = document.getElementById("aud-channels")?.value || "original";
  const samplerate = document.getElementById("aud-samplerate")?.value || "original";
  const volume = document.getElementById("aud-volume")?.value || "none";

  const dst = resolveDestinationPath(`${baseName}_extracted.${fmt}`, settings, src);

  args.push("-i", src);
  args.push("-vn");

  if (bitrate === "copy") {
    args.push("-c:a", "copy");
  } else {
    let codec = "libmp3lame";
    if (fmt === "wav") {
      codec = bitdepth === "24" ? "pcm_s24le" : bitdepth === "32" ? "pcm_f32le" : "pcm_s16le";
    } else if (fmt === "aiff") {
      codec = bitdepth === "24" ? "pcm_s24be" : bitdepth === "32" ? "pcm_f32be" : "pcm_s16be";
    } else if (fmt === "flac") {
      codec = "flac";
    } else {
      const codecMap = {
        mp3: "libmp3lame",
        m4a: "aac",
        ogg: "libvorbis",
        opus: "libopus",
        wma: "wmav2",
        ac3: "ac3",
        dts: "dca",
        amr: "libopencore_amrnb",
        mka: "flac",
        mp2: "mp2",
      };
      codec = codecMap[fmt] || "libmp3lame";
    }

    args.push("-c:a", codec);

    if (codec !== "flac" && !codec.startsWith("pcm_")) {
      args.push("-b:a", bitrate);
    }

    if (channels !== "original") {
      args.push("-ac", channels);
    }

    if (samplerate !== "original") {
      args.push("-ar", samplerate);
    }

    if (volume === "loudnorm") {
      args.push("-af", "loudnorm=I=-16:TP=-1.5:LRA=11");
    } else if (volume === "vol_3db") {
      args.push("-af", "volume=3dB");
    } else if (volume === "vol_6db") {
      args.push("-af", "volume=6dB");
    }
  }

  // Preserve metadata tags
  args.push("-map_metadata", "0");

  args.push("-progress", "pipe:1");
  args.push(dst);

  return {
    executable: "ffmpeg",
    args,
    destination: dst,
    fullString: `ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}

export function parseTimestampToSeconds(ts) {
  if (!ts) return 0;
  const parts = ts.trim().split(":");
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(ts) || 0;
}

export function buildTrimCommand(inputFile, outputDir, settings = {}) {
  const args = ["-y"];
  const src = inputFile || "C:\\Users\\User\\Videos\\input_sample.mp4";
  const baseName =
    src
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "") || "output_trimmed";
  const ext = (src.split(".").pop() || "mp4").toLowerCase();
  const isAudioOnly = ["mp3", "wav", "flac", "m4a", "ogg", "opus", "wma", "aiff"].includes(ext);

  const start = document.getElementById("trim-start")?.value?.trim() || "00:00:00.000";
  const end = document.getElementById("trim-end")?.value?.trim() || "00:01:00.000";
  const mode = document.getElementById("trim-mode")?.value || "copy";

  const dst = resolveDestinationPath(`${baseName}_trimmed.${ext}`, settings, src);

  if (start && start !== "00:00:00" && start !== "00:00:00.000") {
    args.push("-ss", start);
  }
  if (end) {
    args.push("-to", end);
  }
  args.push("-i", src);

  if (mode === "copy") {
    args.push("-c", "copy");
  } else {
    if (isAudioOnly) {
      args.push("-c:a", ext === "flac" ? "flac" : ext === "wav" ? "pcm_s16le" : "aac");
      if (ext !== "flac" && ext !== "wav") args.push("-b:a", "192k");
    } else {
      args.push("-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k");
    }
  }

  // Preserve metadata
  args.push("-map_metadata", "0");

  args.push("-progress", "pipe:1");
  args.push(dst);

  const startSec = parseTimestampToSeconds(start);
  const endSec = parseTimestampToSeconds(end);
  const duration = Math.max(1.0, endSec - startSec);

  return {
    executable: "ffmpeg",
    args,
    destination: dst,
    duration,
    fullString: `ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}

export function buildCompressCommand(inputFile, outputDir, settings = {}) {
  const args = ["-y"];
  const src = inputFile || "C:\\Users\\User\\Videos\\input_sample.mp4";
  const baseName =
    src
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "") || "output_compressed";

  const preset = document.getElementById("comp-preset")?.value || "discord";
  const customMbInput = document.getElementById("comp-custom-mb");
  const customMb = parseFloat(customMbInput?.value) || 24;
  const scale = document.getElementById("comp-scale")?.value || "original";
  const vcodec = document.getElementById("comp-vcodec")?.value || "libx264";

  // Check source file size / duration from media element if available
  const metaDurationEl = document.getElementById("meta-duration");
  let durationSec = 120.0;
  if (metaDurationEl && metaDurationEl.textContent && metaDurationEl.textContent !== "--:--:--") {
    durationSec = parseTimestampToSeconds(metaDurationEl.textContent) || 120.0;
  }

  const metaSizeEl = document.getElementById("meta-size");
  let srcSizeMb = 48.0;
  if (metaSizeEl && metaSizeEl.textContent) {
    const parsedMb = parseFloat(metaSizeEl.textContent);
    if (!isNaN(parsedMb) && parsedMb > 0) srcSizeMb = parsedMb;
  }

  let targetMb = 24;
  if (preset === "discord") targetMb = 24;
  else if (preset === "discord_nitro") targetMb = 500;
  else if (preset === "whatsapp") targetMb = 15;
  else if (preset === "email") targetMb = 20;
  else if (preset === "reduce_50") targetMb = Math.max(1, Math.round(srcSizeMb * 0.5));
  else if (preset === "reduce_75") targetMb = Math.max(1, Math.round(srcSizeMb * 0.25));
  else if (preset === "custom") targetMb = customMb;

  const audioBitrateK = targetMb <= 15 ? 64 : 96;
  // 5% margin for container overhead
  const totalBitrateK = Math.floor((targetMb * 8192 * 0.95) / Math.max(1.0, durationSec));
  const videoBitrateK = Math.max(60, totalBitrateK - audioBitrateK);

  // Update estimation readout in UI
  const estTarget = document.getElementById("comp-est-target");
  const estVBitrate = document.getElementById("comp-est-vbitrate");
  const estABitrate = document.getElementById("comp-est-abitrate");
  if (estTarget) estTarget.textContent = `${targetMb} MB`;
  if (estVBitrate) estVBitrate.textContent = `~${videoBitrateK.toLocaleString()} kbps`;
  if (estABitrate) estABitrate.textContent = `${audioBitrateK} kbps`;

  const dst = resolveDestinationPath(`${baseName}_compressed.mp4`, settings, src);

  const hwChoice = getResolvedHwaccel(settings);
  if (hwChoice === "cuda") {
    args.push("-hwaccel", "cuda");
  } else if (hwChoice === "qsv") {
    args.push("-hwaccel", "qsv");
  } else if (hwChoice === "amf") {
    args.push("-hwaccel", "d3d11va");
  }

  args.push("-i", src);

  // Resolution Filter
  if (scale !== "original") {
    const [w, h] = scale.split(":");
    args.push(
      "-vf",
      `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`,
    );
  }

  // Video Codec & Bitrate Budgeting with hardware encoder mapping
  applyVideoEncoderOptions(args, vcodec, settings, {
    bitrate: `${videoBitrateK}k`,
    maxrate: `${Math.round(videoBitrateK * 1.4)}k`,
    bufsize: `${videoBitrateK * 2}k`,
    preset: "medium",
  });

  // Audio Codec
  args.push("-c:a", "aac");
  args.push("-b:a", `${audioBitrateK}k`);

  // Preserve metadata
  args.push("-map_metadata", "0");

  args.push("-progress", "pipe:1");
  args.push(dst);

  return {
    executable: "ffmpeg",
    args,
    destination: dst,
    duration: durationSec,
    fullString: `ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}

export function buildCompressAudioCommand(inputFile, outputDir, settings = {}) {
  const args = ["-y"];
  const src = inputFile || "C:\\Users\\User\\Music\\audio_sample.mp3";
  const baseName =
    src
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "") || "output_compressed_audio";

  const preset = document.getElementById("comp-aud-preset")?.value || "discord";
  const customMbInput = document.getElementById("comp-aud-custom-mb");
  const customMb = parseFloat(customMbInput?.value) || 5;
  const format = document.getElementById("comp-aud-format")?.value || "opus";
  const bitrateSelect = document.getElementById("comp-aud-bitrate")?.value || "auto";
  const channels = document.getElementById("comp-aud-channels")?.value || "original";
  const sampleRate = document.getElementById("comp-aud-samplerate")?.value || "original";

  // Check source file size / duration from media element if available
  const metaDurationEl = document.getElementById("meta-duration");
  let durationSec = 180.0;
  if (metaDurationEl && metaDurationEl.textContent && metaDurationEl.textContent !== "--:--:--") {
    durationSec = parseTimestampToSeconds(metaDurationEl.textContent) || 180.0;
  }

  const metaSizeEl = document.getElementById("meta-size");
  let srcSizeMb = 15.0;
  if (metaSizeEl && metaSizeEl.textContent) {
    const parsedMb = parseFloat(metaSizeEl.textContent);
    if (!isNaN(parsedMb) && parsedMb > 0) srcSizeMb = parsedMb;
  }

  let targetMb = 5;
  let targetBitrateK = 64;

  if (preset === "discord") {
    targetBitrateK = 64;
  } else if (preset === "whatsapp") {
    targetBitrateK = 32;
  } else if (preset === "email") {
    targetMb = 5;
    targetBitrateK = Math.min(192, Math.max(16, Math.floor((targetMb * 8192 * 0.95) / Math.max(1.0, durationSec))));
  } else if (preset === "reduce_50") {
    targetMb = Math.max(0.5, Math.round(srcSizeMb * 0.5 * 10) / 10);
    targetBitrateK = Math.min(192, Math.max(16, Math.floor((targetMb * 8192 * 0.95) / Math.max(1.0, durationSec))));
  } else if (preset === "reduce_75") {
    targetMb = Math.max(0.2, Math.round(srcSizeMb * 0.25 * 10) / 10);
    targetBitrateK = Math.min(128, Math.max(16, Math.floor((targetMb * 8192 * 0.95) / Math.max(1.0, durationSec))));
  } else if (preset === "custom_mb") {
    targetMb = customMb;
    targetBitrateK = Math.min(320, Math.max(16, Math.floor((targetMb * 8192 * 0.95) / Math.max(1.0, durationSec))));
  } else if (preset === "custom_bitrate") {
    targetBitrateK = bitrateSelect !== "auto" ? parseInt(bitrateSelect, 10) || 64 : 64;
  }

  // If user explicitly selected a bitrate (not auto)
  if (bitrateSelect !== "auto") {
    targetBitrateK = parseInt(bitrateSelect, 10) || targetBitrateK;
  }

  // Recalculate targetMb dynamically based on bitrate, channels, sample rate and format
  if (format === "flac") {
    const channelRatio = channels === "1" ? 0.5 : 1.0;
    const rateRatio = sampleRate !== "original" ? Math.min(1.0, parseInt(sampleRate, 10) / 48000) : 1.0;
    targetMb = Math.round(srcSizeMb * 0.6 * channelRatio * rateRatio * 100) / 100 || 0.5;
    targetBitrateK = Math.round((targetMb * 8192) / Math.max(1.0, durationSec));
  } else {
    // Lossy compressed format
    targetMb = Math.round(((targetBitrateK * durationSec) / 8192) * 100) / 100 || 0.1;
  }

  // Update estimation readout in UI
  const estTarget = document.getElementById("comp-aud-est-target");
  const estBitrate = document.getElementById("comp-aud-est-bitrate");
  const estCodec = document.getElementById("comp-aud-est-codec");
  if (estTarget) estTarget.textContent = `${targetMb} MB`;
  if (estBitrate) estBitrate.textContent = format === "flac" ? `~${targetBitrateK} kbps (Lossless)` : `${targetBitrateK} kbps`;
  if (estCodec) {
    const codecNames = {
      opus: "Opus",
      mp3: "MP3 (LAME)",
      m4a: "AAC (M4A)",
      ogg: "OGG Vorbis",
      flac: "FLAC",
    };
    estCodec.textContent = codecNames[format] || format.toUpperCase();
  }

  let ext = format;
  if (format === "opus") ext = "opus";
  else if (format === "mp3") ext = "mp3";
  else if (format === "m4a") ext = "m4a";
  else if (format === "ogg") ext = "ogg";
  else if (format === "flac") ext = "flac";

  const dst = resolveDestinationPath(`${baseName}_compressed.${ext}`, settings, src);

  args.push("-i", src);

  // Audio Codec Selection
  if (format === "opus") {
    args.push("-c:a", "libopus", "-b:a", `${targetBitrateK}k`);
    args.push("-vbr", "on", "-compression_level", "10");
  } else if (format === "mp3") {
    args.push("-c:a", "libmp3lame", "-b:a", `${targetBitrateK}k`);
  } else if (format === "m4a") {
    args.push("-c:a", "aac", "-b:a", `${targetBitrateK}k`);
  } else if (format === "ogg") {
    args.push("-c:a", "libvorbis", "-b:a", `${targetBitrateK}k`);
  } else if (format === "flac") {
    args.push("-c:a", "flac", "-compression_level", "8");
  }

  // Channels
  if (channels === "1") {
    args.push("-ac", "1");
  } else if (channels === "2") {
    args.push("-ac", "2");
  }

  // Sample Rate
  if (sampleRate !== "original") {
    args.push("-ar", sampleRate);
  }

  // Preserve metadata
  args.push("-map_metadata", "0");
  args.push("-progress", "pipe:1");
  args.push(dst);

  return {
    executable: "ffmpeg",
    args,
    destination: dst,
    duration: durationSec,
    fullString: `ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}

export function buildLoopDurationCommand(inputFile, outputDir, settings = {}) {
  const args = ["-y"];
  const src = inputFile || "C:\\Users\\User\\Videos\\sample.mp4";
  const baseName =
    src
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "") || "output_looped";

  const mode = document.getElementById("loop-mode")?.value || "duration";
  const engine = document.getElementById("loop-engine")?.value || "copy";
  const audioMode = document.getElementById("loop-audio-mode")?.value || "keep";
  const container = document.getElementById("loop-container")?.value || "mp4";
  const vcodec = document.getElementById("loop-vcodec")?.value || "libx264";

  // Check source duration from meta element
  const metaDurationEl = document.getElementById("meta-duration");
  let srcDurationSec = 10.0;
  if (metaDurationEl && metaDurationEl.textContent && metaDurationEl.textContent !== "--:--:--") {
    srcDurationSec = parseTimestampToSeconds(metaDurationEl.textContent) || 10.0;
  }

  let targetDurationSec = 3600;
  let loopCount = 10;

  if (mode === "duration") {
    const hh = parseInt(document.getElementById("loop-target-hh")?.value, 10) || 0;
    const mm = parseInt(document.getElementById("loop-target-mm")?.value, 10) || 0;
    const ss = parseInt(document.getElementById("loop-target-ss")?.value, 10) || 0;
    targetDurationSec = Math.max(1, hh * 3600 + mm * 60 + ss);
    loopCount = Math.max(1, Math.ceil(targetDurationSec / Math.max(0.1, srcDurationSec)));

    args.push("-stream_loop", "-1", "-i", src);
    args.push("-t", String(targetDurationSec));
  } else {
    // Repeat count mode
    loopCount = parseInt(document.getElementById("loop-repeat-count")?.value, 10) || 10;
    targetDurationSec = Math.round(srcDurationSec * loopCount);
    args.push("-stream_loop", String(Math.max(0, loopCount - 1)), "-i", src);
  }

  // Audio handling
  if (audioMode === "mute") {
    args.push("-an");
  }

  if (engine === "copy") {
    args.push("-c:v", "copy");
    if (audioMode !== "mute") {
      args.push("-c:a", "copy");
    }
  } else {
    // Re-encode
    applyVideoEncoderOptions(args, vcodec, settings, { crf: "23", preset: "medium" });
    if (audioMode !== "mute") {
      args.push("-c:a", "aac", "-b:a", "192k");
    }
  }

  const defaultFileName = `${baseName}_looped.${container}`;
  const dst = resolveDestinationPath(defaultFileName, settings, inputFile);

  args.push("-progress", "pipe:1", dst);

  return {
    executable: "ffmpeg",
    args,
    destination: dst,
    duration: targetDurationSec,
    fullString: `ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}

export function buildMergeCommand(mergeFiles = [], outputDir, settings = {}, concatListPath = null) {
  const args = ["-y"];
  const engine = document.getElementById("merge-engine")?.value || "concat_demuxer";
  const fmt = document.getElementById("merge-format")?.value || "mp4";
  const isAudioOnly = ["mp3", "wav", "flac", "m4a", "ogg"].includes(fmt);

  const firstFile = mergeFiles[0] || "merged_output";
  const baseName =
    firstFile
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "") || "merged_output";

  const dst = resolveDestinationPath(`${baseName}_merged.${fmt}`, settings, firstFile);

  if (engine === "concat_demuxer" && concatListPath) {
    args.push("-f", "concat", "-safe", "0", "-i", concatListPath, "-c", "copy", "-map_metadata", "0");
  } else if (engine === "concat_demuxer") {
    args.push("-f", "concat", "-safe", "0", "-i", "concat_list.txt", "-c", "copy", "-map_metadata", "0");
  } else {
    // filter_complex re-encode concat
    const files = mergeFiles.length > 0 ? mergeFiles : ["clip1.mp4", "clip2.mp4"];
    files.forEach((f) => {
      args.push("-i", f);
    });

    const count = files.length;
    if (isAudioOnly) {
      const inputs = files.map((_, i) => `[${i}:a:0]`).join("");
      args.push("-filter_complex", `${inputs}concat=n=${count}:v=0:a=1[outa]`, "-map", "[outa]");
      args.push("-c:a", fmt === "flac" ? "flac" : fmt === "wav" ? "pcm_s16le" : "aac");
      if (fmt !== "flac" && fmt !== "wav") args.push("-b:a", "192k");
    } else {
      const inputs = files.map((_, i) => `[${i}:v:0][${i}:a:0]`).join("");
      args.push("-filter_complex", `${inputs}concat=n=${count}:v=1:a=1[outv][outa]`, "-map", "[outv]", "-map", "[outa]");
      applyVideoEncoderOptions(args, "libx264", settings, { crf: "22", preset: "medium" });
      args.push("-c:a", "aac", "-b:a", "192k");
    }
  }

  args.push("-progress", "pipe:1");
  args.push(dst);

  return {
    executable: "ffmpeg",
    args,
    destination: dst,
    fullString: `ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}

export function buildMuteReplaceCommand(inputFile, outputDir, settings = {}) {
  const args = ["-y"];
  const src = inputFile || "C:\\Users\\User\\Videos\\input_sample.mp4";
  const baseName =
    src
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "") || "output_video";
  const ext = (src.split(".").pop() || "mp4").toLowerCase();

  const action = document.getElementById("mute-action")?.value || "strip";
  const secondAudio =
    document.getElementById("second-audio-path")?.value?.trim() ||
    "C:\\Users\\User\\Music\\background_audio.mp3";
  const vol = document.getElementById("second-audio-vol")?.value || "1.0";

  let suffix = "_muted";
  if (action === "replace") suffix = "_audio_replaced";
  else if (action === "mix") suffix = "_audio_mixed";

  const dst = resolveDestinationPath(`${baseName}${suffix}.${ext}`, settings, src);

  args.push("-i", src);

  if (action === "strip") {
    args.push("-an", "-c:v", "copy");
  } else if (action === "replace") {
    args.push("-i", secondAudio);
    args.push("-map", "0:v:0", "-map", "1:a:0");
    args.push("-c:v", "copy");
    args.push("-c:a", "aac", "-b:a", "192k");
    if (vol !== "1.0") {
      args.push("-af", `volume=${vol}`);
    }
    args.push("-shortest");
  } else if (action === "mix") {
    args.push("-i", secondAudio);
    const filter =
      vol !== "1.0"
        ? `[1:a]volume=${vol}[bg];[0:a][bg]amix=inputs=2:duration=first[a]`
        : `[0:a][1:a]amix=inputs=2:duration=first[a]`;
    args.push("-filter_complex", filter);
    args.push("-map", "0:v:0", "-map", "[a]");
    args.push("-c:v", "copy");
    args.push("-c:a", "aac", "-b:a", "192k");
  }

  args.push("-map_metadata", "0");
  args.push("-progress", "pipe:1");
  args.push(dst);

  return {
    executable: "ffmpeg",
    args,
    destination: dst,
    fullString: `ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}

export function buildGifFramesCommand(inputFile, outputDir, settings = {}) {
  const args = ["-y"];
  const src = inputFile || "C:\\Users\\User\\Videos\\input_sample.mp4";
  const baseName =
    src
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "") || "output_media";

  const mode = document.getElementById("gif-mode")?.value || "gif_hq";
  const fps = document.getElementById("gif-fps")?.value || "15";
  const width = document.getElementById("gif-width")?.value || "480";
  const start = document.getElementById("gif-start")?.value?.trim() || "00:00:00.000";
  const dur = parseFloat(document.getElementById("gif-dur")?.value) || 5;
  const snapFmt = document.getElementById("gif-snap-fmt")?.value || "png";

  let dst = "";
  let durationSec = dur;

  if (mode === "gif_hq") {
    dst = resolveDestinationPath(`${baseName}_animated.gif`, settings, src);
    if (start && start !== "00:00:00" && start !== "00:00:00.000") {
      args.push("-ss", start);
    }
    args.push("-t", dur.toString());
    args.push("-i", src);

    const scaleFilter = width === "original" ? "" : `,scale=${width}:-1:flags=lanczos`;
    const filter = `[0:v]fps=${fps}${scaleFilter},split[s0][s1];[s0]palettegen=max_colors=256:reserve_transparent=0[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`;

    args.push("-filter_complex", filter);
  } else if (mode === "snapshot") {
    dst = resolveDestinationPath(`${baseName}_snapshot.${snapFmt}`, settings, src);
    durationSec = 1.0;
    if (start && start !== "00:00:00" && start !== "00:00:00.000") {
      args.push("-ss", start);
    }
    args.push("-i", src);
    args.push("-frames:v", "1");
    if (width !== "original") {
      args.push("-vf", `scale=${width}:-1:flags=lanczos`);
    }
  } else if (mode === "frames_seq") {
    dst = resolveDestinationPath(`${baseName}_frame_%04d.${snapFmt}`, settings, src);
    if (start && start !== "00:00:00" && start !== "00:00:00.000") {
      args.push("-ss", start);
    }
    if (dur > 0) {
      args.push("-t", dur.toString());
    }
    args.push("-i", src);
    args.push("-vf", `fps=${fps}${width !== "original" ? `,scale=${width}:-1:flags=lanczos` : ""}`);
  }

  args.push("-progress", "pipe:1");
  args.push(dst);

  return {
    executable: "ffmpeg",
    args,
    destination: dst,
    duration: durationSec,
    fullString: `ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}

export function buildCustomCommand(inputFile, outputDir, settings = {}) {
  const args = ["-y"];
  const src = inputFile || "C:\\Users\\User\\Videos\\input_sample.mp4";
  const baseName =
    src
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "") || "output_custom";

  const ext = document.getElementById("custom-ext")?.value || "mp4";
  const customArgsStr = document.getElementById("custom-args")?.value?.trim() || "";
  const dst = resolveDestinationPath(`${baseName}_custom.${ext}`, settings, src);

  args.push("-i", src);

  if (customArgsStr) {
    const matches = customArgsStr.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
    if (matches) {
      matches.forEach((m) => {
        args.push(m.replace(/^['"]|['"]$/g, ""));
      });
    }
  }

  args.push("-progress", "pipe:1");
  args.push(dst);

  return {
    executable: "ffmpeg",
    args,
    destination: dst,
    fullString: `ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}

export function appendGlobalYtDlpArgs(args, settings = {}, targetUrl = "") {
  const hasFlag = (flag) => args.includes(flag);
  const customArgsPreview = settings.ytdlpCustomArgs ?? document.getElementById("set-ytdlp-custom-args")?.value?.trim() ?? "";

  const cookies = settings.ytdlpCookies || document.getElementById("set-ytdlp-cookies")?.value || "none";
  if (cookies && cookies !== "none") {
    args.push("--cookies-from-browser", cookies);
  }

  const ratelimit = settings.ytdlpRateLimit || document.getElementById("set-ytdlp-ratelimit")?.value || "none";
  if (ratelimit && ratelimit !== "none") {
    args.push("-r", ratelimit);
  }

  const sponsorblock = settings.ytdlpSponsorblock ?? document.getElementById("set-ytdlp-sponsorblock")?.checked;
  if (sponsorblock) {
    args.push("--sponsorblock-remove", "all");
  }

  const geoBypass = settings.ytdlpGeoBypass ?? document.getElementById("set-ytdlp-geo-bypass")?.checked ?? true;
  if (geoBypass) {
    args.push("--geo-bypass");
  }

  // ytdlnis-inspired robustness defaults (avoid bot-check / fragile failures).
  // Only add when the user hasn't already overridden them via custom flags.
  if (!hasFlag("--retries") && !customArgsPreview.includes("--retries")) {
    args.push("--retries", "10");
  }
  if (!hasFlag("--fragment-retries") && !customArgsPreview.includes("--fragment-retries")) {
    args.push("--fragment-retries", "10");
  }
  if (!hasFlag("--socket-timeout") && !customArgsPreview.includes("--socket-timeout")) {
    args.push("--socket-timeout", "15");
  }
  if (!hasFlag("--compat-options") && !customArgsPreview.includes("manifest-filesize-approx")) {
    args.push("--compat-options", "manifest-filesize-approx");
  }
  // Default YouTube player clients: fixes "Sign in to confirm you're not a bot"
  // (ytdlnis: setYoutubeExtractorArgs). Skip if user already set extractor-args.
  // music.youtube.com uses the web_music client, whose https formats require a
  // GVS PO token -- forcing web* clients there only produces PO-token warnings,
  // so stick to android/ios which work without one (yt-dlp PO-Token-Guide).
  if (!hasFlag("--extractor-args") && !customArgsPreview.includes("--extractor-args")) {
    const clients = /music\.youtube\.com/i.test(targetUrl || "") ? "android,ios" : "android,web";
    args.push("--extractor-args", `youtube:player_client=${clients}`);
  }
  if (!hasFlag("--no-mtime") && !hasFlag("--mtime") && !customArgsPreview.includes("--no-mtime")) {
    args.push("--no-mtime");
  }

  const customArgsStr = customArgsPreview;
  if (customArgsStr) {
    const matches = customArgsStr.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
    if (matches) {
      matches.forEach((m) => {
        args.push(m.replace(/^['"]|['"]$/g, ""));
      });
    }
  }
}

// Ensure output template ends with exactly one .%(ext)s (ytdlnis: removeSuffix + re-add).
export function normalizeYtDlpTemplate(fmt) {
  const fallback = "%(title)s [%(id)s].%(ext)s";
  let t = (fmt || "").trim() || fallback;
  // Strip any trailing .%(ext)s occurrences, then re-add one.
  t = t.replace(/(\.\%\(ext\)s)+$/g, "");
  return `${t}.%(ext)s`;
}

// Validate --playlist-items syntax (e.g. "1-10,15,20-25"). Returns null when invalid.
export function sanitizePlaylistItems(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || s.toLowerCase() === "all") return null;
  // Allow digits, commas, dashes, colons (step), spaces.
  if (!/^[0-9,\-\:\s]+$/.test(s)) return null;
  const cleaned = s.replace(/\s+/g, "");
  if (!/[0-9]/.test(cleaned)) return null;
  return cleaned;
}

// Shared filename safety flags (ytdlnis: restrict-filenames + trim-filenames + no-part handling).
export function appendYtDlpFilenameSafety(args, outDir) {
  if (!args.includes("--restrict-filenames")) {
    args.push("--restrict-filenames");
  }
  // Windows MAX_PATH guard: yt-dlp trims to (limit) chars; reserve room for outDir.
  if (!args.includes("--trim-filenames")) {
    const reserve = Math.max(0, (outDir || "").length);
    const limit = Math.max(64, 254 - reserve);
    args.push("--trim-filenames", String(Math.min(254, limit)));
  }
}

export function resolveYtDlpOutputDir(settings = {}) {
  const customOut = document.getElementById("ytdlp-output-dir")?.value?.trim();
  if (customOut) return customOut;
  const lastSaved = getLastYtDlpOutDir();
  if (lastSaved) return lastSaved;
  return settings.outputDir || "C:\\Users\\User\\Downloads";
}

export function resolveYtDlpFilenameFormat(settings = {}) {
  const customFmt = document.getElementById("ytdlp-filename-format")?.value?.trim();
  if (customFmt) return customFmt;
  return settings.ytdlpFilenameFormat || getSavedYtDlpFormat();
}

export function buildYtDlpVideoCommand(url, outputDir, settings = {}) {
  const targetUrl = url || document.getElementById("ytdlp-url-input")?.value?.trim() || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const outDir = resolveYtDlpOutputDir(settings);
  const fmt = normalizeYtDlpTemplate(resolveYtDlpFilenameFormat(settings));
  const res = document.getElementById("dl-video-res")?.value || "best";
  const container = document.getElementById("dl-video-container")?.value || "mp4";
  const embedSubs = document.getElementById("dl-video-embed-subs")?.checked ?? true;
  const embedThumb = document.getElementById("dl-video-embed-thumb")?.checked ?? true;
  const embedMeta = document.getElementById("dl-video-embed-meta")?.checked ?? true;

  const args = [];

  // Single-video mode: never pull a whole playlist when URL contains list params
  // (ytdlnis uses --match-filter/-I for playlist items; here --no-playlist is correct).
  args.push("--no-playlist");

  // Format selection with ytdlnis-style fallbacks (bv+ba/b, not bestvideo* which
  // fails on sites without height metadata or storyboard-only entries).
  // -S sorts so the height cap is a preference, not a hard filter that errors out.
  if (res === "best") {
    args.push("-f", "bv*+ba/b");
    args.push("-S", `vcodec:h264,acodec:aac,ext:${container}`);
  } else {
    const h = parseInt(res, 10) || 1080;
    args.push("-f", `bv*[height<=${h}]+ba/b[height<=${h}]/b[height<=${h}]/b`);
    args.push("-S", `res:${h},vcodec:h264,acodec:aac,ext:${container}`);
  }

  args.push("--merge-output-format", container);

  if (embedSubs) {
    // ytdlnis: --embed-subs + --write-subs/--write-auto-subs + --sub-langs ".*-orig",
    // plus --sub-format fallback. "en,.*" is invalid and pulls every language.
    args.push("--embed-subs", "--write-subs", "--write-auto-subs");
    args.push("--sub-langs", "en.*-orig,en.*,.*-orig");
    args.push("--sub-format", "srt/best");
    args.push("--convert-subs", "srt");
  }
  if (embedThumb) {
    // convert-thumbnails is required: raw webp/png thumbs can't embed into mp4.
    args.push("--embed-thumbnail", "--convert-thumbnails", "jpg");
  }
  if (embedMeta) {
    args.push("--embed-metadata", "--embed-chapters");
  }

  appendGlobalYtDlpArgs(args, settings, targetUrl);
  appendYtDlpFilenameSafety(args, outDir);

  args.push("-P", outDir);
  args.push("-o", fmt);
  args.push(targetUrl);

  return {
    executable: "yt-dlp",
    args,
    destination: outDir,
    fullString: `yt-dlp ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}

export function buildYtDlpAudioCommand(url, outputDir, settings = {}) {
  const targetUrl = url || document.getElementById("ytdlp-url-input")?.value?.trim() || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const outDir = resolveYtDlpOutputDir(settings);
  const fmt = normalizeYtDlpTemplate(resolveYtDlpFilenameFormat(settings));
  const audioFmt = document.getElementById("dl-audio-fmt")?.value || "mp3";
  const quality = document.getElementById("dl-audio-quality")?.value || "0";
  const embedThumb = document.getElementById("dl-audio-embed-thumb")?.checked ?? true;
  const embedMeta = document.getElementById("dl-audio-embed-meta")?.checked ?? true;

  // ytdlnis audio flow: explicit ba/b selector + format sorting + -x post-extract.
  const args = ["-f", "ba/b", "-S", `acodec:${audioFmt},aext:${audioFmt}`, "--no-playlist", "-x", "--audio-format", audioFmt, "--audio-quality", quality];

  if (embedThumb) {
    args.push("--embed-thumbnail", "--convert-thumbnails", "jpg");
  }
  if (embedMeta) {
    args.push("--embed-metadata");
  }

  appendGlobalYtDlpArgs(args, settings, targetUrl);
  appendYtDlpFilenameSafety(args, outDir);

  args.push("-P", outDir);
  args.push("-o", fmt);
  args.push(targetUrl);

  return {
    executable: "yt-dlp",
    args,
    destination: outDir,
    fullString: `yt-dlp ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}

export function buildYtDlpPlaylistCommand(url, outputDir, settings = {}, selectedIndices = null) {
  const targetUrl = url || document.getElementById("ytdlp-url-input")?.value?.trim() || "https://www.youtube.com/playlist?list=PL...";
  const outDir = resolveYtDlpOutputDir(settings);
  const fmt = normalizeYtDlpTemplate(resolveYtDlpFilenameFormat(settings));
  const mode = document.getElementById("dl-playlist-mode")?.value || "video";
  const items = document.getElementById("dl-playlist-items")?.value?.trim() || "all";
  const autonumber = document.getElementById("dl-playlist-autonumber")?.checked ?? true;
  const ignoreErrors = document.getElementById("dl-playlist-ignore-errors")?.checked ?? true;

  const args = ["--yes-playlist"];

  if (ignoreErrors) {
    args.push("-i");
  }

  if (selectedIndices && selectedIndices.length > 0) {
    const clean = selectedIndices
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
      .join(",");
    if (clean) args.push("--playlist-items", clean);
  } else {
    const cleanItems = sanitizePlaylistItems(items);
    if (cleanItems) {
      args.push("--playlist-items", cleanItems);
    } else if (items && items.toLowerCase() !== "all") {
      // Invalid range syntax: fail fast with a clear message instead of a cryptic yt-dlp error.
      throw new Error(`Invalid playlist range "${items}". Use e.g. 1-10, 15, 20-25 or "all".`);
    }
  }

  if (mode === "audio") {
    args.push("-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0", "--embed-thumbnail", "--convert-thumbnails", "jpg", "--embed-metadata");
  } else {
    args.push("-f", "bv*[height<=1080]+ba/b[height<=1080]/b[height<=1080]/b", "-S", "res:1080,vcodec:h264,acodec:aac,ext:mp4", "--merge-output-format", "mp4", "--embed-thumbnail", "--convert-thumbnails", "jpg", "--embed-metadata");
  }

  appendGlobalYtDlpArgs(args, settings, targetUrl);
  appendYtDlpFilenameSafety(args, outDir);

  args.push("-P", outDir);

  // ytdlnis-style: single .%(ext)s, playlist folder prefix, optional index numbering.
  const base = fmt.replace(/(\.\%\(ext\)s)+$/g, "");
  if (autonumber) {
    if (!base.includes("%(playlist_index)s")) {
      args.push("-o", `%(playlist_title)s/%(playlist_index)s - ${base}.%(ext)s`);
    } else {
      args.push("-o", `%(playlist_title)s/${base}.%(ext)s`);
    }
  } else {
    args.push("-o", `%(playlist_title)s/${base}.%(ext)s`);
  }

  args.push(targetUrl);

  return {
    executable: "yt-dlp",
    args,
    destination: outDir,
    fullString: `yt-dlp ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}

export function buildYtDlpSubtitlesCommand(url, outputDir, settings = {}) {
  const targetUrl = url || document.getElementById("ytdlp-url-input")?.value?.trim() || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const outDir = resolveYtDlpOutputDir(settings);
  const fmt = normalizeYtDlpTemplate(resolveYtDlpFilenameFormat(settings));
  const lang = document.getElementById("dl-sub-lang")?.value?.trim() || "en";
  const subFmt = document.getElementById("dl-sub-fmt")?.value || "srt";
  const autoSubs = document.getElementById("dl-sub-auto")?.checked ?? true;
  const downloadThumb = document.getElementById("dl-sub-thumb")?.checked ?? true;
  const writeInfo = document.getElementById("dl-sub-info")?.checked ?? false;

  // --skip-download subtitle fetch: allow playlists but keep going past failures (ytdlnis: -i).
  const args = ["--skip-download", "-i"];

  // "all" is a valid yt-dlp value; normalize comma/space separated input.
  const normLang = lang.toLowerCase() === "all" ? "all" : lang.replace(/\s+/g, "").replace(/,+/g, ",") || "en";
  args.push("--write-subs", "--sub-langs", normLang, "--sub-format", `${subFmt}/best`, "--convert-subs", subFmt);
  if (autoSubs) {
    args.push("--write-auto-subs");
  }
  if (downloadThumb) {
    args.push("--write-thumbnail", "--convert-thumbnails", "jpg");
  }
  if (writeInfo) {
    args.push("--write-info-json", "--write-description", "--no-clean-info-json");
  }

  appendGlobalYtDlpArgs(args, settings, targetUrl);
  appendYtDlpFilenameSafety(args, outDir);

  args.push("-P", outDir);
  args.push("-o", fmt);
  args.push(targetUrl);

  return {
    executable: "yt-dlp",
    args,
    destination: outDir,
    fullString: `yt-dlp ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}

function buildAtempoFilter(speed) {
  let remaining = speed;
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
  if (hwChoice === "cuda") {
    args.push("-hwaccel", "cuda");
  } else if (hwChoice === "qsv") {
    args.push("-hwaccel", "qsv");
  } else if (hwChoice === "amf") {
    args.push("-hwaccel", "d3d11va");
  }

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
  if (hwChoice === "cuda") {
    args.push("-hwaccel", "cuda");
  } else if (hwChoice === "qsv") {
    args.push("-hwaccel", "qsv");
  } else if (hwChoice === "amf") {
    args.push("-hwaccel", "d3d11va");
  }

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
  if (hwChoice === "cuda") {
    args.push("-hwaccel", "cuda");
  } else if (hwChoice === "qsv") {
    args.push("-hwaccel", "qsv");
  } else if (hwChoice === "amf") {
    args.push("-hwaccel", "d3d11va");
  }

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

  let ext = "mp4";
  if (videoMode === "strip") {
    ext = acodec === "libmp3lame" ? "mp3" : acodec === "libopus" ? "opus" : acodec === "flac" ? "flac" : acodec === "pcm_s16le" ? "wav" : "m4a";
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

  if (videoMode === "strip") {
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

// Re-export Image & AI commands from image_commands.js
export {
  resolveImageAiDestinationPath,
  buildBgRemoverCommand,
  buildAiUpscalerCommand,
  buildVectorizerCommand,
  buildRestoreDenoiseCommand,
  buildIconGeneratorCommand,
  buildMetadataCleanerCommand,
} from "./image_commands.js";

import {
  buildBgRemoverCommand,
  buildAiUpscalerCommand,
  buildVectorizerCommand,
  buildRestoreDenoiseCommand,
  buildIconGeneratorCommand,
  buildMetadataCleanerCommand,
} from "./image_commands.js";

export function buildCommandForTool(
  toolId,
  inputFile,
  outputDir,
  settings = {},
  extraParams = {},
) {
  switch (toolId) {
    case "convert":
      return buildConvertCommand(inputFile, outputDir, settings);
    case "extract_audio":
      return buildAudioExtractCommand(inputFile, outputDir, settings);
    case "trim":
      return buildTrimCommand(inputFile, outputDir, settings);
    case "speed_motion":
      return buildSpeedMotionCommand(inputFile, outputDir, settings);
    case "aspect_crop":
      return buildAspectCropCommand(inputFile, outputDir, settings);
    case "stabilize":
      return buildStabilizeCommand(inputFile, outputDir, settings);
    case "loop_duration":
      return buildLoopDurationCommand(inputFile, outputDir, settings);
    case "normalize":
      return buildNormalizeCommand(inputFile, outputDir, settings);
    case "compress":
      return buildCompressCommand(inputFile, outputDir, settings);
    case "compress_audio":
      return buildCompressAudioCommand(inputFile, outputDir, settings);
    case "merge":
      return buildMergeCommand(extraParams.mergeFiles || [], outputDir, settings, extraParams.concatListPath);
    case "mute_replace":
      return buildMuteReplaceCommand(inputFile, outputDir, settings);
    case "gif_frames":
      return buildGifFramesCommand(inputFile, outputDir, settings);
    case "bg_remover":
      return buildBgRemoverCommand(inputFile, outputDir, settings);
    case "ai_upscaler":
      return buildAiUpscalerCommand(inputFile, outputDir, settings);
    case "vectorizer":
      return buildVectorizerCommand(inputFile, outputDir, settings);
    case "restore_denoise":
      return buildRestoreDenoiseCommand(inputFile, outputDir, settings);
    case "icon_generator":
      return buildIconGeneratorCommand(inputFile, outputDir, settings);
    case "metadata_cleaner":
      return buildMetadataCleanerCommand(inputFile, outputDir, settings);
    case "custom":
      return buildCustomCommand(inputFile, outputDir, settings);
    case "ytdlp_video":
      return buildYtDlpVideoCommand(extraParams.url, outputDir, settings);
    case "ytdlp_audio":
      return buildYtDlpAudioCommand(extraParams.url, outputDir, settings);
    case "ytdlp_playlist":
      return buildYtDlpPlaylistCommand(extraParams.url, outputDir, settings, extraParams.selectedIndices);
    case "ytdlp_subtitles":
      return buildYtDlpSubtitlesCommand(extraParams.url, outputDir, settings);
    default:
      return buildConvertCommand(inputFile, outputDir, settings);
  }
}
