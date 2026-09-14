// AnEdiKit - User Kits Visual Blocks Builder Module
import { getActiveKit, getEditingBlockIndices, setEditingBlockIndices, escapeHtml } from "./state.js";
import { BLOCK_TYPES, createBlockInstance } from "./blocks.js";
import { saveUserKit } from "./storage.js";
import { bindUniversalDropdowns, showCustomKitAlert } from "./modals.js";
import { setupListDragAndDrop } from "../js/drag_reorder.js";

// Generate inline configuration editor HTML for a specific block
export function renderBlockEditorHTML(b, idx) {
  let specificFieldsHtml = "";

  if (b.type === "file_input") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Filter Type</label>
        <div class="col">
          <select class="form-select form-select-sm block-edit-field" data-idx="${idx}" data-field="fileFilter" style="cursor: pointer;">
            <option value="all" ${b.fileFilter === "all" ? "selected" : ""}>All Media Files (*.*)</option>
            <option value="video" ${b.fileFilter === "video" ? "selected" : ""}>Video Files (*.mp4, *.mkv, etc.)</option>
            <option value="audio" ${b.fileFilter === "audio" ? "selected" : ""}>Audio Files (*.mp3, *.wav, etc.)</option>
            <option value="image" ${b.fileFilter === "image" ? "selected" : ""}>Image Files (*.png, *.jpg, etc.)</option>
          </select>
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Placeholder</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="placeholder" value="${escapeHtml(b.placeholder || "")}" placeholder="Select or drop a media file..." />
        </div>
      </div>
    `;
  } else if (b.type === "folder_picker") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Placeholder</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="placeholder" value="${escapeHtml(b.placeholder || "")}" placeholder="Default output directory..." />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">App Default</label>
        <div class="col">
          <div class="form-check form-switch">
            <input class="form-check-input block-edit-field" type="checkbox" data-idx="${idx}" data-field="useAppDefault" id="edit-appdef-${idx}" ${b.useAppDefault !== false ? "checked" : ""}>
            <label class="form-check-label small" for="edit-appdef-${idx}">Use default app video output directory</label>
          </div>
        </div>
      </div>
    `;
  } else if (b.type === "output_filename") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Default Name</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="placeholder" value="${escapeHtml(b.placeholder || "output")}" placeholder="e.g. output" />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Default Suffix</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="suffix" value="${escapeHtml(b.suffix || "_processed")}" placeholder="e.g. _processed" />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Extension</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="ext" value="${escapeHtml(b.ext || "mp4")}" placeholder="e.g. mp4" />
        </div>
      </div>
    `;
  } else if (b.type === "select" || b.type === "radios") {
    const opts = b.options || [];
    const optionsRowsHtml = opts
      .map(
        (opt, optIdx) => `
      <div class="d-flex align-items-center gap-2 block-option-row" data-opt-idx="${optIdx}">
        <input type="text" class="form-control form-control-sm block-opt-lbl" data-idx="${idx}" data-opt-idx="${optIdx}" placeholder="Label (e.g. MP4 Video)" value="${escapeHtml(opt.label)}" />
        <input type="text" class="form-control form-control-sm block-opt-val" data-idx="${idx}" data-opt-idx="${optIdx}" placeholder="Value (e.g. mp4)" value="${escapeHtml(opt.value)}" />
        <button class="btn btn-outline-danger btn-sm flex-shrink-0 btn-remove-block-opt" type="button" data-idx="${idx}" data-opt-idx="${optIdx}" title="Remove option">
          <ion-icon name="close-outline"></ion-icon>
        </button>
      </div>
    `
      )
      .join("");

    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Default Value</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="default" value="${escapeHtml(b.default || "")}" placeholder="Default selected option value..." />
        </div>
      </div>
      <div class="row g-2 mb-2">
        <label class="col-auto col-form-label small fw-medium text-body pt-1" style="width: 120px; flex-shrink: 0;">Choices</label>
        <div class="col">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="small text-body-secondary" style="font-size: 0.75rem;">Label &amp; Value Pairs</span>
            <button class="btn btn-outline-primary btn-sm py-0 px-2 btn-add-block-opt" type="button" data-idx="${idx}">
              <ion-icon name="add-outline"></ion-icon> Add Option
            </button>
          </div>
          <div class="border rounded p-2 bg-body d-flex flex-column gap-2">
            ${optionsRowsHtml || '<div class="small text-body-secondary">No options defined yet. Click "+ Add Option" above.</div>'}
          </div>
        </div>
      </div>
    `;
  } else if (b.type === "number" || b.type === "slider") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Default Value</label>
        <div class="col">
          <input type="number" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="default" value="${b.default !== undefined ? b.default : 0}" />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Minimum</label>
        <div class="col">
          <input type="number" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="min" value="${b.min !== undefined ? b.min : 0}" />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Maximum</label>
        <div class="col">
          <input type="number" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="max" value="${b.max !== undefined ? b.max : 100}" />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Step</label>
        <div class="col">
          <input type="number" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="step" value="${b.step !== undefined ? b.step : 1}" />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Unit Label</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="unit" value="${escapeHtml(b.unit || "")}" placeholder="e.g. %, CRF, kbps" />
        </div>
      </div>
    `;
  } else if (b.type === "text") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Placeholder</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="placeholder" value="${escapeHtml(b.placeholder || "")}" placeholder="Enter placeholder text..." />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Default Value</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="default" value="${escapeHtml(b.default || "")}" placeholder="Default text value..." />
        </div>
      </div>
    `;
  } else if (b.type === "textarea") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Placeholder</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="placeholder" value="${escapeHtml(b.placeholder || "")}" placeholder="Enter multi-line placeholder..." />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Default Rows</label>
        <div class="col">
          <input type="number" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="rows" value="${b.rows || 3}" min="1" max="20" />
        </div>
      </div>
      <div class="row g-2 mb-2">
        <label class="col-auto col-form-label small fw-medium text-body pt-1" style="width: 120px; flex-shrink: 0;">Default Text</label>
        <div class="col">
          <textarea class="form-control form-control-sm block-edit-field font-sans" data-idx="${idx}" data-field="default" rows="2" placeholder="Default content...">${escapeHtml(b.default || "")}</textarea>
        </div>
      </div>
    `;
  } else if (b.type === "checkbox") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Default State</label>
        <div class="col">
          <div class="form-check form-switch">
            <input class="form-check-input block-edit-field" type="checkbox" data-idx="${idx}" data-field="default" id="edit-chkdef-${idx}" ${b.default ? "checked" : ""}>
            <label class="form-check-label small" for="edit-chkdef-${idx}">Default enabled / checked</label>
          </div>
        </div>
      </div>
    `;
  } else if (b.type === "alert_box") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Alert Title</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="title" value="${escapeHtml(b.title || "Note")}" placeholder="e.g. Note" />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Variant</label>
        <div class="col">
          <select class="form-select form-select-sm block-edit-field" data-idx="${idx}" data-field="variant" style="cursor: pointer;">
            <option value="info" ${b.variant === "info" ? "selected" : ""}>Info (Blue)</option>
            <option value="success" ${b.variant === "success" ? "selected" : ""}>Success (Green)</option>
            <option value="warning" ${b.variant === "warning" ? "selected" : ""}>Warning (Yellow)</option>
            <option value="danger" ${b.variant === "danger" ? "selected" : ""}>Danger (Red)</option>
            <option value="secondary" ${b.variant === "secondary" ? "selected" : ""}>Secondary (Gray)</option>
          </select>
        </div>
      </div>
      <div class="row g-2 mb-2">
        <label class="col-auto col-form-label small fw-medium text-body pt-1" style="width: 120px; flex-shrink: 0;">Content</label>
        <div class="col">
          <textarea class="form-control form-control-sm block-edit-field font-sans" data-idx="${idx}" data-field="content" rows="2" placeholder="Alert message text...">${escapeHtml(b.content || "")}</textarea>
        </div>
      </div>
    `;
  } else if (b.type === "progress_and_logs") {
    specificFieldsHtml = `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Max Lines</label>
        <div class="col">
          <input type="number" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="maxLogLines" value="${b.maxLogLines || 300}" />
        </div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Show Logs</label>
        <div class="col">
          <div class="form-check form-switch">
            <input class="form-check-input block-edit-field" type="checkbox" data-idx="${idx}" data-field="showLogs" id="edit-showlogs-${idx}" ${b.showLogs !== false ? "checked" : ""}>
            <label class="form-check-label small" for="edit-showlogs-${idx}">Show log console output box</label>
          </div>
        </div>
      </div>
    `;
  }

  const isInputType = b.type !== "alert_box" && b.type !== "command_preview" && b.type !== "progress_and_logs";

  return `
    <div class="p-3 bg-body-tertiary border-top kit-block-editor-panel" data-idx="${idx}">
      <!-- Row 1: Identifier (At very top) -->
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Identifier</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field font-sans" data-idx="${idx}" data-field="id" value="${escapeHtml(b.id || "")}" placeholder="Machine identifier (ctx.values.id)" />
        </div>
      </div>

      <!-- Row 2: Display Label -->
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Label</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="label" value="${escapeHtml(b.label || "")}" placeholder="Field display label..." />
        </div>
      </div>

      <!-- Row 3: Description -->
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Description</label>
        <div class="col">
          <input type="text" class="form-control form-control-sm block-edit-field" data-idx="${idx}" data-field="help" value="${escapeHtml(b.help || "")}" placeholder="Description or hint text..." />
        </div>
      </div>

      <!-- Row 4: Required Checkbox for input blocks -->
      ${
        isInputType
          ? `
      <div class="row g-2 align-items-center mb-2">
        <label class="col-auto col-form-label small fw-medium text-body" style="width: 120px; flex-shrink: 0;">Required</label>
        <div class="col">
          <div class="form-check form-switch">
            <input class="form-check-input block-edit-field" type="checkbox" data-idx="${idx}" data-field="required" id="edit-req-${idx}" ${b.required ? "checked" : ""}>
            <label class="form-check-label small" for="edit-req-${idx}">Required before execution</label>
          </div>
        </div>
      </div>
      `
          : ""
      }

      <!-- Specific Type Fields -->
      ${specificFieldsHtml}

      <div class="d-flex justify-content-end mt-2">
        <button class="btn btn-primary btn-sm px-3 btn-done-editing-block" type="button" data-idx="${idx}">
          <ion-icon name="checkmark-outline" class="me-1"></ion-icon> Done
        </button>
      </div>
    </div>
  `;
}

// Vertical pointer drag reordering with real-time shift animations for UI Blocks
export function setupBlockItemDrag(itemEl, dragHandle, index, listContainer) {
  const activeKit = getActiveKit();
  if (!activeKit) return;

  setupListDragAndDrop({
    itemEl,
    dragHandle,
    index,
    listContainer,
    itemSelector: ".kit-builder-row",
    onReorder: (startIndex, targetIndex) => {
      const curKit = getActiveKit();
      if (!curKit) return;
      if (targetIndex !== startIndex && targetIndex >= 0 && targetIndex < curKit.blocks.length) {
        const editingBlockIndices = getEditingBlockIndices();
        const newEditing = new Set();
        editingBlockIndices.forEach((openIdx) => {
          if (openIdx === startIndex) {
            newEditing.add(targetIndex);
          } else if (startIndex < targetIndex && openIdx > startIndex && openIdx <= targetIndex) {
            newEditing.add(openIdx - 1);
          } else if (startIndex > targetIndex && openIdx >= targetIndex && openIdx < startIndex) {
            newEditing.add(openIdx + 1);
          } else {
            newEditing.add(openIdx);
          }
        });
        setEditingBlockIndices(newEditing);

        const moved = curKit.blocks.splice(startIndex, 1)[0];
        curKit.blocks.splice(targetIndex, 0, moved);
        saveUserKit(curKit);
        renderKitBuilderTab();
      }
    },
  });
}

// TAB 2: BLOCKS BUILDER (VISUAL IDE)
export function renderKitBuilderTab() {
  const container = document.getElementById("kit-tab-content");
  const activeKit = getActiveKit();
  if (!container || !activeKit) return;

  const blocks = activeKit.blocks || [];
  const editingBlockIndices = getEditingBlockIndices();

  const blockCategoriesHtml = Object.keys(BLOCK_TYPES).reduce((acc, key) => {
    const b = BLOCK_TYPES[key];
    const cat = b.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(b);
    return acc;
  }, {});

  const catKeys = Object.keys(blockCategoriesHtml);
  const blockDropdownHtml = catKeys
    .map((catTitle, catIdx) => {
      const items = blockCategoriesHtml[catTitle]
        .map(
          (b) => {
            const isBi = b.icon && (b.icon.startsWith("bi-") || b.icon.startsWith("bi "));
            const iconEl = isBi
              ? `<i class="${b.icon.startsWith("bi ") ? b.icon : "bi " + b.icon} text-primary fs-5 me-3 flex-shrink-0"></i>`
              : `<ion-icon name="${b.icon || "cube-outline"}" class="text-primary fs-5 me-3 flex-shrink-0"></ion-icon>`;
            return `
        <li>
          <a class="dropdown-item small d-flex align-items-center btn-add-block-type py-2" href="#" data-type="${b.type}">
            ${iconEl}
            <div class="flex-grow-1 min-w-0">
              <div class="fw-medium text-body text-truncate">${escapeHtml(b.name)}</div>
              <div class="text-body-secondary text-truncate" style="font-size: 0.72rem;">${escapeHtml(b.description)}</div>
            </div>
          </a>
        </li>
      `;
          }
        )
        .join("");

      const divider = catIdx < catKeys.length - 1 ? '<li><hr class="dropdown-divider my-1"></li>' : "";

      return `
        <div class="dropdown-header small text-uppercase text-body-secondary py-1">${catTitle}</div>
        ${items}
        ${divider}
      `;
    })
    .join("");

  const blocksListHtml =
    blocks.length === 0
      ? `<div class="p-4 text-center text-body-secondary">No blocks added yet. Click "+ Add Block" above to begin.</div>`
      : blocks
          .map((b, idx) => {
            const isEditing = editingBlockIndices.has(idx);
            const bDef = BLOCK_TYPES[b.type] || { name: b.type, icon: "cube-outline" };
            const bName = bDef.name || b.type;
            const bIcon = bDef.icon || "cube-outline";
            return `
          <div class="border-bottom kit-builder-row bg-body" data-block-id="${b.id}" data-idx="${idx}">
            <div class="d-flex align-items-center justify-content-between gap-2 py-2 px-3 kit-block-header-row user-select-none" data-idx="${idx}" title="Click to configure block" style="cursor: pointer;">
              <span class="kit-block-drag-handle text-secondary cursor-grab p-1 flex-shrink-0" data-drag-idx="${idx}" title="Drag vertically to reorder">
                <ion-icon name="reorder-two-outline" class="fs-5"></ion-icon>
              </span>
              <span class="text-body-secondary fw-semibold flex-shrink-0 me-1" style="font-size: 0.95rem; min-width: 1.1rem; line-height: 1;">${idx + 1}.</span>
              <div class="flex-grow-1 min-w-0">
                <div class="d-flex align-items-center gap-2 flex-wrap">
                  <strong class="text-body text-truncate small">${escapeHtml(b.label || b.id)}</strong>
                  <span class="badge rounded-pill bg-body-secondary text-body-secondary border d-inline-flex align-items-center gap-1 px-2 py-1" style="font-size: 0.72rem; font-weight: 500;">
                    <ion-icon name="${bIcon}" style="font-size: 0.8rem;"></ion-icon>
                    <span>${escapeHtml(bName)}</span>
                  </span>
                </div>
                <div class="small text-body-secondary text-truncate" style="font-size: 0.72rem; opacity: 0.85;">id: ${escapeHtml(b.id)}${b.help || b.placeholder ? ` &bull; ${escapeHtml(b.help || b.placeholder)}` : ""}</div>
              </div>
              <div class="btn-group btn-group-sm flex-shrink-0">
                <button class="btn btn-outline-secondary btn-edit-block ${isEditing ? "active" : ""}" type="button" data-idx="${idx}" title="${isEditing ? "Collapse parameters" : "Edit block parameters"}">
                  <i class="bi ${isEditing ? "bi-chevron-up" : "bi-pencil"}"></i>
                </button>
                <button class="btn btn-outline-secondary btn-move-block-up" type="button" data-idx="${idx}" title="Move Up" ${idx === 0 ? "disabled" : ""}>
                  <ion-icon name="arrow-up-outline"></ion-icon>
                </button>
                <button class="btn btn-outline-secondary btn-move-block-down" type="button" data-idx="${idx}" title="Move Down" ${idx === blocks.length - 1 ? "disabled" : ""}>
                  <ion-icon name="arrow-down-outline"></ion-icon>
                </button>
                <button class="btn btn-outline-danger btn-delete-block" type="button" data-idx="${idx}" title="Delete Block">
                  <ion-icon name="trash-outline"></ion-icon>
                </button>
              </div>
            </div>
            <div class="kit-block-curtain ${isEditing ? "is-open" : ""}" id="curtain-block-${idx}">
              <div class="kit-block-curtain-inner">
                ${renderBlockEditorHTML(b, idx)}
              </div>
            </div>
          </div>
        `;
          })
          .join("");

  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="section-divider-header flex-grow-1 mb-0 me-3">Blocks Layout Structure</div>
      <div class="d-flex align-items-center gap-2 flex-shrink-0">
        <!-- Batch Modify Dropdown -->
        <div class="dropdown">
          <button class="btn btn-outline-secondary btn-sm dropdown-toggle d-flex align-items-center gap-1" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" id="btn-batch-modify-toggle" title="Batch modify multiple blocks">
            <ion-icon name="options-outline"></ion-icon> Batch Modify
          </button>
          <div class="dropdown-menu dropdown-menu-end shadow p-3" style="min-width: 620px; max-width: 95vw;" id="batch-modify-menu">
            <!-- Row 1: Target Scope & Filter Rule -->
            <div class="d-flex align-items-center flex-wrap gap-2 mb-2 bg-body-tertiary p-2 rounded border">
              <span class="small text-body-secondary flex-shrink-0">Target:</span>
              <select class="form-select form-select-sm" id="batch-target-type" style="width: auto; cursor: pointer;">
                <option value="any">All blocks</option>
                <option value="inputs">All input controls</option>
                <option value="settings">Settings blocks</option>
                <option value="output">Output blocks</option>
                <option value="file_input">File pickers</option>
                <option value="folder_picker">Folder pickers</option>
                <option value="output_filename">Output filename</option>
                <option value="select">Dropdown selects</option>
                <option value="text">Text inputs</option>
                <option value="textarea">Text areas</option>
                <option value="number">Number inputs</option>
                <option value="slider">Sliders</option>
                <option value="checkbox">Toggle switches</option>
                <option value="radios">Radio choices</option>
                <option value="alert_box">Alert callouts</option>
              </select>

              <span class="small text-body-secondary flex-shrink-0">where:</span>
              <select class="form-select form-select-sm" id="batch-filter-mode" style="width: auto; cursor: pointer;">
                <option value="all">any block</option>
                <option value="name_contains">label or ID contains</option>
                <option value="name_regex">label or ID matches regex</option>
                <option value="name_starts_with">label or ID starts with</option>
                <option value="name_ends_with">label or ID ends with</option>
                <option value="required_is">required is true</option>
                <option value="not_required">required is false</option>
                <option value="has_desc">has description</option>
                <option value="no_desc">has no description</option>
                <option value="has_placeholder">has placeholder</option>
                <option value="no_placeholder">has no placeholder</option>
                <option value="has_default">has default value</option>
                <option value="index_even">even positions (2nd, 4th...)</option>
                <option value="index_odd">odd positions (1st, 3rd...)</option>
                <option value="index_first_n">first N blocks</option>
                <option value="index_last_n">last N blocks</option>
                <option value="custom_js">JavaScript expression</option>
              </select>

              <input type="text" class="form-control form-control-sm d-none flex-grow-1" id="batch-filter-query" placeholder="filter query..." style="min-width: 140px;" />
            </div>

            <!-- Row 2: Operation, Target Property & Value Inputs -->
            <div class="d-flex align-items-center flex-wrap gap-2 mb-3 bg-body-tertiary p-2 rounded border">
              <select class="form-select form-select-sm" id="batch-op" style="width: auto; cursor: pointer;">
                <option value="set">Set</option>
                <option value="clear">Clear</option>
                <option value="prepend">Prepend</option>
                <option value="append">Append</option>
                <option value="replace">Find & replace</option>
                <option value="invert">Invert / toggle</option>
                <option value="case_transform">Change case</option>
              </select>

              <select class="form-select form-select-sm" id="batch-prop" style="width: auto; cursor: pointer;">
                <option value="required">required</option>
                <option value="label">display label</option>
                <option value="help">description (help text)</option>
                <option value="placeholder">placeholder</option>
                <option value="default">default value</option>
              </select>

              <span class="small text-body-secondary" id="batch-to-label">to</span>

              <div class="flex-grow-1 d-flex align-items-center gap-2" id="batch-val-wrapper" style="min-width: 150px;">
                <select class="form-select form-select-sm" id="batch-val-select" style="cursor: pointer;">
                  <option value="true">true (checked)</option>
                  <option value="false">false (unchecked)</option>
                </select>
                <input type="text" class="form-control form-control-sm d-none" id="batch-val-text" placeholder="value to apply..." />
                
                <!-- Find & Replace Sub-inputs -->
                <div class="d-none w-100 d-flex gap-2" id="batch-val-replace-group">
                  <input type="text" class="form-control form-control-sm" id="batch-val-find" placeholder="find text or /regex/..." />
                  <input type="text" class="form-control form-control-sm" id="batch-val-replace" placeholder="replace with..." />
                </div>

                <!-- Case Transform Sub-select -->
                <select class="form-select form-select-sm d-none" id="batch-val-case" style="cursor: pointer;">
                  <option value="uppercase">uppercase</option>
                  <option value="lowercase">lowercase</option>
                  <option value="titlecase">title case</option>
                </select>
              </div>
            </div>

            <!-- Summary & Actions Bar -->
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 pt-0">
              <span class="small text-body-secondary text-truncate me-2 flex-grow-1 min-w-0" id="batch-summary-preview">Set required = true on all blocks</span>
              <div class="d-flex gap-2 flex-shrink-0">
                <button type="button" class="btn btn-outline-secondary btn-sm px-3" id="btn-batch-cancel">Cancel</button>
                <button type="button" class="btn btn-primary btn-sm px-3" id="btn-batch-apply"><ion-icon name="checkmark-outline" class="me-1"></ion-icon>Apply</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Add Block Dropdown -->
        <div class="dropdown">
          <button class="btn btn-primary btn-sm dropdown-toggle d-flex align-items-center gap-1" type="button" data-bs-toggle="dropdown" aria-expanded="false">
            <ion-icon name="add-outline"></ion-icon> Add Block
          </button>
          <ul class="dropdown-menu dropdown-menu-end shadow" style="max-height: 420px; overflow-y: auto; overflow-x: hidden; width: 330px; min-width: 320px;">
            ${blockDropdownHtml}
          </ul>
        </div>
      </div>
    </div>
    <div class="border rounded overflow-hidden" id="kit-blocks-list-container">
      ${blocksListHtml}
    </div>
  `;

  // Bind dropdown menus
  bindUniversalDropdowns(container);

  // Batch modify interactions
  const batchTargetTypeSelect = container.querySelector("#batch-target-type");
  const batchFilterModeSelect = container.querySelector("#batch-filter-mode");
  const batchFilterQueryInput = container.querySelector("#batch-filter-query");
  const batchOpSelect = container.querySelector("#batch-op");
  const batchPropSelect = container.querySelector("#batch-prop");
  const batchValSelect = container.querySelector("#batch-val-select");
  const batchValText = container.querySelector("#batch-val-text");
  const batchValReplaceGroup = container.querySelector("#batch-val-replace-group");
  const batchValFind = container.querySelector("#batch-val-find");
  const batchValReplace = container.querySelector("#batch-val-replace");
  const batchValCase = container.querySelector("#batch-val-case");
  const batchToLabel = container.querySelector("#batch-to-label");
  const batchSummaryPreview = container.querySelector("#batch-summary-preview");
  const btnBatchApply = container.querySelector("#btn-batch-apply");
  const btnBatchCancel = container.querySelector("#btn-batch-cancel");

  const isInputType = (type) => {
    return ["file_input", "folder_picker", "output_filename", "select", "text", "textarea", "number", "slider", "checkbox", "radios"].includes(type);
  };

  const getMatchingBlocks = () => {
    const curKit = getActiveKit();
    if (!curKit) return [];
    const selectedType = batchTargetTypeSelect ? batchTargetTypeSelect.value : "any";
    const filterMode = batchFilterModeSelect ? batchFilterModeSelect.value : "all";
    const filterQuery = (batchFilterQueryInput?.value || "").trim();
    const queryLower = filterQuery.toLowerCase();
    const allBlocks = curKit.blocks || [];

    return allBlocks.filter((b, idx) => {
      // 1. Target scope filter
      if (selectedType === "inputs" && !isInputType(b.type)) return false;
      if (selectedType === "settings" && b.category !== "settings") return false;
      if (selectedType === "output" && b.category !== "output") return false;
      if (selectedType !== "any" && selectedType !== "inputs" && selectedType !== "settings" && selectedType !== "output" && b.type !== selectedType) return false;

      // 2. Complex Filter Condition
      if (filterMode === "name_contains") {
        if (queryLower) {
          const matchLabel = (b.label || "").toLowerCase().includes(queryLower);
          const matchId = (b.id || "").toLowerCase().includes(queryLower);
          if (!matchLabel && !matchId) return false;
        }
      } else if (filterMode === "name_regex") {
        if (filterQuery) {
          try {
            const re = new RegExp(filterQuery, "i");
            if (!re.test(b.label || "") && !re.test(b.id || "")) return false;
          } catch {
            return false;
          }
        }
      } else if (filterMode === "name_starts_with") {
        if (queryLower) {
          const matchLabel = (b.label || "").toLowerCase().startsWith(queryLower);
          const matchId = (b.id || "").toLowerCase().startsWith(queryLower);
          if (!matchLabel && !matchId) return false;
        }
      } else if (filterMode === "name_ends_with") {
        if (queryLower) {
          const matchLabel = (b.label || "").toLowerCase().endsWith(queryLower);
          const matchId = (b.id || "").toLowerCase().endsWith(queryLower);
          if (!matchLabel && !matchId) return false;
        }
      } else if (filterMode === "required_is") {
        if (!b.required) return false;
      } else if (filterMode === "not_required") {
        if (b.required) return false;
      } else if (filterMode === "has_desc") {
        if (!b.help && !b.placeholder) return false;
      } else if (filterMode === "no_desc") {
        if (b.help || b.placeholder) return false;
      } else if (filterMode === "has_placeholder") {
        if (!b.placeholder) return false;
      } else if (filterMode === "no_placeholder") {
        if (b.placeholder) return false;
      } else if (filterMode === "has_default") {
        if (b.default === undefined || b.default === null || b.default === "") return false;
      } else if (filterMode === "index_even") {
        if ((idx + 1) % 2 !== 0) return false;
      } else if (filterMode === "index_odd") {
        if ((idx + 1) % 2 === 0) return false;
      } else if (filterMode === "index_first_n") {
        const count = parseInt(filterQuery, 10) || 1;
        if (idx >= count) return false;
      } else if (filterMode === "index_last_n") {
        const count = parseInt(filterQuery, 10) || 1;
        if (idx < allBlocks.length - count) return false;
      } else if (filterMode === "custom_js") {
        if (filterQuery) {
          try {
            const fn = new Function("b", "idx", "blocks", `return Boolean(${filterQuery});`);
            if (!fn(b, idx, allBlocks)) return false;
          } catch {
            return false;
          }
        }
      }

      return true;
    });
  };

  const updateBatchUI = () => {
    if (!batchPropSelect || !batchOpSelect) return;
    const prop = batchPropSelect.value;
    const op = batchOpSelect.value;
    const filterMode = batchFilterModeSelect?.value || "all";

    // Dynamic Filter Query input placeholder & visibility
    if (["name_contains", "name_regex", "name_starts_with", "name_ends_with", "index_first_n", "index_last_n", "custom_js"].includes(filterMode)) {
      batchFilterQueryInput?.classList.remove("d-none");
      if (filterMode === "name_contains") batchFilterQueryInput.placeholder = "Contains text (e.g. video)...";
      else if (filterMode === "name_regex") batchFilterQueryInput.placeholder = "Regex (e.g. ^opt_.*)...";
      else if (filterMode === "name_starts_with") batchFilterQueryInput.placeholder = "Starts with prefix...";
      else if (filterMode === "name_ends_with") batchFilterQueryInput.placeholder = "Ends with suffix...";
      else if (filterMode === "index_first_n") batchFilterQueryInput.placeholder = "Count (e.g. 3)...";
      else if (filterMode === "index_last_n") batchFilterQueryInput.placeholder = "Count (e.g. 2)...";
      else if (filterMode === "custom_js") batchFilterQueryInput.placeholder = "JS code e.g. b.required || b.type === 'slider'...";
    } else {
      batchFilterQueryInput?.classList.add("d-none");
    }

    // Configure operator inputs
    batchValSelect?.classList.add("d-none");
    batchValText?.classList.add("d-none");
    batchValReplaceGroup?.classList.add("d-none");
    batchValCase?.classList.add("d-none");
    if (batchToLabel) batchToLabel.classList.remove("d-none");

    if (op === "clear" || op === "invert") {
      if (batchToLabel) batchToLabel.classList.add("d-none");
    } else if (op === "replace") {
      if (batchToLabel) batchToLabel.textContent = "in";
      batchValReplaceGroup?.classList.remove("d-none");
    } else if (op === "case_transform") {
      if (batchToLabel) batchToLabel.textContent = "to";
      batchValCase?.classList.remove("d-none");
    } else {
      if (batchToLabel) batchToLabel.textContent = op === "prepend" ? "with prefix" : (op === "append" ? "with suffix" : "to");
      if (prop === "required" && op === "set") {
        batchValSelect?.classList.remove("d-none");
      } else {
        batchValText?.classList.remove("d-none");
        if (op === "prepend") batchValText.placeholder = "Prefix string...";
        else if (op === "append") batchValText.placeholder = "Suffix string...";
        else batchValText.placeholder = "Value to apply...";
      }
    }

    if (batchSummaryPreview) {
      const typeLabel = batchTargetTypeSelect?.options[batchTargetTypeSelect.selectedIndex]?.text?.toLowerCase() || "blocks";
      const propLabel = batchPropSelect?.options[batchPropSelect.selectedIndex]?.text?.toLowerCase() || "property";
      
      let valSnippet = "";
      if (op === "clear") valSnippet = `Clear ${propLabel}`;
      else if (op === "invert") valSnippet = `Invert ${propLabel}`;
      else if (op === "replace") valSnippet = `Replace "${batchValFind?.value || ""}" with "${batchValReplace?.value || ""}" in ${propLabel}`;
      else if (op === "case_transform") valSnippet = `Convert ${propLabel} to ${batchValCase?.value || "uppercase"}`;
      else if (op === "prepend") valSnippet = `Prepend "${batchValText?.value || ""}" to ${propLabel}`;
      else if (op === "append") valSnippet = `Append "${batchValText?.value || ""}" to ${propLabel}`;
      else {
        const val = prop === "required" ? batchValSelect?.value : `"${batchValText?.value || ""}"`;
        valSnippet = `Set ${propLabel} = ${val}`;
      }

      batchSummaryPreview.textContent = `${valSnippet} for ${typeLabel}`;
    }
  };

  [batchTargetTypeSelect, batchFilterModeSelect, batchFilterQueryInput, batchOpSelect, batchPropSelect, batchValSelect, batchValText, batchValFind, batchValReplace, batchValCase].forEach((el) => {
    el?.addEventListener("change", updateBatchUI);
    el?.addEventListener("input", updateBatchUI);
  });

  updateBatchUI();

  btnBatchCancel?.addEventListener("click", () => {
    const dropdownToggle = container.querySelector("#btn-batch-modify-toggle");
    if (dropdownToggle && window.bootstrap?.Dropdown) {
      const dd = window.bootstrap.Dropdown.getInstance(dropdownToggle);
      if (dd) dd.hide();
    }
  });

  btnBatchApply?.addEventListener("click", () => {
    const curKit = getActiveKit();
    if (!curKit) return;
    const prop = batchPropSelect?.value || "required";
    const op = batchOpSelect?.value || "set";
    const targets = getMatchingBlocks();

    if (targets.length === 0) {
      showCustomKitAlert("No blocks matched the selected criteria.", "Batch Modify");
      return;
    }

    const toTitleCase = (str) => {
      return (str || "").replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    };

    targets.forEach((b) => {
      if (op === "clear") {
        if (prop === "required") b.required = false;
        else if (prop === "help") b.help = "";
        else if (prop === "placeholder") b.placeholder = "";
        else if (prop === "default") b.default = "";
        else if (prop === "label") b.label = b.id;
      } else if (op === "invert") {
        if (prop === "required") b.required = !b.required;
        else if (b.type === "checkbox" && prop === "default") b.default = !b.default;
      } else if (op === "replace") {
        const findStr = batchValFind?.value || "";
        const replaceStr = batchValReplace?.value || "";
        if (findStr) {
          let targetStr = String(b[prop] || "");
          if (findStr.startsWith("/") && findStr.lastIndexOf("/") > 0) {
            const lastSlash = findStr.lastIndexOf("/");
            const pattern = findStr.slice(1, lastSlash);
            const flags = findStr.slice(lastSlash + 1);
            try {
              const re = new RegExp(pattern, flags);
              targetStr = targetStr.replace(re, replaceStr);
            } catch {
              targetStr = targetStr.replaceAll(findStr, replaceStr);
            }
          } else {
            targetStr = targetStr.replaceAll(findStr, replaceStr);
          }
          b[prop] = targetStr;
        }
      } else if (op === "case_transform") {
        const caseMode = batchValCase?.value || "uppercase";
        const currentStr = String(b[prop] || "");
        if (caseMode === "uppercase") b[prop] = currentStr.toUpperCase();
        else if (caseMode === "lowercase") b[prop] = currentStr.toLowerCase();
        else if (caseMode === "titlecase") b[prop] = toTitleCase(currentStr);
      } else if (op === "prepend") {
        const prefix = batchValText?.value || "";
        if (prefix) b[prop] = `${prefix}${b[prop] || ""}`;
      } else if (op === "append") {
        const suffix = batchValText?.value || "";
        if (suffix) b[prop] = `${b[prop] || ""}${suffix}`;
      } else {
        // Set operation
        if (prop === "required") {
          b.required = batchValSelect?.value === "true";
        } else if (prop === "help") {
          b.help = batchValText?.value || "";
        } else if (prop === "placeholder") {
          b.placeholder = batchValText?.value || "";
        } else if (prop === "label") {
          b.label = batchValText?.value || b.id;
        } else if (prop === "default") {
          b.default = batchValText?.value || "";
        }
      }
    });

    saveUserKit(curKit);
    renderKitBuilderTab();
  });

  // Attach pointer drag reordering to each block row
  const listContainer = container.querySelector("#kit-blocks-list-container");
  if (listContainer) {
    listContainer.querySelectorAll(".kit-builder-row").forEach((itemEl, index) => {
      const handle = itemEl.querySelector(".kit-block-drag-handle");
      if (handle) {
        setupBlockItemDrag(itemEl, handle, index, listContainer);
      }
    });
  }

  // Bind block builder actions
  container.querySelectorAll(".btn-add-block-type").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const curKit = getActiveKit();
      if (!curKit) return;
      const type = btn.dataset.type;
      const newBlock = createBlockInstance(type);
      curKit.blocks.push(newBlock);
      const editing = new Set();
      editing.add(curKit.blocks.length - 1);
      setEditingBlockIndices(editing);
      saveUserKit(curKit);
      renderKitBuilderTab();
    });
  });

  // Toggle inline block editor with smooth curtain transition (single-open accordion)
  const toggleCurtain = (idx) => {
    const curEditing = getEditingBlockIndices();
    const isCurrentlyOpen = curEditing.has(idx);

    // Close any currently open blocks
    curEditing.forEach((openIdx) => {
      if (openIdx !== idx) {
        const otherCurtain = container.querySelector(`#curtain-block-${openIdx}`);
        const otherEditBtn = container.querySelector(`.btn-edit-block[data-idx="${openIdx}"]`);
        if (otherCurtain) otherCurtain.classList.remove("is-open");
        if (otherEditBtn) {
          otherEditBtn.classList.remove("active");
          otherEditBtn.innerHTML = '<i class="bi bi-pencil"></i>';
          otherEditBtn.title = "Edit block parameters";
        }
      }
    });
    curEditing.clear();

    const curtain = container.querySelector(`#curtain-block-${idx}`);
    const editBtn = container.querySelector(`.btn-edit-block[data-idx="${idx}"]`);
    if (!curtain) return;

    if (!isCurrentlyOpen) {
      curEditing.add(idx);
      curtain.classList.add("is-open");
      if (editBtn) {
        editBtn.classList.add("active");
        editBtn.innerHTML = '<i class="bi bi-chevron-up"></i>';
        editBtn.title = "Collapse parameters";
      }
    } else {
      curtain.classList.remove("is-open");
      if (editBtn) {
        editBtn.classList.remove("active");
        editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
        editBtn.title = "Edit block parameters";
      }
    }
  };

  // Single click header row to toggle curtain
  container.querySelectorAll(".kit-block-header-row").forEach((headerRow) => {
    headerRow.addEventListener("click", (e) => {
      if (e.target.closest("button, .btn, .kit-block-drag-handle, input, select, textarea")) return;
      const idx = parseInt(headerRow.dataset.idx, 10);
      toggleCurtain(idx);
    });
  });

  // Click edit button to toggle curtain
  container.querySelectorAll(".btn-edit-block").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      toggleCurtain(idx);
    });
  });

  // Done editing block button
  container.querySelectorAll(".btn-done-editing-block").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      if (getEditingBlockIndices().has(idx)) {
        toggleCurtain(idx);
      }
    });
  });

  // Handle block property field updates
  container.querySelectorAll(".block-edit-field").forEach((field) => {
    const updateField = () => {
      const curKit = getActiveKit();
      if (!curKit) return;
      const idx = parseInt(field.dataset.idx, 10);
      const key = field.dataset.field;
      if (!curKit.blocks[idx]) return;

      if (field.type === "checkbox") {
        curKit.blocks[idx][key] = field.checked;
      } else if (field.type === "number") {
        curKit.blocks[idx][key] = field.value === "" ? 0 : parseFloat(field.value);
      } else {
        curKit.blocks[idx][key] = field.value;
      }
      saveUserKit(curKit);
    };

    field.addEventListener("input", updateField);
    field.addEventListener("change", updateField);
  });

  // Add option to select / radios block
  container.querySelectorAll(".btn-add-block-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const curKit = getActiveKit();
      if (!curKit) return;
      const idx = parseInt(btn.dataset.idx, 10);
      if (!curKit.blocks[idx]) return;
      curKit.blocks[idx].options = curKit.blocks[idx].options || [];
      curKit.blocks[idx].options.push({
        value: `opt_${Date.now().toString().slice(-4)}`,
        label: "New Option",
      });
      saveUserKit(curKit);
      renderKitBuilderTab();
    });
  });

  // Remove option from select / radios block
  container.querySelectorAll(".btn-remove-block-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const curKit = getActiveKit();
      if (!curKit) return;
      const idx = parseInt(btn.dataset.idx, 10);
      const optIdx = parseInt(btn.dataset.optIdx, 10);
      if (!curKit.blocks[idx] || !curKit.blocks[idx].options) return;
      curKit.blocks[idx].options.splice(optIdx, 1);
      saveUserKit(curKit);
      renderKitBuilderTab();
    });
  });

  // Update option values & labels
  container.querySelectorAll(".block-opt-val, .block-opt-lbl").forEach((input) => {
    input.addEventListener("input", () => {
      const curKit = getActiveKit();
      if (!curKit) return;
      const idx = parseInt(input.dataset.idx, 10);
      const optIdx = parseInt(input.dataset.optIdx, 10);
      if (!curKit.blocks[idx] || !curKit.blocks[idx].options || !curKit.blocks[idx].options[optIdx]) return;

      if (input.classList.contains("block-opt-val")) {
        curKit.blocks[idx].options[optIdx].value = input.value;
      } else {
        curKit.blocks[idx].options[optIdx].label = input.value;
      }
      saveUserKit(curKit);
    });
  });

  container.querySelectorAll(".btn-move-block-up").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const curKit = getActiveKit();
      if (!curKit) return;
      const idx = parseInt(btn.dataset.idx, 10);
      if (idx > 0) {
        const temp = curKit.blocks[idx];
        curKit.blocks[idx] = curKit.blocks[idx - 1];
        curKit.blocks[idx - 1] = temp;
        const curEditing = getEditingBlockIndices();
        const newEditing = new Set();
        curEditing.forEach((openIdx) => {
          if (openIdx === idx) newEditing.add(idx - 1);
          else if (openIdx === idx - 1) newEditing.add(idx);
          else newEditing.add(openIdx);
        });
        setEditingBlockIndices(newEditing);
        saveUserKit(curKit);
        renderKitBuilderTab();
      }
    });
  });

  container.querySelectorAll(".btn-move-block-down").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const curKit = getActiveKit();
      if (!curKit) return;
      const idx = parseInt(btn.dataset.idx, 10);
      if (idx < curKit.blocks.length - 1) {
        const temp = curKit.blocks[idx];
        curKit.blocks[idx] = curKit.blocks[idx + 1];
        curKit.blocks[idx + 1] = temp;
        const curEditing = getEditingBlockIndices();
        const newEditing = new Set();
        curEditing.forEach((openIdx) => {
          if (openIdx === idx) newEditing.add(idx + 1);
          else if (openIdx === idx + 1) newEditing.add(idx);
          else newEditing.add(openIdx);
        });
        setEditingBlockIndices(newEditing);
        saveUserKit(curKit);
        renderKitBuilderTab();
      }
    });
  });

  container.querySelectorAll(".btn-delete-block").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const curKit = getActiveKit();
      if (!curKit) return;
      const idx = parseInt(btn.dataset.idx, 10);
      curKit.blocks.splice(idx, 1);
      const curEditing = getEditingBlockIndices();
      const newEditing = new Set();
      curEditing.forEach((openIdx) => {
        if (openIdx < idx) newEditing.add(openIdx);
        else if (openIdx > idx) newEditing.add(openIdx - 1);
      });
      setEditingBlockIndices(newEditing);
      saveUserKit(curKit);
      renderKitBuilderTab();
    });
  });
}
