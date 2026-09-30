// AnEdiKit - Active-tool state (no app imports).
// navigation.js owns tool *switching*; this module owns the *current value*
// so read-only consumers (estimates, output_path, merge, image_queue,
// execution) stop importing navigation.js for a single getter. navigation.js
// keeps a backward-compatible getCurrentActiveTool() export.

export const toolState = {
  current: "convert",
};

export function getCurrentActiveTool() {
  return document.body?.dataset?.activeTool || toolState.current;
}

export function setCurrentActiveTool(toolId) {
  toolState.current = toolId;
}
