// AnEdiKit - Tool Estimates Calculation and UI Synchronization Submodule
import { getCurrentMediaInfo, getCurrentInputFile } from "./media.js";
import { getCurrentActiveTool } from "./navigation.js";
import { getMergeFiles } from "./merge.js";

export function updateEstimatesUI(targetTool = null) {
  const activeTool = targetTool || getCurrentActiveTool();
  const mediaInfo = getCurrentMediaInfo();
  const durSec = mediaInfo?.duration_seconds > 0 ? mediaInfo.duration_seconds : 120.0;
  const srcSizeMb = mediaInfo?.file_size_mb > 0 ? mediaInfo.file_size_mb : 42.5;
  const srcBitrateKbps = mediaInfo?.bitrate_kbps > 0
    ? mediaInfo.bitrate_kbps
    : Math.round((srcSizeMb * 8192) / durSec);

  // Extract source dimensions
  let srcW = 1920;
  let srcH = 1080;
  if (mediaInfo?.resolution && mediaInfo.resolution.includes("x")) {
    const [w, h] = mediaInfo.resolution.split("x").map((v) => parseInt(v, 10));
    if (w > 0 && h > 0) {
      srcW = w;
      srcH = h;
    }
  }
  const srcPixels = srcW * srcH;

  // Helper to format MB / GB / KB nicely
  const formatSize = (mb) => {
    if (isNaN(mb) || mb <= 0) return "~0.1 MB";
    if (mb >= 1024) return `~${(mb / 1024).toFixed(2)} GB`;
    if (mb < 0.1) return `~${Math.round(mb * 1024)} KB`;
    return `~${mb.toFixed(1)} MB`;
  };

  // 1. Convert Video Estimate
  if (!targetTool || activeTool === "convert") {
    const cvtTarget = document.getElementById("cvt-est-target");
    const cvtVbitrate = document.getElementById("cvt-est-vbitrate");
    const cvtSize = document.getElementById("cvt-est-size");
    if (cvtTarget && cvtVbitrate && cvtSize) {
      const container = document.getElementById("cvt-container")?.value || "mp4";
      const vcodec = document.getElementById("cvt-vcodec")?.value || "libx264";
      const acodec = document.getElementById("cvt-acodec")?.value || "aac";
      const crf = parseInt(document.getElementById("cvt-crf")?.value || "23", 10);
      const scale = document.getElementById("cvt-scale")?.value || "original";

      let targetW = srcW;
      let targetH = srcH;
      if (scale !== "original" && scale.includes(":")) {
        const [sw, sh] = scale.split(":").map((v) => parseInt(v, 10));
        if (sw > 0 && sh > 0) {
          targetW = sw;
          targetH = sh;
        }
      }
      const targetPixels = targetW * targetH;
      const pixelRatio = targetPixels / srcPixels;

      if (container === "gif") {
        const gifFps = parseInt(document.getElementById("cvt-gif-fps")?.value || "15", 10);
        const quality = document.getElementById("cvt-gif-quality")?.value || "palette_diff";
        cvtTarget.textContent = `Animated GIF (${gifFps} FPS)`;
        cvtVbitrate.textContent = `PaletteGen (${quality === "palette_bayer" ? "Bayer" : "Floyd-Steinberg"})`;
        // PaletteGen GIF: ~0.20-0.28 bytes per pixel per frame depending on dithering
        const bytesPerPx = quality === "palette_bayer" ? 0.19 : 0.25;
        const totalBytes = durSec * gifFps * targetW * targetH * bytesPerPx;
        const estMb = totalBytes / (1024 * 1024);
        cvtSize.textContent = formatSize(estMb);
      } else if (container === "webp") {
        const webpFps = parseInt(document.getElementById("cvt-webp-fps")?.value || "24", 10);
        const webpQuality = parseInt(document.getElementById("cvt-webp-quality")?.value || "75", 10);
        cvtTarget.textContent = `Animated WebP (${webpFps} FPS, Q${webpQuality})`;
        // WebP compression efficiency
        const bpp = (webpQuality / 100) * 0.042;
        const estVBitrateKbps = Math.round((targetPixels * webpFps * bpp) / 1000);
        cvtVbitrate.textContent = `~${estVBitrateKbps.toLocaleString()} kbps`;
        const estMb = ((estVBitrateKbps * 1000 / 8) * durSec) / (1024 * 1024);
        cvtSize.textContent = formatSize(estMb);
      } else {
        let targetVBitrateKbps = 2500;
        let targetABitrateKbps = 192;
        let containerOverhead = 1.015; // 1.5% for MP4/MOV, 1% MKV, 2.5% AVI

        if (container === "mkv" || container === "webm") containerOverhead = 1.01;
        else if (container === "avi") containerOverhead = 1.025;
        else if (container === "mov") containerOverhead = 1.018;

        // Audio stream bitrate
        if (acodec === "copy") {
          targetABitrateKbps = Math.min(320, Math.max(96, Math.round(srcBitrateKbps * 0.08)));
        } else if (acodec === "libmp3lame") {
          targetABitrateKbps = 256;
        } else if (acodec === "libopus") {
          targetABitrateKbps = 128;
        } else if (acodec === "flac") {
          targetABitrateKbps = 850;
        } else {
          targetABitrateKbps = 192;
        }

        // Video stream bitrate calculation from source bitrate, CRF, resolution, and codec
        if (vcodec === "copy") {
          // Direct stream copy preserves exact input video stream bitrate
          const srcAudioBitrate = Math.round(srcBitrateKbps * 0.08);
          targetVBitrateKbps = Math.max(100, srcBitrateKbps - srcAudioBitrate);
          cvtVbitrate.textContent = `Stream Copy (~${targetVBitrateKbps.toLocaleString()} kbps)`;
        } else {
          // Base bitrate for H.264 at 1080p CRF 23
          const crfFactor = Math.pow(2, (23 - crf) / 6);
          // Base bitrate per 1080p pixel ~0.0012 kbps
          let base1080pKbps = 2600 * crfFactor;
          // Bound by source bitrate if downscaling / recompressing
          if (srcBitrateKbps > 500 && crf >= 23) {
            base1080pKbps = Math.min(base1080pKbps, (srcBitrateKbps * 0.9));
          }

          let codecEfficiency = 1.0; // H.264 baseline
          if (vcodec === "libx265") codecEfficiency = 0.55; // HEVC: 45% lower bitrate
          else if (vcodec === "libsvtav1") codecEfficiency = 0.45; // AV1: 55% lower bitrate
          else if (vcodec === "libvpx-vp9") codecEfficiency = 0.65; // VP9: 35% lower bitrate
          else if (vcodec.startsWith("prores")) {
            // Apple ProRes 422 standard in MOV (~147 Mbps at 1080p)
            codecEfficiency = 147000 / 2600;
          }

          targetVBitrateKbps = Math.round(base1080pKbps * pixelRatio * codecEfficiency);
          targetVBitrateKbps = Math.max(120, targetVBitrateKbps);
          cvtVbitrate.textContent = `~${targetVBitrateKbps.toLocaleString()} kbps`;
        }

        const vName = vcodec === "copy" ? "Stream Copy" : vcodec === "libx265" ? "HEVC" : vcodec === "libvpx-vp9" ? "VP9" : vcodec === "libsvtav1" ? "AV1" : vcodec.startsWith("prores") ? "ProRes" : "H.264";
        const aName = acodec === "copy" ? "Keep Original" : acodec.toUpperCase();
        cvtTarget.textContent = `${container.toUpperCase()} (${vName} / ${aName})`;

        const totalKbps = targetVBitrateKbps + targetABitrateKbps;
        const estMb = ((totalKbps * 1000 / 8) * durSec * containerOverhead) / (1024 * 1024);
        cvtSize.textContent = formatSize(estMb);
      }
    }
  }

  // 2. Extract Audio Estimate
  if (!targetTool || activeTool === "extract_audio") {
    const audTarget = document.getElementById("aud-est-target");
    const audBitrate = document.getElementById("aud-est-bitrate");
    const audSize = document.getElementById("aud-est-size");
    if (audTarget && audBitrate && audSize) {
      const fmt = document.getElementById("aud-format")?.value || "mp3";
      const brVal = document.getElementById("aud-bitrate")?.value || "256k";
      const bitdepth = parseInt(document.getElementById("aud-bitdepth")?.value || "16", 10);
      const channels = 2;
      const sampleRate = 44100;

      if (["wav", "aiff"].includes(fmt)) {
        audTarget.textContent = `${fmt.toUpperCase()} (${bitdepth}-bit PCM)`;
        const pcmBitrate = (sampleRate * channels * bitdepth) / 1000;
        audBitrate.textContent = `${pcmBitrate.toLocaleString()} kbps`;
        const bytesPerSec = (sampleRate * channels * bitdepth) / 8;
        const estMb = (durSec * bytesPerSec) / (1024 * 1024);
        audSize.textContent = formatSize(estMb);
      } else if (fmt === "flac") {
        audTarget.textContent = `FLAC Lossless (${bitdepth}-bit)`;
        const flacBitrate = Math.round(((sampleRate * channels * bitdepth) / 1000) * 0.58);
        audBitrate.textContent = `~${flacBitrate.toLocaleString()} kbps`;
        const estMb = ((flacBitrate * 1000 / 8) * durSec) / (1024 * 1024);
        audSize.textContent = formatSize(estMb);
      } else {
        let kbps = 256;
        if (brVal === "copy") {
          kbps = Math.min(320, Math.max(128, Math.round(srcBitrateKbps * 0.08)));
        } else {
          kbps = parseInt(brVal, 10) || 256;
        }
        audTarget.textContent = `${fmt.toUpperCase()} (${kbps} kbps)`;
        audBitrate.textContent = `${kbps} kbps`;
        const estMb = ((kbps * 1000 / 8) * durSec * 1.01) / (1024 * 1024);
        audSize.textContent = formatSize(estMb);
      }
    }
  }

  // 3. Trim & Cut Estimate
  if (!targetTool || activeTool === "trim") {
    const trimDurationEl = document.getElementById("trim-est-duration");
    const trimModeEl = document.getElementById("trim-est-mode");
    const trimSizeEl = document.getElementById("trim-est-size");
    if (trimDurationEl && trimModeEl && trimSizeEl) {
      const startStr = document.getElementById("trim-start")?.value || "00:00:00.000";
      const endStr = document.getElementById("trim-end")?.value || "00:01:00.000";
      const parseTs = (t) => {
        const parts = (t || "").split(":");
        if (parts.length === 3) {
          return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        }
        return 0;
      };
      const sSec = parseTs(startStr);
      const eSec = parseTs(endStr);
      const clipDur = Math.max(0.1, eSec - sSec);
      const m = Math.floor(clipDur / 60);
      const s = Math.floor(clipDur % 60);
      trimDurationEl.textContent = `00:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      const mode = document.getElementById("trim-mode")?.value || "copy";
      trimModeEl.textContent = mode === "copy" ? "Stream Copy (Lossless)" : "Accurate Cut (Re-encode)";

      if (mode === "copy") {
        const ratio = durSec > 0 ? clipDur / durSec : 0.5;
        const estMb = srcSizeMb * ratio;
        trimSizeEl.textContent = formatSize(estMb);
      } else {
        // Re-encode at CRF 20 (~3200 kbps total)
        const estMb = ((3200 * 1000 / 8) * clipDur) / (1024 * 1024);
        trimSizeEl.textContent = formatSize(estMb);
      }
    }
  }

  // 3.5. Speed & Motion Estimate
  if (!targetTool || activeTool === "speed_motion") {
    const speedFactorEl = document.getElementById("speed-est-factor");
    const speedDurEl = document.getElementById("speed-est-duration");
    const speedSizeEl = document.getElementById("speed-est-size");
    if (speedFactorEl && speedDurEl && speedSizeEl) {
      const preset = document.getElementById("speed-preset")?.value || "2.0";
      const speed = preset === "custom" ? (parseFloat(document.getElementById("speed-custom-val")?.value) || 2.0) : (parseFloat(preset) || 2.0);
      speedFactorEl.textContent = `${speed}x`;
      const newDur = Math.max(0.1, durSec / speed);
      const m = Math.floor(newDur / 60);
      const s = Math.floor(newDur % 60);
      speedDurEl.textContent = `00:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      const estMb = Math.max(0.1, (srcSizeMb / speed) * 1.05);
      speedSizeEl.textContent = formatSize(estMb);
    }
  }

  // 3.6. Aspect Ratio & Crop Estimate
  if (!targetTool || activeTool === "aspect_crop") {
    const cropRatioEl = document.getElementById("crop-est-ratio");
    const cropModeEl = document.getElementById("crop-est-mode");
    const cropSizeEl = document.getElementById("crop-est-size");
    if (cropRatioEl && cropModeEl && cropSizeEl) {
      const ratio = document.getElementById("crop-ratio")?.value || "9:16";
      const mode = document.getElementById("crop-mode")?.value || "center_crop";
      cropRatioEl.textContent = ratio === "9:16" ? "9:16 (Vertical)" : ratio === "1:1" ? "1:1 (Square)" : ratio;
      cropModeEl.textContent = mode === "center_crop" ? "Center Crop" : mode === "pad_blur" ? "Blurred Background" : mode === "pad_black" ? "Letterbox" : "Fit & Scale";
      const crf = parseInt(document.getElementById("crop-crf")?.value || "23", 10);
      const crfFactor = Math.pow(2, (23 - crf) / 6);
      const estMb = ((2800 * crfFactor * 1000 / 8) * durSec) / (1024 * 1024);
      cropSizeEl.textContent = formatSize(estMb);
    }
  }

  // 3.7. Video Stabilization Estimate
  if (!targetTool || activeTool === "stabilize") {
    const stabEngineEl = document.getElementById("stab-est-engine");
    const stabSmoothEl = document.getElementById("stab-est-smooth");
    const stabSizeEl = document.getElementById("stab-est-size");
    if (stabEngineEl && stabSmoothEl && stabSizeEl) {
      const engine = document.getElementById("stab-engine")?.value || "deshake";
      const smooth = document.getElementById("stab-smooth")?.value || "medium";
      stabEngineEl.textContent = engine === "deshake" ? "FFmpeg Deshake" : "VidStab 2-Pass";
      stabSmoothEl.textContent = smooth.charAt(0).toUpperCase() + smooth.slice(1);
      stabSizeEl.textContent = formatSize(srcSizeMb * 1.02);
    }
  }

  // 3.75. Loop & Duration Extender Estimate
  if (!targetTool || activeTool === "loop_duration") {
    const loopEstMode = document.getElementById("loop-est-mode");
    const loopEstEngine = document.getElementById("loop-est-engine");
    const loopEstLoops = document.getElementById("loop-est-loops");
    const loopTotalTimeStr = document.getElementById("loop-total-time-str");
    const loopCalcCount = document.getElementById("loop-calc-count");
    const loopCountDurationStr = document.getElementById("loop-count-duration-str");

    if (loopEstMode && loopEstEngine && loopEstLoops) {
      const mode = document.getElementById("loop-mode")?.value || "duration";
      const engine = document.getElementById("loop-engine")?.value || "copy";
      const vcodec = document.getElementById("loop-vcodec")?.value || "libx264";
      const currentInput = getCurrentInputFile();
      const hasMedia = !!(currentInput && currentInput.trim().length > 0 && mediaInfo && mediaInfo.duration_seconds > 0);

      const vcodecNames = {
        libx264: "H.264",
        libx265: "HEVC",
        libsvtav1: "AV1",
        "libvpx-vp9": "VP9",
      };
      const engineLabel = engine === "copy" ? "Direct Stream Copy" : `Re-encode (${vcodecNames[vcodec] || vcodec})`;
      loopEstEngine.textContent = engineLabel;

      if (mode === "duration") {
        const hh = parseInt(document.getElementById("loop-target-hh")?.value, 10) || 0;
        const mm = parseInt(document.getElementById("loop-target-mm")?.value, 10) || 0;
        const ss = parseInt(document.getElementById("loop-target-ss")?.value, 10) || 0;
        const totalSec = Math.max(1, hh * 3600 + mm * 60 + ss);
        const timeStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

        if (loopTotalTimeStr) loopTotalTimeStr.textContent = timeStr;
        loopEstMode.textContent = `Target Duration (${timeStr})`;

        if (hasMedia) {
          const neededLoops = Math.max(1, Math.ceil(totalSec / durSec));
          const estTotalMb = srcSizeMb * (totalSec / durSec);
          if (loopCalcCount) loopCalcCount.textContent = `${neededLoops.toLocaleString()} repeats`;
          loopEstLoops.textContent = `${neededLoops.toLocaleString()} loops (${formatSize(estTotalMb)})`;
        } else {
          if (loopCalcCount) loopCalcCount.textContent = "--";
          loopEstLoops.textContent = "Waiting for media...";
        }
      } else {
        const count = parseInt(document.getElementById("loop-repeat-count")?.value, 10) || 10;
        loopEstMode.textContent = `Repeat Count (${count}x)`;

        if (hasMedia) {
          const totalSec = Math.round(durSec * count);
          const hh = Math.floor(totalSec / 3600);
          const mm = Math.floor((totalSec % 3600) / 60);
          const ss = totalSec % 60;
          const timeStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
          const estTotalMb = srcSizeMb * count;

          if (loopCountDurationStr) loopCountDurationStr.textContent = timeStr;
          loopEstLoops.textContent = `${count.toLocaleString()} repeats (${timeStr}, ${formatSize(estTotalMb)})`;
        } else {
          if (loopCountDurationStr) loopCountDurationStr.textContent = "--:--:--";
          loopEstLoops.textContent = `${count} repeats (No media)`;
        }
      }
    }
  }

  // 3.8. Volume Normalization Estimate
  if (!targetTool || activeTool === "normalize") {
    const normTargetEl = document.getElementById("norm-est-target");
    const normVideoEl = document.getElementById("norm-est-video");
    const normSizeEl = document.getElementById("norm-est-size");
    if (normTargetEl && normVideoEl && normSizeEl) {
      const target = document.getElementById("norm-target")?.value || "spotify_youtube";
      const videoMode = document.getElementById("norm-video-mode")?.value || "copy";
      normTargetEl.textContent = target === "spotify_youtube" ? "-14 LUFS (YouTube/Spotify)" : target === "apple_podcast" ? "-16 LUFS (Apple/Podcasts)" : target === "ebu_r128" ? "-23 LUFS (Broadcast)" : target === "dynaudnorm" ? "Dynamic Normalizer" : "Peak 0dB";
      normVideoEl.textContent = videoMode === "copy" ? "Stream Copy" : "Audio Only";
      const estMb = videoMode === "strip" ? Math.max(0.1, ((256 * 1000 / 8) * durSec) / (1024 * 1024)) : srcSizeMb;
      normSizeEl.textContent = formatSize(estMb);
    }
  }

  // 4. Merge Estimate
  if (!targetTool || activeTool === "merge") {
    const mergeCountEl = document.getElementById("merge-est-count");
    const mergeFormatEl = document.getElementById("merge-est-format");
    const mergeEngineEl = document.getElementById("merge-est-engine");
    if (mergeCountEl && mergeFormatEl && mergeEngineEl) {
      const mergeFiles = getMergeFiles();
      mergeCountEl.textContent = `${mergeFiles.length} files`;
      mergeFormatEl.textContent = (document.getElementById("merge-format")?.value || "mp4").toUpperCase();
      const engine = document.getElementById("merge-engine")?.value || "concat_demuxer";
      mergeEngineEl.textContent = engine === "concat_demuxer" ? "Fast Concat (Stream Copy)" : "Re-encode Concat";
    }
  }

  // 5. Mute / Replace Estimate
  if (!targetTool || activeTool === "mute_replace") {
    const muteActionEl = document.getElementById("mute-est-action");
    const muteVideoEl = document.getElementById("mute-est-video");
    const muteSizeEl = document.getElementById("mute-est-size");
    if (muteActionEl && muteVideoEl && muteSizeEl) {
      const action = document.getElementById("mute-action")?.value || "strip";
      muteActionEl.textContent = action === "strip" ? "Mute / Strip Audio" : action === "replace" ? "Replace Audio Track" : "Mix Background Track";
      muteVideoEl.textContent = "Stream Copy (Lossless)";
      const audioStreamSizeMb = ((Math.min(320, Math.max(128, srcBitrateKbps * 0.08)) * 1000 / 8) * durSec) / (1024 * 1024);
      const estMb = action === "strip" ? Math.max(0.1, srcSizeMb - audioStreamSizeMb) : srcSizeMb;
      muteSizeEl.textContent = formatSize(estMb);
    }
  }

  // 6. GIF & Frames Estimate
  if (!targetTool || activeTool === "gif_frames") {
    const gifModeEl = document.getElementById("gif-est-mode");
    const gifFpsEl = document.getElementById("gif-est-fps");
    const gifSizeEl = document.getElementById("gif-est-size");
    if (gifModeEl && gifFpsEl && gifSizeEl) {
      const mode = document.getElementById("gif-mode")?.value || "gif_hq";
      const fps = parseInt(document.getElementById("gif-fps")?.value || "15", 10);
      const clipDur = parseFloat(document.getElementById("gif-dur")?.value) || 5.0;
      const widthSetting = document.getElementById("gif-width")?.value || "480";
      const targetW = widthSetting === "original" ? srcW : parseInt(widthSetting, 10) || 480;
      const targetH = Math.round(targetW * (srcH / srcW));

      if (mode === "snapshot") {
        const snapFmt = document.getElementById("gif-snap-fmt")?.value || "png";
        gifModeEl.textContent = `Single Frame (${snapFmt.toUpperCase()})`;
        gifFpsEl.textContent = "1 Frame";
        const bpp = snapFmt === "png" ? 0.9 : snapFmt === "jpg" ? 0.15 : 0.08;
        const estMb = (targetW * targetH * bpp) / (1024 * 1024);
        gifSizeEl.textContent = formatSize(estMb);
      } else if (mode === "frames_seq") {
        gifModeEl.textContent = "Frame Sequence";
        gifFpsEl.textContent = `${fps} FPS`;
        const totalFrames = Math.round(clipDur * fps);
        const estMb = (totalFrames * targetW * targetH * 0.15) / (1024 * 1024);
        gifSizeEl.textContent = `${formatSize(estMb)} (${totalFrames} frames)`;
      } else {
        gifModeEl.textContent = "High-Quality Animated GIF";
        gifFpsEl.textContent = `${fps} FPS`;
        const totalBytes = clipDur * fps * targetW * targetH * 0.22;
        const estMb = totalBytes / (1024 * 1024);
        gifSizeEl.textContent = formatSize(estMb);
      }
    }
  }

  // 7. Custom Command Estimate
  if (!targetTool || activeTool === "custom") {
    const customFormatEl = document.getElementById("custom-est-format");
    const customDurEl = document.getElementById("custom-est-duration");
    if (customFormatEl && customDurEl) {
      customFormatEl.textContent = `.${document.getElementById("custom-ext")?.value || "mp4"}`;
      customDurEl.textContent = mediaInfo?.duration_string || "00:02:15";
    }
  }

  // 8. Image AI Tools Estimates
  if (!targetTool || activeTool === "bg_remover") {
    const bgEstModel = document.getElementById("bg-est-model");
    const bgEstMode = document.getElementById("bg-est-mode");
    if (bgEstModel && bgEstMode) {
      const bgModel = document.getElementById("bg-model");
      const bgOutputMode = document.getElementById("bg-output-mode");
      if (bgModel) bgEstModel.textContent = bgModel.options[bgModel.selectedIndex]?.text.split("(")[0].trim() || bgModel.value;
      if (bgOutputMode) bgEstMode.textContent = bgOutputMode.options[bgOutputMode.selectedIndex]?.text.split("(")[0].trim() || bgOutputMode.value;
    }
  }

  if (!targetTool || activeTool === "ai_upscaler") {
    const upscaleEstScale = document.getElementById("upscale-est-scale");
    const upscaleEstModel = document.getElementById("upscale-est-model");
    if (upscaleEstScale && upscaleEstModel) {
      const factor = document.getElementById("upscale-factor")?.value || "2";
      const model = document.getElementById("upscale-model");
      upscaleEstScale.textContent = `${factor}x`;
      if (model) upscaleEstModel.textContent = model.options[model.selectedIndex]?.text.split("(")[0].trim() || model.value;
    }
  }

  if (!targetTool || activeTool === "vectorizer") {
    const vecEstOutput = document.getElementById("vec-est-output");
    const vecEstLayers = document.getElementById("vec-est-layers");
    if (vecEstOutput && vecEstLayers) {
      const mode = document.getElementById("vec-mode");
      const colors = document.getElementById("vec-colors")?.value || "8";
      if (mode) vecEstOutput.textContent = mode.options[mode.selectedIndex]?.text.split("(")[0].trim() || "Scalable SVG";
      vecEstLayers.textContent = `${colors} Colors`;
    }
  }

  if (!targetTool || activeTool === "restore_denoise") {
    const restEstMethod = document.getElementById("rest-est-method");
    const restEstStrength = document.getElementById("rest-est-strength");
    if (restEstMethod && restEstStrength) {
      const method = document.getElementById("rest-method");
      const strength = document.getElementById("rest-strength");
      if (method) restEstMethod.textContent = method.options[method.selectedIndex]?.text.split("(")[0].trim() || method.value;
      if (strength) restEstStrength.textContent = strength.options[strength.selectedIndex]?.text || `${strength.value}`;
    }
  }

  if (!targetTool || activeTool === "icon_generator") {
    const iconEstTarget = document.getElementById("icon-est-target");
    if (iconEstTarget) {
      const platform = document.getElementById("icon-platform");
      if (platform) iconEstTarget.textContent = platform.options[platform.selectedIndex]?.text || "All Platforms";
    }
  }

  if (!targetTool || activeTool === "metadata_cleaner") {
    const metaEstPrivacy = document.getElementById("meta-est-privacy");
    if (metaEstPrivacy) {
      const action = document.getElementById("meta-action");
      if (action) metaEstPrivacy.textContent = action.options[action.selectedIndex]?.text.split("(")[0].trim() || "All Metadata Removed";
    }
  }
}
