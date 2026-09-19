// Golden tests for AnEdiKit command builders (commands.js + image_commands.js).
// Each builder is deterministic under the mocked document in test/unit/setup.js
// (all form fields read as ""/false unless a test sets them explicitly, and the
// media probe cache starts empty). Expectations lock the exact CLI output.
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  setCachedMediaProbe,
  buildConvertCommand,
  buildAudioExtractCommand,
  buildTrimCommand,
  buildCompressCommand,
  buildCompressAudioCommand,
  buildAudioTagsCommand,
  buildLoopDurationCommand,
  buildMergeCommand,
  buildMuteReplaceCommand,
  buildGifFramesCommand,
  buildCustomCommand,
  buildYtDlpVideoCommand,
  buildYtDlpAudioCommand,
  buildYtDlpPlaylistCommand,
  buildYtDlpSubtitlesCommand,
  buildSpeedMotionCommand,
  buildAspectCropCommand,
  buildStabilizeCommand,
  buildNormalizeCommand,
  buildCommandForTool,
} from "../../src/js/commands.js";
import {
  resolveImageAiDestinationPath,
  buildBgRemoverCommand,
  buildAiUpscalerCommand,
  buildVectorizerCommand,
  buildRestoreDenoiseCommand,
  buildIconGeneratorCommand,
  buildMetadataCleanerCommand,
} from "../../src/js/image_commands.js";

// Temporarily set form field values on the shared mock document.
function withFields(fields, fn) {
  const prev = new Map();
  for (const [id, props] of Object.entries(fields)) {
    const el = document.getElementById(id);
    prev.set(id, { value: el.value, checked: el.checked, textContent: el.textContent });
    if (props.value !== undefined) el.value = props.value;
    if (props.checked !== undefined) el.checked = props.checked;
    if (props.textContent !== undefined) el.textContent = props.textContent;
  }
  try {
    return fn();
  } finally {
    for (const [id, props] of prev) {
      const el = document.getElementById(id);
      el.value = props.value;
      el.checked = props.checked;
      el.textContent = props.textContent;
    }
  }
}

describe("buildConvertCommand", () => {
  it("should build the default convert command", () => {
    const cmd = buildConvertCommand("C:\\Vids\\clip.mp4", "D:\\Out", {});
    assert.equal(cmd.executable, "ffmpeg");
    assert.equal(cmd.destination, "C:\\Vids\\clip_converted.mp4");
    assert.deepEqual(cmd.args, [
      "-y", "-i", "C:\\Vids\\clip.mp4",
      "-c:v", "libx264", "-crf", "23", "-preset", "medium", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k",
      "-progress", "pipe:1", "C:\\Vids\\clip_converted.mp4",
    ]);
    assert.equal(
      cmd.fullString,
      "ffmpeg -y -i C:\\Vids\\clip.mp4 -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k -progress pipe:1 C:\\Vids\\clip_converted.mp4",
    );
  });

  it("should pass %, &, and spaces through verbatim and quote them", () => {
    const src = "C:\\Media\\Promo_100%_Final & Cut.mp4";
    const cmd = buildConvertCommand(src, "D:\\Out", {});
    assert.equal(cmd.destination, "C:\\Media\\Promo_100%_Final & Cut_converted.mp4");
    assert.ok(cmd.args.includes(src));
    assert.ok(cmd.args.includes("C:\\Media\\Promo_100%_Final & Cut_converted.mp4"));
    assert.ok(cmd.fullString.includes(`"${src}"`));
    assert.ok(cmd.fullString.includes('"C:\\Media\\Promo_100%_Final & Cut_converted.mp4"'));
  });
});

describe("buildAudioExtractCommand", () => {
  it("should build the default audio extract command", () => {
    const cmd = buildAudioExtractCommand("C:\\Music\\song.mp3", "D:\\Out", {});
    assert.equal(cmd.destination, "C:\\Music\\song_extracted.mp3");
    assert.deepEqual(cmd.args, [
      "-y", "-i", "C:\\Music\\song.mp3", "-vn",
      "-c:a", "libmp3lame", "-b:a", "256k",
      "-map_metadata", "0", "-progress", "pipe:1", "C:\\Music\\song_extracted.mp3",
    ]);
  });
});

describe("buildTrimCommand", () => {
  it("should build the default stream-copy trim command", () => {
    const cmd = buildTrimCommand("C:\\Vids\\clip.mp4", "D:\\Out", {});
    assert.equal(cmd.destination, "C:\\Vids\\clip_trimmed.mp4");
    assert.equal(cmd.duration, 60);
    assert.deepEqual(cmd.args, [
      "-y", "-to", "00:01:00.000", "-i", "C:\\Vids\\clip.mp4",
      "-c", "copy", "-map_metadata", "0",
      "-progress", "pipe:1", "C:\\Vids\\clip_trimmed.mp4",
    ]);
  });
});

describe("buildCompressCommand", () => {
  it("should budget bitrate from the discord preset and default duration", () => {
    const cmd = buildCompressCommand("C:\\Vids\\clip.mp4", "D:\\Out", {});
    assert.equal(cmd.destination, "C:\\Vids\\clip_compressed.mp4");
    assert.equal(cmd.duration, 120);
    assert.deepEqual(cmd.args, [
      "-y", "-i", "C:\\Vids\\clip.mp4",
      "-c:v", "libx264", "-b:v", "1460k", "-maxrate", "2044k", "-bufsize", "2920k",
      "-preset", "medium", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "96k",
      "-map_metadata", "0", "-progress", "pipe:1", "C:\\Vids\\clip_compressed.mp4",
    ]);
  });
});

describe("buildCompressAudioCommand", () => {
  it("should build the default opus compress command", () => {
    const cmd = buildCompressAudioCommand("C:\\Music\\song.mp3", "D:\\Out", {});
    assert.equal(cmd.destination, "C:\\Music\\song_compressed.opus");
    assert.equal(cmd.duration, 180);
    assert.deepEqual(cmd.args, [
      "-y", "-i", "C:\\Music\\song.mp3",
      "-c:a", "libopus", "-b:a", "64k", "-vbr", "on", "-compression_level", "10",
      "-map_metadata", "0", "-progress", "pipe:1", "C:\\Music\\song_compressed.opus",
    ]);
  });
});

describe("buildAudioTagsCommand", () => {
  it("should write supplied tags and clear the rest", () => {
    const cmd = buildAudioTagsCommand("C:\\Music\\song.mp3", "D:\\Out", {}, {
      title: "Song & Dance", artist: "A%B", track: "3", totalTracks: "12", year: "2024",
    });
    assert.equal(cmd.destination, "C:\\Music\\song_tagged.mp3");
    assert.deepEqual(cmd.args, [
      "-y", "-i", "C:\\Music\\song.mp3", "-map", "0", "-c", "copy", "-id3v2_version", "3",
      "-metadata", "title=Song & Dance",
      "-metadata", "artist=A%B",
      "-metadata", "album=",
      "-metadata", "album_artist=",
      "-metadata", "genre=",
      "-metadata", "date=2024",
      "-metadata", "year=2024",
      "-metadata", "track=3/12",
      "-metadata", "disc=",
      "-metadata", "composer=",
      "-metadata", "comment=",
      "-progress", "pipe:1", "C:\\Music\\song_tagged.mp3",
    ]);
    assert.ok(cmd.fullString.includes('"title=Song & Dance"'));
  });

  it("should embed a replacement cover with spaced paths quoted", () => {
    const cmd = buildAudioTagsCommand("C:\\Music\\song.mp3", "D:\\Out", {}, {
      title: "T", coverAction: "replace", coverPath: "C:\\Pics\\cover art.png",
    });
    assert.deepEqual(cmd.args.slice(0, 17), [
      "-y", "-i", "C:\\Music\\song.mp3",
      "-i", "C:\\Pics\\cover art.png",
      "-map", "0:a", "-map", "1",
      "-c:a", "copy", "-c:v", "mjpeg",
      "-id3v2_version", "3",
      "-metadata:s:v", "title=Album cover",
    ]);
    assert.ok(cmd.fullString.includes('-i "C:\\Pics\\cover art.png"'));
    assert.ok(cmd.fullString.includes('"title=Album cover"'));
    assert.ok(cmd.fullString.includes('"comment=Cover (front)"'));
  });
});

describe("buildLoopDurationCommand", () => {
  it("should loop to a 1s minimum by default", () => {
    const cmd = buildLoopDurationCommand("C:\\Vids\\sample.mp4", "D:\\Out", {});
    assert.equal(cmd.destination, "C:\\Vids\\sample_looped.mp4");
    assert.equal(cmd.duration, 1);
    assert.deepEqual(cmd.args, [
      "-y", "-stream_loop", "-1", "-i", "C:\\Vids\\sample.mp4", "-t", "1",
      "-c:v", "copy", "-c:a", "copy",
      "-progress", "pipe:1", "C:\\Vids\\sample_looped.mp4",
    ]);
  });

  it("should repeat by count in count mode", () => {
    const cmd = withFields({ "loop-mode": { value: "count" }, "loop-repeat-count": { value: "3" } }, () =>
      buildLoopDurationCommand("C:\\Vids\\sample.mp4", "D:\\Out", {}),
    );
    assert.equal(cmd.duration, 30);
    assert.deepEqual(cmd.args, [
      "-y", "-stream_loop", "2", "-i", "C:\\Vids\\sample.mp4",
      "-c:v", "copy", "-c:a", "copy",
      "-progress", "pipe:1", "C:\\Vids\\sample_looped.mp4",
    ]);
  });
});

describe("buildMergeCommand", () => {
  it("should concat with the demuxer by default", () => {
    const cmd = buildMergeCommand(["C:\\V\\a.mp4", "C:\\V\\b.mp4"], "D:\\Out", {});
    assert.equal(cmd.destination, "C:\\V\\a_merged.mp4");
    assert.deepEqual(cmd.args, [
      "-y", "-f", "concat", "-safe", "0", "-i", "concat_list.txt",
      "-c", "copy", "-map_metadata", "0",
      "-progress", "pipe:1", "C:\\V\\a_merged.mp4",
    ]);
  });

  it("should accept an explicit concat list path and quote spaced names", () => {
    const cmd = buildMergeCommand(
      ["C:\\Media\\Part 1 (100%).mp4", "C:\\Media\\Part 2.mp4"],
      "D:\\Out", {}, "C:\\V\\my list.txt",
    );
    assert.equal(cmd.destination, "C:\\Media\\Part 1 (100%)_merged.mp4");
    assert.ok(cmd.args.includes("C:\\V\\my list.txt"));
    assert.ok(cmd.fullString.includes('-i "C:\\V\\my list.txt"'));
    assert.ok(cmd.fullString.includes('"C:\\Media\\Part 1 (100%)_merged.mp4"'));
  });

  it("should build a re-encode filter graph with sounding inputs", () => {
    const cmd = withFields({ "merge-engine": { value: "filter_complex" } }, () =>
      buildMergeCommand(["C:\\V\\a.mp4", "C:\\V\\b.mp4"], "D:\\Out", {}),
    );
    const graph = "[0:v:0][0:a:0][1:v:0][1:a:0]concat=n=2:v=1:a=1[outv][outa]";
    assert.deepEqual(cmd.args, [
      "-y", "-i", "C:\\V\\a.mp4", "-i", "C:\\V\\b.mp4",
      "-filter_complex", graph, "-map", "[outv]", "-map", "[outa]",
      "-c:v", "libx264", "-crf", "22", "-preset", "medium", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k",
      "-progress", "pipe:1", "C:\\V\\a_merged.mp4",
    ]);
  });

  it("should fall back to video-only concat when all inputs are silent", () => {
    setCachedMediaProbe("C:\\V\\gs_silent1.mp4", { audio_codec: "--" });
    setCachedMediaProbe("C:\\V\\gs_silent2.mp4", { audio_codec: "None" });
    const cmd = withFields({ "merge-engine": { value: "filter_complex" } }, () =>
      buildMergeCommand(["C:\\V\\gs_silent1.mp4", "C:\\V\\gs_silent2.mp4"], "D:\\Out", {}),
    );
    const graph = "[0:v:0][1:v:0]concat=n=2:v=1:a=0[outv]";
    assert.ok(cmd.args.includes(graph));
    assert.ok(!cmd.args.includes("[outa]"));
    assert.ok(!cmd.args.includes("-c:a"));
  });
});

describe("buildMuteReplaceCommand", () => {
  it("should strip audio by default", () => {
    const cmd = buildMuteReplaceCommand("C:\\Vids\\clip.mp4", "D:\\Out", {});
    assert.equal(cmd.destination, "C:\\Vids\\clip_muted.mp4");
    assert.deepEqual(cmd.args, [
      "-y", "-i", "C:\\Vids\\clip.mp4", "-an", "-c:v", "copy",
      "-map_metadata", "0", "-progress", "pipe:1", "C:\\Vids\\clip_muted.mp4",
    ]);
  });

  it("should use the secondary track alone when mixing onto a silent primary", () => {
    setCachedMediaProbe("C:\\Vids\\gs_mix_silent.mp4", { audio_codec: "None" });
    const cmd = withFields({ "mute-action": { value: "mix" } }, () =>
      buildMuteReplaceCommand("C:\\Vids\\gs_mix_silent.mp4", "D:\\Out", {}),
    );
    assert.equal(cmd.destination, "C:\\Vids\\gs_mix_silent_audio_mixed.mp4");
    assert.deepEqual(cmd.args, [
      "-y", "-i", "C:\\Vids\\gs_mix_silent.mp4",
      "-i", "C:\\Users\\User\\Music\\background_audio.mp3",
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
      "-map_metadata", "0", "-progress", "pipe:1", "C:\\Vids\\gs_mix_silent_audio_mixed.mp4",
    ]);
  });
});

describe("buildGifFramesCommand", () => {
  it("should build the high-quality palette GIF by default", () => {
    const cmd = buildGifFramesCommand("C:\\Vids\\clip.mp4", "D:\\Out", {});
    assert.equal(cmd.destination, "C:\\Vids\\clip_animated.gif");
    assert.equal(cmd.duration, 5);
    assert.deepEqual(cmd.args, [
      "-y", "-t", "5", "-i", "C:\\Vids\\clip.mp4",
      "-filter_complex", "[0:v]fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:reserve_transparent=0[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3",
      "-progress", "pipe:1", "C:\\Vids\\clip_animated.gif",
    ]);
  });

  it("should capture a single snapshot in snapshot mode", () => {
    const cmd = withFields({ "gif-mode": { value: "snapshot" } }, () =>
      buildGifFramesCommand("C:\\Vids\\clip.mp4", "D:\\Out", {}),
    );
    assert.equal(cmd.destination, "C:\\Vids\\clip_snapshot.png");
    assert.equal(cmd.duration, 1.0);
    assert.deepEqual(cmd.args, [
      "-y", "-i", "C:\\Vids\\clip.mp4", "-frames:v", "1",
      "-vf", "scale=480:-1:flags=lanczos",
      "-progress", "pipe:1", "C:\\Vids\\clip_snapshot.png",
    ]);
  });
});

describe("buildCustomCommand", () => {
  it("should pass through with no custom args", () => {
    const cmd = buildCustomCommand("C:\\Vids\\clip.mp4", "D:\\Out", {});
    assert.deepEqual(cmd.args, [
      "-y", "-i", "C:\\Vids\\clip.mp4",
      "-progress", "pipe:1", "C:\\Vids\\clip_custom.mp4",
    ]);
  });

  it("should tokenize quoted custom args and strip the quotes", () => {
    const cmd = withFields({ "custom-args": { value: '-vf "scale=1280:-1" -crf 20' } }, () =>
      buildCustomCommand("C:\\Vids\\clip.mp4", "D:\\Out", {}),
    );
    assert.deepEqual(cmd.args, [
      "-y", "-i", "C:\\Vids\\clip.mp4",
      "-vf", "scale=1280:-1", "-crf", "20",
      "-progress", "pipe:1", "C:\\Vids\\clip_custom.mp4",
    ]);
  });
});

describe("buildYtDlpVideoCommand", () => {
  const url = "https://www.youtube.com/watch?v=abc123&list=PLxyz";

  it("should build the default video download command", () => {
    const cmd = buildYtDlpVideoCommand(url, "D:\\Out", { outputDir: "D:\\DL" });
    assert.equal(cmd.executable, "yt-dlp");
    assert.equal(cmd.destination, "D:\\DL");
    assert.deepEqual(cmd.args, [
      "--no-playlist",
      "-f", "bv*+ba/b",
      "-S", "vcodec:h264,acodec:aac,ext:mp4",
      "--merge-output-format", "mp4",
      "--retries", "10",
      "--fragment-retries", "10",
      "--socket-timeout", "15",
      "--compat-options", "manifest-filesize-approx",
      "--extractor-args", "youtube:player_client=android,web",
      "--no-mtime",
      "--restrict-filenames",
      "--trim-filenames", "249",
      "-P", "D:\\DL",
      "-o", "%(title)s [%(id)s].%(ext)s",
      url,
    ]);
    assert.equal(
      cmd.fullString,
      `yt-dlp --no-playlist -f bv*+ba/b -S vcodec:h264,acodec:aac,ext:mp4 --merge-output-format mp4 --retries 10 --fragment-retries 10 --socket-timeout 15 --compat-options manifest-filesize-approx --extractor-args youtube:player_client=android,web --no-mtime --restrict-filenames --trim-filenames 249 -P D:\\DL -o "%(title)s [%(id)s].%(ext)s" ${url}`,
    );
  });

  it("should embed subs, thumbnail, and metadata when checked", () => {
    const cmd = withFields({
      "dl-video-embed-subs": { checked: true },
      "dl-video-embed-thumb": { checked: true },
      "dl-video-embed-meta": { checked: true },
    }, () => buildYtDlpVideoCommand(url, "D:\\Out", { outputDir: "D:\\DL" }));
    assert.deepEqual(cmd.args.slice(5, 21), [
      "--merge-output-format", "mp4",
      "--embed-subs", "--write-subs", "--write-auto-subs",
      "--sub-langs", "en.*-orig,en.*,.*-orig",
      "--sub-format", "srt/best",
      "--convert-subs", "srt",
      "--embed-thumbnail", "--convert-thumbnails", "jpg",
      "--embed-metadata", "--embed-chapters",
    ]);
  });

  it("should use android,ios clients for music.youtube.com URLs", () => {
    const cmd = buildYtDlpVideoCommand("https://music.youtube.com/watch?v=x", "D:\\Out", { outputDir: "D:\\DL" });
    const i = cmd.args.indexOf("--extractor-args");
    assert.equal(cmd.args[i + 1], "youtube:player_client=android,ios");
  });
});

describe("buildYtDlpAudioCommand", () => {
  it("should build the default audio download command", () => {
    const url = "https://www.youtube.com/watch?v=abc123";
    const cmd = buildYtDlpAudioCommand(url, "D:\\Out", { outputDir: "D:\\DL" });
    assert.deepEqual(cmd.args, [
      "-f", "ba/b",
      "-S", "acodec:mp3,aext:mp3",
      "--no-playlist",
      "-x", "--audio-format", "mp3", "--audio-quality", "0",
      "--retries", "10",
      "--fragment-retries", "10",
      "--socket-timeout", "15",
      "--compat-options", "manifest-filesize-approx",
      "--extractor-args", "youtube:player_client=android,web",
      "--no-mtime",
      "--restrict-filenames",
      "--trim-filenames", "249",
      "-P", "D:\\DL",
      "-o", "%(title)s [%(id)s].%(ext)s",
      url,
    ]);
  });
});

describe("buildYtDlpPlaylistCommand", () => {
  const url = "https://www.youtube.com/playlist?list=PLxyz";

  it("should build the default playlist download command", () => {
    const cmd = buildYtDlpPlaylistCommand(url, "D:\\Out", { outputDir: "D:\\DL" });
    assert.deepEqual(cmd.args, [
      "--yes-playlist",
      "-f", "bv*[height<=1080]+ba/b[height<=1080]/b[height<=1080]/b",
      "-S", "res:1080,vcodec:h264,acodec:aac,ext:mp4",
      "--merge-output-format", "mp4",
      "--embed-thumbnail", "--convert-thumbnails", "jpg", "--embed-metadata",
      "--retries", "10",
      "--fragment-retries", "10",
      "--socket-timeout", "15",
      "--compat-options", "manifest-filesize-approx",
      "--extractor-args", "youtube:player_client=android,web",
      "--no-mtime",
      "--restrict-filenames",
      "--trim-filenames", "249",
      "-P", "D:\\DL",
      "-o", "%(playlist_title)s/%(title)s [%(id)s].%(ext)s",
      url,
    ]);
  });

  it("should filter selected indices to positive integers", () => {
    const cmd = buildYtDlpPlaylistCommand(url, "D:\\Out", { outputDir: "D:\\DL" }, ["3", "1", "x", "0", "-2"]);
    assert.ok(cmd.args.includes("--playlist-items"));
    assert.equal(cmd.args[cmd.args.indexOf("--playlist-items") + 1], "3,1");
  });

  it("should fail fast on invalid playlist ranges", () => {
    assert.throws(
      () => withFields({ "dl-playlist-items": { value: "abc" } }, () =>
        buildYtDlpPlaylistCommand(url, "D:\\Out", { outputDir: "D:\\DL" })),
      /Invalid playlist range "abc"/,
    );
  });
});

describe("buildYtDlpSubtitlesCommand", () => {
  it("should build the default subtitle fetch command", () => {
    const url = "https://www.youtube.com/watch?v=abc123";
    const cmd = buildYtDlpSubtitlesCommand(url, "D:\\Out", { outputDir: "D:\\DL" });
    assert.deepEqual(cmd.args, [
      "--skip-download", "-i",
      "--write-subs", "--sub-langs", "en",
      "--sub-format", "srt/best", "--convert-subs", "srt",
      "--retries", "10",
      "--fragment-retries", "10",
      "--socket-timeout", "15",
      "--compat-options", "manifest-filesize-approx",
      "--extractor-args", "youtube:player_client=android,web",
      "--no-mtime",
      "--restrict-filenames",
      "--trim-filenames", "249",
      "-P", "D:\\DL",
      "-o", "%(title)s [%(id)s].%(ext)s",
      url,
    ]);
  });
});

describe("buildSpeedMotionCommand", () => {
  it("should build the default 2x atempo command", () => {
    const cmd = buildSpeedMotionCommand("C:\\Vids\\clip.mp4", "D:\\Out", {}, null);
    assert.equal(cmd.destination, "C:\\Vids\\clip_2x.mp4");
    assert.equal(cmd.duration, null);
    const graph = "[0:v]setpts=0.500000*PTS[v];[0:a]atempo=2.0000[a]";
    assert.deepEqual(cmd.args, [
      "-y", "-i", "C:\\Vids\\clip.mp4",
      "-filter_complex", graph, "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-crf", "22", "-preset", "medium", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k",
      "-progress", "pipe:1", "C:\\Vids\\clip_2x.mp4",
    ]);
    assert.ok(cmd.fullString.includes(`"${graph}"`));
  });
});

describe("buildAspectCropCommand", () => {
  it("should center-crop to 9:16 by default", () => {
    const cmd = buildAspectCropCommand("C:\\Vids\\clip.mp4", "D:\\Out", {}, null);
    assert.equal(cmd.destination, "C:\\Vids\\clip_9x16.mp4");
    assert.deepEqual(cmd.args, [
      "-y", "-i", "C:\\Vids\\clip.mp4",
      "-vf", "crop='min(iw,ih*(9/16))':'min(ih,iw*(16/9))'",
      "-c:v", "libx264", "-crf", "23", "-preset", "medium", "-pix_fmt", "yuv420p",
      "-c:a", "copy",
      "-progress", "pipe:1", "C:\\Vids\\clip_9x16.mp4",
    ]);
  });
});

describe("buildStabilizeCommand", () => {
  it("should deshake with medium smoothing and crop borders by default", () => {
    const cmd = buildStabilizeCommand("C:\\Vids\\clip.mp4", "D:\\Out", {}, null);
    assert.equal(cmd.destination, "C:\\Vids\\clip_stabilized.mp4");
    assert.deepEqual(cmd.args, [
      "-y", "-i", "C:\\Vids\\clip.mp4",
      "-vf", "deshake=rx=32:ry=32:edge=mirror:blocksize=32:contrast=125:search=0,crop=iw*0.92:ih*0.92,scale=iw:ih",
      "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p",
      "-c:a", "copy", "-progress", "pipe:1", "C:\\Vids\\clip_stabilized.mp4",
    ]);
  });
});

describe("buildNormalizeCommand", () => {
  it("should loudnorm video with stream-copied video by default", () => {
    const cmd = buildNormalizeCommand("C:\\Vids\\clip.mp4", "D:\\Out", {}, null);
    assert.equal(cmd.destination, "C:\\Vids\\clip_normalized.mp4");
    assert.deepEqual(cmd.args, [
      "-y", "-i", "C:\\Vids\\clip.mp4",
      "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.0:LRA=11", "-c:a", "aac",
      "-b:a", "256k",
      "-progress", "pipe:1", "C:\\Vids\\clip_normalized.mp4",
    ]);
  });

  it("should emit audio-only output for audio inputs", () => {
    const cmd = buildNormalizeCommand("C:\\Music\\song.mp3", "D:\\Out", {}, null);
    assert.equal(cmd.destination, "C:\\Music\\song_normalized.m4a");
    assert.deepEqual(cmd.args, [
      "-y", "-i", "C:\\Music\\song.mp3",
      "-vn", "-af", "loudnorm=I=-14:TP=-1.0:LRA=11", "-c:a", "aac",
      "-b:a", "256k",
      "-progress", "pipe:1", "C:\\Music\\song_normalized.m4a",
    ]);
  });
});

describe("buildCommandForTool", () => {
  it("should dispatch to the per-tool builder", () => {
    assert.deepEqual(
      buildCommandForTool("convert", "C:\\Vids\\clip.mp4", "D:\\Out", {}),
      buildConvertCommand("C:\\Vids\\clip.mp4", "D:\\Out", {}),
    );
    const ytdlp = buildCommandForTool("ytdlp_video", null, "D:\\Out", { outputDir: "D:\\DL" }, { url: "https://www.youtube.com/watch?v=abc123" });
    assert.equal(ytdlp.executable, "yt-dlp");
    assert.ok(ytdlp.args.includes("https://www.youtube.com/watch?v=abc123"));
  });

  it("should pass merge file lists through extraParams", () => {
    const cmd = buildCommandForTool("merge", null, "D:\\Out", {}, { mergeFiles: ["C:\\V\\a.mp4"] });
    assert.equal(cmd.destination, "C:\\V\\a_merged.mp4");
  });

  it("should fall back to convert for unknown tool ids", () => {
    assert.deepEqual(
      buildCommandForTool("nope", "C:\\Vids\\clip.mp4", "D:\\Out", {}),
      buildConvertCommand("C:\\Vids\\clip.mp4", "D:\\Out", {}),
    );
  });
});

describe("resolveImageAiDestinationPath", () => {
  it("should prefer the source enclosing directory, then settings, then Pictures", () => {
    assert.equal(
      resolveImageAiDestinationPath("f_nobg.png", {}, "C:\\Pics\\a.png"),
      "C:\\Pics\\f_nobg.png",
    );
    assert.equal(
      resolveImageAiDestinationPath("f_nobg.png", { outputDir: "D:\\Out" }, ""),
      "D:\\Out\\f_nobg.png",
    );
    assert.equal(
      resolveImageAiDestinationPath("f_nobg.png", {}, ""),
      "C:\\Users\\User\\Pictures\\f_nobg.png",
    );
  });

  it("should trim trailing separators and use posix separators for posix dirs", () => {
    assert.equal(
      resolveImageAiDestinationPath("f.png", { outputDir: "D:\\Out\\\\" }, ""),
      "D:\\Out\\f.png",
    );
    assert.equal(
      resolveImageAiDestinationPath("f.png", {}, "home/u/a.png"),
      "home/u/f.png",
    );
  });
});

describe("buildBgRemoverCommand", () => {
  it("should build the default u2net transparent command", () => {
    const cmd = buildBgRemoverCommand("C:\\Pics\\photo.png", "D:\\Out", {});
    assert.equal(cmd.executable, "image_ai");
    assert.equal(cmd.task, "bg_remover");
    assert.equal(cmd.destination, "C:\\Pics\\photo_nobg.png");
    assert.deepEqual(cmd.params, {
      input_path: "C:\\Pics\\photo.png",
      output_path: "C:\\Pics\\photo_nobg.png",
      model: "u2net",
      output_mode: "transparent",
      bg_color: "#ffffff",
      blur_radius: 25,
      replace_source: false,
      device: "auto",
      fake_tile_size: 0,
      fake_grid_tolerance: 14,
      fake_gap_threshold: 15,
    });
    assert.equal(
      cmd.fullString,
      'python src/py/image_ai_engine.py --task bg_remover --params "{\\"input_path\\":\\"C:\\\\Pics\\\\photo.png\\",\\"output_path\\":\\"C:\\\\Pics\\\\photo_nobg.png\\",\\"model\\":\\"u2net\\",\\"output_mode\\":\\"transparent\\",\\"bg_color\\":\\"#ffffff\\",\\"blur_radius\\":25,\\"replace_source\\":false,\\"device\\":\\"auto\\",\\"fake_tile_size\\":0,\\"fake_grid_tolerance\\":14,\\"fake_gap_threshold\\":15}"',
    );
  });

  it("should force png output when replacing a jpeg source", () => {
    const cmd = withFields({ "ai-replace-source": { checked: true } }, () =>
      buildBgRemoverCommand("C:\\Pics\\shot.jpg", "D:\\Out", {}),
    );
    assert.equal(cmd.destination, "C:\\Pics\\shot.png");
    assert.equal(cmd.params.replace_source, true);
  });
});

describe("buildAiUpscalerCommand", () => {
  it("should build the default 2x upscale command", () => {
    const cmd = buildAiUpscalerCommand("C:\\Pics\\photo.png", "D:\\Out", {});
    assert.equal(cmd.task, "ai_upscaler");
    assert.equal(cmd.destination, "C:\\Pics\\photo_2x_upscaled.png");
    assert.deepEqual(cmd.params, {
      input_path: "C:\\Pics\\photo.png",
      output_path: "C:\\Pics\\photo_2x_upscaled.png",
      scale: 2,
      model: "realesrgan-x4plus",
      denoise: 0,
      replace_source: false,
      device: "auto",
    });
  });

  it("should swap jpg output to png to preserve quality", () => {
    const cmd = buildAiUpscalerCommand("C:\\Pics\\photo.jpg", "D:\\Out", {});
    assert.equal(cmd.destination, "C:\\Pics\\photo_2x_upscaled.png");
  });
});

describe("buildVectorizerCommand", () => {
  it("should build the default color vectorize command", () => {
    const cmd = buildVectorizerCommand("C:\\Pics\\graphic.png", "D:\\Out", {});
    assert.equal(cmd.task, "vectorizer");
    assert.equal(cmd.destination, "C:\\Pics\\graphic_vector.svg");
    assert.deepEqual(cmd.params, {
      input_path: "C:\\Pics\\graphic.png",
      output_path: "C:\\Pics\\graphic_vector.svg",
      mode: "color",
      num_colors: 8,
      tolerance: 1,
      monochrome_color: "#000000",
      replace_source: false,
      device: "auto",
    });
  });
});

describe("buildRestoreDenoiseCommand", () => {
  it("should build the default nlmeans restore command", () => {
    const cmd = buildRestoreDenoiseCommand("C:\\Pics\\photo.png", "D:\\Out", {});
    assert.equal(cmd.task, "restore_denoise");
    assert.equal(cmd.destination, "C:\\Pics\\photo_restored.png");
    assert.deepEqual(cmd.params, {
      input_path: "C:\\Pics\\photo.png",
      output_path: "C:\\Pics\\photo_restored.png",
      method: "nlmeans",
      strength: 10,
      replace_source: false,
      device: "auto",
    });
  });
});

describe("buildIconGeneratorCommand", () => {
  it("should target a per-logo icons folder by default", () => {
    const cmd = buildIconGeneratorCommand("C:\\Pics\\logo.png", "D:\\Out", {});
    assert.equal(cmd.task, "icon_generator");
    assert.equal(cmd.destination, "C:\\Users\\User\\Pictures\\logo_icons");
    assert.deepEqual(cmd.params, {
      input_path: "C:\\Pics\\logo.png",
      output_dir: "C:\\Users\\User\\Pictures\\logo_icons",
      fit_mode: "contain",
      bg_color: "transparent",
      device: "auto",
    });
  });

  it("should honor settings outputDir for the icons folder", () => {
    const cmd = buildIconGeneratorCommand("C:\\Pics\\logo.png", "D:\\Out", { outputDir: "D:\\Out" });
    assert.equal(cmd.destination, "D:\\Out\\logo_icons");
  });
});

describe("buildMetadataCleanerCommand", () => {
  it("should build the default strip-all command", () => {
    const cmd = buildMetadataCleanerCommand("C:\\Pics\\photo.jpg", "D:\\Out", {});
    assert.equal(cmd.task, "metadata_cleaner");
    assert.equal(cmd.destination, "C:\\Pics\\photo_clean.jpg");
    assert.deepEqual(cmd.params, {
      input_path: "C:\\Pics\\photo.jpg",
      output_path: "C:\\Pics\\photo_clean.jpg",
      action: "strip_all",
      replace_source: false,
      device: "auto",
    });
  });

  it("should write back to the source when replacing", () => {
    const cmd = withFields({ "ai-replace-source": { checked: true } }, () =>
      buildMetadataCleanerCommand("C:\\Pics\\photo.jpg", "D:\\Out", {}),
    );
    assert.equal(cmd.destination, "C:\\Pics\\photo.jpg");
    assert.equal(cmd.params.replace_source, true);
  });
});
