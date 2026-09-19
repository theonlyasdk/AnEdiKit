import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const srcDir = path.resolve(projectRoot, "src");
const cssDir = path.resolve(srcDir, "css");

describe("CSS Modularization: File Structure & Integrity", () => {
  it("should have no .css files directly inside root src/", () => {
    const rootSrcFiles = fs.readdirSync(srcDir);
    const rootCssFiles = rootSrcFiles.filter(f => f.endsWith(".css"));
    assert.deepEqual(rootCssFiles, [], `Found CSS files in root src/: ${rootCssFiles.join(", ")}`);
  });

  it("should contain all required CSS modular submodules in src/css/", () => {
    const expectedModules = [
      "base.css",
      "layout.css",
      "animations.css",
      "components.css",
      "media_preview.css",
      "modals.css",
      "m3_switches.css",
      "titlebar.css",
      "queues.css",
      "motion-tokens.css",
      "drag_reorder.css",
      "styles.css",
    ];

    for (const mod of expectedModules) {
      const filePath = path.join(cssDir, mod);
      assert.ok(fs.existsSync(filePath), `Expected CSS file to exist: ${mod}`);
      const stat = fs.statSync(filePath);
      assert.ok(stat.size > 0, `Expected CSS file to be non-empty: ${mod}`);
    }
  });

  it("should reference existing CSS files in src/index.html", () => {
    const indexPath = path.join(srcDir, "index.html");
    const htmlContent = fs.readFileSync(indexPath, "utf8");
    const linkMatches = [...htmlContent.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)];
    assert.ok(linkMatches.length > 0, "Expected stylesheet links in index.html");

    for (const match of linkMatches) {
      const href = match[1];
      if (href.startsWith("http://") || href.startsWith("https://")) {
        continue;
      }
      const resolved = path.resolve(srcDir, href);
      assert.ok(fs.existsSync(resolved), `Stylesheet link in index.html not found on disk: ${href}`);
    }
  });

  it("should have barrel imports in src/css/styles.css", () => {
    const stylesPath = path.join(cssDir, "styles.css");
    const content = fs.readFileSync(stylesPath, "utf8");
    const expectedImports = [
      'base.css',
      'layout.css',
      'animations.css',
      'components.css',
      'media_preview.css',
      'modals.css',
      'm3_switches.css',
      'titlebar.css',
      'queues.css',
    ];

    for (const imp of expectedImports) {
      assert.ok(
        content.includes(`@import "${imp}";`) || content.includes(`@import '${imp}';`),
        `styles.css missing barrel import for: ${imp}`
      );
    }
  });

  it("should have balanced braces in all css submodules", () => {
    const files = fs.readdirSync(cssDir).filter(f => f.endsWith(".css"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(cssDir, file), "utf8");
      // Strip comments and string literals to check brace balance
      const stripped = content
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/'(?:[^'\\]|\\.)*'/g, "''");
      const openCount = (stripped.match(/\{/g) || []).length;
      const closeCount = (stripped.match(/\}/g) || []).length;
      assert.equal(openCount, closeCount, `Unbalanced braces in ${file}: ${openCount} open vs ${closeCount} close`);
    }
  });

  it("should preserve critical rules and selectors across submodules", () => {
    // Check macOS modal dialog animations in modals.css
    const modalsContent = fs.readFileSync(path.join(cssDir, "modals.css"), "utf8");
    assert.ok(modalsContent.includes(".modal.fade .modal-dialog"));
    assert.ok(modalsContent.includes(".modal.fade.show .modal-dialog"));
    assert.ok(modalsContent.includes(".modal-settled"));

    // Check layout rules in layout.css
    const layoutContent = fs.readFileSync(path.join(cssDir, "layout.css"), "utf8");
    assert.ok(layoutContent.includes("#sidebar-scroll-container"));
    assert.ok(layoutContent.includes(".sidebar-indicator"));
    assert.ok(layoutContent.includes("#tool-workspace"));

    // Check Material 3 switch rules in m3_switches.css
    const m3Content = fs.readFileSync(path.join(cssDir, "m3_switches.css"), "utf8");
    assert.ok(m3Content.includes(".form-switch"));
    assert.ok(m3Content.includes("--m3-drag-progress"));

    // Check titlebar rules in titlebar.css
    const titlebarContent = fs.readFileSync(path.join(cssDir, "titlebar.css"), "utf8");
    assert.ok(titlebarContent.includes(".header-caption-btn"));
    assert.ok(titlebarContent.includes(".tb-glyph"));

    // Check queues rules in queues.css
    const queuesContent = fs.readFileSync(path.join(cssDir, "queues.css"), "utf8");
    assert.ok(queuesContent.includes(".audio-queue-item"));
    assert.ok(queuesContent.includes(".transparency-grid"));
    assert.ok(queuesContent.includes(".image-queue-item"));

    // Check media preview rules in media_preview.css
    const mediaContent = fs.readFileSync(path.join(cssDir, "media_preview.css"), "utf8");
    assert.ok(mediaContent.includes(".media-preview-morpher"));
    assert.ok(mediaContent.includes(".cd-loading-spin"));
    assert.ok(mediaContent.includes("#trim-playhead"));

    // Check animations rules in animations.css
    const animContent = fs.readFileSync(path.join(cssDir, "animations.css"), "utf8");
    assert.ok(animContent.includes("headerSlideFromBottom"));
    assert.ok(animContent.includes(".progress-bar-material-indeterminate"));

    // Check icon box reservation in base.css: prevents sidebar label shift
    // before the ion-icon component upgrades on (re)load.
    const baseContent = fs.readFileSync(path.join(cssDir, "base.css"), "utf8");
    assert.ok(baseContent.includes("ion-icon"));
    assert.ok(baseContent.includes("flex-shrink: 0"));
  });
});
