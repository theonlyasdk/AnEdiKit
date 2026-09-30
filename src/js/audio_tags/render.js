// AnEdiKit - Audio queue rendering, drag-drop, and overlays.
import { getAudioTagQueue, getSelectedTrackIndex, addAudioFilesToQueue, removeTrackFromQueue, selectTrack, notifyChange, consumeTrackEnterFresh, ENTER_FRESH_MS, MAX_ENTER_STAGGER } from "./queue.js";
import { animateQueueHeight } from "../anim.js";
import { morphContent } from "../cube_motion.js";
import { registerAudioUi } from "./audio_ui_bridge.js";

let queueDragCounter = 0;
let duplicateNoticeTimer = null;
let duplicateExitTimer = null;

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


export function renderAudioQueueUI() {
  const container = document.getElementById("audio-tag-queue-list");
  if (!container) return;
  // Morph between the empty drop card and the populated list in both
  // directions (first add, last delete); same-state refreshes render
  // instantly with no motion.
  animateQueueHeight(container, () => renderAudioQueueUIInner());
}


export function renderAudioQueueUIInner() {
  const countEl = document.getElementById("audio-tag-queue-count");
  const container = document.getElementById("audio-tag-queue-list");
  const btnClear = document.getElementById("btn-audio-tag-clear");
  const btnAdd = document.getElementById("btn-audio-tag-add");
  const editorSection = document.getElementById("audio-tag-editor-section");

  if (countEl) countEl.textContent = getAudioTagQueue().length.toString();

  if (!container) return;

  if (getAudioTagQueue().length === 0) {
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
      const picked = await pickFiles("audio");
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
  getAudioTagQueue().forEach((item, idx) => {
    const isSelected = idx === getSelectedTrackIndex();
    const isLast = idx === getAudioTagQueue().length - 1;
    const borderClass = isLast ? "" : "border-bottom";
    const activeClass = isSelected ? "active-track-item" : "bg-body";
    const subTextClass = isSelected ? "text-white-50" : "text-body-secondary";
    const enteredAt = consumeTrackEnterFresh(item.id);
    const isEntering = enteredAt !== undefined;
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
      ? `<img src="${escapeHtml(item.coverDataUrl)}" class="audio-queue-art border object-fit-cover" style="width: 36px; height: 36px; border-radius: ${artRadius}px;" alt="Art" />`
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
        if (getAudioTagQueue().length <= 1) {
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


export function setupQueueListDragDrop(listContainer) {
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


export function updateQueueRowText(idx, track) {
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


export function updateQueueRowThumbnail(idx, track) {
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


import { escapeHtml as escapeHtmlLeaf } from "../escape.js";

// Delegated to escape.js (single canonical implementation).
export function escapeHtml(str) {
  return escapeHtmlLeaf(str);
}

export function setupDragDropZone(el, onFallbackPick) {
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

// Register render handlers for queue.js lifecycle calls (via audio_ui_bridge).
registerAudioUi("renderAudioQueueUI", renderAudioQueueUI);
registerAudioUi("updateQueueRowText", updateQueueRowText);
registerAudioUi("updateQueueRowThumbnail", updateQueueRowThumbnail);
registerAudioUi("showAudioQueueDuplicateNotice", showAudioQueueDuplicateNotice);
