// AnEdiKit - Application Settings and Hardware Detection Submodule
import {
  loadSettings,
  saveSettings,
  getToolsUpdateCache,
  clearToolsUpdateCache,
} from "./storage.js";
import { setDetectedHardware } from "./commands.js";
import { applyTitlebarMode } from "./window_caption.js";
import { applyUserKitsVisibility } from "../kits/index.js";
import { applyMediaPreviewVisibility } from "./media.js";
import { refreshToolsUI } from "./tools_manager.js";

let appSettings = loadSettings();
let userKitsWarningModalInstance = null;
let toolsCacheControlsInitialized = false;

export function getAppSettings() {
  return appSettings;
}

export function setAppSettings(settings) {
  appSettings = { ...settings };
}

export async function populateHardwareInfo() {
  const setHw = document.getElementById("set-hwaccel");
  if (!setHw) return;

  let hwInfo = null;
  if (window.__TAURI__?.core?.invoke) {
    try {
      hwInfo = await window.__TAURI__.core.invoke("get_hardware_info");
    } catch (err) {
      console.warn("Failed to get hardware info:", err);
    }
  }

  setDetectedHardware(hwInfo);

  const currentVal = appSettings.hwAccel || "auto";

  let autoDesc = "CPU";
  if (hwInfo?.nvenc_available) {
    autoDesc = `NVIDIA NVENC${hwInfo.nvidia_gpu ? ` — ${hwInfo.nvidia_gpu}` : ""}`;
  } else if (hwInfo?.qsv_available) {
    autoDesc = `Intel QuickSync${hwInfo.intel_gpu ? ` — ${hwInfo.intel_gpu}` : ""}`;
  } else if (hwInfo?.amf_available) {
    autoDesc = `AMD AMF${hwInfo.amd_gpu ? ` — ${hwInfo.amd_gpu}` : ""}`;
  } else if (hwInfo?.videotoolbox_available) {
    autoDesc = "Apple VideoToolbox";
  } else if (hwInfo?.d3d11va_available) {
    autoDesc = "DirectML (D3D11VA)";
  } else if (hwInfo?.cpu_name) {
    autoDesc = `CPU (${hwInfo.cpu_name})`;
  }
  const autoLabel = `Auto (${autoDesc})`;

  const cpuLabel = hwInfo?.cpu_name ? `CPU (${hwInfo.cpu_name})` : "CPU";

  const isCudaAvail = !!hwInfo?.nvenc_available;
  const cudaSuffix = isCudaAvail
    ? (hwInfo.nvidia_gpu ? ` (${hwInfo.nvidia_gpu})` : " (Verified)")
    : " (Unavailable)";
  const cudaLabel = `NVIDIA NVENC (CUDA)${cudaSuffix}`;
  const cudaDisabled = !isCudaAvail ? " disabled" : "";

  const isQsvAvail = !!hwInfo?.qsv_available;
  const qsvSuffix = isQsvAvail
    ? (hwInfo.intel_gpu ? ` (${hwInfo.intel_gpu})` : " (Verified)")
    : " (Unavailable)";
  const qsvLabel = `Intel QuickSync (QSV)${qsvSuffix}`;
  const qsvDisabled = !isQsvAvail ? " disabled" : "";

  const isAmfAvail = !!hwInfo?.amf_available;
  const amfSuffix = isAmfAvail
    ? (hwInfo.amd_gpu ? ` (${hwInfo.amd_gpu})` : " (Verified)")
    : " (Unavailable)";
  const amfLabel = `AMD AMF${amfSuffix}`;
  const amfDisabled = !isAmfAvail ? " disabled" : "";

  const isD3dAvail = !!hwInfo?.d3d11va_available;
  const d3dSuffix = isD3dAvail ? " (Verified)" : " (Unavailable)";
  const d3dLabel = `DirectML (D3D11VA)${d3dSuffix}`;
  const d3dDisabled = !isD3dAvail ? " disabled" : "";

  let optionsHtml = `
    <option value="auto">${autoLabel}</option>
    <option value="cuda"${cudaDisabled}>${cudaLabel}</option>
    <option value="qsv"${qsvDisabled}>${qsvLabel}</option>
    <option value="amf"${amfDisabled}>${amfLabel}</option>
    <option value="d3d11va"${d3dDisabled}>${d3dLabel}</option>
  `;

  if (hwInfo?.videotoolbox_available || (typeof navigator !== "undefined" && navigator.platform?.includes("Mac"))) {
    const isVtAvail = !!hwInfo?.videotoolbox_available;
    const vtSuffix = isVtAvail ? " (Verified)" : " (Unavailable)";
    const vtDisabled = !isVtAvail ? " disabled" : "";
    optionsHtml += `<option value="videotoolbox"${vtDisabled}>Apple VideoToolbox${vtSuffix}</option>`;
  }

  optionsHtml += `<option value="cpu">${cpuLabel}</option>`;

  setHw.innerHTML = optionsHtml;

  const targetOption = setHw.querySelector(`option[value="${currentVal}"]`);
  if (targetOption && !targetOption.disabled) {
    setHw.value = currentVal;
  } else {
    setHw.value = "auto";
    if (currentVal !== "auto") {
      appSettings.hwAccel = "auto";
      saveSettings(appSettings);
    }
  }
}

export function populateSettingsUI() {
  const setOutDir = document.getElementById("set-output-dir");
  const setPromptOver = document.getElementById("set-prompt-overwrite");
  const setEnableNotif = document.getElementById("set-enable-notifications");
  const setDisableAnim = document.getElementById("set-disable-animations");
  const setShowMediaPreview = document.getElementById("set-show-media-preview");
  const setEnableUserKits = document.getElementById("set-enable-user-kits");
  const setUseSystemTitlebar = document.getElementById("set-use-system-titlebar");
  const setHideScrollbars = document.getElementById("set-hide-scrollbars-on-hover");
  const setHw = document.getElementById("set-hwaccel");
  const setThr = document.getElementById("set-threads");
  const setDefVc = document.getElementById("set-def-vcodec");
  const setDefSp = document.getElementById("set-def-speed");
  const setDefAf = document.getElementById("set-def-aformat");
  const setDefAb = document.getElementById("set-def-abitrate");

  const setYtCookies = document.getElementById("set-ytdlp-cookies");
  const setYtRate = document.getElementById("set-ytdlp-ratelimit");
  const setYtSponsor = document.getElementById("set-ytdlp-sponsorblock");
  const setYtGeo = document.getElementById("set-ytdlp-geo-bypass");
  const setYtAutoPaste = document.getElementById("set-ytdlp-autopaste");
  const setYtCustom = document.getElementById("set-ytdlp-custom-args");

  if (setOutDir) setOutDir.value = appSettings.outputDir || "C:\\Users\\User\\Videos";
  if (setPromptOver) setPromptOver.checked = !!appSettings.promptOverwrite;
  if (setEnableNotif) setEnableNotif.checked = appSettings.enableNotifications !== false;
  if (setDisableAnim) setDisableAnim.checked = !!appSettings.disableAnimations;
  if (setShowMediaPreview) setShowMediaPreview.checked = appSettings.showMediaPreview !== false;
  if (setEnableUserKits) setEnableUserKits.checked = appSettings.enableUserKits === true;
  if (setUseSystemTitlebar) setUseSystemTitlebar.checked = appSettings.useSystemTitlebar !== false;
  if (setHideScrollbars) setHideScrollbars.checked = appSettings.hideScrollbarsOnHover === true;
  if (setHw) {
    const targetOpt = setHw.querySelector(`option[value="${appSettings.hwAccel || "auto"}"]`);
    if (targetOpt && !targetOpt.disabled) {
      setHw.value = appSettings.hwAccel || "auto";
    } else {
      setHw.value = "auto";
    }
  }
  if (setThr) setThr.value = appSettings.threads || "0";
  if (setDefVc) setDefVc.value = appSettings.defVCodec || "libx264";
  if (setDefSp) setDefSp.value = appSettings.defSpeed || "medium";
  if (setDefAf) setDefAf.value = appSettings.defAFmt || "mp3";
  if (setDefAb) setDefAb.value = appSettings.defABitrate || "256k";

  if (setYtCookies) setYtCookies.value = appSettings.ytdlpCookies || "none";
  if (setYtRate) setYtRate.value = appSettings.ytdlpRateLimit || "none";
  if (setYtSponsor) setYtSponsor.checked = !!appSettings.ytdlpSponsorblock;
  if (setYtGeo) setYtGeo.checked = appSettings.ytdlpGeoBypass !== false;
  if (setYtAutoPaste) setYtAutoPaste.checked = appSettings.ytdlpAutoPaste !== false;
  if (setYtCustom) setYtCustom.value = appSettings.ytdlpCustomArgs || "";

  populateHardwareInfo();
  renderToolsCacheStatus();
  initToolsCacheControls();
}

export function showUserKitsWarningModal() {
  const modalEl = document.getElementById("user-kits-warning-modal");
  if (!modalEl || typeof bootstrap === "undefined") return;

  if (!userKitsWarningModalInstance) {
    userKitsWarningModalInstance = new bootstrap.Modal(modalEl, {
      backdrop: "static",
      keyboard: true,
    });

    const btnConfirm = document.getElementById("btn-user-kits-confirm-warning");
    const setEnableUserKits = document.getElementById("set-enable-user-kits");

    if (btnConfirm) {
      btnConfirm.addEventListener("click", () => {
        appSettings.enableUserKits = true;
        saveSettings(appSettings);
        if (setEnableUserKits) setEnableUserKits.checked = true;
        applyUserKitsVisibility(true);
        userKitsWarningModalInstance.hide();
      });
    }

    modalEl.addEventListener("hidden.bs.modal", () => {
      if (setEnableUserKits && appSettings.enableUserKits !== true) {
        setEnableUserKits.checked = false;
      }
    });
  }

  userKitsWarningModalInstance.show();
}

export function saveSettingsFromUI() {
  let previewVisibilityChanged = false;
  const setOutDir = document.getElementById("set-output-dir");
  const setPromptOver = document.getElementById("set-prompt-overwrite");
  const setEnableNotif = document.getElementById("set-enable-notifications");
  const setDisableAnim = document.getElementById("set-disable-animations");
  const setShowMediaPreview = document.getElementById("set-show-media-preview");
  const setEnableUserKits = document.getElementById("set-enable-user-kits");
  const setUseSystemTitlebar = document.getElementById("set-use-system-titlebar");
  const setHideScrollbars = document.getElementById("set-hide-scrollbars-on-hover");
  const setHw = document.getElementById("set-hwaccel");
  const setThr = document.getElementById("set-threads");
  const setDefVc = document.getElementById("set-def-vcodec");
  const setDefSp = document.getElementById("set-def-speed");
  const setDefAf = document.getElementById("set-def-aformat");
  const setDefAb = document.getElementById("set-def-abitrate");

  const setYtCookies = document.getElementById("set-ytdlp-cookies");
  const setYtRate = document.getElementById("set-ytdlp-ratelimit");
  const setYtSponsor = document.getElementById("set-ytdlp-sponsorblock");
  const setYtGeo = document.getElementById("set-ytdlp-geo-bypass");
  const setYtAutoPaste = document.getElementById("set-ytdlp-autopaste");
  const setYtAutoFixUrl = document.getElementById("set-ytdlp-autofix-url");
  const setYtCustom = document.getElementById("set-ytdlp-custom-args");

  if (setOutDir) appSettings.outputDir = setOutDir.value;
  if (setPromptOver) appSettings.promptOverwrite = setPromptOver.checked;
  if (setEnableNotif) appSettings.enableNotifications = setEnableNotif.checked;
  if (setDisableAnim) appSettings.disableAnimations = setDisableAnim.checked;
  if (setShowMediaPreview) {
    const isShow = setShowMediaPreview.checked !== false;
    if (appSettings.showMediaPreview !== isShow) {
      appSettings.showMediaPreview = isShow;
      previewVisibilityChanged = true;
    }
  }
  if (setEnableUserKits) {
    const isChecked = !!setEnableUserKits.checked;
    if (appSettings.enableUserKits !== isChecked) {
      if (isChecked) {
        setEnableUserKits.checked = false;
        showUserKitsWarningModal();
      } else {
        appSettings.enableUserKits = false;
        applyUserKitsVisibility(false);
      }
    }
  }
  if (setUseSystemTitlebar) {
    const isSystem = !!setUseSystemTitlebar.checked;
    if (appSettings.useSystemTitlebar !== isSystem) {
      appSettings.useSystemTitlebar = isSystem;
      applyTitlebarMode(isSystem);
    }
  }
  if (setHideScrollbars) {
    const isHide = setHideScrollbars.checked === true;
    if (appSettings.hideScrollbarsOnHover !== isHide) {
      appSettings.hideScrollbarsOnHover = isHide;
      document.documentElement.classList.toggle("hide-scrollbars-on-hover", isHide);
    }
  }
  if (setHw) {
    const selectedOption = setHw.options?.[setHw.selectedIndex];
    if (selectedOption && selectedOption.disabled) {
      setHw.value = "auto";
    }
    appSettings.hwAccel = setHw.value;
  }
  if (setThr) appSettings.threads = setThr.value;
  if (setDefVc) appSettings.defVCodec = setDefVc.value;
  if (setDefSp) appSettings.defSpeed = setDefSp.value;
  if (setDefAf) appSettings.defAFmt = setDefAf.value;
  if (setDefAb) appSettings.defABitrate = setDefAb.value;

  if (setYtCookies) appSettings.ytdlpCookies = setYtCookies.value;
  if (setYtRate) appSettings.ytdlpRateLimit = setYtRate.value;
  if (setYtSponsor) appSettings.ytdlpSponsorblock = setYtSponsor.checked;
  if (setYtGeo) appSettings.ytdlpGeoBypass = setYtGeo.checked;
  if (setYtAutoPaste) appSettings.ytdlpAutoPaste = setYtAutoPaste.checked;
  if (setYtAutoFixUrl) appSettings.ytdlpAutoFixUrl = setYtAutoFixUrl.checked;
  if (setYtCustom) appSettings.ytdlpCustomArgs = setYtCustom.value;

  saveSettings(appSettings);

  if (previewVisibilityChanged) {
    // Apply immediately (both directions) instead of waiting for the next
    // probe or tool switch. Runs after persist so readers see the new value.
    applyMediaPreviewVisibility();
  }
}

export function formatCacheAge(timestamp) {
  if (!timestamp || typeof timestamp !== "number" || timestamp <= 0) {
    return "Not cached";
  }
  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function renderToolsCacheStatus() {
  const statusEl = document.getElementById("tools-cache-status-text");
  if (!statusEl) return;

  const cache = getToolsUpdateCache();
  const releases = cache?.releases && typeof cache.releases === "object" ? cache.releases : {};
  // Count unique tools in releases (ignoring _latest suffix duplicate keys)
  const uniqueToolKeys = Object.keys(releases).filter((k) => !k.endsWith("_latest"));
  const count = uniqueToolKeys.length;

  if (!cache || !cache.timestamp || cache.timestamp <= 0 || count === 0) {
    statusEl.textContent = "Update status cache: None (0 items cached)";
    return;
  }

  const ageStr = formatCacheAge(cache.timestamp);
  statusEl.textContent = `Update status cache: Last checked ${ageStr} (${count} items cached)`;
}

export function initToolsCacheControls() {
  const btnCheckAll = document.getElementById("btn-check-all-updates");

  // The status label now lives inside the Manage Tools dialog, so re-render its
  // relative age each time the dialog opens instead of only when a background
  // fetch happens to land.
  const modalEl = document.getElementById("manage-tools-modal");
  if (modalEl && modalEl.dataset.cacheStatusBound !== "true") {
    modalEl.dataset.cacheStatusBound = "true";
    modalEl.addEventListener("show.bs.modal", () => renderToolsCacheStatus());
  }

  if (!toolsCacheControlsInitialized) {
    toolsCacheControlsInitialized = true;
    window.addEventListener("anedikit:tools_cache_updated", () => {
      renderToolsCacheStatus();
    });
  }
  if (!btnCheckAll || btnCheckAll.dataset.cacheBound === "true") return;
  btnCheckAll.dataset.cacheBound = "true";

  btnCheckAll.addEventListener("click", () => {
    clearToolsUpdateCache();
    renderToolsCacheStatus();
    
    // Shimmer sweep while checking for updates and refetching. The outline variant
    // is transparent, so the sheen only reads on a filled button; mirror the
    // Manage Tools in-progress treatment (btn-secondary + btn-shimmer).
    const origHtml = btnCheckAll.innerHTML;
    btnCheckAll.disabled = true;
    btnCheckAll.classList.remove("btn-outline-secondary");
    btnCheckAll.classList.add("btn-secondary", "btn-shimmer");
    btnCheckAll.innerHTML = `<ion-icon name="refresh-outline" class="me-1"></ion-icon>Checking...`;

    // Refresh tools status in UI with forced fresh re-fetch
    refreshToolsUI({ force: true })
      .then(() => {
        renderToolsCacheStatus();
      })
      .catch(() => {
        renderToolsCacheStatus();
      })
      .finally(() => {
        btnCheckAll.disabled = false;
        btnCheckAll.classList.remove("btn-secondary", "btn-shimmer");
        btnCheckAll.classList.add("btn-outline-secondary");
        btnCheckAll.innerHTML = origHtml;
      });
  });
}

