// theme.js: text serialization round-trip and DOM application.
import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  serializeThemeToText,
  parseThemeFromText,
  applyTheme,
  applyFontFamily,
  setAnimationsEnabled,
  isWindows10,
  setIsWindows10,
} from "../../src/js/theme.js";

const root = () => document.documentElement;

beforeEach(() => {
  setIsWindows10(false);
  root().classList.remove("blur-enabled", "no-animations");
  document.body.classList.remove("blur-enabled");
  localStorage.clear();
});

describe("theme.js: serializeThemeToText / parseThemeFromText", () => {
  it("emits a header plus key=value lines with defaults", () => {
    const text = serializeThemeToText({});
    assert.ok(text.startsWith("# AnEdiKit Theme Configuration File"));
    assert.ok(text.includes("primary=#0d6efd"));
    assert.ok(text.includes("blur_enabled=true"));
    assert.ok(text.includes("blur_radius=16"));
    assert.ok(text.includes("blur_saturate=140"));
  });

  it("round-trips colors and typed blur fields", () => {
    const text = serializeThemeToText({
      name: "My Theme",
      primary: "#ff0000",
      body_bg: "#101010",
      blur_enabled: true,
      blur_radius: 20,
      blur_saturate: 150,
    });
    const parsed = parseThemeFromText(text);

    assert.equal(parsed.primary, "#ff0000");
    assert.equal(parsed.body_bg, "#101010");
    assert.equal(parsed.blur_enabled, true);
    assert.equal(parsed.blur_radius, 20);
    assert.equal(parsed.blur_saturate, 150);
    // The display name lives in a comment, so it is not imported back.
    assert.equal(parsed.name, "Imported Theme");
  });

  it("ignores comments, blank lines, and handles CRLF", () => {
    const parsed = parseThemeFromText(
      "# primary=#ffffff\r\n\r\n  primary=#111111 \r\nsecondary=#222222",
    );
    assert.equal(parsed.primary, "#111111");
    assert.equal(parsed.secondary, "#222222");
  });

  it("parses booleans and falls back for non-numeric blur values", () => {
    assert.equal(parseThemeFromText("blur_enabled=1").blur_enabled, true);
    assert.equal(parseThemeFromText("blur_enabled=false").blur_enabled, false);
    assert.equal(parseThemeFromText("blur_radius=abc").blur_radius, 16);
    assert.equal(parseThemeFromText("blur_saturate=abc").blur_saturate, 140);
  });

  it("returns sane defaults for empty text", () => {
    const parsed = parseThemeFromText("");
    assert.equal(parsed.name, "Imported Theme");
    assert.equal(parsed.font_family, "");
  });
});

describe("theme.js: applyTheme", () => {
  it("is a no-op for null input", () => {
    assert.doesNotThrow(() => applyTheme(null));
  });

  it("writes palette colors and their rgb companions", () => {
    applyTheme({ primary: "#ff0000", body_bg: "#101010", text_color: "#ffffff" });
    assert.equal(root().style.getPropertyValue("--bs-primary"), "#ff0000");
    assert.equal(root().style.getPropertyValue("--bs-primary-rgb"), "255, 0, 0");
    assert.equal(root().style.getPropertyValue("--bs-body-bg"), "#101010");
    assert.equal(root().style.getPropertyValue("--bs-body-color"), "#ffffff");
    assert.equal(root().style.getPropertyValue("--bs-body-color-rgb"), "255, 255, 255");
  });

  it("defaults blur ON on non-Windows 10 machines", () => {
    applyTheme({ primary: "#0d6efd" });
    assert.equal(root().style.getPropertyValue("--anedikit-blur-enabled"), "1");
    assert.equal(root().style.getPropertyValue("--anedikit-blur-radius"), "16px");
    assert.equal(root().style.getPropertyValue("--anedikit-blur-saturate"), "140%");
    assert.equal(root().classList.contains("blur-enabled"), true);
    assert.equal(document.body.classList.contains("blur-enabled"), true);
  });

  it("disables blur effects on Windows 10 even if requested", () => {
    setIsWindows10(true);
    applyTheme({ blur_enabled: true, blur_radius: 20 });
    assert.equal(root().style.getPropertyValue("--anedikit-blur-enabled"), "0");
    assert.equal(root().style.getPropertyValue("--anedikit-blur-radius"), "0px");
    assert.equal(root().style.getPropertyValue("--anedikit-blur-saturate"), "100%");
    assert.equal(root().classList.contains("blur-enabled"), false);
    assert.equal(document.body.classList.contains("blur-enabled"), false);
  });

  it("enables blur with a clamped radius when opted in on non-Windows 10", () => {
    applyTheme({ blur_enabled: true, blur_radius: 20, blur_saturate: 150 });
    assert.equal(root().style.getPropertyValue("--anedikit-blur-enabled"), "1");
    assert.equal(root().style.getPropertyValue("--anedikit-blur-radius"), "20px");
    assert.equal(root().style.getPropertyValue("--anedikit-blur-saturate"), "150%");
    assert.equal(root().classList.contains("blur-enabled"), true);
    assert.equal(document.body.classList.contains("blur-enabled"), true);
  });

  it("clamps a too-small blur radius up to the 12px minimum", () => {
    applyTheme({ blur_enabled: true, blur_radius: 5 });
    assert.equal(root().style.getPropertyValue("--anedikit-blur-radius"), "12px");
  });
});

describe("theme.js: font + animation toggles", () => {
  it("applies a custom font stack", () => {
    applyFontFamily("Fira Code");
    assert.ok(root().style.getPropertyValue("--bs-body-font-family").startsWith("Fira Code,"));
  });

  it("restores the system font stack for empty input", () => {
    applyFontFamily("");
    assert.ok(root().style.getPropertyValue("--bs-body-font-family").includes("system-ui"));
  });

  it("toggles the no-animations class", () => {
    setAnimationsEnabled(false);
    assert.equal(root().classList.contains("no-animations"), true);
    setAnimationsEnabled(true);
    assert.equal(root().classList.contains("no-animations"), false);
  });
});
