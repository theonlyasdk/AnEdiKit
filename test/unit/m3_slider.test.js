// Unit Tests for Material 3 Slider Module
import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { syncM3Slider, bindM3Slider, initM3Sliders } from "../../src/js/m3_slider.js";

describe("Submodule: m3_slider.js", () => {
  it("should calculate and set --range-progress correctly for various min/max/value ranges", () => {
    const el = document.createElement("input");
    el.type = "range";
    el.min = "0";
    el.max = "100";
    el.value = "25";

    syncM3Slider(el);
    assert.equal(el.style.getPropertyValue("--range-progress"), "25.00%");

    el.value = "75";
    syncM3Slider(el);
    assert.equal(el.style.getPropertyValue("--range-progress"), "75.00%");

    el.min = "2";
    el.max = "30";
    el.value = "16"; // (16 - 2) / (30 - 2) = 14 / 28 = 50%
    syncM3Slider(el);
    assert.equal(el.style.getPropertyValue("--range-progress"), "50.00%");

    el.min = "-50";
    el.max = "50";
    el.value = "0"; // (0 - (-50)) / 100 = 50%
    syncM3Slider(el);
    assert.equal(el.style.getPropertyValue("--range-progress"), "50.00%");
  });

  it("should skip .trim-range-slider to avoid altering specialized video trimmer", () => {
    const el = document.createElement("input");
    el.type = "range";
    el.classList.add("trim-range-slider");
    el.value = "80";

    syncM3Slider(el);
    assert.equal(el.style.getPropertyValue("--range-progress"), "");
  });

  it("should bind event listeners and update --range-progress on input events", () => {
    const el = document.createElement("input");
    el.type = "range";
    el.min = "0";
    el.max = "200";
    el.value = "50";

    bindM3Slider(el);
    assert.equal(el.style.getPropertyValue("--range-progress"), "25.00%");

    el.value = "100";
    el.dispatchEvent(new Event("input"));
    assert.equal(el.style.getPropertyValue("--range-progress"), "50.00%");
  });

  it("should initialize all sliders in root container", () => {
    const container = document.createElement("div");
    const s1 = document.createElement("input");
    s1.type = "range";
    s1.min = "0";
    s1.max = "10";
    s1.value = "10";
    container.appendChild(s1);

    initM3Sliders(container);
    assert.equal(s1.style.getPropertyValue("--range-progress"), "100.00%");
  });
});
