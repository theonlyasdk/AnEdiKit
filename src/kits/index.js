// AnEdiKit - User Kits Modular Package Barrel & Public API
import { loadSettings } from "./storage.js";
import { ensureCustomKitModals } from "./modals.js";
import { ensureDefaultSampleKits } from "./templates.js";
import { applyUserKitsVisibility, renderUserKitsSidebar, bindKitWizardEvents } from "./sidebar.js";
import { updateKitTabIndicator } from "./workspace.js";

// Re-export all submodules for complete API surface
export * from "./state.js";
export * from "./storage.js";
export * from "./blocks.js";
export * from "./templates.js";
export * from "./modals.js";
export * from "./sidebar.js";
export * from "./settings.js";
export * from "./executor.js";
export * from "./runner.js";
export * from "./builder.js";
export * from "./editor.js";
export * from "./workspace.js";

// Initialize Kits System
export function initKitsManager() {
  ensureCustomKitModals();
  ensureDefaultSampleKits();
  const settings = loadSettings();
  applyUserKitsVisibility(settings.enableUserKits === true);
  renderUserKitsSidebar();
  bindKitWizardEvents();

  // Dismiss open dropdowns on click outside (only if Bootstrap is not active)
  document.addEventListener("click", (e) => {
    if (window.bootstrap?.Dropdown) return;
    if (!e.target.closest(".dropdown, .dropup, .dropend, .dropstart")) {
      document.querySelectorAll(".dropdown-menu.show").forEach((m) => {
        m.classList.remove("show");
        const b = m.parentElement?.querySelector('[data-bs-toggle="dropdown"]');
        if (b) {
          b.classList.remove("show");
          b.setAttribute("aria-expanded", "false");
        }
      });
    }
  });

  // Resize listener to keep sliding tab indicator properly positioned
  window.addEventListener("resize", () => {
    updateKitTabIndicator(true);
  });
}
