// iOS/macOS-style copy confirmation for icon buttons: the current icon zooms and
// blurs out, the checkmark bounces in, holds, then zooms and blurs back out
// as the original icon returns. Compositor-only (opacity/transform/filter on
// the tiny glyph) so it never stutters.

const FALLBACK_BOUNCE = "cubic-bezier(0.34, 1.36, 0.64, 1)";
const FALLBACK_INOUT = "ease-in-out";

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
  const holdMs = opts.holdMs ?? 650;
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
    const original = iconEl.getAttribute("name");
    iconEl.setAttribute("name", confirmIcon);
    const activeCheckClass = getCheckClass();
    iconEl.classList.add(activeCheckClass);
    setTimeout(() => {
      if (iconEl.isConnected) {
        iconEl.setAttribute("name", original);
        iconEl.classList.remove(activeCheckClass);
      }
    }, holdMs);
    return;
  }

  // One performance at a time per icon
  if (iconEl._copyBusy) return;
  iconEl._copyBusy = true;

  const original = iconEl.getAttribute("name");
  const bounce = token("--ease-bounce", FALLBACK_BOUNCE);
  const inout = token("--ease-in-out", FALLBACK_INOUT);
  const phase = (from, to, duration, easing) =>
    iconEl.animate(
      [
        { opacity: String(from.o), transform: `scale(${from.s})`, filter: `blur(${from.b}px)` },
        { opacity: String(to.o), transform: `scale(${to.s})`, filter: `blur(${to.b}px)` },
      ],
      { duration, easing, fill: "forwards" },
    ).finished;

  // Prominent 10px blur for a distinct, high-impact motion-blur morph effect
  const BLUR_PX = 10;
  let appliedCheckClass = "text-success";

  try {
    // 1. Old icon zooms + blurs out.
    await phase({ o: 1, s: 1, b: 0 }, { o: 0, s: 0.3, b: BLUR_PX }, 120, inout);

    // 2. Checkmark bounces in with dynamic high-contrast color class
    iconEl.setAttribute("name", confirmIcon);
    appliedCheckClass = getCheckClass();
    iconEl.classList.add(appliedCheckClass);

    await phase({ o: 0, s: 0.3, b: BLUR_PX }, { o: 1, s: 1, b: 0 }, 220, bounce);
    await new Promise((resolve) => setTimeout(resolve, holdMs));

    // 3. Checkmark zooms + blurs out.
    await phase({ o: 1, s: 1, b: 0 }, { o: 0, s: 0.35, b: BLUR_PX }, 130, inout);

    // 4. Original icon returns.
    iconEl.setAttribute("name", original);
    iconEl.classList.remove(appliedCheckClass, "text-success", "text-white");
    await phase({ o: 0, s: 0.35, b: BLUR_PX }, { o: 1, s: 1, b: 0 }, 180, inout);
  } catch {
    // WAAPI aborted mid-flight — fall through to restore.
  } finally {
    try {
      iconEl.getAnimations().forEach((a) => a.cancel());
    } catch {
      // Ignore
    }
    if (iconEl.isConnected) {
      iconEl.setAttribute("name", original);
      iconEl.classList.remove("text-success", "text-white");
    }
    iconEl._copyBusy = false;
  }
}
