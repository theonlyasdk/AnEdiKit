// AnEdiKit - Pure output-path resolution (no DOM).
// Extracted from commands.js resolveDestinationPath() which mixed three
// concerns: settings precedence, source-dir fallback, and reading the
// output-name textbox. This module owns the pure precedence rules;
// commands.js keeps a thin DOM wrapper for backward compatibility.

export const DEFAULT_VIDEOS_DIR = "C:\\Users\\User\\Videos";

export function extractEnclosingDir(filePath) {
  if (!filePath) return "";
  const lastSlash = Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/"));
  if (lastSlash > 0) return filePath.substring(0, lastSlash);
  return "";
}

export function joinWinPath(dir, name) {
  return `${String(dir).replace(/[/\\]+$/, "")}\\${name}`;
}

export function isFullPath(name) {
  return name.includes("\\") || name.includes("/");
}

// Pure core: all inputs explicit, no document access.
// - customOutputDir wins
// - else source enclosing dir
// - else settings.outputDir, then DEFAULT_VIDEOS_DIR
// - targetName: fullPath > customName > defaultFileName
// - full paths returned verbatim, otherwise joined to outDir
export function resolveDestinationPathPure(
  defaultFileName,
  settings = {},
  currentInput = "",
  customName = "",
  fullPath = ""
) {
  let outDir = "";
  if (settings.customOutputDir && settings.customOutputDir.trim()) {
    outDir = settings.customOutputDir.trim();
  }
  if (!outDir && currentInput) {
    outDir = extractEnclosingDir(currentInput);
  }
  if (!outDir) {
    outDir = settings.outputDir || DEFAULT_VIDEOS_DIR;
  }

  let targetName = fullPath || (customName || "").trim() || "";
  if (!targetName) targetName = defaultFileName;
  if (isFullPath(targetName)) return targetName;
  return joinWinPath(outDir, targetName);
}
