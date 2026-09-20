// Unit Tests for copy_anim.js (transitions-polish motion token copy confirmation).
import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { animateCopyConfirm } from "../../src/js/copy_anim.js";

describe("copy_anim.js: animateCopyConfirm", () => {
  let btn;
  let icon;

  beforeEach(() => {
    btn = document.createElement("button");
    btn.id = "test-btn";
    btn.className = "btn btn-outline-secondary";
    icon = document.createElement("ion-icon");
    icon.setAttribute("name", "copy-outline");
    btn.appendChild(icon);
    document.documentElement.classList.remove("no-animations");
  });

  it("should no-op safely when iconEl is null or undefined", async () => {
    await assert.doesNotReject(async () => {
      await animateCopyConfirm(null);
      await animateCopyConfirm(undefined);
    });
  });

  it("should preserve the DOM element identity without removing or replacing the node", async () => {
    const originalIconRef = icon;
    const promise = animateCopyConfirm(icon, { holdMs: 50 });
    
    // Icon must still be in the DOM attached to the button
    assert.equal(btn.querySelector("ion-icon"), originalIconRef);
    assert.equal(icon.parentElement, btn);
    
    await promise;
    
    // Icon reference must still be the exact same DOM node
    assert.equal(btn.querySelector("ion-icon"), originalIconRef);
    assert.equal(icon.getAttribute("name"), "copy-outline");
  });

  it("should swap icon to confirmIcon and restore original name under reduced motion", async () => {
    document.documentElement.classList.add("no-animations");
    
    animateCopyConfirm(icon, { confirmIcon: "checkmark-outline", holdMs: 60 });
    assert.equal(icon.getAttribute("name"), "checkmark-outline");
    assert.ok(icon.classList.contains("text-success"));
    
    await new Promise((resolve) => setTimeout(resolve, 90));
    assert.equal(icon.getAttribute("name"), "copy-outline");
    assert.ok(!icon.classList.contains("text-success"));
  });

  it("should resolve text-white for buttons with btn-success / copied class", async () => {
    document.documentElement.classList.add("no-animations");
    btn.classList.add("btn-success");
    
    const promise = animateCopyConfirm(icon, { confirmIcon: "checkmark-outline", holdMs: 50 });
    assert.ok(icon.classList.contains("text-white"));
    assert.ok(!icon.classList.contains("text-success"));
    
    await promise;
    assert.ok(!icon.classList.contains("text-white"));
  });

  it("should prevent concurrent animations while _copyBusy is true", async () => {
    icon._copyBusy = true;
    const initialName = icon.getAttribute("name");
    
    await animateCopyConfirm(icon, { confirmIcon: "checkmark-outline", holdMs: 50 });
    assert.equal(icon.getAttribute("name"), initialName);
  });

  it("should invoke element.animate with transitions-polish motion token parameters", async () => {
    const animatedCalls = [];
    icon.animate = function (keyframes, options) {
      animatedCalls.push({ keyframes, options });
      return {
        finished: Promise.resolve(),
        cancel: () => {},
      };
    };

    await animateCopyConfirm(icon, { confirmIcon: "checkmark-outline", holdMs: 30 });
    
    assert.ok(animatedCalls.length >= 4, "Should have executed 4 animation phases");
    
    // Phase 1: exit (150ms --duration-quick)
    assert.equal(animatedCalls[0].options.duration, 150);
    // Phase 2: checkmark pop in (250ms --duration-fast with bounce)
    assert.equal(animatedCalls[1].options.duration, 250);
    // Phase 3: checkmark exit (150ms --duration-quick)
    assert.equal(animatedCalls[2].options.duration, 150);
    // Phase 4: original icon return (250ms --duration-fast)
    assert.equal(animatedCalls[3].options.duration, 250);
    
    assert.equal(icon.getAttribute("name"), "copy-outline");
  });
});
