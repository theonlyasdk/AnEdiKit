// ytdlp_format.js: filename template tokenization, compilation, and preview.
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_FORMAT,
  SAMPLE_METADATA,
  parseFormatStringToItems,
  compileItemsToFormatString,
  previewFormatString,
} from "../../src/js/ytdlp_format.js";

describe("ytdlp_format.js: parseFormatStringToItems", () => {
  it("splits tokens and literal text", () => {
    const items = parseFormatStringToItems("%(title)s [%(id)s].%(ext)s");
    assert.deepEqual(items, [
      { type: "token", key: "title", raw: "%(title)s" },
      { type: "text", value: " [" },
      { type: "token", key: "id", raw: "%(id)s" },
      { type: "text", value: "]." },
      { type: "token", key: "ext", raw: "%(ext)s" },
    ]);
  });

  it("treats a template with no tokens as a single text item", () => {
    assert.deepEqual(parseFormatStringToItems("plain name"), [
      { type: "text", value: "plain name" },
    ]);
  });

  it("falls back to the default template for empty or non-string input", () => {
    assert.deepEqual(parseFormatStringToItems(""), parseFormatStringToItems(DEFAULT_FORMAT));
    assert.deepEqual(parseFormatStringToItems(null), parseFormatStringToItems(DEFAULT_FORMAT));
    assert.deepEqual(parseFormatStringToItems(undefined), parseFormatStringToItems(DEFAULT_FORMAT));
  });
});

describe("ytdlp_format.js: compileItemsToFormatString", () => {
  it("round-trips the default template", () => {
    assert.equal(compileItemsToFormatString(parseFormatStringToItems(DEFAULT_FORMAT)), DEFAULT_FORMAT);
  });

  it("round-trips several valid templates", () => {
    const templates = [
      "%(title)s.%(ext)s",
      "%(uploader)s - %(title)s [%(id)s].%(ext)s",
      "%(playlist_index)s-%(title)s",
      "%(artist)s - %(track)s.%(ext)s",
    ];
    for (const t of templates) {
      assert.equal(compileItemsToFormatString(parseFormatStringToItems(t)), t);
    }
  });

  it("falls back to the default template for empty item lists", () => {
    assert.equal(compileItemsToFormatString([]), DEFAULT_FORMAT);
    assert.equal(compileItemsToFormatString(null), DEFAULT_FORMAT);
  });
});

describe("ytdlp_format.js: previewFormatString", () => {
  it("substitutes known tokens with sample metadata", () => {
    assert.equal(
      previewFormatString("%(title)s.%(ext)s"),
      `${SAMPLE_METADATA.title}.${SAMPLE_METADATA.ext}`,
    );
  });

  it("brackets unknown tokens", () => {
    assert.equal(previewFormatString("%(nope)s"), "[nope]");
  });

  it("returns an empty string for empty input", () => {
    assert.equal(previewFormatString(""), "");
    assert.equal(previewFormatString(null), "");
  });
});
