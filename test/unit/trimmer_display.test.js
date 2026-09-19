// Unit Tests for trimmer display refresh (trimmer.js).
// The waveform canvas bitmap is sized from layout at render time; these
// lock the guards that make re-rendering safe to call on window resize.
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleTrimResize, refreshWaveformDisplay } from "../../src/js/trimmer.js";

describe("trimmer display refresh", () => {
  it("should no-op safely with no waveform cached", () => {
    assert.doesNotThrow(() => refreshWaveformDisplay());
    assert.doesNotThrow(() => handleTrimResize());
  });

  it("should skip re-render while the trim view is hidden", () => {
    const view = document.getElementById("view-trim");
    view.classList.add("d-none");
    try {
      assert.doesNotThrow(() => handleTrimResize());
    } finally {
      view.classList.remove("d-none");
    }
  });
});
