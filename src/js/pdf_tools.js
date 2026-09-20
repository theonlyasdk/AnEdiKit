// PDF tool launcher and focused workspace views. The UI intentionally uses
// Bootstrap utilities/components only so it stays visually aligned with the
// rest of AnEdiKit without introducing a parallel style system.
import { setupListDragAndDrop } from "./drag_reorder.js";
import { rise } from "./cube_motion.js";
import { saveLastOutputDir } from "./storage.js";

const PDF_CATEGORIES = [
  {
    title: "Organize PDF",
    icon: "file-tray-stacked-outline",
    tools: [
      ["Merge PDF", "Combine multiple PDF files into one in any order.", "git-merge-outline"],
      ["Split PDF", "Separate page ranges or turn every page into its own PDF.", "cut-outline"],
      ["Remove Pages", "Delete unwanted pages from a PDF document.", "trash-outline"],
      ["Extract Pages", "Create a new PDF from selected pages.", "copy-outline"],
      ["Organize PDF", "Rearrange, sort, add, or delete pages visually.", "reorder-four-outline"],
      ["Scan to PDF", "Capture document scans and assemble them into a PDF.", "scan-outline"],
    ],
  },
  {
    title: "Optimize PDF",
    icon: "speedometer-outline",
    tools: [
      ["Compress PDF", "Reduce file size while balancing visual quality.", "archive-outline"],
      ["Repair PDF", "Recover data from damaged or corrupted documents.", "build-outline"],
      ["OCR PDF", "Make scanned text searchable and selectable.", "text-outline"],
    ],
  },
  {
    title: "Convert to PDF",
    icon: "arrow-down-circle-outline",
    tools: [
      ["JPG to PDF", "Convert JPG and JPEG images into custom PDF pages.", "image-outline"],
      ["Word to PDF", "Convert DOC and DOCX files to PDF.", "document-text-outline"],
      ["PowerPoint to PDF", "Convert PPT and PPTX presentations to PDF.", "easel-outline"],
      ["Excel to PDF", "Convert XLS and XLSX spreadsheets to PDF.", "grid-outline"],
      ["HTML to PDF", "Create a PDF document from a webpage URL.", "globe-outline"],
    ],
  },
  {
    title: "Convert from PDF",
    icon: "arrow-up-circle-outline",
    tools: [
      ["PDF to JPG", "Convert pages to images or extract embedded images.", "images-outline"],
      ["PDF to Word", "Convert PDFs into editable DOCX files.", "document-outline"],
      ["PDF to PowerPoint", "Convert PDF pages into editable presentation slides.", "easel-outline"],
      ["PDF to Excel", "Extract tabular data into Excel spreadsheets.", "grid-outline"],
      ["PDF to PDF/A", "Create an ISO-standard archival PDF/A document.", "archive-outline"],
      ["PDF to Markdown", "Convert PDFs into Markdown for notes and documentation.", "logo-markdown"],
    ],
  },
  {
    title: "Edit PDF",
    icon: "create-outline",
    tools: [
      ["Edit PDF", "Add text, images, shapes, and freehand annotations.", "pencil-outline"],
      ["Rotate PDF", "Rotate individual pages or an entire document.", "reload-outline"],
      ["Crop PDF", "Crop margins or trim rectangular areas of pages.", "crop-outline"],
      ["Page Numbers", "Add styled page numbers in the position you choose.", "list-outline"],
      ["Watermark", "Add customizable text or image watermarks.", "water-outline"],
      ["PDF Forms", "Create, fill, and manage interactive form fields.", "checkbox-outline"],
    ],
  },
  {
    title: "PDF Security",
    icon: "shield-checkmark-outline",
    tools: [
      ["Protect PDF", "Encrypt and lock PDF documents with a password.", "lock-closed-outline"],
      ["Unlock PDF", "Remove password protection and restrictions.", "lock-open-outline"],
      ["Sign PDF", "Fill and sign documents or prepare signature requests.", "create-outline"],
      ["Redact PDF", "Permanently remove sensitive content.", "eye-off-outline"],
      ["Compare PDF", "Compare two PDF versions side by side.", "git-compare-outline"],
    ],
  },
  {
    title: "PDF Intelligence",
    icon: "sparkles-outline",
    tools: [
      ["AI Summarizer", "Generate concise summaries and key bullet points.", "reader-outline"],
      ["Translate PDF", "Translate documents while preserving their layout.", "language-outline"],
    ],
  },
];

let workspace;
let selectedFiles = [];
let pdfQueueMode = false;
let pagePreviews = [];
let pageOrder = [];
let pageSelection = [];
let pdfErrorModal;

function showPdfErrorDialog(tool, payload, logs) {
  if (!pdfErrorModal) {
    pdfErrorModal = document.createElement("div");
    pdfErrorModal.className = "modal fade";
    pdfErrorModal.id = "pdf-error-modal";
    pdfErrorModal.tabIndex = -1;
    pdfErrorModal.innerHTML = `<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable"><div class="modal-content bg-body border border-danger-subtle shadow-lg"><div class="modal-header py-2 px-3"><h5 class="modal-title text-danger" id="pdf-error-title">PDF task failed</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body p-3"><p class="small mb-2" id="pdf-error-summary"></p><pre class="small bg-body-tertiary border rounded p-2 mb-0 text-break" id="pdf-error-details"></pre></div><div class="modal-footer py-2 px-3"><button type="button" class="btn btn-primary btn-sm d-none" id="pdf-install-btn"><ion-icon name="download-outline" class="me-1"></ion-icon>Install PDF support</button><button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Close</button></div></div></div>`;
    document.body.appendChild(pdfErrorModal);
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "btn btn-outline-secondary btn-sm";
    copyButton.id = "pdf-copy-error-btn";
    copyButton.innerHTML = `<ion-icon name="copy-outline" class="me-1"></ion-icon>Copy details`;
    pdfErrorModal.querySelector(".modal-footer")?.prepend(copyButton);
    const guideButton = document.createElement("button");
    guideButton.type = "button";
    guideButton.className = "btn btn-outline-warning btn-sm d-none";
    guideButton.id = "pdf-weasy-guide-btn";
    guideButton.innerHTML = `<ion-icon name="open-outline" class="me-1"></ion-icon>Windows GTK setup guide`;
    guideButton.onclick = () => window.open("https://doc.courtbouillon.org/weasyprint/latest/first_steps.html#missing-library", "_blank", "noopener");
    pdfErrorModal.querySelector(".modal-footer")?.prepend(guideButton);
  }
  pdfErrorModal.querySelector("#pdf-error-title").textContent = `${tool.name} failed`;
  pdfErrorModal.querySelector("#pdf-error-summary").textContent = payload?.message || "The PDF worker could not complete this operation.";
  pdfErrorModal.querySelector("#pdf-error-details").textContent = logs.length ? logs.join("\n") : "No worker output was returned. Check that the PDF dependencies are installed with requirements.txt.";
  const copyButton = pdfErrorModal.querySelector("#pdf-copy-error-btn");
  copyButton.onclick = async () => {
    const details = `${pdfErrorModal.querySelector("#pdf-error-summary")?.textContent || ""}\n\n${pdfErrorModal.querySelector("#pdf-error-details")?.textContent || ""}`.trim();
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(details);
      else { const area = document.createElement("textarea"); area.value = details; area.style.position = "fixed"; area.style.opacity = "0"; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove(); }
      copyButton.innerHTML = `<ion-icon name="checkmark-outline" class="me-1"></ion-icon>Copied`;
      setTimeout(() => { if (copyButton.isConnected) copyButton.innerHTML = `<ion-icon name="copy-outline" class="me-1"></ion-icon>Copy details`; }, 1400);
    } catch (error) { copyButton.title = `Copy failed: ${error}`; }
  };
  const installButton = pdfErrorModal.querySelector("#pdf-install-btn");
  const diagnostic = `${payload?.message || ""}\n${logs.join("\n")}`;
  const needsPdfInstall = diagnostic.includes("PDF support is not installed");
  const needsWeasyPrint = diagnostic.toLowerCase().includes("weasyprint");
  const needsWindowsGtk = diagnostic.includes("WEASYPRINT_WINDOWS_SETUP") || diagnostic.toLowerCase().includes("libgobject-2.0-0");
  const needsInstall = needsPdfInstall || needsWeasyPrint;
  const guideButton = pdfErrorModal.querySelector("#pdf-weasy-guide-btn");
  guideButton?.classList.toggle("d-none", !needsWindowsGtk);
  installButton.classList.toggle("d-none", !needsInstall);
  installButton.disabled = false;
  installButton.innerHTML = `<ion-icon name="download-outline" class="me-1"></ion-icon>${needsWindowsGtk ? "Install Python package" : (needsWeasyPrint ? "Install WeasyPrint" : "Install PDF support")}`;
  installButton.onclick = async () => {
    installButton.disabled = true;
    installButton.classList.add("btn-shimmer");
    installButton.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>${needsWindowsGtk ? "Installing Python package…" : (needsWeasyPrint ? "Installing WeasyPrint…" : "Installing PDF support…")}`;
    try {
      const result = await window.__TAURI__.core.invoke("install_pdf_dependencies");
      installButton.classList.remove("btn-shimmer");
      installButton.classList.add("d-none");
      pdfErrorModal.querySelector("#pdf-error-summary").textContent = result || "PDF support installed. Retry the operation.";
    } catch (error) {
      installButton.disabled = false;
      installButton.classList.remove("btn-shimmer");
      installButton.innerHTML = `<ion-icon name="refresh-outline" class="me-1"></ion-icon>Retry installation`;
      pdfErrorModal.querySelector("#pdf-error-summary").textContent = `Installation failed: ${error}`;
    }
  };
  if (window.bootstrap?.Modal) window.bootstrap.Modal.getOrCreateInstance(pdfErrorModal).show();
}

export function formatPdfFileSize(bytes) {
  if (bytes == null || isNaN(bytes)) return "—";
  const num = Number(bytes);
  if (num < 1024) return `${num} B`;
  if (num < 1048576) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / 1048576).toFixed(2)} MB`;
}

export function formatPdfDimensions(width, height) {
  if (!width || !height) return "—";
  const w = Math.round(width);
  const h = Math.round(height);
  const isClose = (a, b) => Math.abs(a - b) <= 4;
  let standard = "";
  if ((isClose(w, 595) && isClose(h, 842)) || (isClose(w, 842) && isClose(h, 595))) {
    standard = " (A4)";
  } else if ((isClose(w, 612) && isClose(h, 792)) || (isClose(w, 792) && isClose(h, 612))) {
    standard = " (Letter)";
  } else if ((isClose(w, 612) && isClose(h, 1008)) || (isClose(w, 1008) && isClose(h, 612))) {
    standard = " (Legal)";
  } else if ((isClose(w, 420) && isClose(h, 595)) || (isClose(w, 595) && isClose(h, 420))) {
    standard = " (A5)";
  }
  return `${w} × ${h} pt${standard}`;
}

async function updatePdfInfo(tool) {
  const body = workspace?.querySelector("#pdf-info-body");
  if (!body) return;
  const names = selectedFiles.map((path) => path.split(/[\\/]/).pop()).filter(Boolean);
  if (!names.length) {
    const url = workspace.querySelector("#pdf-source-url")?.value;
    if (url) {
      body.innerHTML = `
        <dl class="row small mb-0">
          <dt class="col-5 text-body-secondary">Source</dt>
          <dd class="col-7 text-truncate" title="${url}">Web URL</dd>
        </dl>`;
    } else {
      body.innerHTML = '<span class="small text-body-secondary">No document selected. Select a PDF to view metadata.</span>';
    }
    return;
  }

  const primaryName = names[0];
  body.innerHTML = `
    <dl class="row small mb-0">
      <dt class="col-5 text-body-secondary">Document</dt>
      <dd class="col-7 text-truncate" title="${names.join("; ")}">${primaryName}</dd>
      <dt class="col-5 text-body-secondary">File size</dt>
      <dd class="col-7" id="pdf-info-size">Reading…</dd>
      <dt class="col-5 text-body-secondary">Pages</dt>
      <dd class="col-7" id="pdf-info-pages">Reading…</dd>
      <dt class="col-5 text-body-secondary">Dimensions</dt>
      <dd class="col-7" id="pdf-info-dimensions">Reading…</dd>
      <dt class="col-5 text-body-secondary">Version</dt>
      <dd class="col-7" id="pdf-info-version">—</dd>
      <dt class="col-5 text-body-secondary">Security</dt>
      <dd class="col-7" id="pdf-info-security">—</dd>
    </dl>`;

  if (window.__TAURI__?.core?.invoke) {
    try {
      const info = await window.__TAURI__.core.invoke("get_pdf_info", { filePath: selectedFiles[0] });
      const rows = [];
      rows.push(["Document", primaryName, names.join("; ")]);
      if (names.length > 1) {
        rows.push(["Queued", `${names.length} files`]);
      }
      if (info.size_bytes != null) {
        rows.push(["File size", formatPdfFileSize(info.size_bytes)]);
      }
      if (info.pages != null) {
        rows.push(["Pages", `${info.pages} ${info.pages === 1 ? "page" : "pages"}`]);
      }
      if (info.width && info.height) {
        rows.push(["Dimensions", formatPdfDimensions(info.width, info.height)]);
      }
      if (info.version) {
        rows.push(["PDF version", `PDF ${info.version}`]);
      }
      rows.push(["Security", info.encrypted ? "Password protected" : "Unencrypted"]);
      if (info.title) {
        rows.push(["Title", info.title]);
      }
      if (info.author) {
        rows.push(["Author", info.author]);
      }
      if (info.subject) {
        rows.push(["Subject", info.subject]);
      }
      if (info.producer || info.creator) {
        rows.push(["Producer", info.producer || info.creator]);
      }

      body.innerHTML = `
        <dl class="row small mb-0">
          ${rows.map(([label, val, titleVal]) => `
            <dt class="col-5 text-body-secondary text-truncate" title="${label}">${label}</dt>
            <dd class="col-7 text-truncate mb-1" title="${titleVal || val}">${val}</dd>
          `).join("")}
        </dl>`;
    } catch (_) {
      const pages = workspace.querySelector("#pdf-info-pages");
      if (pages) pages.textContent = "Unavailable";
    }
  }
}

function setWorkspaceContent(html) {
  if (!workspace) return;
  workspace.classList.remove("show");
  workspace.innerHTML = html;
  requestAnimationFrame(() => {
    workspace?.classList.add("show");
    if (workspace) rise(workspace.querySelectorAll(".card, .pdf-page-picker, .btn"), { stagger: 35 });
  });
}

function allTools() {
  return PDF_CATEGORIES.flatMap((category) => category.tools.map(([name, description, icon]) => ({
    name, description, icon, category: category.title,
  })));
}

export const PDF_CATEGORY_IDS = {
  "Organize PDF": "pdf_organize",
  "Optimize PDF": "pdf_optimize",
  "Convert to PDF": "pdf_to",
  "Convert from PDF": "pdf_from",
  "Edit PDF": "pdf_edit",
  "PDF Security": "pdf_security",
  "PDF Intelligence": "pdf_intelligence",
};

export const PDF_ID_TO_CATEGORY = {
  pdf_organize: "Organize PDF",
  pdf_optimize: "Optimize PDF",
  pdf_to: "Convert to PDF",
  pdf_from: "Convert from PDF",
  pdf_edit: "Edit PDF",
  pdf_security: "PDF Security",
  pdf_intelligence: "PDF Intelligence",
};

export function getCategoryToolId(categoryTitle) {
  return PDF_CATEGORY_IDS[categoryTitle] || "pdf_organize";
}

export function getCategoryToolIdForPdfTool(toolName) {
  const category = PDF_CATEGORIES.find((cat) => cat.tools.some(([name]) => name === toolName));
  return category ? PDF_CATEGORY_IDS[category.title] : "pdf_organize";
}

let currentCategory = null;

export function renderCategory(categoryTitleOrId) {
  if (!workspace) {
    workspace = document.getElementById("pdf-tools-workspace");
  }
  if (!workspace) return;

  const category = PDF_CATEGORIES.find((cat) =>
    cat.title.toLowerCase() === (categoryTitleOrId || "").toLowerCase() ||
    getCategoryToolId(cat.title) === categoryTitleOrId
  ) || PDF_CATEGORIES[0];

  currentCategory = category;

  setWorkspaceContent(`
    <div class="mb-4">
      <div class="d-flex align-items-center gap-2 mb-1">
        <ion-icon name="${category.icon}" class="fs-4 text-primary"></ion-icon>
        <h3 class="h4 fw-normal mb-0">${category.title}</h3>
      </div>
      <p class="text-body-secondary mb-0">Choose a tool to work with your documents locally.</p>
    </div>
    <section class="mb-4">
      <div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">
        ${category.tools.map(([name, description, icon]) => `
          <div class="col">
            <button type="button" class="btn btn-outline-secondary w-100 h-100 text-start p-3 all-tool-card" data-pdf-tool="${name}">
              <div class="d-flex gap-3 align-items-start">
                <ion-icon name="${icon}" class="fs-4 text-primary flex-shrink-0"></ion-icon>
                <span>
                  <span class="d-block fw-semibold text-body mb-1">${name}</span>
                  <span class="d-block small text-body-secondary text-wrap">${description}</span>
                </span>
              </div>
            </button>
          </div>`).join("")}
      </div>
    </section>`);

  workspace.querySelectorAll("[data-pdf-tool]").forEach((button) => {
    button.addEventListener("click", () => renderTool(button.dataset.pdfTool));
  });
}

function renderHome() {
  if (!workspace) return;
  setWorkspaceContent(`
    <div class="mb-4">
      <div>
        <h3 class="h4 fw-normal mb-1">PDF workspace</h3>
        <p class="text-body-secondary mb-0">Choose a tool to work with your documents locally.</p>
      </div>
    </div>
    ${PDF_CATEGORIES.map((category) => `
      <section class="mb-4">
        <div class="d-flex align-items-center gap-2 mb-3">
          <ion-icon name="${category.icon}" class="fs-5 text-primary"></ion-icon>
          <h4 class="h6 mb-0">${category.title}</h4>
        </div>
        <div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">
          ${category.tools.map(([name, description, icon]) => `
            <div class="col">
              <button type="button" class="btn btn-outline-secondary w-100 h-100 text-start p-3 all-tool-card" data-pdf-tool="${name}">
                <div class="d-flex gap-3 align-items-start">
                  <ion-icon name="${icon}" class="fs-4 text-primary flex-shrink-0"></ion-icon>
                  <span>
                    <span class="d-block fw-semibold text-body mb-1">${name}</span>
                    <span class="d-block small text-body-secondary text-wrap">${description}</span>
                  </span>
                </div>
              </button>
            </div>`).join("")}
        </div>
      </section>`).join("")}`);

  workspace.querySelectorAll("[data-pdf-tool]").forEach((button) => {
    button.addEventListener("click", () => renderTool(button.dataset.pdfTool));
  });
}

export function renderTool(toolName) {
  if (!workspace) {
    workspace = document.getElementById("pdf-tools-workspace");
  }
  const tool = allTools().find((item) => item.name === toolName);
  if (!workspace || !tool) return;

  const isUrlTool = tool.name === "HTML to PDF";
  const acceptsMany = ["Merge PDF", "JPG to PDF", "Scan to PDF", "Compare PDF"].includes(tool.name);
  pdfQueueMode = acceptsMany || tool.name === "Organize PDF";
  const isAiTool = ["AI Summarizer", "Translate PDF"].includes(tool.name);
  const needsPages = ["Split PDF", "Remove Pages", "Extract Pages", "Organize PDF", "Rotate PDF", "Crop PDF", "Redact PDF"].includes(tool.name);
  const isScanTool = tool.name === "Scan to PDF";
  const isImageGridTool = ["JPG to PDF", "Scan to PDF"].includes(tool.name);
  const needsPassword = ["Protect PDF", "Unlock PDF"].includes(tool.name);
  const needsWatermark = tool.name === "Watermark";
  const isFormsTool = tool.name === "PDF Forms";
  const accept = ["JPG to PDF", "Scan to PDF"].includes(tool.name) ? "image/*" : ".pdf,application/pdf";
  const optionsMarkup = {
    "Compress PDF": `<div class="row g-3 mt-2"><div class="col-md-6"><label class="form-label fw-medium" for="pdf-compression-level">Compression level</label><select class="form-select" id="pdf-compression-level"><option value="balanced">Balanced</option><option value="maximum">Maximum reduction</option><option value="quality">Prioritize quality</option></select></div><div class="col-md-6"><label class="form-label fw-medium" for="pdf-image-dpi">Image resolution</label><select class="form-select" id="pdf-image-dpi"><option value="150">150 DPI</option><option value="96">96 DPI</option><option value="300">300 DPI</option></select></div></div>`,
    "Repair PDF": `<div class="form-check form-switch mt-4"><input class="form-check-input" type="checkbox" id="pdf-rebuild-xref" checked /><label class="form-check-label" for="pdf-rebuild-xref">Rebuild damaged cross-reference tables</label></div>`,
    "OCR PDF": `<div class="row g-3 mt-2"><div class="col-md-6"><label class="form-label fw-medium" for="pdf-ocr-language">OCR language</label><input class="form-control" id="pdf-ocr-language" value="eng" placeholder="eng, spa, fra" /></div><div class="col-md-6"><label class="form-label fw-medium" for="pdf-ocr-dpi">Scan quality</label><select class="form-select" id="pdf-ocr-dpi"><option value="150">150 DPI</option><option value="300" selected>300 DPI</option><option value="600">600 DPI</option></select></div></div>`,
    "Split PDF": `<div class="mt-4"><label class="form-label fw-medium" for="pdf-split-mode">Split output</label><select class="form-select" id="pdf-split-mode"><option value="individual">One PDF per selected page</option><option value="combined">One PDF containing selected pages</option></select></div>`,
    "Rotate PDF": `<div class="mt-4"><label class="form-label fw-medium" for="pdf-rotate-degrees">Rotation</label><select class="form-select" id="pdf-rotate-degrees"><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">270° clockwise</option></select></div>`,
    "Crop PDF": `<div class="mt-4"><label class="form-label fw-medium" for="pdf-crop-margin">Crop margin (points)</label><input class="form-control" id="pdf-crop-margin" type="number" min="0" max="200" value="18" /></div>`,
    "PDF to JPG": `<div class="row g-3 mt-2"><div class="col-md-6"><label class="form-label fw-medium" for="pdf-render-dpi">Render quality</label><select class="form-select" id="pdf-render-dpi"><option value="96">96 DPI</option><option value="150" selected>150 DPI</option><option value="300">300 DPI</option></select></div><div class="col-md-6"><label class="form-label fw-medium" for="pdf-image-format">Image format</label><select class="form-select" id="pdf-image-format"><option value="jpg">JPG</option><option value="png">PNG</option></select></div></div>`,
    "JPG to PDF": `<div class="row g-3 mt-2"><div class="col-md-6"><label class="form-label fw-medium" for="pdf-page-orientation">Page orientation</label><select class="form-select" id="pdf-page-orientation"><option value="auto">Auto</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></div><div class="col-md-6"><label class="form-label fw-medium" for="pdf-page-margin">Page margin (points)</label><input class="form-control" id="pdf-page-margin" type="number" min="0" max="200" value="18" /></div></div>`,
    "Page Numbers": `<div class="row g-3 mt-2"><div class="col-md-6"><label class="form-label fw-medium" for="pdf-number-position">Position</label><select class="form-select" id="pdf-number-position"><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option><option value="top-center">Top center</option></select></div><div class="col-md-6"><label class="form-label fw-medium" for="pdf-number-start">Start number</label><input class="form-control" id="pdf-number-start" type="number" value="1" min="1" /></div></div>`,
    "Watermark": `<div class="row g-3 mt-2"><div class="col-md-6"><label class="form-label fw-medium" for="pdf-watermark-opacity">Opacity</label><select class="form-select" id="pdf-watermark-opacity"><option value="25">25%</option><option value="50" selected>50%</option><option value="75">75%</option></select></div><div class="col-md-6"><label class="form-label fw-medium" for="pdf-watermark-angle">Angle</label><select class="form-select" id="pdf-watermark-angle"><option value="0">Horizontal</option><option value="45" selected>45° diagonal</option><option value="90">Vertical</option></select></div></div>`,
    "Sign PDF": `<div class="row g-3 mt-4"><div class="col-md-6"><label class="form-label fw-medium" for="pdf-signature-text">Signature text</label><input class="form-control" id="pdf-signature-text" value="Approved" /></div><div class="col-md-6"><label class="form-label fw-medium" for="pdf-signer-name">Signer name</label><input class="form-control" id="pdf-signer-name" placeholder="Your name" /></div><div class="col-md-6"><label class="form-label fw-medium" for="pdf-sign-date">Date</label><input class="form-control" id="pdf-sign-date" type="date" /></div><div class="col-md-6"><label class="form-label fw-medium" for="pdf-sign-position">Position</label><select class="form-select" id="pdf-sign-position"><option value="bottom-right">Bottom right</option><option value="bottom-center">Bottom center</option><option value="top-right">Top right</option><option value="center">Center</option></select></div></div>`,
  }[tool.name] || "";
  selectedFiles = [];
  pagePreviews = [];
  pageOrder = [];
  pageSelection = [];

  const category = PDF_CATEGORIES.find((cat) => cat.tools.some(([name]) => name === tool.name)) || currentCategory;
  if (category) currentCategory = category;

  setWorkspaceContent(`
    <div class="d-flex align-items-center gap-3 mb-4">
      <button type="button" class="btn btn-outline-secondary btn-sm" id="pdf-back-to-tools">
        <ion-icon name="arrow-back-outline" class="me-1"></ion-icon> ${category ? category.title : "All PDF Tools"}
      </button>
      <div class="vr"></div>
      <div class="min-w-0">
        <div class="small text-body-secondary">${tool.category}</div>
        <h3 class="h4 fw-normal mb-0">${tool.name}</h3>
      </div>
    </div>
    <div class="row g-4">
      <div class="col-12 col-xl-8">
        <div class="card border shadow-sm">
          <div class="card-body p-4">
            <div class="d-flex gap-3 align-items-start mb-4">
              <ion-icon name="${tool.icon}" class="fs-2 text-primary"></ion-icon>
              <div><h4 class="h5 mb-1">${tool.name}</h4><p class="text-body-secondary mb-0">${tool.description}</p></div>
            </div>
            ${isUrlTool ? `
              <label class="form-label fw-medium" for="pdf-source-url">Webpage URL</label>
              <div class="input-group mb-3"><span class="input-group-text"><ion-icon name="link-outline"></ion-icon></span><input id="pdf-source-url" class="form-control" type="url" placeholder="https://example.com" /></div>` : pdfQueueMode ? `
              <label class="form-label fw-medium">${tool.name === "Organize PDF" ? "Page / document queue" : "Source files"}</label>
              ${isImageGridTool ? "" : `<div class="border rounded bg-body-tertiary p-2" id="pdf-queue-list"></div>`}
              <div class="d-flex align-items-center gap-2 mt-2"><button class="btn btn-outline-secondary btn-sm" id="btn-pdf-select" type="button"><ion-icon name="folder-open-outline" class="me-1"></ion-icon>Add files</button><span class="small text-body-secondary">Drag the handle to change order.</span></div>` : `
              <label class="form-label fw-medium">Source ${acceptsMany ? "files" : "file"}</label>
              <div class="input-group mb-2"><button class="btn btn-outline-secondary" id="btn-pdf-select" type="button"><ion-icon name="folder-open-outline" class="me-1"></ion-icon>${acceptsMany ? "Select files" : "Select file"}</button><input id="pdf-source-files" class="form-control" type="text" placeholder="No ${acceptsMany ? "files" : "file"} selected" readonly /></div>
              <div class="form-text">${tool.name === "Compare PDF" ? "Choose the original and revised PDF." : "Your selected documents remain on this device."}</div>`}
            ${needsPages || isImageGridTool ? (tool.name === "Redact PDF" ? `<div class="mt-4"><label class="form-label fw-medium" for="pdf-pages">Text to redact</label><input class="form-control" id="pdf-pages" placeholder="Separate terms with commas" /></div>` : `<div class="mt-4" id="pdf-page-picker"><div class="d-flex justify-content-between align-items-center mb-2"><label class="form-label fw-medium mb-0">${isImageGridTool ? "Page thumbnails" : "Select pages"}</label><div class="btn-group btn-group-sm"><button class="btn btn-outline-secondary" type="button" id="btn-pdf-select-all">All</button><button class="btn btn-outline-secondary" type="button" id="btn-pdf-select-odd">Odd</button><button class="btn btn-outline-secondary" type="button" id="btn-pdf-select-even">Even</button><button class="btn btn-outline-secondary" type="button" id="btn-pdf-clear-pages">Clear</button></div></div><div class="row row-cols-2 row-cols-md-4 row-cols-xl-6 g-2" id="pdf-page-grid"></div><div class="input-group input-group-sm mt-2"><input class="form-control" id="pdf-pages" placeholder="Selected page numbers will appear here" readonly /><span class="input-group-text" id="pdf-page-selection-count">0 selected</span></div></div>`) : ""}
            ${needsPassword ? `<div class="mt-4"><label class="form-label fw-medium" for="pdf-password">${tool.name === "Protect PDF" ? "New password" : "Current password"}</label><input class="form-control" id="pdf-password" type="password" autocomplete="new-password" /></div>` : ""}
            ${needsWatermark ? `<div class="mt-4"><label class="form-label fw-medium" for="pdf-watermark">Watermark text</label><input class="form-control" id="pdf-watermark" value="CONFIDENTIAL" /></div>` : ""}
            ${isFormsTool ? `<div class="mt-4"><label class="form-label fw-medium" for="pdf-form-values">Fill existing fields</label><input class="form-control" id="pdf-form-values" placeholder="Name=Jane Doe, Date=2026-09-19" /><div class="form-text">Leave blank to preserve the document's interactive fields.</div></div>` : ""}
            ${optionsMarkup}
            ${isAiTool ? `
              <div class="mt-4"><label class="form-label fw-medium" for="pdf-ai-language">${tool.name === "Translate PDF" ? "Target language" : "Summary detail"}</label>
              <select class="form-select" id="pdf-ai-language"><option>${tool.name === "Translate PDF" ? "English" : "Concise executive summary"}</option><option>${tool.name === "Translate PDF" ? "Spanish" : "Detailed summary"}</option><option>${tool.name === "Translate PDF" ? "French" : "Key bullet points"}</option></select></div>` : ""}
            <div class="mt-4"><label class="form-label fw-medium" for="pdf-output-path">Output file or folder <span class="text-body-secondary fw-normal">(optional)</span></label><input class="form-control" id="pdf-output-path" placeholder="Defaults beside the first source file" /></div>
            <div class="d-flex align-items-center gap-2 mt-4 flex-wrap"><button class="btn btn-primary" id="btn-pdf-run" type="button"><ion-icon name="play-outline" class="me-1"></ion-icon>Run ${tool.name}</button><div class="btn-group d-none" id="pdf-open-output-actions"><button class="btn btn-outline-secondary" id="pdf-open-output" type="button"><ion-icon name="folder-open-outline" class="me-1"></ion-icon>Open…</button><button class="btn btn-outline-secondary dropdown-toggle dropdown-toggle-split" type="button" data-bs-toggle="dropdown" aria-expanded="false"><span class="visually-hidden">Open options</span></button><ul class="dropdown-menu"><li><button class="dropdown-item" type="button" data-pdf-open-mode="file">Open output file</button></li><li><button class="dropdown-item" type="button" data-pdf-open-mode="folder">Open output folder</button></li></ul></div><span class="small text-body-secondary" id="pdf-run-status" role="status"></span></div>
          </div>
        </div>
      </div>
      <div class="col-12 col-xl-4">
        <div class="card border bg-body shadow-sm h-100">
          <div class="card-body p-4">
            <h4 class="h6">PDF information</h4>
            <p class="small text-body-secondary">Current document and output details.</p>
            <div id="pdf-info-body"><span class="small text-body-secondary">No source selected.</span></div>
          </div>
        </div>
      </div>
    </div>`);

  workspace.querySelector("#pdf-back-to-tools")?.addEventListener("click", () => {
    if (currentCategory) {
      renderCategory(currentCategory.title);
    } else {
      renderHome();
    }
  });
  renderPdfQueue(tool);
  updatePdfInfo(tool);
  workspace.querySelector("#btn-pdf-select-all")?.addEventListener("click", () => { pageSelection = [...pageOrder]; renderPageGrid(tool); });
  workspace.querySelector("#btn-pdf-select-odd")?.addEventListener("click", () => { pageSelection = pageOrder.filter((index) => (index + 1) % 2 === 1); renderPageGrid(tool); });
  workspace.querySelector("#btn-pdf-select-even")?.addEventListener("click", () => { pageSelection = pageOrder.filter((index) => (index + 1) % 2 === 0); renderPageGrid(tool); });
  workspace.querySelector("#btn-pdf-clear-pages")?.addEventListener("click", () => { pageSelection = []; renderPageGrid(tool); });
  workspace.querySelector("#btn-pdf-select")?.addEventListener("click", () => selectPdfFiles(tool, acceptsMany));
  workspace.querySelector("#btn-pdf-run")?.addEventListener("click", () => runPdfTool(tool));
  workspace.querySelectorAll("[data-pdf-open-mode]").forEach((option) => option.addEventListener("click", () => openPdfOutput(option.dataset.pdfOpenMode)));
}

let lastPdfOutputPath = "";

async function openPdfOutput(mode = "file") {
  if (!lastPdfOutputPath || !window.__TAURI__?.core?.invoke) return;
  try {
    if (mode === "folder") await window.__TAURI__.core.invoke("show_in_folder", { filePath: lastPdfOutputPath });
    else await window.__TAURI__.core.invoke("open_file", { filePath: lastPdfOutputPath });
  } catch (error) {
    try {
      if (mode === "folder") await window.__TAURI__.core.invoke("open_file", { filePath: lastPdfOutputPath });
      else await window.__TAURI__.core.invoke("show_in_folder", { filePath: lastPdfOutputPath });
    } catch (fallbackError) {
      const status = workspace?.querySelector("#pdf-run-status");
      if (status) status.textContent = `Could not open output: ${fallbackError}`;
    }
  }
}

function showPdfOutputActions(logs) {
  const resultLine = [...logs].reverse().find((line) => line.includes("ANEDIKIT_RESULT:"));
  if (!resultLine) return;
  try {
    const marker = resultLine.indexOf("ANEDIKIT_RESULT:");
    lastPdfOutputPath = JSON.parse(resultLine.slice(marker + "ANEDIKIT_RESULT:".length)).output_path || "";
  } catch (_) { lastPdfOutputPath = ""; }
  const actions = workspace?.querySelector("#pdf-open-output-actions");
  if (!actions || !lastPdfOutputPath) return;
  actions.classList.remove("d-none");
  const defaultIsFile = /\.[a-z0-9]{2,5}$/i.test(lastPdfOutputPath);
  actions.querySelector("#pdf-open-output").onclick = () => openPdfOutput(defaultIsFile ? "file" : "folder");
}

function renderPdfQueue(tool) {
  const list = workspace?.querySelector("#pdf-queue-list");
  if (!list) return;
  if (!selectedFiles.length) {
    list.innerHTML = `<div class="text-center text-body-secondary small py-3"><ion-icon name="cloud-upload-outline" class="fs-4 d-block mx-auto mb-1"></ion-icon>Drop files here or use Add files</div>`;
    updatePdfInfo(tool);
    return;
  }
  list.innerHTML = selectedFiles.map((path, index) => {
    const name = path.split(/[\\/]/).pop() || path;
    return `<div class="list-group-item d-flex align-items-center gap-2 py-2 px-2" draggable="true" data-pdf-queue-item="${index}"><button type="button" class="btn btn-link text-body-secondary p-1 pdf-queue-drag-handle" title="Drag to reorder"><ion-icon name="reorder-three-outline"></ion-icon></button><span class="badge text-bg-secondary">${index + 1}</span><span class="text-truncate flex-grow-1 small">${name}</span><button type="button" class="btn btn-outline-secondary btn-sm py-0 px-2" data-pdf-queue-preview="${index}" title="Preview"><ion-icon name="eye-outline"></ion-icon></button><button type="button" class="btn btn-outline-danger btn-sm py-0 px-2" data-pdf-queue-remove="${index}" title="Remove"><ion-icon name="close-outline"></ion-icon></button></div>`;
  }).join("");
  list.querySelectorAll("[data-pdf-queue-remove]").forEach((button) => button.addEventListener("click", () => {
    selectedFiles.splice(Number(button.dataset.pdfQueueRemove), 1); renderPdfQueue(tool);
  }));
  list.querySelectorAll("[data-pdf-queue-preview]").forEach((button) => button.addEventListener("click", () => previewQueuedFile(selectedFiles[Number(button.dataset.pdfQueuePreview)])));
  list.querySelectorAll("[data-pdf-queue-item]").forEach((item) => {
    setupListDragAndDrop({
      itemEl: item,
      dragHandle: item.querySelector(".pdf-queue-drag-handle"),
      index: Number(item.dataset.pdfQueueItem),
      listContainer: list,
      itemSelector: "[data-pdf-queue-item]",
      onReorder: (from, to) => { const [entry] = selectedFiles.splice(from, 1); selectedFiles.splice(to, 0, entry); renderPdfQueue(tool); },
    });
  });
  updatePdfInfo(tool);
}

async function previewQueuedFile(path) {
  if (!path || !window.__TAURI__?.core?.invoke) return;
  try {
    pagePreviews = await window.__TAURI__.core.invoke("render_pdf_pages", { filePath: path });
    showPdfPagePreview(0);
  } catch (error) {
    showPdfErrorDialog({ name: "Queue preview" }, { message: String(error) }, [String(error)]);
  }
}

async function selectPdfFiles(tool, acceptsMany) {
  const input = workspace?.querySelector("#pdf-source-files");
  if (!input && !pdfQueueMode) return;
  const filterMode = ["JPG to PDF", "Scan to PDF"].includes(tool.name) ? "image" : "pdf";
  try {
    if (window.__TAURI__?.core?.invoke) {
      const picked = acceptsMany || pdfQueueMode
        ? await window.__TAURI__.core.invoke("pick_files", { filterMode })
        : [await window.__TAURI__.core.invoke("pick_file", { filterMode })].filter(Boolean);
      selectedFiles = pdfQueueMode ? [...selectedFiles, ...picked.filter((path) => !selectedFiles.includes(path))] : picked;
    } else {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.multiple = acceptsMany || pdfQueueMode;
      picker.accept = ["JPG to PDF", "Scan to PDF"].includes(tool.name) ? "image/*" : "application/pdf";
      picker.onchange = () => {
        const picked = Array.from(picker.files || []).map((file) => file.name);
        selectedFiles = pdfQueueMode ? [...selectedFiles, ...picked] : picked;
        if (pdfQueueMode) renderPdfQueue(tool); else input.value = selectedFiles.join("; ");
        updatePdfInfo(tool);
      };
      picker.click();
      return;
    }
    if (pdfQueueMode) renderPdfQueue(tool); else input.value = selectedFiles.join("; ");
    if (selectedFiles && selectedFiles.length > 0) {
      const outInput = workspace?.querySelector("#pdf-output-path");
      if (outInput && (!outInput.value || !outInput.dataset.custom)) {
        const firstFile = selectedFiles[0];
        const lastSlash = Math.max(firstFile.lastIndexOf("\\"), firstFile.lastIndexOf("/"));
        if (lastSlash > 0) {
          const dir = firstFile.substring(0, lastSlash);
          outInput.value = dir;
          saveLastOutputDir(dir);
        }
      }
    }
    updatePdfInfo(tool);
    if (tool.name !== "Redact PDF" && ["Split PDF", "Remove Pages", "Extract Pages", "Organize PDF", "Rotate PDF", "Crop PDF", "JPG to PDF", "Scan to PDF"].includes(tool.name)) await loadPdfPageGrid(tool);
  } catch (error) {
    input.value = "";
  }
}

async function loadPdfPageGrid(tool) {
  const grid = workspace?.querySelector("#pdf-page-grid");
  if (!grid || !selectedFiles[0]) return;
  const count = workspace.querySelector("#pdf-page-selection-count");
  if (count) count.textContent = "Rendering page previews…";
  try {
    pagePreviews = window.__TAURI__?.core?.invoke
      ? await window.__TAURI__.core.invoke("render_pdf_pages", { filePath: selectedFiles[0] })
      : [];
    pageOrder = pagePreviews.map((_, index) => index);
    pageSelection = ["Organize PDF", "JPG to PDF", "Scan to PDF"].includes(tool.name) ? [...pageOrder] : [];
    renderPageGrid(tool);
  } catch (error) {
    if (count) count.textContent = `Could not render previews: ${error}`;
    showPdfErrorDialog(tool, { message: String(error) }, [String(error)]);
  }
}

function renderPageGrid(tool) {
  const grid = workspace?.querySelector("#pdf-page-grid");
  if (!grid) return;
  const selected = new Set(pageSelection);
  grid.innerHTML = pageOrder.map((pageIndex, orderIndex) => `<div class="col" data-pdf-page-item="${orderIndex}" draggable="true"><div class="card h-100 position-relative ${selected.has(pageIndex) ? "border-primary bg-primary-subtle" : "border-secondary"}"><button type="button" class="btn btn-link text-body-secondary p-1 pdf-page-drag-handle" title="Drag to reorder"><ion-icon name="reorder-three-outline"></ion-icon></button><button type="button" class="btn text-start p-1" data-pdf-page-select="${pageIndex}"><img src="${pagePreviews[pageIndex]}" class="img-fluid rounded border mb-1" alt="${pageIndex + 1}" /><span class="d-flex justify-content-between align-items-center small"><span>${pageIndex + 1}</span>${selected.has(pageIndex) ? "<ion-icon name=\"checkmark-circle-fill\" class=\"text-primary\"></ion-icon>" : ""}</span></button><button type="button" class="btn btn-sm btn-dark position-absolute bottom-0 end-0 m-1" data-pdf-page-enlarge="${pageIndex}" title="View page larger"><ion-icon name="expand-outline"></ion-icon><span class="visually-hidden">Enlarge page ${pageIndex + 1}</span></button></div></div>`).join("");
  grid.querySelectorAll("[data-pdf-page-select]").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.pdfPageSelect);
    pageSelection = selected.has(index) ? pageSelection.filter((value) => value !== index) : [...pageSelection, index];
    renderPageGrid(tool);
  }));
  let draggedOrderIndex = -1;
  let dropIndicator = null;
  let ghost = null;
  const clearDrag = () => { ghost?.remove(); ghost = null; dropIndicator?.remove(); dropIndicator = null; draggedOrderIndex = -1; grid.querySelectorAll("[data-pdf-page-item]").forEach((el) => el.classList.remove("opacity-50")); };
  const showDropTarget = (item) => {
    dropIndicator?.remove();
    dropIndicator = document.createElement("div");
    dropIndicator.className = "position-absolute top-0 start-0 w-100 h-100 border border-2 border-primary rounded pe-none";
    dropIndicator.innerHTML = `<svg class="position-absolute top-0 start-0 w-100 h-100 pe-none" aria-hidden="true"><rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" fill="none" stroke="var(--bs-primary)" stroke-width="2" stroke-dasharray="8 6" class="pdf-page-ants"></rect></svg>`;
    item.querySelector(".card")?.appendChild(dropIndicator);
  };
  grid.querySelectorAll("[data-pdf-page-item]").forEach((item) => {
    item.draggable = false;
    item.querySelector(".pdf-page-drag-handle")?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      draggedOrderIndex = Number(item.dataset.pdfPageItem);
      const rect = item.getBoundingClientRect();
      ghost = item.cloneNode(true); ghost.classList.add("position-fixed", "shadow-lg", "opacity-75", "pe-none");
      ghost.style.left = `${rect.left}px`; ghost.style.top = `${rect.top}px`; ghost.style.width = `${rect.width}px`; ghost.style.zIndex = "2000"; document.body.appendChild(ghost);
      item.classList.add("opacity-50");
      const move = (moveEvent) => {
        if (draggedOrderIndex < 0) return;
        ghost.style.transform = `translate(${moveEvent.clientX - event.clientX}px, ${moveEvent.clientY - event.clientY}px)`;
        const target = [...grid.querySelectorAll("[data-pdf-page-item]")].find((candidate) => {
          const r = candidate.getBoundingClientRect(); return moveEvent.clientX >= r.left && moveEvent.clientX <= r.right && moveEvent.clientY >= r.top && moveEvent.clientY <= r.bottom;
        });
        if (target && Number(target.dataset.pdfPageItem) !== draggedOrderIndex) showDropTarget(target);
      };
      const up = (upEvent) => {
        const target = [...grid.querySelectorAll("[data-pdf-page-item]")].find((candidate) => { const r = candidate.getBoundingClientRect(); return upEvent.clientX >= r.left && upEvent.clientX <= r.right && upEvent.clientY >= r.top && upEvent.clientY <= r.bottom; });
        const from = draggedOrderIndex; const to = target ? Number(target.dataset.pdfPageItem) : from;
        document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); clearDrag();
        if (from !== to) { const [page] = pageOrder.splice(from, 1); pageOrder.splice(to, 0, page); renderPageGrid(tool); }
      };
      document.addEventListener("pointermove", move); document.addEventListener("pointerup", up, { once: true });
    });
  });
  grid.querySelectorAll("[data-pdf-page-enlarge]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    showPdfPagePreview(Number(button.dataset.pdfPageEnlarge));
  }));
  const pagesInput = workspace.querySelector("#pdf-pages");
  if (pagesInput && tool.name !== "Redact PDF") {
    const orderedSelection = tool.name === "Organize PDF" ? pageOrder.filter((index) => selected.has(index)) : [...pageSelection].sort((a, b) => a - b);
    pagesInput.value = orderedSelection.map((index) => index + 1).join(", ");
  }
  const count = workspace.querySelector("#pdf-page-selection-count");
  if (count) count.textContent = `${pageSelection.length} page${pageSelection.length === 1 ? "" : "s"} selected${tool.name === "Organize PDF" ? " — drag pages to reorder" : ""}`;
}

function showPdfPagePreview(pageIndex) {
  let modal = document.getElementById("pdf-page-preview-modal");
  if (!modal) {
    modal = document.createElement("div"); modal.id = "pdf-page-preview-modal"; modal.className = "modal fade"; modal.tabIndex = -1;
    modal.innerHTML = `<div class="modal-dialog modal-xl modal-dialog-centered"><div class="modal-content bg-body"><div class="modal-header py-2"><h5 class="modal-title">PDF page preview</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body text-center"><img id="pdf-page-preview-image" class="img-fluid rounded border" alt="Enlarged PDF page" /></div></div></div>`;
    document.body.appendChild(modal);
  }
  const image = modal.querySelector("#pdf-page-preview-image"); image.src = pagePreviews[pageIndex] || ""; image.alt = `Page ${pageIndex + 1}`;
  if (window.bootstrap?.Modal) window.bootstrap.Modal.getOrCreateInstance(modal).show();
}

async function runPdfTool(tool) {
  const status = workspace?.querySelector("#pdf-run-status");
  const button = workspace?.querySelector("#btn-pdf-run");
  const sourceUrl = workspace?.querySelector("#pdf-source-url")?.value.trim();
  if (!sourceUrl && selectedFiles.length === 0) {
    if (status) status.textContent = "Select a source file or enter a URL first.";
    return;
  }
  const orderedFiles = ["JPG to PDF", "Scan to PDF"].includes(tool.name) ? pageOrder.filter((index) => pageSelection.includes(index)).map((index) => selectedFiles[index]) : selectedFiles;
  const params = {
    tool: tool.name,
    files: orderedFiles,
    url: sourceUrl || "",
    output_path: workspace?.querySelector("#pdf-output-path")?.value.trim() || "",
    pages: workspace?.querySelector("#pdf-pages")?.value.trim() || "",
    password: workspace?.querySelector("#pdf-password")?.value || "",
    watermark: workspace?.querySelector("#pdf-watermark")?.value || "",
    form_values: workspace?.querySelector("#pdf-form-values")?.value || "",
    ai_option: workspace?.querySelector("#pdf-ai-language")?.value || "",
    compression_level: workspace?.querySelector("#pdf-compression-level")?.value || "balanced",
    image_dpi: workspace?.querySelector("#pdf-image-dpi")?.value || "150",
    split_mode: workspace?.querySelector("#pdf-split-mode")?.value || "individual",
    rotate_degrees: workspace?.querySelector("#pdf-rotate-degrees")?.value || "90",
    crop_margin: workspace?.querySelector("#pdf-crop-margin")?.value || "18",
    render_dpi: workspace?.querySelector("#pdf-render-dpi")?.value || "150",
    image_format: workspace?.querySelector("#pdf-image-format")?.value || "jpg",
    page_orientation: workspace?.querySelector("#pdf-page-orientation")?.value || "auto",
    page_margin: workspace?.querySelector("#pdf-page-margin")?.value || "18",
    number_position: workspace?.querySelector("#pdf-number-position")?.value || "bottom-center",
    number_start: workspace?.querySelector("#pdf-number-start")?.value || "1",
    watermark_opacity: workspace?.querySelector("#pdf-watermark-opacity")?.value || "50",
    watermark_angle: workspace?.querySelector("#pdf-watermark-angle")?.value || "45",
    signature_text: workspace?.querySelector("#pdf-signature-text")?.value || "Approved",
    signer_name: workspace?.querySelector("#pdf-signer-name")?.value || "",
    sign_date: workspace?.querySelector("#pdf-sign-date")?.value || "",
    sign_position: workspace?.querySelector("#pdf-sign-position")?.value || "bottom-right",
    ocr_language: workspace?.querySelector("#pdf-ocr-language")?.value || "eng",
    ocr_dpi: workspace?.querySelector("#pdf-ocr-dpi")?.value || "300",
  };
  if (!window.__TAURI__?.core?.invoke) {
    if (status) status.textContent = "PDF processing is available in the desktop app.";
    return;
  }
  if (button) button.disabled = true;
  if (status) status.textContent = "Processing locally…";
  let unlisten;
  let unlistenLog;
  const workerLogs = [];
  try {
    unlistenLog = await window.__TAURI__.event.listen("ffmpeg-log", (event) => {
      const line = event.payload?.line;
      if (line) workerLogs.push(line);
    });
    unlisten = await window.__TAURI__.event.listen("ffmpeg-finished", (event) => {
      if (button) button.disabled = false;
      if (status) status.textContent = event.payload?.message || (event.payload?.success ? "Completed." : "Unable to complete the job.");
      if (!event.payload?.success) showPdfErrorDialog(tool, event.payload, workerLogs);
      else showPdfOutputActions(workerLogs);
      unlisten?.();
      unlistenLog?.();
    });
    await window.__TAURI__.core.invoke("execute_image_ai", { task: "pdf_tool", params: JSON.stringify(params) });
  } catch (error) {
    if (button) button.disabled = false;
    if (status) status.textContent = `Error: ${error}`;
    unlisten?.();
    unlistenLog?.();
    showPdfErrorDialog(tool, { message: String(error) }, workerLogs);
  }
}

export function initPdfTools() {
  workspace = document.getElementById("pdf-tools-workspace");
  workspace?.classList.add("fade");
  window.addPdfFilesToPdfQueue = (paths) => {
    const active = allTools().find((tool) => tool.name === document.querySelector("#pdf-tools-workspace h3")?.textContent?.trim());
    if (!Array.isArray(paths) || !active) return;
    if (!pdfQueueMode) {
      selectedFiles = paths.slice(0, 1);
      const input = workspace.querySelector("#pdf-source-files");
      if (input) input.value = selectedFiles.join("; ");
      if (["Split PDF", "Remove Pages", "Extract Pages", "Organize PDF", "Rotate PDF", "Crop PDF", "JPG to PDF", "Scan to PDF"].includes(active.name)) loadPdfPageGrid(active);
      return;
    }
    selectedFiles = [...selectedFiles, ...paths.filter((path) => !selectedFiles.includes(path))];
    renderPdfQueue(active);
    if (["Organize PDF", "JPG to PDF", "Scan to PDF"].includes(active.name)) loadPdfPageGrid(active);
  };
  renderHome();
}

export function showPdfToolsHome() {
  renderHome();
}

export { PDF_CATEGORIES };
