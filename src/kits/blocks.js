// AnEdiKit - User Kits Modular Blocks Definition & Rendering Engine

export const BLOCK_CATEGORIES = {
  INPUT: "Inputs & Media",
  SETTINGS: "Parameters & Options",
  OUTPUT: "Output & Destination",
};

export const BLOCK_TYPES = {
  file_input: {
    type: "file_input",
    name: "File Input",
    icon: "film-outline",
    category: BLOCK_CATEGORIES.INPUT,
    description: "Source file picker",
    defaultConfig: () => ({
      label: "Source Media File",
      placeholder: "Select or drop a media file...",
      fileFilter: "all", // all, video, audio, image
      help: "",
      required: true,
    }),
  },
  folder_picker: {
    type: "folder_picker",
    name: "Folder Picker",
    icon: "folder-open-outline",
    category: BLOCK_CATEGORIES.OUTPUT,
    description: "Target folder selector",
    defaultConfig: () => ({
      label: "Output Destination Folder",
      placeholder: "Default output directory...",
      help: "",
      useAppDefault: true,
      required: false,
    }),
  },
  output_filename: {
    type: "output_filename",
    name: "Output Filename",
    icon: "create-outline",
    category: BLOCK_CATEGORIES.OUTPUT,
    description: "Output file name",
    defaultConfig: () => ({
      label: "Output Filename",
      placeholder: "e.g. output",
      suffix: "_processed",
      ext: "mp4",
      help: "Filename for the generated media file",
      required: false,
    }),
  },
  select: {
    type: "select",
    name: "Select",
    icon: "list-outline",
    category: BLOCK_CATEGORIES.SETTINGS,
    description: "Dropdown menu selection",
    defaultConfig: () => ({
      label: "Select Option",
      default: "default_opt",
      options: [
        { value: "opt1", label: "Option 1" },
        { value: "opt2", label: "Option 2" },
      ],
      help: "",
      required: false,
    }),
  },
  text: {
    type: "text",
    name: "Text Input",
    icon: "text-outline",
    category: BLOCK_CATEGORIES.SETTINGS,
    description: "Single-line text input",
    defaultConfig: () => ({
      label: "Text Parameter",
      placeholder: "Enter value or custom flags...",
      default: "",
      help: "",
      required: false,
    }),
  },
  textarea: {
    type: "textarea",
    name: "Text Area",
    icon: "document-text-outline",
    category: BLOCK_CATEGORIES.SETTINGS,
    description: "Multi-line text input",
    defaultConfig: () => ({
      label: "Multi-line Input",
      placeholder: "Enter multi-line text or filtergraph...",
      rows: 3,
      default: "",
      help: "",
      required: false,
    }),
  },
  number: {
    type: "number",
    name: "Number Input",
    icon: "calculator-outline",
    category: BLOCK_CATEGORIES.SETTINGS,
    description: "Integer or decimal number",
    defaultConfig: () => ({
      label: "Number Value",
      default: 23,
      min: 0,
      max: 100,
      step: 1,
      unit: "",
      help: "",
      required: false,
    }),
  },
  slider: {
    type: "slider",
    name: "Range Slider",
    icon: "options-outline",
    category: BLOCK_CATEGORIES.SETTINGS,
    description: "Numeric range slider",
    defaultConfig: () => ({
      label: "Slider Setting",
      default: 50,
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
      help: "",
      required: false,
    }),
  },
  checkbox: {
    type: "checkbox",
    name: "Toggle Switch",
    icon: "toggle-outline",
    category: BLOCK_CATEGORIES.SETTINGS,
    description: "Boolean toggle switch",
    defaultConfig: () => ({
      label: "Enable Option",
      default: false,
      help: "",
      required: false,
    }),
  },
  radios: {
    type: "radios",
    name: "Radio Choices",
    icon: "radio-button-on-outline",
    category: BLOCK_CATEGORIES.SETTINGS,
    description: "Single choice radio group",
    defaultConfig: () => ({
      label: "Choose Mode",
      default: "choice1",
      options: [
        { value: "choice1", label: "Choice A" },
        { value: "choice2", label: "Choice B" },
      ],
      help: "",
      required: false,
    }),
  },
  alert_box: {
    type: "alert_box",
    name: "Alert",
    icon: "information-circle-outline",
    category: BLOCK_CATEGORIES.SETTINGS,
    description: "Informative callout box",
    defaultConfig: () => ({
      variant: "info", // info, success, warning, primary, secondary
      title: "Note",
      content: "Explain what this kit or parameter does here.",
    }),
  },
};

// Create a new block with a unique ID and default configuration
export function createBlockInstance(type, customId = null) {
  const definition = BLOCK_TYPES[type];
  if (!definition) {
    throw new Error(`Unknown block type: ${type}`);
  }
  const id = customId || `${type}_${Math.random().toString(36).substring(2, 7)}`;
  return {
    id,
    type,
    ...definition.defaultConfig(),
  };
}

// Generate the HTML for a block in the Live Runner view
export function renderBlockHTML(block, currentValue, _kitId) {
  const val = currentValue !== undefined ? currentValue : (block.default !== undefined ? block.default : "");
  const labelHtml = block.label ? `<label class="form-label small fw-medium text-body" for="kit-block-${block.id}">${block.label}</label>` : "";
  const helpHtml = block.help ? `<div class="form-text small text-body-secondary mt-1">${block.help}</div>` : "";

  switch (block.type) {
    case "file_input": {
      const displayVal = val || "";
      return `
        <div class="kit-block-card mb-3" data-block-id="${block.id}" data-block-type="${block.type}">
          ${labelHtml}
          <div class="input-group">
            <button class="btn btn-outline-secondary btn-browse-block-file" type="button" data-block-id="${block.id}" data-filter="${block.fileFilter || "all"}" title="Browse media file">
              <ion-icon name="folder-open-outline"></ion-icon> Browse...
            </button>
            <input type="text" class="form-control small font-sans kit-block-input" id="kit-block-${block.id}" data-block-id="${block.id}" placeholder="${block.placeholder || "Select or drop a media file..."}" value="${escapeHtml(displayVal)}" readonly />
            <button class="btn btn-outline-secondary btn-clear-block-file" type="button" data-block-id="${block.id}" title="Clear selected file">
              <ion-icon name="close-outline"></ion-icon>
            </button>
          </div>
          <div class="kit-file-meta-info d-none mt-2 p-2 border rounded bg-body-tertiary small d-flex align-items-center justify-content-between flex-wrap gap-2" id="kit-file-meta-${block.id}">
            <span class="text-body-secondary text-truncate" id="kit-file-meta-desc-${block.id}"></span>
            <span class="badge text-bg-secondary font-monospace" id="kit-file-meta-badge-${block.id}"></span>
          </div>
          ${helpHtml}
        </div>
      `;
    }

    case "folder_picker": {
      const displayVal = val || "";
      return `
        <div class="kit-block-card mb-3" data-block-id="${block.id}" data-block-type="${block.type}">
          ${labelHtml}
          <div class="input-group">
            <button class="btn btn-outline-secondary btn-browse-block-folder" type="button" data-block-id="${block.id}" title="Browse output folder">
              <ion-icon name="folder-open-outline"></ion-icon> Choose Folder...
            </button>
            <input type="text" class="form-control small font-sans kit-block-input" id="kit-block-${block.id}" data-block-id="${block.id}" placeholder="${block.placeholder || "Select destination directory..."}" value="${escapeHtml(displayVal)}" readonly />
          </div>
          ${helpHtml}
        </div>
      `;
    }

    case "output_filename": {
      const displayVal = val || "";
      return `
        <div class="kit-block-card mb-3" data-block-id="${block.id}" data-block-type="${block.type}">
          ${labelHtml}
          <div class="input-group">
            <input type="text" class="form-control small font-sans kit-block-input" id="kit-block-${block.id}" data-block-id="${block.id}" placeholder="${block.placeholder || "output"}" value="${escapeHtml(displayVal)}" />
            ${block.ext ? `<span class="input-group-text small text-body-secondary font-monospace">.${block.ext}</span>` : ""}
          </div>
          ${helpHtml}
        </div>
      `;
    }

    case "select": {
      const options = block.options || [];
      const optsHtml = options
        .map(
          (opt) => `<option value="${escapeHtml(opt.value)}" ${String(opt.value) === String(val) ? "selected" : ""}>${escapeHtml(opt.label || opt.value)}</option>`
        )
        .join("");
      return `
        <div class="kit-block-card mb-3" data-block-id="${block.id}" data-block-type="${block.type}">
          ${labelHtml}
          <select class="form-select small kit-block-input" id="kit-block-${block.id}" data-block-id="${block.id}" style="cursor: pointer;">
            ${optsHtml}
          </select>
          ${helpHtml}
        </div>
      `;
    }

    case "text": {
      return `
        <div class="kit-block-card mb-3" data-block-id="${block.id}" data-block-type="${block.type}">
          ${labelHtml}
          <input type="text" class="form-control small font-sans kit-block-input" id="kit-block-${block.id}" data-block-id="${block.id}" placeholder="${escapeHtml(block.placeholder || "")}" value="${escapeHtml(String(val))}" />
          ${helpHtml}
        </div>
      `;
    }

    case "textarea": {
      return `
        <div class="kit-block-card mb-3" data-block-id="${block.id}" data-block-type="${block.type}">
          ${labelHtml}
          <textarea class="form-control small font-monospace kit-block-input" id="kit-block-${block.id}" data-block-id="${block.id}" rows="${block.rows || 3}" placeholder="${escapeHtml(block.placeholder || "")}">${escapeHtml(String(val))}</textarea>
          ${helpHtml}
        </div>
      `;
    }

    case "number": {
      return `
        <div class="kit-block-card mb-3" data-block-id="${block.id}" data-block-type="${block.type}">
          ${labelHtml}
          <div class="input-group">
            <input type="number" class="form-control small font-sans kit-block-input" id="kit-block-${block.id}" data-block-id="${block.id}" value="${val}" ${block.min !== undefined ? `min="${block.min}"` : ""} ${block.max !== undefined ? `max="${block.max}"` : ""} ${block.step !== undefined ? `step="${block.step}"` : ""} />
            ${block.unit ? `<span class="input-group-text small text-body-secondary">${escapeHtml(block.unit)}</span>` : ""}
          </div>
          ${helpHtml}
        </div>
      `;
    }

    case "slider": {
      return `
        <div class="kit-block-card mb-3" data-block-id="${block.id}" data-block-type="${block.type}">
          <div class="d-flex justify-content-between align-items-center mb-1">
            ${labelHtml}
            <span class="small font-monospace fw-medium text-body" id="kit-slider-val-${block.id}">${val}${block.unit || ""}</span>
          </div>
          <input type="range" class="form-range kit-block-input" id="kit-block-${block.id}" data-block-id="${block.id}" value="${val}" min="${block.min !== undefined ? block.min : 0}" max="${block.max !== undefined ? block.max : 100}" step="${block.step !== undefined ? block.step : 1}" />
          ${helpHtml}
        </div>
      `;
    }

    case "checkbox": {
      const isChecked = !!val;
      return `
        <div class="kit-block-card mb-3" data-block-id="${block.id}" data-block-type="${block.type}">
          <div class="form-check form-switch mb-0">
            <input class="form-check-input kit-block-input" type="checkbox" role="switch" id="kit-block-${block.id}" data-block-id="${block.id}" ${isChecked ? "checked" : ""} style="cursor: pointer;" />
            <label class="form-check-label small fw-medium text-body ms-1" for="kit-block-${block.id}" style="cursor: pointer;">${block.label || "Enable Option"}</label>
          </div>
          ${helpHtml}
        </div>
      `;
    }

    case "radios": {
      const options = block.options || [];
      const radiosHtml = options
        .map(
          (opt, i) => `
          <div class="form-check form-check-inline mb-0">
            <input class="form-check-input kit-block-radio" type="radio" name="radio-${block.id}" id="kit-radio-${block.id}-${i}" data-block-id="${block.id}" value="${escapeHtml(opt.value)}" ${String(opt.value) === String(val) ? "checked" : ""} style="cursor: pointer;" />
            <label class="form-check-label small text-body" for="kit-radio-${block.id}-${i}" style="cursor: pointer;">${escapeHtml(opt.label || opt.value)}</label>
          </div>
        `
        )
        .join("");
      return `
        <div class="kit-block-card mb-3" data-block-id="${block.id}" data-block-type="${block.type}">
          ${labelHtml}
          <div class="d-flex flex-wrap gap-3 mt-1">
            ${radiosHtml}
          </div>
          ${helpHtml}
        </div>
      `;
    }

    case "alert_box": {
      const variant = block.variant || "info";
      return `
        <div class="alert alert-${variant} d-flex align-items-start gap-2 py-2 px-3 mb-3 small" role="alert" data-block-id="${block.id}">
          <ion-icon name="information-circle-outline" class="flex-shrink-0 mt-1"></ion-icon>
          <div>
            ${block.title ? `<div class="fw-semibold">${escapeHtml(block.title)}</div>` : ""}
            <div>${escapeHtml(block.content || "")}</div>
          </div>
        </div>
      `;
    }

    default:
      return `
        <div class="alert alert-warning small d-flex justify-content-between align-items-center mb-3 py-2 px-3" role="alert" data-block-id="${block.id}">
          <div class="d-flex align-items-center gap-2 text-truncate me-2">
            <ion-icon name="warning-outline" class="flex-shrink-0 text-warning"></ion-icon>
            <span class="text-truncate">Unknown or deprecated block: <strong>${escapeHtml(block.type)}</strong> (ID: <code class="text-body">${escapeHtml(block.id)}</code>)</span>
          </div>
          <button class="btn btn-outline-danger btn-sm py-0 px-2 flex-shrink-0 btn-remove-unknown-block" type="button" data-block-id="${block.id}" title="Remove this unknown block">
            <ion-icon name="trash-outline" class="me-1"></ion-icon>Remove Block
          </button>
        </div>
      `;
  }
}

// Sanitize kit blocks to strip obsolete preview and log blocks
export function sanitizeKitBlocks(kit) {
  if (!kit || !Array.isArray(kit.blocks)) return;
  kit.blocks = kit.blocks.filter((b) => {
    return b && b.type !== "preview" && b.type !== "log_box" && b.type !== "divider";
  });
}

function escapeHtml(str) {
  if (typeof str !== "string") return String(str || "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
