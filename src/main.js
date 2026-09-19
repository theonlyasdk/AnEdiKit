// AnEdiKit - Modular Application Entry Point
import { getLastYtDlpOutDir } from "./js/storage.js";
import {
  initDragAndDrop,
  getCurrentInputFile,
  getCurrentMediaInfo,
  onMediaChange,
  initTrimmerControls,
  initSavedBatchQueue,
  initSavedImageAiQueue,
  syncMediaDurationToTools,
  syncVideoPreviewForActiveTool,
  initImageLightbox,
} from "./js/media.js";
import { isAudioPath } from "./js/commands.js";
import { initJobRunner } from "./js/runner.js";
import { initNavigation, getCurrentActiveTool } from "./js/navigation.js";
import { initToolsManager, refreshToolsUI } from "./js/tools_manager.js";
import { initThemeManager } from "./js/theme.js";
import { initComparisonModal, openComparisonModal } from "./js/comparison.js";
import { initYtDlpFormatEditor } from "./js/ytdlp_format.js";
import { initYtDlpUrlFixer } from "./js/ytdlp_url.js";
import { initKitsManager, applyUserKitsVisibility } from "./kits/index.js";
import { initM3Switches } from "./js/m3_switch.js";
import {
  initAudioTagsModule,
  initSavedAudioTagQueue,
  getAudioTagQueue,
  addAudioFilesToQueue,
} from "./js/audio_tags.js";

// Submodules
import { formatSpeedValue, syncSpeedSliderUI, syncFormatSpecificUI } from "./js/format_sync.js";
import { updateEstimatesUI } from "./js/estimates.js";
import {
  getSmartOutputFileName,
  truncateMiddlePath,
  getAvailablePathChars,
  debouncedCheckOutputTargetFileExists,
  checkOutputTargetFileExists,
  setOutputFilePath,
  getOutputFilePath,
  refreshOutputFilePathDisplay,
  updateAutoOutputFilename,
} from "./js/output_path.js";
import { renderPlaylistEntries, getPlaylistVideos } from "./js/playlist.js";
import { renderMergeList } from "./js/merge.js";
import { saveActiveModuleState, restoreModuleState, restoreAllModulesState } from "./js/module_state.js";
import { applyTitlebarMode, initCaptionControls } from "./js/window_caption.js";
import {
  getAppSettings,
  populateSettingsUI,
  populateHardwareInfo,
  renderToolsCacheStatus,
} from "./js/app_settings.js";
import { updateExecuteButtonState, updateCommandPreview, bindFormEvents } from "./js/execution.js";
import { initKeyboardShortcuts } from "./js/shortcuts.js";
import { initPdfTools, showPdfToolsHome } from "./js/pdf_tools.js";

// Re-export public module APIs for backward compatibility
export {
  initKeyboardShortcuts,
  saveActiveModuleState,
  restoreModuleState,
  restoreAllModulesState,
  renderPlaylistEntries,
  getSmartOutputFileName,
  truncateMiddlePath,
  getAvailablePathChars,
  debouncedCheckOutputTargetFileExists,
  checkOutputTargetFileExists,
  setOutputFilePath,
  getOutputFilePath,
  refreshOutputFilePathDisplay,
  updateAutoOutputFilename,
  updateExecuteButtonState,
  updateEstimatesUI,
  formatSpeedValue,
  syncSpeedSliderUI,
  syncFormatSpecificUI,
  populateHardwareInfo,
  applyTitlebarMode,
};

// App Initialization
// Session-restore probes must not auto-import into the audio queue: the
// queue restores itself, and a restore probe racing it flashes the
// "already imported" duplicate notice with the blur overlay. Arm auto-import
// on the first real user gesture instead — every genuine pick (file dialog,
// drag-drop, keyboard) follows one.
let audioAutoImportArmed = false;
function armAudioAutoImport() {
  if (audioAutoImportArmed) return;
  audioAutoImportArmed = true;
  window.removeEventListener("pointerdown", armAudioAutoImport, true);
  window.removeEventListener("keydown", armAudioAutoImport, true);
  window.removeEventListener("dragenter", armAudioAutoImport, true);
  window.removeEventListener("drop", armAudioAutoImport, true);
}
document.addEventListener("DOMContentLoaded", () => {
  window.addEventListener("pointerdown", armAudioAutoImport, true);
  window.addEventListener("keydown", armAudioAutoImport, true);
  window.addEventListener("dragenter", armAudioAutoImport, true);
  window.addEventListener("drop", armAudioAutoImport, true);
  initThemeManager();
  populateSettingsUI();
  const appSettings = getAppSettings();
  if (appSettings.useSystemTitlebar === undefined) appSettings.useSystemTitlebar = false;
  document.documentElement.classList.toggle("hide-scrollbars-on-hover", appSettings.hideScrollbarsOnHover === true);
  initCaptionControls();
  applyTitlebarMode(appSettings.useSystemTitlebar);
  applyUserKitsVisibility(appSettings.enableUserKits === true);
  restoreAllModulesState();

  const ytdlpOutInput = document.getElementById("ytdlp-output-dir");
  if (ytdlpOutInput) {
    ytdlpOutInput.value = getLastYtDlpOutDir() || appSettings.outputDir || "C:\\Users\\User\\Downloads";
  }

  initYtDlpFormatEditor();
  initYtDlpUrlFixer(updateCommandPreview, () => getAppSettings());
  initJobRunner();
  initTrimmerControls();
  initSavedBatchQueue();
  initSavedImageAiQueue();
  initDragAndDrop((mediaInfo) => {
    if (mediaInfo) {
      syncMediaDurationToTools(mediaInfo);
      syncVideoPreviewForActiveTool(getCurrentActiveTool());
    }
    updateAutoOutputFilename(true);
    updateCommandPreview();
  });
  bindFormEvents();
  onMediaChange((info, filePath) => {
    if (getCurrentActiveTool() === "audio_tags") {
      if (filePath && isAudioPath(filePath) && audioAutoImportArmed) {
        addAudioFilesToQueue([filePath]);
      }
    }
    updateAutoOutputFilename(true);
    updateCommandPreview();
  });

  // A probe finishing after the preview was built can change stream-copy
  // containers and audio/video handling: rebuild the preview for the file
  // that was just probed when it is still the current input.
  window.addEventListener("anedikit:media_probed", (e) => {
    try {
      const probed = e?.detail?.filePath;
      if (probed && probed === getCurrentInputFile()) {
        updateCommandPreview();
      }
    } catch (_) {}
  });

  async function tryAutoPasteYtDlpUrl() {
    const settings = getAppSettings();
    if (settings.ytdlpAutoPaste === false) return;
    const currentTool = getCurrentActiveTool();
    if (!currentTool || !currentTool.startsWith("ytdlp_")) return;

    const ytdlpUrlInput = document.getElementById("ytdlp-url-input");
    if (!ytdlpUrlInput) return;

    try {
      const text = await navigator.clipboard.readText();
      if (text && typeof text === "string") {
        const trimmed = text.trim();
        if (
          (trimmed.startsWith("http://") || trimmed.startsWith("https://")) &&
          (trimmed.includes("youtube.com") ||
            trimmed.includes("youtu.be") ||
            trimmed.includes("twitch.tv") ||
            trimmed.includes("twitter.com") ||
            trimmed.includes("x.com") ||
            trimmed.includes("tiktok.com") ||
            trimmed.includes("vimeo.com") ||
            trimmed.includes("soundcloud.com") ||
            trimmed.includes("instagram.com"))
        ) {
          if (!ytdlpUrlInput.value || ytdlpUrlInput.value !== trimmed) {
            ytdlpUrlInput.value = trimmed;
            updateCommandPreview();
          }
        }
      }
    } catch (_) {}
  }

  window.addEventListener("focus", () => {
    tryAutoPasteYtDlpUrl();
  });

  let navPendingRaf = null;
  let settingsRefreshTimeout = null;

  initNavigation((toolId) => {
    if (toolId === "pdf") {
      showPdfToolsHome();
    }
    restoreModuleState(toolId);
    const mediaInfo = getCurrentMediaInfo();
    if (mediaInfo) {
      syncVideoPreviewForActiveTool(toolId);
    }
    const playlistPanel = document.getElementById("playlist-entries-panel");
    if (playlistPanel) {
      if (toolId === "ytdlp_playlist" && getPlaylistVideos().length > 0) {
        playlistPanel.classList.remove("d-none");
      } else {
        playlistPanel.classList.add("d-none");
      }
    }
    if (toolId && toolId.startsWith("ytdlp_")) {
      setTimeout(tryAutoPasteYtDlpUrl, 50);
    }
    if (toolId === "audio_tags" && audioAutoImportArmed) {
      const cur = getCurrentInputFile();
      if (cur && isAudioPath(cur) && getAudioTagQueue().length === 0) {
        addAudioFilesToQueue([cur]);
      }
    }
    if (toolId === "settings") {
      renderToolsCacheStatus();
      if (settingsRefreshTimeout) clearTimeout(settingsRefreshTimeout);
      settingsRefreshTimeout = setTimeout(() => {
        if (getCurrentActiveTool() === "settings") {
          refreshToolsUI();
        }
      }, 150);
    }
    syncFormatSpecificUI(toolId);

    if (navPendingRaf) cancelAnimationFrame(navPendingRaf);
    navPendingRaf = requestAnimationFrame(() => {
      navPendingRaf = null;
      updateAutoOutputFilename();
      updateCommandPreview();
    });
  });

  initAudioTagsModule(() => {
    updateExecuteButtonState();
    updateCommandPreview();
  });
  initSavedAudioTagQueue();

  initComparisonModal();
  // Exposed like window.switchAppTool / window.renderActiveKitIde so e2e and
  // screenshot tooling can open the comparison view without a finished job.
  window.openComparisonModal = openComparisonModal;
  initImageLightbox();
  initToolsManager();
  initKitsManager();
  initM3Switches();
  initPdfTools();
  initKeyboardShortcuts();
  // NOTE: empty-state click/ripple wiring lives in renderBatchQueueUI()
  // (media.js), renderImageAiQueueUI() (image_queue.js) and renderMergeList()
  // below. Do NOT attach extra listeners here — that opened 2 file dialogs
  // in a row for a single click.
  renderMergeList();
  syncFormatSpecificUI();
  updateAutoOutputFilename(true);
  updateCommandPreview();
});
