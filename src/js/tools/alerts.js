// AnEdiKit - Manage-tools alert banner (leaf, DOM-only).
export function showToolAlert(message, type = "danger") {
  const alertBox = document.getElementById("tool-update-alert");
  const alertMsg = document.getElementById("tool-update-alert-msg");
  if (!alertBox || !alertMsg) return;

  alertBox.className = `alert alert-${type} alert-dismissible fade show py-2 px-3 small`;
  alertBox.classList.remove("d-none");
  alertMsg.textContent = message;
}


export function hideToolAlert() {
  const alertBox = document.getElementById("tool-update-alert");
  if (alertBox) alertBox.classList.add("d-none");
}
