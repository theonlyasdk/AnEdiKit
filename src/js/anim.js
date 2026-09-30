import { reportError } from "./errors.js";
// AnEdiKit - Queue morph + ripple animation utilities (DOM-only, no app imports).
// Extracted from navigation.js so queue modules (media, image_queue, merge,
// audio_tags) stop importing navigation for generic animation helpers.
// navigation.js re-exports all three for backward compatibility.

// Material You soft ripple for settings items: a gentle primary wash
// sized to just cover the item from the press point. Skipped entirely
// under reduced motion / no-animations (CSS kills animations globally,
// so a spawned span would otherwise stick around forever).
export function attachMaterialRipple(element) {
  if (!element) return;
  element.addEventListener("mousedown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("no-animations");
    if (reduceMotion) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = Math.max(x, rect.width - x);
    const dy = Math.max(y, rect.height - y);
    const size = Math.ceil(Math.hypot(dx, dy) * 2);

    const ripple = document.createElement("span");
    ripple.className = "m3-ripple";
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    element.appendChild(ripple);
    // animationend removes it at opacity 0; the timeout is a backstop so
    // a missed event (hidden tab, toggled animations) can never leave a
    // visible wash stuck on the row.
    let gone = false;
    const remove = () => {
      if (gone) return;
      gone = true;
      ripple.remove();
    };
    ripple.addEventListener("animationend", remove);
    setTimeout(remove, 700);
  });
}

export function attachFluentRipple(element) {
  if (!element) return;
  element.addEventListener("mousedown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("no-animations");
    if (reduceMotion) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = Math.max(x, rect.width - x);
    const dy = Math.max(y, rect.height - y);
    const size = Math.ceil(Math.hypot(dx, dy) * 2);

    const ripple = document.createElement("span");
    ripple.className = "fluent-ripple";
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    element.appendChild(ripple);
    let gone = false;
    const remove = () => {
      if (gone) return;
      gone = true;
      ripple.remove();
    };
    ripple.addEventListener("animationend", remove);
    setTimeout(remove, 2100);
  });
}

// Smoothly morph a queue container across a re-render (empty drop card <->
// populated list) instead of snapping, using compositor-only properties
// (opacity, clip-path, transform) — never height/width, so no per-frame
// page reflow and no stutter under the frosted overlays.
// The old content fades out, swaps mid-flight, then the new content blooms
// Real box morph: crossfades between start box and end box while interpolating
// their size (width, height), position (x, y), and corner radius.
// Same-state updates (row add/remove, status flips) render instantly.
// Usage: animateQueueHeight(listEl, () => { ...existing render body... }).
export function animateQueueHeight(container, renderFn) {
  if (typeof renderFn !== "function") return;
  if (!container) {
    renderFn();
    return;
  }
  // Snap-finish any in-flight morph so rapid updates never stack.
  if (container._qhCleanup) {
    const fin = container._qhCleanup;
    container._qhCleanup = null;
    fin();
  }

  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("no-animations");
  if (reduceMotion || !container.offsetHeight) {
    renderFn();
    return;
  }

  const isEmptyCard = () => !!container.querySelector('[id$="-empty-msg"]');
  const wasEmpty = isEmptyCard();

  // Snapshot the starting visual box before renderFn runs
  const startChild = container.firstElementChild;
  const startTarget = startChild || container;
  const startRect = startTarget.getBoundingClientRect();
  const startStyle = window.getComputedStyle(startTarget);
  const startRadius = startStyle.borderRadius || "6px";
  const startW = startRect.width;
  const startH = startRect.height;
  const startLeft = startRect.left;
  const startTop = startRect.top;

  let cloneA = null;
  if (startChild) {
    cloneA = startChild.cloneNode(true);
    cloneA.removeAttribute("id");
    cloneA.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    cloneA.querySelectorAll(".audio-queue-drag-overlay").forEach((el) => el.remove());
    if (startChild.scrollTop) {
      cloneA.scrollTop = startChild.scrollTop;
    }
  }

  // Execute the synchronous DOM render
  renderFn();

  const stillEmpty = isEmptyCard();
  if (wasEmpty === stillEmpty || !cloneA) {
    // Same-state refresh: render plainly, no box morph
    return;
  }

  const endChild = container.firstElementChild;
  if (!endChild) return;

  const endRect = endChild.getBoundingClientRect();
  const endStyle = window.getComputedStyle(endChild);
  const endRadius = endStyle.borderRadius || "6px";
  const endW = endRect.width;
  const endH = endRect.height;
  const endLeft = endRect.left;
  const endTop = endRect.top;

  if (startW <= 0 || startH <= 0 || endW <= 0 || endH <= 0) {
    return;
  }

  const deltaX = startLeft - endLeft;
  const deltaY = startTop - endTop;

  // Retrieve motion tokens with safe fallbacks
  const computedRoot = window.getComputedStyle(document.documentElement);
  const durationStr = computedRoot.getPropertyValue("--duration-medium").trim();
  const duration = durationStr.endsWith("ms")
    ? parseFloat(durationStr)
    : (durationStr.endsWith("s") ? parseFloat(durationStr) * 1000 : 350);
  const easing =
    computedRoot.getPropertyValue("--ease-smooth-out").trim() ||
    "cubic-bezier(0.22, 1, 0.36, 1)";

  // Morph shell wrapper handles bounding box size, position, radius and clipping
  const morphShell = document.createElement("div");
  morphShell.className = "queue-box-morph-shell";
  morphShell.style.position = "relative";
  morphShell.style.boxSizing = "border-box";
  morphShell.style.overflow = "hidden";
  morphShell.style.pointerEvents = "none";
  morphShell.style.width = `${startW}px`;
  morphShell.style.height = `${startH}px`;
  morphShell.style.borderRadius = startRadius;
  morphShell.style.transformOrigin = "top left";
  morphShell.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
  morphShell.style.willChange = "width, height, transform, border-radius";
  morphShell.style.backgroundColor =
    endStyle.backgroundColor || startStyle.backgroundColor || "var(--bs-tertiary-bg)";

  // Lock container height to interpolate smoothly so adjacent elements glide
  container.style.position = "relative";
  container.style.overflow = "hidden";
  container.style.height = `${startH}px`;
  container.style.willChange = "height";

  // Configure start box clone (Layer A)
  cloneA.style.position = "absolute";
  cloneA.style.top = "0";
  cloneA.style.left = "0";
  cloneA.style.width = "100%";
  cloneA.style.height = "100%";
  cloneA.style.margin = "0";
  cloneA.style.maxHeight = "none";
  cloneA.style.overflow = "hidden";
  cloneA.style.boxSizing = "border-box";
  cloneA.style.pointerEvents = "none";
  cloneA.style.willChange = "opacity";
  cloneA.style.zIndex = "1";
  cloneA.style.borderRadius = startRadius;

  // Configure end box element (Layer B)
  endChild.style.position = "absolute";
  endChild.style.top = "0";
  endChild.style.left = "0";
  endChild.style.width = "100%";
  endChild.style.height = "100%";
  endChild.style.margin = "0";
  endChild.style.maxHeight = "none";
  endChild.style.overflow = "hidden";
  endChild.style.boxSizing = "border-box";
  endChild.style.pointerEvents = "none";
  endChild.style.willChange = "opacity";
  endChild.style.zIndex = "2";
  endChild.style.opacity = "0";
  endChild.style.borderRadius = endRadius;

  // Assemble inside container
  container.insertBefore(morphShell, endChild);
  morphShell.appendChild(cloneA);
  morphShell.appendChild(endChild);

  let finished = false;
  let safetyTimer = 0;

  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(safetyTimer);

    try {
      containerAnim?.cancel?.();
      shellAnim?.cancel?.();
      cloneAnim?.cancel?.();
      endAnim?.cancel?.();
    } catch (caughtErr) { reportError("js/anim.js:animateQueueHeight", caughtErr); }

    if (morphShell.parentNode === container) {
      container.insertBefore(endChild, morphShell);
      morphShell.remove();
    }
    cloneA.remove();

    endChild.style.position = "";
    endChild.style.top = "";
    endChild.style.left = "";
    endChild.style.width = "";
    endChild.style.height = "";
    endChild.style.margin = "";
    endChild.style.maxHeight = "";
    endChild.style.overflow = "";
    endChild.style.boxSizing = "";
    endChild.style.pointerEvents = "";
    endChild.style.willChange = "";
    endChild.style.zIndex = "";
    endChild.style.opacity = "";
    endChild.style.borderRadius = "";

    container.style.position = "";
    container.style.overflow = "";
    container.style.height = "";
    container.style.willChange = "";

    if (container._qhCleanup === finish) {
      container._qhCleanup = null;
    }
  };

  container._qhCleanup = finish;

  // Animate bounding boxes, positions, corner radiuses, and crossfading opacities
  const containerAnim = container.animate(
    [
      { height: `${startH}px` },
      { height: `${endH}px` }
    ],
    { duration, easing, fill: "forwards" }
  );

  const shellAnim = morphShell.animate(
    [
      {
        width: `${startW}px`,
        height: `${startH}px`,
        transform: `translate(${deltaX}px, ${deltaY}px)`,
        borderRadius: startRadius
      },
      {
        width: `${endW}px`,
        height: `${endH}px`,
        transform: "translate(0px, 0px)",
        borderRadius: endRadius
      }
    ],
    { duration, easing, fill: "forwards" }
  );

  const cloneAnim = cloneA.animate(
    [
      { opacity: 1 },
      { opacity: 0 }
    ],
    { duration, easing, fill: "forwards" }
  );

  const endAnim = endChild.animate(
    [
      { opacity: 0 },
      { opacity: 1 }
    ],
    { duration, easing, fill: "forwards" }
  );

  shellAnim.onfinish = finish;
  safetyTimer = setTimeout(finish, duration + 100);
}
