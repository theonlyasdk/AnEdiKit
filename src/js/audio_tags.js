// AnEdiKit - Audio tags facade (API-preserving).
// Implementations live in ./audio_tags/*.js; init/wiring stays here.

import { pickFiles } from "./file_picker.js";
import { animateQueueHeight } from "./anim.js";
import { morphContent } from "./cube_motion.js";
import { setupListDragAndDrop } from "./drag_reorder.js";

import {
  getAudioTagQueue,
  getSelectedTrackIndex,
  addAudioFilesToQueue,
  clearAudioTagQueue,
  removeTrackFromQueue,
  initSavedAudioTagQueue,
  selectTrack,
  syncActiveTrackFromForm,
  setChangeCallback,
  isAudioTagsLoading,
  cancelAudioMetadataLoading,
} from "./audio_tags/queue.js";
import {
  handleChooseCover,
  handleRemoveCover,
  applyChosenCover,
} from "./audio_tags/cover.js";
import {
  autoFillActiveTrack,
  revertActiveTrack,
  clearActiveTrackTags,
} from "./audio_tags/tags.js";
import {
  animateAudioQueueItemExit,
  renderAudioQueueUI,
  resetQueueDragState,
  setupDragDropZone,
  showQueueDragOverlay,
  showAudioQueueDuplicateNotice,
  hideQueueDragOverlay,
} from "./audio_tags/render.js";
import {
  executeAudioTagsQueue,
} from "./audio_tags/execute.js";

export {
  getAudioTagQueue,
  getSelectedTrackIndex,
  addAudioFilesToQueue,
  clearAudioTagQueue,
  removeTrackFromQueue,
  initSavedAudioTagQueue,
  selectTrack,
  isAudioTagsLoading,
  cancelAudioMetadataLoading,
  autoFillActiveTrack,
  revertActiveTrack,
  clearActiveTrackTags,
  animateAudioQueueItemExit,
  renderAudioQueueUI,
  resetQueueDragState,
  showQueueDragOverlay,
  showAudioQueueDuplicateNotice,
  hideQueueDragOverlay,
  executeAudioTagsQueue,
};

export function initAudioTagsModule(onChanged) {
  setChangeCallback(onChanged);

  const btnAdd = document.getElementById("btn-audio-tag-add");
  const btnAddEmpty = document.getElementById("btn-audio-tag-add-empty");
  const btnClear = document.getElementById("btn-audio-tag-clear");
  const emptyMsg = document.getElementById("audio-tag-empty-msg");
  const queueList = document.getElementById("audio-tag-queue-list");

  const onAddFiles = async () => {
    const picked = await pickFiles("audio");
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
