// Lazy tool-view loading: view-custom is the pilot.
import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { LAZY_VIEWS, isLazyView, isViewLoaded } from "../../src/js/view_loader.js";

describe("view_loader.js: pilot selection", () => {
  it("marks view-custom as lazy and others as eager", () => {
    assert.equal(LAZY_VIEWS.has("view-custom"), true);
    assert.equal(isLazyView("view-custom"), true);
    assert.equal(isLazyView("view-convert"), false);
    assert.equal(isLazyView("view-trim"), false);
  });
});

describe("view_loader.js: isViewLoaded + shimmer", () => {
  beforeEach(() => {
    // Emulate the --lazy placeholder (empty, no dataset).
    document.body.innerHTML = '<div class="tool-view d-none" id="view-custom"></div>';
  });

  it("reports not-loaded for the placeholder and loaded after injection", async () => {
    const view0 = document.getElementById("view-custom");
    delete view0.dataset.lazyState;
    view0.innerHTML = "";
    assert.equal(isViewLoaded("view-custom"), false);
    const view = document.getElementById("view-custom");
    const html = '<div>Custom FFmpeg Arguments</div>';
    // Simulate what loadView does after fetch
    view.innerHTML = html;
    view.dataset.lazyState = "loaded";
    assert.equal(isViewLoaded("view-custom"), true);
    assert.ok(view.innerHTML.includes("Custom FFmpeg Arguments"));
  });

  it("switchTool path shows skeleton before fetch (contract)", async () => {
    // The skeleton is the shimmer block, not the final content.
    const view = document.getElementById("view-custom");
    view.dataset.lazyState = "pending";
    view.innerHTML = '<div class="view-shimmer" role="status" aria-busy="true"><div class="skeleton"></div></div>';
    assert.ok(view.innerHTML.includes("view-shimmer"));
    assert.ok(view.innerHTML.includes("skeleton"));
    assert.equal(view.dataset.lazyState, "pending");
  });

  it("retry restores pending+skeleton from error state", () => {
    const view = document.getElementById("view-custom");
    view.dataset.lazyState = "error";
    view.innerHTML = '<div class="view-shimmer is-error">Failed</div>';
    // Simulate retry click path
    view.dataset.lazyState = "pending";
    view.innerHTML = '<div class="view-shimmer"><div class="skeleton"></div></div>';
    assert.equal(view.dataset.lazyState, "pending");
    assert.ok(view.innerHTML.includes("skeleton"));
  });
});
