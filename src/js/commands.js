// FFmpeg Command Builder Module based on ffmpeg-tools-frontend.ps1

export function resolveDestinationPath(defaultFileName, settings = {}) {
  const outDir = settings.outputDir || "C:\\Users\\User\\Videos";
  const customNameInput = document.getElementById("output-file-name");
  let targetName = customNameInput?.value?.trim() || "";

  if (!targetName) {
    targetName = defaultFileName;
  }

  if (targetName.includes("\\") || targetName.includes("/")) {
    return targetName;
  }

  return `${outDir.replace(/[/\\]+$/, "")}\\${targetName}`;
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
  const vcodec = document.getElementById("cvt-vcodec")?.value || "libx264";
  const acodec = document.getElementById("cvt-acodec")?.value || "aac";
  const crf = document.getElementById("cvt-crf")?.value || "23";
  const preset = document.getElementById("cvt-preset")?.value || "medium";
  const scale = document.getElementById("cvt-scale")?.value || "original";

  const dst = resolveDestinationPath(`${baseName}_converted.${container}`, settings);

  // Overwrite flag
  args.push("-y");

  // Hardware acceleration
  const hwAccel = settings.hwAccel || "auto";
  if (hwAccel === "cuda") {
    args.push("-hwaccel", "cuda");
  } else if (hwAccel === "qsv") {
    args.push("-hwaccel", "qsv");
  } else if (hwAccel === "amf") {
    args.push("-hwaccel", "d3d11va");
  }

  // Encoding threads
  const threads = settings.threads || "0";
  if (threads !== "0") {
    args.push("-threads", threads);
  }

  // Input file
  args.push("-i", src);

  // Video resolution filter
  if (scale !== "original") {
    const [w, h] = scale.split(":");
    args.push(
      "-vf",
      `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`,
    );
  }

  // Video Codec
  if (vcodec === "copy") {
    args.push("-c:v", "copy");
  } else {
    args.push("-c:v", vcodec);
    args.push("-crf", crf);
    args.push("-preset", preset);
    if (vcodec === "libx264" || vcodec === "libx265") {
      args.push("-pix_fmt", "yuv420p");
    }
  }

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
  const channels = document.getElementById("aud-channels")?.value || "original";
  const samplerate = document.getElementById("aud-samplerate")?.value || "original";
  const volume = document.getElementById("aud-volume")?.value || "none";

  const dst = resolveDestinationPath(`${baseName}_extracted.${fmt}`, settings);

  args.push("-i", src);
  args.push("-vn");

  if (bitrate === "copy") {
    args.push("-c:a", "copy");
  } else {
    const codecMap = {
      mp3: "libmp3lame",
      m4a: "aac",
      flac: "flac",
      wav: "pcm_s16le",
      ogg: "libvorbis",
      opus: "libopus",
      wma: "wmav2",
      aiff: "pcm_s16be",
      ac3: "ac3",
      dts: "dca",
      amr: "libopencore_amrnb",
      mka: "flac",
      mp2: "mp2",
    };

    const codec = codecMap[fmt] || "libmp3lame";
    args.push("-c:a", codec);

    if (codec !== "flac" && codec !== "pcm_s16le" && codec !== "pcm_s16be") {
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

  const dst = resolveDestinationPath(`${baseName}_trimmed.${ext}`, settings);

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

  const dst = resolveDestinationPath(`${baseName}_compressed.mp4`, settings);

  args.push("-i", src);

  // Resolution Filter
  if (scale !== "original") {
    const [w, h] = scale.split(":");
    args.push(
      "-vf",
      `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`,
    );
  }

  // Video Codec & Bitrate Budgeting
  args.push("-c:v", vcodec);
  args.push("-b:v", `${videoBitrateK}k`);
  args.push("-maxrate", `${Math.round(videoBitrateK * 1.4)}k`);
  args.push("-bufsize", `${videoBitrateK * 2}k`);
  
  if (vcodec === "libx264") {
    args.push("-preset", "medium", "-pix_fmt", "yuv420p");
  } else if (vcodec === "libx265") {
    args.push("-preset", "medium", "-tag:v", "hvc1");
  } else if (vcodec === "libsvtav1") {
    args.push("-preset", "6");
  }

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

  const dst = resolveDestinationPath(`${baseName}_merged.${fmt}`, settings);

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
      args.push("-c:v", "libx264", "-crf", "22", "-preset", "medium", "-c:a", "aac", "-b:a", "192k");
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

  const dst = resolveDestinationPath(`${baseName}${suffix}.${ext}`, settings);

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
    dst = resolveDestinationPath(`${baseName}_animated.gif`, settings);
    if (start && start !== "00:00:00" && start !== "00:00:00.000") {
      args.push("-ss", start);
    }
    args.push("-t", dur.toString());
    args.push("-i", src);

    const scaleFilter = width === "original" ? "" : `,scale=${width}:-1:flags=lanczos`;
    const filter = `[0:v]fps=${fps}${scaleFilter},split[s0][s1];[s0]palettegen=max_colors=256:reserve_transparent=0[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`;

    args.push("-filter_complex", filter);
  } else if (mode === "snapshot") {
    dst = resolveDestinationPath(`${baseName}_snapshot.${snapFmt}`, settings);
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
    dst = resolveDestinationPath(`${baseName}_frame_%04d.${snapFmt}`, settings);
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

  const customArgsStr = document.getElementById("custom-args")?.value?.trim() || "";
  const dst = resolveDestinationPath(`${baseName}_custom.mp4`, settings);

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
    case "compress":
      return buildCompressCommand(inputFile, outputDir, settings);
    case "merge":
      return buildMergeCommand(extraParams.mergeFiles || [], outputDir, settings, extraParams.concatListPath);
    case "mute_replace":
      return buildMuteReplaceCommand(inputFile, outputDir, settings);
    case "gif_frames":
      return buildGifFramesCommand(inputFile, outputDir, settings);
    case "custom":
      return buildCustomCommand(inputFile, outputDir, settings);
    default:
      return buildConvertCommand(inputFile, outputDir, settings);
  }
}
