// First coverage for the kits subsystem: icon mapping + kit CRUD ops.
import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { getIonicIconName } from "../../src/kits/icons.js";
import {
  notifyKitsChanged,
  exportKitAsJSON,
  duplicateKitById,
  deleteKitById,
} from "../../src/kits/ops.js";
import {
  saveUserKit,
  loadUserKits,
  getUserKitById,
} from "../../src/kits/storage.js";

describe("kits/icons.js: getIonicIconName", () => {
  it("maps bootstrap-style names to ionicons", () => {
    assert.equal(getIonicIconName("bi-film"), "film-outline");
    assert.equal(getIonicIconName("bi-gear"), "settings-outline");
    assert.equal(getIonicIconName("bi-palette"), "color-palette-outline");
  });

  it("falls back to outline suffix and default cube", () => {
    assert.equal(getIonicIconName(""), "cube-outline");
    assert.equal(getIonicIconName(null), "cube-outline");
    assert.equal(getIonicIconName("custom-icon"), "custom-icon");
    assert.equal(getIonicIconName("plain"), "plain-outline");
  });
});

describe("kits/ops.js: kit CRUD without UI imports", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("notifyKitsChanged dispatches detail on document", () => {
    const seen = [];
    const listener = (e) => seen.push(e?.detail);
    document.addEventListener("anedikit:kits-changed", listener);
    try {
      notifyKitsChanged({ openKitId: "k1", switchTool: true });
    } finally {
      document.removeEventListener("anedikit:kits-changed", listener);
    }
    assert.deepEqual(seen, [{ openKitId: "k1", switchTool: true }]);
  });

  it("exportKitAsJSON is a no-op for missing kits", () => {
    assert.doesNotThrow(() => exportKitAsJSON(null));
    assert.doesNotThrow(() => exportKitAsJSON(undefined));
  });

  it("exportKitAsJSON downloads JSON without throwing", () => {
    assert.doesNotThrow(() => exportKitAsJSON({ id: "k1", name: "K One" }));
  });

  it("duplicateKitById copies the kit and requests opening it", () => {
    saveUserKit({ id: "k1", name: "K One" });
    const seen = [];
    const listener = (e) => seen.push(e?.detail);
    document.addEventListener("anedikit:kits-changed", listener);
    try {
      duplicateKitById("k1");
    } finally {
      document.removeEventListener("anedikit:kits-changed", listener);
    }
    const kits = loadUserKits();
    assert.equal(kits.length, 2);
    const copy = kits.find((k) => k.id !== "k1");
    assert.ok(copy.id.startsWith("k1_copy_"));
    assert.equal(copy.name, "K One (Copy)");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].openKitId, copy.id);
  });

  it("duplicateKitById ignores unknown ids", () => {
    saveUserKit({ id: "k1", name: "K One" });
    duplicateKitById("nope");
    assert.equal(loadUserKits().length, 1);
  });

  it("deleteKitById ignores unknown ids", () => {
    saveUserKit({ id: "k1", name: "K One" });
    assert.doesNotThrow(() => deleteKitById(null));
    assert.doesNotThrow(() => deleteKitById("nope"));
    assert.equal(getUserKitById("k1").name, "K One");
  });
});

describe("kits/index.js: barrel exposes the decoupled modules", () => {
  it("re-exports ops and icons without conflicts", async () => {
    const index = await import("../../src/kits/index.js");
    for (const fn of ["duplicateKitById", "deleteKitById", "exportKitAsJSON", "getIonicIconName", "notifyKitsChanged"]) {
      assert.equal(typeof index[fn], "function", `barrel missing ${fn}`);
    }
  });
});
