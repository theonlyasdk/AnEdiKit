// AnEdiKit - Lazy tool-view loader (leaf-ish: only navigation + errors).
// The assembled index.html inlines every view. In --lazy mode the assembler
// leaves a placeholder skeleton for LAZY_VIEWS and this module fills it on
// first switchTool(). All wiring is delegated to execution/bindings.js which
// is idempotent via bindKeyed.

import { getViewIdForTool, TOOL_METADATA } from "./tool_metadata.js";
import { reportError } from "./errors.js";

// Stable choice: custom is the smallest standalone view (no media/image deps
// beyond the shared cards) and sits in the middle of TOOL_ORDER so the
// transition covers both directions.
export const LAZY_VIEWS = new Set(["view-custom"]);
export const LAZY_TOOL_IDS = new Set(
  Object.keys(TOOL_METADATA).filter((id) => LAZY_VIEWS.has(getViewIdForTool(id))),
);

const inflight = new Map(); // viewId -> Promise<string>

function skeletonHtml() {
  return (
    '<div class="view-shimmer" role="status" aria-busy="true" aria-label="Loading tool">' +
    '<div class="skeleton h-lg w-60"></div>' +
    '<div class="skeleton w-80"></div>' +
    '<div class="skeleton"></div>' +
    '<div class="skeleton w-80"></div>' +
    "</div>"
  );
}

function wireAfterInject(root) {
  // Safe to call repeatedly: bindFormEvents handles it, but we prefer the
  // narrow path here. The main wiring lives in execution/bindings.js and is
  // idempotent via bindKeyed — re-running it after injection hydrates the
  // new fragment without double-binding.
  try {
    if (typeof window !== "undefined" && typeof window.__ANEDIKIT_WIRE_LAZY === "function") {
      window.__ANEDIKIT_WIRE_LAZY(root);
    }
  } catch (err) {
    reportError("js/view_loader.js:wireAfterInject", err);
  }
}

export function isLazyView(viewId) {
  return LAZY_VIEWS.has(viewId);
}

export function isViewLoaded(viewId) {
  const el = document.getElementById(viewId);
  return !!el && el.dataset.lazyState === "loaded";
}

async function fetchPartial(viewId) {
  let html = inflight.get(viewId);
  if (html) return html;
  const p = fetch(`partials/views/${viewId}.html`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    })
    .then((t) => t.trim());
  inflight.set(viewId, p);
  try {
    html = await p;
  } catch (e) {
    inflight.delete(viewId);
    throw e;
  }
  return html;
}

function injectPlaceholder(viewId) {
  const el = document.getElementById(viewId);
  if (!el || el.dataset.lazyState) return;
  el.dataset.lazyState = "pending";
  el.innerHTML = skeletonHtml();
}

function injectHtml(viewId, html) {
  const el = document.getElementById(viewId);
  if (!el) return;
  el.innerHTML = html;
  el.dataset.lazyState = "loaded";
  wireAfterInject(el);
}

function injectError(viewId, err) {
  const el = document.getElementById(viewId);
  if (!el || el.dataset.lazyState === "loaded") return;
  el.innerHTML =
    '<div class="view-shimmer is-error" role="alert">' +
    `<p class="small text-body-secondary mb-2">Failed to load this tool: ${String(err.message || err)}</p>` +
    '<button type="button" class="btn btn-outline-secondary btn-sm" data-lazy-retry>Retry</button>' +
    "</div>";
  el.dataset.lazyState = "error";
  const btn = el.querySelector("[data-lazy-retry]");
  if (btn) {
    btn.addEventListener("click", () => {
      el.dataset.lazyState = "pending";
      el.innerHTML = skeletonHtml();
      loadView(viewId, true);
    }, { once: true });
  }
}

// Public: ensure viewId is loaded (no-op if not lazy or already loaded).
// Returns true if content is now synchronously available.
export function ensureViewLoaded(viewId) {
  if (!isLazyView(viewId)) return true;
  const el = document.getElementById(viewId);
  if (!el) return false;
  if (el.dataset.lazyState === "loaded") return true;
  // Kick off load (fire-and-forget for the initial switchTool path).
  loadView(viewId, false);
  return false;
}

export async function loadView(viewId, force = false) {
  if (!isLazyView(viewId)) return true;
  const el = document.getElementById(viewId);
  if (!el) return false;
  if (!force && el.dataset.lazyState === "loaded") return true;
  if (el.dataset.lazyState !== "pending") injectPlaceholder(viewId);
  try {
    const html = await fetchPartial(viewId);
    injectHtml(viewId, html);
    return true;
  } catch (err) {
    reportError("js/view_loader.js:loadView", err);
    injectError(viewId, err);
    return false;
  }
}

// Eagerly preload lazy views after idle (does not block startup).
export function preloadLazyViews() {
  if (typeof window === "undefined") return;
  const run = () => {
    for (const viewId of LAZY_VIEWS) {
      if (!isViewLoaded(viewId)) fetchPartial(viewId).catch(() => {});
    }
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 1200);
}
