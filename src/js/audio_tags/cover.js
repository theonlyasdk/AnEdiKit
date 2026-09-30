// AnEdiKit - Cover-artwork handling for audio tags.
import { getAudioTagQueue, getSelectedTrackIndex, notifyChange } from "./queue.js";
import { updateQueueRowThumbnail } from "./render.js";
import { pickFiles } from "../file_picker.js";
import { morphContent } from "../cube_motion.js";
import { registerAudioUi } from "./audio_ui_bridge.js";

let removeCoverArmed = false;
let removeCoverArmTimer = null;

export function setRemoveCoverArmed(armed) {
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


export function updateCoverUI(track) {
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


export async function handleChooseCover() {
  if (getSelectedTrackIndex() < 0 || getSelectedTrackIndex() >= getAudioTagQueue().length) return;

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


export function applyChosenCover(dataUrl, coverPath) {
  if (getSelectedTrackIndex() < 0 || getSelectedTrackIndex() >= getAudioTagQueue().length) return;
  const track = getAudioTagQueue()[getSelectedTrackIndex()];
  track.coverDataUrl = dataUrl;
  track.chosenCoverPath = coverPath;
  track.coverAction = "replace";
  track.status = "modified";

  updateCoverUI(track);
  updateQueueRowThumbnail(getSelectedTrackIndex(), track);
  notifyChange();
}


export function handleRemoveCover() {
  if (getSelectedTrackIndex() < 0 || getSelectedTrackIndex() >= getAudioTagQueue().length) return;
  if (!removeCoverArmed) {
    setRemoveCoverArmed(true);
    return;
  }
  setRemoveCoverArmed(false);
  const track = getAudioTagQueue()[getSelectedTrackIndex()];
  track.coverAction = "remove";
  track.coverDataUrl = "";
  track.chosenCoverPath = "";
  track.status = "modified";

  updateCoverUI(track);
  updateQueueRowThumbnail(getSelectedTrackIndex(), track);
  notifyChange();
}

registerAudioUi("updateCoverUI", updateCoverUI);
