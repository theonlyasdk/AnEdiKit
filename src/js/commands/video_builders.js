// AnEdiKit - Per-tool ffmpeg command builders (video/audio/queue).
import { getCachedMediaProbe, probeHasAudio, probeIsAudioOnly } from "./probe_cache.js";
import { isAudioPath, audioCodecToContainer, resolveDestinationPath, parseTimestampToSeconds } from "./path_helpers.js";
import { getResolvedHwaccel, mapHardwareEncoder, getHwaccelInputArgs, applyVideoEncoderOptions } from "./hwaccel.js";

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
    args.push(...getHwaccelInputArgs(hwChoice));
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

  // Stream Copy (-c:a copy) cannot remux into an incompatible container
  // (e.g. AAC/Opus/FLAC bitstreams into .mp3). Align the destination
  // extension with the source audio codec when it is known via probe.
  let outFmt = fmt;
  if (bitrate === "copy") {
    const srcCodec = getCachedMediaProbe(src)?.audioCodec;
    outFmt = (srcCodec && audioCodecToContainer(srcCodec)) || fmt;
  }

  const dst = resolveDestinationPath(`${baseName}_extracted.${outFmt}`, settings, src);

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
  args.push(...getHwaccelInputArgs(hwChoice));

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


export function buildAudioTagsCommand(inputFile, outputDir, settings = {}, extraParams = {}) {
  const src = inputFile || "C:\\Users\\User\\Music\\audio_sample.mp3";
  const ext = (src.split(".").pop() || "mp3").toLowerCase();
  const baseName =
    src
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.[^/.]+$/, "") || "output_tagged";

  const defaultOutName = `${baseName}_tagged.${ext}`;
  const dst = extraParams.customOutPath || resolveDestinationPath(defaultOutName, settings, src);

  const title = extraParams.title !== undefined ? extraParams.title : (document.getElementById("tag-title")?.value?.trim() ?? "");
  const artist = extraParams.artist !== undefined ? extraParams.artist : (document.getElementById("tag-artist")?.value?.trim() ?? "");
  const album = extraParams.album !== undefined ? extraParams.album : (document.getElementById("tag-album")?.value?.trim() ?? "");
  const albumArtist = extraParams.albumArtist !== undefined ? extraParams.albumArtist : (document.getElementById("tag-album-artist")?.value?.trim() ?? "");
  const track = extraParams.track !== undefined ? extraParams.track : (document.getElementById("tag-track")?.value?.trim() ?? "");
  const totalTracks = extraParams.totalTracks !== undefined ? extraParams.totalTracks : (document.getElementById("tag-total-tracks")?.value?.trim() ?? "");
  const disc = extraParams.disc !== undefined ? extraParams.disc : (document.getElementById("tag-disc")?.value?.trim() ?? "");
  const year = extraParams.year !== undefined ? extraParams.year : (document.getElementById("tag-year")?.value?.trim() ?? "");
  const genre = extraParams.genre !== undefined ? extraParams.genre : (document.getElementById("tag-genre")?.value?.trim() ?? "");
  const composer = extraParams.composer !== undefined ? extraParams.composer : (document.getElementById("tag-composer")?.value?.trim() ?? "");
  const comment = extraParams.comment !== undefined ? extraParams.comment : (document.getElementById("tag-comment")?.value?.trim() ?? "");

  const coverAction = extraParams.coverAction || "keep";
  const coverPath = extraParams.coverPath || "";
  const tempOggMetaPath = extraParams.tempOggMetaPath || "";

  const args = ["-y", "-i", src];

  if (coverAction === "replace" && coverPath) {
    if (ext === "ogg" && tempOggMetaPath) {
      args.push("-i", tempOggMetaPath, "-map", "0:a", "-map_metadata", "1", "-c:a", "copy");
    } else if (ext === "mp3") {
      args.push(
        "-i", coverPath,
        "-map", "0:a",
        "-map", "1",
        "-c:a", "copy",
        "-c:v", "mjpeg",
        "-id3v2_version", "3",
        "-metadata:s:v", "title=Album cover",
        "-metadata:s:v", "comment=Cover (front)",
        "-disposition:v:0", "attached_pic"
      );
    } else if (ext === "m4a" || ext === "mp4" || ext === "m4b") {
      args.push(
        "-i", coverPath,
        "-map", "0:a",
        "-map", "1",
        "-c:a", "copy",
        "-c:v", "copy",
        "-disposition:v:0", "attached_pic"
      );
    } else if (ext === "flac") {
      args.push(
        "-i", coverPath,
        "-map", "0:a",
        "-map", "1",
        "-c:a", "copy",
        "-c:v", "mjpeg",
        "-disposition:v:0", "attached_pic"
      );
    } else {
      args.push(
        "-i", coverPath,
        "-map", "0:a",
        "-map", "1",
        "-c:a", "copy",
        "-c:v", "copy",
        "-disposition:v:0", "attached_pic"
      );
    }
  } else if (coverAction === "remove") {
    args.push("-map", "0:a", "-c:a", "copy");
    if (ext === "mp3") {
      args.push("-id3v2_version", "3");
    }
  } else {
    args.push("-map", "0", "-c", "copy");
    if (ext === "mp3") {
      args.push("-id3v2_version", "3");
    }
  }

  // Set or clear tags
  args.push("-metadata", `title=${title}`);
  args.push("-metadata", `artist=${artist}`);
  args.push("-metadata", `album=${album}`);
  args.push("-metadata", `album_artist=${albumArtist}`);
  args.push("-metadata", `genre=${genre}`);

  if (year) {
    args.push("-metadata", `date=${year}`);
    if (ext === "mp3") {
      args.push("-metadata", `year=${year}`);
    }
  } else {
    args.push("-metadata", "date=");
    if (ext === "mp3") args.push("-metadata", "year=");
  }

  if (track || totalTracks) {
    const trackVal = totalTracks ? `${track || "1"}/${totalTracks}` : track;
    args.push("-metadata", `track=${trackVal}`);
  } else {
    args.push("-metadata", "track=");
  }

  args.push("-metadata", `disc=${disc}`);
  args.push("-metadata", `composer=${composer}`);
  args.push("-metadata", `comment=${comment}`);

  args.push("-progress", "pipe:1");
  args.push(dst);

  return {
    executable: "ffmpeg",
    args,
    destination: dst,
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
    // filter_complex re-encode concat. Every concat segment must expose the
    // same streams: referencing [i:a:0] for a silent input aborts FFmpeg with
    // "Stream specifier ':a:0' ... matches no streams". Consult the probe
    // cache (unknown inputs conservatively assume audio, i.e. legacy graph).
    const files = mergeFiles.length > 0 ? mergeFiles : ["clip1.mp4", "clip2.mp4"];
    files.forEach((f) => {
      args.push("-i", f);
    });

    const audioKnown = files.map((f) => probeHasAudio(f)); // true | false | null
    const isSilent = (i) => audioKnown[i] === false;
    const silentCount = audioKnown.filter((v) => v === false).length;

    const pushLavfiSilence = (durSec) => {
      // Returns the input index of an appended finite silence stream.
      args.push("-f", "lavfi", "-t", String(durSec), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
      return args.filter((a) => a === "-i").length - 1;
    };

    const count = files.length;
    if (isAudioOnly) {
      // Concat audio segments; known-silent inputs contribute generated
      // silence of matching duration, or are skipped when duration is unknown.
      const segments = [];
      files.forEach((f, i) => {
        if (!isSilent(i)) {
          segments.push(`[${i}:a:0]`);
        } else {
          const dur = getCachedMediaProbe(f)?.duration;
          if (Number.isFinite(dur) && dur > 0) {
            segments.push(`[${pushLavfiSilence(dur)}:a:0]`);
          }
        }
      });
      const segCount = segments.length > 0 ? segments.length : count;
      const graph = segments.length > 0 ? segments.join("") : files.map((_, i) => `[${i}:a:0]`).join("");
      args.push("-filter_complex", `${graph}concat=n=${segCount}:v=0:a=1[outa]`, "-map", "[outa]");
      args.push("-c:a", fmt === "flac" ? "flac" : fmt === "wav" ? "pcm_s16le" : "aac");
      if (fmt !== "flac" && fmt !== "wav") args.push("-b:a", "192k");
    } else if (silentCount === 0) {
      const inputs = files.map((_, i) => `[${i}:v:0][${i}:a:0]`).join("");
      args.push("-filter_complex", `${inputs}concat=n=${count}:v=1:a=1[outv][outa]`, "-map", "[outv]", "-map", "[outa]");
      applyVideoEncoderOptions(args, "libx264", settings, { crf: "22", preset: "medium" });
      args.push("-c:a", "aac", "-b:a", "192k");
    } else if (silentCount === count) {
      // All inputs silent: video-only concat, no audio mapping at all.
      const inputs = files.map((_, i) => `[${i}:v:0]`).join("");
      args.push("-filter_complex", `${inputs}concat=n=${count}:v=1:a=0[outv]`, "-map", "[outv]");
      applyVideoEncoderOptions(args, "libx264", settings, { crf: "22", preset: "medium" });
    } else {
      // Mixed silent/sounding inputs: synthesize silence for silent segments
      // when durations are known; otherwise fall back to video-only concat
      // (drops audio but never crashes on stream specifiers).
      const durations = files.map((f) => getCachedMediaProbe(f)?.duration);
      const synthesizable = files.every((_, i) => !isSilent(i) || (Number.isFinite(durations[i]) && durations[i] > 0));
      if (synthesizable) {
        const segments = files.map((_, i) => {
          if (!isSilent(i)) return `[${i}:v:0][${i}:a:0]`;
          return `[${i}:v:0][${pushLavfiSilence(durations[i])}:a:0]`;
        }).join("");
        args.push("-filter_complex", `${segments}concat=n=${count}:v=1:a=1[outv][outa]`, "-map", "[outv]", "-map", "[outa]");
        applyVideoEncoderOptions(args, "libx264", settings, { crf: "22", preset: "medium" });
        args.push("-c:a", "aac", "-b:a", "192k");
      } else {
        const inputs = files.map((_, i) => `[${i}:v:0]`).join("");
        args.push("-filter_complex", `${inputs}concat=n=${count}:v=1:a=0[outv]`, "-map", "[outv]");
        applyVideoEncoderOptions(args, "libx264", settings, { crf: "22", preset: "medium" });
      }
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
    // Mixing references [0:a]; a silent primary input has no audio stream and
    // FFmpeg would abort on the stream specifier. Fall back to the secondary
    // track alone (equivalent to replace for silent primaries).
    if (probeHasAudio(src) === false) {
      if (vol !== "1.0") {
        args.push("-filter_complex", `[1:a]volume=${vol}[a]`);
        args.push("-map", "0:v:0", "-map", "[a]");
      } else {
        args.push("-map", "0:v:0", "-map", "1:a:0");
      }
      args.push("-c:v", "copy");
      args.push("-c:a", "aac", "-b:a", "192k");
    } else {
      const filter =
        vol !== "1.0"
          ? `[1:a]volume=${vol}[bg];[0:a][bg]amix=inputs=2:duration=first[a]`
          : `[0:a][1:a]amix=inputs=2:duration=first[a]`;
      args.push("-filter_complex", filter);
      args.push("-map", "0:v:0", "-map", "[a]");
      args.push("-c:v", "copy");
      args.push("-c:a", "aac", "-b:a", "192k");
    }
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
