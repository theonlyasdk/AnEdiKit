// AnEdiKit - Kit data operations: export / duplicate / delete (leaf-ish).
// Moved from settings.js. These functions mutate kit storage and then
// notify the UI via the `anedikit:kits-changed` event instead of importing
// sidebar/workspace renderers (that was a static import cycle):
//   - sidebar.js listens  -> renderUserKitsSidebar()
//   - workspace.js listens -> selectAndOpenKit(openKitId) / IDE refresh
// dispatchEvent is synchronous, so ordering matches the old direct calls.

import { setActiveKit } from "./state.js";
import {
  getUserKitById,
  saveUserKit,
  deleteUserKit,
  loadUserKits,
} from "./storage.js";
import { showCustomKitConfirm } from "./modals.js";

export function notifyKitsChanged(detail = {}) {
  try {
    document.dispatchEvent(new CustomEvent("anedikit:kits-changed", { detail }));
  } catch (_) {}
}

// Export kit configuration as downloadable JSON file
export function exportKitAsJSON(kit) {
  if (!kit) return;
  const jsonStr = JSON.stringify(kit, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${kit.id || "kit"}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Duplicate existing kit by ID
export function duplicateKitById(kitId) {
  const kit = getUserKitById(kitId);
  if (!kit) return;

  const newId = `${kit.id}_copy_${Date.now().toString().slice(-4)}`;
  const duplicated = {
    ...JSON.parse(JSON.stringify(kit)),
    id: newId,
    name: `${kit.name} (Copy)`,
  };

  saveUserKit(duplicated);
  notifyKitsChanged({ openKitId: newId, switchTool: true });
}

// Delete existing kit by ID with a Bootstrap confirmation dialog. The dialog
// owns the deletion so its confirm button can show an in-progress state.
export function deleteKitById(kitId) {
  const kit = getUserKitById(kitId);
  if (!kit) return;

  showCustomKitConfirm(`Delete the kit "${kit.name}"? This cannot be undone.`, {
    title: "Delete Kit",
    confirmLabel: "Delete",
    variant: "danger",
    busyLabel: "Deleting…",
    onConfirm: () => {
      deleteUserKit(kitId);

      const remaining = loadUserKits();
      if (remaining.length > 0) {
        notifyKitsChanged({ openKitId: remaining[0].id, switchTool: true });
      } else {
        setActiveKit(null);
        notifyKitsChanged({ openKitId: null, kitsEmpty: true });
      }
    },
  });
}
