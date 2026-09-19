// Unit Tests for Tools Update Cache and 24-Hour TTL
import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  getToolsUpdateCache,
  saveToolsUpdateCache,
  clearToolsUpdateCache,
} from "../../src/js/storage.js";
import {
  fetchLatestGitHubReleases,
  TOOLS_UPDATE_CACHE_TTL_MS,
} from "../../src/js/tools_manager.js";

describe("Tools Update Cache & 24h Expiration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should have TOOLS_UPDATE_CACHE key and default toolsUpdateCache in DEFAULT_SETTINGS", () => {
    assert.equal(STORAGE_KEYS.TOOLS_UPDATE_CACHE, "anedikit:cache:tools_update");
    assert.ok(DEFAULT_SETTINGS.toolsUpdateCache);
    assert.equal(DEFAULT_SETTINGS.toolsUpdateCache.timestamp, 0);
    assert.deepEqual(DEFAULT_SETTINGS.toolsUpdateCache.releases, {});
  });

  it("should save and retrieve tools update cache from app config container and dedicated storage", () => {
    const mockReleases = {
      ffmpeg: "2026-09-18",
      ffmpeg_latest: "2026-09-18",
      ytdlp: "2026.09.18",
      ytdlp_latest: "2026.09.18",
    };
    const now = 1726700000000;

    saveToolsUpdateCache({
      timestamp: now,
      releases: mockReleases,
    });

    const cache = getToolsUpdateCache();
    assert.equal(cache.timestamp, now);
    assert.deepEqual(cache.releases, mockReleases);

    // Verify it is also stored inside settings container
    const settings = loadSettings();
    assert.equal(settings.toolsUpdateCache?.timestamp, now);
    assert.deepEqual(settings.toolsUpdateCache?.releases, mockReleases);
  });

  it("should clear tools update cache in app config allowing refetch", () => {
    saveToolsUpdateCache({
      timestamp: Date.now(),
      releases: { ffmpeg: "7.1", ytdlp: "2026.09.01" },
    });

    clearToolsUpdateCache();

    const cache = getToolsUpdateCache();
    assert.equal(cache.timestamp, 0);
    assert.deepEqual(cache.releases, {});

    const settings = loadSettings();
    assert.equal(settings.toolsUpdateCache?.timestamp, 0);
    assert.deepEqual(settings.toolsUpdateCache?.releases, {});
  });

  it("should return cached releases when cache is fresh (< 24 hours) without network calls", async () => {
    const cachedReleases = {
      ffmpeg: "cached-ffmpeg-v1",
      ffmpeg_latest: "cached-ffmpeg-v1",
      ffprobe: "cached-ffprobe-v1",
      ffprobe_latest: "cached-ffprobe-v1",
      ytdlp: "cached-ytdlp-v1",
      ytdlp_latest: "cached-ytdlp-v1",
      deno: "cached-deno-v1",
      deno_latest: "cached-deno-v1",
      python: "Available",
      python_latest: "Available",
    };

    saveToolsUpdateCache({
      timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 hours old
      releases: cachedReleases,
    });

    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("Network should not be called on cache hit");
    };

    try {
      const releases = await fetchLatestGitHubReleases();
      assert.equal(fetchCalled, false);
      assert.equal(releases.ffmpeg, "cached-ffmpeg-v1");
      assert.equal(releases.ytdlp, "cached-ytdlp-v1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should refetch from network when cache is expired (> 24 hours)", async () => {
    saveToolsUpdateCache({
      timestamp: Date.now() - (TOOLS_UPDATE_CACHE_TTL_MS + 10000), // > 24 hours old
      releases: { ffmpeg: "old-version" },
    });

    let networkCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      networkCallCount++;
      return {
        ok: true,
        json: async () => ({ tag_name: "v9.9.9", published_at: "2026-09-19" }),
      };
    };

    try {
      const releases = await fetchLatestGitHubReleases();
      assert.ok(networkCallCount > 0, "Network calls should be made when cache is expired");
      const updatedCache = getToolsUpdateCache();
      assert.ok(Date.now() - updatedCache.timestamp < 5000);
      assert.ok(releases.ffmpeg);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should bypass cache when force = true", async () => {
    saveToolsUpdateCache({
      timestamp: Date.now() - 1000 * 60, // 1 minute old
      releases: { ffmpeg: "cached-version" },
    });

    let networkCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      networkCallCount++;
      return {
        ok: true,
        json: async () => ({ tag_name: "v10.0.0", published_at: "2026-09-19" }),
      };
    };

    try {
      const releases = await fetchLatestGitHubReleases({ force: true });
      assert.ok(networkCallCount > 0, "Network calls should be made when force is true");
      assert.notEqual(releases.ffmpeg, "cached-version");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should format cache age properly", async () => {
    const { formatCacheAge } = await import("../../src/js/app_settings.js");
    assert.equal(formatCacheAge(0), "Not cached");
    assert.equal(formatCacheAge(null), "Not cached");
    assert.equal(formatCacheAge(Date.now() - 10000), "10s ago");
    assert.equal(formatCacheAge(Date.now() - 1000 * 60 * 5), "5m ago");
    assert.equal(formatCacheAge(Date.now() - 1000 * 60 * 60 * 3), "3h ago");
    assert.equal(formatCacheAge(Date.now() - 1000 * 60 * 60 * 24 * 2), "2d ago");
  });

  it("should render tools cache status displaying age and item count", async () => {
    const { renderToolsCacheStatus } = await import("../../src/js/app_settings.js");
    const statusEl = document.getElementById("tools-cache-status-text");

    // Empty cache
    clearToolsUpdateCache();
    renderToolsCacheStatus();
    assert.ok(statusEl.textContent.includes("None (0 items cached)"));

    // Populated cache
    saveToolsUpdateCache({
      timestamp: Date.now() - 1000 * 60 * 15, // 15m ago
      releases: {
        ffmpeg: "2026-09-13",
        ffmpeg_latest: "2026-09-13",
        ytdlp: "2026.08.19",
        ytdlp_latest: "2026.08.19",
        deno: "2.9.6",
        deno_latest: "2.9.6",
      },
    });
    renderToolsCacheStatus();
    assert.ok(statusEl.textContent.includes("15m ago"));
    assert.ok(statusEl.textContent.includes("3 items cached"));
  });
});

describe("Clear Update Cache button in-progress state", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shimmers, disables, and restores around the forced refetch", async () => {
    const { initToolsCacheControls } = await import("../../src/js/app_settings.js");
    const btn = document.getElementById("btn-clear-tools-cache");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ tag_name: "v1.2.3", published_at: "2026-09-19" }),
    });

    btn.disabled = false;
    btn.innerHTML =
      '<ion-icon name="trash-outline"></ion-icon>Clear Update Cache';
    btn.classList.remove("btn-secondary", "btn-shimmer");
    btn.classList.add("btn-outline-secondary");

    try {
      initToolsCacheControls();
      btn.click();

      // Busy state is applied synchronously so it paints before the refetch.
      assert.equal(btn.disabled, true, "expected the button disabled while clearing");
      assert.ok(
        btn.classList.contains("btn-shimmer"),
        "expected the shimmer sweep while clearing",
      );
      assert.ok(
        btn.classList.contains("btn-secondary"),
        "expected the filled variant so the sheen is visible",
      );
      assert.equal(
        btn.classList.contains("btn-outline-secondary"),
        false,
        "the transparent outline variant should be dropped while clearing",
      );
      assert.match(btn.innerHTML, /Clearing\.\.\./);

      // Wait for the forced refetch (and its internal timers) to settle.
      const deadline = Date.now() + 2000;
      while (btn.disabled && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      assert.equal(btn.disabled, false, "expected the button re-enabled afterward");
      assert.equal(btn.classList.contains("btn-shimmer"), false);
      assert.ok(btn.classList.contains("btn-outline-secondary"));
      assert.match(btn.innerHTML, /Clear Update Cache/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

