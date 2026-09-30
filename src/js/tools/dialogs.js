// AnEdiKit - Missing-tools dialogs + first-start checks.
import toolsManifest from "../../data/tools-manifest.json" with { type: "json" };
import { isFirstStart, markFirstStartChecked, loadSettings } from "../storage.js";
import { checkLocalToolVersions } from "./versions.js";
import { renderToolsUI } from "./render.js";

export async function getMissingTools() {
  let versions = {};
  try {
    versions = (await checkLocalToolVersions()) || {};
  } catch (err) {
    console.warn("checkLocalToolVersions error:", err);
    versions = {};
  }

  const manageableTools = toolsManifest.filter((t) => t.hasManageRow);
  const missing = [];

  for (const tool of manageableTools) {
    const ver = versions[tool.id] || versions[`${tool.id}_installed`] || versions[tool.binName];
    const isInstalled = ver && ver !== "Not Found" && !ver.toLowerCase().includes("not");

    // For ffmpeg, also check ffprobe
    if (tool.id === "ffmpeg") {
      const probeVer = versions["ffprobe"] || versions["ffprobe_installed"] || versions["ffprobe.exe"];
      const probeInstalled = probeVer && probeVer !== "Not Found" && !probeVer.toLowerCase().includes("not");
      if (!isInstalled || !probeInstalled) {
        missing.push(tool);
      }
    } else if (!isInstalled) {
      missing.push(tool);
    }
  }

  // Also check if Python is available on the system
  const pyTool = toolsManifest.find((t) => t.id === "python");
  if (pyTool) {
    const pyVer = versions["python"] || versions["python_installed"] || versions["python.exe"];
    const pyInstalled = pyVer && pyVer !== "Not Found" && !pyVer.toLowerCase().includes("not");
    if (!pyInstalled) {
      missing.push(pyTool);
    }
  }

  return missing;
}


export function showMissingToolsDialog(missingTools) {
  const modalEl = document.getElementById("missing-tools-modal");
  if (!modalEl || !missingTools || missingTools.length === 0) return;

  const listContainer = document.getElementById("missing-tools-list");
  if (listContainer) {
    listContainer.innerHTML = missingTools
      .map(
        (tool) => `
      <div class="settings-row py-2 px-3">
        <div class="d-flex align-items-center gap-3 min-w-0">
          <ion-icon name="${tool.icon}" class="fs-4 ${tool.iconColorClass} flex-shrink-0 lh-1"></ion-icon>
          <div class="min-w-0">
            <div class="fw-medium text-body text-truncate">${tool.displayName}</div>
            <div class="text-body-secondary small text-truncate" style="font-size: 0.75rem;">${tool.summary}</div>
          </div>
        </div>
        <span class="badge text-bg-danger-subtle text-danger border border-danger-subtle flex-shrink-0 ms-2" style="font-size: 0.7rem;">Not Installed</span>
      </div>
    `
      )
      .join("");
  }

  // If manage-tools-modal is currently open, don't overlap
  const manageModalEl = document.getElementById("manage-tools-modal");
  if (manageModalEl && manageModalEl.classList.contains("show")) return;

  const modal = window.bootstrap?.Modal
    ? window.bootstrap.Modal.getOrCreateInstance(modalEl)
    : null;
  if (modal) {
    modal.show();
  }
}


export function initMissingToolsDialog() {
  const btnOpenManage = document.getElementById("btn-open-manage-tools-from-missing");
  const missingModalEl = document.getElementById("missing-tools-modal");
  const manageModalEl = document.getElementById("manage-tools-modal");

  if (btnOpenManage && missingModalEl && manageModalEl) {
    btnOpenManage.addEventListener("click", () => {
      const missingModal = window.bootstrap?.Modal
        ? window.bootstrap.Modal.getInstance(missingModalEl)
        : null;
      if (missingModal) {
        missingModalEl.addEventListener(
          "hidden.bs.modal",
          () => {
            const manageModal = window.bootstrap?.Modal
              ? window.bootstrap.Modal.getOrCreateInstance(manageModalEl)
              : null;
            if (manageModal) manageModal.show();
          },
          { once: true }
        );
        missingModal.hide();
      } else {
        const manageModal = window.bootstrap?.Modal
          ? window.bootstrap.Modal.getOrCreateInstance(manageModalEl)
          : null;
        if (manageModal) manageModal.show();
      }
    });
  }
}


export async function checkFirstStartTools() {
  if (!isFirstStart()) return;
  markFirstStartChecked();

  try {
    const missing = await getMissingTools();
    if (missing && missing.length > 0) {
      showMissingToolsDialog(missing);
    }
  } catch (err) {
    console.warn("First start tools check failed:", err);
  }
}


export async function checkToolsBeforeExecution() {
  try {
    const missing = await getMissingTools();
    if (missing && missing.length > 0) {
      showMissingToolsDialog(missing);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Pre-execution tools check error:", err);
    return true;
  }
}
