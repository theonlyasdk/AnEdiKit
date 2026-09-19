// Unit Tests for AnEdiKit pure helpers (commands.js + trimmer.js).
// These functions are deterministic and side-effect free apart from reading
// form fields through the mocked document in test/unit/setup.js.
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAudioPath,
  audioCodecToContainer,
  resolveDestinationPath,
  parseTimestampToSeconds as parseTimestampCommands,
  normalizeYtDlpTemplate,
  sanitizePlaylistItems,
} from "../../src/js/commands.js";
import {
  formatSecondsToTimestamp,
  parseTimestampToSeconds as parseTimestampTrimmer,
  isAudioFile,
  isImageFile,
  isVideoFile,
} from "../../src/js/trimmer.js";

describe("commands.js: isAudioPath", () => {
  it("should detect audio extensions case-insensitively", () => {
    assert.equal(isAudioPath("song.mp3"), true);
    assert.equal(isAudioPath("C:\\Music\\Track.FLAC"), true);
    assert.equal(isAudioPath("/home/user/voice.wav"), true);
    assert.equal(isAudioPath("recording.m4a"), true);
  });

  it("should ignore URL query strings and fragments", () => {
    assert.equal(isAudioPath("https://example.com/song.MP3?token=abc#t=10"), true);
  });

  it("should reject non-audio and missing paths", () => {
    assert.equal(isAudioPath("movie.mp4"), false);
    assert.equal(isAudioPath("photo.png"), false);
    assert.equal(isAudioPath("archive.tar.gz"), false);
    assert.equal(isAudioPath(""), false);
    assert.equal(isAudioPath(null), false);
    assert.equal(isAudioPath(undefined), false);
  });
});

describe("commands.js: audioCodecToContainer", () => {
  it("should map common codecs to stream-copy containers", () => {
    assert.equal(audioCodecToContainer("aac"), "m4a");
    assert.equal(audioCodecToContainer("mp3"), "mp3");
    assert.equal(audioCodecToContainer("opus"), "opus");
    assert.equal(audioCodecToContainer("vorbis"), "ogg");
    assert.equal(audioCodecToContainer("flac"), "flac");
    assert.equal(audioCodecToContainer("ac3"), "ac3");
    assert.equal(audioCodecToContainer("eac3"), "eac3");
    assert.equal(audioCodecToContainer("dts"), "dts");
    assert.equal(audioCodecToContainer("dca"), "dts");
    assert.equal(audioCodecToContainer("amr"), "amr");
    assert.equal(audioCodecToContainer("libopencore_amrnb"), "amr");
    assert.equal(audioCodecToContainer("wmav2"), "wma");
    assert.equal(audioCodecToContainer("pcm_s16le"), "wav");
  });

  it("should trim and lowercase input before matching", () => {
    assert.equal(audioCodecToContainer(" AAC "), "m4a");
    assert.equal(audioCodecToContainer("ALAC"), "m4a");
  });

  it("should return null when no confident mapping exists", () => {
    assert.equal(audioCodecToContainer("h264"), null);
    assert.equal(audioCodecToContainer(""), null);
    assert.equal(audioCodecToContainer(null), null);
    assert.equal(audioCodecToContainer(undefined), null);
  });
});

describe("commands.js: resolveDestinationPath", () => {
  it("should prefer an explicit custom output directory", () => {
    assert.equal(
      resolveDestinationPath("clip_converted.mp4", { customOutputDir: "D:\\Out" }, "C:\\Vids\\clip.mp4"),
      "D:\\Out\\clip_converted.mp4",
    );
  });

  it("should trim trailing slashes from the output directory", () => {
    assert.equal(
      resolveDestinationPath("clip_converted.mp4", { customOutputDir: "D:\\Out\\\\" }, "C:\\Vids\\clip.mp4"),
      "D:\\Out\\clip_converted.mp4",
    );
  });

  it("should default to the source file enclosing directory", () => {
    assert.equal(
      resolveDestinationPath("clip_trimmed.mp4", {}, "C:\\Vids\\clip.mp4"),
      "C:\\Vids\\clip_trimmed.mp4",
    );
  });

  it("should fall back to settings outputDir, then the Videos folder", () => {
    assert.equal(resolveDestinationPath("out.mp4", { outputDir: "E:\\Media" }, ""), "E:\\Media\\out.mp4");
    assert.equal(resolveDestinationPath("out.mp4", {}, ""), "C:\\Users\\User\\Videos\\out.mp4");
  });

  it("should read the current input from the input box when none is passed", () => {
    document.getElementById("input-file-path").value = "C:\\In\\src.mov";
    try {
      assert.equal(resolveDestinationPath("src_out.mov", {}), "C:\\In\\src_out.mov");
    } finally {
      document.getElementById("input-file-path").value = "";
    }
  });

  it("should honor a custom name typed in the output box", () => {
    document.getElementById("output-file-name").value = "custom.mp4";
    try {
      assert.equal(
        resolveDestinationPath("ignored.mp4", { customOutputDir: "D:\\Out" }, "C:\\Vids\\clip.mp4"),
        "D:\\Out\\custom.mp4",
      );
    } finally {
      document.getElementById("output-file-name").value = "";
    }
  });

  it("should return a full custom path verbatim", () => {
    const full = document.getElementById("output-file-name");
    full.dataset.fullPath = "D:\\Full\\path\\name.mp4";
    try {
      assert.equal(
        resolveDestinationPath("ignored.mp4", { customOutputDir: "D:\\Out" }, "C:\\Vids\\clip.mp4"),
        "D:\\Full\\path\\name.mp4",
      );
    } finally {
      delete full.dataset.fullPath;
    }
  });
});

describe("commands.js: parseTimestampToSeconds", () => {
  it("should parse h:mm:ss, m:ss, and plain seconds", () => {
    assert.equal(parseTimestampCommands("01:02:03"), 3723);
    assert.equal(parseTimestampCommands("02:30"), 150);
    assert.equal(parseTimestampCommands("90"), 90);
  });

  it("should keep fractional seconds", () => {
    assert.equal(parseTimestampCommands("00:00:01.500"), 1.5);
  });

  it("should return 0 for empty or invalid input", () => {
    assert.equal(parseTimestampCommands(""), 0);
    assert.equal(parseTimestampCommands(null), 0);
    assert.equal(parseTimestampCommands("invalid"), 0);
  });
});

describe("commands.js: normalizeYtDlpTemplate", () => {
  it("should ensure exactly one .%(ext)s suffix", () => {
    assert.equal(normalizeYtDlpTemplate("%(title)s.%(ext)s"), "%(title)s.%(ext)s");
    assert.equal(normalizeYtDlpTemplate("%(title)s.%(ext)s.%(ext)s"), "%(title)s.%(ext)s");
    assert.equal(normalizeYtDlpTemplate("%(title)s"), "%(title)s.%(ext)s");
  });

  it("should fall back to the default template when blank", () => {
    const fallback = "%(title)s [%(id)s].%(ext)s";
    assert.equal(normalizeYtDlpTemplate(""), fallback);
    assert.equal(normalizeYtDlpTemplate("   "), fallback);
    assert.equal(normalizeYtDlpTemplate(null), fallback);
    assert.equal(normalizeYtDlpTemplate(undefined), fallback);
  });
});

describe("commands.js: sanitizePlaylistItems", () => {
  it("should accept ranges, lists, and steps", () => {
    assert.equal(sanitizePlaylistItems("1-10,15,20-25"), "1-10,15,20-25");
    assert.equal(sanitizePlaylistItems("1, 2, 3"), "1,2,3");
    assert.equal(sanitizePlaylistItems("1-10:2"), "1-10:2");
  });

  it("should return null for blank, all, or invalid input", () => {
    assert.equal(sanitizePlaylistItems(""), null);
    assert.equal(sanitizePlaylistItems(null), null);
    assert.equal(sanitizePlaylistItems("all"), null);
    assert.equal(sanitizePlaylistItems("ALL"), null);
    assert.equal(sanitizePlaylistItems("abc"), null);
    assert.equal(sanitizePlaylistItems("1;2"), null);
    assert.equal(sanitizePlaylistItems("-"), null);
  });
});

describe("trimmer.js: formatSecondsToTimestamp", () => {
  it("should format as zero-padded HH:MM:SS.mmm", () => {
    assert.equal(formatSecondsToTimestamp(0), "00:00:00.000");
    assert.equal(formatSecondsToTimestamp(61.5), "00:01:01.500");
    assert.equal(formatSecondsToTimestamp(3723.25), "01:02:03.250");
    assert.equal(formatSecondsToTimestamp(59.9999), "00:00:59.999");
  });

  it("should clamp negative and NaN input to zero", () => {
    assert.equal(formatSecondsToTimestamp(-5), "00:00:00.000");
    assert.equal(formatSecondsToTimestamp(NaN), "00:00:00.000");
  });
});

describe("trimmer.js: parseTimestampToSeconds", () => {
  it("should parse h:mm:ss, m:ss, and plain seconds", () => {
    assert.equal(parseTimestampTrimmer("01:02:03"), 3723);
    assert.equal(parseTimestampTrimmer("02:30"), 150);
    assert.equal(parseTimestampTrimmer("90"), 90);
    assert.equal(parseTimestampTrimmer("00:00:01.500"), 1.5);
  });

  it("should return 0 for empty or invalid input", () => {
    assert.equal(parseTimestampTrimmer(""), 0);
    assert.equal(parseTimestampTrimmer(null), 0);
    assert.equal(parseTimestampTrimmer("invalid"), 0);
  });

  it("should round-trip formatted timestamps", () => {
    // Fractions must be exactly representable in binary; the formatter floors
    // to whole milliseconds, so e.g. 86399.999 formats as ...59.998.
    for (const seconds of [0, 1.5, 61.567, 3723.25, 86399.5]) {
      assert.equal(parseTimestampTrimmer(formatSecondsToTimestamp(seconds)), seconds);
    }
  });
});

describe("trimmer.js: file type helpers", () => {
  it("should classify audio files", () => {
    assert.equal(isAudioFile("song.mp3"), true);
    assert.equal(isAudioFile("C:\\Music\\Track.FLAC"), true);
    assert.equal(isAudioFile("voice.ogg?dl=1"), true);
    assert.equal(isAudioFile("movie.mp4"), false);
    assert.equal(isAudioFile("photo.png"), false);
    assert.equal(isAudioFile(""), false);
    assert.equal(isAudioFile(null), false);
  });

  it("should classify image files", () => {
    assert.equal(isImageFile("photo.png"), true);
    assert.equal(isImageFile("photo.JPG"), true);
    assert.equal(isImageFile("graphic.svg"), true);
    assert.equal(isImageFile("movie.mp4"), false);
    assert.equal(isImageFile("song.mp3"), false);
    assert.equal(isImageFile(""), false);
    assert.equal(isImageFile(null), false);
  });

  it("should treat everything else as video", () => {
    assert.equal(isVideoFile("clip.mp4"), true);
    assert.equal(isVideoFile("clip.mkv"), true);
    assert.equal(isVideoFile("song.mp3"), false);
    assert.equal(isVideoFile("photo.png"), false);
    assert.equal(isVideoFile(""), false);
    assert.equal(isVideoFile(null), false);
  });
});
