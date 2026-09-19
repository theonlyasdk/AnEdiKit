// AnEdiKit - Playlist Download Handling Submodule

let playlistVideos = [];
let isFetchingPlaylist = false;
let fetchedPlaylistUrl = "";
// Chunked playlist rendering: rows per frame slice + invalidation token.
const PLAYLIST_RENDER_CHUNK = 100;
let playlistRenderToken = 0;
let updateCallback = null;

export function getPlaylistVideos() {
  return playlistVideos;
}

export function setPlaylistVideos(videos) {
  playlistVideos = Array.isArray(videos) ? [...videos] : [];
}

export function isPlaylistFetching() {
  return isFetchingPlaylist;
}

export function getFetchedPlaylistUrl() {
  return fetchedPlaylistUrl;
}

export function setFetchedPlaylistUrl(url) {
  fetchedPlaylistUrl = typeof url === "string" ? url : "";
}

export function clearPlaylist() {
  playlistVideos = [];
  fetchedPlaylistUrl = "";
  const panel = document.getElementById("playlist-entries-panel");
  if (panel) panel.classList.add("d-none");
  const list = document.getElementById("playlist-entries-list");
  if (list) list.innerHTML = "";
}

function notifyUpdate() {
  if (typeof updateCallback === "function") {
    updateCallback();
  }
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function playlistRowHtml(item) {
  const title = escapeHtml(item.title);
  const url = escapeHtml(item.url);
  const duration = escapeHtml(item.duration_string || "");
  return `
    <label class="list-group-item d-flex align-items-center gap-3 py-2 text-start" style="cursor: pointer;">
      <input class="form-check-input flex-shrink-0 mt-0 playlist-item-check" type="checkbox" data-index="${item.index}" ${item.checked ? "checked" : ""} />
      <div class="flex-grow-1 text-truncate">
        <div class="d-flex align-items-center justify-content-between gap-2">
          <div class="fw-medium text-body text-truncate mb-0" title="${title}">${item.index}. ${title}</div>
          ${item.duration_string ? `<span class="badge text-bg-secondary flex-shrink-0 font-monospace">${duration}</span>` : ""}
        </div>
        <div class="text-body-secondary small text-truncate" style="font-size: 0.75rem;">${url}</div>
      </div>
    </label>
  `;
}

export function renderPlaylistEntries() {
  const container = document.getElementById("playlist-entries-panel");
  const list = document.getElementById("playlist-entries-list");

  if (!container || !list) return;

  if (playlistVideos.length === 0) {
    // Invalidate any in-flight chunked render before clearing.
    playlistRenderToken++;
    container.classList.add("d-none");
    list.innerHTML = "";
    return;
  }

  container.classList.remove("d-none");

  const sortSelect = document.getElementById("playlist-sort-select");
  const sortMode = sortSelect ? sortSelect.value : "original";
  const sorted = [...playlistVideos].sort((a, b) => {
    if (sortMode === "title_asc") return a.title.localeCompare(b.title);
    if (sortMode === "title_desc") return b.title.localeCompare(a.title);
    if (sortMode === "dur_asc") return (a.duration || 0) - (b.duration || 0);
    if (sortMode === "dur_desc") return (b.duration || 0) - (a.duration || 0);
    return a.index - b.index;
  });

  refreshPlaylistCounts();

  // Chunked render: a big playlist built via one giant innerHTML blocks the
  // event loop for seconds (input stalls while content keeps painting).
  // First chunk paints synchronously, the rest yield per frame; a token
  // drops stale chunks when a newer render supersedes them.
  const token = ++playlistRenderToken;
  const renderChunk = (start) => {
    if (token !== playlistRenderToken) return;
    const end = Math.min(start + PLAYLIST_RENDER_CHUNK, sorted.length);
    let html = "";
    for (let i = start; i < end; i++) html += playlistRowHtml(sorted[i]);
    if (start === 0) {
      list.innerHTML = html;
    } else {
      list.insertAdjacentHTML("beforeend", html);
    }
    if (end < sorted.length) {
      requestAnimationFrame(() => renderChunk(end));
    }
  };
  renderChunk(0);
  bindPlaylistListOnce(list);
}

export function refreshPlaylistCounts() {
  const selectedCountEl = document.getElementById("playlist-selected-count");
  const totalCountEl = document.getElementById("playlist-total-count");
  const toggleAllBtn = document.getElementById("btn-playlist-toggle-all");
  const selectedCount = playlistVideos.filter((v) => v.checked).length;
  if (selectedCountEl) selectedCountEl.textContent = selectedCount;
  if (totalCountEl) totalCountEl.textContent = playlistVideos.length;
  if (toggleAllBtn) {
    toggleAllBtn.textContent = selectedCount === playlistVideos.length ? "Deselect All" : "Select All";
  }
}

// Single delegated change listener (bound once): replaces N per-checkbox
// listeners that were re-attached on every render.
function bindPlaylistListOnce(list) {
  if (!list || list.dataset.playlistBound === "1") return;
  list.dataset.playlistBound = "1";
  list.addEventListener("change", (e) => {
    const chk = e.target && e.target.closest ? e.target.closest(".playlist-item-check") : null;
    if (!chk || !list.contains(chk)) return;
    const idx = parseInt(chk.dataset.index, 10);
    const target = playlistVideos.find((v) => v.index === idx);
    if (target) {
      target.checked = chk.checked;
    }
    refreshPlaylistCounts();
    notifyUpdate();
  });
}

export async function fetchPlaylistVideosHandler(onUpdate = null) {
  if (onUpdate) updateCallback = onUpdate;
  const urlInput = document.getElementById("ytdlp-url-input");
  const url = urlInput?.value?.trim();
  if (!url) return;

  isFetchingPlaylist = true;
  notifyUpdate();

  const statusMsg = document.getElementById("status-message");
  if (statusMsg) statusMsg.textContent = "Fetching playlist items...";

  try {
    if (window.__TAURI__?.core?.invoke) {
      const results = await window.__TAURI__.core.invoke("fetch_playlist_videos", { url });
      if (results && results.length > 0) {
        playlistVideos = results.map((v) => ({ ...v, checked: true }));
        fetchedPlaylistUrl = url;
        renderPlaylistEntries();
        if (statusMsg) statusMsg.textContent = `Found ${results.length} videos in playlist`;
      } else {
        if (statusMsg) statusMsg.textContent = "No videos found in playlist";
      }
    } else {
      // Mock for web preview
      playlistVideos = Array.from({ length: 8 }, (_, i) => ({
        index: i + 1,
        id: `vid_${i + 1}`,
        title: `Video Item ${i + 1}: Sample Video Title for Download`,
        url: `https://www.youtube.com/watch?v=sample_${i + 1}`,
        duration: (i + 1) * 150,
        duration_string: `0${i + 2}:30`,
        checked: true,
      }));
      fetchedPlaylistUrl = url;
      renderPlaylistEntries();
      if (statusMsg) statusMsg.textContent = "Found 8 videos in playlist";
    }
  } catch (err) {
    console.warn("fetch_playlist_videos error:", err);
    if (statusMsg) statusMsg.textContent = `Fetch error: ${err}`;
  } finally {
    isFetchingPlaylist = false;
    notifyUpdate();
  }
}

export function initPlaylistControls(onUpdated = null) {
  if (onUpdated) updateCallback = onUpdated;

  const sortSelect = document.getElementById("playlist-sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      renderPlaylistEntries();
    });
  }

  const toggleAllBtn = document.getElementById("btn-playlist-toggle-all");
  if (toggleAllBtn) {
    toggleAllBtn.addEventListener("click", () => {
      const allChecked = playlistVideos.length > 0 && playlistVideos.every((v) => v.checked);
      playlistVideos.forEach((v) => (v.checked = !allChecked));
      renderPlaylistEntries();
      notifyUpdate();
    });
  }

  const btnClearUrl = document.getElementById("btn-clear-url");
  const ytdlpUrlInput = document.getElementById("ytdlp-url-input");

  if (btnClearUrl && ytdlpUrlInput) {
    btnClearUrl.addEventListener("click", () => {
      ytdlpUrlInput.value = "";
      clearPlaylist();
      notifyUpdate();
    });
  }

  if (ytdlpUrlInput) {
    ytdlpUrlInput.addEventListener("input", () => {
      const currentUrl = ytdlpUrlInput.value.trim();
      if (currentUrl !== fetchedPlaylistUrl) {
        clearPlaylist();
      }
      notifyUpdate();
    });
  }
}
