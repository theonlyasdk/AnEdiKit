// Universal Reusable Media Playback & Scrubbing Controller
// Usable across Trim, Audio Mastering, Video Cutters, Preview Players, etc.

import { formatSecondsToTimestamp, parseTimestampToSeconds } from "./media.js";

export class MediaPlaybackController {
  constructor(options = {}) {
    this.options = options;
    this.videoEl = options.videoEl || null;
    this.audioEl = options.audioEl || null;
    this.duration = options.duration || 0;
    this.fallbackCurrentTime = 0;
    this.simPlayInterval = null;
    this.isDragging = false;

    this.onTimeUpdateCallbacks = new Set();
    this.onStateChangeCallbacks = new Set();
    this.onDurationChangeCallbacks = new Set();

    if (this.videoEl || this.audioEl) {
      this._bindMediaEvents();
    }
  }

  setMediaElements({ videoEl, audioEl }) {
    this.videoEl = videoEl || this.videoEl;
    this.audioEl = audioEl || this.audioEl;
    this._bindMediaEvents();
  }

  setDuration(durSec) {
    this.duration = Math.max(0, durSec || 0);
    for (const cb of this.onDurationChangeCallbacks) {
      cb(this.duration);
    }
  }

  _bindMediaEvents() {
    [this.videoEl, this.audioEl].forEach((media) => {
      if (!media || media._playbackControllerBound) return;
      media._playbackControllerBound = true;

      media.addEventListener("timeupdate", () => {
        if (!isNaN(media.currentTime)) {
          this.fallbackCurrentTime = media.currentTime;
          this._notifyTimeUpdate(media.currentTime);
        }
      });

      media.addEventListener("play", () => this._notifyStateChange(true));
      media.addEventListener("pause", () => this._notifyStateChange(false));
      media.addEventListener("ended", () => this._notifyStateChange(false));
    });
  }

  getActiveMediaEl() {
    if (this.audioEl && this.audioEl.src && !this.audioEl.classList.contains("d-none")) return this.audioEl;
    if (this.videoEl && this.videoEl.src && !this.videoEl.classList.contains("d-none")) return this.videoEl;
    if (this.audioEl && this.audioEl.src) return this.audioEl;
    if (this.videoEl && this.videoEl.src) return this.videoEl;
    return null;
  }

  getCurrentTime() {
    const media = this.getActiveMediaEl();
    if (media && !isNaN(media.currentTime) && media.duration > 0) {
      return media.currentTime;
    }
    return this.fallbackCurrentTime;
  }

  setCurrentTime(timeInSec) {
    const dur = this.duration || 120;
    this.fallbackCurrentTime = Math.max(0, Math.min(dur, timeInSec));

    const media = this.getActiveMediaEl();
    if (media && !isNaN(media.duration) && media.duration > 0) {
      try {
        media.currentTime = this.fallbackCurrentTime;
      } catch (_) {}
    }

    this._notifyTimeUpdate(this.fallbackCurrentTime);
  }

  isPlaying() {
    const media = this.getActiveMediaEl();
    if (media && media.readyState >= 1) {
      return !media.paused;
    }
    return !!this.simPlayInterval;
  }

  togglePlayPause() {
    if (this.isPlaying()) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    const media = this.getActiveMediaEl();
    if (media && !media.error && media.readyState >= 1) {
      media.play().catch(() => this.startSimulatedPlayback());
    } else {
      this.startSimulatedPlayback();
    }
  }

  pause() {
    const media = this.getActiveMediaEl();
    if (media) {
      try {
        media.pause();
      } catch (_) {}
    }
    this.stopSimulatedPlayback();
  }

  step(secondsDelta) {
    const cur = this.getCurrentTime();
    this.setCurrentTime(cur + secondsDelta);
  }

  startSimulatedPlayback() {
    if (this.simPlayInterval) clearInterval(this.simPlayInterval);
    this._notifyStateChange(true);

    const dur = this.duration || 120;
    this.simPlayInterval = setInterval(() => {
      let cur = this.getCurrentTime() + 0.1;
      if (cur >= dur) {
        cur = dur;
        this.stopSimulatedPlayback();
      }
      this.setCurrentTime(cur);
    }, 100);
  }

  stopSimulatedPlayback() {
    if (this.simPlayInterval) {
      clearInterval(this.simPlayInterval);
      this.simPlayInterval = null;
    }
    this._notifyStateChange(false);
  }

  onTimeUpdate(callback) {
    if (typeof callback === "function") this.onTimeUpdateCallbacks.add(callback);
    return () => this.onTimeUpdateCallbacks.delete(callback);
  }

  onStateChange(callback) {
    if (typeof callback === "function") this.onStateChangeCallbacks.add(callback);
    return () => this.onStateChangeCallbacks.delete(callback);
  }

  onDurationChange(callback) {
    if (typeof callback === "function") this.onDurationChangeCallbacks.add(callback);
    return () => this.onDurationChangeCallbacks.delete(callback);
  }

  _notifyTimeUpdate(time) {
    for (const cb of this.onTimeUpdateCallbacks) cb(time);
  }

  _notifyStateChange(isPlaying) {
    for (const cb of this.onStateChangeCallbacks) cb(isPlaying);
  }

  /**
   * Bind standard UI controls to this playback instance
   */
  bindControls(elements = {}) {
    const {
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
      onRangeChanged,
    } = elements;

    // Sync play/pause icon
    this.onStateChange((isPlaying) => {
      if (btnPlayPause) {
        btnPlayPause.innerHTML = isPlaying
          ? '<ion-icon name="pause" id="trim-play-icon"></ion-icon> Pause'
          : '<ion-icon name="play" id="trim-play-icon"></ion-icon> Play';
      }
    });

    // Sync playhead and time display
    this.onTimeUpdate((time) => {
      if (posDisplay) {
        posDisplay.textContent = formatSecondsToTimestamp(time);
      }
      const dur = this.duration || 120;
      if (playheadEl && dur > 0) {
        const pct = Math.min(100, Math.max(0, (time / dur) * 100));
        playheadEl.style.left = `${pct}%`;
        playheadEl.style.display = "block";
      }
    });

    if (btnPlayPause) {
      btnPlayPause.addEventListener("click", () => this.togglePlayPause());
    }

    if (btnStepBack1) btnStepBack1.addEventListener("click", () => this.step(-1.0));
    if (btnStepBackFrame) btnStepBackFrame.addEventListener("click", () => this.step(-0.1));
    if (btnStepFwdFrame) btnStepFwdFrame.addEventListener("click", () => this.step(0.1));
    if (btnStepFwd1) btnStepFwd1.addEventListener("click", () => this.step(1.0));

    if (btnMarkStart && inputStart) {
      btnMarkStart.addEventListener("click", () => {
        const cur = this.getCurrentTime();
        inputStart.value = formatSecondsToTimestamp(cur);
        if (typeof onRangeChanged === "function") onRangeChanged();
      });
    }

    if (btnMarkEnd && inputEnd) {
      btnMarkEnd.addEventListener("click", () => {
        const dur = this.duration || 120;
        const cur = this.getCurrentTime() || dur;
        inputEnd.value = formatSecondsToTimestamp(cur);
        if (typeof onRangeChanged === "function") onRangeChanged();
      });
    }

    if (btnSetStart0 && inputStart) {
      btnSetStart0.addEventListener("click", () => {
        inputStart.value = "00:00:00.000";
        if (typeof onRangeChanged === "function") onRangeChanged();
        this.setCurrentTime(0);
      });
    }

    if (btnSetEndDur && inputEnd) {
      btnSetEndDur.addEventListener("click", () => {
        const dur = this.duration || 60;
        inputEnd.value = formatSecondsToTimestamp(dur);
        if (typeof onRangeChanged === "function") onRangeChanged();
      });
    }

    // Track dragging and scrubbing
    if (trackEl) {
      const seekFromPointer = (clientX) => {
        const rect = trackEl.getBoundingClientRect();
        if (rect.width <= 0) return;
        const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const pct = (clickX / rect.width) * 100;
        const dur = this.duration || 120;
        const targetTime = (pct / 100) * dur;

        this.setCurrentTime(targetTime);

        if (tooltipPlayhead) {
          tooltipPlayhead.textContent = formatSecondsToTimestamp(targetTime);
          tooltipPlayhead.style.left = `${pct}%`;
          tooltipPlayhead.classList.remove("d-none");
        }
      };

      trackEl.addEventListener("mousedown", (e) => {
        if (e.target.classList.contains("trim-range-slider")) return;
        this.isDragging = true;
        if (playheadEl) playheadEl.classList.add("active-drag");
        seekFromPointer(e.clientX);
      });

      window.addEventListener("mousemove", (e) => {
        if (this.isDragging) seekFromPointer(e.clientX);
      });

      window.addEventListener("mouseup", () => {
        if (this.isDragging) {
          this.isDragging = false;
          if (playheadEl) playheadEl.classList.remove("active-drag");
          if (tooltipPlayhead) tooltipPlayhead.classList.add("d-none");
        }
      });

      trackEl.addEventListener(
        "touchstart",
        (e) => {
          if (e.target.classList.contains("trim-range-slider")) return;
          if (e.touches && e.touches[0]) {
            this.isDragging = true;
            if (playheadEl) playheadEl.classList.add("active-drag");
            seekFromPointer(e.touches[0].clientX);
          }
        },
        { passive: true },
      );

      window.addEventListener(
        "touchmove",
        (e) => {
          if (this.isDragging && e.touches && e.touches[0]) {
            seekFromPointer(e.touches[0].clientX);
          }
        },
        { passive: true },
      );

      window.addEventListener("touchend", () => {
        if (this.isDragging) {
          this.isDragging = false;
          if (playheadEl) playheadEl.classList.remove("active-drag");
          if (tooltipPlayhead) tooltipPlayhead.classList.add("d-none");
        }
      });
    }
  }
}

export const sharedPlaybackController = new MediaPlaybackController();
