// Theme & Appearance Management Module for AnEditKit
import { loadSettings, saveSettings } from "./storage.js";

export const THEME_PRESETS = {
  default_dark: {
    name: "Default Modern Dark",
    primary: "#0d6efd",
    body_bg: "#121212",
    card_bg: "#1e1e1e",
    text_color: "#f8f9fa",
    border_color: "#343a40",
  },
  midnight_blue: {
    name: "Midnight Blue",
    primary: "#4f46e5",
    body_bg: "#0b0f19",
    card_bg: "#131b2e",
    text_color: "#f1f5f9",
    border_color: "#1e293b",
  },
  emerald_matrix: {
    name: "Emerald Green",
    primary: "#10b981",
    body_bg: "#0a100d",
    card_bg: "#121d18",
    text_color: "#ecfdf5",
    border_color: "#1e3a2b",
  },
  sunset_crimson: {
    name: "Sunset Crimson",
    primary: "#f43f5e",
    body_bg: "#140a0c",
    card_bg: "#221217",
    text_color: "#fff1f2",
    border_color: "#3f1a24",
  },
  amber_gold: {
    name: "Amber Gold",
    primary: "#f59e0b",
    body_bg: "#120f09",
    card_bg: "#211b12",
    text_color: "#fffbeb",
    border_color: "#3d321c",
  },
  monokai_pro: {
    name: "Monokai Pro",
    primary: "#a855f7",
    body_bg: "#18141c",
    card_bg: "#251f2b",
    text_color: "#faf5ff",
    border_color: "#41364c",
  },
  nordic_frost: {
    name: "Nordic Frost",
    primary: "#06b6d4",
    body_bg: "#0f172a",
    card_bg: "#1e293b",
    text_color: "#f8fafc",
    border_color: "#334155",
  },
};

function hexToRgb(hex) {
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

  if (themeObj.primary) {
    root.style.setProperty("--bs-primary", themeObj.primary);
    root.style.setProperty("--bs-primary-rgb", hexToRgb(themeObj.primary));
    root.style.setProperty("--bs-link-color", themeObj.primary);
    root.style.setProperty("--bs-link-hover-color", themeObj.primary);
  }
  if (themeObj.body_bg) {
    root.style.setProperty("--bs-body-bg", themeObj.body_bg);
    root.style.setProperty("--bs-body-bg-rgb", hexToRgb(themeObj.body_bg));
  }
  if (themeObj.card_bg) {
    root.style.setProperty("--bs-body-tertiary-bg", themeObj.card_bg);
    root.style.setProperty("--bs-tertiary-bg", themeObj.card_bg);
  }
  if (themeObj.text_color) {
    root.style.setProperty("--bs-body-color", themeObj.text_color);
    root.style.setProperty("--bs-body-color-rgb", hexToRgb(themeObj.text_color));
  }
  if (themeObj.border_color) {
    root.style.setProperty("--bs-border-color", themeObj.border_color);
    root.style.setProperty("--bs-border-color-translucent", themeObj.border_color);
  }

  const badge = document.getElementById("active-theme-badge");
  if (badge) {
    badge.textContent = themeObj.name || "Custom";
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
    `body_bg=${themeObj.body_bg || "#121212"}`,
    `card_bg=${themeObj.card_bg || "#1e1e1e"}`,
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
    const inPrimary = document.getElementById("theme-primary");
    const inPrimaryHex = document.getElementById("theme-primary-hex");
    const inBodyBg = document.getElementById("theme-body-bg");
    const inBodyBgHex = document.getElementById("theme-body-bg-hex");
    const inCardBg = document.getElementById("theme-card-bg");
    const inCardBgHex = document.getElementById("theme-card-bg-hex");
    const inText = document.getElementById("theme-text-color");
    const inTextHex = document.getElementById("theme-text-color-hex");
    const inBorder = document.getElementById("theme-border-color");
    const inBorderHex = document.getElementById("theme-border-color-hex");

    if (inPrimary && th.primary) inPrimary.value = th.primary;
    if (inPrimaryHex && th.primary) inPrimaryHex.value = th.primary;

    if (inBodyBg && th.body_bg) inBodyBg.value = th.body_bg;
    if (inBodyBgHex && th.body_bg) inBodyBgHex.value = th.body_bg;

    if (inCardBg && th.card_bg) inCardBg.value = th.card_bg;
    if (inCardBgHex && th.card_bg) inCardBgHex.value = th.card_bg;

    if (inText && th.text_color) inText.value = th.text_color;
    if (inTextHex && th.text_color) inTextHex.value = th.text_color;

    if (inBorder && th.border_color) inBorder.value = th.border_color;
    if (inBorderHex && th.border_color) inBorderHex.value = th.border_color;
  };

  syncInputsFromTheme(currentTheme);

  // Disable Animations Switch in Settings
  const chkDisableAnim = document.getElementById("set-disable-animations");
  if (chkDisableAnim) {
    chkDisableAnim.checked = !!settings.disableAnimations;
    chkDisableAnim.addEventListener("change", () => {
      const disabled = chkDisableAnim.checked;
      setAnimationsEnabled(!disabled);
      settings.disableAnimations = disabled;
      saveSettings(settings);
    });
  }

  // Preset Selector
  const presetSelect = document.getElementById("theme-preset-pick");
  if (presetSelect) {
    presetSelect.addEventListener("change", () => {
      const val = presetSelect.value;
      if (THEME_PRESETS[val]) {
        const th = THEME_PRESETS[val];
        syncInputsFromTheme(th);
        applyTheme(th);
        saveCurrentTheme(th);
      }
    });
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

  bindPair("theme-primary", "theme-primary-hex", "primary");
  bindPair("theme-body-bg", "theme-body-bg-hex", "body_bg");
  bindPair("theme-card-bg", "theme-card-bg-hex", "card_bg");
  bindPair("theme-text-color", "theme-text-color-hex", "text_color");
  bindPair("theme-border-color", "theme-border-color-hex", "border_color");

  // Reset Button
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
