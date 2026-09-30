// XSS regression tests: user-controlled data must be escaped before innerHTML.
import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { escapeHtml } from "../../src/js/escape.js";
import { escapeHtml as playlistEscape } from "../../src/js/playlist.js";
import { escapeHtml as audioEscape } from "../../src/js/audio_tags/render.js";
import "../../src/js/audio_tags/render.js"; // register bridge render handlers
import { addFilesToBatch, clearBatchQueue, renderBatchQueueUI } from "../../src/js/media.js";
import { setMergeFiles, clearMergeFiles, renderMergeList } from "../../src/js/merge.js";
import { addImageFilesToQueue, clearImageAiQueue } from "../../src/js/image_queue.js";
import { addAudioFilesToQueue, clearAudioTagQueue } from "../../src/js/audio_tags.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

const EVIL_NAME = '"><img src=x onerror="alert(1)">.mp4';
const EVIL_PATH = `C:/v/${EVIL_NAME}`;

describe("escape.js: canonical escaper", () => {
  it("escapes angles, quotes, and ampersands", () => {
    assert.equal(
      escapeHtml('<script>alert("x" & \'y\')</script>'),
      "&lt;script&gt;alert(&quot;x&quot; &amp; &#039;y&#039;)&lt;/script&gt;",
    );
  });

  it("returns empty string for nullish input", () => {
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
    assert.equal(escapeHtml(""), "");
  });

  it("both legacy delegates behave identically on adversarial input", () => {
    for (const input of [EVIL_NAME, `a'b"c<d>e&f`, "plain", "C:\\Music\\Track (1).mp3"]) {
      assert.equal(playlistEscape(input), escapeHtml(input), `playlist delegate: ${input}`);
      assert.equal(audioEscape(input), escapeHtml(input), `audio delegate: ${input}`);
    }
  });
});

describe("xss: batch queue rows escape file names", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearBatchQueue();
  });

  it("renders a hostile file name inert", async () => {
    await addFilesToBatch([EVIL_PATH]);
    renderBatchQueueUI();
    const html = document.getElementById("batch-queue-list").innerHTML;
    assert.ok(html.includes("&lt;img"), "expected escaped markup");
    assert.ok(!html.includes("<img src=x"), "raw payload must not appear");
    assert.ok(!html.includes(`"${EVIL_NAME}"`), "raw quotes must not appear");
  });
});

describe("xss: merge list escapes file paths", () => {
  beforeEach(() => {
    clearMergeFiles();
  });

  it("renders a hostile path inert", () => {
    setMergeFiles([EVIL_PATH, "C:/v/plain.mp4"]);
    renderMergeList();
    const html = document.getElementById("merge-file-list").innerHTML;
    assert.ok(html.includes("&lt;img"), "expected escaped markup");
    assert.ok(!html.includes("<img src=x"), "raw payload must not appear");
  });
});

describe("xss: image queue escapes names, paths, and alt text", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearImageAiQueue();
  });

  it("renders hostile name/path inert", async () => {
    const evilPng = `C:/pics/${EVIL_NAME.replace(".mp4", ".png")}`;
    await addImageFilesToQueue([evilPng]);
    const html = document.getElementById("image-ai-queue-list").innerHTML;
    assert.ok(html.includes("&lt;img"), "expected escaped markup");
    assert.ok(!html.includes("<img src=x"), "raw payload must not appear");
    assert.ok(!html.includes('alt="">'), "alt must not break out");
  });
});

describe("xss: audio queue escapes track file names", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAudioTagQueue();
  });

  it("renders a hostile track name inert", async () => {
    await addAudioFilesToQueue([`C:/m/${EVIL_NAME.replace(".mp4", ".mp3")}`]);
    const html = document.getElementById("audio-tag-queue-list").innerHTML;
    assert.ok(!html.includes("<img src=x"), "raw payload must not appear");
    assert.ok(html.includes("&lt;img") || html.includes("audio-queue-item"), "queue rendered");
  });
});

describe("xss: pdf metadata stays escaped (source guard)", () => {
  it("updatePdfInfo interpolations route through escapeHtml", () => {
    const src = fs.readFileSync(path.join(projectRoot, "src/js/pdf_tools.js"), "utf8");
    for (const snippet of [
      "escapeHtml(names.join",
      "escapeHtml(primaryName)",
      "escapeHtml(url)",
      "escapeHtml(label)",
      "escapeHtml(val)",
      "escapeHtml(titleVal || val)",
    ]) {
      assert.ok(src.includes(snippet), `pdf_tools.js should contain ${snippet}`);
    }
  });
});
