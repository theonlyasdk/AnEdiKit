// Image AI Queue State, UI Management & Lightbox Module
import {
  loadSavedImageAiQueue,
  saveImageAiQueue,
} from "./storage.js";
import { selectMediaFiles } from "./media.js";

let imageAiQueue = loadSavedImageAiQueue();

export function initSavedImageAiQueue() {
  imageAiQueue = loadSavedImageAiQueue();
  renderImageAiQueueUI();
}

export function getImageAiQueue() {
  return imageAiQueue;
}

export function updateImageAiItemStatus(idx, status, resultPath = null) {
  if (idx >= 0 && idx < imageAiQueue.length) {
    imageAiQueue[idx].status = status; // "pending", "processing", "done", "error"
    if (resultPath) {
      imageAiQueue[idx].resultPath = resultPath;
    }
    saveImageAiQueue(imageAiQueue);
    renderImageAiQueueUI();
  }
}

export function updateActiveImageAiProgress(msg, pct) {
  const processingSpinner = document.querySelector(".image-queue-item .spinner-border");
  if (processingSpinner) {
    const badge = processingSpinner.closest(".image-queue-status-badge");
    if (badge) {
      const isDownloading = msg && msg.toLowerCase().includes("downloading");
      const label = isDownloading ? `Downloading ${pct}%` : `Processing ${pct}%`;
      const badgeClass = isDownloading ? "bg-info-subtle text-info-emphasis" : "bg-primary-subtle text-primary-emphasis";
      badge.innerHTML = `<span class="badge ${badgeClass} d-inline-flex align-items-center gap-1"><span class="spinner-border spinner-border-sm" style="width: 10px; height: 10px;" role="status"></span> ${label}</span>`;
    }
  }
}

export function removeImageAiQueueItem(idx) {
  if (idx >= 0 && idx < imageAiQueue.length) {
    imageAiQueue.splice(idx, 1);
    saveImageAiQueue(imageAiQueue);
    renderImageAiQueueUI();
  }
}

export function clearImageAiQueue() {
  imageAiQueue = [];
  saveImageAiQueue(imageAiQueue);
  renderImageAiQueueUI();
}

export async function addImageFilesToQueue(paths) {
  if (!paths || paths.length === 0) return;
  for (const p of paths) {
    if (!p) continue;
    if (!imageAiQueue.some((item) => item.path === p)) {
      const fileName = p.split(/[/\\]/).pop() || p;
      imageAiQueue.push({
        path: p,
        name: fileName,
        status: "pending",
        resultPath: null,
      });
    }
  }
  saveImageAiQueue(imageAiQueue);
  renderImageAiQueueUI();
}

export function renderImageAiQueueUI() {
  const countEl = document.getElementById("image-ai-queue-count");
  const listEl = document.getElementById("image-ai-queue-list");
  const btnAdd = document.getElementById("btn-image-add");
  const btnClear = document.getElementById("btn-image-clear");
  const btnExecute = document.getElementById("btn-execute");

  if (countEl) countEl.textContent = imageAiQueue.length.toString();
  if (btnAdd) btnAdd.classList.toggle("d-none", imageAiQueue.length === 0);
  if (btnClear) btnClear.classList.toggle("d-none", imageAiQueue.length === 0);

  if (imageAiQueue.length === 0) {
    listEl.className = "mb-3";
    listEl.style.maxHeight = "";
    listEl.style.overflowY = "visible";
    listEl.innerHTML = `
      <div class="list-group-item text-body-secondary text-center py-5 d-flex flex-column align-items-center justify-content-center gap-2 rounded bg-body-tertiary" id="image-ai-empty-msg" style="border: 2px dashed var(--bs-border-color); cursor: pointer; overscroll-behavior: none;">
        <ion-icon name="images-outline" class="fs-2 text-secondary opacity-50 mb-1"></ion-icon>
        <span class="fw-medium text-body" id="image-drop-label">Drop images here or click to select</span>
        <span class="small text-body-secondary" id="image-drop-sublabel">Supports PNG, JPG, WebP, BMP, TIFF, SVG</span>
        <button class="btn btn-outline-primary btn-sm mt-2" type="button" id="btn-image-add-empty" title="Add images to queue">
          <ion-icon name="folder-open-outline" class="me-1"></ion-icon> Select Images
        </button>
      </div>
    `;
    const btnEmpty = document.getElementById("btn-image-add-empty");
    const emptyMsg = document.getElementById("image-ai-empty-msg");
    const pickHandler = async () => {
      const selected = await selectMediaFiles("image");
      if (selected && selected.length > 0) {
        await addImageFilesToQueue(selected);
      }
    };
    if (btnEmpty) btnEmpty.addEventListener("click", pickHandler);
    if (emptyMsg) emptyMsg.addEventListener("click", (e) => {
      if (!e.target.closest("button")) pickHandler();
    });

    if (btnExecute && btnExecute.textContent !== "Cancel") {
      btnExecute.textContent = "Execute";
    }
    return;
  }

  listEl.className = "list-group border rounded overflow-y-auto mb-3";
  listEl.style.maxHeight = "260px";
  listEl.style.overflowY = "auto";
  listEl.style.overscrollBehavior = "contain";

  if (btnExecute && btnExecute.textContent !== "Cancel") {
    btnExecute.textContent = imageAiQueue.length > 1 ? `Execute (${imageAiQueue.length})` : "Execute";
  }

  const placeholderHtml = `
    <div id="image-queue-drop-placeholder" class="list-group-item image-queue-drop-placeholder text-primary py-3 text-center d-flex align-items-center justify-content-center gap-2 d-none" style="cursor: pointer;">
      <ion-icon name="cloud-upload-outline" class="fs-5 text-primary"></ion-icon>
      <span class="fw-semibold text-primary">Drop here to import</span>
    </div>
  `;

  listEl.innerHTML = imageAiQueue
    .map((item, idx) => {
      const assetSrc = window.__TAURI__?.core?.convertFileSrc
        ? window.__TAURI__.core.convertFileSrc(item.path)
        : "";

      let statusBadge = "";
      let compareBtn = "";

      if (item.status === "processing") {
        statusBadge = `<span class="badge bg-primary-subtle text-primary-emphasis d-inline-flex align-items-center gap-1"><span class="spinner-border spinner-border-sm" style="width: 10px; height: 10px;" role="status"></span> Processing</span>`;
      } else if (item.status === "skipped") {
        statusBadge = `<span class="badge bg-warning-subtle text-warning-emphasis"><ion-icon name="warning-outline"></ion-icon> Skipped (Missing)</span>`;
      } else if (item.status === "done") {
        statusBadge = `<span class="badge bg-success-subtle text-success-emphasis"><ion-icon name="checkmark-outline"></ion-icon> Done</span>`;
        if (item.resultPath) {
          compareBtn = `<button class="btn btn-primary btn-sm py-0 px-2 btn-image-compare me-1" data-comp-idx="${idx}" type="button" title="View sliding comparison"><ion-icon name="grid-outline" class="me-1"></ion-icon> Compare</button>`;
        }
      } else if (item.status === "error") {
        statusBadge = `<span class="badge bg-danger-subtle text-danger-emphasis"><ion-icon name="close-outline"></ion-icon> Failed</span>`;
      }

      return `
        <div class="list-group-item image-queue-item d-flex justify-content-between align-items-center py-2 px-3" data-item-idx="${idx}">
          <div class="d-flex align-items-center gap-2 text-truncate me-2 flex-grow-1">
            <span class="image-queue-drag-handle text-secondary cursor-grab p-1 flex-shrink-0" data-drag-idx="${idx}" title="Drag vertically to reorder">
              <ion-icon name="reorder-two-outline" class="fs-5"></ion-icon>
            </span>
            <div class="d-flex align-items-center gap-3 text-truncate flex-grow-1 btn-image-preview-thumb" data-preview-idx="${idx}" style="cursor: pointer;" title="Click to expand preview">
              <div class="image-queue-thumb-wrapper transparency-grid border flex-shrink-0 position-relative">
                <img class="image-queue-thumb" src="${assetSrc}" alt="${item.name}" onerror="this.onerror=null; this.classList.add('d-none'); this.nextElementSibling?.classList.remove('d-none'); const qItem = this.closest('.image-queue-item'); if (qItem) { qItem.classList.add('image-item-deleted'); const title = qItem.querySelector('.image-queue-item-title'); if (title) { title.classList.remove('text-body'); title.classList.add('text-danger', 'text-decoration-line-through'); } const badge = qItem.querySelector('.image-queue-status-badge'); if (badge) { badge.className = 'badge bg-danger-subtle text-danger image-queue-status-badge'; badge.innerHTML = '<ion-icon name=\\'alert-circle-outline\\' class=\\'me-1\\'></ion-icon>Deleted'; } }" />
                <div class="image-queue-thumb-fallback d-none position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-dark">
                  <ion-icon name="alert-circle-outline" class="text-danger fs-5"></ion-icon>
                </div>
                <div class="image-queue-thumb-overlay">
                  <ion-icon name="scan-outline"></ion-icon>
                </div>
              </div>
              <div class="d-flex flex-column text-truncate">
                <span class="fw-medium text-body text-truncate image-queue-item-title" style="font-size: 0.88rem;">${item.name}</span>
                <span class="small text-body-secondary text-truncate" style="font-size: 0.75rem;">${item.path}</span>
              </div>
            </div>
          </div>
          <div class="d-flex align-items-center gap-2 flex-shrink-0">
            <span class="image-queue-status-badge">${statusBadge}</span>
            ${compareBtn}
            <button class="btn btn-outline-danger btn-sm py-0 px-2 btn-image-del" data-del-img-idx="${idx}" type="button" title="Remove from queue">
              <ion-icon name="trash-outline"></ion-icon>
            </button>
          </div>
        </div>
      `;
    })
    .join("") + placeholderHtml;

  // Setup interactive vertical pointer drag with real-time shift animation for all queue items
  const itemEls = listEl.querySelectorAll(".image-queue-item");
  itemEls.forEach((itemEl, index) => {
    const handle = itemEl.querySelector(".image-queue-drag-handle");
    if (handle) {
      setupImageQueueItemDrag(itemEl, handle, index, listEl);
    }
  });

  const dropPlaceholder = document.getElementById("image-queue-drop-placeholder");
  if (dropPlaceholder) {
    dropPlaceholder.addEventListener("click", async () => {
      const selected = await selectMediaFiles("image");
      if (selected && selected.length > 0) {
        await addImageFilesToQueue(selected);
      }
    });
  }

  // Event delegation for queue list interactions
  listEl.onclick = (e) => {
    // Preview click
    const previewBtn = e.target.closest(".btn-image-preview-thumb");
    if (previewBtn) {
      e.stopPropagation();
      const idx = parseInt(previewBtn.getAttribute("data-preview-idx"), 10);
      const item = imageAiQueue[idx];
      if (item && item.path) {
        const thumbEl = previewBtn.querySelector(".image-queue-thumb-wrapper") || previewBtn;
        openImageLightbox(item.path, item.name, thumbEl);
      }
      return;
    }

    // Delete click
    const delBtn = e.target.closest(".btn-image-del");
    if (delBtn) {
      e.stopPropagation();
      const idx = parseInt(delBtn.getAttribute("data-del-img-idx"), 10);
      removeImageAiQueueItem(idx);
      return;
    }

    // Compare click
    const compBtn = e.target.closest(".btn-image-compare");
    if (compBtn) {
      e.stopPropagation();
      const idx = parseInt(compBtn.getAttribute("data-comp-idx"), 10);
      const item = imageAiQueue[idx];
      if (item && item.resultPath) {
        import("./comparison.js").then((mod) => {
          mod.openComparisonModal(item.path, item.resultPath, "Enhanced Image");
        });
      }
      return;
    }
  };
}

function setupImageQueueItemDrag(itemEl, dragHandle, index, listContainer) {
  dragHandle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const allItemEls = Array.from(listContainer.querySelectorAll(".image-queue-item"));
    if (allItemEls.length <= 1) return;

    const startY = e.clientY;
    const startIndex = index;
    let targetIndex = index;

    // Get initial geometry
    const rects = allItemEls.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height, mid: r.top + r.height / 2 };
    });

    // Lock main workspace scroll during drag to prevent outer view from scrolling
    const workspaceEl = document.getElementById("tool-workspace");
    const originalWorkspaceOverflowY = workspaceEl ? workspaceEl.style.overflowY : "";
    if (workspaceEl) workspaceEl.style.overflowY = "hidden";

    // Prevent listbox overflow clipping and scrollbar flicker during active drag
    const originalOverflowY = listContainer.style.overflowY;
    const originalOverflowX = listContainer.style.overflowX;
    listContainer.style.overflowY = "visible";
    listContainer.style.overflowX = "visible";

    itemEl.classList.add("is-dragging");
    try {
      dragHandle.setPointerCapture(e.pointerId);
    } catch (_) {}

    const startScrollTop = listContainer.scrollTop;
    let autoScrollRaf = null;
    let lastClientY = startY;

    const updateItemPosition = () => {
      const scrollDelta = listContainer.scrollTop - startScrollTop;
      const pointerDeltaY = lastClientY - startY;
      const totalDeltaY = pointerDeltaY + scrollDelta;

      // Stick strictly to the pointer position relative to starting viewport point
      itemEl.style.transform = `translateY(${totalDeltaY}px)`;

      const currentMid = rects[startIndex].mid + totalDeltaY;

      // Determine target slot
      let newTarget = startIndex;
      for (let i = 0; i < rects.length; i++) {
        if (i < startIndex) {
          if (currentMid < rects[i].top + rects[i].height * 0.5) {
            newTarget = i;
            break;
          }
        } else if (i > startIndex) {
          if (currentMid > rects[i].top + rects[i].height * 0.5) {
            newTarget = i;
          }
        }
      }
      targetIndex = newTarget;

      // Smoothly shift other items
      allItemEls.forEach((otherEl, i) => {
        if (i === startIndex) return;
        if (startIndex < targetIndex) {
          if (i > startIndex && i <= targetIndex) {
            otherEl.style.transform = `translateY(-${draggedHeight + gap}px)`;
          } else {
            otherEl.style.transform = "translateY(0)";
          }
        } else if (startIndex > targetIndex) {
          if (i < startIndex && i >= targetIndex) {
            otherEl.style.transform = `translateY(${draggedHeight + gap}px)`;
          } else {
            otherEl.style.transform = "translateY(0)";
          }
        } else {
          otherEl.style.transform = "translateY(0)";
        }
      });
    };

    const checkAutoScroll = () => {
      const containerRect = listContainer.getBoundingClientRect();
      const edgeZone = 40; // 40px top/bottom threshold zone
      const topThreshold = containerRect.top + edgeZone;
      const bottomThreshold = containerRect.bottom - edgeZone;

      let scrolled = false;
      if (lastClientY < topThreshold && listContainer.scrollTop > 0) {
        const ratio = Math.max(0.2, (topThreshold - lastClientY) / edgeZone);
        const speed = Math.max(2, Math.round(ratio * 8));
        listContainer.scrollTop -= speed;
        scrolled = true;
      } else if (lastClientY > bottomThreshold && listContainer.scrollTop < listContainer.scrollHeight - listContainer.clientHeight) {
        const ratio = Math.max(0.2, (lastClientY - bottomThreshold) / edgeZone);
        const speed = Math.max(2, Math.round(ratio * 8));
        listContainer.scrollTop += speed;
        scrolled = true;
      }

      if (scrolled) {
        updateItemPosition();
        autoScrollRaf = requestAnimationFrame(checkAutoScroll);
      } else {
        autoScrollRaf = null;
      }
    };

    const onPointerMove = (moveEvt) => {
      lastClientY = moveEvt.clientY;
      updateItemPosition();

      const containerRect = listContainer.getBoundingClientRect();
      const edgeZone = 40;
      const nearEdge = (lastClientY < containerRect.top + edgeZone && listContainer.scrollTop > 0) ||
                       (lastClientY > containerRect.bottom - edgeZone && listContainer.scrollTop < listContainer.scrollHeight - listContainer.clientHeight);

      if (nearEdge && !autoScrollRaf) {
        autoScrollRaf = requestAnimationFrame(checkAutoScroll);
      } else if (!nearEdge && autoScrollRaf) {
        cancelAnimationFrame(autoScrollRaf);
        autoScrollRaf = null;
      }
    };

    const onPointerUp = (upEvt) => {
      if (autoScrollRaf) {
        cancelAnimationFrame(autoScrollRaf);
        autoScrollRaf = null;
      }
      try {
        dragHandle.releasePointerCapture(upEvt.pointerId);
      } catch (_) {}
      dragHandle.removeEventListener("pointermove", onPointerMove);
      dragHandle.removeEventListener("pointerup", onPointerUp);
      dragHandle.removeEventListener("pointercancel", onPointerUp);

      if (workspaceEl) workspaceEl.style.overflowY = originalWorkspaceOverflowY;

      // Calculate final resting position offset for smooth release transition
      let finalTranslateY = 0;
      if (targetIndex !== startIndex) {
        if (targetIndex > startIndex) {
          finalTranslateY = rects[targetIndex].bottom - rects[startIndex].bottom;
        } else {
          finalTranslateY = rects[targetIndex].top - rects[startIndex].top;
        }
      }

      itemEl.classList.add("is-releasing");
      itemEl.style.setProperty("transition", "transform 0.15s cubic-bezier(0.2, 0.9, 0.3, 1), box-shadow 0.15s ease", "important");
      itemEl.style.transform = `translateY(${finalTranslateY}px)`;
      itemEl.style.boxShadow = "none";

      const onTransitionEnd = () => {
        itemEl.removeEventListener("transitionend", onTransitionEnd);
        listContainer.style.overflowY = originalOverflowY;
        listContainer.style.overflowX = originalOverflowX;

        itemEl.classList.remove("is-dragging", "is-releasing");
        itemEl.style.transition = "";
        itemEl.style.transform = "";
        itemEl.style.boxShadow = "";
        allItemEls.forEach((el) => {
          el.style.transform = "";
        });

        const finalIdx = targetIndex;
        if (targetIndex !== startIndex && targetIndex >= 0 && targetIndex < imageAiQueue.length) {
          const moved = imageAiQueue.splice(startIndex, 1)[0];
          imageAiQueue.splice(targetIndex, 0, moved);
          saveImageAiQueue(imageAiQueue);
        }
        renderImageAiQueueUI();

        // Show release placement animation on the target element
        const droppedEl = listContainer.querySelector(`[data-item-idx="${finalIdx}"]`);
        if (droppedEl) {
          droppedEl.classList.add("item-dropped-highlight");
          setTimeout(() => droppedEl.classList.remove("item-dropped-highlight"), 500);
        }
      };

      itemEl.addEventListener("transitionend", onTransitionEnd);
      setTimeout(onTransitionEnd, 180);
    };

    dragHandle.addEventListener("pointermove", onPointerMove);
    dragHandle.addEventListener("pointerup", onPointerUp);
    dragHandle.addEventListener("pointercancel", onPointerUp);
  });
}

let lastHeroSourceEl = null;
let lastHeroRect = null;
let lightboxOpenTimestamp = 0;
let isLightboxActive = false;
let lastFinalW = 800;
let lastFinalH = 600;

export function initImageLightbox() {
  const modal = document.getElementById("image-lightbox-modal");
  const card = document.getElementById("image-lightbox-card");
  const backdrop = document.getElementById("image-lightbox-backdrop");
  const btnClose = document.getElementById("btn-lightbox-close");
  if (!modal) return;

  const closeModal = () => {
    if (!isLightboxActive) return;
    isLightboxActive = false;

    // Cancel ongoing animations on card and backdrop
    if (card) card.getAnimations().forEach((a) => a.cancel());
    if (backdrop) backdrop.getAnimations().forEach((a) => a.cancel());

    const metaEl = document.getElementById("image-lightbox-meta");
    if (metaEl) metaEl.style.opacity = "0";

    const currentSourceRect = (lastHeroSourceEl && lastHeroSourceEl.isConnected)
      ? (lastHeroSourceEl.querySelector(".image-queue-thumb-wrapper") || lastHeroSourceEl).getBoundingClientRect()
      : lastHeroRect;

    const sourceRect = (currentSourceRect && currentSourceRect.width > 0)
      ? currentSourceRect
      : {
          left: window.innerWidth / 2 - 22,
          top: window.innerHeight / 2 - 22,
          width: 44,
          height: 44,
        };

    const finalW = Math.max(100, lastFinalW);
    const finalH = Math.max(100, lastFinalH);

    const scale = Math.max(sourceRect.width / finalW, sourceRect.height / finalH);

    const thumbCenterX = sourceRect.left + sourceRect.width / 2;
    const thumbCenterY = sourceRect.top + sourceRect.height / 2;
    const destCenterX = window.innerWidth / 2;
    const destCenterY = (window.innerHeight - 30) / 2;

    const deltaX = thumbCenterX - destCenterX;
    const deltaY = thumbCenterY - destCenterY;

    // Animate backdrop fade out
    if (backdrop && backdrop.animate) {
      backdrop.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 220, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
      );
    }

    // Animate close button slide out
    modal.classList.remove("lightbox-visible");
    modal.classList.add("lightbox-closing");

    // Animate card smoothly back to thumbnail with opacity fade out
    if (card && card.animate) {
      const anim = card.animate(
        [
          { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
          { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scale})`, opacity: 0 }
        ],
        {
          duration: 220,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)"
        }
      );

      anim.onfinish = () => {
        modal.classList.add("d-none");
        modal.classList.remove("lightbox-closing");
        card.style.transform = "";
        card.style.opacity = "";
        if (backdrop) backdrop.style.opacity = "";
        if (metaEl) metaEl.style.opacity = "";
      };
      anim.oncancel = () => {
        modal.classList.add("d-none");
        modal.classList.remove("lightbox-closing");
        card.style.transform = "";
        card.style.opacity = "";
      };
    } else {
      modal.classList.add("d-none");
      modal.classList.remove("lightbox-closing");
    }
  };

  if (btnClose) {
    btnClose.addEventListener("click", (e) => {
      e.stopPropagation();
      closeModal();
    });
  }

  modal.addEventListener("click", (e) => {
    if (Date.now() - lightboxOpenTimestamp < 220) return;
    if (e.target === modal || e.target.id === "image-lightbox-backdrop") {
      closeModal();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isLightboxActive) {
      closeModal();
    }
  });
}

export function openImageLightbox(filePath, fileName = "Image Preview", sourceElement = null) {
  try {
    const modal = document.getElementById("image-lightbox-modal");
    const card = document.getElementById("image-lightbox-card");
    const backdrop = document.getElementById("image-lightbox-backdrop");
    const imgEl = document.getElementById("image-lightbox-img");
    const titleEl = document.getElementById("image-lightbox-title");
    const detailsEl = document.getElementById("image-lightbox-details");
    const metaEl = document.getElementById("image-lightbox-meta");
    const wrapper = document.getElementById("image-lightbox-wrapper");

    if (!modal || !imgEl || !card) return;

    lightboxOpenTimestamp = Date.now();
    isLightboxActive = true;
    lastHeroSourceEl = sourceElement;

    // Cancel any previous animations and clear inline transform/opacity
    card.getAnimations().forEach((a) => a.cancel());
    if (backdrop) backdrop.getAnimations().forEach((a) => a.cancel());
    card.style.transform = "";
    card.style.opacity = "";

    const assetSrc = window.__TAURI__?.core?.convertFileSrc && filePath
      ? window.__TAURI__.core.convertFileSrc(filePath)
      : filePath;

    const thumbImg = sourceElement ? (sourceElement.querySelector("img") || sourceElement) : null;
    const initialSrc = (thumbImg && thumbImg.src) ? thumbImg.src : assetSrc;

    const pathEl = document.getElementById("image-lightbox-path");

    if (titleEl) {
      titleEl.className = "mb-0 fw-medium text-truncate w-100";
      titleEl.textContent = fileName || (filePath ? filePath.split(/[/\\]/).pop() : "Image Preview");
    }
    if (detailsEl) {
      const ext = (fileName || filePath).split(".").pop().toUpperCase();
      detailsEl.className = "small text-white-50 text-truncate w-100 my-0";
      detailsEl.textContent = `${ext} Image`;
    }
    if (pathEl) {
      pathEl.className = "small text-white-50 text-truncate w-100";
      pathEl.textContent = filePath || "";
    }

    imgEl.onerror = () => {
      if (titleEl) {
        titleEl.className = "mb-0 fw-medium text-truncate text-danger text-decoration-line-through w-100";
      }
      if (detailsEl) {
        detailsEl.textContent = "Image was deleted";
        detailsEl.className = "small text-danger";
      }
      if (pathEl) {
        pathEl.textContent = filePath || "";
      }
    };

    // Get reliable source rect (from thumbnail wrapper or source element)
    const targetSourceEl = sourceElement
      ? (sourceElement.querySelector(".image-queue-thumb-wrapper") || sourceElement)
      : null;
    const rawStartRect = targetSourceEl ? targetSourceEl.getBoundingClientRect() : null;

    const startRect = (rawStartRect && rawStartRect.width > 0 && rawStartRect.height > 0)
      ? rawStartRect
      : {
          left: window.innerWidth / 2 - 22,
          top: window.innerHeight / 2 - 22,
          width: 44,
          height: 44,
        };
    lastHeroRect = startRect;

    if (metaEl) {
      metaEl.style.opacity = "0";
      metaEl.style.transition = "none";
    }

    const updateLightboxMeta = (natW, natH) => {
      if (detailsEl) {
        const ext = (fileName || filePath).split(".").pop().toUpperCase();
        const res = (natW > 0 && natH > 0) ? `${natW}x${natH}` : "";
        const parts = [`${ext} Image`];
        if (res) parts.push(res);
        detailsEl.textContent = parts.join(" • ");
      }
    };

    const runHeroAnimation = (natW, natH) => {
      updateLightboxMeta(natW, natH);
      // Calculate responsive destination size maintaining exact natural aspect ratio
      const maxW = Math.min(window.innerWidth * 0.84, 1200);
      const maxH = Math.min(window.innerHeight * 0.74, 800);
      const aspect = (natW > 0 && natH > 0) ? (natW / natH) : (16 / 9);

      let finalW, finalH;
      if (maxW / maxH > aspect) {
        finalH = maxH;
        finalW = maxH * aspect;
      } else {
        finalW = maxW;
        finalH = maxW / aspect;
      }

      lastFinalW = finalW;
      lastFinalH = finalH;

      if (wrapper) {
        wrapper.style.width = `${Math.round(finalW)}px`;
        wrapper.style.height = `${Math.round(finalH)}px`;
      }
      imgEl.style.width = "100%";
      imgEl.style.height = "100%";

      // Show modal container
      modal.classList.remove("d-none", "lightbox-closing");
      requestAnimationFrame(() => {
        modal.classList.add("lightbox-visible");
      });
      if (backdrop) backdrop.style.opacity = "1";

      // Compute exact geometry from viewport center (never top-left 0,0)
      const scale = Math.max(startRect.width / finalW, startRect.height / finalH);

      const thumbCenterX = startRect.left + startRect.width / 2;
      const thumbCenterY = startRect.top + startRect.height / 2;
      const destCenterX = window.innerWidth / 2;
      const destCenterY = (window.innerHeight - 30) / 2;

      const deltaX = thumbCenterX - destCenterX;
      const deltaY = thumbCenterY - destCenterY;

      // Animate backdrop fade in
      if (backdrop && backdrop.animate) {
        backdrop.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: 250, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
        );
      }

      // Animate Card hero expansion directly from thumbnail center
      if (card.animate) {
        const anim = card.animate(
          [
            {
              transform: `translate(${deltaX}px, ${deltaY}px) scale(${scale})`,
              opacity: 0.2
            },
            {
              transform: "translate(0px, 0px) scale(1)",
              opacity: 1
            }
          ],
          {
            duration: 260,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)"
          }
        );
        anim.onfinish = () => {
          card.style.transform = "";
          card.style.opacity = "1";
          if (metaEl) {
            metaEl.style.transition = "opacity 0.18s ease";
            metaEl.style.opacity = "1";
          }
        };
      } else if (metaEl) {
        metaEl.style.opacity = "1";
      }
    };

    imgEl.src = initialSrc;

    if (thumbImg && thumbImg.naturalWidth > 0 && thumbImg.naturalHeight > 0) {
      runHeroAnimation(thumbImg.naturalWidth, thumbImg.naturalHeight);
    } else if (imgEl.complete && imgEl.naturalWidth > 0) {
      runHeroAnimation(imgEl.naturalWidth, imgEl.naturalHeight);
    } else {
      const tempImg = new Image();
      tempImg.onload = () => {
        runHeroAnimation(tempImg.naturalWidth, tempImg.naturalHeight);
      };
      tempImg.onerror = () => {
        runHeroAnimation(800, 600);
      };
      tempImg.src = initialSrc;
    }

    // Upgrade to full resolution data URI in background
    if (window.__TAURI__?.core?.invoke && filePath) {
      window.__TAURI__.core.invoke("read_image_data", { filePath })
        .then((dataUri) => {
          if (dataUri && isLightboxActive) {
            imgEl.src = dataUri;
          }
        })
        .catch(() => {
          if (titleEl) {
            titleEl.className = "mb-0 fw-medium text-truncate text-danger text-decoration-line-through w-100";
          }
          if (detailsEl) {
            detailsEl.textContent = "Image was deleted";
            detailsEl.className = "small text-danger";
          }
          if (pathEl) {
            pathEl.textContent = filePath || "";
          }
        });
    }
  } catch (err) {
    console.error("Failed to open image lightbox:", err);
  }
}