// Unit Tests for Global Desktop Keyboard Shortcuts and About Modal Morphing
import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  isTypingTarget,
  handleGlobalKeyDown,
  initAboutModalMorph,
  initKeyboardShortcuts,
} from "../../src/js/shortcuts.js";
import { getCurrentActiveTool, switchTool } from "../../src/js/navigation.js";
import { sharedPlaybackController } from "../../src/js/playback.js";

describe("Shortcuts: isTypingTarget", () => {
  it("should detect INPUT, TEXTAREA, and SELECT elements", () => {
    assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
    assert.equal(isTypingTarget({ tagName: "TEXTAREA" }), true);
    assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
    assert.equal(isTypingTarget({ tagName: "input" }), true);
  });

  it("should detect contentEditable targets", () => {
    assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
    assert.equal(
      isTypingTarget({
        tagName: "SPAN",
        isContentEditable: false,
        closest: (sel) => (sel === "[contenteditable='true']" ? {} : null),
      }),
      true
    );
  });

  it("should return false for regular elements", () => {
    assert.equal(isTypingTarget(null), false);
    assert.equal(isTypingTarget(undefined), false);
    assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
    assert.equal(isTypingTarget({ tagName: "DIV" }), false);
    assert.equal(isTypingTarget({ tagName: "BODY" }), false);
  });
});

describe("Shortcuts: handleGlobalKeyDown accelerators", () => {
  let clickedBrowse = false;
  let clickedExecute = false;
  let toggledPlayback = false;

  beforeEach(() => {
    clickedBrowse = false;
    clickedExecute = false;
    toggledPlayback = false;

    // Setup DOM buttons using getElementById
    const browseBtn = document.getElementById("btn-browse-input");
    browseBtn.disabled = false;
    browseBtn.onclick = () => {
      clickedBrowse = true;
    };

    const executeBtn = document.getElementById("btn-execute");
    executeBtn.disabled = false;
    executeBtn.onclick = () => {
      clickedExecute = true;
    };

    sharedPlaybackController.togglePlayPause = () => {
      toggledPlayback = true;
    };
  });

  it("should trigger file picker on Ctrl+O", () => {
    let prevented = false;
    const event = {
      ctrlKey: true,
      key: "o",
      preventDefault: () => {
        prevented = true;
      },
      target: document.body,
    };
    handleGlobalKeyDown(event);
    assert.equal(clickedBrowse, true);
    assert.equal(prevented, true);
  });

  it("should trigger execution on Ctrl+Enter", () => {
    let prevented = false;
    const event = {
      ctrlKey: true,
      key: "Enter",
      preventDefault: () => {
        prevented = true;
      },
      target: document.body,
    };
    handleGlobalKeyDown(event);
    assert.equal(clickedExecute, true);
    assert.equal(prevented, true);
  });

  it("should trigger execution on Ctrl+E", () => {
    let prevented = false;
    const event = {
      ctrlKey: true,
      key: "e",
      preventDefault: () => {
        prevented = true;
      },
      target: document.body,
    };
    handleGlobalKeyDown(event);
    assert.equal(clickedExecute, true);
    assert.equal(prevented, true);
  });

  it("should navigate to settings on Ctrl+,", () => {
    let prevented = false;
    const event = {
      ctrlKey: true,
      key: ",",
      preventDefault: () => {
        prevented = true;
      },
      target: document.body,
    };
    handleGlobalKeyDown(event);
    assert.equal(prevented, true);
    assert.equal(getCurrentActiveTool(), "settings");
  });

  it("should toggle playback on Space when outside typing input", () => {
    let prevented = false;
    const event = {
      key: " ",
      preventDefault: () => {
        prevented = true;
      },
      target: document.body,
    };
    handleGlobalKeyDown(event);
    assert.equal(toggledPlayback, true);
    assert.equal(prevented, true);
  });

  it("should NOT toggle playback on Space when typing in input", () => {
    let prevented = false;
    const inputEl = document.createElement("input");
    const event = {
      key: " ",
      preventDefault: () => {
        prevented = true;
      },
      target: inputEl,
    };
    handleGlobalKeyDown(event);
    assert.equal(toggledPlayback, false);
    assert.equal(prevented, false);
  });

  it("should dismiss open modal on Escape", () => {
    let modalHidden = false;
    const modalEl = document.getElementById("mock-open-modal");
    modalEl.classList.add("modal", "show");

    // mock querySelector for .modal.show
    const origQuerySelector = document.querySelector;
    document.querySelector = (sel) => {
      if (sel === ".modal.show") return modalEl;
      return origQuerySelector.call(document, sel);
    };

    window.bootstrap = {
      Modal: {
        getInstance: (el) => {
          if (el === modalEl) {
            return {
              hide: () => {
                modalHidden = true;
              },
            };
          }
          return null;
        },
      },
    };

    let prevented = false;
    const event = {
      key: "Escape",
      preventDefault: () => {
        prevented = true;
      },
      target: document.body,
    };
    handleGlobalKeyDown(event);
    assert.equal(modalHidden, true);
    assert.equal(prevented, true);
    document.querySelector = origQuerySelector;
  });
});

describe("Shortcuts: About Modal morphing", () => {
  let modalEl, dialogEl, infoPane, shortcutsPane, showShortcutsBtn, backBtn;

  beforeEach(() => {
    modalEl = document.getElementById("credits-modal");
    dialogEl = document.getElementById("credits-modal-dialog");
    infoPane = document.getElementById("about-pane-info");
    shortcutsPane = document.getElementById("about-pane-shortcuts");
    showShortcutsBtn = document.getElementById("btn-toggle-shortcuts");
    backBtn = document.getElementById("btn-back-to-about");

    infoPane.classList.remove("d-none");
    shortcutsPane.classList.add("d-none");
    dialogEl.style.maxWidth = "400px";

    initAboutModalMorph();
  });

  it("should morph to shortcuts pane on clicking shortcuts button", () => {
    showShortcutsBtn.click();
    assert.equal(infoPane.classList.contains("d-none"), true);
    assert.equal(shortcutsPane.classList.contains("d-none"), false);
    assert.equal(dialogEl.style.maxWidth, "460px");
  });

  it("should morph back to info pane on clicking back button", () => {
    showShortcutsBtn.click();
    backBtn.click();
    assert.equal(shortcutsPane.classList.contains("d-none"), true);
    assert.equal(infoPane.classList.contains("d-none"), false);
    assert.equal(dialogEl.style.maxWidth, "400px");
  });

  it("should reset to info pane on hidden.bs.modal event", () => {
    showShortcutsBtn.click();
    assert.equal(shortcutsPane.classList.contains("d-none"), false);

    modalEl.dispatchEvent({ type: "hidden.bs.modal" });
    assert.equal(shortcutsPane.classList.contains("d-none"), true);
    assert.equal(infoPane.classList.contains("d-none"), false);
    assert.equal(dialogEl.style.maxWidth, "400px");
  });
});
