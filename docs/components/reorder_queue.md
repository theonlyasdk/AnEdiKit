# Drag and Drop Reordering Component

AnEdiKit provides a 60fps vertical pointer drag-and-drop reordering engine for list items across the application, including the UserKit Visual Blocks Builder and the yt-dlp Filename Format Editor.

---

## Files & Architecture

- **JavaScript Module**: `src/js/drag_reorder.js`  
  Exports `setupListDragAndDrop(options)` to attach pointer listeners, calculate midpoint slot thresholds, apply Y-axis shift transforms to sibling elements, manage edge auto-scrolling, and animate item release.

- **Stylesheet**: `src/css/drag_reorder.css` (also aligned in `src/kits/kits.css`)  
  Provides standardized CSS utility classes for drag rows and handles (`.drag-reorder-row`, `.drag-reorder-handle`, `.is-dragging`, `.is-releasing`).

---

## Usage Guide

### 1. HTML Structure

Each draggable item should be wrapped inside a parent scrollable container.

```html
<div id="my-list-container" class="border rounded bg-body p-0 overflow-hidden">
  <div class="border-bottom drag-reorder-row bg-body px-3 py-2 d-flex align-items-center justify-content-between gap-2 user-select-none">
    <span class="drag-reorder-handle text-secondary cursor-grab p-1 flex-shrink-0">
      <ion-icon name="reorder-two-outline" class="fs-5"></ion-icon>
    </span>
    <!-- Custom Item Content -->
  </div>
</div>
```

### 2. CSS Integration

Ensure `drag_reorder.css` is included in your view or HTML header:

```html
<link rel="stylesheet" href="css/drag_reorder.css" />
```

Key CSS classes:
- `.drag-reorder-row`: Base row styling with smooth transform and background transitions.
- `.drag-reorder-handle`: Handle element with `cursor: grab` and `touch-action: none`.
- `.is-dragging`: Applied while active dragging occurs (elevated z-index, box-shadow, opacity).
- `.is-releasing`: Applied during drop transition animation to resting slot.

### 3. JavaScript Initialization

Call `setupListDragAndDrop` when rendering items:

```javascript
import { setupListDragAndDrop } from "./drag_reorder.js";

function renderList() {
  const listContainer = document.getElementById("my-list-container");
  listContainer.innerHTML = "";

  myItems.forEach((item, index) => {
    const itemEl = document.createElement("div");
    itemEl.className = "border-bottom drag-reorder-row bg-body px-3 py-2 d-flex align-items-center justify-content-between gap-2 user-select-none";

    const dragHandle = document.createElement("span");
    dragHandle.className = "drag-reorder-handle text-secondary cursor-grab p-1 flex-shrink-0";
    dragHandle.innerHTML = `<ion-icon name="reorder-two-outline" class="fs-5"></ion-icon>`;

    // Append handle and item controls to itemEl ...
    listContainer.appendChild(itemEl);

    // Attach vertical pointer drag reordering
    setupListDragAndDrop({
      itemEl,
      dragHandle,
      index,
      listContainer,
      itemSelector: ".drag-reorder-row",
      onReorder: (startIndex, targetIndex) => {
        if (targetIndex !== startIndex && targetIndex >= 0 && targetIndex < myItems.length) {
          const moved = myItems.splice(startIndex, 1)[0];
          myItems.splice(targetIndex, 0, moved);
        }
        renderList();
      },
    });
  });
}
```

---

## Features

- **60fps Midpoint Targeting**: Calculates real-time midpoint threshold targets for immediate layout responsiveness.
- **Strict Y-Axis Lock**: Keeps dragged items locked vertically while pointer movements occur.
- **Edge Auto-Scroll**: Smoothly scrolls parent containers when dragged items approach top or bottom boundaries.
- **Release Animations**: Applies cubic-bezier transition curve on release to glide items into their target slots.
