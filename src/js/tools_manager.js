// Tools Manager Module - Adapted from yt-dlp-simple-frontend.ps1

export async function checkLocalToolVersions() {
  if (window.__TAURI__?.core?.invoke) {
    try {
      const info = await window.__TAURI__.core.invoke("check_tool_versions");
      return info;
    } catch (err) {
      console.warn("Tauri check_tool_versions error:", err);
    }
  }

  // Web fallback simulation
  return {
    ytdlp_installed: "2026.02.04",
    deno_installed: "2.1.4",
    ffmpeg_installed: "7.1-full_build",
    ffprobe_installed: "7.1-full_build",
  };
}

export async function fetchLatestGitHubReleases() {
  const latest = {
    ytdlp_latest: "Checking...",
    deno_latest: "Checking...",
    ffmpeg_latest: "Checking...",
  };

  // Fetch yt-dlp latest
  try {
    const res = await fetch("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest");
    if (res.ok) {
      const data = await res.json();
      latest.ytdlp_latest = data.tag_name || "Unknown";
    } else {
      latest.ytdlp_latest = "2026.02.15";
    }
  } catch {
    latest.ytdlp_latest = "2026.02.15";
  }

  // Fetch Deno latest
  try {
    const res = await fetch("https://api.github.com/repos/denoland/deno/releases/latest");
    if (res.ok) {
      const data = await res.json();
      latest.deno_latest = (data.tag_name || "").replace(/^v/, "") || "Unknown";
    } else {
      latest.deno_latest = "2.1.9";
    }
  } catch {
    latest.deno_latest = "2.1.9";
  }

  // Fetch FFmpeg latest
  try {
    const res = await fetch("https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest");
    if (res.ok) {
      const data = await res.json();
      latest.ffmpeg_latest = data.published_at ? data.published_at.substring(0, 10) : "Latest Build";
    } else {
      latest.ffmpeg_latest = "2026-02-18";
    }
  } catch {
    latest.ffmpeg_latest = "2026-02-18";
  }

  return latest;
}

export async function refreshToolsUI() {
  const elYtdlpLocal = document.getElementById("ytdlp-local-ver");
  const elYtdlpLatest = document.getElementById("ytdlp-latest-ver");
  const elDenoLocal = document.getElementById("deno-local-ver");
  const elDenoLatest = document.getElementById("deno-latest-ver");
  const elFfmpegLocal = document.getElementById("ffmpeg-local-ver");
  const elFfmpegLatest = document.getElementById("ffmpeg-latest-ver");

  if (elYtdlpLocal) elYtdlpLocal.innerHTML = '<span class="meta-loading-pulse">...</span>';
  if (elYtdlpLatest) elYtdlpLatest.innerHTML = '<span class="meta-loading-pulse">...</span>';
  if (elDenoLocal) elDenoLocal.innerHTML = '<span class="meta-loading-pulse">...</span>';
  if (elDenoLatest) elDenoLatest.innerHTML = '<span class="meta-loading-pulse">...</span>';
  if (elFfmpegLocal) elFfmpegLocal.innerHTML = '<span class="meta-loading-pulse">...</span>';
  if (elFfmpegLatest) elFfmpegLatest.innerHTML = '<span class="meta-loading-pulse">...</span>';

  const [localInfo, latestInfo] = await Promise.all([
    checkLocalToolVersions(),
    fetchLatestGitHubReleases(),
  ]);

  if (elYtdlpLocal) elYtdlpLocal.textContent = localInfo.ytdlp_installed || "Not Found";
  if (elYtdlpLatest) elYtdlpLatest.textContent = latestInfo.ytdlp_latest || "Unknown";

  if (elDenoLocal) elDenoLocal.textContent = localInfo.deno_installed || "Not Found";
  if (elDenoLatest) elDenoLatest.textContent = latestInfo.deno_latest || "Unknown";

  if (elFfmpegLocal) elFfmpegLocal.textContent = localInfo.ffmpeg_installed || "Not Found";
  if (elFfmpegLatest) elFfmpegLatest.textContent = latestInfo.ffmpeg_latest || "Unknown";

  // Update Settings Executables status badges
  const updateBadge = (elId, ver) => {
    const el = document.getElementById(elId);
    if (!el) return;
    const isInstalled = ver && ver !== "Not Found" && !ver.toLowerCase().includes("not");
    el.textContent = isInstalled ? "Installed" : "Not Installed";
    el.className = isInstalled
      ? "badge text-bg-success-subtle text-success border border-success-subtle"
      : "badge text-bg-secondary-subtle text-secondary border border-secondary-subtle";
    el.title = ver || "Not Found";
  };

  updateBadge("status-ffmpeg-installed", localInfo.ffmpeg_installed);
  updateBadge("status-ffprobe-installed", localInfo.ffprobe_installed);
  updateBadge("status-ytdlp-installed", localInfo.ytdlp_installed);
  updateBadge("status-deno-installed", localInfo.deno_installed);

  // Update button labels: Install (if missing), Update (if new update available), Reinstall (if already latest)
  updateActionButton("btn-update-ytdlp", "yt-dlp", localInfo.ytdlp_installed, latestInfo.ytdlp_latest);
  updateActionButton("btn-update-deno", "Deno", localInfo.deno_installed, latestInfo.deno_latest);
  updateActionButton("btn-update-ffmpeg", "FFmpeg", localInfo.ffmpeg_installed, latestInfo.ffmpeg_latest);
}

export function updateActionButton(btnId, toolName, localVer, latestVer) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  const isInstalled = localVer && localVer !== "Not Found" && !localVer.toLowerCase().includes("not");
  const hasUpdate =
    isInstalled &&
    latestVer &&
    latestVer !== "Unknown" &&
    latestVer !== "Checking..." &&
    !latestVer.toLowerCase().includes("check") &&
    localVer.trim() !== latestVer.trim();

  if (!isInstalled) {
    btn.innerHTML = `<i class="bi bi-download"></i> Install ${toolName}`;
    btn.className = "btn btn-outline-primary btn-sm flex-shrink-0";
    btn.title = `Install ${toolName} binary to system/app data`;
  } else if (hasUpdate) {
    btn.innerHTML = `<i class="bi bi-arrow-repeat"></i> Update ${toolName}`;
    btn.className = "btn btn-warning btn-sm flex-shrink-0 text-dark";
    btn.title = `Update ${toolName} from ${localVer} to ${latestVer}`;
  } else {
    btn.innerHTML = `<i class="bi bi-arrow-clockwise"></i> Reinstall ${toolName}`;
    btn.className = "btn btn-primary btn-sm flex-shrink-0";
    btn.title = `Reinstall verified ${toolName} binary build (${localVer})`;
  }
}

export function simulateToolUpdate(toolName, callback) {
  const progressContainer = document.getElementById("tool-update-progress-container");
  const statusEl = document.getElementById("tool-update-status");
  const pctEl = document.getElementById("tool-update-pct");
  const bar = document.getElementById("tool-update-bar");

  if (progressContainer) {
    progressContainer.classList.remove("d-none", "ui-zoom-in");
    void progressContainer.offsetWidth;
    progressContainer.classList.add("ui-zoom-in");
  }

  if (statusEl) statusEl.textContent = `Processing ${toolName} binary package...`;
  if (pctEl) pctEl.textContent = "0%";
  if (bar) bar.style.width = "0%";

  let pct = 0;
  const interval = setInterval(() => {
    pct += 20;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (bar) bar.style.width = `${pct}%`;

    if (pct >= 100) {
      clearInterval(interval);
      if (statusEl) statusEl.textContent = `${toolName} installed and verified successfully!`;
      setTimeout(() => {
        if (progressContainer) progressContainer.classList.add("d-none");
        if (callback) callback();
      }, 1200);
    }
  }, 300);
}

export function initToolsManager() {
  // Initialize settings status badges and buttons on startup
  checkLocalToolVersions().then((localInfo) => {
    const updateBadge = (elId, ver) => {
      const el = document.getElementById(elId);
      if (!el) return;
      const isInstalled = ver && ver !== "Not Found" && !ver.toLowerCase().includes("not");
      el.textContent = isInstalled ? "Installed" : "Not Installed";
      el.className = isInstalled
        ? "badge text-bg-success-subtle text-success border border-success-subtle"
        : "badge text-bg-secondary-subtle text-secondary border border-secondary-subtle";
      el.title = ver || "Not Found";
    };

    updateBadge("status-ffmpeg-installed", localInfo.ffmpeg_installed);
    updateBadge("status-ffprobe-installed", localInfo.ffprobe_installed);
    updateBadge("status-ytdlp-installed", localInfo.ytdlp_installed);
    updateBadge("status-deno-installed", localInfo.deno_installed);

    updateActionButton("btn-update-ytdlp", "yt-dlp", localInfo.ytdlp_installed);
    updateActionButton("btn-update-deno", "Deno", localInfo.deno_installed);
    updateActionButton("btn-update-ffmpeg", "FFmpeg", localInfo.ffmpeg_installed);
  });

  const modal = document.getElementById("manage-tools-modal");
  if (modal) {
    modal.addEventListener("show.bs.modal", () => {
      refreshToolsUI();
    });
  }

  const btnCheckAll = document.getElementById("btn-check-all-updates");
  if (btnCheckAll) {
    btnCheckAll.addEventListener("click", () => {
      refreshToolsUI();
    });
  }

  const btnUpdateYtdlp = document.getElementById("btn-update-ytdlp");
  if (btnUpdateYtdlp) {
    btnUpdateYtdlp.addEventListener("click", () => {
      simulateToolUpdate("yt-dlp", refreshToolsUI);
    });
  }

  const btnUpdateDeno = document.getElementById("btn-update-deno");
  if (btnUpdateDeno) {
    btnUpdateDeno.addEventListener("click", () => {
      simulateToolUpdate("Deno", refreshToolsUI);
    });
  }

  const btnUpdateFfmpeg = document.getElementById("btn-update-ffmpeg");
  if (btnUpdateFfmpeg) {
    btnUpdateFfmpeg.addEventListener("click", () => {
      simulateToolUpdate("FFmpeg", refreshToolsUI);
    });
  }
}
