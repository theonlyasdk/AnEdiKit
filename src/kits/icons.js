// AnEdiKit - Kit icon name mapping (leaf, no imports).
// Moved verbatim from sidebar.js so settings/sidebar/workspace share one
// pure helper instead of forming an import cycle around it.

export function getIonicIconName(rawIcon) {
  if (!rawIcon) return "cube-outline";
  const map = {
    "bi-film": "film-outline",
    "bi-music-note-beamed": "musical-notes-outline",
    "bi-code-slash": "code-slash-outline",
    "bi-box-seam": "cube-outline",
    "bi-sliders": "options-outline",
    "bi-lightning": "flash-outline",
    "bi-terminal": "terminal-outline",
    "bi-gear": "settings-outline",
    "bi-cpu": "hardware-chip-outline",
    "bi-camera-video": "videocam-outline",
    "bi-soundwave": "pulse-outline",
    "bi-palette": "color-palette-outline",
    "bi-magic": "sparkles-outline",
    "bi-scissors": "cut-outline",
    "bi-file-earmark-code": "code-working-outline",
  };
  if (map[rawIcon]) return map[rawIcon];
  const clean = rawIcon.replace(/^bi-/, "");
  if (map[clean]) return map[clean];
  return clean.includes("-") ? clean : `${clean}-outline`;
}
