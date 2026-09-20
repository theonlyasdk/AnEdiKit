// AnEdiKit - User Kits Runner & Input Controls Module
import {
  getActiveKit,
  getKitRuntimeValues,
  setKitRuntimeValue,
  setActiveKitTab,
} from "./state.js";
import { renderBlockHTML } from "./blocks.js";
import { saveKitParams, saveUserKit } from "./storage.js";
import { selectMediaFile, selectOutputFolder, probeMedia } from "../js/media.js";
import { animateCopyConfirm } from "../js/copy_anim.js";
import { updateKitLivePreview } from "./executor.js";
import { renderKitIdeWorkspace } from "./workspace.js";

// TAB 1: RUNNER / INTERACTIVE TOOL VIEW (No Kit Action Card)
export function renderKitRunnerTab() {
  const activeKit = getActiveKit();
  const kitRuntimeValues = getKitRuntimeValues();
  const container = document.getElementById("kit-tab-content");
  if (!container || !activeKit) return;

  const blocks = activeKit.blocks || [];
  if (blocks.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5 text-body-secondary border rounded bg-body">
        <ion-icon name="cube-outline" class="fs-1 text-secondary opacity-50 mb-2"></ion-icon>
        <h6 class="text-body fw-semibold">No Blocks Defined</h6>
        <p class="small text-body-secondary mb-3">Add blocks in the "Blocks" tab to create inputs and controls for this kit.</p>
        <button class="btn btn-primary btn-sm" type="button" id="btn-goto-builder">
          <ion-icon name="add-outline" class="me-1"></ion-icon> Open Blocks Builder
        </button>
      </div>
    `;
    const btnGoto = container.querySelector("#btn-goto-builder");
    if (btnGoto) {
      btnGoto.addEventListener("click", () => {
        setActiveKitTab("builder");
        renderKitIdeWorkspace();
      });
    }
    return;
  }

  const blocksHtml = blocks.map((b) => renderBlockHTML(b, kitRuntimeValues[b.id], activeKit.id)).join("");

  container.innerHTML = `
    <div class="row g-3 mb-4">
      <div class="col-12">
        <div class="card bg-body border-0">
          <div class="card-body p-0">
            ${blocksHtml}
          </div>
        </div>
      </div>
    </div>

    <!-- Execution Footer Panel (Command Preview & Conditional Execution Status/Logs) -->
    <div id="kit-execution-footer-panel">
      <!-- Command Preview -->
      <div class="mb-4" id="kit-command-preview-card">
        <div class="section-divider-header">Command Preview</div>
        <div class="input-group">
          <div class="form-control small user-select-all text-body bg-body font-monospace overflow-x-auto d-flex align-items-center" style="min-height: 38px; font-size: 0.8rem; white-space: nowrap;" id="kit-cmd-preview">ffmpeg [waiting for input media selection...]</div>
          <button class="btn btn-outline-secondary" type="button" id="btn-kit-copy-cmd" title="Copy command string">
            <ion-icon name="copy-outline"></ion-icon>
          </button>
        </div>
      </div>

      <!-- Conditional Progress & Execution Logs (Shown only after user clicks Execute) -->
      <div class="mb-3 d-none ui-zoom-in" id="kit-execution-status-panel">
        <div class="section-divider-header">Execution Status & Log Output</div>
        <div class="card border-secondary-subtle overflow-hidden position-relative">
          <!-- Copy Log Button at Top Right Corner -->
          <button type="button" class="btn btn-sm text-secondary border-0 bg-transparent position-absolute top-0 end-0 m-1 log-copy-btn" id="btn-kit-copy-logs" title="Copy execution log to clipboard" style="z-index: 5;">
            <ion-icon name="copy-outline"></ion-icon>
          </button>

          <!-- Log Box at top (full width, no gap from top, user-selectable text) -->
          <div class="bg-black text-success-emphasis p-3 pe-5 font-monospace small overflow-y-auto user-select-text" style="height: 140px; font-size: 0.8rem; user-select: text; -webkit-user-select: text;" id="kit-log-console">
            <div class="text-secondary">[Ready to process tasks]</div>
          </div>

          <!-- Status text in middle -->
          <div class="d-flex justify-content-between align-items-center px-3 py-2 bg-body small text-body-secondary border-top">
            <div class="d-flex flex-wrap gap-3">
              <span id="kit-stat-time">Time: 00:00:00</span>
              <span id="kit-stat-fps">FPS: 0</span>
              <span id="kit-stat-speed">Speed: 0x</span>
              <span id="kit-stat-bitrate">Bitrate: 0 kbits/s</span>
            </div>
            <span class="fw-semibold text-body" id="kit-progress-pct">0%</span>
          </div>

          <!-- Progress Bar at absolute bottom (full width, no gap) -->
          <div class="progress rounded-0" style="height: 4px; background-color: var(--bs-border-color);" id="kit-exec-progress-container">
            <div class="progress-bar" id="kit-job-progress-bar" role="progressbar" style="width: 0%"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindKitRunnerInputs(container);
  updateKitLivePreview();
}

export function bindKitRunnerInputs(container) {
  const activeKit = getActiveKit();
  const kitRuntimeValues = getKitRuntimeValues();
  if (!container || !activeKit) return;

  // File input browse buttons
  container.querySelectorAll(".btn-browse-block-file").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const blockId = btn.dataset.blockId;
      const filter = btn.dataset.filter || "all";
      const filePath = await selectMediaFile(filter);
      if (filePath) {
        setKitRuntimeValue(blockId, filePath);
        saveKitParams(activeKit.id, getKitRuntimeValues());

        const inputEl = container.querySelector(`#kit-block-${blockId}`);
        if (inputEl) inputEl.value = filePath;

        // Automatically update output filename if an output_filename block exists
        const outBlock = (activeKit.blocks || []).find((b) => b.type === "output_filename");
        if (outBlock) {
          const fileName = filePath.split(/[/\\]/).pop() || filePath;
          const baseName = fileName.replace(/\.[^/.]+$/, "");
          const suffix = outBlock.suffix || "_processed";
          const newOutName = `${baseName}${suffix}`;
          setKitRuntimeValue(outBlock.id, newOutName);
          saveKitParams(activeKit.id, getKitRuntimeValues());
          const outEl = container.querySelector(`#kit-block-${outBlock.id}`);
          if (outEl) outEl.value = newOutName;
        }

        // Probe media info
        probeMedia(filePath).then((info) => {
          const metaCard = container.querySelector(`#kit-file-meta-${blockId}`);
          const metaDesc = container.querySelector(`#kit-file-meta-desc-${blockId}`);
          const metaBadge = container.querySelector(`#kit-file-meta-badge-${blockId}`);
          if (metaCard && info) {
            metaCard.classList.remove("d-none");
            if (metaDesc) metaDesc.textContent = `${info.resolution || ""} • ${info.video_codec || ""} / ${info.audio_codec || ""} • ${info.file_size_formatted || ""}`;
            if (metaBadge) metaBadge.textContent = info.duration_string || "";
          }
        });

        updateKitLivePreview();
      }
    });
  });

  // Clear file buttons
  container.querySelectorAll(".btn-clear-block-file").forEach((btn) => {
    btn.addEventListener("click", () => {
      const blockId = btn.dataset.blockId;
      setKitRuntimeValue(blockId, "");
      saveKitParams(activeKit.id, getKitRuntimeValues());
      const inputEl = container.querySelector(`#kit-block-${blockId}`);
      if (inputEl) inputEl.value = "";
      const metaCard = container.querySelector(`#kit-file-meta-${blockId}`);
      if (metaCard) metaCard.classList.add("d-none");
      updateKitLivePreview();
    });
  });

  // Folder browse buttons
  container.querySelectorAll(".btn-browse-block-folder").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const blockId = btn.dataset.blockId;
      const folderPath = await selectOutputFolder();
      if (folderPath) {
        setKitRuntimeValue(blockId, folderPath);
        saveKitParams(activeKit.id, getKitRuntimeValues());
        const inputEl = container.querySelector(`#kit-block-${blockId}`);
        if (inputEl) inputEl.value = folderPath;
        updateKitLivePreview();
      }
    });
  });

  // Folder open in File Explorer buttons
  container.querySelectorAll(".btn-open-block-folder").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const blockId = btn.dataset.blockId;
      const inputEl = container.querySelector(`#kit-block-${blockId}`);
      const folderPath = inputEl?.value || getKitRuntimeValues()[blockId] || "";
      if (folderPath && window.__TAURI__?.core?.invoke) {
        try {
          await window.__TAURI__.core.invoke("show_in_folder", { filePath: folderPath });
        } catch (e) {
          console.warn("Failed to open folder:", e);
        }
      }
    });
  });

  // Generic inputs (text, number, select, checkbox, textarea)
  container.querySelectorAll(".kit-block-input").forEach((el) => {
    const blockId = el.dataset.blockId;
    const block = (activeKit.blocks || []).find((b) => b.id === blockId);

    const handleInput = () => {
      if (el.type === "checkbox") {
        setKitRuntimeValue(blockId, el.checked);
      } else if (el.type === "number" || el.type === "range") {
        setKitRuntimeValue(blockId, parseFloat(el.value) || 0);
        const readout = container.querySelector(`#kit-slider-val-${blockId}`);
        if (readout && block) readout.textContent = `${el.value}${block.unit || ""}`;
      } else {
        setKitRuntimeValue(blockId, el.value);
      }
      saveKitParams(activeKit.id, getKitRuntimeValues());
      updateKitLivePreview();
    };

    el.addEventListener("input", handleInput);
    el.addEventListener("change", handleInput);
  });

  // Radio buttons
  container.querySelectorAll(".kit-block-radio").forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) {
        setKitRuntimeValue(r.dataset.blockId, r.value);
        saveKitParams(activeKit.id, getKitRuntimeValues());
        updateKitLivePreview();
      }
    });
  });

  // Copy command button
  const btnCopyCmd = container.querySelector("#btn-kit-copy-cmd");
  if (btnCopyCmd) {
    btnCopyCmd.addEventListener("click", async () => {
      const pre = container.querySelector("#kit-cmd-preview");
      if (pre && pre.textContent) {
        await navigator.clipboard.writeText(pre.textContent);
        animateCopyConfirm(btnCopyCmd.querySelector("ion-icon"), { holdMs: 1400 });
        btnCopyCmd.classList.replace("btn-outline-secondary", "btn-success");
        setTimeout(() => {
          btnCopyCmd.classList.replace("btn-success", "btn-outline-secondary");
        }, 1800);
      }
    });
  }

  // Copy logs button
  const btnCopyLogs = container.querySelector("#btn-kit-copy-logs");
  const logBox = container.querySelector("#kit-log-console");
  if (btnCopyLogs && logBox) {
    btnCopyLogs.addEventListener("click", async () => {
      await navigator.clipboard.writeText(logBox.innerText || "");
      animateCopyConfirm(btnCopyLogs.querySelector("ion-icon"), { holdMs: 1200 });
    });
  }

  // Remove unknown or deprecated block button
  container.querySelectorAll(".btn-remove-unknown-block").forEach((btn) => {
    btn.addEventListener("click", () => {
      const blockId = btn.dataset.blockId;
      if (!activeKit || !blockId) return;
      activeKit.blocks = (activeKit.blocks || []).filter((b) => b.id !== blockId);
      const currentValues = getKitRuntimeValues();
      delete currentValues[blockId];
      saveKitParams(activeKit.id, currentValues);
      saveUserKit(activeKit);
      renderKitRunnerTab();
    });
  });
}
