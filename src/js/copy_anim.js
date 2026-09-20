// transitions-polish — copy confirmation animation for icon buttons.
// The current icon zooms and blurs out (--duration-quick: 150ms, --ease-smooth-out),
// the checkmark pops in (--duration-fast: 250ms, --ease-bounce), holds, then
// smoothly transitions back to the original icon in-place.
// Compositor-only (opacity, transform, filter) with DOM node preservation.

const FALLBACK_BOUNCE = "cubic-bezier(0.34, 1.36, 0.64, 1)";
const FALLBACK_SMOOTH = "cubic-bezier(0.22, 1, 0.36, 1)";

function token(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

export async function animateCopyConfirm(iconEl, opts = {}) {
  const confirmIcon = opts.confirmIcon || "checkmark-outline";
  const holdMs = opts.holdMs ?? 800;
  if (!iconEl) return;

  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("no-animations");

  // Dynamic helper: resolves white icon for green success backgrounds, green text for neutral backgrounds
  const getCheckClass = () => {
    const btn = iconEl.closest("button, .btn");
    const isGreenBg = btn && (btn.classList.contains("btn-success") || btn.classList.contains("copied"));
    return isGreenBg ? "text-white" : "text-success";
  };

  // No WAAPI or motion off: instant swap with the same hold timing.
  if (typeof iconEl.animate !== "function" || reduceMotion) {
    const original = iconEl.getAttribute("name") || "copy-outline";
    iconEl.setAttribute("name", confirmIcon);
    const activeCheckClass = getCheckClass();
    iconEl.classList.add(activeCheckClass);
    return new Promise((resolve) => {
      setTimeout(() => {
        if (iconEl.isConnected) {
          iconEl.setAttribute("name", original);
          iconEl.classList.remove(activeCheckClass, "text-success", "text-white");
        }
        resolve();
      }, holdMs);
    });
  }

  // One performance at a time per icon
  if (iconEl._copyBusy) return;
  iconEl._copyBusy = true;

  const original = iconEl.getAttribute("name") || "copy-outline";
  const bounce = token("--ease-bounce", FALLBACK_BOUNCE);
  const smooth = token("--ease-smooth-out", FALLBACK_SMOOTH);

  // Transitions-polish scale: --blur-small (2px), scale 0.75 -> 1
  const BLUR_PX = 2;
  const SCALE_NON_RESTING = 0.75;
  let appliedCheckClass = getCheckClass();

  const phase = (from, to, duration, easing) =>
    iconEl.animate(
      [
        { opacity: String(from.o), transform: `scale(${from.s})`, filter: `blur(${from.b}px)` },
        { opacity: String(to.o), transform: `scale(${to.s})`, filter: `blur(${to.b}px)` },
      ],
      { duration, easing, fill: "forwards" },
    ).finished;

  try {
    // 1. Old icon exits: --duration-quick (150ms) + --ease-smooth-out
    await phase({ o: 1, s: 1, b: 0 }, { o: 0, s: SCALE_NON_RESTING, b: BLUR_PX }, 150, smooth);

    // 2. In-place glyph swap to confirmation icon + checkmark color
    iconEl.setAttribute("name", confirmIcon);
    appliedCheckClass = getCheckClass();
    iconEl.classList.add(appliedCheckClass);

    // 3. Checkmark pops in: --duration-fast (250ms) + --ease-bounce
    await phase({ o: 0, s: SCALE_NON_RESTING, b: BLUR_PX }, { o: 1, s: 1, b: 0 }, 250, bounce);

    // 4. Hold
    await new Promise((resolve) => setTimeout(resolve, holdMs));

    // 5. Checkmark exits: --duration-quick (150ms) + --ease-smooth-out
    await phase({ o: 1, s: 1, b: 0 }, { o: 0, s: SCALE_NON_RESTING, b: BLUR_PX }, 150, smooth);

    // 6. In-place restore to original icon
    iconEl.setAttribute("name", original);
    iconEl.classList.remove(appliedCheckClass, "text-success", "text-white");

    // 7. Original icon returns: --duration-fast (250ms) + --ease-smooth-out
    await phase({ o: 0, s: SCALE_NON_RESTING, b: BLUR_PX }, { o: 1, s: 1, b: 0 }, 250, smooth);
  } catch {
    // WAAPI aborted mid-flight — fall through to finally restore.
  } finally {
    try {
      iconEl.getAnimations().forEach((a) => a.cancel());
    } catch {
      // Ignore
    }
    if (iconEl.isConnected) {
      iconEl.setAttribute("name", original);
      iconEl.classList.remove(appliedCheckClass, "text-success", "text-white");
    }
    iconEl._copyBusy = false;
  }
}
