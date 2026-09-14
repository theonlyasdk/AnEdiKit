// iOS-style copy confirmation for icon buttons: the current icon zooms and
// blurs out, the checkmark bounces in, holds, then zooms and blurs back out
// as the original icon returns. Compositor-only (opacity/transform/filter on
// the tiny glyph) so it never stutters.
//
// Motion tokens (transitions-polish, usage-first): icon-swap lane is
// --duration-fast (250ms) + --ease-in-out; entrances may bounce (--ease-bounce
// from the badge-pop lane); swap softening is --blur-small (2px). The zoom
// scale deliberately drops below the surface-token range per the requested
// iOS look. Resolved live from the token file with literal fallbacks.
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
  // Green check on plain buttons; white check on the green success flash so
  // it never melts into the background.
  const checkClass = iconEl?.closest?.(".btn-success") ? "text-white" : "text-success";
  if (!iconEl) return;

  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("no-animations");

  // No WAAPI or motion off: instant swap with the same hold timing.
  if (typeof iconEl.animate !== "function" || reduceMotion) {
    const original = iconEl.getAttribute("name");
    iconEl.setAttribute("name", confirmIcon);
    setTimeout(() => {
      if (iconEl.isConnected) iconEl.setAttribute("name", original);
    }, holdMs);
    return;
  }

  // One performance at a time per icon; the clipboard write itself is
  // the caller's job and always runs regardless.
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

  // Deliberately punchier than the 2px swap token: the blur must read on a
  // ~18px glyph, and the whole beat should land in about a second.
  const BLUR_PX = 4;
  try {
    // 1. Old icon zooms + blurs out.
    await phase({ o: 1, s: 1, b: 0 }, { o: 0, s: 0.35, b: BLUR_PX }, 120, inout);
    // 2. Checkmark bounces in.
    iconEl.setAttribute("name", confirmIcon);
    iconEl.classList.add(checkClass);
    await phase({ o: 0, s: 0.35, b: BLUR_PX }, { o: 1, s: 1, b: 0 }, 220, bounce);
    await new Promise((resolve) => setTimeout(resolve, holdMs));
    // 3. Checkmark zooms + blurs out.
    await phase({ o: 1, s: 1, b: 0 }, { o: 0, s: 0.45, b: BLUR_PX }, 130, inout);
    // 4. Original icon returns.
    iconEl.setAttribute("name", original);
    iconEl.classList.remove(checkClass);
    await phase({ o: 0, s: 0.45, b: BLUR_PX }, { o: 1, s: 1, b: 0 }, 180, inout);
  } catch {
    // WAAPI aborted mid-flight — fall through to restore.
  } finally {
    try {
      iconEl.getAnimations().forEach((a) => a.cancel());
    } catch {
      // Ignore — detached nodes or restricted contexts.
    }
    if (iconEl.isConnected) {
      iconEl.setAttribute("name", original);
      iconEl.classList.remove("text-success", "text-white");
    }
    iconEl._copyBusy = false;
  }
}
