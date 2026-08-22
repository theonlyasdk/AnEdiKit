// Audio Waveform Generation and Rendering Module
// Reusable across trim, audio mastering, visual previews, and cutters

let sharedAudioCtx = null;
const waveformCache = new Map();

function getAudioContext() {
  if (!sharedAudioCtx) {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (AudioCtxClass) {
      sharedAudioCtx = new AudioCtxClass();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/**
 * Generate normalized waveform peaks (0.0 to 1.0) from an AudioBuffer.
 */
export function extractPeaksFromAudioBuffer(audioBuffer, numSamples = 240) {
  if (!audioBuffer) return [];
  const numChannels = audioBuffer.numberOfChannels;
  const totalLength = audioBuffer.length;
  const blockSize = Math.floor(totalLength / numSamples);
  const peaks = new Float32Array(numSamples);

  for (let c = 0; c < numChannels; c++) {
    const channelData = audioBuffer.getChannelData(c);
    for (let i = 0; i < numSamples; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, totalLength);
      let maxVal = 0;
      for (let j = start; j < end; j++) {
        const val = Math.abs(channelData[j]);
        if (val > maxVal) maxVal = val;
      }
      if (maxVal > peaks[i]) {
        peaks[i] = maxVal;
      }
    }
  }

  // Normalize peaks so highest peak is 1.0 (with a reasonable minimum)
  let maxPeak = 0;
  for (let i = 0; i < numSamples; i++) {
    if (peaks[i] > maxPeak) maxPeak = peaks[i];
  }
  const scale = maxPeak > 0.01 ? 1.0 / maxPeak : 1.0;
  for (let i = 0; i < numSamples; i++) {
    peaks[i] = Math.min(1.0, peaks[i] * scale);
  }

  return Array.from(peaks);
}

/**
 * Synthetic waveform fallback for non-decodable audio or simulated previews.
 */
export function generateSyntheticWaveform(numSamples = 240, seed = "anedikit") {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const peaks = [];
  let prev = 0.4;
  for (let i = 0; i < numSamples; i++) {
    const pseudoRandom = Math.abs(Math.sin((i + hash) * 12.9898 + (hash % 100)) * 43758.5453) % 1;
    // Natural audio-like envelope and fluctuation
    const env = Math.sin((i / numSamples) * Math.PI) * 0.4 + 0.5;
    const val = prev * 0.4 + (pseudoRandom * 0.7 + 0.15) * 0.6 * env;
    prev = val;
    peaks.push(Math.max(0.08, Math.min(1.0, val)));
  }
  return peaks;
}

/**
 * Fetch and decode audio to generate normalized waveform data.
 */
export async function generateWaveformFromSource(urlOrPath, numSamples = 240) {
  if (!urlOrPath) return generateSyntheticWaveform(numSamples);

  if (waveformCache.has(urlOrPath)) {
    return waveformCache.get(urlOrPath);
  }

  try {
    let fetchUrl = urlOrPath;
    if (window.__TAURI__?.core?.convertFileSrc && !urlOrPath.startsWith("http") && !urlOrPath.startsWith("blob:") && !urlOrPath.startsWith("asset:")) {
      fetchUrl = window.__TAURI__.core.convertFileSrc(urlOrPath);
    }

    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`HTTP fetch error ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();

    const audioCtx = getAudioContext();
    if (!audioCtx) throw new Error("AudioContext not available");

    const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const peaks = extractPeaksFromAudioBuffer(decodedBuffer, numSamples);
    waveformCache.set(urlOrPath, peaks);
    return peaks;
  } catch (err) {
    console.warn("Waveform audio decode failed, using synthetic envelope:", err);
    const synthetic = generateSyntheticWaveform(numSamples, urlOrPath);
    waveformCache.set(urlOrPath, synthetic);
    return synthetic;
  }
}

/**
 * Render a waveform into a canvas element with optional highlight range and playhead.
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} peaks
 * @param {Object} options
 * @param {number} options.startPct (0 to 100)
 * @param {number} options.endPct (0 to 100)
 * @param {number} options.playheadPct (0 to 100, optional)
 * @param {string} options.primaryColor
 * @param {string} options.mutedColor
 * @param {string} options.barWidth
 * @param {string} options.gap
 */
export function renderWaveformToCanvas(canvas, peaks, options = {}) {
  if (!canvas || !peaks || peaks.length === 0) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.max(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(10, rect.width || canvas.width || 300);
  const height = Math.max(10, rect.height || canvas.height || 68);

  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const startPct = options.startPct !== undefined ? options.startPct : 0;
  const endPct = options.endPct !== undefined ? options.endPct : 100;
  const playheadPct = options.playheadPct !== undefined ? options.playheadPct : -1;

  // Resolve theme colors
  const computedStyle = getComputedStyle(document.body);
  const primaryColor = options.primaryColor || computedStyle.getPropertyValue("--bs-primary").trim() || "#0d6efd";
  const mutedColor = options.mutedColor || computedStyle.getPropertyValue("--bs-secondary-color").trim() || "rgba(108, 117, 125, 0.4)";
  const activeColor = primaryColor;

  // High density: strictly 2px bar width with 1px equal gap
  const barWidth = 2;
  const gap = 1;
  const barPitch = barWidth + gap;
  const numBars = Math.max(10, Math.floor(width / barPitch));
  const leftOffset = Math.max(0, (width - (numBars * barPitch - gap)) / 2);

  const centerY = height / 2;
  const maxBarHalfHeight = (height / 2) - 3;

  for (let i = 0; i < numBars; i++) {
    const x = leftOffset + i * barPitch;
    const barProgress = (i / (numBars - 1)) * 100;
    const isSelected = barProgress >= startPct && barProgress <= endPct;

    const peakIdx = Math.min(peaks.length - 1, Math.floor((i / numBars) * peaks.length));
    const peak = peaks[peakIdx] || 0.08;
    const halfHeight = Math.max(2, peak * maxBarHalfHeight);

    ctx.fillStyle = isSelected ? activeColor : mutedColor;

    // Draw symmetric 2px wide, 2px rounded vertical pill
    const barTop = centerY - halfHeight;
    const barH = halfHeight * 2;

    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, barTop, barWidth, barH, 2);
    } else {
      const r = 1;
      ctx.moveTo(x + r, barTop);
      ctx.arcTo(x + barWidth, barTop, x + barWidth, barTop + barH, r);
      ctx.arcTo(x + barWidth, barTop + barH, x, barTop + barH, r);
      ctx.arcTo(x, barTop + barH, x, barTop, r);
      ctx.arcTo(x, barTop, x + barWidth, barTop, r);
      ctx.closePath();
    }
    ctx.fill();
  }

  // Draw playhead position if provided
  if (playheadPct >= 0 && playheadPct <= 100) {
    const playX = (playheadPct / 100) * width;
    ctx.fillStyle = "#ff3b30";
    ctx.fillRect(playX - 1, 0, 2, height);
  }

  ctx.restore();
}
