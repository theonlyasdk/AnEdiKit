// yt-dlp Filename Format Editor Module
import { loadSettings, saveSettings } from "./storage.js";

export const YT_TOKENS = [
  { name: "Title", key: "title", raw: "%(title)s", desc: "Video or audio title" },
  { name: "Video ID", key: "id", raw: "%(id)s", desc: "Unique video ID (e.g. dQw4w9WgXcQ)" },
  { name: "Uploader / Channel", key: "uploader", raw: "%(uploader)s", desc: "Channel or uploader name" },
  { name: "Upload Date", key: "upload_date", raw: "%(upload_date)s", desc: "Upload date in YYYYMMDD format" },
  { name: "Resolution", key: "resolution", raw: "%(resolution)s", desc: "Video resolution (e.g. 1080p)" },
  { name: "Extension", key: "ext", raw: "%(ext)s", desc: "Output container extension (e.g. mp4, mp3)" },
  { name: "Playlist Index", key: "playlist_index", raw: "%(playlist_index)s", desc: "Item index in playlist (e.g. 01)" },
  { name: "Playlist Title", key: "playlist_title", raw: "%(playlist_title)s", desc: "Playlist title folder or name" },
  { name: "Artist", key: "artist", raw: "%(artist)s", desc: "Artist name for music tracks" },
  { name: "Track", key: "track", raw: "%(track)s", desc: "Track title for music" },
  { name: "Album", key: "album", raw: "%(album)s", desc: "Album name" },
  { name: "Release Year", key: "release_year", raw: "%(release_year)s", desc: "Release year (e.g. 1987)" },
  { name: "Duration", key: "duration_string", raw: "%(duration_string)s", desc: "Media duration (e.g. 3:33)" },
  { name: "View Count", key: "view_count", raw: "%(view_count)s", desc: "Approximate view count" },
];

export const TOKEN_MAP = Object.fromEntries(YT_TOKENS.map((t) => [t.key, t.name]));

export const SAMPLE_METADATA = {
  title: "Never Gonna Give You Up",
  id: "dQw4w9WgXcQ",
  uploader: "Rick Astley",
  channel: "Rick Astley",
  upload_date: "20091025",
  resolution: "1080p",
  ext: "mp4",
  playlist_index: "01",
  playlist_title: "Greatest Hits",
  artist: "Rick Astley",
  track: "Never Gonna Give You Up",
  album: "Whenever You Need Somebody",
  release_year: "1987",
  duration_string: "3:33",
  view_count: "1500000000",
};

export const DEFAULT_FORMAT = "%(title)s [%(id)s].%(ext)s";

let currentFormatItems = [];

export function parseFormatStringToItems(fmt) {
  if (!fmt || typeof fmt !== "string") {
    fmt = DEFAULT_FORMAT;
  }
  const parts = fmt.split(/(%\([a-zA-Z0-9_]+\)s)/g);
  const items = [];
  for (const part of parts) {
    if (!part) continue;
    const match = part.match(/^%\(([a-zA-Z0-9_]+)\)s$/);
    if (match) {
      items.push({
        type: "token",
        key: match[1],
        raw: part,
      });
    } else {
      items.push({
        type: "text",
        value: part,
      });
    }
  }
  return items.length > 0
    ? items
    : [
        { type: "token", key: "title", raw: "%(title)s" },
        { type: "text", value: "." },
        { type: "token", key: "ext", raw: "%(ext)s" },
      ];
}

export function compileItemsToFormatString(items) {
  if (!items || !items.length) return DEFAULT_FORMAT;
  return items
    .map((item) => {
      if (item.type === "token") {
        return item.raw || `%(item.key)s`;
      }
      return item.value || "";
    })
    .join("");
}

export function previewFormatString(formatStr) {
  if (!formatStr) return "";
  return formatStr.replace(/%\(([a-zA-Z0-9_]+)\)s/g, (match, key) => {
    return SAMPLE_METADATA[key] !== undefined ? SAMPLE_METADATA[key] : `[${key}]`;
  });
}

export function getSavedYtDlpFormat() {
  const settings = loadSettings();
  return settings.ytdlpFilenameFormat || localStorage.getItem("anedikit:ytdlp_filename_format") || DEFAULT_FORMAT;
}

export function saveYtDlpFormat(formatStr) {
  const clean = formatStr?.trim() || DEFAULT_FORMAT;
  try {
    localStorage.setItem("anedikit:ytdlp_filename_format", clean);
    const settings = loadSettings();
    settings.ytdlpFilenameFormat = clean;
    saveSettings(settings);
  } catch (e) {
    console.warn("Failed to persist yt-dlp filename format:", e);
  }

  // Update input fields across UI
  const formatInput = document.getElementById("ytdlp-filename-format");
  if (formatInput) {
    formatInput.value = clean;
  }
}

export function renderFormatEditorList() {
  const listContainer = document.getElementById("format-fields-list");
  if (!listContainer) return;

  listContainer.innerHTML = "";

  if (currentFormatItems.length === 0) {
    listContainer.innerHTML = `<div class="text-center text-body-secondary small py-4">No format fields. Click <strong>+ Add Field</strong> or choose a preset above.</div>`;
    updateEditorPreview();
    return;
  }

  currentFormatItems.forEach((item, index) => {
    const itemEl = document.createElement("div");
    itemEl.className = "format-list-item bg-body-tertiary px-3 py-2 d-flex flex-row align-items-center justify-content-between gap-2";
    itemEl.dataset.index = index.toString();

    // Left content: Drag handle + Field badge / input
    const leftCol = document.createElement("div");
    leftCol.className = "d-flex align-items-center gap-2 flex-grow-1 overflow-hidden";

    const dragHandle = document.createElement("span");
    dragHandle.className = "format-drag-handle text-secondary cursor-grab p-1";
    dragHandle.title = "Drag vertically to reorder";
    dragHandle.innerHTML = `<i class="bi bi-grip-vertical fs-5"></i>`;
    leftCol.appendChild(dragHandle);

    if (item.type === "token") {
      const displayName = TOKEN_MAP[item.key] || item.key;
      const badge = document.createElement("span");
      badge.className = "badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1 fs-7";
      badge.textContent = displayName;
      leftCol.appendChild(badge);

      const codeTag = document.createElement("span");
      codeTag.className = "font-monospace text-body-secondary small text-truncate";
      codeTag.textContent = item.raw || `%(${item.key})s`;
      leftCol.appendChild(codeTag);
    } else {
      const badge = document.createElement("span");
      badge.className = "badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1 fs-7";
      badge.textContent = "Text";
      leftCol.appendChild(badge);

      const input = document.createElement("input");
      input.type = "text";
      input.className = "form-control form-control-sm format-item-text-input font-sans";
      input.value = item.value || "";
      input.placeholder = "Enter custom text / separator (e.g.  -  or  _ )";
      input.addEventListener("input", (e) => {
        item.value = e.target.value;
        updateEditorPreview();
      });
      leftCol.appendChild(input);
    }

    itemEl.appendChild(leftCol);

    // Right content: Combined button group (Up, Down, Delete)
    const btnGroup = document.createElement("div");
    btnGroup.className = "btn-group btn-group-sm flex-shrink-0";
    btnGroup.setAttribute("role", "group");

    const btnUp = document.createElement("button");
    btnUp.type = "button";
    btnUp.className = "btn btn-outline-secondary btn-item-up";
    btnUp.title = "Move Up";
    btnUp.innerHTML = `<i class="bi bi-chevron-up"></i>`;
    btnUp.disabled = index === 0;
    btnUp.addEventListener("click", () => {
      if (index > 0) {
        const temp = currentFormatItems[index];
        currentFormatItems[index] = currentFormatItems[index - 1];
        currentFormatItems[index - 1] = temp;
        renderFormatEditorList();
      }
    });

    const btnDown = document.createElement("button");
    btnDown.type = "button";
    btnDown.className = "btn btn-outline-secondary btn-item-down";
    btnDown.title = "Move Down";
    btnDown.innerHTML = `<i class="bi bi-chevron-down"></i>`;
    btnDown.disabled = index === currentFormatItems.length - 1;
    btnDown.addEventListener("click", () => {
      if (index < currentFormatItems.length - 1) {
        const temp = currentFormatItems[index];
        currentFormatItems[index] = currentFormatItems[index + 1];
        currentFormatItems[index + 1] = temp;
        renderFormatEditorList();
      }
    });

    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "btn btn-outline-danger btn-item-delete";
    btnDel.title = "Delete Field";
    btnDel.innerHTML = `<i class="bi bi-trash3"></i>`;
    btnDel.addEventListener("click", () => {
      currentFormatItems.splice(index, 1);
      renderFormatEditorList();
    });

    btnGroup.appendChild(btnUp);
    btnGroup.appendChild(btnDown);
    btnGroup.appendChild(btnDel);
    itemEl.appendChild(btnGroup);

    // Setup interactive vertical-axis pointer drag with real-time shift preview
    setupItemDrag(itemEl, dragHandle, index, listContainer);

    listContainer.appendChild(itemEl);
  });

  updateEditorPreview();
}

function setupItemDrag(itemEl, dragHandle, index, listContainer) {
  dragHandle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const allItemEls = Array.from(listContainer.querySelectorAll(".format-list-item"));
    if (allItemEls.length <= 1) return;

    const startY = e.clientY;
    const startIndex = index;
    let targetIndex = index;

    // Get initial geometry
    const rects = allItemEls.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height, mid: r.top + r.height / 2 };
    });

    const draggedHeight = rects[startIndex].height;
    const gap = 0; // 0px spacing (flush list items)

    itemEl.classList.add("is-dragging");
    dragHandle.setPointerCapture(e.pointerId);

    const onPointerMove = (moveEvt) => {
      const deltaY = moveEvt.clientY - startY;
      // Strictly locked to vertical Y axis with lift elevation
      itemEl.style.transform = `translateY(${deltaY}px) scale(1.02)`;

      const currentMid = rects[startIndex].mid + deltaY;

      // Determine target slot
      let newTarget = startIndex;
      for (let i = 0; i < rects.length; i++) {
        if (i < startIndex) {
          if (currentMid < rects[i].mid) {
            newTarget = i;
            break;
          }
        } else if (i > startIndex) {
          if (currentMid > rects[i].mid) {
            newTarget = i;
          }
        }
      }
      targetIndex = newTarget;

      // Smoothly shift other items
      allItemEls.forEach((otherEl, i) => {
        if (i === startIndex) return;
        if (startIndex < targetIndex) {
          if (i > startIndex && i <= targetIndex) {
            otherEl.style.transform = `translateY(-${draggedHeight + gap}px)`;
          } else {
            otherEl.style.transform = "translateY(0)";
          }
        } else if (startIndex > targetIndex) {
          if (i < startIndex && i >= targetIndex) {
            otherEl.style.transform = `translateY(${draggedHeight + gap}px)`;
          } else {
            otherEl.style.transform = "translateY(0)";
          }
        } else {
          otherEl.style.transform = "translateY(0)";
        }
      });
    };

    const onPointerUp = (upEvt) => {
      try {
        dragHandle.releasePointerCapture(upEvt.pointerId);
      } catch (_) {}
      dragHandle.removeEventListener("pointermove", onPointerMove);
      dragHandle.removeEventListener("pointerup", onPointerUp);
      dragHandle.removeEventListener("pointercancel", onPointerUp);

      itemEl.classList.remove("is-dragging");
      itemEl.style.transform = "";
      allItemEls.forEach((el) => (el.style.transform = ""));

      if (targetIndex !== startIndex) {
        const moved = currentFormatItems.splice(startIndex, 1)[0];
        currentFormatItems.splice(targetIndex, 0, moved);
      }
      renderFormatEditorList();
    };

    dragHandle.addEventListener("pointermove", onPointerMove);
    dragHandle.addEventListener("pointerup", onPointerUp);
    dragHandle.addEventListener("pointercancel", onPointerUp);
  });
}

export function updateEditorPreview() {
  const previewFilenameEl = document.getElementById("format-preview-filename");
  const previewTemplateEl = document.getElementById("format-preview-template");

  const fmt = compileItemsToFormatString(currentFormatItems);
  const sampleFilename = previewFormatString(fmt);

  if (previewTemplateEl) {
    previewTemplateEl.textContent = fmt || "(empty format)";
  }
  if (previewFilenameEl) {
    previewFilenameEl.textContent = sampleFilename || "(empty output)";
  }
}

export function initYtDlpFormatEditor() {
  const savedFmt = getSavedYtDlpFormat();

  // Populate preview input on main view
  const formatInput = document.getElementById("ytdlp-filename-format");
  if (formatInput) {
    formatInput.value = savedFmt;
  }

  // Populate tokens dropdown menu in modal
  const dropdownTokens = document.getElementById("dropdown-format-tokens");
  if (dropdownTokens) {
    dropdownTokens.innerHTML = "";
    YT_TOKENS.forEach((tok) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "dropdown-item small d-flex justify-content-between align-items-center gap-3";
      a.href = "#";
      a.innerHTML = `<span>${tok.name}</span><code class="text-primary-emphasis">${tok.raw}</code>`;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        currentFormatItems.push({
          type: "token",
          key: tok.key,
          raw: tok.raw,
        });
        renderFormatEditorList();
      });
      li.appendChild(a);
      dropdownTokens.appendChild(li);
    });
  }

  // Edit button in shared URL card
  const btnEdit = document.getElementById("btn-edit-ytdlp-filename-format");
  const modalEl = document.getElementById("modal-filename-format-editor");
  if (btnEdit && modalEl && window.bootstrap?.Modal) {
    btnEdit.addEventListener("click", () => {
      const activeFmt = formatInput?.value || getSavedYtDlpFormat();
      currentFormatItems = parseFormatStringToItems(activeFmt);
      renderFormatEditorList();
      const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    });
  }

  // Add text separator button
  const btnAddText = document.getElementById("btn-add-format-text");
  if (btnAddText) {
    btnAddText.addEventListener("click", () => {
      currentFormatItems.push({
        type: "text",
        value: " - ",
      });
      renderFormatEditorList();
    });
  }

  // Presets buttons
  document.querySelectorAll(".btn-preset-format").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const fmt = btn.getAttribute("data-format");
      if (fmt) {
        currentFormatItems = parseFormatStringToItems(fmt);
        renderFormatEditorList();
      }
    });
  });

  // Reset to default button
  const btnReset = document.getElementById("btn-reset-format-default");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      currentFormatItems = parseFormatStringToItems(DEFAULT_FORMAT);
      renderFormatEditorList();
    });
  }

  // Save button in modal
  const btnSave = document.getElementById("btn-save-format-editor");
  if (btnSave && modalEl && window.bootstrap?.Modal) {
    btnSave.addEventListener("click", () => {
      const finalFmt = compileItemsToFormatString(currentFormatItems);
      saveYtDlpFormat(finalFmt);
      const modal = window.bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    });
  }
}
