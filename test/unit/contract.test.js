import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

const srcDir = path.resolve(projectRoot, "src");
const indexPath = path.resolve(projectRoot, "src/index.html");
const commandsPath = path.resolve(projectRoot, "src/js/commands.js");
const storagePath = path.resolve(projectRoot, "src/js/storage.js");
const manifestPath = path.resolve(projectRoot, "src/data/tools-manifest.json");
const ioniconsPath = path.resolve(projectRoot, "node_modules/ionicons/dist/ionicons.json");

import { TOOL_METADATA } from "../../src/js/navigation.js";
import { STORAGE_KEYS } from "../../src/js/storage.js";

const NAMESPACE = "anedikit:";

const CONFIG_ONLY_TOOLS = new Set([
  "settings",
  "pdf",
  "pdf_organize",
  "pdf_optimize",
  "pdf_to",
  "pdf_from",
  "pdf_edit",
  "pdf_security",
  "pdf_intelligence",
]);

function extractHtmlDataTools() {
  const html = fs.readFileSync(indexPath, "utf8");
  const re = /data-tool="([^"]+)"/g;
  let m;
  const tools = new Set();
  while ((m = re.exec(html)) !== null) {
    tools.add(m[1]);
  }
  return tools;
}

function extractBuildCommandCases() {
  const src = fs.readFileSync(commandsPath, "utf8");
  const fnStart = src.indexOf("export function buildCommandForTool");
  assert.ok(fnStart !== -1, "buildCommandForTool not found in commands.js");
  const srcFromFn = src.slice(fnStart);
  const re = /case\s+"([^"]+)"\s*:/g;
  let m;
  const cases = new Set();
  while ((m = re.exec(srcFromFn)) !== null) {
    cases.add(m[1]);
  }
  return cases;
}

function loadIoniconsIconNames() {
  const data = JSON.parse(fs.readFileSync(ioniconsPath, "utf8"));
  return new Set(data.icons.map((i) => i.name));
}

function lineNumberOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

// Every JS module under src/ (kits, js, etc.), so the localStorage namespace
// rule is enforced where keys are actually read and written, not just in the
// central storage module.
function walkSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSourceFiles(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

describe("Contract: UI buttons <-> TOOL_METADATA <-> buildCommandForTool", () => {
  const htmlTools = extractHtmlDataTools();
  const metadataTools = new Set(Object.keys(TOOL_METADATA));
  const backendCases = extractBuildCommandCases();

  it("every data-tool button in index.html has a TOOL_METADATA entry", () => {
    const missing = [...htmlTools].filter((t) => !metadataTools.has(t)).sort();
    assert.equal(
      missing.length,
      0,
      `data-tool buttons without TOOL_METADATA entry: ${missing.join(", ")}.`,
    );
  });

  it("every TOOL_METADATA entry has a corresponding data-tool button in index.html", () => {
    const missing = [...metadataTools].filter((t) => !htmlTools.has(t)).sort();
    assert.equal(
      missing.length,
      0,
      `TOOL_METADATA entries without data-tool button: ${missing.join(", ")}.`,
    );
  });

  it("every non-config tool has a buildCommandForTool branch", () => {
    const processingTools = [...htmlTools].filter((t) => !CONFIG_ONLY_TOOLS.has(t)).sort();
    const missing = processingTools.filter((t) => !backendCases.has(t));
    assert.equal(
      missing.length,
      0,
      `Processing tools without buildCommandForTool branch: ${missing.join(", ")}. ` +
        `CONFIG_ONLY_TOOLS (no command builder needed): ${[...CONFIG_ONLY_TOOLS].join(", ")}.`,
    );
  });

  it("every buildCommandForTool case label has a TOOL_METADATA entry", () => {
    const missing = [...backendCases].filter((t) => !metadataTools.has(t)).sort();
    assert.equal(
      missing.length,
      0,
      `buildCommandForTool case labels without TOOL_METADATA: ${missing.join(", ")}.`,
    );
  });
});

describe("Contract: index.html ion-icon names vs Ionicons set", () => {
  const iconNames = loadIoniconsIconNames();

  it("every ion-icon name used in sidebar nav buttons exists in the Ionicons set", () => {
    const html = fs.readFileSync(indexPath, "utf8");
    const re = /ion-icon\s+name="(?:&quot;|")?([^"'\s>]+)/g;
    let m;
    const used = new Set();
    while ((m = re.exec(html)) !== null) {
      used.add(m[1]);
    }
    const unknown = [...used].filter((name) => !iconNames.has(name)).sort();
    assert.equal(
      unknown.length,
      0,
      `Unknown Ionicons names in index.html: ${unknown.join(", ")}.`,
    );
  });
});

describe("Contract: tools-manifest.json schema & icons", () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const iconNames = loadIoniconsIconNames();

  it("should be a non-empty array", () => {
    assert.ok(Array.isArray(manifest), "tools-manifest.json should be an array");
    assert.ok(manifest.length > 0, "tools-manifest.json should not be empty");
  });

  it("every entry has required fields (id, binName, downloadSources)", () => {
    manifest.forEach((entry, i) => {
      assert.ok(typeof entry.id === "string" && entry.id.length > 0, `Entry ${i} missing or invalid id`);
      assert.ok(
        typeof entry.binName === "string" && entry.binName.length > 0,
        `Entry ${entry.id || i} missing or invalid binName`,
      );
      assert.ok(
        Array.isArray(entry.downloadSources),
        `Entry ${entry.id || i} missing or invalid downloadSources (expected array)`,
      );
    });
  });

  it("every entry has a valid Ionicons icon name", () => {
    manifest.forEach((entry) => {
      assert.ok(entry.icon, `Entry ${entry.id} missing icon field`);
      assert.ok(
        iconNames.has(entry.icon),
        `Entry ${entry.id} has unknown Ionicons icon: "${entry.icon}"`,
      );
    });
  });

  it("has no duplicate ids", () => {
    const ids = manifest.map((e) => e.id);
    const seen = new Set();
    const dups = [];
    for (const id of ids) {
      if (seen.has(id)) dups.push(id);
      else seen.add(id);
    }
    assert.equal(
      dups.length,
      0,
      `Duplicate ids in tools-manifest.json: ${dups.join(", ")}.`,
    );
  });
});

describe("Contract: localStorage namespace invariant", () => {
  it("every STORAGE_KEYS value starts with anedikit:", () => {
    const violations = [];
    for (const [key, val] of Object.entries(STORAGE_KEYS)) {
      if (typeof val === "string" && !val.startsWith(NAMESPACE)) {
        violations.push(`${key}="${val}"`);
      }
    }
    assert.equal(
      violations.length,
      0,
      `STORAGE_KEYS values not namespaced: ${violations.join(", ")}.`,
    );
  });

  it("storage.js only touches keys through STORAGE_KEYS (no ad-hoc literals)", () => {
    const src = fs.readFileSync(storagePath, "utf8");
    const re = /localStorage\.(get|set|remove)Item\(\s*(["'])([^"']*)\2/g;
    let m;
    const violations = [];
    while ((m = re.exec(src)) !== null) {
      violations.push(
        `${m[1]}Item("${m[3]}") at line ${lineNumberOf(src, m.index)}`,
      );
    }
    assert.equal(
      violations.length,
      0,
      `storage.js should route keys through STORAGE_KEYS, found literals: ${violations.join("; ")}.`,
    );
  });

  it("every string-literal localStorage key across src/ is namespaced", () => {
    const re = /localStorage\.(get|set|remove)Item\(\s*(["'])([^"']*)\2/g;
    const violations = [];
    for (const file of walkSourceFiles(srcDir)) {
      const src = fs.readFileSync(file, "utf8");
      let m;
      while ((m = re.exec(src)) !== null) {
        const keyVal = m[3];
        if (!keyVal.startsWith(NAMESPACE)) {
          violations.push(
            `${path.relative(projectRoot, file)}:${lineNumberOf(src, m.index)} ${m[1]}Item("${keyVal}")`,
          );
        }
      }
    }
    assert.equal(
      violations.length,
      0,
      `localStorage keys not namespaced: ${violations.join("; ")}.`,
    );
  });
});

describe("Contract: Manage Tools cache controls placement", () => {
  const html = fs.readFileSync(indexPath, "utf8");
  const modalHtml = extractDivBlock(html, 'id="manage-tools-modal"');

  it("locates the Manage Tools dialog in index.html", () => {
    assert.ok(
      modalHtml,
      "Could not resolve the #manage-tools-modal element block in index.html.",
    );
  });

  for (const id of ["btn-clear-tools-cache", "tools-cache-status-text"]) {
    it(`mounts #${id} exactly once, inside the Manage Tools dialog`, () => {
      const occurrences = html.split(`id="${id}"`).length - 1;
      assert.equal(
        occurrences,
        1,
        `Expected exactly one #${id} in index.html, found ${occurrences}.`,
      );
      assert.ok(
        modalHtml.includes(`id="${id}"`),
        `#${id} must live inside #manage-tools-modal so it is only reachable while managing tools.`,
      );
    });
  }

  it("keeps the cache control element ids in sync with app_settings.js", () => {
    const src = fs.readFileSync(
      path.resolve(srcDir, "js/app_settings.js"),
      "utf8",
    );
    for (const id of [
      "manage-tools-modal",
      "btn-clear-tools-cache",
      "tools-cache-status-text",
    ]) {
      assert.ok(
        src.includes(`"${id}"`),
        `app_settings.js no longer wires up #${id}; update this contract if that is intentional.`,
      );
      assert.ok(
        html.includes(`id="${id}"`),
        `#${id} is referenced by app_settings.js but missing from index.html.`,
      );
    }
  });
});

/**
 * Slice out the markup of the `<div>` carrying `marker`, using div-tag depth
 * counting so nested dialogs/sections stay inside the returned block.
 */
function extractDivBlock(html, marker) {
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;
  const openIndex = html.lastIndexOf("<div", markerIndex);
  if (openIndex === -1) return null;

  const tagRe = /<div\b|<\/div>/g;
  tagRe.lastIndex = openIndex;
  let depth = 0;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) return html.slice(openIndex, tagRe.lastIndex);
  }
  return null;
}
