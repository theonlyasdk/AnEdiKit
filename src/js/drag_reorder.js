// Universal Drag-and-Drop Vertical Reordering Engine
// Provides 60fps vertical pointer dragging, midpoint threshold slot targeting,
// sibling shift transforms, auto-scrolling at container edges, and seamless release animations.

/**
 * Setup reusable vertical drag-and-drop reordering on a list item
 *
 * @param {Object} options
 * @param {HTMLElement} options.itemEl - The container element being dragged
 * @param {HTMLElement} options.dragHandle - The handle element capturing pointer events
 * @param {number} options.index - The current index in the list
 * @param {HTMLElement} options.listContainer - The parent list container
 * @param {string} options.itemSelector - CSS selector matching all list items (e.g. '.batch-queue-item')
 * @param {function(number, number): void} options.onReorder - Callback called with (startIndex, targetIndex) upon drop
 * @param {string} [options.droppedHighlightSelector] - Optional selector template with {index} to pulse on completion
 */
export function setupListDragAndDrop({
  itemEl,
  dragHandle,
  index,
  listContainer,
  itemSelector,
  onReorder,
  droppedHighlightSelector,
}) {
  if (!dragHandle || !itemEl || !listContainer) return;

  dragHandle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const allItemEls = Array.from(listContainer.querySelectorAll(itemSelector));
    if (allItemEls.length <= 1) return;

    const startY = e.clientY;
    const startIndex = index;
    let targetIndex = index;

    // Get initial geometry snapshot
    const rects = allItemEls.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height, mid: r.top + r.height / 2 };
    });

    const draggedHeight = rects[startIndex].height;
    const gap = rects.length > 1
      ? Math.max(0, rects[1].top - rects[0].bottom)
      : 0;

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

      // Strictly locked to vertical Y axis
      itemEl.style.transform = `translateY(${totalDeltaY}px)`;

      const currentMid = rects[startIndex].mid + totalDeltaY;

      // Determine target slot using threshold midpoints between adjacent items
      let newTarget = 0;
      for (let i = 0; i < rects.length - 1; i++) {
        const threshold = (rects[i].mid + rects[i + 1].mid) / 2;
        if (currentMid >= threshold) {
          newTarget = i + 1;
        }
      }
      targetIndex = Math.max(0, Math.min(rects.length - 1, newTarget));

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
          finalTranslateY = (rects[targetIndex].bottom - draggedHeight) - rects[startIndex].top;
        } else {
          finalTranslateY = rects[targetIndex].top - rects[startIndex].top;
        }
      }

      itemEl.classList.add("is-releasing");
      itemEl.style.setProperty("transition", "transform 0.15s cubic-bezier(0.2, 0.9, 0.3, 1), box-shadow 0.15s ease", "important");
      itemEl.style.transform = `translateY(${finalTranslateY}px)`;
      itemEl.style.boxShadow = "none";

      let finished = false;
      const onTransitionEnd = () => {
        if (finished) return;
        finished = true;
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
        if (typeof onReorder === "function") {
          onReorder(startIndex, targetIndex);
        }

        if (droppedHighlightSelector) {
          const sel = droppedHighlightSelector.replace("{index}", finalIdx);
          const droppedEl = listContainer.querySelector(sel);
          if (droppedEl) {
            droppedEl.classList.add("item-dropped-highlight");
            setTimeout(() => droppedEl.classList.remove("item-dropped-highlight"), 500);
          }
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
