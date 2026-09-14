// Trimmer Seekbar, Filmstrip Timeline & Live Preview Controller Module
import { generateWaveformFromSource, renderWaveformToCanvas } from "./waveform.js";
import { sharedPlaybackController } from "./playback.js";
import { getCurrentMediaInfo, getCurrentInputFile } from "./media.js";

let currentWaveformPeaks = null;
let currentTimelineExtractToken = 0;

export function formatSecondsToTimestamp(seconds) {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

export function parseTimestampToSeconds(ts) {
  if (!ts) return 0;
  const parts = ts.trim().split(":");
  if (parts.length === 3) {
    const h = parseFloat(parts[0]) || 0;
    const m = parseFloat(parts[1]) || 0;
    const s = parseFloat(parts[2]) || 0;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const m = parseFloat(parts[0]) || 0;
    const s = parseFloat(parts[1]) || 0;
    return m * 60 + s;
  }
  return parseFloat(ts) || 0;
}

export function refreshWaveformDisplay(peaks = null) {
  if (peaks) {
    currentWaveformPeaks = peaks;
  }
  const waveformCanvas = document.getElementById("trim-waveform-canvas");
  if (!waveformCanvas || !currentWaveformPeaks) return;
  const currentMediaInfo = getCurrentMediaInfo();
  const dur = currentMediaInfo?.duration_seconds || 120;
  const inputStart = document.getElementById("trim-start");
  const inputEnd = document.getElementById("trim-end");
  const startSec = parseTimestampToSeconds(inputStart?.value);
  const endSec = parseTimestampToSeconds(inputEnd?.value) || dur;
  const startPct = Math.min(100, Math.max(0, (startSec / dur) * 100));
  const endPct = Math.min(100, Math.max(0, (endSec / dur) * 100));

  renderWaveformToCanvas(waveformCanvas, currentWaveformPeaks, {
    startPct,
    endPct,
  });
}

export function isAudioFile(filePath) {
  if (!filePath) return false;
  const ext = filePath.split(/[?#]/)[0].split(".").pop().toLowerCase();
  return ["mp3", "wav", "flac", "m4a", "ogg", "opus", "wma", "aac", "aiff", "alac"].includes(ext);
}

export function isImageFile(filePath) {
  if (!filePath) return false;
  const ext = filePath.split(/[?#]/)[0].split(".").pop().toLowerCase();
  return ["png", "jpg", "jpeg", "webp", "bmp", "tiff", "gif", "svg", "ico"].includes(ext);
}

export function isVideoFile(filePath) {
  if (!filePath) return false;
  return !isAudioFile(filePath) && !isImageFile(filePath);
}

export async function extractTimelineThumbnailsAsync(filePath, duration) {
  const container = document.getElementById("trim-filmstrip-container");
  const waveformCanvas = document.getElementById("trim-waveform-canvas");
  if (!container || !filePath) return;

  const thisToken = ++currentTimelineExtractToken;
  // A file is actually loading now: swap the idle prompt for the shimmer.
  const pendingEl = document.getElementById("trim-filmstrip-empty");
  if (pendingEl && !pendingEl.classList.contains("d-none")) {
    pendingEl.innerHTML = '<span class="text-shimmer"><ion-icon name="film-outline" class="me-2"></ion-icon> Preparing preview...</span>';
  }
  const currentMediaInfo = getCurrentMediaInfo();
  const isAudio = isAudioFile(filePath) || currentMediaInfo?.video_codec === "None" || currentMediaInfo?.resolution === "N/A";
  const isImage = isImageFile(filePath);

  if (isImage) {
    const emptyEl = document.getElementById("trim-filmstrip-empty");
    const unsupportedEl = document.getElementById("trim-filmstrip-unsupported");
    if (emptyEl) {
      emptyEl.classList.add("d-none");
      emptyEl.classList.remove("d-flex");
    }
    if (unsupportedEl) {
      unsupportedEl.classList.remove("d-none");
      unsupportedEl.classList.add("d-flex");
    }
    if (waveformCanvas) waveformCanvas.classList.add("d-none");
    return;
  }

  if (isAudio) {
    container.innerHTML = "";
    if (waveformCanvas) {
      waveformCanvas.classList.remove("d-none");
    }
    const targetAudioPath = filePath || getCurrentInputFile();
    if (targetAudioPath) {
      generateWaveformFromSource(targetAudioPath)
        .then((peaks) => {
          if (thisToken !== currentTimelineExtractToken) return;
          currentWaveformPeaks = peaks;
          refreshWaveformDisplay(peaks);
        })
        .catch((err) => console.warn("Waveform generation failed:", err));
    }
    return;
  }

  if (waveformCanvas) waveformCanvas.classList.add("d-none");

  const frameCount = 12;
  const dur = Math.max(0.5, duration || 10.0);

  // Render individual frame slot placeholders for live progressive feedback
  let slotsHtml = "";
  for (let i = 0; i < frameCount; i++) {
    slotsHtml += `
      <div id="trim-slot-${i}" class="trim-timeline-frame-slot d-flex align-items-center justify-content-center bg-black bg-opacity-75 text-secondary position-relative overflow-hidden" style="flex: 1 1 0px; height: 100%; min-width: 0; border-right: 1px solid rgba(0,0,0,0.5);">
        <span class="spinner-border spinner-border-sm opacity-25" style="width: 0.85rem; height: 0.85rem;"></span>
      </div>
    `;
  }
  container.innerHTML = slotsHtml;

  if (window.__TAURI__?.core?.invoke) {
    // Extract frames with live progressive frame-by-frame updates
    for (let i = 0; i < frameCount; i++) {
      const ts = dur * ((i + 0.5) / frameCount);
      window.__TAURI__.core.invoke("extract_timeline_frame", {
        filePath,
        frameIndex: i + 1,
        timestampSeconds: ts,
      }).then((dataUri) => {
        if (thisToken !== currentTimelineExtractToken) return;
        const slotEl = document.getElementById(`trim-slot-${i}`);
        if (slotEl && dataUri) {
          slotEl.innerHTML = `<img class="trim-timeline-frame-item w-100 h-100 object-fit-cover" src="${dataUri}" alt="Frame ${i + 1}" />`;
        }
      }).catch((err) => {
        console.warn(`Frame ${i + 1} extraction error:`, err);
      });
    }
    return;
  }

  // Fallback if in web mode
  container.innerHTML = `
    <div class="w-100 h-100 d-flex align-items-center justify-content-center text-body-secondary small">
      <ion-icon name="film-outline" class="me-2"></ion-icon> Video Timeline
    </div>
  `;
}

export function syncMediaDurationToTools(mediaInfo) {
  if (!mediaInfo) return;
  const durSec = mediaInfo.duration_seconds || 60;
  const durStr = mediaInfo.duration_string || "00:01:00";
  const formattedDur = durStr.includes(".") ? durStr : `${durStr}.000`;

  sharedPlaybackController.setDuration(durSec);
  sharedPlaybackController.setCurrentTime(0);

  const trimStart = document.getElementById("trim-start");
  const trimEnd = document.getElementById("trim-end");
  const trimPos = document.getElementById("trim-current-pos");
  const trimDur = document.getElementById("trim-clip-dur");
  const sliderStart = document.getElementById("trim-slider-start");
  const sliderEnd = document.getElementById("trim-slider-end");

  const dimmerLeft = document.getElementById("trim-dimmer-left");
  const dimmerRight = document.getElementById("trim-dimmer-right");
  const selectionWindow = document.getElementById("trim-selection-window");
  const playhead = document.getElementById("trim-playhead");

  const scaleStart = document.getElementById("trim-scale-start");
  const scaleMid = document.getElementById("trim-scale-mid");
  const scaleEnd = document.getElementById("trim-scale-end");

  if (trimStart) trimStart.value = "00:00:00.000";
  if (trimEnd) trimEnd.value = formattedDur;
  if (trimPos) trimPos.textContent = "00:00:00.000";
  if (trimDur) trimDur.textContent = formattedDur;
  if (sliderStart) sliderStart.value = "0";
  if (sliderEnd) sliderEnd.value = "100";

  if (dimmerLeft) dimmerLeft.style.width = "0%";
  if (dimmerRight) dimmerRight.style.width = "0%";
  if (selectionWindow) {
    selectionWindow.style.left = "0%";
    selectionWindow.style.width = "100%";
  }
  if (playhead) {
    playhead.style.left = "0%";
    playhead.style.display = "block";
  }

  if (scaleStart) scaleStart.textContent = "00:00:00.000";
  if (scaleMid) scaleMid.textContent = formatSecondsToTimestamp(durSec / 2);
  const filmstripEmpty = document.getElementById("trim-filmstrip-empty");
  const filmstripUnsupported = document.getElementById("trim-filmstrip-unsupported");
  const trimControlsCard = document.getElementById("trim-controls-card");
  const isImage = isImageFile(mediaInfo.file_path);
  const isUnsupported = isImage || (mediaInfo.duration_seconds <= 0 && mediaInfo.video_codec === "None" && mediaInfo.audio_codec === "None");

  if (isUnsupported) {
    if (filmstripEmpty) {
      filmstripEmpty.classList.add("d-none");
      filmstripEmpty.classList.remove("d-flex");
    }
    if (filmstripUnsupported) {
      filmstripUnsupported.classList.remove("d-none");
      filmstripUnsupported.classList.add("d-flex");
    }
    if (trimControlsCard) {
      trimControlsCard.classList.add("opacity-50", "pe-none");
    }
    if (trimStart) trimStart.disabled = true;
    if (trimEnd) trimEnd.disabled = true;
    const trimMode = document.getElementById("trim-mode");
    if (trimMode) trimMode.disabled = true;
  } else {
    if (filmstripUnsupported) {
      filmstripUnsupported.classList.add("d-none");
      filmstripUnsupported.classList.remove("d-flex");
    }
    if (trimControlsCard) {
      trimControlsCard.classList.remove("opacity-50", "pe-none");
    }
    if (trimStart) trimStart.disabled = false;
    if (trimEnd) trimEnd.disabled = false;
    const trimMode = document.getElementById("trim-mode");
    if (trimMode) trimMode.disabled = false;
  }

  if (mediaInfo.file_path && !isUnsupported) {
    extractTimelineThumbnailsAsync(mediaInfo.file_path, durSec);
  }

  refreshWaveformDisplay();
}

export function initTrimmerControls() {
  const sliderStart = document.getElementById("trim-slider-start");
  const sliderEnd = document.getElementById("trim-slider-end");
  const inputStart = document.getElementById("trim-start");
  const inputEnd = document.getElementById("trim-end");
  const posDisplay = document.getElementById("trim-current-pos");
  const clipDurBadge = document.getElementById("trim-clip-dur");
  const videoEl = document.getElementById("media-video-preview");
  const audioEl = document.getElementById("media-audio-preview");

  const btnPlayPause = document.getElementById("btn-trim-play-pause");
  const btnMarkStart = document.getElementById("btn-trim-mark-start");
  const btnMarkEnd = document.getElementById("btn-trim-mark-end");
  const btnStepBack1 = document.getElementById("btn-trim-step-back-1");
  const btnStepBackFrame = document.getElementById("btn-trim-step-back-frame");
  const btnStepFwdFrame = document.getElementById("btn-trim-step-fwd-frame");
  const btnStepFwd1 = document.getElementById("btn-trim-step-fwd-1");
  const btnPreviewSegment = document.getElementById("btn-trim-preview-segment");
  const btnSetStart0 = document.getElementById("btn-trim-set-start-0");
  const btnSetEndDur = document.getElementById("btn-trim-set-end-dur");
  const playheadEl = document.getElementById("trim-playhead");
  const trackEl = document.getElementById("trim-timeline-track");
  const tooltipPlayhead = document.getElementById("trim-tooltip-playhead");
  const tooltipStart = document.getElementById("trim-tooltip-start");
  const tooltipEnd = document.getElementById("trim-tooltip-end");

  sharedPlaybackController.setMediaElements({ videoEl, audioEl });

  const updateRangeBarUI = (startSec, endSec, totalDur) => {
    if (totalDur <= 0) totalDur = 1;
    const startPct = Math.min(100, Math.max(0, (startSec / totalDur) * 100));
    const endPct = Math.min(100, Math.max(0, (endSec / totalDur) * 100));
    const widthPct = Math.max(0, endPct - startPct);

    const dimmerLeft = document.getElementById("trim-dimmer-left");
    const dimmerRight = document.getElementById("trim-dimmer-right");
    const selectionWindow = document.getElementById("trim-selection-window");

    if (dimmerLeft) dimmerLeft.style.width = `${startPct}%`;
    if (dimmerRight) dimmerRight.style.width = `${Math.max(0, 100 - endPct)}%`;
    if (selectionWindow) {
      selectionWindow.style.left = `${startPct}%`;
      selectionWindow.style.width = `${widthPct}%`;
    }

    if (sliderStart) sliderStart.value = startPct.toString();
    if (sliderEnd) sliderEnd.value = endPct.toString();

    const diff = Math.max(0, endSec - startSec);
    if (clipDurBadge) clipDurBadge.textContent = formatSecondsToTimestamp(diff);

    refreshWaveformDisplay();
  };

  const showTooltip = (el, text, pct) => {
    if (!el) return;
    el.textContent = text;
    el.style.left = `${pct}%`;
    el.classList.remove("d-none");
  };

  const hideTooltip = (el) => {
    if (!el) return;
    el.classList.add("d-none");
  };

  const onTimestampInputsChanged = () => {
    const currentMediaInfo = getCurrentMediaInfo();
    const dur = currentMediaInfo?.duration_seconds || 120;
    const startSec = parseTimestampToSeconds(inputStart?.value);
    const endSec = parseTimestampToSeconds(inputEnd?.value) || dur;
    updateRangeBarUI(startSec, endSec, dur);
  };

  if (inputStart) inputStart.addEventListener("input", onTimestampInputsChanged);
  if (inputEnd) inputEnd.addEventListener("input", onTimestampInputsChanged);

  const stopSliderProp = (e) => e.stopPropagation();

  if (sliderStart) {
    sliderStart.addEventListener("mousedown", stopSliderProp);
    sliderStart.addEventListener("touchstart", stopSliderProp, { passive: true });
    sliderStart.addEventListener("pointerdown", stopSliderProp);

    sliderStart.addEventListener("input", (e) => {
      e.stopPropagation();
      const currentMediaInfo = getCurrentMediaInfo();
      const dur = currentMediaInfo?.duration_seconds || 120;
      let startVal = parseFloat(sliderStart.value);
      let endVal = parseFloat(sliderEnd ? sliderEnd.value : 100);
      if (startVal > endVal) {
        startVal = endVal;
        sliderStart.value = startVal.toString();
      }
      const startSec = (startVal / 100) * dur;
      const endSec = (endVal / 100) * dur;

      if (inputStart) inputStart.value = formatSecondsToTimestamp(startSec);
      updateRangeBarUI(startSec, endSec, dur);
      showTooltip(tooltipStart, formatSecondsToTimestamp(startSec), startVal);
    });
    sliderStart.addEventListener("pointerdown", () => {
      const currentMediaInfo = getCurrentMediaInfo();
      const dur = currentMediaInfo?.duration_seconds || 120;
      const startVal = parseFloat(sliderStart.value);
      const startSec = (startVal / 100) * dur;
      showTooltip(tooltipStart, formatSecondsToTimestamp(startSec), startVal);
    });
    sliderStart.addEventListener("pointerup", () => hideTooltip(tooltipStart));
    sliderStart.addEventListener("pointercancel", () => hideTooltip(tooltipStart));
    sliderStart.addEventListener("blur", () => hideTooltip(tooltipStart));
  }

  if (sliderEnd) {
    sliderEnd.addEventListener("mousedown", stopSliderProp);
    sliderEnd.addEventListener("touchstart", stopSliderProp, { passive: true });
    sliderEnd.addEventListener("pointerdown", stopSliderProp);

    sliderEnd.addEventListener("input", (e) => {
      e.stopPropagation();
      const currentMediaInfo = getCurrentMediaInfo();
      const dur = currentMediaInfo?.duration_seconds || 120;
      let startVal = parseFloat(sliderStart ? sliderStart.value : 0);
      let endVal = parseFloat(sliderEnd.value);
      if (endVal < startVal) {
        endVal = startVal;
        sliderEnd.value = endVal.toString();
      }
      const startSec = (startVal / 100) * dur;
      const endSec = (endVal / 100) * dur;

      if (inputEnd) inputEnd.value = formatSecondsToTimestamp(endSec);
      updateRangeBarUI(startSec, endSec, dur);
      showTooltip(tooltipEnd, formatSecondsToTimestamp(endSec), endVal);
    });
    sliderEnd.addEventListener("pointerdown", () => {
      const currentMediaInfo = getCurrentMediaInfo();
      const dur = currentMediaInfo?.duration_seconds || 120;
      const endVal = parseFloat(sliderEnd.value);
      const endSec = (endVal / 100) * dur;
      showTooltip(tooltipEnd, formatSecondsToTimestamp(endSec), endVal);
    });
    sliderEnd.addEventListener("pointerup", () => hideTooltip(tooltipEnd));
    sliderEnd.addEventListener("pointercancel", () => hideTooltip(tooltipEnd));
    sliderEnd.addEventListener("blur", () => hideTooltip(tooltipEnd));
  }

  // Bind full playback controls to sharedPlaybackController
  sharedPlaybackController.bindControls({
    btnPlayPause,
    posDisplay,
    playheadEl,
    trackEl,
    inputStart,
    inputEnd,
    tooltipPlayhead,
    btnMarkStart,
    btnMarkEnd,
    btnStepBack1,
    btnStepBackFrame,
    btnStepFwdFrame,
    btnStepFwd1,
    btnSetStart0,
    btnSetEndDur,
    onRangeChanged: onTimestampInputsChanged,
  });

  if (btnPreviewSegment) {
    btnPreviewSegment.addEventListener("click", () => {
      const currentMediaInfo = getCurrentMediaInfo();
      const dur = currentMediaInfo?.duration_seconds || 120;
      const startSec = parseTimestampToSeconds(inputStart?.value);
      const endSec = parseTimestampToSeconds(inputEnd?.value) || dur;
      sharedPlaybackController.setCurrentTime(startSec);
      sharedPlaybackController.play();

      const unsubscribe = sharedPlaybackController.onTimeUpdate((time) => {
        if (time >= endSec) {
          sharedPlaybackController.pause();
          unsubscribe();
        }
      });
    });
  }
}
