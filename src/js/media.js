import {
  saveInputFile,
  getSavedInputFile,
  loadSavedBatchQueue,
  saveBatchQueue,
  loadSettings,
} from "./storage.js";
import { generateWaveformFromSource, clearWaveformCache } from "./waveform.js";
import { setCachedMediaProbe } from "./commands.js";
import { mediaState } from "./media_store.js";
import { pickFiles, pickFolder } from "./file_picker.js";
import { mediaPreviewManager, setMediaSrc } from "./preview_providers.js";
import {
  refreshWaveformDisplay,
  syncMediaDurationToTools,
  isAudioFile,
  isImageFile,
  isVideoFile,
  formatSecondsToTimestamp,
  parseTimestampToSeconds,
  extractTimelineThumbnailsAsync,
  initTrimmerControls,
} from "./trimmer.js";
import { setupListDragAndDrop } from "./drag_reorder.js";
import {
  renderMarqueeSongTitle,
  actionFrameCache,
  albumArtCache,
  extractAlbumArtAsync,
  extractActionFrameAsync,
  crossfadeVideoThumbnail,
  crossfadeAudioThumbnail,
} from "./media/artwork.js";
import {
  applyMediaPreviewVisibility,
  showMetadataLoading,
  updateMetadataDisplay,
  syncVideoPreviewForActiveTool,
} from "./media/metadata_ui.js";
import { probeMedia } from "./media/probe.js";
import { attachFluentRipple, animateQueueHeight } from "./anim.js";

import { reportError } from "./errors.js";
import { escapeHtml } from "./escape.js";
// Selection state lives in media_store.js (mediaState); trimmer and other
// readers import the store directly instead of this module (was a cycle).
// mediaState.mediaInfoCache is the shared probe-result cache.

export function getCurrentInputFile() {
  return mediaState.currentInputFile;
}

export function setCurrentInputFile(filePath) {
  mediaState.currentInputFile = filePath || "";
}

export function getCurrentMediaInfo() {
  return mediaState.currentMediaInfo;
}

export function setCurrentMediaInfo(info) {
  mediaState.currentMediaInfo = info || null;
}

/**
 * Central preview-visibility invariant: when the "show media preview"
 * setting is off, the preview column/card are hidden immediately (and media
 * paused), no matter which path refreshes the UI (toggle, probe, tool
 * switch). Re-enabling re-renders the current media.
 */
export async function selectMediaFile(filterMode = "all") {
  if (window.__TAURI__?.core?.invoke) {
    try {
      const selected = await window.__TAURI__.core.invoke("pick_files", {
        filterMode,
      });
      if (selected && selected.length > 0) {
        await addFilesToBatch(selected);
        return mediaState.currentMediaInfo;
      }
      return null;
    } catch (err) {
      console.warn("Tauri pick_files error:", err);
    }
  }

  // Web fallback simulation
  const mockPath = `C:\\Users\\User\\Videos\\sample_media_${Date.now().toString().slice(-4)}.mp4`;
  await addFilesToBatch([mockPath]);
  return mediaState.currentMediaInfo;
}

export async function selectMediaFiles(filterMode = "all") {
  // Thin wrapper: pure pick (file_picker.js) + batch-queue side effect.
  const selected = await pickFiles(filterMode);
  if (selected && selected.length > 0) {
    await addFilesToBatch(selected);
    return selected;
  }
  return [];
}

export async function selectOutputFolder(defaultPath = null) {
  return pickFolder(defaultPath);
}

// Batch Queue State & Management
let batchQueue = loadSavedBatchQueue();
let selectedBatchIdx = batchQueue.length > 0 ? 0 : -1;

export function getBatchQueue() {
  return batchQueue;
}

export function getSelectedBatchIdx() {
  return selectedBatchIdx;
}

export function setSelectedBatchIdx(idx) {
  selectedBatchIdx = idx;
  renderBatchQueueUI();
}

export async function initSavedBatchQueue() {
  batchQueue = loadSavedBatchQueue();
  const lastInput = getSavedInputFile();

  if (batchQueue.length === 0 && lastInput) {
    const fileName = lastInput.split(/[/\\]/).pop() || lastInput;
    batchQueue.push({
      path: lastInput,
      name: fileName,
      status: "pending",
    });
  }

  // Render initial queue immediately for 0ms initial layout freeze
  if (batchQueue.length > 0) {
    selectedBatchIdx = 0;
  } else {
    selectedBatchIdx = -1;
  }
  renderBatchQueueUI();

  if (window.__TAURI__?.core?.invoke && batchQueue.length > 0) {
    try {
      const checkResults = await Promise.all(
        batchQueue.map(async (item) => {
          try {
            const exists = await window.__TAURI__.core.invoke("check_file_exists", { filePath: item.path });
            return exists ? item : null;
          } catch (_) {
            return null;
          }
        }),
      );
      const validQueue = checkResults.filter(Boolean);
      batchQueue = validQueue;
      saveBatchQueue(batchQueue);
    } catch (caughtErr) { reportError("js/media.js:initSavedBatchQueue", caughtErr); }
  }

  if (batchQueue.length > 0) {
    selectedBatchIdx = 0;
    const targetPath = batchQueue[0].path;
    saveInputFile(targetPath);
    probeMedia(targetPath).then((info) => {
      if (info) {
        updateMetadataDisplay(info);
      }
    });
  } else {
    selectedBatchIdx = -1;
    saveInputFile("");
    updateMetadataDisplay(null);
  }
  renderBatchQueueUI();
}

export async function clearBatchQueue() {
  batchQueue = [];
  selectedBatchIdx = -1;
  saveBatchQueue(batchQueue);
  await probeMedia("");
  renderBatchQueueUI();
}

export async function removeBatchItem(index) {
  if (index >= 0 && index < batchQueue.length) {
    const wasActive = index === selectedBatchIdx;
    batchQueue.splice(index, 1);
    saveBatchQueue(batchQueue);
    if (batchQueue.length === 0) {
      selectedBatchIdx = -1;
      await probeMedia("");
    } else {
      if (selectedBatchIdx >= batchQueue.length) {
        selectedBatchIdx = batchQueue.length - 1;
      }
      // Debounced like selection clicks: rapid deletes collapse into one
      // probe, and the list re-renders immediately instead of waiting.
      if (wasActive || !mediaState.currentInputFile) {
        requestBatchItemProbePath(batchQueue[selectedBatchIdx >= 0 ? selectedBatchIdx : 0].path);
      }
    }
    renderBatchQueueUI();
  }
}

export function moveBatchIndexUp(idx) {
  if (idx > 0 && idx < batchQueue.length) {
    const temp = batchQueue[idx];
    batchQueue[idx] = batchQueue[idx - 1];
    batchQueue[idx - 1] = temp;
    selectedBatchIdx = idx - 1;
    saveBatchQueue(batchQueue);
    renderBatchQueueUI();
  }
}

export function moveBatchIndexDown(idx) {
  if (idx >= 0 && idx < batchQueue.length - 1) {
    const temp = batchQueue[idx];
    batchQueue[idx] = batchQueue[idx + 1];
    batchQueue[idx + 1] = temp;
    selectedBatchIdx = idx + 1;
    saveBatchQueue(batchQueue);
    renderBatchQueueUI();
  }
}

export function moveBatchItemUp() {
  if (selectedBatchIdx > 0) {
    moveBatchIndexUp(selectedBatchIdx);
  }
}

export function moveBatchItemDown() {
  if (selectedBatchIdx >= 0 && selectedBatchIdx < batchQueue.length - 1) {
    moveBatchIndexDown(selectedBatchIdx);
  }
}

export async function addFilesToBatch(paths) {
  if (!paths || paths.length === 0) return;
  for (const p of paths) {
    if (!p) continue;
    if (!batchQueue.some((item) => item.path === p)) {
      const fileName = p.split(/[/\\]/).pop() || p;
      batchQueue.push({
        path: p,
        name: fileName,
        status: "pending", // pending, processing, done, error
      });
    }
  }

  saveBatchQueue(batchQueue);

  if (batchQueue.length > 0) {
    const targetIdx = selectedBatchIdx >= 0 && selectedBatchIdx < batchQueue.length
      ? selectedBatchIdx
      : 0;
    await probeMedia(batchQueue[targetIdx].path);
  }

  renderBatchQueueUI();
}

export function updateBatchItemStatus(index, status) {
  if (index >= 0 && index < batchQueue.length) {
    batchQueue[index].status = status;
    saveBatchQueue(batchQueue);
    renderBatchQueueUI();
  }
}

// Selection highlight is applied synchronously by the click handler, but the
// probe cascade (ffprobe + thumbnails + waveform + preview rebuild) is
// debounced: rapid clicks across items collapse into a single cascade for
// the settled item instead of piling up overlapping work.
let batchProbeTimer = null;

function scheduleBatchProbe(getPath) {
  clearTimeout(batchProbeTimer);
  batchProbeTimer = setTimeout(() => {
    batchProbeTimer = null;
    try {
      const filePath = typeof getPath === "function" ? getPath() : getPath;
      if (filePath) probeMedia(filePath);
    } catch (caughtErr) { reportError("js/media.js:scheduleBatchProbe", caughtErr); }
  }, 120);
}

export function requestBatchItemProbePath(filePath) {
  scheduleBatchProbe(filePath);
}

export function renderBatchQueueUI() {
  animateQueueHeight(document.getElementById("batch-queue-list"), renderBatchQueueUIInner);
}

function renderBatchQueueUIInner() {
  const container = document.getElementById("batch-queue-container");
  const list = document.getElementById("batch-queue-list");
  const countEl = document.getElementById("batch-queue-count");
  const headerActions = document.getElementById("batch-header-actions");
  const inputPathEl = document.getElementById("input-file-path");
  const btnExecute = document.getElementById("btn-execute");

  if (!container || !list) return;

  if (countEl) countEl.textContent = batchQueue.length.toString();

  if (batchQueue.length === 0) {
    if (headerActions) headerActions.classList.add("d-none");
    list.className = "mb-2";
    list.style.maxHeight = "";
    list.style.overflowY = "visible";
    list.style.overscrollBehavior = "";
    list.innerHTML = `
      <div class="list-group-item text-body-secondary text-center py-5 d-flex flex-column align-items-center justify-content-center gap-2 rounded bg-body-tertiary" id="batch-empty-msg" style="border: 2px dashed var(--bs-border-color); cursor: pointer; overscroll-behavior: none;">
        <ion-icon name="film-outline" class="fs-2 text-secondary opacity-50 mb-1"></ion-icon>
        <span class="fw-medium text-body" id="batch-drop-label">Drop files here or click to select</span>
        <span class="small text-body-secondary" id="batch-drop-sublabel">Supports MP4, MKV, WebM, MOV, AVI, MP3, WAV, FLAC</span>
        <button class="btn btn-outline-primary btn-sm mt-2" type="button" id="btn-batch-add-empty" title="Add files to batch queue">
          <ion-icon name="folder-open-outline" class="me-1"></ion-icon> Select Files
        </button>
      </div>
    `;
    const emptyMsg = document.getElementById("batch-empty-msg");
    if (emptyMsg) {
      attachFluentRipple(emptyMsg);
      // Single delegated listener: button clicks bubble up here, so no
      // separate button listener (that caused 2 dialogs in a row).
      // Re-entrancy guard ignores clicks while the picker is open.
      emptyMsg.addEventListener("click", async () => {
        if (emptyMsg.dataset.picking === "1") return;
        emptyMsg.dataset.picking = "1";
        try {
          await selectMediaFiles("all");
        } finally {
          delete emptyMsg.dataset.picking;
        }
      });
    }
    if (btnExecute && btnExecute.textContent !== "Cancel") {
      btnExecute.textContent = "Execute";
    }
    return;
  }

  if (headerActions) headerActions.classList.remove("d-none");
  list.className = "list-group border rounded overflow-y-auto mb-2";
  list.style.maxHeight = "180px";
  list.style.overflowY = "auto";
  list.style.overscrollBehavior = "contain";

  if (inputPathEl) {
    if (batchQueue.length === 1) {
      inputPathEl.value = batchQueue[0].path;
    } else {
      inputPathEl.value = `[Batch Queue: ${batchQueue.length} files queued]`;
    }
  }

  if (btnExecute && btnExecute.textContent !== "Cancel") {
    btnExecute.textContent = batchQueue.length > 1 ? `Execute (${batchQueue.length})` : "Execute";
  }

  list.innerHTML = batchQueue
    .map((item, idx) => {
      let statusBadge = "";
      if (item.status === "processing") {
        statusBadge = `<span class="badge bg-primary-subtle text-primary-emphasis d-inline-flex align-items-center gap-1"><span class="spinner-border spinner-border-sm" style="width: 10px; height: 10px;" role="status"></span> Active</span>`;
      } else if (item.status === "skipped") {
        statusBadge = `<span class="badge bg-warning-subtle text-warning-emphasis"><ion-icon name="warning-outline"></ion-icon> Skipped (Missing)</span>`;
      } else if (item.status === "error") {
        statusBadge = `<span class="badge bg-danger-subtle text-danger-emphasis"><ion-icon name="close-outline"></ion-icon> Failed</span>`;
      }

      let leadingCheckBtn = "";
      if (item.status === "done") {
        leadingCheckBtn = `<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1 fs-7 flex-shrink-0"><ion-icon name="checkmark-outline"></ion-icon></span>`;
      }

      const isSelected = idx === selectedBatchIdx;
      return `
        <div class="batch-queue-item list-group-item list-group-item-action ${isSelected ? 'active' : 'bg-body-tertiary'} px-3 py-1 d-flex flex-row align-items-center justify-content-between gap-2" data-batch-idx="${idx}" style="cursor: pointer;">
          <div class="d-flex align-items-center gap-2 flex-grow-1 overflow-hidden">
            <span class="batch-queue-drag-handle format-drag-handle ${isSelected ? 'text-white' : 'text-secondary'} cursor-grab p-1 flex-shrink-0" data-drag-idx="${idx}" title="Drag vertically to reorder">
              <ion-icon name="reorder-two-outline" class="fs-5"></ion-icon>
            </span>
            ${leadingCheckBtn}
            <span class="fw-medium ${isSelected ? 'text-white' : 'text-body'} text-truncate" style="font-size: 0.88rem;"><strong class="me-2 ${isSelected ? 'text-white' : 'text-body-secondary'}">${idx + 1}.</strong>${escapeHtml(item.name)}</span>
          </div>
          <div class="d-flex align-items-center gap-2 flex-shrink-0">
            ${statusBadge}
            <button class="btn btn-outline-danger btn-sm py-0 px-2 btn-batch-del btn-item-delete ${isSelected ? 'btn-outline-light text-white' : ''}" data-del-batch-idx="${idx}" type="button" title="Delete file from queue">
              <ion-icon name="trash-outline"></ion-icon>
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  // Setup interactive vertical pointer drag with real-time shift animation for all batch queue items
  const itemEls = list.querySelectorAll(".batch-queue-item");
  itemEls.forEach((itemEl, index) => {
    const handle = itemEl.querySelector(".batch-queue-drag-handle");
    if (handle) {
      setupBatchQueueItemDrag(itemEl, handle, index, list);
    }
  });

  list.querySelectorAll(".batch-queue-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest(".batch-queue-drag-handle")) return;
      const idx = parseInt(el.getAttribute("data-batch-idx"), 10);
      if (idx === selectedBatchIdx) return;
      selectedBatchIdx = idx;

      // Update UI active selection immediately (0ms latency)
      list.querySelectorAll(".batch-queue-item").forEach((itemEl, i) => {
        const isCurrent = i === idx;
        itemEl.classList.toggle("active", isCurrent);
        itemEl.classList.toggle("bg-body-tertiary", !isCurrent);

        const handle = itemEl.querySelector(".batch-queue-drag-handle");
        if (handle) {
          handle.classList.toggle("text-white", isCurrent);
          handle.classList.toggle("text-secondary", !isCurrent);
        }

        const titleText = itemEl.querySelector(".fw-medium");
        if (titleText) {
          titleText.classList.toggle("text-white", isCurrent);
          titleText.classList.toggle("text-body", !isCurrent);
        }

        const strongNum = itemEl.querySelector("strong");
        if (strongNum) {
          strongNum.classList.toggle("text-white", isCurrent);
          strongNum.classList.toggle("text-body-secondary", !isCurrent);
        }

        const delBtn = itemEl.querySelector(".btn-batch-del");
        if (delBtn) {
          delBtn.classList.toggle("btn-outline-light", isCurrent);
          delBtn.classList.toggle("text-white", isCurrent);
        }
      });

      // Asynchronously probe media in background without blocking UI.
      // Debounced: fast successive clicks only probe the settled item.
      // The path is captured now so queue edits during the delay can't
      // redirect the probe to a different file.
      if (idx >= 0 && idx < batchQueue.length) {
        requestBatchItemProbePath(batchQueue[idx].path);
      }
    });
  });

  list.querySelectorAll(".btn-batch-del").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute("data-del-batch-idx"), 10);
      removeBatchItem(idx);
    });
  });
}

function setupBatchQueueItemDrag(itemEl, dragHandle, index, listContainer) {
  setupListDragAndDrop({
    itemEl,
    dragHandle,
    index,
    listContainer,
    itemSelector: ".batch-queue-item",
    droppedHighlightSelector: '[data-batch-idx="{index}"]',
    onReorder: (startIndex, targetIndex) => {
      if (targetIndex !== startIndex && targetIndex >= 0 && targetIndex < batchQueue.length) {
        const moved = batchQueue.splice(startIndex, 1)[0];
        batchQueue.splice(targetIndex, 0, moved);
        if (selectedBatchIdx === startIndex) {
          selectedBatchIdx = targetIndex;
        } else if (startIndex < selectedBatchIdx && targetIndex >= selectedBatchIdx) {
          selectedBatchIdx--;
        } else if (startIndex > selectedBatchIdx && targetIndex <= selectedBatchIdx) {
          selectedBatchIdx++;
        }
        saveBatchQueue(batchQueue);
        if (selectedBatchIdx >= 0 && selectedBatchIdx < batchQueue.length) {
          const activePath = batchQueue[selectedBatchIdx].path;
          if (activePath && activePath !== mediaState.currentInputFile) {
            requestBatchItemProbePath(activePath);
          }
        }
      }
      renderBatchQueueUI();
    },
  });
}

export function initDragAndDrop(onFileSelected) {
  const activatePulse = () => {
    const group = document.querySelector("#shared-input-card .input-group");
    if (group) group.classList.add("input-drop-pulsing");

    const imgEmptyMsg = document.getElementById("image-ai-empty-msg");
    const imgDropLabel = document.getElementById("image-drop-label");
    if (imgEmptyMsg) {
      imgEmptyMsg.classList.add("image-drop-active");
    }
    if (imgDropLabel) {
      imgDropLabel.textContent = "Drop here to import";
    }

    const batchEmptyMsg = document.getElementById("batch-empty-msg");
    const batchDropLabel = document.getElementById("batch-drop-label");
    if (batchEmptyMsg) batchEmptyMsg.classList.add("image-drop-active");
    if (batchDropLabel) batchDropLabel.textContent = "Drop here to import";

    const mergeEmptyMsg = document.getElementById("merge-empty-msg");
    const mergeDropLabel = document.getElementById("merge-drop-label");
    if (mergeEmptyMsg) mergeEmptyMsg.classList.add("image-drop-active");
    if (mergeDropLabel) mergeDropLabel.textContent = "Drop here to import";

    const audioEmptyMsg = document.getElementById("audio-tag-empty-msg");
    const audioDropLabel = document.getElementById("audio-tag-drop-label");
    if (audioEmptyMsg) audioEmptyMsg.classList.add("image-drop-active");
    if (audioDropLabel) audioDropLabel.textContent = "Drop here to import";

    const audioQueueList = document.querySelector("#audio-tag-queue-list .audio-queue-conjoined-list");
    if (audioQueueList) {
      import("./audio_tags.js").then(({ showQueueDragOverlay }) => {
        showQueueDragOverlay(audioQueueList);
      }).catch(() => {});
    }

    const placeholder = document.getElementById("image-queue-drop-placeholder");
    if (placeholder) {
      placeholder.classList.remove("d-none");
      const listEl = document.getElementById("image-ai-queue-list");
      if (listEl) {
        listEl.scrollTo({ top: listEl.scrollHeight, behavior: "smooth" });
      }
    }
  };

  const deactivatePulse = () => {
    const group = document.querySelector("#shared-input-card .input-group");
    if (group) group.classList.remove("input-drop-pulsing");

    const imgEmptyMsg = document.getElementById("image-ai-empty-msg");
    const imgDropLabel = document.getElementById("image-drop-label");
    if (imgEmptyMsg) {
      imgEmptyMsg.classList.remove("image-drop-active");
    }
    if (imgDropLabel) {
      imgDropLabel.textContent = "Drop images here or click to select";
    }

    const batchEmptyMsg = document.getElementById("batch-empty-msg");
    const batchDropLabel = document.getElementById("batch-drop-label");
    if (batchEmptyMsg) batchEmptyMsg.classList.remove("image-drop-active");
    if (batchDropLabel) batchDropLabel.textContent = "Drop files here or click to select";

    const mergeEmptyMsg = document.getElementById("merge-empty-msg");
    const mergeDropLabel = document.getElementById("merge-drop-label");
    if (mergeEmptyMsg) mergeEmptyMsg.classList.remove("image-drop-active");
    if (mergeDropLabel) mergeDropLabel.textContent = "Drop media files here or click to select";

    const audioEmptyMsg = document.getElementById("audio-tag-empty-msg");
    const audioDropLabel = document.getElementById("audio-tag-drop-label");
    if (audioEmptyMsg) audioEmptyMsg.classList.remove("image-drop-active");
    if (audioDropLabel) audioDropLabel.textContent = "Drop audio files here or click to select";

    const audioQueueList = document.querySelector("#audio-tag-queue-list .audio-queue-conjoined-list");
    if (audioQueueList) {
      import("./audio_tags.js").then(({ hideQueueDragOverlay }) => {
        hideQueueDragOverlay(audioQueueList);
      }).catch(() => {});
    }

    const placeholder = document.getElementById("image-queue-drop-placeholder");
    if (placeholder) {
      placeholder.classList.add("d-none");
    }
  };

  let dragCounter = 0;

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    window.addEventListener(
      eventName,
      (e) => {
        e.preventDefault();
      },
      false,
    );
    document.addEventListener(
      eventName,
      (e) => {
        e.preventDefault();
      },
      false,
    );
  });

  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    activatePulse();
  });

  window.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    activatePulse();
  });

  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0 || e.clientX === 0 || e.clientY === 0) {
      dragCounter = 0;
      deactivatePulse();
    }
  });

  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragCounter = 0;
    deactivatePulse();

    if (
      e.dataTransfer &&
      e.dataTransfer.files &&
      e.dataTransfer.files.length > 0
    ) {
      const filePaths = Array.from(e.dataTransfer.files).map(
        (f) => f.path || f.name || "",
      ).filter(Boolean);

      const activeTool = document.querySelector("#ytdlp-nav .nav-link.active, #tool-nav .nav-link.active, #image-ai-nav .nav-link.active, #pdf-nav .nav-link.active")?.dataset?.tool;
      const isImageTool = [
        "bg_remover",
        "ai_upscaler",
        "vectorizer",
        "restore_denoise",
        "icon_generator",
        "metadata_cleaner",
      ].includes(activeTool);

      const isPdfTool = activeTool === "pdf" || activeTool?.startsWith("pdf_");
      if (isPdfTool && typeof window.addPdfFilesToPdfQueue === "function") {
        window.addPdfFilesToPdfQueue(filePaths);
      } else if (isImageTool) {
        // Decoupled: image_queue.js listens (was a direct import cycle).
        try {
          document.dispatchEvent(
            new CustomEvent("anedikit:add-image-files", { detail: { paths: filePaths } })
          );
        } catch (caughtErr) { reportError("js/media.js:initDragAndDrop", caughtErr); }
      } else if (activeTool === "audio_tags") {
        const { addAudioFilesToQueue } = await import("./audio_tags.js");
        await addAudioFilesToQueue(filePaths);
      } else {
        await addFilesToBatch(filePaths);
        if (onFileSelected) onFileSelected(mediaState.currentMediaInfo);
      }
    }
  });

  // Tauri v2 native window drag-drop event support
  if (window.__TAURI__) {
    try {
      const webviewWin =
        window.__TAURI__.webviewWindow?.getCurrentWebviewWindow?.() ||
        window.__TAURI__.window?.getCurrentWindow?.();
      if (webviewWin && typeof webviewWin.onDragDropEvent === "function") {
        webviewWin.onDragDropEvent(async (event) => {
          if (!event || !event.payload) return;
          if (event.payload.type === "enter" || event.payload.type === "over") {
            activatePulse();
          } else if (event.payload.type === "leave") {
            deactivatePulse();
          } else if (event.payload.type === "drop") {
            deactivatePulse();
            if (event.payload.paths && event.payload.paths.length > 0) {
              const activeTool = document.querySelector("#ytdlp-nav .nav-link.active, #tool-nav .nav-link.active, #image-ai-nav .nav-link.active, #pdf-nav .nav-link.active")?.dataset?.tool;
              const isImageTool = [
                "bg_remover",
                "ai_upscaler",
                "vectorizer",
                "restore_denoise",
                "icon_generator",
                "metadata_cleaner",
              ].includes(activeTool);

              const isPdfTool = activeTool === "pdf" || activeTool?.startsWith("pdf_");
              if (isPdfTool && typeof window.addPdfFilesToPdfQueue === "function") {
                window.addPdfFilesToPdfQueue(event.payload.paths);
              } else if (isImageTool) {
                // Decoupled: image_queue.js listens (was a direct import cycle).
                try {
                  document.dispatchEvent(
                    new CustomEvent("anedikit:add-image-files", {
                      detail: { paths: event.payload.paths },
                    })
                  );
                } catch (caughtErr) { reportError("js/media.js:initDragAndDrop", caughtErr); }
              } else if (activeTool === "audio_tags") {
                const { addAudioFilesToQueue } = await import("./audio_tags.js");
                await addAudioFilesToQueue(event.payload.paths);
              } else {
                await addFilesToBatch(event.payload.paths);
                if (onFileSelected) onFileSelected(mediaState.currentMediaInfo);
              }
            }
          }
        });
      }
    } catch (err) {
      console.warn("Tauri drag drop init error:", err);
    }
  }
}

// Re-export trimmer and timeline utilities from trimmer.js
export {
  formatSecondsToTimestamp,
  parseTimestampToSeconds,
  refreshWaveformDisplay,
  isAudioFile,
  isImageFile,
  isVideoFile,
  extractTimelineThumbnailsAsync,
  syncMediaDurationToTools,
  initTrimmerControls,
} from "./trimmer.js";

// NOTE: image-queue utilities moved out: import them from image_queue.js
// directly (the former re-export facade was half of a static import cycle).

export function clearAllMediaPreviewCaches() {
  let totalBytes = 0;

  // Calculate size in mediaState.mediaInfoCache
  for (const [k, v] of mediaState.mediaInfoCache.entries()) {
    totalBytes += (k.length * 2) + JSON.stringify(v).length * 2;
  }
  mediaState.mediaInfoCache.clear();

  // Calculate size in actionFrameCache (data URIs)
  for (const [k, v] of actionFrameCache.entries()) {
    totalBytes += (k.length * 2) + (typeof v === "string" ? v.length * 2 : 1024);
  }
  actionFrameCache.clear();

  // Calculate size in albumArtCache (data URIs)
  for (const [k, v] of albumArtCache.entries()) {
    totalBytes += (k.length * 2) + (typeof v === "string" ? v.length * 2 : 1024);
  }
  albumArtCache.clear();

  // Clear waveform peaks cache
  totalBytes += clearWaveformCache();

  // Calculate MB gained (min 0.1 MB for clear user feedback if empty)
  const mbGained = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(2) : "0.00";
  return parseFloat(mbGained);
}
