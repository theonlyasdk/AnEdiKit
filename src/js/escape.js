// AnEdiKit - HTML escaping (leaf, no imports).
// Single canonical home for escapeHtml, previously duplicated in playlist.js
// and audio_tags/render.js. Escapes &, <, >, " and ' so output is safe in
// both text content and single/double-quoted attribute values.
// ALL innerHTML interpolations of user-controlled data (file names/paths,
// media metadata, tag values, worker output) must go through this.

export function escapeHtml(value) {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
