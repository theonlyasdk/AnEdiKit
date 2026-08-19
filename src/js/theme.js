// Theme & Appearance Management Module for AnEditKit
import { loadSettings, saveSettings } from "./storage.js";

export const THEME_PRESETS = {
  bootstrap_dark: {
    name: "Bootstrap 5 Dark",
    primary: "#0d6efd",
    secondary: "#6c757d",
    success: "#198754",
    danger: "#dc3545",
    warning: "#ffc107",
    info: "#0dcaf0",
    body_bg: "#212529",
    card_bg: "#2b3035",
    pane_bg: "#212529",
    text_color: "#dee2e6",
    border_color: "#495057",
  },
  default_dark: {
    name: "Default Modern Dark",
    primary: "#0d6efd",
    secondary: "#6c757d",
    success: "#20c997",
    danger: "#e63946",
    warning: "#ffb703",
    info: "#00b4d8",
    body_bg: "#121212",
    card_bg: "#1e1e1e",
    pane_bg: "#181818",
    text_color: "#f8f9fa",
    border_color: "#343a40",
  },
  midnight_blue: {
    name: "Midnight Blue",
    primary: "#4f46e5",
    secondary: "#64748b",
    success: "#10b981",
    danger: "#ef4444",
    warning: "#f59e0b",
    info: "#38bdf8",
    body_bg: "#0b0f19",
    card_bg: "#131b2e",
    pane_bg: "#0f172a",
    text_color: "#f1f5f9",
    border_color: "#1e293b",
  },
  emerald_matrix: {
    name: "Emerald Green",
    primary: "#10b981",
    secondary: "#64748b",
    success: "#059669",
    danger: "#e11d48",
    warning: "#d97706",
    info: "#06b6d4",
    body_bg: "#0a100d",
    card_bg: "#121d18",
    pane_bg: "#0e1713",
    text_color: "#ecfdf5",
    border_color: "#1e3a2b",
  },
  sunset_crimson: {
    name: "Sunset Crimson",
    primary: "#f43f5e",
    secondary: "#78716c",
    success: "#10b981",
    danger: "#e11d48",
    warning: "#f97316",
    info: "#06b6d4",
    body_bg: "#140a0c",
    card_bg: "#221217",
    pane_bg: "#1a0e11",
    text_color: "#fff1f2",
    border_color: "#3f1a24",
  },
  amber_gold: {
    name: "Amber Gold",
    primary: "#f59e0b",
    secondary: "#78716c",
    success: "#16a34a",
    danger: "#dc2626",
    warning: "#d97706",
    info: "#0284c7",
    body_bg: "#120f09",
    card_bg: "#211b12",
    pane_bg: "#17140e",
    text_color: "#fffbeb",
    border_color: "#3d321c",
  },
  monokai_pro: {
    name: "Monokai Pro",
    primary: "#a855f7",
    secondary: "#71717a",
    success: "#22c55e",
    danger: "#f43f5e",
    warning: "#eab308",
    info: "#06b6d4",
    body_bg: "#18141c",
    card_bg: "#251f2b",
    pane_bg: "#1e1a23",
    text_color: "#faf5ff",
    border_color: "#41364c",
  },
  nordic_frost: {
    name: "Nordic Frost",
    primary: "#06b6d4",
    secondary: "#64748b",
    success: "#10b981",
    danger: "#f43f5e",
    warning: "#f59e0b",
    info: "#38bdf8",
    body_bg: "#0f172a",
    card_bg: "#1e293b",
    pane_bg: "#141e33",
    text_color: "#f8fafc",
    border_color: "#334155",
  },
};

function hexToRgb(hex) {
  if (!hex) return "13, 110, 253";
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `${r}, ${g}, ${b}`;
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  }
  return "13, 110, 253";
}

export function applyTheme(themeObj) {
  if (!themeObj) return;
  const root = document.documentElement;

  // Bootstrap Semantic Palette
  if (themeObj.primary) {
    root.style.setProperty("--bs-primary", themeObj.primary);
    root.style.setProperty("--bs-primary-rgb", hexToRgb(themeObj.primary));
    root.style.setProperty("--bs-link-color", themeObj.primary);
    root.style.setProperty("--bs-link-hover-color", themeObj.primary);
  }
  if (themeObj.secondary) {
    root.style.setProperty("--bs-secondary", themeObj.secondary);
    root.style.setProperty("--bs-secondary-rgb", hexToRgb(themeObj.secondary));
  }
  if (themeObj.success) {
    root.style.setProperty("--bs-success", themeObj.success);
    root.style.setProperty("--bs-success-rgb", hexToRgb(themeObj.success));
  }
  if (themeObj.danger) {
    root.style.setProperty("--bs-danger", themeObj.danger);
    root.style.setProperty("--bs-danger-rgb", hexToRgb(themeObj.danger));
  }
  if (themeObj.warning) {
    root.style.setProperty("--bs-warning", themeObj.warning);
    root.style.setProperty("--bs-warning-rgb", hexToRgb(themeObj.warning));
  }
  if (themeObj.info) {
    root.style.setProperty("--bs-info", themeObj.info);
    root.style.setProperty("--bs-info-rgb", hexToRgb(themeObj.info));
  }

  // Canvas & Surfaces
  if (themeObj.body_bg) {
    root.style.setProperty("--bs-body-bg", themeObj.body_bg);
    root.style.setProperty("--bs-body-bg-rgb", hexToRgb(themeObj.body_bg));
  }
  if (themeObj.card_bg) {
    root.style.setProperty("--bs-body-tertiary-bg", themeObj.card_bg);
    root.style.setProperty("--bs-tertiary-bg", themeObj.card_bg);
    root.style.setProperty("--bs-secondary-bg", themeObj.card_bg);
  }
  if (themeObj.pane_bg) {
    root.style.setProperty("--anedikit-pane-bg", themeObj.pane_bg);
    const workspace = document.getElementById("tool-workspace");
    if (workspace) {
      workspace.style.backgroundColor = themeObj.pane_bg;
    }
  }
  if (themeObj.text_color) {
    root.style.setProperty("--bs-body-color", themeObj.text_color);
    root.style.setProperty("--bs-body-color-rgb", hexToRgb(themeObj.text_color));
  }
  if (themeObj.border_color) {
    root.style.setProperty("--bs-border-color", themeObj.border_color);
    root.style.setProperty("--bs-border-color-translucent", themeObj.border_color);
  }
}

export function setAnimationsEnabled(enabled) {
  if (enabled) {
    document.documentElement.classList.remove("no-animations");
  } else {
    document.documentElement.classList.add("no-animations");
  }
}

export function loadSavedTheme() {
  try {
    const raw = localStorage.getItem("anedikit:custom_theme");
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("loadSavedTheme error:", e);
  }
  return THEME_PRESETS.default_dark;
}

export function saveCurrentTheme(themeObj) {
  try {
    localStorage.setItem("anedikit:custom_theme", JSON.stringify(themeObj));
  } catch (e) {
    console.warn("saveCurrentTheme error:", e);
  }
}

export function serializeThemeToText(themeObj) {
  return [
    "# AnEditKit Theme Configuration File",
    `# Name: ${themeObj.name || "Custom Theme"}`,
    `# Generated: ${new Date().toISOString()}`,
    `primary=${themeObj.primary || "#0d6efd"}`,
    `secondary=${themeObj.secondary || "#6c757d"}`,
    `success=${themeObj.success || "#198754"}`,
    `danger=${themeObj.danger || "#dc3545"}`,
    `warning=${themeObj.warning || "#ffc107"}`,
    `info=${themeObj.info || "#0dcaf0"}`,
    `body_bg=${themeObj.body_bg || "#121212"}`,
    `card_bg=${themeObj.card_bg || "#1e1e1e"}`,
    `pane_bg=${themeObj.pane_bg || "#181818"}`,
    `text_color=${themeObj.text_color || "#f8f9fa"}`,
    `border_color=${themeObj.border_color || "#343a40"}`,
  ].join("\n");
}

export function parseThemeFromText(text) {
  const theme = { name: "Imported Theme" };
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim();
      if (key && val) {
        theme[key] = val;
      }
    }
  }
  return theme;
}

export function initThemeManager() {
  const currentTheme = loadSavedTheme();
  applyTheme(currentTheme);

  const settings = loadSettings();
  setAnimationsEnabled(!settings.disableAnimations);

  // Sync inputs inside modal
  const syncInputsFromTheme = (th) => {
    const fields = [
      "primary",
      "secondary",
      "success",
      "danger",
      "warning",
      "info",
      "body_bg",
      "card_bg",
      "pane_bg",
      "text_color",
      "border_color",
    ];

    fields.forEach((field) => {
      const idKey = field.replace(/_/g, "-");
      const inColor = document.getElementById(`theme-${idKey}`);
      const inHex = document.getElementById(`theme-${idKey}-hex`);
      if (inColor && th[field]) inColor.value = th[field];
      if (inHex && th[field]) inHex.value = th[field];
    });
  };

  syncInputsFromTheme(currentTheme);

  // Disable Animations Switch in Settings
  const chkDisableAnim = document.getElementById("set-disable-animations");
  if (chkDisableAnim) {
    chkDisableAnim.checked = !!settings.disableAnimations;
    chkDisableAnim.addEventListener("change", () => {
      const currentSettings = loadSettings();
      currentSettings.disableAnimations = chkDisableAnim.checked;
      setAnimationsEnabled(!chkDisableAnim.checked);
      saveSettings(currentSettings);
    });
  }

  // Preset Selector & Prev/Next Buttons
  const presetSelect = document.getElementById("theme-preset-pick");
  const btnPrevPreset = document.getElementById("btn-theme-preset-prev");
  const btnNextPreset = document.getElementById("btn-theme-preset-next");
  const presetKeys = Object.keys(THEME_PRESETS);

  const applyPresetByKey = (key) => {
    if (THEME_PRESETS[key]) {
      const th = THEME_PRESETS[key];
      if (presetSelect) presetSelect.value = key;
      syncInputsFromTheme(th);
      applyTheme(th);
      saveCurrentTheme(th);
    }
  };

  if (presetSelect) {
    presetSelect.addEventListener("change", () => {
      applyPresetByKey(presetSelect.value);
    });
  }

  const cyclePreset = (delta) => {
    const curVal = presetSelect ? presetSelect.value : "default_dark";
    let curIdx = presetKeys.indexOf(curVal);
    if (curIdx === -1) curIdx = 0;
    const nextIdx = (curIdx + delta + presetKeys.length) % presetKeys.length;
    applyPresetByKey(presetKeys[nextIdx]);
  };

  if (btnPrevPreset) {
    btnPrevPreset.addEventListener("click", () => cyclePreset(-1));
  }
  if (btnNextPreset) {
    btnNextPreset.addEventListener("click", () => cyclePreset(1));
  }

  // Custom Color inputs linking (Color picker <-> Hex text)
  const bindPair = (colorId, hexId, key) => {
    const colorEl = document.getElementById(colorId);
    const hexEl = document.getElementById(hexId);
    if (colorEl && hexEl) {
      colorEl.addEventListener("input", () => {
        hexEl.value = colorEl.value;
        const th = loadSavedTheme();
        th[key] = colorEl.value;
        th.name = "Custom";
        applyTheme(th);
        saveCurrentTheme(th);
        if (presetSelect) presetSelect.value = "custom";
      });
      hexEl.addEventListener("change", () => {
        let val = hexEl.value.trim();
        if (!val.startsWith("#")) val = "#" + val;
        if (/^#[0-9A-Fa-f]{6}$/.test(val) || /^#[0-9A-Fa-f]{3}$/.test(val)) {
          colorEl.value = val;
          const th = loadSavedTheme();
          th[key] = val;
          th.name = "Custom";
          applyTheme(th);
          saveCurrentTheme(th);
          if (presetSelect) presetSelect.value = "custom";
        }
      });
    }
  };

  // Bind all semantic and layout pairs
  bindPair("theme-primary", "theme-primary-hex", "primary");
  bindPair("theme-secondary", "theme-secondary-hex", "secondary");
  bindPair("theme-success", "theme-success-hex", "success");
  bindPair("theme-danger", "theme-danger-hex", "danger");
  bindPair("theme-warning", "theme-warning-hex", "warning");
  bindPair("theme-info", "theme-info-hex", "info");
  bindPair("theme-body-bg", "theme-body-bg-hex", "body_bg");
  bindPair("theme-card-bg", "theme-card-bg-hex", "card_bg");
  bindPair("theme-pane-bg", "theme-pane-bg-hex", "pane_bg");
  bindPair("theme-text-color", "theme-text-color-hex", "text_color");
  bindPair("theme-border-color", "theme-border-color-hex", "border_color");

  // Reset Button (modal footer)
  const btnResetTheme = document.getElementById("btn-reset-theme");
  if (btnResetTheme) {
    btnResetTheme.addEventListener("click", () => {
      const def = THEME_PRESETS.default_dark;
      syncInputsFromTheme(def);
      applyTheme(def);
      saveCurrentTheme(def);
      if (presetSelect) presetSelect.value = "default_dark";
    });
  }

  // Export Theme File (.txt)
  const btnExport = document.getElementById("btn-export-theme-file");
  if (btnExport) {
    btnExport.addEventListener("click", () => {
      const th = loadSavedTheme();
      const txt = serializeThemeToText(th);
      const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `anedikit_${(th.name || "theme").toLowerCase().replace(/\s+/g, "_")}.theme.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Import Theme File (.txt)
  const btnImport = document.getElementById("btn-import-theme-file");
  const fileInput = document.getElementById("theme-file-input");
  if (btnImport && fileInput) {
    btnImport.addEventListener("click", () => {
      fileInput.click();
    });

    fileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result;
          if (typeof content === "string") {
            const parsed = parseThemeFromText(content);
            syncInputsFromTheme(parsed);
            applyTheme(parsed);
            saveCurrentTheme(parsed);
            if (presetSelect) presetSelect.value = "custom";
          }
        };
        reader.readAsText(file);
      }
    });
  }
}

