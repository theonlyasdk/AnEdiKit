// storage.js: user kits CRUD, per-tool/kit params normalization, misc getters.
import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  STORAGE_KEYS,
  loadUserKits,
  saveUserKits,
  getUserKitById,
  saveUserKit,
  deleteUserKit,
  getSavedActiveKit,
  saveActiveKit,
  getSavedToolParams,
  saveToolParams,
  getSavedKitParams,
  saveKitParams,
  getSavedScriptTheme,
  saveScriptTheme,
  getSavedAiReplaceSource,
  saveAiReplaceSource,
  getLastOutputDir,
  saveLastOutputDir,
  isFirstStart,
  markFirstStartChecked,
} from "../../src/js/storage.js";

beforeEach(() => {
  localStorage.clear();
});

describe("storage.js: user kits", () => {
  it("adds, updates in place, and deletes kits by id", () => {
    assert.deepEqual(loadUserKits(), []);

    saveUserKit({ id: "kit_a", name: "A" });
    saveUserKit({ id: "kit_b", name: "B" });
    assert.equal(loadUserKits().length, 2);

    saveUserKit({ id: "kit_a", name: "A2" });
    assert.equal(loadUserKits().length, 2);
    assert.equal(getUserKitById("kit_a").name, "A2");

    deleteUserKit("kit_a");
    assert.equal(getUserKitById("kit_a"), null);
    assert.equal(loadUserKits().length, 1);
  });

  it("ignores kits without an id", () => {
    saveUserKit({ name: "no id" });
    saveUserKit(null);
    assert.equal(loadUserKits().length, 0);
  });

  it("recovers from non-array and corrupt stored payloads", () => {
    localStorage.setItem(STORAGE_KEYS.USER_KITS, "{}");
    assert.deepEqual(loadUserKits(), []);

    localStorage.setItem(STORAGE_KEYS.USER_KITS, "{not json");
    assert.deepEqual(loadUserKits(), []);

    saveUserKits([{ id: "x" }]);
    assert.equal(loadUserKits().length, 1);
  });
});

describe("storage.js: tool params", () => {
  it("normalizes a plain object into typed properties", () => {
    saveToolParams("convert", { quality: 20, fast: true });

    const payload = getSavedToolParams("convert");
    assert.equal(payload.moduleId, "convert");
    assert.deepEqual(payload.properties, [
      { id: "quality", value: 20, type: "text" },
      { id: "fast", value: true, type: "checkbox" },
    ]);
    assert.ok(!Number.isNaN(Date.parse(payload.updatedAt)), "updatedAt should be an ISO date");
  });

  it("accepts an array of properties and a properties object as-is", () => {
    saveToolParams("trim", [{ id: "start", value: "00:01" }]);
    assert.deepEqual(getSavedToolParams("trim").properties, [{ id: "start", value: "00:01" }]);

    saveToolParams("merge", { properties: [{ id: "order", value: 1 }] });
    assert.deepEqual(getSavedToolParams("merge").properties, [{ id: "order", value: 1 }]);
  });

  it("returns null for missing, empty, or invalid tool ids", () => {
    assert.equal(getSavedToolParams(null), null);
    assert.equal(getSavedToolParams(""), null);
    assert.equal(getSavedToolParams("missing"), null);
  });

  it("stores tool params under the namespaced prefix", () => {
    saveToolParams("convert", { a: 1 });
    assert.ok(localStorage.getItem(`${STORAGE_KEYS.TOOL_PARAMS_PREFIX}convert`));
  });
});

describe("storage.js: kit params", () => {
  it("round-trips a params object through the flattened reader", () => {
    saveKitParams("kit_a", { speed: 2, verbose: true });
    assert.deepEqual(getSavedKitParams("kit_a"), { speed: 2, verbose: true });
  });

  it("returns an empty object for unknown or missing kit ids", () => {
    assert.deepEqual(getSavedKitParams("nope"), {});
    assert.deepEqual(getSavedKitParams(""), {});
    assert.deepEqual(getSavedKitParams(null), {});
  });

  it("namespaces params under kit_<id>", () => {
    saveKitParams("kit_a", { x: 1 });
    assert.ok(localStorage.getItem(`${STORAGE_KEYS.TOOL_PARAMS_PREFIX}kit_kit_a`));
  });
});

describe("storage.js: misc getters", () => {
  it("tracks the active kit id", () => {
    assert.equal(getSavedActiveKit(), "");
    saveActiveKit("kit_x");
    assert.equal(getSavedActiveKit(), "kit_x");
    saveActiveKit("");
    assert.equal(getSavedActiveKit(), "");
  });

  it("defaults the script theme to vs-dark", () => {
    assert.equal(getSavedScriptTheme(), "vs-dark");
    saveScriptTheme("monokai");
    assert.equal(getSavedScriptTheme(), "monokai");
  });

  it("defaults AI replace-source to false", () => {
    assert.equal(getSavedAiReplaceSource(), false);
    saveAiReplaceSource(true);
    assert.equal(getSavedAiReplaceSource(), true);
    saveAiReplaceSource(false);
    assert.equal(getSavedAiReplaceSource(), false);
  });

  it("reports first start until it is marked checked", () => {
    assert.equal(isFirstStart(), true);
    markFirstStartChecked();
    assert.equal(isFirstStart(), false);
  });

  it("persists and retrieves last output directory", () => {
    assert.equal(getLastOutputDir(), "C:\\Users\\User\\Videos");
    saveLastOutputDir("D:\\MyProjects\\Rendered");
    assert.equal(getLastOutputDir(), "D:\\MyProjects\\Rendered");
    assert.equal(localStorage.getItem(STORAGE_KEYS.LAST_OUTPUT_DIR), "D:\\MyProjects\\Rendered");
  });
});
