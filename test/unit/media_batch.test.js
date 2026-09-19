// media.js batch queue: add/dedupe, indexed reorder, selection, and status.
import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  getBatchQueue,
  getSelectedBatchIdx,
  setSelectedBatchIdx,
  clearBatchQueue,
  addFilesToBatch,
  updateBatchItemStatus,
  moveBatchIndexUp,
  moveBatchIndexDown,
  moveBatchItemUp,
  moveBatchItemDown,
} from "../../src/js/media.js";

const PATHS = ["C:/v/a.mp4", "C:/v/b.mp4", "C:/v/c.mp4"];

async function seed() {
  await addFilesToBatch(PATHS);
}

beforeEach(async () => {
  localStorage.clear();
  await clearBatchQueue();
});

describe("media.js batch queue: add + dedupe", () => {
  it("adds unique paths with derived names and pending status", async () => {
    await seed();
    const queue = getBatchQueue();
    assert.equal(queue.length, 3);
    assert.deepEqual(
      queue.map((i) => i.name),
      ["a.mp4", "b.mp4", "c.mp4"],
    );
    assert.ok(queue.every((i) => i.status === "pending"));
  });

  it("ignores duplicate and empty entries", async () => {
    await addFilesToBatch([...PATHS, PATHS[0], null, ""]);
    assert.equal(getBatchQueue().length, 3);
  });

  it("skips empty input entirely", async () => {
    await addFilesToBatch([]);
    await addFilesToBatch(null);
    assert.equal(getBatchQueue().length, 0);
  });

  it("persists the queue to storage", async () => {
    await seed();
    const stored = JSON.parse(localStorage.getItem("anedikit:tools:batch:queue"));
    assert.equal(stored.length, 3);
  });
});

describe("media.js batch queue: status", () => {
  it("updates a valid index and ignores out-of-range ones", async () => {
    await seed();
    updateBatchItemStatus(1, "done");
    assert.equal(getBatchQueue()[1].status, "done");

    updateBatchItemStatus(-1, "error");
    updateBatchItemStatus(99, "error");
    assert.equal(getBatchQueue()[0].status, "pending");
    assert.equal(getBatchQueue()[2].status, "pending");
  });
});

describe("media.js batch queue: reorder", () => {
  it("moves an item up and selects its new position", async () => {
    await seed();
    moveBatchIndexUp(1);
    assert.deepEqual(
      getBatchQueue().map((i) => i.name),
      ["b.mp4", "a.mp4", "c.mp4"],
    );
    assert.equal(getSelectedBatchIdx(), 0);
  });

  it("moves an item down and selects its new position", async () => {
    await seed();
    moveBatchIndexDown(0);
    assert.deepEqual(
      getBatchQueue().map((i) => i.name),
      ["b.mp4", "a.mp4", "c.mp4"],
    );
    assert.equal(getSelectedBatchIdx(), 1);
  });

  it("no-ops at the boundaries", async () => {
    await seed();
    moveBatchIndexUp(0);
    moveBatchIndexDown(2);
    moveBatchIndexUp(-1);
    moveBatchIndexDown(3);
    assert.deepEqual(
      getBatchQueue().map((i) => i.name),
      ["a.mp4", "b.mp4", "c.mp4"],
    );
  });

  it("routes the selection-based moves through the indexed moves", async () => {
    await seed();
    setSelectedBatchIdx(2);
    moveBatchItemUp();
    assert.deepEqual(
      getBatchQueue().map((i) => i.name),
      ["a.mp4", "c.mp4", "b.mp4"],
    );
    assert.equal(getSelectedBatchIdx(), 1);

    moveBatchItemDown();
    assert.deepEqual(
      getBatchQueue().map((i) => i.name),
      ["a.mp4", "b.mp4", "c.mp4"],
    );
    assert.equal(getSelectedBatchIdx(), 2);
  });
});
