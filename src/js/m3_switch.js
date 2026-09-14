// Material 3 Switch Draggable Handle Interaction Module
// Enables fluid horizontal dragging and snapping of .form-check-input[role="switch"] toggles

const DRAG_THRESHOLD = 3; // Minimum px movement to consider a drag gesture
const SWITCH_TRAVEL = 20; // 52px track - 24px thumb - 4px padding (2px left + 2px right) = 26px max, travel ~ 20-22px

let activeSwitch = null;
let startX = 0;
let initialChecked = false;
let isDragging = false;
let hasMoved = false;

function onPointerDown(e) {
  // Only primary mouse button or single touch
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  const target = e.currentTarget;
  if (!target || target.disabled) return;

  activeSwitch = target;
  startX = e.clientX;
  initialChecked = target.checked;
  isDragging = false;
  hasMoved = false;

  target.setPointerCapture(e.pointerId);
  target.classList.add("m3-switch-dragging");
  target.classList.add("m3-switch-active");
}

function onPointerMove(e) {
  if (!activeSwitch || e.currentTarget !== activeSwitch) return;

  const dx = e.clientX - startX;
  if (!isDragging && Math.abs(dx) > DRAG_THRESHOLD) {
    isDragging = true;
  }

  if (isDragging) {
    hasMoved = true;
    // Calculate current thumb position in range [0, 1]
    const baseOffset = initialChecked ? 1 : 0;
    const progress = Math.max(0, Math.min(1, baseOffset + dx / SWITCH_TRAVEL));

    activeSwitch.style.setProperty("--m3-drag-progress", progress.toFixed(3));
  }
}

function onPointerUp(e) {
  if (!activeSwitch || e.currentTarget !== activeSwitch) return;
  const target = activeSwitch;

  try {
    target.releasePointerCapture(e.pointerId);
  } catch (_) {}

  target.classList.remove("m3-switch-dragging");
  target.classList.remove("m3-switch-active");
  target.style.removeProperty("--m3-drag-progress");

  if (hasMoved && isDragging) {
    const dx = e.clientX - startX;
    const baseOffset = initialChecked ? 1 : 0;
    const progress = Math.max(0, Math.min(1, baseOffset + dx / SWITCH_TRAVEL));
    const newChecked = progress >= 0.5;

    if (newChecked !== target.checked) {
      target.checked = newChecked;
      // Dispatch both change and input events so framework / settings listeners trigger
      target.dispatchEvent(new Event("change", { bubbles: true }));
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  activeSwitch = null;
  isDragging = false;
  hasMoved = false;
}

function onPointerCancel(e) {
  if (!activeSwitch || e.currentTarget !== activeSwitch) return;
  const target = activeSwitch;

  try {
    target.releasePointerCapture(e.pointerId);
  } catch (_) {}

  target.classList.remove("m3-switch-dragging");
  target.classList.remove("m3-switch-active");
  target.style.removeProperty("--m3-drag-progress");

  activeSwitch = null;
  isDragging = false;
  hasMoved = false;
}

export function bindM3Switch(switchEl) {
  if (!switchEl || switchEl._m3DragBound) return;
  switchEl._m3DragBound = true;

  switchEl.addEventListener("pointerdown", onPointerDown);
  switchEl.addEventListener("pointermove", onPointerMove);
  switchEl.addEventListener("pointerup", onPointerUp);
  switchEl.addEventListener("pointercancel", onPointerCancel);
}

export function initM3Switches(root = document) {
  const switches = root.querySelectorAll('.form-switch .form-check-input, input[role="switch"]');
  switches.forEach(bindM3Switch);

  // Set up a MutationObserver on document.body so dynamic switches (like in kits) are automatically bound
  if (root === document && !window._m3SwitchObserverInitialized) {
    window._m3SwitchObserverInitialized = true;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches && (node.matches('.form-switch .form-check-input') || node.matches('input[role="switch"]'))) {
                bindM3Switch(node);
              }
              const nested = node.querySelectorAll ? node.querySelectorAll('.form-switch .form-check-input, input[role="switch"]') : [];
              nested.forEach(bindM3Switch);
            }
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

