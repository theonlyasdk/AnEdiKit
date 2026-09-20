import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  updateProgress,
  onJobFinished,
  showBatchFinishedNotification,
  setProcessingHeading,
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
      <div id="finished-toast" class="toast">
        <strong id="toast-title">Task Finished</strong>
        <span id="toast-filename"></span>
        <span id="toast-meta-details"></span>
        <small id="toast-timestamp"></small>
        <button id="toast-btn-open-file"></button>
        <button id="toast-btn-open-folder"></button>
      </div>
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

  it("formats combined batch notification with all successful items", async () => {
    await showBatchFinishedNotification({
      destination: "C:\\Output\\folder",
      toolName: "Media Conversion",
      total: 5,
      successCount: 5,
      failCount: 0,
      elapsedSeconds: "12.4",
    });

    const toastTitle = document.getElementById("toast-title");
    const toastFileName = document.getElementById("toast-filename");
    const toastMetaDetails = document.getElementById("toast-meta-details");

    assert.equal(toastTitle.textContent, "Media Conversion Completed");
    assert.equal(toastFileName.textContent, "5 items processed");
    assert.ok(toastMetaDetails.innerHTML.includes("12.4s"));
    assert.ok(toastMetaDetails.innerHTML.includes("All items succeeded"));
  });

  it("formats combined batch notification with partial failures", async () => {
    await showBatchFinishedNotification({
      destination: "C:\\Output\\folder",
      toolName: "Batch Queue",
      total: 4,
      successCount: 3,
      failCount: 1,
      elapsedSeconds: "8.5",
    });

    const toastTitle = document.getElementById("toast-title");
    const toastFileName = document.getElementById("toast-filename");
    const toastMetaDetails = document.getElementById("toast-meta-details");

    assert.equal(toastTitle.textContent, "Batch Queue Completed");
    assert.equal(toastFileName.textContent, "3 items processed");
    assert.ok(toastMetaDetails.innerHTML.includes("8.5s"));
    assert.ok(toastMetaDetails.innerHTML.includes("1 failed"));
  });

  it("activates marquee scrolling and fade mask when processing text overflows", () => {
    const wrapper = document.getElementById("current-item-wrapper");
    const heading = document.getElementById("current-processing-heading");

    // Mock dimensions so scrollWidth exceeds wrapper clientWidth
    wrapper.clientWidth = 200;
    heading.scrollWidth = 450;

    setProcessingHeading("Processing: extremely_long_video_file_name_with_extra_tags_and_descriptors_2026.mkv");

    assert.equal(heading.textContent, "Processing: extremely_long_video_file_name_with_extra_tags_and_descriptors_2026.mkv");
    assert.ok(heading.classList.contains("is-marquee"));
    assert.ok(wrapper.classList.contains("has-marquee-fade"));
    assert.ok(heading.style.getPropertyValue("--marquee-overflow-dist"));
  });
});
