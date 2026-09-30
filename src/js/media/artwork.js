// AnEdiKit - Album art / action-frame extraction + thumbnail crossfades.
const actionFrameCache = new Map();
const albumArtCache = new Map();

export { actionFrameCache, albumArtCache };

export function renderMarqueeSongTitle(titleText) {
  const audioTitle = document.getElementById("audio-art-title");
  if (!audioTitle) return;
  const safeText = titleText || "Audio Track";
  if (safeText.length > 20) {
    audioTitle.innerHTML = `
      <div class="marquee-scroll-wrap">
        <span class="me-4">${safeText}</span>
        <span class="me-4">${safeText}</span>
      </div>
    `;
  } else {
    audioTitle.textContent = safeText;
  }
}

export async function extractAlbumArtAsync(filePath) {
  if (!filePath) return null;
  if (albumArtCache.has(filePath)) {
    return albumArtCache.get(filePath);
  }
  if (window.__TAURI__?.core?.invoke) {
    try {
      const dataUri = await window.__TAURI__.core.invoke("extract_album_art", {
        filePath,
      });
      if (dataUri) {
        albumArtCache.set(filePath, dataUri);
        return dataUri;
      }
    } catch (err) {
      console.warn("extract_album_art failed:", err);
    }
  }
  return null;
}


export async function extractActionFrameAsync(filePath, durationSec = 10) {
  if (!filePath) return null;
  if (actionFrameCache.has(filePath)) {
    return actionFrameCache.get(filePath);
  }
  if (window.__TAURI__?.core?.invoke) {
    try {
      const dataUri = await window.__TAURI__.core.invoke("extract_action_frame", {
        filePath,
        durationSeconds: durationSec || 10.0,
      });
      if (dataUri) {
        actionFrameCache.set(filePath, dataUri);
        return dataUri;
      }
    } catch (err) {
      console.warn("extract_action_frame failed:", err);
    }
  }
  return null;
}


export function crossfadeVideoThumbnail(newSrc) {
  const currentImg = document.getElementById("video-action-frame-img");
  const prevImg = document.getElementById("video-action-frame-prev");
  const fallback = document.getElementById("video-preview-fallback");
  const overlay = document.getElementById("video-overlay-info");

  if (!currentImg) return;

  if (!newSrc) {
    currentImg.classList.add("d-none");
    currentImg.classList.remove("thumb-visible");
    if (prevImg) prevImg.classList.add("d-none");
    if (fallback) fallback.classList.remove("d-none");
    return;
  }

  if (fallback) fallback.classList.add("d-none");
  if (overlay) overlay.classList.remove("d-none");

  const oldSrc = currentImg.getAttribute("src");
  if (oldSrc && oldSrc !== newSrc && prevImg) {
    prevImg.src = oldSrc;
    prevImg.classList.remove("d-none");
  }

  currentImg.classList.remove("thumb-visible");
  currentImg.classList.remove("d-none");
  currentImg.src = newSrc;

  requestAnimationFrame(() => {
    currentImg.classList.add("thumb-visible");
    setTimeout(() => {
      if (prevImg) prevImg.classList.add("d-none");
    }, 400);
  });
}


export function crossfadeAudioThumbnail(newSrc) {
  const currentImg = document.getElementById("audio-art-img");
  const prevImg = document.getElementById("audio-art-prev");
  const cdSpinner = document.getElementById("audio-cd-spinner");
  const fallbackIcon = document.getElementById("audio-fallback-icon");

  if (cdSpinner) cdSpinner.classList.add("d-none");

  if (!currentImg) return;

  if (!newSrc) {
    currentImg.classList.add("d-none");
    currentImg.classList.remove("thumb-visible");
    if (prevImg) prevImg.classList.add("d-none");
    if (fallbackIcon) fallbackIcon.classList.remove("d-none");
    return;
  }

  if (fallbackIcon) fallbackIcon.classList.add("d-none");

  const oldSrc = currentImg.getAttribute("src");
  if (oldSrc && oldSrc !== newSrc && prevImg) {
    prevImg.src = oldSrc;
    prevImg.classList.remove("d-none");
  }

  currentImg.classList.remove("thumb-visible");
  currentImg.classList.remove("d-none");
  currentImg.src = newSrc;

  requestAnimationFrame(() => {
    currentImg.classList.add("thumb-visible");
    setTimeout(() => {
      if (prevImg) prevImg.classList.add("d-none");
    }, 400);
  });
}
