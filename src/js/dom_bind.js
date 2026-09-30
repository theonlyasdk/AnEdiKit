// AnEdiKit - Idempotent DOM event binding (leaf, no imports).
// Guards init-style wiring against double attachment: many control-init
// functions use fresh closures per call, so listener-identity dedup cannot
// work — instead each binding carries a stable key per element. Re-binding
// the same key on the same element is a no-op (returns false).

const boundKeys = new WeakMap();

export function bindKeyed(el, key, type, listener, options) {
  if (!el || typeof el.addEventListener !== "function") return false;
  let keys = boundKeys.get(el);
  if (!keys) {
    keys = new Set();
    boundKeys.set(el, keys);
  }
  const slot = `${type}::${key}`;
  if (keys.has(slot)) return false;
  keys.add(slot);
  el.addEventListener(type, listener, options);
  return true;
}

// For tests/teardown: forget all keys recorded for an element.
export function unbindAll(el) {
  if (!el) return;
  boundKeys.delete(el);
}
