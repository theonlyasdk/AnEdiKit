// Theme & Appearance Management Module for AnEdiKit
import { loadSettings, saveSettings, STORAGE_KEYS } from "./storage.js";

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
  catppuccin_mocha: {
    name: "Catppuccin Mocha",
    primary: "#89b4fa",
    secondary: "#6c7086",
    success: "#a6e3a1",
    danger: "#f38ba8",
    warning: "#f9e2af",
    info: "#94e2d5",
    body_bg: "#1e1e2e",
    card_bg: "#181825",
    pane_bg: "#11111b",
    text_color: "#cdd6f4",
    border_color: "#313244",
  },
  tokyo_night: {
    name: "Tokyo Night",
    primary: "#7aa2f7",
    secondary: "#565f89",
    success: "#9ece6a",
    danger: "#f7768e",
    warning: "#e0af68",
    info: "#7dcfff",
    body_bg: "#1a1b26",
    card_bg: "#16161e",
    pane_bg: "#1f2335",
    text_color: "#a9b1d6",
    border_color: "#292e42",
  },
  dracula: {
    name: "Dracula",
    primary: "#bd93f9",
    secondary: "#6272a4",
    success: "#50fa7b",
    danger: "#ff5555",
    warning: "#f1fa8c",
    info: "#8be9fd",
    body_bg: "#282a36",
    card_bg: "#21222c",
    pane_bg: "#191a21",
    text_color: "#f8f8f2",
    border_color: "#44475a",
  },
  nord: {
    name: "Nord",
    primary: "#88c0d0",
    secondary: "#4c566a",
    success: "#a3be8c",
    danger: "#bf616a",
    warning: "#ebcb8b",
    info: "#81a1c1",
    body_bg: "#2e3440",
    card_bg: "#3b4252",
    pane_bg: "#242933",
    text_color: "#eceff4",
    border_color: "#434c5e",
  },
  one_dark: {
    name: "One Dark Pro",
    primary: "#61afef",
    secondary: "#5c6370",
    success: "#98c379",
    danger: "#e06c75",
    warning: "#e5c07b",
    info: "#56b6c2",
    body_bg: "#282c34",
    card_bg: "#21252b",
    pane_bg: "#1e2227",
    text_color: "#abb2bf",
    border_color: "#3e4451",
  },
  gruvbox_dark: {
    name: "Gruvbox Dark",
    primary: "#d79921",
    secondary: "#7c6f64",
    success: "#98971a",
    danger: "#cc241d",
    warning: "#fabd2f",
    info: "#458588",
    body_bg: "#282828",
    card_bg: "#1d2021",
    pane_bg: "#32302f",
    text_color: "#ebdbb2",
    border_color: "#504945",
  },
  rose_pine: {
    name: "Rosé Pine",
    primary: "#ebbcba",
    secondary: "#6e6a86",
    success: "#31748f",
    danger: "#eb6f92",
    warning: "#f6c177",
    info: "#9ccfd8",
    body_bg: "#191724",
    card_bg: "#1f1d2e",
    pane_bg: "#14121d",
    text_color: "#e0def4",
    border_color: "#26233a",
  },
  solarized_dark: {
    name: "Solarized Dark",
    primary: "#268bd2",
    secondary: "#586e75",
    success: "#859900",
    danger: "#dc322f",
    warning: "#b58900",
    info: "#2aa198",
    body_bg: "#002b36",
    card_bg: "#073642",
    pane_bg: "#00212b",
    text_color: "#839496",
    border_color: "#073642",
  },
  synthwave_84: {
    name: "Synthwave '84",
    primary: "#ff7edb",
    secondary: "#614d79",
    success: "#72f1b8",
    danger: "#fe4450",
    warning: "#fede5d",
    info: "#03edf9",
    body_bg: "#241b2f",
    card_bg: "#1a1324",
    pane_bg: "#2a1e38",
    text_color: "#fff5f6",
    border_color: "#3e2f5b",
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
  if (themeObj.font_family !== undefined) {
    applyFontFamily(themeObj.font_family);
  }

  // Frosted Glass Blur Parameters (off by default; explicit opt-in only)
  const blurEnabled = themeObj.blur_enabled !== undefined ? (themeObj.blur_enabled ? 1 : 0) : 0;
  const blurRadius = blurEnabled ? (themeObj.blur_radius ? `${Math.max(12, themeObj.blur_radius)}px` : "16px") : "0px";
  const blurSaturate = blurEnabled ? (themeObj.blur_saturate !== undefined ? `${themeObj.blur_saturate}%` : "140%") : "100%";

  root.style.setProperty("--anedikit-blur-enabled", blurEnabled);
  root.style.setProperty("--anedikit-blur-radius", blurRadius);
  root.style.setProperty("--anedikit-blur-saturate", blurSaturate);
  root.classList.toggle("blur-enabled", blurEnabled === 1);
  if (document.body) {
    document.body.classList.toggle("blur-enabled", blurEnabled === 1);
  }

  if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
    window.__TAURI__.core.invoke("set_window_blur", { mode: blurEnabled ? "acrylic" : "off" }).catch(() => {});
  }
}

export function applyFontFamily(fontName) {
  const root = document.documentElement;
  if (fontName && fontName.trim()) {
    root.style.setProperty("--bs-body-font-family", `${fontName.trim()}, system-ui, -apple-system, sans-serif`);
  } else {
    root.style.setProperty("--bs-body-font-family", 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif');
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
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_THEME);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("loadSavedTheme error:", e);
  }
  return { ...THEME_PRESETS.bootstrap_dark, font_family: "" };
}

export function saveCurrentTheme(themeObj) {
  try {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_THEME, JSON.stringify(themeObj));
  } catch (e) {
    console.warn("saveCurrentTheme error:", e);
  }
}

export function serializeThemeToText(themeObj) {
  return [
    "# AnEdiKit Theme Configuration File",
    `# Name: ${themeObj.name || "Custom Theme"}`,
    `# Generated: ${new Date().toISOString()}`,
    `font_family=${themeObj.font_family || ""}`,
    `primary=${themeObj.primary || "#0d6efd"}`,
    `secondary=${themeObj.secondary || "#6c757d"}`,
    `success=${themeObj.success || "#198754"}`,
    `danger=${themeObj.danger || "#dc3545"}`,
    `warning=${themeObj.warning || "#ffc107"}`,
    `info=${themeObj.info || "#0dcaf0"}`,
    `body_bg=${themeObj.body_bg || "#212529"}`,
    `card_bg=${themeObj.card_bg || "#2b3035"}`,
    `pane_bg=${themeObj.pane_bg || "#212529"}`,
    `text_color=${themeObj.text_color || "#dee2e6"}`,
    `border_color=${themeObj.border_color || "#495057"}`,
    `blur_enabled=${themeObj.blur_enabled !== undefined ? themeObj.blur_enabled : false}`,
    `blur_radius=${themeObj.blur_radius !== undefined ? themeObj.blur_radius : 4}`,
    `blur_saturate=${themeObj.blur_saturate !== undefined ? themeObj.blur_saturate : 140}`,
  ].join("\n");
}

export function parseThemeFromText(text) {
  const theme = { name: "Imported Theme", font_family: "" };
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim();
      if (key) {
        if (key === "blur_enabled") {
          theme[key] = val === "true" || val === "1";
        } else if (key === "blur_radius" || key === "blur_saturate") {
          theme[key] = parseInt(val, 10) || (key === "blur_radius" ? 4 : 140);
        } else {
          theme[key] = val;
        }
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

    const fontInput = document.getElementById("theme-font-family");
    if (fontInput) {
      fontInput.value = th.font_family || "";
    }

    // Blur controls
    const chkBlurEnable = document.getElementById("theme-blur-enable");
    const rngBlurRadius = document.getElementById("theme-blur-radius");
    const txtBlurRadiusVal = document.getElementById("theme-blur-radius-val");
    const rngBlurSaturate = document.getElementById("theme-blur-saturate");
    const txtBlurSaturateVal = document.getElementById("theme-blur-saturate-val");
    const controlsWrapper = document.getElementById("theme-blur-controls-wrapper");

    const isEnabled = th.blur_enabled !== undefined ? !!th.blur_enabled : false;
    const radiusVal = th.blur_radius !== undefined ? th.blur_radius : 4;
    const saturateVal = th.blur_saturate !== undefined ? th.blur_saturate : 140;

    if (chkBlurEnable) chkBlurEnable.checked = isEnabled;
    if (rngBlurRadius) rngBlurRadius.value = radiusVal;
    if (txtBlurRadiusVal) txtBlurRadiusVal.textContent = `${radiusVal}px`;
    if (rngBlurSaturate) rngBlurSaturate.value = saturateVal;
    if (txtBlurSaturateVal) txtBlurSaturateVal.textContent = `${saturateVal}%`;
    if (controlsWrapper) {
      if (isEnabled) {
        controlsWrapper.classList.remove("opacity-50", "pe-none");
      } else {
        controlsWrapper.classList.add("opacity-50", "pe-none");
      }
    }
  };

  syncInputsFromTheme(currentTheme);

  // Frosted Glass Blur Event Listeners
  const chkBlurEnable = document.getElementById("theme-blur-enable");
  const rngBlurRadius = document.getElementById("theme-blur-radius");
  const txtBlurRadiusVal = document.getElementById("theme-blur-radius-val");
  const rngBlurSaturate = document.getElementById("theme-blur-saturate");
  const txtBlurSaturateVal = document.getElementById("theme-blur-saturate-val");
  const controlsWrapper = document.getElementById("theme-blur-controls-wrapper");

  if (chkBlurEnable) {
    chkBlurEnable.addEventListener("change", () => {
      const th = loadSavedTheme();
      th.blur_enabled = chkBlurEnable.checked;
      th.name = "Custom";
      if (controlsWrapper) {
        if (chkBlurEnable.checked) {
          controlsWrapper.classList.remove("opacity-50", "pe-none");
        } else {
          controlsWrapper.classList.add("opacity-50", "pe-none");
        }
      }
      applyTheme(th);
      saveCurrentTheme(th);
      if (presetSelect) presetSelect.value = "custom";
    });
  }

  if (rngBlurRadius) {
    rngBlurRadius.addEventListener("input", () => {
      const val = parseInt(rngBlurRadius.value, 10) || 0;
      if (txtBlurRadiusVal) txtBlurRadiusVal.textContent = `${val}px`;
      const th = loadSavedTheme();
      th.blur_radius = val;
      th.name = "Custom";
      applyTheme(th);
      saveCurrentTheme(th);
      if (presetSelect) presetSelect.value = "custom";
    });
  }

  if (rngBlurSaturate) {
    rngBlurSaturate.addEventListener("input", () => {
      const val = parseInt(rngBlurSaturate.value, 10) || 100;
      if (txtBlurSaturateVal) txtBlurSaturateVal.textContent = `${val}%`;
      const th = loadSavedTheme();
      th.blur_saturate = val;
      th.name = "Custom";
      applyTheme(th);
      saveCurrentTheme(th);
      if (presetSelect) presetSelect.value = "custom";
    });
  }

  // Custom Font Input inside Custom Theme Dialog
  const fontInput = document.getElementById("theme-font-family");
  const btnResetFont = document.getElementById("btn-theme-reset-font");
  if (fontInput) {
    fontInput.value = currentTheme.font_family || "";
    fontInput.addEventListener("input", () => {
      const val = fontInput.value.trim();
      const th = loadSavedTheme();
      th.font_family = val;
      th.name = "Custom";
      applyTheme(th);
      saveCurrentTheme(th);
      if (presetSelect) presetSelect.value = "custom";
    });
  }
  if (btnResetFont && fontInput) {
    btnResetFont.addEventListener("click", () => {
      fontInput.value = "";
      const th = loadSavedTheme();
      th.font_family = "";
      applyTheme(th);
      saveCurrentTheme(th);
    });
  }

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
      const th = { ...THEME_PRESETS[key], font_family: "" };
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
    const curVal = presetSelect ? presetSelect.value : "bootstrap_dark";
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
      const def = { ...THEME_PRESETS.bootstrap_dark, font_family: "" };
      syncInputsFromTheme(def);
      applyTheme(def);
      saveCurrentTheme(def);
      if (presetSelect) presetSelect.value = "bootstrap_dark";
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


