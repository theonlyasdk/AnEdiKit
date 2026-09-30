// AnEdiKit - Audio loading feedback + control locking (leaf, no imports).
export function setControlsDisabled(disabled) {
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


export function showLoadingFeedback(msg) {
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


export function hideLoadingFeedback() {
  const box = document.getElementById("audio-tag-loading-feedback");
  if (box) {
    box.classList.add("d-none");
    box.classList.remove("d-flex");
  }
}
