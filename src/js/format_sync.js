// AnEdiKit - Tool Format and Controls Synchronization Module

// Display formatting for speed values: integers keep one decimal ("2.0")
// to match the historic preset labels, others stay compact ("0.25").
export function formatSpeedValue(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!Number.isFinite(n)) return "2.0";
  return Number.isInteger(n) ? n.toFixed(1) : String(Math.round(n * 100) / 100);
}

// Keeps the speed slider, preset dropdown, and exact-value number input in
// sync. Slider is the single source of truth (0.25x-16x); the dropdown
// quick-picks presets (showing a "Custom" entry for off-preset values) and
// the number box allows arbitrary 0.1x-100x entry, both pushing clamped
// values back to the slider.
export const SPEED_PRESETS = ["0.25", "0.5", "0.75", "1", "1.25", "1.5", "2", "4", "8", "16"];

export function syncSpeedSliderUI() {
  const slider = document.getElementById("speed-preset");
  const num = document.getElementById("speed-custom-val");
  const sel = document.getElementById("speed-preset-select");
  if (!slider) return;
  if (num && document.activeElement === num) {
    const nv = parseFloat(num.value);
    if (Number.isFinite(nv)) {
      slider.value = String(Math.min(16, Math.max(0.25, nv)));
    }
  } else if (num) {
    num.value = slider.value;
  }
  if (sel) {
    const key = String(parseFloat(slider.value) || 2);
    let customOpt = sel.querySelector("option[data-custom]");
    if (SPEED_PRESETS.includes(key)) {
      if (customOpt) customOpt.remove();
      sel.value = key;
    } else {
      if (!customOpt) {
        customOpt = document.createElement("option");
        customOpt.dataset.custom = "1";
        sel.appendChild(customOpt);
      }
      customOpt.value = key;
      customOpt.textContent = `${formatSpeedValue(key)}x`;
      sel.value = key;
    }
  }
}

export function syncFormatSpecificUI(toolId = null) {
  // 1. Convert Video tool format sync
  if (!toolId || toolId === "convert") {
    const cvtContainer = document.getElementById("cvt-container")?.value || "mp4";
    const cvtVcodecWrapper = document.getElementById("cvt-vcodec-wrapper");
    const cvtAcodecWrapper = document.getElementById("cvt-acodec-wrapper");
    const cvtCrfWrapper = document.getElementById("cvt-crf-wrapper");
    const cvtPresetWrapper = document.getElementById("cvt-preset-wrapper");
    const cvtGifFpsWrapper = document.getElementById("cvt-gif-fps-wrapper");
    const cvtGifQualityWrapper = document.getElementById("cvt-gif-quality-wrapper");
    const cvtWebpFpsWrapper = document.getElementById("cvt-webp-fps-wrapper");
    const cvtWebpQualityWrapper = document.getElementById("cvt-webp-quality-wrapper");
    const cvtVcodec = document.getElementById("cvt-vcodec")?.value || "libx264";

    if (cvtContainer === "gif") {
      // For GIF: Hide video codec, audio codec, CRF, speed preset
      if (cvtVcodecWrapper) cvtVcodecWrapper.classList.add("d-none");
      if (cvtAcodecWrapper) cvtAcodecWrapper.classList.add("d-none");
      if (cvtCrfWrapper) cvtCrfWrapper.classList.add("d-none");
      if (cvtPresetWrapper) cvtPresetWrapper.classList.add("d-none");
      // Show GIF-specific options
      if (cvtGifFpsWrapper) cvtGifFpsWrapper.classList.remove("d-none");
      if (cvtGifQualityWrapper) cvtGifQualityWrapper.classList.remove("d-none");
      if (cvtWebpFpsWrapper) cvtWebpFpsWrapper.classList.add("d-none");
      if (cvtWebpQualityWrapper) cvtWebpQualityWrapper.classList.add("d-none");
    } else if (cvtContainer === "webp") {
      // For WebP: Hide standard video/audio codec, CRF, speed preset
      if (cvtVcodecWrapper) cvtVcodecWrapper.classList.add("d-none");
      if (cvtAcodecWrapper) cvtAcodecWrapper.classList.add("d-none");
      if (cvtCrfWrapper) cvtCrfWrapper.classList.add("d-none");
      if (cvtPresetWrapper) cvtPresetWrapper.classList.add("d-none");
      // Show WebP-specific options
      if (cvtGifFpsWrapper) cvtGifFpsWrapper.classList.add("d-none");
      if (cvtGifQualityWrapper) cvtGifQualityWrapper.classList.add("d-none");
      if (cvtWebpFpsWrapper) cvtWebpFpsWrapper.classList.remove("d-none");
      if (cvtWebpQualityWrapper) cvtWebpQualityWrapper.classList.remove("d-none");
    } else {
      // Standard video formats (MP4, MKV, WebM, MOV, AVI, etc.)
      if (cvtVcodecWrapper) cvtVcodecWrapper.classList.remove("d-none");
      if (cvtAcodecWrapper) cvtAcodecWrapper.classList.remove("d-none");
      if (cvtGifFpsWrapper) cvtGifFpsWrapper.classList.add("d-none");
      if (cvtGifQualityWrapper) cvtGifQualityWrapper.classList.add("d-none");
      if (cvtWebpFpsWrapper) cvtWebpFpsWrapper.classList.add("d-none");
      if (cvtWebpQualityWrapper) cvtWebpQualityWrapper.classList.add("d-none");

      // If stream copy is selected for video, CRF and Preset don't apply
      if (cvtVcodec === "copy") {
        if (cvtCrfWrapper) cvtCrfWrapper.classList.add("d-none");
        if (cvtPresetWrapper) cvtPresetWrapper.classList.add("d-none");
      } else {
        if (cvtCrfWrapper) cvtCrfWrapper.classList.remove("d-none");
        if (cvtPresetWrapper) cvtPresetWrapper.classList.remove("d-none");
      }
    }
  }

  // 2. Extract Audio format sync
  if (!toolId || toolId === "extract_audio") {
    const audFormat = document.getElementById("aud-format")?.value || "mp3";
    const audBitrateWrapper = document.getElementById("aud-bitrate-wrapper");
    const audBitdepthWrapper = document.getElementById("aud-bitdepth-wrapper");

    if (["flac", "wav", "aiff"].includes(audFormat)) {
      if (audBitrateWrapper) audBitrateWrapper.classList.add("d-none");
      if (audBitdepthWrapper) audBitdepthWrapper.classList.remove("d-none");
    } else {
      if (audBitrateWrapper) audBitrateWrapper.classList.remove("d-none");
      if (audBitdepthWrapper) audBitdepthWrapper.classList.add("d-none");
    }
  }

  // 3. GIF and Frames tool mode sync
  if (!toolId || toolId === "gif_frames") {
    const gifMode = document.getElementById("gif-mode")?.value || "gif_hq";
    const gifFpsWrapper = document.getElementById("gif-fps-wrapper");
    const gifDurWrapper = document.getElementById("gif-dur-wrapper");
    const gifSnapWrapper = document.getElementById("gif-snap-wrapper");

    if (gifMode === "snapshot") {
      if (gifFpsWrapper) gifFpsWrapper.classList.add("d-none");
      if (gifDurWrapper) gifDurWrapper.classList.add("d-none");
      if (gifSnapWrapper) gifSnapWrapper.classList.remove("d-none");
    } else if (gifMode === "frames_seq") {
      if (gifFpsWrapper) gifFpsWrapper.classList.remove("d-none");
      if (gifDurWrapper) gifDurWrapper.classList.remove("d-none");
      if (gifSnapWrapper) gifSnapWrapper.classList.remove("d-none");
    } else {
      if (gifFpsWrapper) gifFpsWrapper.classList.remove("d-none");
      if (gifDurWrapper) gifDurWrapper.classList.remove("d-none");
      if (gifSnapWrapper) gifSnapWrapper.classList.add("d-none");
    }
  }

  // 4. Speed & Motion slider <-> number <-> badge sync
  if (!toolId || toolId === "speed_motion") {
    syncSpeedSliderUI();
  }

  // 4.5. Loop & Duration Extender tool sync
  if (!toolId || toolId === "loop_duration") {
    const loopMode = document.getElementById("loop-mode")?.value || "duration";
    const loopEngine = document.getElementById("loop-engine")?.value || "copy";
    const loopDurationWrapper = document.getElementById("loop-duration-wrapper");
    const loopCountWrapper = document.getElementById("loop-count-wrapper");
    const loopReencodeCodecWrapper = document.getElementById("loop-reencode-codec-wrapper");

    if (loopDurationWrapper) {
      loopDurationWrapper.classList.toggle("d-none", loopMode !== "duration");
    }
    if (loopCountWrapper) {
      loopCountWrapper.classList.toggle("d-none", loopMode !== "count");
    }
    if (loopReencodeCodecWrapper) {
      loopReencodeCodecWrapper.classList.toggle("d-none", loopEngine !== "reencode");
    }
  }

  // 5. Volume Normalization custom LUFS wrapper sync
  if (!toolId || toolId === "normalize") {
    const normTarget = document.getElementById("norm-target")?.value || "spotify_youtube";
    const normCustomWrapper = document.getElementById("norm-custom-wrapper");
    if (normCustomWrapper) {
      normCustomWrapper.classList.toggle("d-none", normTarget !== "custom");
    }
  }

  // 6. Background Remover mode wrappers sync
  if (!toolId || toolId === "bg_remover") {
    const bgModel = document.getElementById("bg-model")?.value || "u2net";
    const bgMode = document.getElementById("bg-output-mode")?.value || "transparent";
    const bgColorWrapper = document.getElementById("bg-color-wrapper");
    const bgBlurWrapper = document.getElementById("bg-blur-wrapper");
    const fakeTransparencyOptions = document.getElementById("fake-transparency-options");

    if (bgColorWrapper) {
      bgColorWrapper.classList.toggle("d-none", bgMode !== "solid_color");
    }
    if (bgBlurWrapper) {
      bgBlurWrapper.classList.toggle("d-none", bgMode !== "blur_bg");
    }
    if (fakeTransparencyOptions) {
      fakeTransparencyOptions.classList.toggle("d-none", bgModel !== "fake_transparency");
    }

    // Sync fake transparency range readout values
    const gridTolSlider = document.getElementById("fake-grid-tolerance");
    const gridTolVal = document.getElementById("fake-grid-tolerance-val");
    if (gridTolSlider && gridTolVal) {
      gridTolVal.textContent = gridTolSlider.value;
    }
    const gapThreshSlider = document.getElementById("fake-gap-threshold");
    const gapThreshVal = document.getElementById("fake-gap-threshold-val");
    if (gapThreshSlider && gapThreshVal) {
      gapThreshVal.textContent = gapThreshSlider.value;
    }
  }

  // 7. Vectorizer mode wrappers sync
  if (!toolId || toolId === "vectorizer") {
    const vecMode = document.getElementById("vec-mode")?.value || "color";
    const vecColorsWrapper = document.getElementById("vec-colors-wrapper");
    const vecMonoWrapper = document.getElementById("vec-mono-color-wrapper");
    if (vecColorsWrapper) {
      vecColorsWrapper.classList.toggle("d-none", vecMode !== "color");
    }
    if (vecMonoWrapper) {
      vecMonoWrapper.classList.toggle("d-none", vecMode !== "monochrome");
    }
  }
}
