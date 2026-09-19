// Unit Tests for AnEdiKit Modular Submodules
import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Import submodules to test
import { formatSpeedValue, SPEED_PRESETS, syncFormatSpecificUI, syncSpeedSliderUI } from "../../src/js/format_sync.js";
import {
  truncateMiddlePath,
  getAvailablePathChars,
  getSmartOutputFileName,
  setOutputFilePath,
  getOutputFilePath,
  getUserHasCustomOutputName,
  setUserHasCustomOutputName,
  updateAutoOutputFilename,
} from "../../src/js/output_path.js";
import {
  escapeHtml,
  playlistRowHtml,
  getPlaylistVideos,
  setPlaylistVideos,
  clearPlaylist,
  isPlaylistFetching,
  getFetchedPlaylistUrl,
  setFetchedPlaylistUrl,
} from "../../src/js/playlist.js";
import { getMergeFiles, setMergeFiles, clearMergeFiles } from "../../src/js/merge.js";
import { applyTitlebarMode } from "../../src/js/window_caption.js";
import { getAppSettings, setAppSettings, initToolsCacheControls } from "../../src/js/app_settings.js";
import { updateEstimatesUI } from "../../src/js/estimates.js";
import { saveActiveModuleState, restoreModuleState, restoreAllModulesState } from "../../src/js/module_state.js";
import { updateExecuteButtonState, updateCommandPreview } from "../../src/js/execution.js";
import { switchTool, updateSidebarScrollShadows, updateSidebarIndicator } from "../../src/js/navigation.js";
import { formatPdfFileSize, formatPdfDimensions } from "../../src/js/pdf_tools.js";
import * as mainModule from "../../src/main.js";

describe("Submodule: format_sync.js", () => {
  it("should correctly format speed values", () => {
    assert.equal(formatSpeedValue(2), "2.0");
    assert.equal(formatSpeedValue(1), "1.0");
    assert.equal(formatSpeedValue(4), "4.0");
    assert.equal(formatSpeedValue(0.25), "0.25");
    assert.equal(formatSpeedValue(1.25), "1.25");
    assert.equal(formatSpeedValue(0.75), "0.75");
    assert.equal(formatSpeedValue("2"), "2.0");
    assert.equal(formatSpeedValue("invalid"), "2.0");
    assert.equal(formatSpeedValue(NaN), "2.0");
  });

  it("should contain standard speed presets", () => {
    assert.ok(SPEED_PRESETS.includes("0.25"));
    assert.ok(SPEED_PRESETS.includes("1"));
    assert.ok(SPEED_PRESETS.includes("2"));
    assert.ok(SPEED_PRESETS.includes("16"));
  });

  it("should sync format specific UI without error", () => {
    assert.doesNotThrow(() => {
      syncFormatSpecificUI("convert");
      syncFormatSpecificUI("extract_audio");
      syncFormatSpecificUI("gif_frames");
      syncFormatSpecificUI("speed_motion");
      syncFormatSpecificUI("loop_duration");
      syncFormatSpecificUI("normalize");
      syncFormatSpecificUI("bg_remover");
      syncFormatSpecificUI("vectorizer");
    });
  });
});

describe("Submodule: output_path.js", () => {
  it("should truncate paths with middle ellipsis when exceeding maxChars", () => {
    const shortPath = "C:\\test\\file.mp4";
    assert.equal(truncateMiddlePath(shortPath, 50), shortPath);

    const longWinPath = "C:\\Users\\User\\Documents\\VeryLongDirectoryPathName\\SubFolder\\AnotherFolder\\my_video_file.mp4";
    const truncatedWin = truncateMiddlePath(longWinPath, 45);
    assert.ok(truncatedWin.length <= 47);
    assert.ok(truncatedWin.includes("…"));
    assert.ok(truncatedWin.startsWith("C:\\"));
    assert.ok(truncatedWin.endsWith("my_video_file.mp4"));

    const longUnixPath = "/home/user/very/long/path/with/many/nested/subdirectories/clip.mp4";
    const truncatedUnix = truncateMiddlePath(longUnixPath, 35);
    assert.ok(truncatedUnix.length <= 37);
    assert.ok(truncatedUnix.includes("…"));
    assert.ok(truncatedUnix.startsWith("/home/"));
    assert.ok(truncatedUnix.endsWith("clip.mp4"));
  });

  it("should calculate available path characters based on width", () => {
    const el = document.createElement("input");
    el.clientWidth = 500;
    const chars = getAvailablePathChars(el);
    assert.ok(chars >= 25);
    assert.ok(typeof chars === "number");
  });

  it("should compute smart output file names for each tool", () => {
    const input = "C:\\Videos\\test_sample.mp4";

    assert.equal(getSmartOutputFileName(input, "convert"), "test_sample_converted.mp4");
    assert.equal(getSmartOutputFileName(input, "extract_audio"), "test_sample_extracted.mp3");
    assert.equal(getSmartOutputFileName(input, "trim"), "test_sample_trimmed.mp4");
    assert.equal(getSmartOutputFileName(input, "compress"), "test_sample_compressed.mp4");
    assert.equal(getSmartOutputFileName(input, "compress_audio"), "test_sample_compressed.opus");
    assert.equal(getSmartOutputFileName("test.mp3", "audio_tags"), "test_tagged.mp3");
    assert.equal(getSmartOutputFileName(input, "merge"), "test_sample_merged.mp4");
    assert.equal(getSmartOutputFileName(input, "mute_replace"), "test_sample_audio_edit.mp4");
    assert.equal(getSmartOutputFileName(input, "bg_remover"), "test_sample_nobg.png");
    assert.equal(getSmartOutputFileName(input, "vectorizer"), "test_sample_vector.svg");
    assert.equal(getSmartOutputFileName(input, "icon_generator"), "test_sample_icons");
    assert.equal(getSmartOutputFileName(input, "unknown_tool"), "test_sample_out.mp4");
  });

  it("should manage output file path state", () => {
    setOutputFilePath("C:\\Videos\\target.mp4");
    assert.equal(getOutputFilePath(), "C:\\Videos\\target.mp4");

    setUserHasCustomOutputName(true);
    assert.equal(getUserHasCustomOutputName(), true);
    setUserHasCustomOutputName(false);
    assert.equal(getUserHasCustomOutputName(), false);
  });
});

describe("Submodule: playlist.js", () => {
  it("should escape HTML entities correctly", () => {
    assert.equal(escapeHtml('<script>alert("test & fun")</script>'), "&lt;script&gt;alert(&quot;test &amp; fun&quot;)&lt;/script&gt;");
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
  });

  it("should generate playlist row HTML with proper attributes", () => {
    const item = {
      index: 1,
      title: "Sample Video",
      url: "https://example.com/watch?v=123",
      duration_string: "03:45",
      checked: true,
    };
    const html = playlistRowHtml(item);
    assert.ok(html.includes('data-index="1"'));
    assert.ok(html.includes("checked"));
    assert.ok(html.includes("Sample Video"));
    assert.ok(html.includes("03:45"));
  });

  it("should manage playlist videos state", () => {
    setPlaylistVideos([{ index: 1, title: "Test 1" }, { index: 2, title: "Test 2" }]);
    assert.equal(getPlaylistVideos().length, 2);

    setFetchedPlaylistUrl("https://example.com/playlist");
    assert.equal(getFetchedPlaylistUrl(), "https://example.com/playlist");

    clearPlaylist();
    assert.equal(getPlaylistVideos().length, 0);
    assert.equal(getFetchedPlaylistUrl(), "");
  });
});

describe("Submodule: merge.js", () => {
  it("should manage merge files list", () => {
    clearMergeFiles();
    assert.equal(getMergeFiles().length, 0);

    setMergeFiles(["file1.mp4", "file2.mp4"]);
    assert.equal(getMergeFiles().length, 2);
    assert.equal(getMergeFiles()[0], "file1.mp4");

    clearMergeFiles();
    assert.equal(getMergeFiles().length, 0);
  });
});

describe("Submodule: window_caption.js", () => {
  it("should toggle titlebar mode classes", () => {
    applyTitlebarMode(true);
    assert.ok(document.body.classList.contains("with-system-titlebar"));

    applyTitlebarMode(false);
    assert.ok(!document.body.classList.contains("with-system-titlebar"));
  });
});

describe("Submodule: app_settings.js", () => {
  it("should get and set app settings", () => {
    const initial = getAppSettings();
    assert.ok(initial);

    setAppSettings({ ...initial, outputDir: "C:\\CustomOut" });
    assert.equal(getAppSettings().outputDir, "C:\\CustomOut");
  });

  it("should init tools cache controls idempotently without error", () => {
    assert.doesNotThrow(() => {
      initToolsCacheControls();
      initToolsCacheControls();
    });
  });
});

describe("Submodule: estimates.js", () => {
  it("should update estimates UI without error for various tools", () => {
    assert.doesNotThrow(() => {
      updateEstimatesUI("convert");
      updateEstimatesUI("extract_audio");
      updateEstimatesUI("trim");
      updateEstimatesUI("speed_motion");
      updateEstimatesUI("aspect_crop");
      updateEstimatesUI("stabilize");
      updateEstimatesUI("loop_duration");
      updateEstimatesUI("normalize");
      updateEstimatesUI("merge");
      updateEstimatesUI("mute_replace");
      updateEstimatesUI("gif_frames");
      updateEstimatesUI("custom");
    });
  });

  it("should update convert estimate values properly", () => {
    const cvtTarget = document.getElementById("cvt-est-target");
    const cvtVbitrate = document.getElementById("cvt-est-vbitrate");
    const cvtSize = document.getElementById("cvt-est-size");

    updateEstimatesUI("convert");
    assert.ok(cvtTarget.textContent.length > 0);
    assert.ok(cvtVbitrate.textContent.length > 0);
    assert.ok(cvtSize.textContent.length > 0);
  });
});

describe("Submodule: module_state.js", () => {
  it("should handle saving and restoring module form states", () => {
    // Setup mock view container and elements
    const viewEl = document.getElementById("view-convert");
    const testInput = document.createElement("input");
    testInput.id = "cvt-container";
    testInput.value = "mkv";
    viewEl.querySelectorAll = () => [testInput];

    assert.doesNotThrow(() => {
      saveActiveModuleState("convert");
      restoreModuleState("convert");
      restoreAllModulesState();
    });
  });
});

describe("Submodule: execution.js", () => {
  it("should update execute button state and command preview", () => {
    const btnExecute = document.getElementById("btn-execute");
    assert.ok(btnExecute);

    assert.doesNotThrow(() => {
      updateExecuteButtonState();
      updateCommandPreview();
    });
  });
});

describe("Main Module: exports verification", () => {
  it("should re-export all public API functions for backward compatibility", () => {
    const requiredExports = [
      "saveActiveModuleState",
      "restoreModuleState",
      "restoreAllModulesState",
      "renderPlaylistEntries",
      "getSmartOutputFileName",
      "truncateMiddlePath",
      "getAvailablePathChars",
      "debouncedCheckOutputTargetFileExists",
      "checkOutputTargetFileExists",
      "setOutputFilePath",
      "getOutputFilePath",
      "refreshOutputFilePathDisplay",
      "updateAutoOutputFilename",
      "updateExecuteButtonState",
      "updateEstimatesUI",
      "formatSpeedValue",
      "syncSpeedSliderUI",
      "syncFormatSpecificUI",
      "populateHardwareInfo",
      "applyTitlebarMode",
    ];

    for (const exp of requiredExports) {
      assert.ok(typeof mainModule[exp] === "function", `Expected ${exp} to be exported as a function`);
    }
  });
});

describe("Navigation: Workspace Tool Switching", () => {
  it("should switch views cleanly without distracting animation classes on tool-view-container", () => {
    switchTool("convert");
    switchTool("trim");
    const container = document.getElementById("tool-view-container");
    assert.equal(container.classList.contains("view-slide-from-bottom"), false);
    assert.equal(container.classList.contains("view-slide-from-top"), false);
    assert.equal(container.classList.contains("view-material-zoom"), false);
  });
});

describe("Navigation: Sidebar Scroll Shadows and Indicator", () => {
  it("should update scroll shadows according to scroll position", () => {
    const scrollContainer = document.getElementById("sidebar-scroll-container");
    const mainSidebar = document.getElementById("main-sidebar");
    assert.ok(scrollContainer);
    assert.ok(mainSidebar);

    // Mock scroll properties: at top, scrollable
    Object.defineProperty(scrollContainer, "scrollTop", { value: 0, configurable: true });
    Object.defineProperty(scrollContainer, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(scrollContainer, "clientHeight", { value: 500, configurable: true });

    updateSidebarScrollShadows();
    assert.equal(mainSidebar.classList.contains("has-scroll-top"), false);
    assert.equal(mainSidebar.classList.contains("has-scroll-bottom"), true);

    // Scrolled to middle
    Object.defineProperty(scrollContainer, "scrollTop", { value: 200, configurable: true });
    updateSidebarScrollShadows();
    assert.equal(mainSidebar.classList.contains("has-scroll-top"), true);
    assert.equal(mainSidebar.classList.contains("has-scroll-bottom"), true);

    // Scrolled to bottom
    Object.defineProperty(scrollContainer, "scrollTop", { value: 500, configurable: true });
    updateSidebarScrollShadows();
    assert.equal(mainSidebar.classList.contains("has-scroll-top"), true);
    assert.equal(mainSidebar.classList.contains("has-scroll-bottom"), false);
  });

  it("should position sidebar indicator with left, width, and height matching the button", () => {
    const indicator = document.getElementById("sidebar-indicator");
    const scrollContainer = document.getElementById("sidebar-scroll-container");
    const btn = document.querySelector("#tool-nav button[data-tool='convert']");
    assert.ok(indicator);
    assert.ok(scrollContainer);
    assert.ok(btn);

    // Mock bounding rects
    scrollContainer.getBoundingClientRect = () => ({ top: 50, left: 10, width: 280, height: 600 });
    btn.getBoundingClientRect = () => ({ top: 80, left: 18, width: 264, height: 40 });
    Object.defineProperty(scrollContainer, "scrollTop", { value: 0, configurable: true });

    updateSidebarIndicator(btn);
    assert.equal(indicator.style.transform, "translateY(30px)");
    assert.equal(indicator.style.left, "8px");
    assert.equal(indicator.style.width, "264px");
    assert.equal(indicator.style.height, "40px");
    assert.equal(indicator.style.opacity, "1");
  });
});

describe("Submodule: pdf_tools metadata helpers", () => {
  it("should correctly format PDF file sizes", () => {
    assert.equal(formatPdfFileSize(500), "500 B");
    assert.equal(formatPdfFileSize(2048), "2.0 KB");
    assert.equal(formatPdfFileSize(1048576 * 2.5), "2.50 MB");
    assert.equal(formatPdfFileSize(null), "—");
    assert.equal(formatPdfFileSize(NaN), "—");
  });

  it("should correctly format PDF dimensions and detect standard paper sizes", () => {
    assert.equal(formatPdfDimensions(595.28, 841.89), "595 × 842 pt (A4)");
    assert.equal(formatPdfDimensions(841.89, 595.28), "842 × 595 pt (A4)");
    assert.equal(formatPdfDimensions(612, 792), "612 × 792 pt (Letter)");
    assert.equal(formatPdfDimensions(612, 1008), "612 × 1008 pt (Legal)");
    assert.equal(formatPdfDimensions(420, 595), "420 × 595 pt (A5)");
    assert.equal(formatPdfDimensions(400, 300), "400 × 300 pt");
    assert.equal(formatPdfDimensions(null, null), "—");
  });
});

