// AnEdiKit - Merge Video Files Submodule
import { getCachedMediaProbe, setCachedMediaProbe } from "./commands.js";
import { getCurrentActiveTool, animateQueueHeight, attachFluentRipple } from "./navigation.js";

let mergeFiles = [];
let selectedMergeIdx = -1;
let mergeProbeRun = 0;
let updateCallback = null;

export function getMergeFiles() {
  return mergeFiles;
}

export function setMergeFiles(files) {
  mergeFiles = Array.isArray(files) ? [...files] : [];
  selectedMergeIdx = -1;
}

export function clearMergeFiles() {
  mergeFiles = [];
  selectedMergeIdx = -1;
}

export function renderMergeList() {
  animateQueueHeight(document.getElementById("merge-file-list"), renderMergeListInner);
  probeMergeFilesAudio();
}

// Fire-and-forget audio/duration probing for merge inputs so the merge
// command builder can adapt its filtergraph to silent clips. Results land in
// the shared probe cache (commands.js); the preview rebuilds once known.
export async function probeMergeFilesAudio(onChanged = null) {
  if (!window.__TAURI__?.core?.invoke || mergeFiles.length === 0) return;
  const run = ++mergeProbeRun;
  let changed = false;
  for (const f of mergeFiles) {
    if (run !== mergeProbeRun) return;
    try {
      if (getCachedMediaProbe(f)) continue;
      const info = await window.__TAURI__.core.invoke("get_media_info", { filePath: f });
      if (run !== mergeProbeRun) return;
      if (info && (info.file_path || info.file_name)) {
        setCachedMediaProbe(f, info);
        changed = true;
      }
    } catch (_) {}
  }
  if (changed && run === mergeProbeRun && getCurrentActiveTool() === "merge") {
    if (typeof onChanged === "function") {
      onChanged();
    } else if (typeof updateCallback === "function") {
      updateCallback();
    }
  }
}

function notifyUpdate() {
  if (typeof updateCallback === "function") {
    updateCallback();
  }
}

function renderMergeListInner() {
  const mergeList = document.getElementById("merge-file-list");
  if (!mergeList) return;

  if (mergeFiles.length === 0) {
    mergeList.className = "mb-2 small";
    mergeList.style.maxHeight = "";
    mergeList.style.overflowY = "visible";
    mergeList.style.overscrollBehavior = "";
    mergeList.innerHTML = `
      <div class="list-group-item text-body-secondary text-center py-5 d-flex flex-column align-items-center justify-content-center gap-2 rounded bg-body-tertiary" id="merge-empty-msg" style="border: 2px dashed var(--bs-border-color); cursor: pointer; overscroll-behavior: none;">
        <ion-icon name="library-outline" class="fs-2 text-secondary opacity-50 mb-1"></ion-icon>
        <span class="fw-medium text-body" id="merge-drop-label">Drop media files here or click to select</span>
        <span class="small text-body-secondary" id="merge-drop-sublabel">Supports MP4, MKV, WebM, MOV, AVI, MP3, WAV, FLAC</span>
        <button class="btn btn-outline-primary btn-sm mt-2" type="button" id="btn-merge-add-empty" title="Add files to merge list">
          <ion-icon name="folder-open-outline" class="me-1"></ion-icon> Select Files
        </button>
      </div>
    `;
    const emptyMsg = document.getElementById("merge-empty-msg");
    if (emptyMsg) {
      attachFluentRipple(emptyMsg);
      // Single delegated listener: button clicks bubble up here, so no
      // separate button listener (that caused 2 dialogs in a row).
      emptyMsg.addEventListener("click", async () => {
        if (emptyMsg.dataset.picking === "1") return;
        emptyMsg.dataset.picking = "1";
        try {
          if (window.__TAURI__?.core?.invoke) {
            try {
              const picked = await window.__TAURI__.core.invoke("pick_files", { filter_mode: "all" });
              if (picked && picked.length > 0) {
                mergeFiles.push(...picked);
                renderMergeList();
                notifyUpdate();
              }
            } catch (e) {
              console.warn("pick_files error:", e);
            }
          } else {
            const mockFile = `C:\\Users\\User\\Videos\\clip_${mergeFiles.length + 1}.mp4`;
            mergeFiles.push(mockFile);
            renderMergeList();
            notifyUpdate();
          }
        } finally {
          delete emptyMsg.dataset.picking;
        }
      });
    }
    return;
  }
  mergeList.className = "list-group border rounded mb-2 small overflow-y-auto";
  mergeList.style.maxHeight = "180px";
  mergeList.style.overflowY = "auto";
  mergeList.style.overscrollBehavior = "contain";

  mergeList.innerHTML = mergeFiles
    .map(
      (f, idx) => `
      <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2 ${idx === selectedMergeIdx ? "active" : ""}" data-item-idx="${idx}" style="cursor: pointer;">
        <span class="text-truncate small"><strong class="me-2">${idx + 1}.</strong>${f}</span>
        <button class="btn btn-outline-danger btn-sm py-0 px-2 btn-merge-del ${idx === selectedMergeIdx ? "btn-outline-light" : ""}" data-idx="${idx}" type="button"><ion-icon name="close-outline"></ion-icon></button>
      </div>
    `,
    )
    .join("");

  mergeList.querySelectorAll(".list-group-item-action").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".btn-merge-del")) return;
      selectedMergeIdx = parseInt(item.dataset.itemIdx, 10);
      renderMergeList();
    });
  });

  mergeList.querySelectorAll(".btn-merge-del").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(b.dataset.idx, 10);
      mergeFiles.splice(idx, 1);
      if (selectedMergeIdx === idx) selectedMergeIdx = -1;
      else if (selectedMergeIdx > idx) selectedMergeIdx--;
      renderMergeList();
      notifyUpdate();
    });
  });
}

export function initMergeControls(onUpdated = null) {
  if (onUpdated) updateCallback = onUpdated;

  const btnMergeAdd = document.getElementById("btn-merge-add");
  const btnMergeUp = document.getElementById("btn-merge-up");
  const btnMergeDown = document.getElementById("btn-merge-down");
  const btnMergeClear = document.getElementById("btn-merge-clear");

  if (btnMergeAdd) {
    btnMergeAdd.addEventListener("click", async () => {
      if (window.__TAURI__?.core?.invoke) {
        try {
          const picked = await window.__TAURI__.core.invoke("pick_files", { filter_mode: "all" });
          if (picked && picked.length > 0) {
            mergeFiles.push(...picked);
            renderMergeList();
            notifyUpdate();
          }
        } catch (e) {
          console.warn("pick_files error:", e);
        }
      } else {
        const mockFile = `C:\\Users\\User\\Videos\\clip_${mergeFiles.length + 1}.mp4`;
        mergeFiles.push(mockFile);
        renderMergeList();
        notifyUpdate();
      }
    });
  }

  if (btnMergeUp) {
    btnMergeUp.addEventListener("click", () => {
      if (selectedMergeIdx > 0 && selectedMergeIdx < mergeFiles.length) {
        const temp = mergeFiles[selectedMergeIdx];
        mergeFiles[selectedMergeIdx] = mergeFiles[selectedMergeIdx - 1];
        mergeFiles[selectedMergeIdx - 1] = temp;
        selectedMergeIdx--;
        renderMergeList();
        notifyUpdate();
      }
    });
  }

  if (btnMergeDown) {
    btnMergeDown.addEventListener("click", () => {
      if (selectedMergeIdx >= 0 && selectedMergeIdx < mergeFiles.length - 1) {
        const temp = mergeFiles[selectedMergeIdx];
        mergeFiles[selectedMergeIdx] = mergeFiles[selectedMergeIdx + 1];
        mergeFiles[selectedMergeIdx + 1] = temp;
        selectedMergeIdx++;
        renderMergeList();
        notifyUpdate();
      }
    });
  }

  if (btnMergeClear) {
    btnMergeClear.addEventListener("click", () => {
      mergeFiles = [];
      selectedMergeIdx = -1;
      renderMergeList();
      notifyUpdate();
    });
  }
}
