// Guards the partials -> index.html contract: src/index.html must always be
// the exact output of tools/Scripts/assemble_html.py (no hand-edits).
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

function tryAssembleCheck() {
  try {
    execFileSync("python", [path.join(projectRoot, "tools", "Scripts", "assemble_html.py"), "--check"], {
      stdio: "pipe",
      timeout: 30000,
    });
    return { ok: true };
  } catch (err) {
    if (err?.code === "ENOENT") return { skipped: true };
    return { ok: false, output: String(err?.stdout || err?.message || err) };
  }
}

describe("HTML assembly: partials are the source of truth", () => {
  it("src/index.html matches assembler output (run tools/Scripts/assemble_html.py)", () => {
    const res = tryAssembleCheck();
    if (res.skipped) {
      console.warn("skip: python not available for assemble check");
      return;
    }
    assert.equal(res.ok, true, res.output);
  });

  it("every view partial declares its view id exactly once", () => {
    const viewsDir = path.join(projectRoot, "src", "partials", "views");
    const files = fs.readdirSync(viewsDir).filter((f) => f.endsWith(".html"));
    assert.ok(files.length >= 28, `expected >=28 view partials, found ${files.length}`);
    for (const file of files) {
      const content = fs.readFileSync(path.join(viewsDir, file), "utf8");
      const id = file.replace(/\.html$/, "");
      const occurrences = content.split(`id="${id}"`).length - 1;
      assert.equal(occurrences, 1, `${file} should declare id="${id}" exactly once`);
    }
  });
});
