// Unit tests for newly extracted pure modules (modularisation phase 1).
// Every function here is DOM-free and cycle-free by design.
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isAudioPath,
  isAudioFile,
  isImageFile,
  isVideoFile,
  getExtension,
} from "../../src/js/media_types.js";
import { classifyLogLine, logKindToCssClass } from "../../src/js/log_classify.js";
import {
  resolveDestinationPathPure,
  extractEnclosingDir,
  joinWinPath,
} from "../../src/js/path_resolve.js";
import {
  resolveExecuteButtonState,
  resolveExecuteTooltip,
  isImageAiTool,
} from "../../src/js/execute_state.js";
import {
  TOOL_METADATA,
  TOOL_ORDER,
  isPdfToolId,
  getViewIdForTool,
  isKnownTool,
} from "../../src/js/tool_metadata.js";

describe("media_types.js: single source of truth", () => {
  it("classifies audio extensions case-insensitively, ignoring query/fragment", () => {
    assert.equal(isAudioPath("song.mp3"), true);
    assert.equal(isAudioPath("C:\\Music\\Track.FLAC"), true);
    assert.equal(isAudioPath("https://example.com/song.MP3?token=abc#t=10"), true);
    assert.equal(isAudioPath("movie.mp4"), false);
    assert.equal(isAudioPath(""), false);
    assert.equal(isAudioPath(null), false);
  });

  it("isAudioFile delegates to isAudioPath", () => {
    assert.equal(isAudioFile("voice.ogg?dl=1"), true);
    assert.equal(isAudioFile("clip.mp4"), false);
  });

  it("classifies images including heic/avif, rejects audio/video", () => {
    assert.equal(isImageFile("photo.JPG"), true);
    assert.equal(isImageFile("shot.heic"), true);
    assert.equal(isImageFile("song.mp3"), false);
    assert.equal(isImageFile(null), false);
  });

  it("treats everything else as video", () => {
    assert.equal(isVideoFile("clip.mkv"), true);
    assert.equal(isVideoFile("song.mp3"), false);
    assert.equal(isVideoFile("photo.png"), false);
    assert.equal(isVideoFile(""), false);
  });

  it("getExtension lowercases and strips query strings", () => {
    assert.equal(getExtension("A.MP4?x=1"), "mp4");
    assert.equal(getExtension(""), "");
    assert.equal(getExtension(null), "");
  });
});

describe("log_classify.js: severity rules", () => {
  it("warning wins over error text (yt-dlp PO-token advisory)", () => {
    assert.equal(classifyLogLine("WARNING: Error 403 PO token missing"), "warning");
    assert.equal(classifyLogLine("warning: something failed"), "warning");
  });

  it("detects errors via flag or keywords", () => {
    assert.equal(classifyLogLine("conversion failed"), "error");
    assert.equal(classifyLogLine("some Error here"), "error");
    assert.equal(classifyLogLine("ok", true), "error");
  });

  it("detects success via keywords", () => {
    assert.equal(classifyLogLine("Job success"), "success");
    assert.equal(classifyLogLine("100% done"), "success");
  });

  it("falls back to info", () => {
    assert.equal(classifyLogLine("frame= 12 fps=30"), "info");
    assert.equal(classifyLogLine(""), "info");
  });

  it("maps kinds to the legacy CSS classes", () => {
    assert.equal(logKindToCssClass("error"), "text-danger");
    assert.equal(logKindToCssClass("warning"), "text-warning");
    assert.equal(logKindToCssClass("success"), "text-success");
    assert.equal(logKindToCssClass("info"), "text-body-secondary");
    assert.equal(logKindToCssClass("bogus"), "text-body-secondary");
  });
});

describe("path_resolve.js: output-path precedence", () => {
  it("prefers customOutputDir, trims trailing separators", () => {
    assert.equal(
      resolveDestinationPathPure("a.mp4", { customOutputDir: "D:\\Out\\\\" }, "C:\\Vids\\s.mp4", "", ""),
      "D:\\Out\\a.mp4"
    );
  });

  it("falls back to source enclosing dir, then settings, then Videos", () => {
    assert.equal(
      resolveDestinationPathPure("b.mp4", {}, "C:\\Vids\\s.mp4", "", ""),
      "C:\\Vids\\b.mp4"
    );
    assert.equal(
      resolveDestinationPathPure("b.mp4", { outputDir: "E:\\M" }, "", "", ""),
      "E:\\M\\b.mp4"
    );
    assert.equal(resolveDestinationPathPure("b.mp4", {}, "", "", ""), "C:\\Users\\User\\Videos\\b.mp4");
  });

  it("honours fullPath verbatim and customName over default", () => {
    assert.equal(
      resolveDestinationPathPure("ignored.mp4", { customOutputDir: "D:\\Out" }, "C:\\V\\s.mp4", "custom.mp4", ""),
      "D:\\Out\\custom.mp4"
    );
    assert.equal(
      resolveDestinationPathPure("ignored.mp4", { customOutputDir: "D:\\Out" }, "C:\\V\\s.mp4", "", "D:\\Full\\n.mp4"),
      "D:\\Full\\n.mp4"
    );
    assert.equal(
      resolveDestinationPathPure("ignored.mp4", {}, "", "", "E:/posix/full.mp4"),
      "E:/posix/full.mp4"
    );
  });

  it("extractEnclosingDir / joinWinPath handle posix + win separators", () => {
    assert.equal(extractEnclosingDir("/a/b/c.mp4"), "/a/b");
    assert.equal(extractEnclosingDir("C:\\A\\B.mp4"), "C:\\A");
    assert.equal(extractEnclosingDir("bare.mp4"), "");
    assert.equal(joinWinPath("D:\\Out\\\\", "a.mp4"), "D:\\Out\\a.mp4");
  });
});

describe("execute_state.js: button decision table", () => {
  it("hides on settings, cancels while running, loads audio tags", () => {
    assert.equal(resolveExecuteButtonState({ activeTool: "settings" }).mode, "hidden");
    const cancel = resolveExecuteButtonState({ activeTool: "convert", jobRunning: true });
    assert.equal(cancel.text, "Cancel");
    assert.equal(cancel.canExecute, true);
    const loading = resolveExecuteButtonState({ activeTool: "audio_tags", audioLoading: true });
    assert.equal(loading.text, "Loading...");
    assert.equal(loading.disabled, true);
  });

  it("resolves ytdlp playlist fetch vs download branches", () => {
    const fetch = resolveExecuteButtonState({
      activeTool: "ytdlp_playlist",
      currentUrl: "https://x",
      fetchedPlaylistUrl: "",
      playlistVideos: [],
    });
    assert.equal(fetch.text, "Fetch Playlist");
    assert.equal(fetch.canExecute, true);
    const dl = resolveExecuteButtonState({
      activeTool: "ytdlp_playlist",
      currentUrl: "https://x",
      fetchedPlaylistUrl: "https://x",
      playlistVideos: [{ checked: true }, { checked: false }],
    });
    assert.equal(dl.text, "Download (1)");
    assert.equal(dl.canExecute, true);
  });

  it("resolves image-AI, audio-tags, merge, custom, batch branches", () => {
    assert.equal(
      resolveExecuteButtonState({ activeTool: "bg_remover", imgQueueLen: 3 }).text,
      "Execute (3)"
    );
    assert.equal(
      resolveExecuteButtonState({ activeTool: "bg_remover", imgQueueLen: 0 }).canExecute,
      false
    );
    assert.equal(
      resolveExecuteButtonState({ activeTool: "audio_tags", audioQueueLen: 2 }).text,
      "Apply (2)"
    );
    assert.equal(
      resolveExecuteButtonState({ activeTool: "merge", mergeFilesLen: 2 }).canExecute,
      true
    );
    assert.equal(
      resolveExecuteButtonState({ activeTool: "merge", mergeFilesLen: 1 }).canExecute,
      false
    );
    assert.equal(
      resolveExecuteButtonState({ activeTool: "custom", hasCustomArgs: true }).canExecute,
      true
    );
    assert.equal(
      resolveExecuteButtonState({ activeTool: "convert", batchQueueLen: 5, hasInput: true }).text,
      "Execute (5)"
    );
    assert.equal(
      resolveExecuteButtonState({ activeTool: "convert", hasInput: false }).canExecute,
      false
    );
    assert.equal(resolveExecuteButtonState({ activeTool: "kit_mine" }).canExecute, true);
  });

  it("isImageAiTool + tooltips stay in sync with legacy strings", () => {
    assert.equal(isImageAiTool("bg_remover"), true);
    assert.equal(isImageAiTool("convert"), false);
    assert.equal(
      resolveExecuteTooltip({ activeTool: "merge", canExecute: false }),
      "Add at least 2 files to merge"
    );
    assert.equal(
      resolveExecuteTooltip({ activeTool: "convert", canExecute: true }),
      "Run processing operation"
    );
  });
});

describe("tool_metadata.js: registry integrity", () => {
  it("exposes the full registry + order without DOM imports", () => {
    assert.ok(Object.keys(TOOL_METADATA).length >= 30);
    assert.ok(TOOL_ORDER.includes("convert"));
    assert.equal(TOOL_METADATA.convert.viewId, "view-convert");
  });

  it("helpers classify pdf tools and resolve views", () => {
    assert.equal(isPdfToolId("pdf_organize"), true);
    assert.equal(isPdfToolId("convert"), false);
    assert.equal(getViewIdForTool("trim"), "view-trim");
    assert.equal(getViewIdForTool("nope"), null);
    assert.equal(isKnownTool("settings"), true);
    assert.equal(isKnownTool("nope"), false);
  });
});
