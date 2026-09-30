// AnEdiKit - Local tool versions + latest-release fetching (with cache).
export const TOOLS_UPDATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
import toolsManifest from "../../data/tools-manifest.json" with { type: "json" };
import { getToolsUpdateCache, saveToolsUpdateCache } from "../storage.js";

export async function checkLocalToolVersions() {
  if (window.__TAURI__?.core?.invoke) {
    try {
      const info = await window.__TAURI__.core.invoke("check_tool_versions");
      return info || {};
    } catch (err) {
      console.warn("Tauri check_tool_versions error:", err);
    }
  }

  // Fallback simulation from manifest defaults
  const fallback = {};
  for (const tool of toolsManifest) {
    fallback[tool.id] = tool.fallbackInstalled;
    fallback[`${tool.id}_installed`] = tool.fallbackInstalled;
  }
  return fallback;
}


export async function fetchLatestGitHubReleases({ force = false } = {}) {
  // Check cached external tools update status (24 hours TTL)
  if (!force) {
    const cached = getToolsUpdateCache();
    const now = Date.now();
    if (
      cached &&
      typeof cached.timestamp === "number" &&
      now - cached.timestamp >= 0 &&
      now - cached.timestamp < TOOLS_UPDATE_CACHE_TTL_MS &&
      cached.releases &&
      typeof cached.releases === "object" &&
      Object.keys(cached.releases).length > 0
    ) {
      return { ...cached.releases };
    }
  }

  const latest = {};

  const fetchPromises = toolsManifest.map(async (tool) => {
    if (!tool.repo) {
      latest[tool.id] = tool.fallbackLatest || "Available";
      latest[`${tool.id}_latest`] = tool.fallbackLatest || "Available";
      return;
    }

    try {
      const res = await fetch(`https://api.github.com/repos/${tool.repo}/releases/latest`);
      if (res.ok) {
        const data = await res.json();
        if (tool.releaseType === "published_date") {
          latest[tool.id] = data.published_at ? data.published_at.substring(0, 10) : tool.fallbackLatest;
        } else if (tool.releaseType === "semver") {
          latest[tool.id] = (data.tag_name || "").replace(/^v/, "").trim() || tool.fallbackLatest;
        } else {
          latest[tool.id] = (data.tag_name || "").trim() || tool.fallbackLatest;
        }
      } else {
        latest[tool.id] = tool.fallbackLatest;
      }
    } catch {
      latest[tool.id] = tool.fallbackLatest;
    }

    latest[`${tool.id}_latest`] = latest[tool.id];
  });

  await Promise.all(fetchPromises);

  // Persist external tools update status to dedicated cache container in app config
  saveToolsUpdateCache({
    timestamp: Date.now(),
    releases: latest,
  });

  return latest;
}
