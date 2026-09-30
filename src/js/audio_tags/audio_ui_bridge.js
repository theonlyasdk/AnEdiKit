// AnEdiKit - UI-handler registry for the audio_tags subsystem (no imports).
// queue.js (state + lifecycle) must trigger renders without statically
// importing render.js (which reads queue state back — that would be a new
// cycle). render.js registers its handlers at load; queue.js requests them.
// Unregistered calls are safe no-ops.

const handlers = new Map();

export function registerAudioUi(name, fn) {
  if (typeof fn === "function") handlers.set(name, fn);
}

export function requestAudioUi(name, ...args) {
  const fn = handlers.get(name);
  if (typeof fn === "function") return fn(...args);
  return undefined;
}
