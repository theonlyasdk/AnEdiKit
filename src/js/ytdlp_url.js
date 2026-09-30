// Module for fixing and formatting yt-dlp URLs
import { animateCopyConfirm } from "./copy_anim.js";
import { reportError } from "./errors.js";
import { getCurrentActiveTool } from "./active_tool.js";
// Whitelisted search parameters for clean YouTube URLs (preserves video ID, playlist, timestamp, index)
const ALLOWED_YT_PARAMS = new Set(["v", "list", "t", "start", "index"]);

/**
 * Normalizes YouTube URLs to standard https://www.youtube.com/watch?v=... format.
 * Converts URLs like:
 * - https://youtu.be/86DvZHUgqms?si=tAtzyzbr42egeZfW -> https://www.youtube.com/watch?v=86DvZHUgqms
 * - https://music.youtube.com/watch?v=86DvZHUgqms -> https://www.youtube.com/watch?v=86DvZHUgqms
 * - https://music.youtube.com/watch?v=86DvZHUgqms&playnext=1&list=PL123 -> https://www.youtube.com/watch?v=86DvZHUgqms&list=PL123
 * Also handles YouTube shorts, mobile links, playlist links, and removes unwanted/tracking params (playnext, si, pp, feature, etc.).
 */
export function fixYoutubeUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== "string") return inputUrl;
  let urlStr = inputUrl.trim();
  if (!urlStr) return urlStr;

  let tempUrlStr = urlStr;
  if (!/^https?:\/\//i.test(tempUrlStr)) {
    tempUrlStr = "https://" + tempUrlStr;
  }

  try {
    const url = new URL(tempUrlStr);
    const host = url.hostname.toLowerCase();

    // Helper to build clean query parameters preserving allowed params (with v or list prioritized)
    const buildCleanParams = (rawParams, overrideVideoId = null) => {
      const newParams = new URLSearchParams();
      if (overrideVideoId) {
        newParams.set("v", overrideVideoId);
      } else if (rawParams.has("v") && ALLOWED_YT_PARAMS.has("v")) {
        newParams.set("v", rawParams.get("v"));
      }

      for (const [key, val] of rawParams.entries()) {
        if (key !== "v" && ALLOWED_YT_PARAMS.has(key)) {
          newParams.append(key, val);
        }
      }
      return newParams;
    };

    // 1. handle youtu.be domain
    if (host === "youtu.be" || host.endsWith(".youtu.be")) {
      const pathSegments = url.pathname.split("/").filter(Boolean);
      let videoId = "";
      if (pathSegments.length > 0) {
        if (["shorts", "live", "v", "embed"].includes(pathSegments[0].toLowerCase())) {
          videoId = pathSegments[1] || "";
        } else {
          videoId = pathSegments[0];
        }
      }

      if (videoId) {
        const rawParams = new URLSearchParams(url.search);
        const cleanParams = buildCleanParams(rawParams, videoId);
        return `https://www.youtube.com/watch?${cleanParams.toString()}`;
      }
    }

    // 2. handle youtube.com variants (music.youtube.com, m.youtube.com, www.youtube.com, youtube.com, etc.)
    if (host.includes("youtube.com")) {
      const rawParams = new URLSearchParams(url.search);
      let videoId = rawParams.get("v") || "";
      const pathSegments = url.pathname.split("/").filter(Boolean);

      if (pathSegments.length > 0) {
        const firstSeg = pathSegments[0].toLowerCase();
        if (["shorts", "live", "v", "embed"].includes(firstSeg)) {
          if (pathSegments[1]) {
            videoId = pathSegments[1];
          }
        }
      }

      const isPlaylistPath = url.pathname.toLowerCase().includes("/playlist");

      if (videoId) {
        const cleanParams = buildCleanParams(rawParams, videoId);
        return `https://www.youtube.com/watch?${cleanParams.toString()}`;
      } else if (url.pathname.toLowerCase() === "/watch" && rawParams.has("v")) {
        const cleanParams = buildCleanParams(rawParams);
        return `https://www.youtube.com/watch?${cleanParams.toString()}`;
      } else if (isPlaylistPath && rawParams.has("list")) {
        const cleanParams = buildCleanParams(rawParams);
        return `https://www.youtube.com/playlist?${cleanParams.toString()}`;
      } else if (host !== "www.youtube.com") {
        const cleanParams = buildCleanParams(rawParams);
        const qs = cleanParams.toString();
        return `https://www.youtube.com${url.pathname}${qs ? "?" + qs : ""}`;
      }
    }
  } catch (caughtErr) { reportError("js/ytdlp_url.js:fixYoutubeUrl", caughtErr); }

  // Regex fallback for youtu.be/VIDEO_ID
  const shortMatch = urlStr.match(/(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]+)/i);
  if (shortMatch && shortMatch[1]) {
    return `https://www.youtube.com/watch?v=${shortMatch[1]}`;
  }

  // Regex fallback for music.youtube.com/watch?v=VIDEO_ID
  const musicMatch = urlStr.match(/(?:https?:\/\/)?music\.youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]+)/i);
  if (musicMatch && musicMatch[1]) {
    return `https://www.youtube.com/watch?v=${musicMatch[1]}`;
  }

  return urlStr;
}

/**
 * Initializes the Fix Link button event listener and URL input handler.
 * @param {Function} updateCommandPreviewFn - Callback to update command preview after URL changes.
 * @param {Function} [getAppSettingsFn] - Optional getter function for application settings.
 */
export function initYtDlpUrlFixer(updateCommandPreviewFn, getAppSettingsFn) {
  const btnFixUrl = document.getElementById("btn-fix-url");
  const ytdlpUrlInput = document.getElementById("ytdlp-url-input");

  const runFix = (showAnimation = false) => {
    if (!ytdlpUrlInput) return;
    const currentVal = ytdlpUrlInput.value;
    if (!currentVal || !currentVal.trim()) return;

    const fixedVal = fixYoutubeUrl(currentVal);
    if (fixedVal !== currentVal || showAnimation) {
      ytdlpUrlInput.value = fixedVal;
      ytdlpUrlInput.dispatchEvent(new Event("input", { bubbles: true }));

      if (typeof updateCommandPreviewFn === "function") {
        updateCommandPreviewFn();
      }
    }

    if (showAnimation && btnFixUrl) {
      const iconEl = btnFixUrl.querySelector("ion-icon");
      if (iconEl) {
        animateCopyConfirm(iconEl, { confirmIcon: "checkmark-outline" });
      }
    }
  };

  if (btnFixUrl) {
    btnFixUrl.addEventListener("click", () => runFix(true));
  }

  const checkPlaylistUrlWarning = () => {
    const warningEl = document.getElementById("ytdlp-playlist-detected-warning");
    if (!warningEl) return;
    const currentVal = ytdlpUrlInput ? ytdlpUrlInput.value : "";
    const activeTool = getCurrentActiveTool();
    if (activeTool === "ytdlp_audio" && isPlaylistOrAlbumUrl(currentVal)) {
      warningEl.classList.remove("d-none");
    } else {
      warningEl.classList.add("d-none");
    }
  };

  if (ytdlpUrlInput) {
    ytdlpUrlInput.addEventListener("input", checkPlaylistUrlWarning);
    ytdlpUrlInput.addEventListener("change", checkPlaylistUrlWarning);
    ytdlpUrlInput.addEventListener("blur", () => {
      const settings = typeof getAppSettingsFn === "function" ? getAppSettingsFn() : null;
      if (settings && settings.ytdlpAutoFixUrl === false) {
        checkPlaylistUrlWarning();
        return;
      }
      runFix(false);
      checkPlaylistUrlWarning();
    });
  }

  const btnSwitchPlaylist = document.getElementById("btn-switch-to-playlist-tool");
  if (btnSwitchPlaylist) {
    btnSwitchPlaylist.addEventListener("click", () => {
      // Trigger navigation click on ytdlp_playlist
      const playlistNavBtn = document.querySelector("#ytdlp-nav [data-tool='ytdlp_playlist'], [data-tool='ytdlp_playlist']");
      if (playlistNavBtn) {
        playlistNavBtn.click();
      }
      checkPlaylistUrlWarning();
    });
  }
}

/**
 * Checks if a given input URL represents a playlist or an album.
 * Matches YouTube and YouTube Music playlists/albums:
 * - list= parameter (e.g. list=OLAK5uy_..., list=PL..., etc.)
 * - /playlist or /album/ in pathname
 * - OLAK5uy_ YouTube Music album IDs
 * @param {string} inputUrl
 * @returns {boolean}
 */
export function isPlaylistOrAlbumUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== "string") return false;
  const trimmed = inputUrl.trim();
  if (!trimmed) return false;

  // Direct regex checks for common forms
  if (/[?&]list=([a-zA-Z0-9_-]+)/i.test(trimmed)) return true;
  if (/OLAK5uy_[a-zA-Z0-9_-]+/i.test(trimmed)) return true;
  if (/(?:youtube\.com|youtu\.be)\/(?:playlist|album)\b/i.test(trimmed)) return true;

  try {
    let testUrl = trimmed;
    if (!/^https?:\/\//i.test(testUrl)) {
      testUrl = "https://" + testUrl;
    }
    const parsed = new URL(testUrl);
    if (parsed.searchParams.has("list")) return true;
    const path = parsed.pathname.toLowerCase();
    if (path.includes("/playlist") || path.includes("/album/")) return true;
  } catch (_) {
    // Ignore URL parse failures and rely on regex
  }

  return false;
}

