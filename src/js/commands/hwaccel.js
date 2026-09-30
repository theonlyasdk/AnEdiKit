// AnEdiKit - Hardware-acceleration resolution + encoder options.
let detectedHardwareInfo = null;

export function setDetectedHardware(info) {
  detectedHardwareInfo = info;
}


export function getResolvedHwaccel(settings = {}) {
  const mode = settings.hwAccel || "auto";
  if (mode === "auto") {
    if (detectedHardwareInfo?.nvenc_available ?? (detectedHardwareInfo?.nvidia_gpu != null)) return "cuda";
    if (detectedHardwareInfo?.qsv_available ?? (detectedHardwareInfo?.intel_gpu != null)) return "qsv";
    if (detectedHardwareInfo?.amf_available ?? (detectedHardwareInfo?.amd_gpu != null)) return "amf";
    if (detectedHardwareInfo?.videotoolbox_available) return "videotoolbox";
    if (detectedHardwareInfo?.d3d11va_available) return "d3d11va";
    return "cpu";
  }
  if (mode === "cuda" && detectedHardwareInfo && detectedHardwareInfo.nvenc_available === false) {
    return "cpu";
  }
  if (mode === "qsv" && detectedHardwareInfo && detectedHardwareInfo.qsv_available === false) {
    return "cpu";
  }
  if (mode === "amf" && detectedHardwareInfo && detectedHardwareInfo.amf_available === false) {
    return "cpu";
  }
  if (mode === "videotoolbox" && detectedHardwareInfo && detectedHardwareInfo.videotoolbox_available === false) {
    return "cpu";
  }
  if (mode === "d3d11va" && detectedHardwareInfo && detectedHardwareInfo.d3d11va_available === false) {
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
  } else if (hwChoice === "videotoolbox") {
    if (targetCodec === "libx264" || targetCodec === "h264") return "h264_videotoolbox";
    if (targetCodec === "libx265" || targetCodec === "hevc" || targetCodec === "h265") return "hevc_videotoolbox";
  }
  return targetCodec;
}


export function getHwaccelInputArgs(hwChoice) {
  if (hwChoice === "cuda") return ["-hwaccel", "cuda"];
  if (hwChoice === "qsv") return ["-hwaccel", "qsv"];
  if (hwChoice === "amf" || hwChoice === "d3d11va") return ["-hwaccel", "d3d11va"];
  if (hwChoice === "videotoolbox") return ["-hwaccel", "videotoolbox"];
  return [];
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
  } else if (mappedEncoder.endsWith("_videotoolbox")) {
    if (!bitrate) {
      args.push("-q:v", crf);
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
