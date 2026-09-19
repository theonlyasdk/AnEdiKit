// AnEdiKit - User Kits Monaco Script Editor Module
import {
  getActiveKit,
  getActiveKitTab,
  getMonacoEditorInstance,
  setMonacoEditorInstance,
  escapeHtml,
} from "./state.js";
import { getSavedScriptTheme, saveScriptTheme, saveUserKit } from "./storage.js";
import { STARTER_TEMPLATES } from "./templates.js";
import { bindUniversalDropdowns, showCustomKitAlert, showCustomKitConfirm } from "./modals.js";

// 10 Common Monaco Themes configuration and color schemes
export const MONACO_THEMES = [
  { id: "vs-dark", name: "VS Code Dark" },
  { id: "vs", name: "VS Code Light" },
  { id: "hc-black", name: "High Contrast Dark" },
  {
    id: "monokai",
    name: "Monokai",
    data: {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "75715e" },
        { token: "keyword", foreground: "f92672" },
        { token: "string", foreground: "e6db74" },
        { token: "number", foreground: "ae81ff" },
        { token: "identifier", foreground: "f8f8f2" },
        { token: "type", foreground: "66d9ef" },
      ],
      colors: {
        "editor.background": "#272822",
        "editor.foreground": "#f8f8f2",
        "editorCursor.foreground": "#f8f8f0",
        "editor.lineHighlightBackground": "#3e3d32",
        "editorLineNumber.foreground": "#75715e",
        "editor.selectionBackground": "#49483e",
      },
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    data: {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6272a4" },
        { token: "keyword", foreground: "ff79c6" },
        { token: "string", foreground: "f1fa8c" },
        { token: "number", foreground: "bd93f9" },
        { token: "identifier", foreground: "f8f8f2" },
        { token: "type", foreground: "8be9fd" },
      ],
      colors: {
        "editor.background": "#282a36",
        "editor.foreground": "#f8f8f2",
        "editorCursor.foreground": "#f8f8f2",
        "editor.lineHighlightBackground": "#44475a75",
        "editorLineNumber.foreground": "#6272a4",
        "editor.selectionBackground": "#44475a",
      },
    },
  },
  {
    id: "github-dark",
    name: "GitHub Dark",
    data: {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "8b949e" },
        { token: "keyword", foreground: "ff7b72" },
        { token: "string", foreground: "a5d6ff" },
        { token: "number", foreground: "79c0ff" },
        { token: "type", foreground: "ffa657" },
      ],
      colors: {
        "editor.background": "#0d1117",
        "editor.foreground": "#c9d1d9",
        "editorCursor.foreground": "#58a6ff",
        "editor.lineHighlightBackground": "#161b22",
        "editorLineNumber.foreground": "#6e7681",
        "editor.selectionBackground": "#264f78",
      },
    },
  },
  {
    id: "github-light",
    name: "GitHub Light",
    data: {
      base: "vs",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6e7781" },
        { token: "keyword", foreground: "cf222e" },
        { token: "string", foreground: "0a3069" },
        { token: "number", foreground: "0550ae" },
        { token: "type", foreground: "953800" },
      ],
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#24292f",
        "editorCursor.foreground": "#0969da",
        "editor.lineHighlightBackground": "#f6f8fa",
        "editorLineNumber.foreground": "#8c959f",
        "editor.selectionBackground": "#b6e3ff",
      },
    },
  },
  {
    id: "nord",
    name: "Nord",
    data: {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "616e88" },
        { token: "keyword", foreground: "81a1c1" },
        { token: "string", foreground: "a3be8c" },
        { token: "number", foreground: "b48ead" },
        { token: "type", foreground: "8fbcbb" },
      ],
      colors: {
        "editor.background": "#2e3440",
        "editor.foreground": "#d8dee9",
        "editorCursor.foreground": "#d8dee9",
        "editor.lineHighlightBackground": "#3b4252",
        "editorLineNumber.foreground": "#4c566a",
        "editor.selectionBackground": "#434c5e",
      },
    },
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    data: {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "586e75" },
        { token: "keyword", foreground: "859900" },
        { token: "string", foreground: "2aa198" },
        { token: "number", foreground: "d33682" },
        { token: "type", foreground: "b58900" },
      ],
      colors: {
        "editor.background": "#002b36",
        "editor.foreground": "#839496",
        "editorCursor.foreground": "#839496",
        "editor.lineHighlightBackground": "#073642",
        "editorLineNumber.foreground": "#586e75",
        "editor.selectionBackground": "#073642",
      },
    },
  },
  {
    id: "one-dark-pro",
    name: "One Dark Pro",
    data: {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "5c6370" },
        { token: "keyword", foreground: "c678dd" },
        { token: "string", foreground: "98c379" },
        { token: "number", foreground: "d19a66" },
        { token: "type", foreground: "e5c07b" },
      ],
      colors: {
        "editor.background": "#282c34",
        "editor.foreground": "#abb2bf",
        "editorCursor.foreground": "#528bff",
        "editor.lineHighlightBackground": "#2c313a",
        "editorLineNumber.foreground": "#4b5263",
        "editor.selectionBackground": "#3e4451",
      },
    },
  },
];

export function registerMonacoThemes() {
  if (!window.monaco || !window.monaco.editor) return;
  for (const t of MONACO_THEMES) {
    if (t.data) {
      try {
        window.monaco.editor.defineTheme(t.id, t.data);
      } catch {
        // Theme already registered
      }
    }
  }
}

export function obfuscateScriptCode(sourceCode) {
  if (!sourceCode || typeof sourceCode !== "string") return "";
  const utf8Bytes = new TextEncoder().encode(sourceCode);
  let binaryStr = "";
  for (let i = 0; i < utf8Bytes.length; i++) {
    binaryStr += String.fromCharCode(utf8Bytes[i]);
  }
  const b64 = btoa(binaryStr);

  const maskedChunks = [];
  for (let i = 0; i < b64.length; i += 64) {
    maskedChunks.push(JSON.stringify(b64.slice(i, i + 64)));
  }
  const payloadArray = maskedChunks.join(",\n  ");

  return `/**
 * @anedikit-obfuscated v1.0
 * Protected User Kit Execution Payload
 */
(function(_0x8a1e,_0x4f2c){
  const _0x3b9d=[
  ${payloadArray}
  ];
  const _0x1c7a=function(_0x9d2e){
    const _0x5f1b=_0x3b9d.join("");
    const _0x2e4c=atob(_0x5f1b);
    const _0x7a3d=new Uint8Array(_0x2e4c.length);
    for(let _0x4b1f=0;_0x4b1f<_0x2e4c.length;_0x4b1f++){
      _0x7a3d[_0x4b1f]=_0x2e4c.charCodeAt(_0x4b1f);
    }
    return new TextDecoder().decode(_0x7a3d);
  };
  return (new Function(_0x1c7a()))();
})();`;
}

export function deobfuscateScriptCode(code) {
  if (!code || typeof code !== "string") return null;

  if (code.includes("@anedikit-obfuscated")) {
    const arrayMatch = code.match(/const\s+_0x3b9d\s*=\s*\[([\s\S]*?)\];/);
    if (arrayMatch && arrayMatch[1]) {
      try {
        const items = JSON.parse(`[${arrayMatch[1]}]`);
        const b64 = items.join("");
        const raw = atob(b64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
          bytes[i] = raw.charCodeAt(i);
        }
        return new TextDecoder().decode(bytes);
      } catch (_) {}
    }
  }

  // Fallback pattern matching for base64 eval
  const b64Match = code.match(/atob\(["']([A-Za-z0-9+/=]+)["']\)/) || code.match(/["']([A-Za-z0-9+/=]{40,})["']/);
  if (b64Match && b64Match[1]) {
    try {
      const raw = atob(b64Match[1]);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    } catch (_) {}
  }

  return null;
}

// TAB 3: SCRIPT EDITOR (MONACO EDITOR - Zero outer border/padding, Flush layout)
export function renderKitScriptTab() {
  const container = document.getElementById("kit-tab-content");
  const activeKit = getActiveKit();
  if (!container || !activeKit) return;

  const currentTheme = getSavedScriptTheme();

  const themeOptionsHtml = MONACO_THEMES.map(
    (t) => `<option value="${t.id}" ${t.id === currentTheme ? "selected" : ""}>${escapeHtml(t.name)}</option>`
  ).join("");

  container.innerHTML = `
    <div class="kit-script-editor-wrapper p-0 m-0 border-0 rounded-0" style="margin: -1.5rem -1.5rem -1.5rem -1.5rem !important; width: calc(100% + 3rem); height: calc(100vh - 106px);">
      <!-- Overlay 3-Dot Dropdown Menu on Top Right of Editor -->
      <div class="dropdown kit-script-floating-menu">
        <button class="btn btn-dark btn-sm border bg-body-tertiary text-body shadow-sm py-1 px-2 dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Script Options">
          <ion-icon name="ellipsis-vertical-outline"></ion-icon>
        </button>
        <ul class="dropdown-menu dropdown-menu-end shadow" style="min-width: 275px;">
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-save-kit-script"><ion-icon name="checkmark-outline" class="text-success"></ion-icon>Save Script</a></li>
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-format-kit-script"><ion-icon name="code-outline" class="text-secondary"></ion-icon>Format Code</a></li>
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-insert-vars-boilerplate"><ion-icon name="download-outline" class="text-primary"></ion-icon>Insert Block Variables</a></li>
          <li><hr class="dropdown-divider my-1"></li>
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-obfuscate-kit-script"><ion-icon name="lock-closed-outline" class="text-warning"></ion-icon>Obfuscate Script</a></li>
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-unobfuscate-kit-script"><ion-icon name="lock-open-outline" class="text-info"></ion-icon>Unobfuscate Script</a></li>
          <li><hr class="dropdown-divider my-1"></li>
          <li class="dropdown-header small text-body-secondary py-1">Editor Theme</li>
          <li class="px-3 py-1">
            <div class="input-group input-group-sm">
              <button class="btn btn-outline-secondary" type="button" id="btn-prev-monaco-theme" title="Previous theme">
                <ion-icon name="chevron-back-outline"></ion-icon>
              </button>
              <select class="form-select form-select-sm small font-sans" id="select-monaco-theme" style="cursor: pointer;">
                ${themeOptionsHtml}
              </select>
              <button class="btn btn-outline-secondary" type="button" id="btn-next-monaco-theme" title="Next theme">
                <ion-icon name="chevron-forward-outline"></ion-icon>
              </button>
            </div>
          </li>
          <li><hr class="dropdown-divider my-1"></li>
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-copy-kit-script"><ion-icon name="copy-outline" class="text-secondary"></ion-icon>Copy Script</a></li>
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-export-kit-script"><ion-icon name="download-outline" class="text-secondary"></ion-icon>Export Script (.js)</a></li>
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-import-kit-script"><ion-icon name="cloud-upload-outline" class="text-secondary"></ion-icon>Import Script (.js)</a></li>
          <li><hr class="dropdown-divider my-1"></li>
          <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" id="btn-insert-template-script"><ion-icon name="code-working-outline" class="text-secondary"></ion-icon>Reset to Template</a></li>
          <li><a class="dropdown-item small text-danger d-flex align-items-center gap-2" href="#" id="btn-clear-kit-script"><ion-icon name="trash-outline"></ion-icon>Clear Script</a></li>
        </ul>
      </div>

      <!-- Monaco Container (Full width, full height, zero border/gap flush) -->
      <div class="kit-monaco-wrapper rounded-0 border-0 w-100 h-100" id="monaco-script-editor-container">
        <textarea class="form-control font-monospace border-0 bg-dark text-light p-3 small h-100 w-100 rounded-0" id="kit-script-fallback-editor" spellcheck="false">${escapeHtml(activeKit.script || "")}</textarea>
      </div>
    </div>
  `;

  // Bind dropdown menus
  bindUniversalDropdowns(container);

  const monacoContainer = container.querySelector("#monaco-script-editor-container");
  const fallbackEditor = container.querySelector("#kit-script-fallback-editor");
  const btnSave = container.querySelector("#btn-save-kit-script");
  const btnFormat = container.querySelector("#btn-format-kit-script");
  const btnInsertVars = container.querySelector("#btn-insert-vars-boilerplate");
  const btnCopyScript = container.querySelector("#btn-copy-kit-script");
  const btnExportScript = container.querySelector("#btn-export-kit-script");
  const btnImportScript = container.querySelector("#btn-import-kit-script");
  const btnResetTpl = container.querySelector("#btn-insert-template-script");
  const btnClearScript = container.querySelector("#btn-clear-kit-script");
  const selectTheme = container.querySelector("#select-monaco-theme");
  const btnPrevTheme = container.querySelector("#btn-prev-monaco-theme");
  const btnNextTheme = container.querySelector("#btn-next-monaco-theme");

  const applyThemeById = (themeId) => {
    saveScriptTheme(themeId);
    if (selectTheme) selectTheme.value = themeId;
    if (window.monaco && window.monaco.editor) {
      registerMonacoThemes();
      window.monaco.editor.setTheme(themeId);
    }
  };

  if (selectTheme) {
    selectTheme.addEventListener("change", (e) => {
      e.stopPropagation();
      applyThemeById(selectTheme.value);
    });
    selectTheme.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  if (btnPrevTheme) {
    btnPrevTheme.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const curr = getSavedScriptTheme();
      const idx = MONACO_THEMES.findIndex((t) => t.id === curr);
      const prevIdx = (idx - 1 + MONACO_THEMES.length) % MONACO_THEMES.length;
      applyThemeById(MONACO_THEMES[prevIdx].id);
    });
  }

  if (btnNextTheme) {
    btnNextTheme.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const curr = getSavedScriptTheme();
      const idx = MONACO_THEMES.findIndex((t) => t.id === curr);
      const nextIdx = (idx + 1) % MONACO_THEMES.length;
      applyThemeById(MONACO_THEMES[nextIdx].id);
    });
  }

  const triggerSaveScript = () => {
    const curKit = getActiveKit();
    if (!curKit) return;
    const monacoInst = getMonacoEditorInstance();
    if (monacoInst) {
      curKit.script = monacoInst.getValue();
    } else if (fallbackEditor) {
      curKit.script = fallbackEditor.value;
    }
    saveUserKit(curKit);
    if (btnSave) {
      const origHtml = btnSave.innerHTML;
      btnSave.innerHTML = `<ion-icon name="checkmark-done-outline" class="text-success"></ion-icon> Saved!`;
      setTimeout(() => (btnSave.innerHTML = origHtml), 1500);
    }
  };

  // Initialize Monaco Editor
  const initMonaco = () => {
    if (!window.monaco || !monacoContainer) return;

    if (fallbackEditor) fallbackEditor.remove();

    registerMonacoThemes();
    const activeTheme = getSavedScriptTheme();

    const inst = window.monaco.editor.create(monacoContainer, {
      value: activeKit.script || "",
      language: "javascript",
      theme: activeTheme,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      fontFamily: "'Fira Code', Consolas, Monaco, monospace",
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      wordWrap: "on",
      tabSize: 2,
    });
    setMonacoEditorInstance(inst);

    // Bind Ctrl+S / Cmd+S shortcut inside Monaco editor
    inst.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS, () => {
      triggerSaveScript();
    });

    inst.onDidChangeModelContent(() => {
      const curKit = getActiveKit();
      if (curKit) {
        curKit.script = inst.getValue();
        saveUserKit(curKit);
      }
    });
  };

  if (window.monaco) {
    initMonaco();
  } else if (window.require) {
    window.require.config({
      paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" },
    });
    window.require(["vs/editor/editor.main"], function () {
      initMonaco();
    });
  } else {
    // Textarea fallback listener
    if (fallbackEditor) {
      fallbackEditor.addEventListener("input", () => {
        const curKit = getActiveKit();
        if (curKit) {
          curKit.script = fallbackEditor.value;
          saveUserKit(curKit);
        }
      });
    }
  }

  // Periodic autosave every 5 seconds
  if (window._kitScriptAutosaveInterval) {
    clearInterval(window._kitScriptAutosaveInterval);
  }
  window._kitScriptAutosaveInterval = setInterval(() => {
    const curKit = getActiveKit();
    if (!curKit) return;
    const monacoInst = getMonacoEditorInstance();
    const currentVal = monacoInst ? monacoInst.getValue() : (fallbackEditor ? fallbackEditor.value : null);
    if (currentVal !== null && currentVal !== curKit.script) {
      curKit.script = currentVal;
      saveUserKit(curKit);
    }
  }, 5000);

  if (btnSave) {
    btnSave.addEventListener("click", (e) => {
      e.preventDefault();
      triggerSaveScript();
    });
  }

  if (btnFormat) {
    btnFormat.addEventListener("click", (e) => {
      e.preventDefault();
      const monacoInst = getMonacoEditorInstance();
      if (monacoInst) {
        monacoInst.getAction("editor.action.formatDocument")?.run();
      }
    });
  }

  const btnObfuscate = container.querySelector("#btn-obfuscate-kit-script");
  const btnUnobfuscate = container.querySelector("#btn-unobfuscate-kit-script");

  if (btnObfuscate) {
    btnObfuscate.addEventListener("click", async (e) => {
      e.preventDefault();
      const curKit = getActiveKit();
      if (!curKit) return;
      const monacoInst = getMonacoEditorInstance();
      const code = monacoInst ? monacoInst.getValue() : (fallbackEditor ? fallbackEditor.value : curKit.script || "");
      if (!code.trim()) {
        await showCustomKitAlert("There is no script code to obfuscate.", "Obfuscation");
        return;
      }
      if (code.includes("@anedikit-obfuscated")) {
        await showCustomKitAlert("This script is already obfuscated.", "Obfuscation");
        return;
      }
      const obfuscated = obfuscateScriptCode(code);
      if (monacoInst) {
        monacoInst.setValue(obfuscated);
      } else if (fallbackEditor) {
        fallbackEditor.value = obfuscated;
      }
      curKit.script = obfuscated;
      saveUserKit(curKit);
      await showCustomKitAlert("Script successfully obfuscated with protected execution payload.", "Obfuscation");
    });
  }

  if (btnUnobfuscate) {
    btnUnobfuscate.addEventListener("click", async (e) => {
      e.preventDefault();
      const curKit = getActiveKit();
      if (!curKit) return;
      const monacoInst = getMonacoEditorInstance();
      const code = monacoInst ? monacoInst.getValue() : (fallbackEditor ? fallbackEditor.value : curKit.script || "");
      if (!code.trim()) {
        await showCustomKitAlert("There is no script code to unobfuscate.", "Unobfuscation");
        return;
      }
      const deobfuscated = deobfuscateScriptCode(code);
      if (deobfuscated !== null) {
        if (monacoInst) {
          monacoInst.setValue(deobfuscated);
        } else if (fallbackEditor) {
          fallbackEditor.value = deobfuscated;
        }
        curKit.script = deobfuscated;
        saveUserKit(curKit);
        await showCustomKitAlert("Script successfully unobfuscated to 100% original source code.", "Unobfuscation");
      } else {
        await showCustomKitAlert("The current script does not appear to be an obfuscated script payload.", "Unobfuscation");
      }
    });
  }

  if (btnInsertVars) {
    btnInsertVars.addEventListener("click", async (e) => {
      e.preventDefault();
      const curKit = getActiveKit();
      if (!curKit) return;
      const blockIds = (curKit.blocks || []).filter((b) => b.id).map((b) => b.id);
      if (blockIds.length === 0) {
        await showCustomKitAlert("No blocks found in this kit to extract variables from.", "Insert Variables");
        return;
      }
      const boilerplate = `  // Block parameters from UI\n  const { ${blockIds.join(", ")} } = ctx.values;\n`;
      const monacoInst = getMonacoEditorInstance();
      if (monacoInst) {
        const selection = monacoInst.getSelection() || new window.monaco.Selection(1, 1, 1, 1);
        monacoInst.executeEdits("insert-vars", [
          {
            range: selection,
            text: boilerplate,
            forceMoveMarkers: true,
          },
        ]);
        monacoInst.focus();
      } else if (fallbackEditor) {
        const start = fallbackEditor.selectionStart || 0;
        const end = fallbackEditor.selectionEnd || 0;
        fallbackEditor.value = fallbackEditor.value.substring(0, start) + boilerplate + fallbackEditor.value.substring(end);
        curKit.script = fallbackEditor.value;
        saveUserKit(curKit);
      }
    });
  }

  if (btnCopyScript) {
    btnCopyScript.addEventListener("click", async (e) => {
      e.preventDefault();
      const curKit = getActiveKit();
      const monacoInst = getMonacoEditorInstance();
      const code = monacoInst ? monacoInst.getValue() : (fallbackEditor ? fallbackEditor.value : curKit?.script || "");
      await navigator.clipboard.writeText(code);
      const origHtml = btnCopyScript.innerHTML;
      btnCopyScript.innerHTML = `<ion-icon name="checkmark-outline" class="text-success"></ion-icon> Copied!`;
      setTimeout(() => (btnCopyScript.innerHTML = origHtml), 1500);
    });
  }

  if (btnExportScript) {
    btnExportScript.addEventListener("click", (e) => {
      e.preventDefault();
      const curKit = getActiveKit();
      const monacoInst = getMonacoEditorInstance();
      const code = monacoInst ? monacoInst.getValue() : (fallbackEditor ? fallbackEditor.value : curKit?.script || "");
      const blob = new Blob([code], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${curKit?.id || "script"}.js`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  if (btnImportScript) {
    btnImportScript.addEventListener("click", (e) => {
      e.preventDefault();
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".js,.txt";
      fileInput.onchange = (ev) => {
        const file = ev.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (fileEv) => {
          const content = fileEv.target.result;
          const curKit = getActiveKit();
          if (curKit) {
            curKit.script = content;
            const monacoInst = getMonacoEditorInstance();
            if (monacoInst) {
              monacoInst.setValue(content);
            } else if (fallbackEditor) {
              fallbackEditor.value = content;
            }
            saveUserKit(curKit);
          }
        };
        reader.readAsText(file);
      };
      fileInput.click();
    });
  }

  if (btnResetTpl) {
    btnResetTpl.addEventListener("click", (e) => {
      e.preventDefault();
      showCustomKitConfirm(
        "Reset the current script to the default starter template? This replaces your existing code.",
        {
          title: "Reset Script",
          confirmLabel: "Reset",
          busyLabel: "Resetting…",
          onConfirm: () => {
            const curKit = getActiveKit();
            if (!curKit) return;
            const tpl = STARTER_TEMPLATES.converter.script;
            curKit.script = tpl;
            const monacoInst = getMonacoEditorInstance();
            if (monacoInst) {
              monacoInst.setValue(tpl);
            } else if (fallbackEditor) {
              fallbackEditor.value = tpl;
            }
            saveUserKit(curKit);
          },
        },
      );
    });
  }

  if (btnClearScript) {
    btnClearScript.addEventListener("click", (e) => {
      e.preventDefault();
      showCustomKitConfirm(
        "Clear the script contents? A blank command template will replace the current code.",
        {
          title: "Clear Script",
          confirmLabel: "Clear",
          variant: "danger",
          busyLabel: "Clearing…",
          onConfirm: () => {
            const curKit = getActiveKit();
            if (!curKit) return;
            const blank = `function buildCommand(ctx) {\n  const { values, helpers } = ctx;\n  return [];\n}\n`;
            curKit.script = blank;
            const monacoInst = getMonacoEditorInstance();
            if (monacoInst) {
              monacoInst.setValue(blank);
            } else if (fallbackEditor) {
              fallbackEditor.value = blank;
            }
            saveUserKit(curKit);
          },
        },
      );
    });
  }

  // Bind Ctrl+S on window
  const onGlobalKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      if (getActiveKit() && getActiveKitTab() === "script") {
        e.preventDefault();
        triggerSaveScript();
      }
    }
  };
  window.addEventListener("keydown", onGlobalKeyDown);
}
