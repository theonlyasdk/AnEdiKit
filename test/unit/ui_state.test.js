import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { UIStateManager, uiState, createUIStore } from "../../src/js/ui_state.js";

test("UIStateManager: basic get, set, update, remove, and has", () => {
  const store = createUIStore("test:ui:");

  assert.equal(store.get("foo"), undefined);
  assert.equal(store.get("foo", "defaultVal"), "defaultVal");
  assert.equal(store.has("foo"), false);

  store.set("foo", "bar");
  assert.equal(store.get("foo"), "bar");
  assert.equal(store.has("foo"), true);

  // Object values
  store.set("config", { zoom: 1.5, theme: "dark", tags: ["a", "b"] });
  assert.deepEqual(store.get("config"), { zoom: 1.5, theme: "dark", tags: ["a", "b"] });

  // Update
  store.set("count", 5);
  const updated = store.update("count", (prev) => (prev || 0) + 3);
  assert.equal(updated, 8);
  assert.equal(store.get("count"), 8);

  // Remove
  store.remove("foo");
  assert.equal(store.get("foo"), undefined);
  assert.equal(store.has("foo"), false);
});

test("UIStateManager: getAll and clear with prefixes", () => {
  const store = createUIStore("test:scoped:");
  store.clear();

  store.set("view:sidebar", "open");
  store.set("view:tab", "details");
  store.set("filter:active", true);

  const all = store.getAll();
  assert.equal(all["view:sidebar"], "open");
  assert.equal(all["view:tab"], "details");
  assert.equal(all["filter:active"], true);

  const viewOnly = store.getAll("view:");
  assert.equal(viewOnly["view:sidebar"], "open");
  assert.equal(viewOnly["view:tab"], "details");
  assert.equal(viewOnly["filter:active"], undefined);

  store.clear("view:");
  assert.equal(store.get("view:sidebar"), undefined);
  assert.equal(store.get("filter:active"), true);

  store.clear();
  assert.equal(store.get("filter:active"), undefined);
});

test("UIStateManager: subscribe and wildcard notifications", () => {
  const store = createUIStore("test:events:");
  let notifiedKey = null;
  let newVal = null;
  let oldVal = null;
  let wildcardCalls = 0;

  const unsubSpecific = store.subscribe("theme", (next, prev, key) => {
    notifiedKey = key;
    newVal = next;
    oldVal = prev;
  });

  const unsubWildcard = store.subscribe("*", () => {
    wildcardCalls++;
  });

  store.set("theme", "light");
  assert.equal(notifiedKey, "theme");
  assert.equal(newVal, "light");
  assert.equal(oldVal, undefined);
  assert.equal(wildcardCalls, 1);

  store.set("theme", "dark");
  assert.equal(newVal, "dark");
  assert.equal(oldVal, "light");
  assert.equal(wildcardCalls, 2);

  // Unsubscribe specific
  unsubSpecific();
  store.set("theme", "auto");
  assert.equal(newVal, "dark"); // not updated by specific listener
  assert.equal(wildcardCalls, 3); // still updated by wildcard

  unsubWildcard();
  store.set("theme", "custom");
  assert.equal(wildcardCalls, 3);
});

test("UIStateManager: DOM Element Binding (input, checkbox, range)", async () => {
  const store = createUIStore("test:dom:");
  store.clear();

  // Test Text Input
  const textInput = document.createElement("input");
  textInput.id = "my-text-input";
  textInput.value = "Initial Value";

  const textBinding = store.bind(textInput, "textKey", { debounceMs: 0 });
  // Should have read initial value
  assert.equal(store.get("textKey"), "Initial Value");

  // Changing DOM element triggers state update
  textInput.value = "Updated via DOM";
  textInput.dispatchEvent(new Event("input"));
  assert.equal(store.get("textKey"), "Updated via DOM");

  // Updating state updates DOM element
  store.set("textKey", "Updated via Store");
  assert.equal(textInput.value, "Updated via Store");

  textBinding.unbind();

  // Test Checkbox
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = "my-checkbox";
  checkbox.checked = false;

  const checkBinding = store.bind(checkbox, "checkKey", { defaultValue: true });
  assert.equal(checkbox.checked, true);
  assert.equal(store.get("checkKey"), true);

  checkbox.checked = false;
  checkbox.dispatchEvent(new Event("change"));
  assert.equal(store.get("checkKey"), false);

  checkBinding.unbind();

  // Test Number/Range
  const rangeInput = document.createElement("input");
  rangeInput.type = "range";
  rangeInput.value = "50";

  const rangeBinding = store.bind(rangeInput, "sliderVal", { debounceMs: 0 });
  assert.equal(store.get("sliderVal"), 50);

  rangeInput.value = "75";
  rangeInput.dispatchEvent(new Event("input"));
  assert.equal(store.get("sliderVal"), 75);

  rangeBinding.unbind();
});

test("UIStateManager: bindContainer and auto-init state", () => {
  const store = createUIStore("test:container:");
  store.clear();

  const container = document.createElement("div");
  const input1 = document.createElement("input");
  input1.id = "username";
  input1.value = "Antigravity";
  container.appendChild(input1);

  const input2 = document.createElement("input");
  input2.type = "checkbox";
  input2.id = "darkmode";
  input2.checked = true;
  container.appendChild(input2);

  const group = store.bindContainer(container, { prefix: "profile", debounceMs: 0 });
  assert.equal(store.get("profile:username"), "Antigravity");
  assert.equal(store.get("profile:darkmode"), true);

  group.unbind();
});

test("UIStateManager: Comparison modal and lightbox state persistence", async () => {
  uiState.clear();

  // Test comparison modal state storage
  uiState.set("comparison_modal", {
    isOpen: true,
    origPath: "C:\\images\\before.jpg",
    resultPath: "C:\\images\\after.png",
    taskName: "Background Remover",
    activeMode: "split",
    splitPositionPct: 65,
  });

  const savedComp = uiState.get("comparison_modal");
  assert.equal(savedComp.isOpen, true);
  assert.equal(savedComp.origPath, "C:\\images\\before.jpg");
  assert.equal(savedComp.resultPath, "C:\\images\\after.png");
  assert.equal(savedComp.taskName, "Background Remover");
  assert.equal(savedComp.activeMode, "split");
  assert.equal(savedComp.splitPositionPct, 65);

  // Test lightbox modal state storage
  uiState.set("lightbox_modal", {
    isOpen: true,
    filePath: "C:\\photos\\test.png",
    fileName: "test.png",
  });

  const savedLb = uiState.get("lightbox_modal");
  assert.equal(savedLb.isOpen, true);
  assert.equal(savedLb.filePath, "C:\\photos\\test.png");
  assert.equal(savedLb.fileName, "test.png");

  // Test active bootstrap modal state storage
  uiState.set("active_bootstrap_modal", "manage-tools-modal");
  assert.equal(uiState.get("active_bootstrap_modal"), "manage-tools-modal");

  uiState.remove("active_bootstrap_modal");
  assert.equal(uiState.get("active_bootstrap_modal"), undefined);
});
