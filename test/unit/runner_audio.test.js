// Coverage for runner.js state/log helpers and audio_tags tag/cover/execute flows.
import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  isJobRunning,
  isCancelRequested,
  resetCancelFlag,
  cancelFfmpegJob,
  appendLog,
  clearLogs,
  setControlsDisabledState,
} from "../../src/js/runner.js";
import "../../src/js/audio_tags/render.js"; // register bridge render handlers
import {
  getAudioTagQueue,
  getSelectedTrackIndex,
  addAudioFilesToQueue,
  clearAudioTagQueue,
  selectTrack,
  parseFilenameTags,
  loadTrackIntoForm,
  syncActiveTrackFromForm,
  isTrackModified,
  setChangeCallback,
} from "../../src/js/audio_tags/queue.js";
import {
  autoFillActiveTrack,
  revertActiveTrack,
  clearActiveTrackTags,
} from "../../src/js/audio_tags/tags.js";
import { setRemoveCoverArmed } from "../../src/js/audio_tags/cover.js";
import { executeAudioTagsQueue } from "../../src/js/audio_tags/execute.js";

describe("runner.js: job-state flags", () => {
  it("starts idle with no cancel requested", () => {
    assert.equal(isJobRunning(), false);
    assert.equal(isCancelRequested(), false);
  });

  it("resetCancelFlag and idle cancel are safe no-ops", () => {
    assert.doesNotThrow(() => {
      resetCancelFlag();
      cancelFfmpegJob();
    });
    assert.equal(isJobRunning(), false);
  });
});

describe("runner.js: log console classification and controls", () => {
  beforeEach(() => {
    const lc = document.getElementById("log-console");
    lc.children.length = 0;
    lc.innerHTML = "";
  });

  it("classifies lines into severity CSS classes", () => {
    appendLog("conversion failed miserably");
    appendLog("WARNING: PO token missing, Error 403 advisory");
    appendLog("Job success, 100% done");
    appendLog("frame= 12 fps=30");
    const kids = document.getElementById("log-console").children;
    assert.equal(kids[0].className, "text-danger");
    assert.equal(kids[1].className, "text-warning");
    assert.equal(kids[2].className, "text-success");
    assert.equal(kids[3].className, "text-body-secondary");
    for (const k of kids) assert.ok(k.textContent.length > 0);
  });

  it("clearLogs and setControlsDisabledState do not throw", () => {
    appendLog("hello");
    assert.doesNotThrow(() => {
      clearLogs();
      setControlsDisabledState(true);
      setControlsDisabledState(false);
    });
    assert.equal(document.getElementById("log-console").innerHTML, "");
  });
});

describe("audio_tags: filename parsing", () => {
  it("parses track/artist/album/title segments", () => {
    assert.deepEqual(parseFilenameTags("03 - Artist - Album - Title.mp3"), {
      track: "03",
      artist: "Artist",
      album: "Album",
      title: "Title",
    });
    const two = parseFilenameTags("Artist - Title.flac");
    assert.equal(two.artist, "Artist");
    assert.equal(two.title, "Title");
    const plain = parseFilenameTags("plain.mp3");
    assert.equal(plain.artist, "");
    assert.ok(plain.title.includes("plain"));
  });
});

describe("audio_tags: tag field flows", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAudioTagQueue();
    setChangeCallback(null);
  });

  it("autoFill parses the file name into form and track", async () => {
    await addAudioFilesToQueue(["C:/m/02 - Daft Punk - One More Time.mp3"]);
    assert.equal(getSelectedTrackIndex(), 0);
    autoFillActiveTrack();
    const track = getAudioTagQueue()[0];
    assert.equal(track.title, "One More Time");
    assert.equal(track.artist, "Daft Punk");
    assert.equal(track.track, "02");
    assert.equal(document.getElementById("tag-title").value, "One More Time");
    assert.equal(document.getElementById("tag-artist").value, "Daft Punk");
  });

  it("revert restores original metadata and ignores missing originals", async () => {
    await addAudioFilesToQueue(["C:/m/song.mp3"]);
    const track = getAudioTagQueue()[0];
    track.title = "Mutated";
    revertActiveTrack(); // no originalMeta yet -> no-op
    assert.equal(track.title, "Mutated");
    track.originalMeta = { title: "OG Title", artist: "OG Artist" };
    revertActiveTrack();
    assert.equal(track.title, "OG Title");
    assert.equal(track.artist, "OG Artist");
    assert.equal(document.getElementById("tag-title").value, "OG Title");
  });

  it("clear wipes fields, flags removal, and marks modified", async () => {
    await addAudioFilesToQueue(["C:/m/song.mp3"]);
    clearActiveTrackTags();
    const track = getAudioTagQueue()[0];
    assert.equal(track.title, "");
    assert.equal(track.coverAction, "remove");
    assert.equal(track.status, "modified");
    assert.equal(document.getElementById("tag-title").value, "");
  });

  it("form round-trip tracks modification state", async () => {
    await addAudioFilesToQueue(["C:/m/song.mp3"]);
    selectTrack(0);
    const track = getAudioTagQueue()[0];
    document.getElementById("tag-title").value = "Edited";
    syncActiveTrackFromForm();
    assert.equal(track.title, "Edited");
    assert.equal(isTrackModified(track), true); // no originalMeta yet
    track.originalMeta = {
      title: "Edited",
      artist: track.artist,
      album: track.album,
      album_artist: track.albumArtist,
      track: track.track,
      total_tracks: track.totalTracks,
      disc: track.disc,
      year: track.year,
      genre: track.genre,
      composer: track.composer,
      comment: track.comment,
    };
    assert.equal(isTrackModified(track), false);
    track.title = "Changed again";
    assert.equal(isTrackModified(track), true);
  });

  it("invalid selection is ignored", async () => {
    await addAudioFilesToQueue(["C:/m/song.mp3"]);
    selectTrack(99);
    assert.equal(getSelectedTrackIndex(), 0);
  });
});

describe("audio_tags: cover remove arming", () => {
  it("toggles the confirm affordance and disarms", () => {
    const btn = document.getElementById("btn-tag-remove-cover");
    setRemoveCoverArmed(true);
    assert.ok(btn.classList.contains("btn-danger"));
    setRemoveCoverArmed(false);
    assert.ok(btn.classList.contains("btn-outline-danger"));
    assert.ok(!btn.classList.contains("btn-danger"));
  });
});

describe("audio_tags: execute validation paths", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAudioTagQueue();
    setChangeCallback(null);
  });

  it("no-ops on an empty queue", async () => {
    let ran = 0;
    await assert.doesNotReject(async () => {
      await executeAudioTagsQueue(
        async () => { ran += 1; },
        () => false,
        () => {},
      );
    });
    assert.equal(ran, 0);
  });

  it("honours immediate cancellation without executing", async () => {
    await addAudioFilesToQueue(["C:/m/song.mp3"]);
    let ran = 0;
    let resets = 0;
    await executeAudioTagsQueue(
      async () => { ran += 1; },
      () => true,
      () => { resets += 1; },
    );
    assert.equal(ran, 0);
    assert.equal(resets, 1);
  });

  it("loadTrackIntoForm is a safe no-op for missing tracks", async () => {
    await assert.doesNotReject(async () => {
      loadTrackIntoForm(null);
      loadTrackIntoForm(undefined);
    });
  });
});
