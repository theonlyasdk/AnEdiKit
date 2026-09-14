// AnEdiKit - User Kits State Management Module

let activeKit = null;
let activeKitTab = "runner"; // "runner" | "builder" | "script" | "settings"
let kitRuntimeValues = {};
let monacoEditorInstance = null;
let editingBlockIndices = new Set();

export function getActiveKit() {
  return activeKit;
}

export function setActiveKit(kit) {
  activeKit = kit;
}

export function getActiveKitTab() {
  return activeKitTab;
}

export function setActiveKitTab(tab) {
  activeKitTab = tab;
}

export function getKitRuntimeValues() {
  return kitRuntimeValues;
}

export function setKitRuntimeValues(values) {
  kitRuntimeValues = values || {};
}

export function setKitRuntimeValue(key, val) {
  kitRuntimeValues[key] = val;
}

export function getMonacoEditorInstance() {
  return monacoEditorInstance;
}

export function setMonacoEditorInstance(inst) {
  monacoEditorInstance = inst;
}

export function getEditingBlockIndices() {
  return editingBlockIndices;
}

export function setEditingBlockIndices(newIndices) {
  editingBlockIndices = newIndices;
}

export function escapeHtml(str) {
  if (typeof str !== "string") return String(str || "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
