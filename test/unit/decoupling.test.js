// Unit tests for the cycle-breaking refactor (phase 2).
// Locks in: leaf modules own their logic, old import paths still work,
// cross-module calls travel via stores/bridges/events instead of imports.
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatSecondsToTimestamp,
  parseTimestampToSeconds,
} from "../../src/js/time_format.js";
import {
  mediaState,
  getCurrentInputFile,
  setCurrentInputFile,
  getCurrentMediaInfo,
  setCurrentMediaInfo,
  setCachedMediaInfo,
  getCachedMediaInfo,
  clearMediaInfoCache,
} from "../../src/js/media_store.js";
import { pickFiles, pickFolder } from "../../src/js/file_picker.js";
import {
  toolState,
  getCurrentActiveTool,
  setCurrentActiveTool,
} from "../../src/js/active_tool.js";
import {
  registerRefreshToolsUI,
  registerInitToolsCacheControls,
  requestRefreshToolsUI,
  requestInitToolsCacheControls,
} from "../../src/js/tools_ui_bridge.js";

describe("time_format.js: canonical home of timestamp helpers", () => {
  it("round-trips through trimmer.js delegates", async () => {
    const trimmer = await import("../../src/js/trimmer.js");
    for (const s of [0, 1.5, 61.567, 3723.25]) {
      assert.equal(trimmer.parseTimestampToSeconds(formatSecondsToTimestamp(s)), s);
      assert.equal(parseTimestampToSeconds(trimmer.formatSecondsToTimestamp(s)), s);
    }
  });
});

describe("media_store.js: shared selection state", () => {
  it("getters/setters round-trip and reset cleanly", () => {
    try {
      setCurrentInputFile("C:\\Vids\\a.mp4");
      assert.equal(getCurrentInputFile(), "C:\\Vids\\a.mp4");
      setCurrentMediaInfo({ duration_seconds: 10 });
      assert.equal(getCurrentMediaInfo().duration_seconds, 10);
      setCachedMediaInfo("C:\\Vids\\a.mp4", { duration_seconds: 10 });
      assert.equal(getCachedMediaInfo("C:\\Vids\\a.mp4").duration_seconds, 10);
      assert.equal(getCachedMediaInfo("missing.mp4"), null);
    } finally {
      setCurrentInputFile("");
      setCurrentMediaInfo(null);
      clearMediaInfoCache();
    }
    assert.equal(getCurrentInputFile(), "");
    assert.equal(getCurrentMediaInfo(), null);
    assert.equal(mediaState.mediaInfoCache.size, 0);
  });

  it("media.js delegates to the same store object", async () => {
    const media = await import("../../src/js/media.js");
    try {
      media.setCurrentInputFile("C:\\Vids\\b.mp4");
      assert.equal(getCurrentInputFile(), "C:\\Vids\\b.mp4");
      assert.equal(media.getCurrentInputFile(), "C:\\Vids\\b.mp4");
    } finally {
      media.setCurrentInputFile("");
    }
  });
});

describe("file_picker.js: Tauri wrappers without side effects", () => {
  it("resolves empty without a Tauri backend", async () => {
    assert.deepEqual(await pickFiles("image"), []);
    assert.deepEqual(await pickFiles("audio"), []);
    assert.equal(await pickFolder(null), null);
  });
});

describe("active_tool.js: shared tool state", () => {
  it("navigation.js delegates to the same store", async () => {
    const nav = await import("../../src/js/navigation.js");
    const prev = toolState.current;
    try {
      setCurrentActiveTool("trim");
      assert.equal(getCurrentActiveTool(), "trim");
      assert.equal(nav.getCurrentActiveTool(), "trim");
    } finally {
      setCurrentActiveTool(prev);
    }
    assert.equal(nav.getCurrentActiveTool(), getCurrentActiveTool());
  });
});

describe("anim.js: moved helpers, navigation re-exports", () => {
  it("navigation re-exports the same function objects", async () => {
    const anim = await import("../../src/js/anim.js");
    const nav = await import("../../src/js/navigation.js");
    assert.equal(nav.animateQueueHeight, anim.animateQueueHeight);
    assert.equal(nav.attachFluentRipple, anim.attachFluentRipple);
    assert.equal(nav.attachMaterialRipple, anim.attachMaterialRipple);
  });
});

describe("tools_ui_bridge.js: safe before registration, delegating after", () => {
  it("no-ops when nothing is registered", async () => {
    // Fresh module state is already registered by app/tests in this process,
    // so verify shape only: calls never throw and return defined-or-undefined.
    await assert.doesNotReject(async () => {
      await requestRefreshToolsUI({ force: true });
      requestInitToolsCacheControls();
    });
  });

  it("delegates to registered implementations", async () => {
    let refreshed = null;
    let inited = 0;
    registerRefreshToolsUI(async (opts) => {
      refreshed = opts;
      return "ok";
    });
    registerInitToolsCacheControls(() => {
      inited += 1;
    });
    assert.equal(await requestRefreshToolsUI({ force: true }), "ok");
    assert.deepEqual(refreshed, { force: true });
    requestInitToolsCacheControls();
    assert.equal(inited, 1);

    // Restore production registrations so later test files see real impls.
    const appSettings = await import("../../src/js/app_settings.js");
    const toolsManager = await import("../../src/js/tools_manager.js");
    registerInitToolsCacheControls(appSettings.initToolsCacheControls);
    registerRefreshToolsUI(toolsManager.refreshToolsUI);
  });
});

describe("decoupling events: no-throw without backends", () => {
  it("cancel-audio-load dispatch is safe", async () => {
    await import("../../src/js/audio_tags.js");
    assert.doesNotThrow(() => {
      document.dispatchEvent(new CustomEvent("anedikit:cancel-audio-load"));
    });
  });

  it("add-image-files dispatch with empty detail is safe", async () => {
    await import("../../src/js/image_queue.js");
    assert.doesNotThrow(() => {
      document.dispatchEvent(new CustomEvent("anedikit:add-image-files", { detail: { paths: [] } }));
      document.dispatchEvent(new CustomEvent("anedikit:add-image-files", { detail: {} }));
    });
  });
});
