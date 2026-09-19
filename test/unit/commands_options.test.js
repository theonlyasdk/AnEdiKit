// Hardware acceleration resolution + video encoder arg mapping (commands.js).
import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  setDetectedHardware,
  getResolvedHwaccel,
  mapHardwareEncoder,
  getHwaccelInputArgs,
  applyVideoEncoderOptions,
} from "../../src/js/commands.js";

describe("commands.js: getResolvedHwaccel", () => {
  beforeEach(() => {
    setDetectedHardware(null);
  });

  it("falls back to cpu when nothing was detected", () => {
    assert.equal(getResolvedHwaccel({}), "cpu");
    assert.equal(getResolvedHwaccel({ hwAccel: "auto" }), "cpu");
  });

  it("picks the best available backend in auto mode", () => {
    setDetectedHardware({ nvenc_available: true, qsv_available: true });
    assert.equal(getResolvedHwaccel({ hwAccel: "auto" }), "cuda");

    setDetectedHardware({ qsv_available: true, amf_available: true });
    assert.equal(getResolvedHwaccel({ hwAccel: "auto" }), "qsv");

    setDetectedHardware({ d3d11va_available: true });
    assert.equal(getResolvedHwaccel({ hwAccel: "auto" }), "d3d11va");
  });

  it("downgrades an explicitly requested but unavailable backend to cpu", () => {
    setDetectedHardware({ nvenc_available: false });
    assert.equal(getResolvedHwaccel({ hwAccel: "cuda" }), "cpu");
  });

  it("honors an explicitly requested backend that is available", () => {
    setDetectedHardware({ amf_available: true });
    assert.equal(getResolvedHwaccel({ hwAccel: "amf" }), "amf");
  });

  it("leaves a non-auto request untouched when nothing was detected", () => {
    assert.equal(getResolvedHwaccel({ hwAccel: "cuda" }), "cuda");
  });
});

describe("commands.js: mapHardwareEncoder", () => {
  it("maps target codecs onto each vendor encoder", () => {
    assert.equal(mapHardwareEncoder("libx264", "cuda"), "h264_nvenc");
    assert.equal(mapHardwareEncoder("hevc", "qsv"), "hevc_qsv");
    assert.equal(mapHardwareEncoder("av1", "amf"), "av1_amf");
    assert.equal(mapHardwareEncoder("libvpx-vp9", "qsv"), "vp9_qsv");
    assert.equal(mapHardwareEncoder("libx264", "videotoolbox"), "h264_videotoolbox");
  });

  it("returns the software codec when no mapping exists", () => {
    assert.equal(mapHardwareEncoder("libx264", "cpu"), "libx264");
    assert.equal(mapHardwareEncoder("libvpx-vp9", "cuda"), "libvpx-vp9");
    assert.equal(mapHardwareEncoder("hevc", "videotoolbox"), "hevc_videotoolbox");
    assert.equal(mapHardwareEncoder("av1", "videotoolbox"), "av1");
  });
});

describe("commands.js: getHwaccelInputArgs", () => {
  it("emits decode-accel flags per backend", () => {
    assert.deepEqual(getHwaccelInputArgs("cuda"), ["-hwaccel", "cuda"]);
    assert.deepEqual(getHwaccelInputArgs("qsv"), ["-hwaccel", "qsv"]);
    assert.deepEqual(getHwaccelInputArgs("videotoolbox"), ["-hwaccel", "videotoolbox"]);
  });

  it("maps amf and d3d11va to d3d11va decode", () => {
    assert.deepEqual(getHwaccelInputArgs("amf"), ["-hwaccel", "d3d11va"]);
    assert.deepEqual(getHwaccelInputArgs("d3d11va"), ["-hwaccel", "d3d11va"]);
  });

  it("emits nothing for cpu or unknown choices", () => {
    assert.deepEqual(getHwaccelInputArgs("cpu"), []);
    assert.deepEqual(getHwaccelInputArgs(""), []);
  });
});

describe("commands.js: applyVideoEncoderOptions", () => {
  beforeEach(() => {
    setDetectedHardware(null);
  });

  it("emits a stream copy and nothing else for codec copy", () => {
    const args = [];
    applyVideoEncoderOptions(args, "copy", {});
    assert.deepEqual(args, ["-c:v", "copy"]);
  });

  it("emits software x264 CRF args", () => {
    const args = [];
    applyVideoEncoderOptions(args, "libx264", { hwAccel: "cpu" });
    assert.deepEqual(args, ["-c:v", "libx264", "-crf", "23", "-preset", "medium", "-pix_fmt", "yuv420p"]);
  });

  it("honors an explicit crf and preset", () => {
    const args = [];
    applyVideoEncoderOptions(args, "libx264", { hwAccel: "cpu" }, { crf: "18", preset: "slow" });
    assert.deepEqual(args, ["-c:v", "libx264", "-crf", "18", "-preset", "slow", "-pix_fmt", "yuv420p"]);
  });

  it("replaces CRF with an explicit bitrate", () => {
    const args = [];
    applyVideoEncoderOptions(args, "libx264", { hwAccel: "cpu" }, { bitrate: "5000k", maxrate: "5000k", bufsize: "10000k" });
    assert.deepEqual(args, [
      "-c:v",
      "libx264",
      "-b:v",
      "5000k",
      "-maxrate",
      "5000k",
      "-bufsize",
      "10000k",
      "-preset",
      "medium",
      "-pix_fmt",
      "yuv420p",
    ]);
    assert.ok(!args.includes("-crf"));
  });

  it("uses NVENC constant-quality + preset flags", () => {
    setDetectedHardware({ nvenc_available: true });
    const args = [];
    applyVideoEncoderOptions(args, "libx264", { hwAccel: "auto" });
    assert.deepEqual(args, ["-c:v", "h264_nvenc", "-cq", "23", "-preset", "p4", "-pix_fmt", "yuv420p"]);
  });

  it("maps the software preset onto the NVENC preset ladder", () => {
    setDetectedHardware({ nvenc_available: true });
    const args = [];
    applyVideoEncoderOptions(args, "libx264", { hwAccel: "auto" }, { preset: "veryfast" });
    assert.deepEqual(args, ["-c:v", "h264_nvenc", "-cq", "23", "-preset", "p2", "-pix_fmt", "yuv420p"]);
  });

  it("uses QSV global-quality args with nv12 pixel format", () => {
    setDetectedHardware({ qsv_available: true });
    const args = [];
    applyVideoEncoderOptions(args, "libx264", { hwAccel: "auto" });
    assert.deepEqual(args, ["-c:v", "h264_qsv", "-global_quality", "23", "-preset", "medium", "-pix_fmt", "nv12"]);
  });

  it("uses AMF constant-QP args", () => {
    setDetectedHardware({ amf_available: true });
    const args = [];
    applyVideoEncoderOptions(args, "libx264", { hwAccel: "auto" });
    assert.deepEqual(args, ["-c:v", "h264_amf", "-rc", "cqp", "-qp_i", "23", "-qp_p", "23", "-pix_fmt", "yuv420p"]);
  });

  it("uses VideoToolbox q:v args", () => {
    setDetectedHardware({ videotoolbox_available: true });
    const args = [];
    applyVideoEncoderOptions(args, "libx264", { hwAccel: "auto" });
    assert.deepEqual(args, ["-c:v", "h264_videotoolbox", "-q:v", "23", "-pix_fmt", "yuv420p"]);
  });
});
