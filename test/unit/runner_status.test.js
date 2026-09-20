import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  updateProgress,
  onJobFinished,
} from "../../src/js/runner.js";

describe("runner.js: Execution status and progress bar management", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="execution-status-panel" class="d-none">
        <div id="current-item-wrapper" class="d-none">
          <h3 id="current-processing-heading">Processing: ...</h3>
        </div>
        <div id="stat-readouts">
          <span id="stat-item-count" class="d-none"></span>
          <span id="stat-time">Time: 00:00:00</span>
          <span id="stat-eta">ETA: --:--:--</span>
          <span id="stat-fps" class="d-none"></span>
          <span id="stat-speed" class="d-none"></span>
          <span id="stat-bitrate" class="d-none"></span>
        </div>
        <span id="progress-pct">0%</span>
        <div id="exec-progress-container" class="d-none">
          <div id="job-progress-bar" class="progress-bar progress-bar-material-indeterminate"></div>
        </div>
      </div>
      <div id="status-message" class="d-none"></div>
      <button id="btn-execute">Execute</button>
    `;
  });

  it("updates heading to Processing: fileNameOfProcessingItem", () => {
    updateProgress({
      time: "00:01:23",
      eta: "00:00:45",
      fps: "30",
      speed: "2.0x",
      bitrate: "2500 kbits/s",
      pct: 45,
      current_item_title: "clip_sample.mp4",
    });

    const heading = document.getElementById("current-processing-heading");
    assert.equal(heading.textContent, "Processing: clip_sample.mp4");

    const progressContainer = document.getElementById("exec-progress-container");
    assert.equal(progressContainer.classList.contains("d-none"), false);
  });

  it("shows N of totalN in status strip and bottom status message for batches", () => {
    updateProgress({
      time: "00:00:15",
      eta: "00:01:10",
      speed: "1.5x",
      pct: 20,
      playlist_item: 2,
      playlist_total: 5,
      current_item_title: "video_two.mkv",
    });

    const statCount = document.getElementById("stat-item-count");
    assert.equal(statCount.textContent, "2 of 5");
    assert.equal(statCount.classList.contains("d-none"), false);

    const statusMsg = document.getElementById("status-message");
    assert.ok(statusMsg.textContent.includes("2 of 5"));
    assert.ok(statusMsg.textContent.includes("Time: 00:00:15"));
    assert.ok(statusMsg.textContent.includes("ETA: 00:01:10"));
  });

  it("hides progress bar container after job is complete", () => {
    const progressContainer = document.getElementById("exec-progress-container");
    progressContainer.classList.remove("d-none");

    onJobFinished(true, "Job completed successfully");

    assert.equal(progressContainer.classList.contains("d-none"), true);
  });
});
