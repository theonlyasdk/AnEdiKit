// waveform.js: peak extraction from AudioBuffer + synthetic fallback.
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  extractPeaksFromAudioBuffer,
  generateSyntheticWaveform,
} from "../../src/js/waveform.js";

function fakeBuffer(channels) {
  const length = channels[0].length;
  return {
    numberOfChannels: channels.length,
    length,
    getChannelData: (c) => Float32Array.from(channels[c]),
  };
}

describe("waveform.js: extractPeaksFromAudioBuffer", () => {
  it("returns an empty array for a missing buffer", () => {
    assert.deepEqual(extractPeaksFromAudioBuffer(null), []);
  });

  it("normalizes so the loudest block becomes 1.0", () => {
    const samples = new Array(1000).fill(0.1);
    samples[250] = 0.5; // block 2 of ten 100-sample blocks
    const peaks = extractPeaksFromAudioBuffer(fakeBuffer([samples]), 10);

    assert.equal(peaks.length, 10);
    assert.equal(peaks[2], 1);
    // Float32 storage: allow for single-precision rounding.
    assert.ok(Math.abs(peaks[0] - 0.2) < 1e-6, `expected ~0.2, got ${peaks[0]}`);
  });

  it("takes the per-block maximum across channels", () => {
    const left = new Array(100).fill(0.2);
    const right = new Array(100).fill(0.4);
    const peaks = extractPeaksFromAudioBuffer(fakeBuffer([left, right]), 1);

    assert.equal(peaks.length, 1);
    assert.equal(peaks[0], 1); // 0.4 max -> normalized to 1.0
  });

  it("never returns values above 1.0", () => {
    const loud = new Array(240).fill(1);
    const peaks = extractPeaksFromAudioBuffer(fakeBuffer([loud]), 24);
    assert.ok(peaks.every((p) => p >= 0 && p <= 1));
  });
});

describe("waveform.js: generateSyntheticWaveform", () => {
  it("returns the requested number of samples within range", () => {
    const peaks = generateSyntheticWaveform(48, "seed");
    assert.equal(peaks.length, 48);
    assert.ok(peaks.every((p) => p >= 0.08 && p <= 1.0));
  });

  it("is deterministic for the same seed", () => {
    assert.deepEqual(generateSyntheticWaveform(32, "abc"), generateSyntheticWaveform(32, "abc"));
  });

  it("varies with the seed", () => {
    assert.notDeepEqual(generateSyntheticWaveform(32, "abc"), generateSyntheticWaveform(32, "xyz"));
  });

  it("scales to the requested sample count", () => {
    assert.equal(generateSyntheticWaveform(10).length, 10);
    assert.equal(generateSyntheticWaveform(0).length, 0);
  });
});
