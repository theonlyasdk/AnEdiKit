// Unit tests for listener + error hygiene helpers (top-3 fix).
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { bindKeyed, unbindAll } from "../../src/js/dom_bind.js";
import { reportError } from "../../src/js/errors.js";

describe("dom_bind.js: keyed idempotent binding", () => {
  it("binds once per key, ignores repeats", () => {
    const el = document.createElement("button");
    let calls = 0;
    const fn = () => { calls += 1; };
    assert.equal(bindKeyed(el, "merge:add", "click", fn), true);
    assert.equal(bindKeyed(el, "merge:add", "click", () => {}), false);
    el.click();
    el.click();
    assert.equal(calls, 2);
  });

  it("different elements bind independently", () => {
    const a = document.createElement("button");
    const b = document.createElement("button");
    let n = 0;
    bindKeyed(a, "k", "click", () => { n += 1; });
    bindKeyed(b, "k", "click", () => { n += 10; });
    a.click();
    b.click();
    assert.equal(n, 11);
  });

  it("unbindAll resets an element", () => {
    const el = document.createElement("button");
    const fn = () => {};
    assert.equal(bindKeyed(el, "k", "click", fn), true);
    unbindAll(el);
    assert.equal(bindKeyed(el, "k", "click", fn), true);
  });

  it("is safe for nullish elements", () => {
    assert.equal(bindKeyed(null, "k", "click", () => {}), false);
    assert.doesNotThrow(() => unbindAll(null));
  });
});

describe("errors.js: contextual reporting never throws", () => {
  it("warns with context for Error instances", () => {
    const warnings = [];
    const orig = console.warn;
    console.warn = (...args) => { warnings.push(args); };
    try {
      reportError("js/media.js:probeMedia", new Error("boom"));
    } finally {
      console.warn = orig;
    }
    assert.equal(warnings.length, 1);
    assert.ok(String(warnings[0][0]).includes("probeMedia"));
  });

  it("handles nullish and primitive payloads", () => {
    assert.doesNotThrow(() => {
      reportError("ctx", null);
      reportError("ctx", undefined);
      reportError("ctx", "plain string");
    });
  });
});

describe("split facades: public surface preserved", () => {
  it("media/tools/runner facades re-export flags helpers", async () => {
    const media = await import("../../src/js/media.js");
    assert.equal(typeof media.getBatchQueue, "function");
    assert.equal(typeof media.probeMedia, "undefined"); // moved: import from media/probe.js
    const probe = await import("../../src/js/media/probe.js");
    assert.equal(typeof probe.probeMedia, "function");
    assert.equal(typeof probe.onMediaChange, "function");
    const tm = await import("../../src/js/tools_manager.js");
    for (const fn of ["refreshToolsUI", "simulateToolUpdate", "deleteToolBinary",
      "checkLocalToolVersions", "fetchLatestGitHubReleases", "TOOLS_UPDATE_CACHE_TTL_MS"]) {
      assert.ok(tm[fn] !== undefined, `tools_manager missing ${fn}`);
    }
    const runner = await import("../../src/js/runner.js");
    for (const fn of ["executeFfmpegJob", "executeBatchQueue", "appendLog", "isJobRunning"]) {
      assert.equal(typeof runner[fn], "function", `runner missing ${fn}`);
    }
  });
});
