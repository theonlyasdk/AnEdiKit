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
  const volume = document.getElementById("aud-volume")?.value || "none";

  const dst = resolveDestinationPath(`${baseName}_extracted.${fmt}`, settings);

  args.push("-i", src);
  args.push("-vn");

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

  if (codec !== "flac" && codec !== "pcm_s16le") {
    args.push("-b:a", bitrate);
  }

  if (volume === "loudnorm") {
    args.push("-af", "loudnorm=I=-16:TP=-1.5:LRA=11");
  } else if (volume === "vol_150") {
    args.push("-af", "volume=1.5");
  } else if (volume === "vol_200") {
    args.push("-af", "volume=2.0");
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

export function buildTrimCommand(inputFile, outputDir, settings = {}) {
  const args = ["-y"];
  const src = inputFile || "C:\\Users\\User\\Videos\\input_sample.mp4";
  const baseName =
    src
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "") || "output_trimmed";
  const ext = (src.split(".").pop() || "mp4").toLowerCase();

  const start = document.getElementById("trim-start")?.value || "00:00:00";
  const end = document.getElementById("trim-end")?.value || "00:00:10";
  const mode = document.getElementById("trim-mode")?.value || "copy";

  const dst = resolveDestinationPath(`${baseName}_trimmed.${ext}`, settings);

  args.push("-ss", start);
  args.push("-to", end);
  args.push("-i", src);

  if (mode === "copy") {
    args.push("-c", "copy");
  } else {
    args.push("-c:v", "libx264", "-crf", "20", "-c:a", "aac", "-b:a", "192k");
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

export function buildCompressCommand(inputFile, outputDir, settings = {}) {
  const args = ["-y"];
  const src = inputFile || "C:\\Users\\User\\Videos\\input_sample.mp4";
  const baseName =
    src
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "") || "output_compressed";

  const preset = document.getElementById("comp-preset")?.value || "discord";
  const customMb =
    parseFloat(document.getElementById("comp-custom-mb")?.value) || 24;

  let targetMb = 24;
  if (preset === "whatsapp") targetMb = 15;
  else if (preset === "email") targetMb = 10;
  else if (preset === "custom") targetMb = customMb;

  const durationSec = 120.0;
  const audioBitrateK = 96;
  const totalBitrateK = Math.floor((targetMb * 8192) / durationSec);
  const videoBitrateK = Math.max(80, totalBitrateK - audioBitrateK);

  const dst = resolveDestinationPath(`${baseName}_compressed.mp4`, settings);

  args.push("-i", src);
  args.push("-c:v", "libx264");
  args.push("-b:v", `${videoBitrateK}k`);
  args.push("-maxrate", `${Math.round(videoBitrateK * 1.5)}k`);
  args.push("-bufsize", `${videoBitrateK * 2}k`);
  args.push("-preset", "medium");
  args.push("-c:a", "aac");
  args.push("-b:a", `${audioBitrateK}k`);

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
    default:
      return buildConvertCommand(inputFile, outputDir, settings);
  }
}
