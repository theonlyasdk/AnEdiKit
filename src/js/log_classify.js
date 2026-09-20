// AnEdiKit - Pure log-line classification (no DOM).
// Extracted from runner.js appendLog() so severity rules are unit-testable
// without a document mock.

export const LOG_KIND = {
  ERROR: "error",
  WARNING: "warning",
  SUCCESS: "success",
  INFO: "info",
};

const LOG_CSS_CLASS = {
  [LOG_KIND.ERROR]: "text-danger",
  [LOG_KIND.WARNING]: "text-warning",
  [LOG_KIND.SUCCESS]: "text-success",
  [LOG_KIND.INFO]: "text-body-secondary",
};

export function classifyLogLine(text, isError = false) {
  const lower = String(text || "").toLowerCase();
  // WARNING lines (e.g. yt-dlp PO-token notices mentioning "Error 403") are
  // advisories, not failures -- check warning first so they stay yellow.
  const isWarn = lower.startsWith("warning") || lower.includes("warning:");
  if (isWarn) return LOG_KIND.WARNING;
  const isErr = isError || lower.includes("error") || lower.includes("failed");
  if (isErr) return LOG_KIND.ERROR;
  const isSuccess = lower.includes("success") || lower.includes("100%");
  if (isSuccess) return LOG_KIND.SUCCESS;
  return LOG_KIND.INFO;
}

export function logKindToCssClass(kind) {
  return LOG_CSS_CLASS[kind] || LOG_CSS_CLASS[LOG_KIND.INFO];
}
