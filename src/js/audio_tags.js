// Audio Tag & ID3 Metadata Editor Module with Batch Queue
import { selectMediaFiles } from "./media.js";
import { buildAudioTagsCommand } from "./commands.js";
import { animateQueueHeight } from "./navigation.js";
import { loadSavedAudioTagQueue, saveAudioTagQueue } from "./storage.js";
import { morphContent } from "./cube_motion.js";
import { showBatchFinishedNotification } from "./runner.js";

let audioTagQueue = [];
let selectedTrackIndex = -1;
let changeCallback = null;
// Two-step inline confirm for the Remove cover button: first click arms it
// (button turns solid red with a Confirm label), second click removes.
let removeCoverArmed = false;
let removeCoverArmTimer = null;
// Entrance tracking: track id -> timestamp when added. A row plays the
// entrance only while fresh, so the metadata-completion refresh and later
// select/remove/sort renders stay still. Horizon covers max stagger
// (7 * 40ms) + enter duration (250ms).
const pendingEnterIds = new Map();
const ENTER_FRESH_MS = 600;
const MAX_ENTER_STAGGER = 7;

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
export function animateAudioQueueItemExit(rowEl, done) {
  const finish = () => {
    try {
      done();
    } catch (err) {
      console.warn("queue exit completion failed:", err);
    }
  };
  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("no-animations");
  if (!rowEl || reduceMotion) {
    finish();
    return;
  }
  const h = rowEl.offsetHeight;
  if (h > 0) rowEl.style.maxHeight = `${h}px`;
  rowEl.style.overflow = "hidden";
  void rowEl.offsetHeight;
  rowEl.classList.add("is-leaving");
  setTimeout(finish, 170);
}

export function initAudioTagsModule(onChanged) {
  changeCallback = onChanged;

  const btnAdd = document.getElementById("btn-audio-tag-add");
  const btnAddEmpty = document.getElementById("btn-audio-tag-add-empty");
  const btnClear = document.getElementById("btn-audio-tag-clear");
  const emptyMsg = document.getElementById("audio-tag-empty-msg");
  const queueList = document.getElementById("audio-tag-queue-list");

  const onAddFiles = async () => {
    const picked = await selectMediaFiles("audio");
    if (picked && picked.length > 0) {
      await addAudioFilesToQueue(picked);
    }
  };

  if (btnAdd) btnAdd.addEventListener("click", onAddFiles);
  if (btnAddEmpty) btnAddEmpty.addEventListener("click", onAddFiles);
  if (btnClear) btnClear.addEventListener("click", () => clearAudioTagQueue());

  // Drag and drop onto queue drop zone
  if (emptyMsg) {
    emptyMsg.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      onAddFiles();
    });
    setupDragDropZone(emptyMsg, onAddFiles);
  }

  if (queueList) {
    setupDragDropZone(queueList, onAddFiles);
  }

  // Cover Buttons
  const btnChooseCover = document.getElementById("btn-tag-choose-cover");
  const btnRemoveCover = document.getElementById("btn-tag-remove-cover");
  const coverInput = document.getElementById("tag-cover-input");

  if (btnChooseCover) {
    btnChooseCover.addEventListener("click", () => handleChooseCover());
  }

  if (btnRemoveCover) {
    btnRemoveCover.addEventListener("click", () => handleRemoveCover());
  }

  if (coverInput) {
    coverInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        applyChosenCover(reader.result, file.name);
      };
      reader.readAsDataURL(file);
    });
  }

  // Action toolbar buttons
  const btnAutofill = document.getElementById("btn-tag-autofill");
  const btnRevert = document.getElementById("btn-tag-revert");
  const btnClearTags = document.getElementById("btn-tag-clear");

  if (btnAutofill) {
    btnAutofill.addEventListener("click", () => autoFillActiveTrack());
  }

  if (btnRevert) {
    btnRevert.addEventListener("click", () => revertActiveTrack());
  }

  if (btnClearTags) {
    btnClearTags.addEventListener("click", () => clearActiveTrackTags());
  }

  // Real-time input synchronization for all fields
  const tagFieldIds = [
    "tag-title",
    "tag-artist",
    "tag-album",
    "tag-album-artist",
    "tag-track",
    "tag-total-tracks",
    "tag-disc",
    "tag-year",
    "tag-genre",
    "tag-composer",
    "tag-comment",
  ];

  for (const id of tagFieldIds) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => syncActiveTrackFromForm());
    }
  }

  renderAudioQueueUI();
}

function setupDragDropZone(el, onFallbackPick) {
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.add("border-primary", "bg-primary-subtle");
  });

  el.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove("border-primary", "bg-primary-subtle");
  });

  el.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove("border-primary", "bg-primary-subtle");

    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) {
      const paths = files
        .map((f) => (window.__TAURI__ ? f.path || f.name : f.name))
        .filter(Boolean);
      if (paths.length > 0) {
        await addAudioFilesToQueue(paths);
      }
    }
  });
}

function notifyChange() {
  persistAudioTagQueue();
  if (typeof changeCallback === "function") {
    changeCallback();
  }
}

// Persist the queue across sessions. Only small durable fields are stored;
// embedded cover bytes and loaded file metadata are rebuilt on restore.
function persistAudioTagQueue() {
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

let currentMetaLoadToken = 0;
let isAudioMetaLoading = false;

export function isAudioTagsLoading() {
  return isAudioMetaLoading;
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

function setControlsDisabled(disabled) {
  const fieldIds = [
    "tag-title",
    "tag-artist",
    "tag-album",
    "tag-album-artist",
    "tag-track",
    "tag-total-tracks",
    "tag-disc",
    "tag-year",
    "tag-genre",
    "tag-composer",
    "tag-comment",
  ];
  for (const id of fieldIds) {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  }

  const btnIds = [
    "btn-tag-autofill",
    "btn-tag-revert",
    "btn-tag-clear",
    "btn-tag-choose-cover",
    "btn-tag-remove-cover",
    "btn-audio-tag-add",
    "btn-audio-tag-add-empty",
    "btn-audio-tag-clear",
  ];
  for (const id of btnIds) {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  }
}

function showLoadingFeedback(msg) {
  const box = document.getElementById("audio-tag-loading-feedback");
  const text = document.getElementById("audio-tag-loading-text");
  if (box) {
    box.classList.remove("d-none");
    box.classList.add("d-flex");
  }
  if (text && msg) {
    text.textContent = msg;
  }
}

function hideLoadingFeedback() {
  const box = document.getElementById("audio-tag-loading-feedback");
  if (box) {
    box.classList.add("d-none");
    box.classList.remove("d-flex");
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
      showAudioQueueDuplicateNotice(listEl);
    }
    return { added: 0, duplicate: duplicateCount };
  }

  const wasEmpty = audioTagQueue.length === 0;
  audioTagQueue.push(...newTracks);

  if (wasEmpty && audioTagQueue.length > 0) {
    selectedTrackIndex = 0;
  }

  newTracks.forEach((t) => pendingEnterIds.set(t.id, Date.now()));
  renderAudioQueueUI();
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
      updateQueueRowText(qIdx, track);
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
    renderAudioQueueUI();
    notifyChange();
  }

  return { added: newTracks.length, duplicate: duplicateCount };
}

export function clearAudioTagQueue() {
  cancelAudioMetadataLoading();
  audioTagQueue = [];
  selectedTrackIndex = -1;
  pendingEnterIds.clear();
  renderAudioQueueUI();
  notifyChange();
}

export function removeTrackFromQueue(index) {
  if (index < 0 || index >= audioTagQueue.length) return;
  pendingEnterIds.delete(audioTagQueue[index].id);
  audioTagQueue.splice(index, 1);

  if (audioTagQueue.length === 0) {
    selectedTrackIndex = -1;
  } else if (selectedTrackIndex === index) {
    selectedTrackIndex = Math.min(index, audioTagQueue.length - 1);
    loadTrackIntoForm(audioTagQueue[selectedTrackIndex]);
  } else if (selectedTrackIndex > index) {
    selectedTrackIndex--;
  }

  renderAudioQueueUI();
  notifyChange();
}

export async function initSavedAudioTagQueue() {
  const saved = loadSavedAudioTagQueue();
  if (saved.length === 0) {
    renderAudioQueueUI();
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
  renderAudioQueueUI();
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
    renderAudioQueueUI();
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
        updateQueueRowText(prevIndex, audioTagQueue[prevIndex]);
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
      updateQueueRowText(index, audioTagQueue[index]);
    }
  } else {
    renderAudioQueueUI();
  }

  notifyChange();
}

function loadTrackIntoForm(track) {
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

  updateCoverUI(track);
}

function syncActiveTrackFromForm() {
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
  updateQueueRowText(selectedTrackIndex, track);
  notifyChange();
}

function isTrackModified(track) {
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

function setRemoveCoverArmed(armed) {
  removeCoverArmed = armed;
  if (removeCoverArmTimer) {
    clearTimeout(removeCoverArmTimer);
    removeCoverArmTimer = null;
  }
  const btn = document.getElementById("btn-tag-remove-cover");
  if (!btn) return;
  if (armed) {
    btn.classList.remove("btn-outline-danger");
    btn.classList.add("btn-danger");
    morphContent(btn, `<ion-icon name="alert-outline"></ion-icon> Confirm?`);
    removeCoverArmTimer = setTimeout(() => setRemoveCoverArmed(false), 3000);
  } else {
    btn.classList.remove("btn-danger");
    btn.classList.add("btn-outline-danger");
    morphContent(btn, `<ion-icon name="trash-outline"></ion-icon> Remove`);
  }
}

function updateCoverUI(track) {
  setRemoveCoverArmed(false);
  const placeholder = document.getElementById("tag-cover-placeholder");
  const img = document.getElementById("tag-cover-img");
  const btnRemove = document.getElementById("btn-tag-remove-cover");

  if (!placeholder || !img) return;

  const hasImage = track.coverDataUrl && track.coverAction !== "remove";

  if (hasImage) {
    img.src = track.coverDataUrl;
    img.classList.remove("d-none");
    placeholder.classList.add("d-none");
    if (btnRemove) btnRemove.classList.remove("d-none");
  } else {
    img.src = "";
    img.classList.add("d-none");
    placeholder.classList.remove("d-none");
    if (btnRemove) btnRemove.classList.add("d-none");
  }
}

async function handleChooseCover() {
  if (selectedTrackIndex < 0 || selectedTrackIndex >= audioTagQueue.length) return;

  if (window.__TAURI__?.core?.invoke) {
    try {
      const picked = await window.__TAURI__.core.invoke("pick_file", { filterMode: "image" });
      if (picked) {
        const dataUrl = await window.__TAURI__.core.invoke("read_image_data", { filePath: picked });
        applyChosenCover(dataUrl, picked);
        return;
      }
    } catch (e) {
      console.warn("pick_file error:", e);
    }
  }

  const input = document.getElementById("tag-cover-input");
  if (input) input.click();
}

function applyChosenCover(dataUrl, coverPath) {
  if (selectedTrackIndex < 0 || selectedTrackIndex >= audioTagQueue.length) return;
  const track = audioTagQueue[selectedTrackIndex];
  track.coverDataUrl = dataUrl;
  track.chosenCoverPath = coverPath;
  track.coverAction = "replace";
  track.status = "modified";

  updateCoverUI(track);
  updateQueueRowThumbnail(selectedTrackIndex, track);
  notifyChange();
}

function handleRemoveCover() {
  if (selectedTrackIndex < 0 || selectedTrackIndex >= audioTagQueue.length) return;
  if (!removeCoverArmed) {
    setRemoveCoverArmed(true);
    return;
  }
  setRemoveCoverArmed(false);
  const track = audioTagQueue[selectedTrackIndex];
  track.coverAction = "remove";
  track.coverDataUrl = "";
  track.chosenCoverPath = "";
  track.status = "modified";

  updateCoverUI(track);
  updateQueueRowThumbnail(selectedTrackIndex, track);
  notifyChange();
}

export function autoFillActiveTrack() {
  if (selectedTrackIndex < 0 || selectedTrackIndex >= audioTagQueue.length) return;
  const track = audioTagQueue[selectedTrackIndex];

  const parsed = parseFilenameTags(track.fileName);
  if (parsed.title) {
    const titleEl = document.getElementById("tag-title");
    if (titleEl) titleEl.value = parsed.title;
    track.title = parsed.title;
  }
  if (parsed.artist) {
    const artistEl = document.getElementById("tag-artist");
    if (artistEl) artistEl.value = parsed.artist;
    track.artist = parsed.artist;
  }
  if (parsed.album) {
    const albumEl = document.getElementById("tag-album");
    if (albumEl) albumEl.value = parsed.album;
    track.album = parsed.album;
  }
  if (parsed.track) {
    const trackEl = document.getElementById("tag-track");
    if (trackEl) trackEl.value = parsed.track;
    track.track = parsed.track;
  }

  track.status = isTrackModified(track) ? "modified" : "ready";
  updateQueueRowText(selectedTrackIndex, track);
  notifyChange();
}

export function revertActiveTrack() {
  if (selectedTrackIndex < 0 || selectedTrackIndex >= audioTagQueue.length) return;
  const track = audioTagQueue[selectedTrackIndex];
  if (!track.originalMeta) return;

  const o = track.originalMeta;
  track.title = o.title || "";
  track.artist = o.artist || "";
  track.album = o.album || "";
  track.albumArtist = o.album_artist || "";
  track.track = o.track || "";
  track.totalTracks = o.total_tracks || "";
  track.disc = o.disc || "";
  track.year = o.year || "";
  track.genre = o.genre || "";
  track.composer = o.composer || "";
  track.comment = o.comment || "";
  track.coverAction = o.cover_data_url ? "keep" : "none";
  track.coverDataUrl = o.cover_data_url || "";
  track.chosenCoverPath = "";
  track.status = "ready";

  loadTrackIntoForm(track);
  updateQueueRowText(selectedTrackIndex, track);
  updateQueueRowThumbnail(selectedTrackIndex, track);
  notifyChange();
}

export function clearActiveTrackTags() {
  if (selectedTrackIndex < 0 || selectedTrackIndex >= audioTagQueue.length) return;
  const track = audioTagQueue[selectedTrackIndex];

  const tagFieldIds = [
    "tag-title",
    "tag-artist",
    "tag-album",
    "tag-album-artist",
    "tag-track",
    "tag-total-tracks",
    "tag-disc",
    "tag-year",
    "tag-genre",
    "tag-composer",
    "tag-comment",
  ];

  for (const id of tagFieldIds) {
    const el = document.getElementById(id);
    if (el) el.value = "";
    const key = id.replace("tag-", "").replace("-", "");
    track[key] = "";
  }

  track.title = "";
  track.artist = "";
  track.album = "";
  track.albumArtist = "";
  track.track = "";
  track.totalTracks = "";
  track.disc = "";
  track.year = "";
  track.genre = "";
  track.composer = "";
  track.comment = "";
  track.coverAction = "remove";
  track.coverDataUrl = "";
  track.chosenCoverPath = "";
  track.status = "modified";

  updateCoverUI(track);
  updateQueueRowText(selectedTrackIndex, track);
  updateQueueRowThumbnail(selectedTrackIndex, track);
  notifyChange();
}

function parseFilenameTags(fileName) {
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

export function renderAudioQueueUI() {
  const container = document.getElementById("audio-tag-queue-list");
  if (!container) return;
  // Morph between the empty drop card and the populated list in both
  // directions (first add, last delete); same-state refreshes render
  // instantly with no motion.
  animateQueueHeight(container, () => renderAudioQueueUIInner());
}

function renderAudioQueueUIInner() {
  const countEl = document.getElementById("audio-tag-queue-count");
  const container = document.getElementById("audio-tag-queue-list");
  const btnClear = document.getElementById("btn-audio-tag-clear");
  const btnAdd = document.getElementById("btn-audio-tag-add");
  const editorSection = document.getElementById("audio-tag-editor-section");

  if (countEl) countEl.textContent = audioTagQueue.length.toString();

  if (!container) return;

  if (audioTagQueue.length === 0) {
    if (btnClear) btnClear.classList.add("d-none");
    if (btnAdd) btnAdd.classList.add("d-none");
    if (editorSection) editorSection.classList.add("d-none");

    container.innerHTML = `
      <div class="list-group-item text-body-secondary text-center py-4 d-flex flex-column align-items-center justify-content-center gap-2 rounded bg-body-tertiary" id="audio-tag-empty-msg" style="border: 2px dashed var(--bs-border-color); cursor: pointer; overscroll-behavior: none;">
        <ion-icon name="musical-notes-outline" class="fs-2 text-secondary opacity-50 mb-1"></ion-icon>
        <span class="fw-medium text-body" id="audio-tag-drop-label">Drop audio files here or click to select</span>
        <span class="small text-body-secondary" id="audio-tag-drop-sublabel">Supports MP3, M4A, FLAC, OGG</span>
        <button class="btn btn-outline-primary btn-sm mt-2" type="button" id="btn-audio-tag-add-empty" title="Add audio files to queue">
          <ion-icon name="folder-open-outline" class="me-1"></ion-icon> Select Audio Files
        </button>
      </div>
    `;

    const emptyMsg = document.getElementById("audio-tag-empty-msg");
    const addEmpty = document.getElementById("btn-audio-tag-add-empty");
    const onAdd = async () => {
      const picked = await selectMediaFiles("audio");
      if (picked && picked.length > 0) await addAudioFilesToQueue(picked);
    };
    if (emptyMsg) {
      emptyMsg.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        onAdd();
      });
      setupDragDropZone(emptyMsg, onAdd);
    }
    if (addEmpty) addEmpty.addEventListener("click", onAdd);
    return;
  }

  if (btnClear) btnClear.classList.remove("d-none");
  if (btnAdd) btnAdd.classList.remove("d-none");
  if (editorSection) editorSection.classList.remove("d-none");

  const artRadius = 6;
  const itemPadding = 10;
  const outerRadius = artRadius + itemPadding; // 16px formula: outer radius = padding + inner radius

  let html = `<div class="border bg-body-tertiary audio-queue-conjoined-list" style="max-height: 240px; overflow-y: auto; overflow-x: hidden; border-radius: ${outerRadius}px; --audio-queue-radius: ${outerRadius}px;">`;

  let enterCursor = 0;
  const now = Date.now();
  audioTagQueue.forEach((item, idx) => {
    const isSelected = idx === selectedTrackIndex;
    const isLast = idx === audioTagQueue.length - 1;
    const borderClass = isLast ? "" : "border-bottom";
    const activeClass = isSelected ? "active-track-item" : "bg-body";
    const subTextClass = isSelected ? "text-white-50" : "text-body-secondary";
    const enteredAt = pendingEnterIds.get(item.id);
    const isEntering = enteredAt !== undefined && now - enteredAt < ENTER_FRESH_MS;
    if (enteredAt !== undefined && !isEntering) pendingEnterIds.delete(item.id);
    const enterClass = isEntering ? " queue-item-enter" : "";
    const enterIndex = isEntering ? `--enter-index: ${Math.min(enterCursor++, MAX_ENTER_STAGGER)}; ` : "";
    const titleDisplay = item.title ? escapeHtml(item.title) : escapeHtml(item.fileName);
    const subDisplay = item.artist ? `${escapeHtml(item.artist)}${item.album ? ` — ${escapeHtml(item.album)}` : ""}` : escapeHtml(item.fileName);

    let statusBadge = "";
    if (item.status === "processing") {
      statusBadge = `<span class="badge bg-primary">Applying...</span>`;
    } else if (item.status === "done") {
      statusBadge = `<span class="badge bg-success">Applied</span>`;
    } else if (item.status === "error") {
      statusBadge = `<span class="badge bg-danger">Error</span>`;
    }
    // Modified state is shown as a star overlay on the artwork instead of a badge.

    const thumbInner = item.coverDataUrl && item.coverAction !== "remove"
      ? `<img src="${item.coverDataUrl}" class="audio-queue-art border object-fit-cover" style="width: 36px; height: 36px; border-radius: ${artRadius}px;" alt="Art" />`
      : `<div class="audio-queue-art border d-flex align-items-center justify-content-center bg-body-tertiary text-body-secondary" style="width: 36px; height: 36px; border-radius: ${artRadius}px;"><ion-icon name="musical-note-outline" style="font-size: 1.15rem;"></ion-icon></div>`;
    const thumbHtml = `<div class="audio-queue-thumb flex-shrink-0">${thumbInner}<ion-icon name="star" id="atag-star-${idx}" class="audio-queue-modified-star${item.status === "modified" ? "" : " d-none"}" title="Modified"></ion-icon></div>`;

    html += `
      <div class="audio-queue-item d-flex align-items-stretch justify-content-between gap-0 ${borderClass} ${activeClass}${enterClass}" data-track-index="${idx}" style="${enterIndex}padding: ${itemPadding}px 0 ${itemPadding}px ${itemPadding}px; cursor: pointer;">
        <div class="d-flex align-items-center gap-2 min-w-0 flex-grow-1 pe-2" data-action="select" data-track-index="${idx}">
          ${thumbHtml}
          <div class="min-w-0 flex-grow-1">
            <div class="fw-medium small text-truncate queue-item-title" id="atag-title-${idx}">${titleDisplay}</div>
            <div class="${subTextClass} small text-truncate queue-item-sub" style="font-size: 0.75rem;" id="atag-sub-${idx}">${subDisplay}</div>
          </div>
        </div>
        <div class="d-flex align-items-stretch flex-shrink-0">
          <span id="atag-badge-${idx}" class="align-self-center me-2">${statusBadge}</span>
          <button class="audio-queue-remove-strip" type="button" data-action="remove" data-track-index="${idx}" title="Remove track from queue" style="margin-top: -${itemPadding}px; margin-bottom: -${itemPadding}px;">
            <ion-icon name="trash-outline" style="font-size: 1rem;"></ion-icon>
          </button>
        </div>
      </div>
    `;
  });

  const existingList = container.querySelector(".audio-queue-conjoined-list");
  const savedScrollTop = existingList ? existingList.scrollTop : 0;

  html += `</div>`;
  container.innerHTML = html;

  const listEl = container.querySelector(".audio-queue-conjoined-list");
  if (listEl) {
    if (savedScrollTop > 0) {
      listEl.scrollTop = savedScrollTop;
    }
    setupQueueListDragDrop(listEl);
    // A re-render (metadata landing, select) replaces the list node
    // mid-drag and wipes the visual state: re-apply it onto the fresh node.
    if (queueDragCounter > 0) {
      listEl.classList.add("is-dragover");
      showQueueDragOverlay(listEl);
    }
  }

  // Bind item click and remove events
  container.querySelectorAll(".audio-queue-item").forEach((row) => {
    const idx = parseInt(row.dataset.trackIndex, 10);
    const removeBtn = row.querySelector('[data-action="remove"]');
    if (removeBtn) {
      removeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeBtn.style.pointerEvents = "none";
        // When removing the last item, skip individual row exit collapse so
        // the conjoined list box morphs directly to the drop area card box.
        if (audioTagQueue.length <= 1) {
          removeTrackFromQueue(idx);
        } else {
          animateAudioQueueItemExit(row, () => removeTrackFromQueue(idx));
        }
      });
    }

    row.addEventListener("click", (e) => {
      if (e.target.closest('[data-action="remove"]')) return;
      e.preventDefault();
      selectTrack(idx);
    });
  });
}

let queueDragCounter = 0;
let duplicateNoticeTimer = null;
let duplicateExitTimer = null;

export function resetQueueDragState() {
  queueDragCounter = 0;
  if (duplicateNoticeTimer) {
    clearTimeout(duplicateNoticeTimer);
    duplicateNoticeTimer = null;
  }
  if (duplicateExitTimer) {
    clearTimeout(duplicateExitTimer);
    duplicateExitTimer = null;
  }
  const cur =
    typeof document !== "undefined"
      ? document.querySelector("#audio-tag-queue-list .audio-queue-conjoined-list")
      : null;
  if (cur) {
    cur.classList.remove("is-dragover");
    hideQueueDragOverlay(cur);
  }
}

function setupQueueListDragDrop(listContainer) {
  if (!listContainer || listContainer.dataset.dragDropBound === "true") return;
  listContainer.dataset.dragDropBound = "true";

  if (!window._audioQueueDragEndBound) {
    window._audioQueueDragEndBound = true;
    document.addEventListener("dragend", resetQueueDragState);
  }

  listContainer.addEventListener("scroll", () => {
    const overlay = listContainer.querySelector(".audio-queue-drag-overlay:not(.d-none)");
    if (overlay) {
      overlay.style.top = listContainer.scrollTop + "px";
    }
  }, { passive: true });

  listContainer.addEventListener("dragenter", (e) => {
    e.preventDefault();
    e.stopPropagation();
    queueDragCounter++;
    listContainer.classList.add("is-dragover");
    showQueueDragOverlay(listContainer);
  });

  listContainer.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  });

  listContainer.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    queueDragCounter = Math.max(0, queueDragCounter - 1);
    if (queueDragCounter === 0) {
      listContainer.classList.remove("is-dragover");
      hideQueueDragOverlay(listContainer);
    }
  });

  listContainer.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) {
      const paths = files
        .map((f) => (window.__TAURI__ ? f.path || f.name : f.name))
        .filter(Boolean);
      if (paths.length > 0) {
        const res = await addAudioFilesToQueue(paths);
        if (res && res.added === 0 && res.duplicate > 0) {
          queueDragCounter = 0;
          return;
        }
      }
    }
    resetQueueDragState();
  });
}

export function showQueueDragOverlay(container) {
  if (!container) return;
  container.classList.add("is-dragover");

  if (duplicateNoticeTimer) {
    clearTimeout(duplicateNoticeTimer);
    duplicateNoticeTimer = null;
  }
  if (duplicateExitTimer) {
    clearTimeout(duplicateExitTimer);
    duplicateExitTimer = null;
  }

  const computedRadius = parseFloat(getComputedStyle(container).borderRadius) || 16;
  const strokeRadius = Math.max(0, computedRadius - 1.5);

  let overlay = container.querySelector(".audio-queue-drag-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className =
      "audio-queue-drag-overlay position-absolute start-0 w-100 d-flex align-items-center justify-content-center p-3";
    overlay.style.zIndex = "20";
    overlay.style.backgroundColor = "rgba(var(--bs-body-bg-rgb, 30, 30, 30), 0.72)";
    overlay.style.backdropFilter = "blur(4px)";
    overlay.style.webkitBackdropFilter = "blur(4px)";
    overlay.style.borderRadius = "inherit";
    overlay.style.pointerEvents = "none";
    overlay.innerHTML = `
      <svg class="audio-queue-ants-svg position-absolute top-0 start-0 w-100 h-100" style="pointer-events: none; border-radius: inherit; overflow: visible;">
        <rect x="1.5" y="1.5" rx="${strokeRadius}" ry="${strokeRadius}" fill="none" stroke="var(--bs-primary)" stroke-width="2" stroke-dasharray="8 6" class="audio-queue-ants-rect" style="rx: ${strokeRadius}px; ry: ${strokeRadius}px;"/>
      </svg>
      <div class="audio-queue-drag-content d-flex align-items-center justify-content-center gap-2 text-center user-select-none">
        <ion-icon name="cloud-upload-outline" class="audio-queue-drag-icon fs-3 text-primary flex-shrink-0"></ion-icon>
        <span class="audio-queue-drag-text fw-semibold text-body">Drop here to import</span>
      </div>
    `;
    container.appendChild(overlay);
  } else {
    overlay.classList.remove("d-none");
    overlay.classList.remove("is-leaving");
    const rect = overlay.querySelector(".audio-queue-ants-rect");
    if (rect) {
      rect.setAttribute("rx", strokeRadius);
      rect.setAttribute("ry", strokeRadius);
      rect.style.rx = `${strokeRadius}px`;
      rect.style.ry = `${strokeRadius}px`;
      rect.setAttribute("stroke", "var(--bs-primary)");
      rect.classList.remove("is-accelerating");
    }
    const icon = overlay.querySelector(".audio-queue-drag-icon");
    if (icon) {
      icon.setAttribute("name", "cloud-upload-outline");
      icon.className = "audio-queue-drag-icon fs-3 text-primary flex-shrink-0";
    }
    const text = overlay.querySelector(".audio-queue-drag-text");
    if (text) {
      text.textContent = "Drop here to import";
      text.className = "audio-queue-drag-text fw-semibold text-body";
    }
    const content = overlay.querySelector(".audio-queue-drag-content");
    if (content) {
      content.classList.remove("audio-queue-wobble");
    }
  }

  const clientH = container.clientHeight;
  if (clientH > 0) {
    overlay.style.height = clientH + "px";
  } else {
    overlay.style.height = "100%";
  }
  overlay.style.top = (container.scrollTop || 0) + "px";

  const items = container.querySelectorAll(".audio-queue-item");
  items.forEach((item) => {
    item.style.filter = "blur(4px)";
    item.style.opacity = "0.35";
  });
}

export function showAudioQueueDuplicateNotice(container) {
  if (!container) {
    container = document.querySelector("#audio-tag-queue-list .audio-queue-conjoined-list");
  }
  if (!container) return;

  showQueueDragOverlay(container);

  const overlay = container.querySelector(".audio-queue-drag-overlay");
  if (!overlay) return;

  overlay.classList.remove("is-leaving");

  const rect = overlay.querySelector(".audio-queue-ants-rect");
  if (rect) {
    rect.setAttribute("stroke", "var(--bs-warning)");
    rect.classList.remove("is-accelerating");
  }
  const icon = overlay.querySelector(".audio-queue-drag-icon");
  if (icon) {
    icon.setAttribute("name", "alert-circle-outline");
    icon.className = "audio-queue-drag-icon fs-3 text-warning flex-shrink-0";
  }
  const text = overlay.querySelector(".audio-queue-drag-text");
  if (text) {
    text.textContent = "This was already imported";
    text.className = "audio-queue-drag-text fw-semibold text-warning";
  }
  const content = overlay.querySelector(".audio-queue-drag-content");
  if (content) {
    content.classList.remove("audio-queue-wobble");
    void content.offsetWidth;
    content.classList.add("audio-queue-wobble");
  }

  if (duplicateNoticeTimer) {
    clearTimeout(duplicateNoticeTimer);
    duplicateNoticeTimer = null;
  }
  if (duplicateExitTimer) {
    clearTimeout(duplicateExitTimer);
    duplicateExitTimer = null;
  }

  // At 2500ms: Begin smooth fade out and accelerate the marching ants border animation
  duplicateExitTimer = setTimeout(() => {
    overlay.classList.add("is-leaving");
    if (rect) rect.classList.add("is-accelerating");
    // Also smooth out the blur and opacity on queue items behind the overlay
    const items = container.querySelectorAll(".audio-queue-item");
    items.forEach((item) => {
      item.style.filter = "";
      item.style.opacity = "";
    });
  }, 2500);

  // At 3000ms: Transition complete, fully hide and reset state
  duplicateNoticeTimer = setTimeout(() => {
    hideQueueDragOverlay(container);
    overlay.classList.remove("is-leaving");
    if (rect) {
      rect.setAttribute("stroke", "var(--bs-primary)");
      rect.classList.remove("is-accelerating");
    }
    if (icon) {
      icon.setAttribute("name", "cloud-upload-outline");
      icon.className = "audio-queue-drag-icon fs-3 text-primary flex-shrink-0";
    }
    if (text) {
      text.textContent = "Drop here to import";
      text.className = "audio-queue-drag-text fw-semibold text-body";
    }
    if (content) content.classList.remove("audio-queue-wobble");
    duplicateNoticeTimer = null;
    duplicateExitTimer = null;
  }, 3000);
}

export function hideQueueDragOverlay(container) {
  if (!container) return;
  container.classList.remove("is-dragover");
  const overlay = container.querySelector(".audio-queue-drag-overlay");
  if (overlay) {
    overlay.classList.add("d-none");
    overlay.classList.remove("is-leaving");
  }
  const items = container.querySelectorAll(".audio-queue-item");
  items.forEach((item) => {
    item.style.filter = "";
    item.style.opacity = "";
  });
}

function updateQueueRowText(idx, track) {
  const titleEl = document.getElementById(`atag-title-${idx}`);
  const subEl = document.getElementById(`atag-sub-${idx}`);
  const badgeEl = document.getElementById(`atag-badge-${idx}`);

  if (titleEl) titleEl.textContent = track.title || track.fileName;
  if (subEl) subEl.textContent = track.artist ? `${track.artist}${track.album ? ` — ${track.album}` : ""}` : track.fileName;

  if (badgeEl) {
    if (track.status === "done") {
      badgeEl.innerHTML = `<span class="badge bg-success">Applied</span>`;
    } else if (track.status === "error") {
      badgeEl.innerHTML = `<span class="badge bg-danger">Error</span>`;
    } else if (track.status === "processing") {
      badgeEl.innerHTML = `<span class="badge bg-primary">Applying...</span>`;
    } else {
      badgeEl.innerHTML = "";
    }
    const star = document.getElementById(`atag-star-${idx}`);
    if (star) star.classList.toggle("d-none", track.status !== "modified");
  }
}

function updateQueueRowThumbnail(idx, track) {
  const row = document.querySelector(`[data-track-index="${idx}"][data-action="select"]`);
  if (!row) return;
  const oldThumb = row.querySelector(".audio-queue-art");
  if (!oldThumb) return;

  if (track.coverDataUrl && track.coverAction !== "remove") {
    const img = document.createElement("img");
    img.src = track.coverDataUrl;
    img.className = "audio-queue-art border object-fit-cover";
    img.style.width = "36px";
    img.style.height = "36px";
    img.style.borderRadius = "6px";
    img.alt = "Art";
    oldThumb.replaceWith(img);
  } else {
    const div = document.createElement("div");
    div.className = "audio-queue-art border d-flex align-items-center justify-content-center bg-body-tertiary text-body-secondary";
    div.style.width = "36px";
    div.style.height = "36px";
    div.style.borderRadius = "6px";
    div.innerHTML = `<ion-icon name="musical-note-outline" style="font-size: 1.15rem;"></ion-icon>`;
    oldThumb.replaceWith(div);
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function executeAudioTagsQueue(executeFfmpegJob, isCancelRequested, resetCancelFlag) {
  if (audioTagQueue.length === 0) return;

  // Make sure current active track inputs are synced before executing
  syncActiveTrackFromForm();
  resetCancelFlag();

  const isBatch = audioTagQueue.length > 1;
  const batchStartTime = Date.now();
  let successCount = 0;
  let failCount = 0;
  let lastDestination = "";

  for (let i = 0; i < audioTagQueue.length; i++) {
    if (isCancelRequested()) break;

    const track = audioTagQueue[i];
    track.status = "processing";
    updateQueueRowText(i, track);

    const tempOutPath = `${track.filePath}.tmp_${Date.now()}_${i}.${track.ext}`;

    let oggMetaPath = "";
    if (track.ext === "ogg" && track.coverAction === "replace" && track.chosenCoverPath) {
      if (window.__TAURI__?.core?.invoke) {
        try {
          oggMetaPath = await window.__TAURI__.core.invoke("prepare_ogg_cover_metadata", {
            imagePath: track.chosenCoverPath,
          });
        } catch (e) {
          console.warn("prepare_ogg_cover_metadata error:", e);
        }
      }
    }

    const cmdObj = buildAudioTagsCommand(track.filePath, "", {}, {
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArtist: track.albumArtist,
      track: track.track,
      totalTracks: track.totalTracks,
      disc: track.disc,
      year: track.year,
      genre: track.genre,
      composer: track.composer,
      comment: track.comment,
      coverAction: track.coverAction,
      coverPath: track.chosenCoverPath,
      tempOggMetaPath: oggMetaPath,
      customOutPath: tempOutPath,
    });

    if (isBatch) {
      cmdObj.suppressNotification = true;
    }

    const success = await executeFfmpegJob(cmdObj, 1.0);

    if (isCancelRequested()) {
      track.status = "ready";
      updateQueueRowText(i, track);
      break;
    }

    if (success) {
      if (window.__TAURI__?.core?.invoke) {
        try {
          await window.__TAURI__.core.invoke("replace_file", {
            sourceTemp: tempOutPath,
            targetDest: track.filePath,
          });
          track.status = "done";
          successCount++;
          lastDestination = track.filePath;
          track.originalMeta = {
            title: track.title,
            artist: track.artist,
            album: track.album,
            album_artist: track.albumArtist,
            track: track.track,
            total_tracks: track.totalTracks,
            disc: track.disc,
            year: track.year,
            genre: track.genre,
            composer: track.composer,
            comment: track.comment,
            cover_data_url: track.coverDataUrl,
          };
        } catch (err) {
          console.error("replace_file error:", err);
          track.status = "error";
          failCount++;
        }
      } else {
        track.status = "done";
        successCount++;
        lastDestination = track.filePath;
      }
    } else {
      track.status = "error";
      failCount++;
    }

    updateQueueRowText(i, track);
  }

  if (isBatch && !isCancelRequested() && successCount > 0) {
    const batchElapsedSeconds = batchStartTime > 0 ? ((Date.now() - batchStartTime) / 1000).toFixed(1) : "0.0";
    showBatchFinishedNotification({
      destination: lastDestination,
      toolName: "Audio Tagging",
      total: audioTagQueue.length,
      successCount,
      failCount,
      elapsedSeconds: batchElapsedSeconds,
    });
  }

  notifyChange();
}
