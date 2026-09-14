// AnEdiKit - User Kits Modals & Dialogs Module
import { escapeHtml } from "./state.js";

// Ensure Bootstrap modals for Kit Alerts & Prompts exist in DOM
export function ensureCustomKitModals() {
  if (!document.getElementById("modal-kit-alert")) {
    const alertModal = document.createElement("div");
    alertModal.className = "modal fade";
    alertModal.id = "modal-kit-alert";
    alertModal.tabIndex = -1;
    alertModal.setAttribute("aria-hidden", "true");
    alertModal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content shadow border">
          <div class="modal-header py-2 px-3">
            <h6 class="modal-title small fw-semibold text-body d-flex align-items-center gap-2" id="modal-kit-alert-title">
              <ion-icon name="information-circle-outline" class="text-primary"></ion-icon> Alert
            </h6>
            <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-3 small text-body" id="modal-kit-alert-message"></div>
          <div class="modal-footer py-2 px-3 border-top-0">
            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-kit-alert-ok" data-bs-dismiss="modal">OK</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(alertModal);
  }

  if (!document.getElementById("modal-kit-prompt")) {
    const promptModal = document.createElement("div");
    promptModal.className = "modal fade";
    promptModal.id = "modal-kit-prompt";
    promptModal.tabIndex = -1;
    promptModal.setAttribute("aria-hidden", "true");
    promptModal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content shadow border">
          <div class="modal-header py-2 px-3">
            <h6 class="modal-title small fw-semibold text-body d-flex align-items-center gap-2" id="modal-kit-prompt-title">
              <ion-icon name="chatbubble-ellipses-outline" class="text-primary"></ion-icon> Prompt
            </h6>
            <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-3">
            <label class="form-label small text-body" id="modal-kit-prompt-message"></label>
            <input type="text" class="form-control form-control-sm font-sans" id="modal-kit-prompt-input" />
          </div>
          <div class="modal-footer py-2 px-3">
            <button type="button" class="btn btn-outline-secondary btn-sm px-3" id="btn-kit-prompt-cancel" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm px-3" id="btn-kit-prompt-ok">OK</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(promptModal);
  }
}

// Show custom asynchronous alert modal dialog
export function showCustomKitAlert(message, title = "Alert") {
  ensureCustomKitModals();
  return new Promise((resolve) => {
    const modalEl = document.getElementById("modal-kit-alert");
    if (!modalEl || !window.bootstrap?.Modal) {
      window.alert(message);
      resolve();
      return;
    }

    const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    const titleEl = document.getElementById("modal-kit-alert-title") || document.getElementById("kit-alert-title");
    const msgEl = document.getElementById("modal-kit-alert-message") || document.getElementById("kit-alert-message");
    const okBtn = document.getElementById("btn-kit-alert-ok");

    if (titleEl) titleEl.innerHTML = `<ion-icon name="information-circle-outline" class="text-primary me-2"></ion-icon>${escapeHtml(title)}`;
    if (msgEl) msgEl.textContent = String(message ?? "");

    let resolved = false;
    const onDismiss = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    modalEl.addEventListener("hidden.bs.modal", onDismiss, { once: true });
    okBtn?.addEventListener(
      "click",
      () => {
        modal.hide();
      },
      { once: true }
    );

    modal.show();
  });
}

// Show custom asynchronous prompt modal dialog
export function showCustomKitPrompt(message, defaultValue = "", title = "Prompt") {
  ensureCustomKitModals();
  return new Promise((resolve) => {
    const modalEl = document.getElementById("modal-kit-prompt");
    if (!modalEl || !window.bootstrap?.Modal) {
      const val = window.prompt(message, defaultValue);
      resolve(val !== null ? val : defaultValue);
      return;
    }

    const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    const titleEl = document.getElementById("modal-kit-prompt-title") || document.getElementById("kit-prompt-title");
    const msgEl = document.getElementById("modal-kit-prompt-message") || document.getElementById("kit-prompt-message");
    const inputEl = document.getElementById("modal-kit-prompt-input") || document.getElementById("kit-prompt-input");
    const okBtn = document.getElementById("btn-kit-prompt-ok");
    const cancelBtn = document.getElementById("btn-kit-prompt-cancel");

    if (titleEl) titleEl.innerHTML = `<ion-icon name="chatbubble-ellipses-outline" class="text-primary me-2"></ion-icon>${escapeHtml(title)}`;
    if (msgEl) msgEl.textContent = String(message ?? "");
    if (inputEl) inputEl.value = defaultValue || "";

    let resolved = false;
    const onDismiss = () => {
      if (!resolved) {
        resolved = true;
        resolve(defaultValue);
      }
    };

    const onOk = () => {
      if (!resolved) {
        resolved = true;
        const val = inputEl ? inputEl.value : "";
        modal.hide();
        resolve(val);
      }
    };

    const onKeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onOk();
      }
    };

    modalEl.addEventListener("hidden.bs.modal", onDismiss, { once: true });
    okBtn?.addEventListener("click", onOk, { once: true });
    cancelBtn?.addEventListener("click", () => modal.hide(), { once: true });
    inputEl?.addEventListener("keydown", onKeydown);

    modal.show();
    setTimeout(() => {
      inputEl?.focus();
      inputEl?.select();
    }, 250);
  });
}

// Universal robust dropdown binding helper for dynamic views
export function bindUniversalDropdowns(container) {
  if (!container) return;

  container.querySelectorAll('[data-bs-toggle="dropdown"]').forEach((toggleBtn) => {
    if (window.bootstrap?.Dropdown) {
      const autoCloseAttr = toggleBtn.getAttribute("data-bs-auto-close");
      let autoCloseVal = true;
      if (autoCloseAttr === "outside") autoCloseVal = "outside";
      else if (autoCloseAttr === "inside") autoCloseVal = "inside";
      else if (autoCloseAttr === "false") autoCloseVal = false;

      window.bootstrap.Dropdown.getOrCreateInstance(toggleBtn, {
        autoClose: autoCloseVal,
      });
    } else {
      toggleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const parentDropdown = toggleBtn.closest(".dropdown, .dropup, .dropend, .dropstart") || toggleBtn.parentElement;
        const menu = parentDropdown?.querySelector(".dropdown-menu");
        if (!menu) return;

        const isCurrentlyOpen = menu.classList.contains("show");

        document.querySelectorAll(".dropdown-menu.show").forEach((m) => {
          m.classList.remove("show");
          const b = m.parentElement?.querySelector('[data-bs-toggle="dropdown"]');
          if (b) {
            b.classList.remove("show");
            b.setAttribute("aria-expanded", "false");
          }
        });

        if (!isCurrentlyOpen) {
          menu.classList.add("show");
          menu.setAttribute("data-bs-popper", "static");
          toggleBtn.classList.add("show");
          toggleBtn.setAttribute("aria-expanded", "true");
        }
      });
    }
  });
}
