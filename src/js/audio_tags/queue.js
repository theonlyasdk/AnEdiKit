// AnEdiKit - Audio-tag queue state, lifecycle, and form sync (owns all state).
import { loadSavedAudioTagQueue, saveAudioTagQueue } from "../storage.js";
import { requestAudioUi } from "./audio_ui_bridge.js";
import { setControlsDisabled, showLoadingFeedback, hideLoadingFeedback } from "./loading_ui.js";

import { reportError } from "../errors.js";
let audioTagQueue = [];
let selectedTrackIndex = -1;
let changeCallback = null;
let currentMetaLoadToken = 0;
let isAudioMetaLoading = false;

// Enter-animation tracking (freshly added rows stagger in). Owned here
// because queue mutations drive it; render.js reads via helpers below.
const pendingEnterIds = new Map();
export const ENTER_FRESH_MS = 1500;
export const MAX_ENTER_STAGGER = 8;

export function markTrackEnterFresh(id) {
  if (id) pendingEnterIds.set(id, Date.now());
}

export function dropTrackEnterFresh(id) {
  if (id) pendingEnterIds.delete(id);
}

export function clearTrackEnterFresh() {
  pendingEnterIds.clear();
}

// Returns the entry timestamp, or undefined when not fresh (stale entries
// are reaped here so the map cannot grow across sessions).
export function consumeTrackEnterFresh(id) {
  const enteredAt = pendingEnterIds.get(id);
  if (enteredAt === undefined) return undefined;
  if (Date.now() - enteredAt < ENTER_FRESH_MS) return enteredAt;
  pendingEnterIds.delete(id);
  return undefined;
}

export function getAudioTagQueue() {
  return audioTagQueue;
}


export function getSelectedTrackIndex() {
  return selectedTrackIndex;
}

/**
 * Plays the row exit animation, then runs done (which splices + re-renders).
 * Exposed for the remove-strip binding and tests. Falls back to immediate
 * removal under reduced motion. Never delays longer than the close token.
 */


export function notifyChange() {
  persistAudioTagQueue();
  if (typeof changeCallback === "function") {
    changeCallback();
  }
}

// Persist the queue across sessions. Only small durable fields are stored;
// embedded cover bytes and loaded file metadata are rebuilt on restore.


// Persist the queue across sessions. Only small durable fields are stored;
// embedded cover bytes and loaded file metadata are rebuilt on restore.
export function persistAudioTagQueue() {
  try {
    saveAudioTagQueue(
      audioTagQueue.map((t) => ({
        filePath: t.filePath,
        fileName: t.fileName,
        ext: t.ext,
        title: t.title,
        artist: t.artist,
        album: t.album,
        albumArtist: t.albumArtist,
        track: t.track,
        totalTracks: t.totalTracks,
        disc: t.disc,
        year: t.year,
        genre: t.genre,
        composer: t.composer,
        comment: t.comment,
        coverAction: t.coverAction,
        chosenCoverPath: t.coverAction === "replace" ? t.chosenCoverPath || "" : "",
      })),
    );
  } catch (err) {
    console.warn("Failed to persist audio tag queue:", err);
  }
}


export function isAudioTagsLoading() {
  return isAudioMetaLoading;
}

// Decoupled from navigation.js: switchTool dispatches this event instead
// of importing this module (was a static cycle).
if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("anedikit:cancel-audio-load", () => {
    try { cancelAudioMetadataLoading(); } catch (caughtErr) { reportError("js/audio_tags/queue.js:isAudioTagsLoading", caughtErr); }
  });
}


export function cancelAudioMetadataLoading() {
  if (isAudioMetaLoading) {
    currentMetaLoadToken++;
    isAudioMetaLoading = false;
    setControlsDisabled(false);
    hideLoadingFeedback();
    notifyChange();
  }
}


export async function addAudioFilesToQueue(paths) {
  if (!paths || paths.length === 0) return { added: 0, duplicate: 0 };

  const validExts = new Set(["mp3", "m4a", "flac", "ogg", "opus", "wav", "aac", "aiff", "alac"]);
  const newTracks = [];
  let duplicateCount = 0;

  for (const rawPath of paths) {
    const p = rawPath.replace(/\\/g, "/");
    const ext = p.split(".").pop().toLowerCase();
    if (!validExts.has(ext)) continue;

    // Avoid duplicate file entries
    if (audioTagQueue.some((item) => item.filePath === rawPath || item.filePath === p)) {
      duplicateCount++;
      continue;
    }

    const fileName = p.split("/").pop() || p;
    const parsed = parseFilenameTags(fileName);

    const trackObj = {
      id: `at_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      filePath: rawPath,
      fileName,
      ext,
      title: parsed.title || fileName,
      artist: parsed.artist || "",
      album: "",
      albumArtist: "",
      track: parsed.track || "",
      totalTracks: "",
      disc: "",
      year: "",
      genre: "",
      composer: "",
      comment: "",
      coverAction: "none",
      coverDataUrl: "",
      chosenCoverPath: "",
      originalMeta: null,
      status: "loading_meta",
      metaLoaded: false,
    };

    newTracks.push(trackObj);
  }

  if (newTracks.length === 0) {
    if (duplicateCount > 0) {
      const listEl = document.querySelector("#audio-tag-queue-list .audio-queue-conjoined-list");
      requestAudioUi("showAudioQueueDuplicateNotice", listEl);
    }
    return { added: 0, duplicate: duplicateCount };
  }

  const wasEmpty = audioTagQueue.length === 0;
  audioTagQueue.push(...newTracks);

  if (wasEmpty && audioTagQueue.length > 0) {
    selectedTrackIndex = 0;
  }

  newTracks.forEach((t) => markTrackEnterFresh(t.id));
  requestAudioUi("renderAudioQueueUI", );
  if (selectedTrackIndex >= 0) {
    loadTrackIntoForm(audioTagQueue[selectedTrackIndex]);
  }

  // Start asynchronous ID3 metadata loading with UI feedback and cancellation
  currentMetaLoadToken++;
  const thisToken = currentMetaLoadToken;
  isAudioMetaLoading = true;
  setControlsDisabled(true);
  showLoadingFeedback(`Loading metadata for ${newTracks.length} track(s)...`);
  notifyChange();

  for (let i = 0; i < newTracks.length; i++) {
    if (thisToken !== currentMetaLoadToken) break;

    const track = newTracks[i];
    let meta = null;
    if (window.__TAURI__?.core?.invoke) {
      try {
        meta = await window.__TAURI__.core.invoke("get_audio_metadata", { filePath: track.filePath });
      } catch (e) {
        console.warn("Failed to get audio metadata for", track.filePath, e);
      }
    }

    if (thisToken !== currentMetaLoadToken) break;

    if (meta) {
      track.title = meta.title || track.title;
      track.artist = meta.artist || track.artist;
      track.album = meta.album || "";
      track.albumArtist = meta.album_artist || "";
      track.track = meta.track || track.track;
      track.totalTracks = meta.total_tracks || "";
      track.disc = meta.disc || "";
      track.year = meta.year || "";
      track.genre = meta.genre || "";
      track.composer = meta.composer || "";
      track.comment = meta.comment || "";
      track.coverDataUrl = meta.cover_data_url || "";
      track.coverAction = meta.cover_data_url ? "keep" : "none";
      track.originalMeta = { ...meta };
    }

    track.metaLoaded = true;
    track.status = "ready";

    const qIdx = audioTagQueue.indexOf(track);
    if (qIdx !== -1) {
      requestAudioUi("updateQueueRowText", qIdx, track);
      if (qIdx === selectedTrackIndex) {
        loadTrackIntoForm(track);
      }
    }

    const remaining = newTracks.length - (i + 1);
    if (remaining > 0) {
      showLoadingFeedback(`Loading metadata (${remaining} remaining)...`);
    }
  }

  if (thisToken === currentMetaLoadToken) {
    isAudioMetaLoading = false;
    setControlsDisabled(false);
    hideLoadingFeedback();
    requestAudioUi("renderAudioQueueUI", );
    notifyChange();
  }

  return { added: newTracks.length, duplicate: duplicateCount };
}


export function clearAudioTagQueue() {
  cancelAudioMetadataLoading();
  audioTagQueue = [];
  selectedTrackIndex = -1;
  clearTrackEnterFresh();
  requestAudioUi("renderAudioQueueUI", );
  notifyChange();
}


export function removeTrackFromQueue(index) {
  if (index < 0 || index >= audioTagQueue.length) return;
  dropTrackEnterFresh(audioTagQueue[index].id);
  audioTagQueue.splice(index, 1);

  if (audioTagQueue.length === 0) {
    selectedTrackIndex = -1;
  } else if (selectedTrackIndex === index) {
    selectedTrackIndex = Math.min(index, audioTagQueue.length - 1);
    loadTrackIntoForm(audioTagQueue[selectedTrackIndex]);
  } else if (selectedTrackIndex > index) {
    selectedTrackIndex--;
  }

  requestAudioUi("renderAudioQueueUI", );
  notifyChange();
}


export async function initSavedAudioTagQueue() {
  const saved = loadSavedAudioTagQueue();
  if (saved.length === 0) {
    requestAudioUi("renderAudioQueueUI", );
    return;
  }

  const canInvoke = !!window.__TAURI__?.core?.invoke;
  const restored = [];
  for (const s of saved) {
    if (canInvoke) {
      let exists = false;
      try {
        exists = await window.__TAURI__.core.invoke("check_file_exists", { filePath: s.filePath });
      } catch (_) {
        exists = false;
      }
      if (!exists) continue;
    }
    restored.push({
      id: `at_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      filePath: s.filePath,
      fileName: s.fileName,
      ext: s.ext,
      title: s.title,
      artist: s.artist,
      album: s.album,
      albumArtist: s.albumArtist,
      track: s.track,
      totalTracks: s.totalTracks,
      disc: s.disc,
      year: s.year,
      genre: s.genre,
      composer: s.composer,
      comment: s.comment,
      coverAction: s.coverAction,
      chosenCoverPath: s.chosenCoverPath,
      coverDataUrl: "",
      originalMeta: null,
      status: "loading_meta",
      metaLoaded: false,
    });
  }

  audioTagQueue = restored;
  selectedTrackIndex = restored.length > 0 ? 0 : -1;
  requestAudioUi("renderAudioQueueUI", );
  if (selectedTrackIndex >= 0) {
    loadTrackIntoForm(audioTagQueue[selectedTrackIndex]);
  }
  persistAudioTagQueue();

  if (restored.length === 0) return;

  // Reload fresh file metadata as the new baseline. Saved values (user edits
  // included) always win, so anything differing from the file reads back as
  // modified; untouched tracks settle back to ready.
  currentMetaLoadToken++;
  const thisToken = currentMetaLoadToken;
  isAudioMetaLoading = true;
  setControlsDisabled(true);
  showLoadingFeedback(`Restoring audio queue (${restored.length} track(s))...`);

  for (const track of restored) {
    if (thisToken !== currentMetaLoadToken) break;

    let meta = null;
    if (canInvoke) {
      try {
        meta = await window.__TAURI__.core.invoke("get_audio_metadata", { filePath: track.filePath });
      } catch (e) {
        console.warn("Failed to get audio metadata for", track.filePath, e);
      }
    }
    if (thisToken !== currentMetaLoadToken) break;

    if (meta) {
      track.originalMeta = { ...meta };
      const freshCover = meta.cover_data_url || "";
      if (track.coverAction === "replace" && track.chosenCoverPath && canInvoke) {
        let coverOk = false;
        try {
          coverOk = await window.__TAURI__.core.invoke("check_file_exists", { filePath: track.chosenCoverPath });
          if (coverOk) {
            track.coverDataUrl = await window.__TAURI__.core.invoke("read_image_data", { filePath: track.chosenCoverPath });
          }
        } catch (_) {
          coverOk = false;
        }
        if (!coverOk) {
          track.coverAction = freshCover ? "keep" : "none";
          track.chosenCoverPath = "";
          track.coverDataUrl = freshCover;
        }
      } else if (track.coverAction === "remove") {
        track.coverDataUrl = "";
      } else {
        track.coverAction = freshCover ? "keep" : "none";
        track.coverDataUrl = freshCover;
      }
    }

    track.metaLoaded = true;
    track.status = track.originalMeta && isTrackModified(track) ? "modified" : "ready";
  }

  if (thisToken === currentMetaLoadToken) {
    isAudioMetaLoading = false;
    setControlsDisabled(false);
    hideLoadingFeedback();
    requestAudioUi("renderAudioQueueUI", );
    if (selectedTrackIndex >= 0 && audioTagQueue[selectedTrackIndex]) {
      loadTrackIntoForm(audioTagQueue[selectedTrackIndex]);
    }
    notifyChange();
  }
}


export function selectTrack(index) {
  if (index < 0 || index >= audioTagQueue.length || index === selectedTrackIndex) return;

  const prevIndex = selectedTrackIndex;
  // Save current active track values before switching
  if (prevIndex >= 0 && prevIndex < audioTagQueue.length) {
    syncActiveTrackFromForm();
  }

  selectedTrackIndex = index;
  loadTrackIntoForm(audioTagQueue[index]);

  const container = document.getElementById("audio-tag-queue-list");
  const listEl = container?.querySelector(".audio-queue-conjoined-list");

  if (listEl) {
    if (prevIndex >= 0 && prevIndex < audioTagQueue.length) {
      const prevRow = listEl.querySelector(`.audio-queue-item[data-track-index="${prevIndex}"]`);
      if (prevRow) {
        prevRow.classList.remove("active-track-item");
        prevRow.classList.add("bg-body");
        const prevSub = prevRow.querySelector(`#atag-sub-${prevIndex}`);
        if (prevSub) {
          prevSub.className = "text-body-secondary small text-truncate queue-item-sub";
        }
        requestAudioUi("updateQueueRowText", prevIndex, audioTagQueue[prevIndex]);
      }
    }

    const newRow = listEl.querySelector(`.audio-queue-item[data-track-index="${index}"]`);
    if (newRow) {
      newRow.classList.add("active-track-item");
      newRow.classList.remove("bg-body");
      const newSub = newRow.querySelector(`#atag-sub-${index}`);
      if (newSub) {
        newSub.className = "text-white-50 small text-truncate queue-item-sub";
      }
      requestAudioUi("updateQueueRowText", index, audioTagQueue[index]);
    }
  } else {
    requestAudioUi("renderAudioQueueUI", );
  }

  notifyChange();
}


export function loadTrackIntoForm(track) {
  if (!track) return;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
  };

  setVal("tag-title", track.title);
  setVal("tag-artist", track.artist);
  setVal("tag-album", track.album);
  setVal("tag-album-artist", track.albumArtist);
  setVal("tag-track", track.track);
  setVal("tag-total-tracks", track.totalTracks);
  setVal("tag-disc", track.disc);
  setVal("tag-year", track.year);
  setVal("tag-genre", track.genre);
  setVal("tag-composer", track.composer);
  setVal("tag-comment", track.comment);

  const fileLabel = document.getElementById("tag-active-filename");
  if (fileLabel) fileLabel.textContent = track.fileName;

  const formatBadge = document.getElementById("tag-est-format");
  if (formatBadge) formatBadge.textContent = track.ext.toUpperCase();

  requestAudioUi("updateCoverUI", track);
}


export function syncActiveTrackFromForm() {
  if (selectedTrackIndex < 0 || selectedTrackIndex >= audioTagQueue.length) return;
  const track = audioTagQueue[selectedTrackIndex];

  const getVal = (id) => document.getElementById(id)?.value?.trim() || "";

  track.title = getVal("tag-title");
  track.artist = getVal("tag-artist");
  track.album = getVal("tag-album");
  track.albumArtist = getVal("tag-album-artist");
  track.track = getVal("tag-track");
  track.totalTracks = getVal("tag-total-tracks");
  track.disc = getVal("tag-disc");
  track.year = getVal("tag-year");
  track.genre = getVal("tag-genre");
  track.composer = getVal("tag-composer");
  track.comment = getVal("tag-comment");

  if (track.status !== "processing" && track.status !== "done") {
    track.status = isTrackModified(track) ? "modified" : "ready";
  }

  // Update text in queue row without full re-render to prevent focus loss
  requestAudioUi("updateQueueRowText", selectedTrackIndex, track);
  notifyChange();
}


export function isTrackModified(track) {
  if (!track.originalMeta) return true;
  const o = track.originalMeta;
  return (
    track.title !== (o.title || "") ||
    track.artist !== (o.artist || "") ||
    track.album !== (o.album || "") ||
    track.albumArtist !== (o.album_artist || "") ||
    track.track !== (o.track || "") ||
    track.totalTracks !== (o.total_tracks || "") ||
    track.disc !== (o.disc || "") ||
    track.year !== (o.year || "") ||
    track.genre !== (o.genre || "") ||
    track.composer !== (o.composer || "") ||
    track.comment !== (o.comment || "") ||
    track.coverAction === "replace" ||
    track.coverAction === "remove"
  );
}


export function parseFilenameTags(fileName) {
  const base = fileName.replace(/\.[^/.]+$/, "").trim();
  let remainder = base;
  let track = "";

  // Check track prefix e.g. "01 - ", "01. ", "01 "
  const trackMatch = remainder.match(/^(\d{1,3})[\s._-]+(.*)$/);
  if (trackMatch) {
    track = trackMatch[1];
    remainder = trackMatch[2].trim();
  }

  let artist = "";
  let title = "";
  let album = "";

  if (remainder.includes(" - ")) {
    const parts = remainder.split(" - ");
    if (parts.length === 2) {
      artist = parts[0].trim();
      title = parts[1].trim();
    } else if (parts.length >= 3) {
      artist = parts[0].trim();
      album = parts[1].trim();
      title = parts.slice(2).join(" - ").trim();
    }
  } else if (remainder.includes(" – ")) {
    const parts = remainder.split(" – ");
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(" – ").trim();
    }
  } else {
    title = remainder;
  }

  return { track, artist, album, title };
}

export function setChangeCallback(fn) {
  changeCallback = typeof fn === "function" ? fn : null;
}

// Decoupled from navigation.js: switchTool dispatches this event instead
// of importing this module (was a static cycle).
if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("anedikit:cancel-audio-load", () => {
    try { cancelAudioMetadataLoading(); } catch (caughtErr) { reportError("js/audio_tags/queue.js:setChangeCallback", caughtErr); }
  });
}
