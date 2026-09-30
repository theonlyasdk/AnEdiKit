// AnEdiKit - Decoupling bridge for app_settings <-> tools_manager.
// Both directions are UI callbacks with no return-value contract at the
// call sites that matter, so a tiny registry breaks the static cycle while
// every public export keeps working:
// - app_settings.initToolsCacheControls() registers itself; tools_manager
//   invokes it via requestInitToolsCacheControls().
// - tools_manager.refreshToolsUI() registers itself; app_settings invokes it
//   via requestRefreshToolsUI().
// Calls before registration are safe no-ops (test envs that load one side).

let _refreshToolsUI = null;
let _initToolsCacheControls = null;

export function registerRefreshToolsUI(fn) {
  if (typeof fn === "function") _refreshToolsUI = fn;
}

export function registerInitToolsCacheControls(fn) {
  if (typeof fn === "function") _initToolsCacheControls = fn;
}

export async function requestRefreshToolsUI(opts) {
  if (typeof _refreshToolsUI === "function") return _refreshToolsUI(opts);
  return undefined;
}

export function requestInitToolsCacheControls() {
  if (typeof _initToolsCacheControls === "function") return _initToolsCacheControls();
  return undefined;
}
