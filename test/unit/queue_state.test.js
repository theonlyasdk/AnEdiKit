// State and queue logic tests: Image AI queue, Audio Tag queue, settings persistence.
// Pure state transitions over the module-level queues plus storage round-trips.
import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  getImageAiQueue,
  addImageFilesToQueue,
  updateImageAiItemStatus,
  removeImageAiQueueItem,
  clearImageAiQueue,
} from "../../src/js/image_queue.js";
import {
  getAudioTagQueue,
  getSelectedTrackIndex,
  addAudioFilesToQueue,
  clearAudioTagQueue,
  removeTrackFromQueue,
  selectTrack,
  initSavedAudioTagQueue,
} from "../../src/js/audio_tags.js";
import {
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  loadSettings,
  saveSettings,
  loadSavedAudioTagQueue,
  saveAudioTagQueue,
} from "../../src/js/storage.js";
import { getAppSettings, setAppSettings } from "../../src/js/app_settings.js";

describe("Queue state: image_queue.js", () => {
  beforeEach(() => {
    localStorage.clear();
    clearImageAiQueue();
  });

  it("adds unique image paths and ignores duplicates", async () => {
    await addImageFilesToQueue(["C:/imgs/a.png", "C:/imgs/b.jpg", "C:/imgs/a.png"]);
    const queue = getImageAiQueue();
    assert.equal(queue.length, 2);
    assert.deepEqual(
      queue.map((i) => i.name),
      ["a.png", "b.jpg"],
    );
    assert.ok(queue.every((i) => i.status === "pending" && i.resultPath === null));
  });

  it("skips empty input without touching the queue", async () => {
    await addImageFilesToQueue([]);
    assert.equal(getImageAiQueue().length, 0);
    await addImageFilesToQueue([null, "", undefined]);
    assert.equal(getImageAiQueue().length, 0);
  });

  it("updates item status and resultPath by index", async () => {
    await addImageFilesToQueue(["C:/imgs/a.png", "C:/imgs/b.jpg"]);
    updateImageAiItemStatus(1, "done", "C:/out/b_nobg.png");
    const q = getImageAiQueue();
    assert.equal(q[0].status, "pending");
    assert.equal(q[1].status, "done");
    assert.equal(q[1].resultPath, "C:/out/b_nobg.png");

    // A later status update without a resultPath keeps the existing one.
    updateImageAiItemStatus(1, "processing");
    assert.equal(q[1].status, "processing");
    assert.equal(q[1].resultPath, "C:/out/b_nobg.png");
  });

  it("ignores out-of-range status updates", async () => {
    await addImageFilesToQueue(["C:/imgs/a.png"]);
    assert.doesNotThrow(() => {
      updateImageAiItemStatus(-1, "done");
      updateImageAiItemStatus(5, "done");
    });
    assert.equal(getImageAiQueue()[0].status, "pending");
  });

  it("removes a single item by index and no-ops out of range", async () => {
    await addImageFilesToQueue(["C:/imgs/a.png", "C:/imgs/b.jpg", "C:/imgs/c.webp"]);
    removeImageAiQueueItem(1);
    assert.deepEqual(
      getImageAiQueue().map((i) => i.name),
      ["a.png", "c.webp"],
    );
    removeImageAiQueueItem(-1);
    removeImageAiQueueItem(99);
    assert.equal(getImageAiQueue().length, 2);
  });

  it("clears the queue and persists it", async () => {
    await addImageFilesToQueue(["C:/imgs/a.png", "C:/imgs/b.jpg"]);
    assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEYS.IMAGE_AI_QUEUE)).length, 2);

    clearImageAiQueue();
    assert.equal(getImageAiQueue().length, 0);
    assert.deepEqual(JSON.parse(localStorage.getItem(STORAGE_KEYS.IMAGE_AI_QUEUE)), []);
  });
});

describe("Queue state: audio_tags.js", () => {
  const TRACKS = ["C:/music/a.mp3", "C:/music/b.flac", "C:/music/c.wav"];

  beforeEach(async () => {
    localStorage.clear();
    clearAudioTagQueue();
    await addAudioFilesToQueue(TRACKS);
  });

  it("adds valid audio tracks, skipping non-audio and duplicates", async () => {
    assert.equal(getAudioTagQueue().length, 3);
    assert.deepEqual(
      getAudioTagQueue().map((t) => t.fileName),
      ["a.mp3", "b.flac", "c.wav"],
    );

    const skipped = await addAudioFilesToQueue(["C:/music/notes.txt"]);
    assert.deepEqual(skipped, { added: 0, duplicate: 0 });

    const duplicate = await addAudioFilesToQueue(["C:/music/a.mp3"]);
    assert.deepEqual(duplicate, { added: 0, duplicate: 1 });
    assert.equal(getAudioTagQueue().length, 3);
  });

  it("selects tracks by index and ignores redundant or invalid selections", () => {
    assert.equal(getSelectedTrackIndex(), 0);
    selectTrack(2);
    assert.equal(getSelectedTrackIndex(), 2);

    selectTrack(2);
    assert.equal(getSelectedTrackIndex(), 2);

    selectTrack(-1);
    selectTrack(42);
    assert.equal(getSelectedTrackIndex(), 2);
  });

  it("shifts selection when an earlier track is removed", () => {
    selectTrack(2);
    removeTrackFromQueue(0);
    assert.equal(getSelectedTrackIndex(), 1);
    assert.deepEqual(
      getAudioTagQueue().map((t) => t.fileName),
      ["b.flac", "c.wav"],
    );
  });

  it("re-selects the following track when the selected one is removed", () => {
    selectTrack(0);
    removeTrackFromQueue(0);
    assert.equal(getSelectedTrackIndex(), 0);
    assert.equal(getAudioTagQueue()[0].fileName, "b.flac");
  });

  it("ignores out-of-range removals", () => {
    removeTrackFromQueue(-1);
    removeTrackFromQueue(3);
    assert.equal(getAudioTagQueue().length, 3);
  });

  it("clears the queue and resets selection", () => {
    selectTrack(1);
    clearAudioTagQueue();
    assert.equal(getAudioTagQueue().length, 0);
    assert.equal(getSelectedTrackIndex(), -1);
  });

  it("persists the queue to storage on add, remove, and clear", async () => {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.AUDIO_TAG_QUEUE));
    assert.equal(saved.length, 3);
    assert.deepEqual(
      saved.map((t) => t.filePath),
      TRACKS,
    );
    // Volatile payload (cover bytes, loaded file metadata, statuses) is
    // never written to storage.
    assert.ok(saved.every((t) => !("coverDataUrl" in t) && !("originalMeta" in t) && !("status" in t)));

    removeTrackFromQueue(0);
    assert.deepEqual(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.AUDIO_TAG_QUEUE)).map((t) => t.filePath),
      TRACKS.slice(1),
    );

    clearAudioTagQueue();
    assert.deepEqual(JSON.parse(localStorage.getItem(STORAGE_KEYS.AUDIO_TAG_QUEUE)), []);
  });

  it("restores saved tracks with user edits on init", async () => {
    clearAudioTagQueue();
    saveAudioTagQueue([
      {
        filePath: "C:/music/a.mp3",
        fileName: "a.mp3",
        ext: "mp3",
        title: "My Edit",
        artist: "Edited Artist",
        album: "",
        albumArtist: "",
        track: "",
        totalTracks: "",
        disc: "",
        year: "",
        genre: "",
        composer: "",
        comment: "",
        coverAction: "none",
        chosenCoverPath: "",
      },
      {
        filePath: "C:/music/b.flac",
        fileName: "b.flac",
        ext: "flac",
        title: "b",
        artist: "",
        album: "",
        albumArtist: "",
        track: "",
        totalTracks: "",
        disc: "",
        year: "",
        genre: "",
        composer: "",
        comment: "",
        coverAction: "none",
        chosenCoverPath: "",
      },
    ]);

    await initSavedAudioTagQueue();

    const queue = getAudioTagQueue();
    assert.equal(queue.length, 2);
    assert.equal(queue[0].title, "My Edit");
    assert.equal(queue[0].artist, "Edited Artist");
    assert.equal(getSelectedTrackIndex(), 0);
    assert.ok(queue.every((t) => t.metaLoaded && t.status === "ready"));
  });

  it("restores an empty queue when nothing is stored", async () => {
    clearAudioTagQueue();
    localStorage.removeItem(STORAGE_KEYS.AUDIO_TAG_QUEUE);
    await initSavedAudioTagQueue();
    assert.equal(getAudioTagQueue().length, 0);
    assert.equal(getSelectedTrackIndex(), -1);
  });
});

describe("Audio tag queue persistence: storage.js", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("drops volatile and pathless entries on load", () => {
    localStorage.setItem(
      STORAGE_KEYS.AUDIO_TAG_QUEUE,
      JSON.stringify([
        {
          filePath: "C:/m/a.mp3",
          title: "T",
          coverDataUrl: "data:audio/mp3;base64,AAA",
          originalMeta: { title: "T" },
          status: "processing",
          metaLoaded: true,
          coverAction: "replace",
          chosenCoverPath: "C:/img/cover.jpg",
        },
        { filePath: "", title: "No path" },
        null,
      ]),
    );

    const loaded = loadSavedAudioTagQueue();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].title, "T");
    assert.equal(loaded[0].coverAction, "replace");
    assert.equal(loaded[0].chosenCoverPath, "C:/img/cover.jpg");
    assert.ok(!("coverDataUrl" in loaded[0]));
    assert.ok(!("originalMeta" in loaded[0]));
    assert.ok(!("status" in loaded[0]));
  });

  it("recovers from corrupt JSON without throwing", () => {
    localStorage.setItem(STORAGE_KEYS.AUDIO_TAG_QUEUE, "{not valid json");
    let loaded;
    assert.doesNotThrow(() => {
      loaded = loadSavedAudioTagQueue();
    });
    assert.deepEqual(loaded, []);
  });
});

describe("Settings persistence: storage.js", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when nothing is stored", () => {
    assert.deepEqual(loadSettings(), { ...DEFAULT_SETTINGS });
  });

  it("merges partial stored settings over defaults", () => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ outputDir: "D:/Out" }));
    const settings = loadSettings();
    assert.equal(settings.outputDir, "D:/Out");
    assert.equal(settings.defVCodec, DEFAULT_SETTINGS.defVCodec);
    assert.equal(settings.promptOverwrite, DEFAULT_SETTINGS.promptOverwrite);
  });

  it("recovers from corrupt JSON without throwing", () => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, "{not valid json");
    let settings;
    assert.doesNotThrow(() => {
      settings = loadSettings();
    });
    assert.deepEqual(settings, { ...DEFAULT_SETTINGS });
  });

  it("round-trips nested settings through saveSettings/loadSettings", () => {
    const cache = { timestamp: 1730000000000, releases: { ffmpeg: "7.1" } };
    saveSettings({ ...DEFAULT_SETTINGS, outputDir: "E:/Media", toolsUpdateCache: cache });

    const loaded = loadSettings();
    assert.equal(loaded.outputDir, "E:/Media");
    assert.deepEqual(loaded.toolsUpdateCache, cache);
  });
});

describe("Settings persistence: app_settings.js", () => {
  it("returns a settings object carrying the default keys", () => {
    const settings = getAppSettings();
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      assert.ok(key in settings, `expected default key "${key}"`);
    }
  });

  it("setAppSettings replaces the in-memory copy without aliasing the caller", () => {
    const source = { ...getAppSettings(), outputDir: "F:/Custom" };
    setAppSettings(source);
    assert.equal(getAppSettings().outputDir, "F:/Custom");

    source.outputDir = "G:/ChangedLater";
    assert.equal(getAppSettings().outputDir, "F:/Custom");
  });
});
