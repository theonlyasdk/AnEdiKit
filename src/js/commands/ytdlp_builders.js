// AnEdiKit - yt-dlp shared args + download command builders.
import { getLastYtDlpOutDir } from "../storage.js";
import { getSavedYtDlpFormat } from "../ytdlp_format.js";

export function appendGlobalYtDlpArgs(args, settings = {}, targetUrl = "") {
  const hasFlag = (flag) => args.includes(flag);
  const customArgsPreview = settings.ytdlpCustomArgs ?? document.getElementById("set-ytdlp-custom-args")?.value?.trim() ?? "";

  const cookies = settings.ytdlpCookies || document.getElementById("set-ytdlp-cookies")?.value || "none";
  if (cookies && cookies !== "none") {
    args.push("--cookies-from-browser", cookies);
  }

  const ratelimit = settings.ytdlpRateLimit || document.getElementById("set-ytdlp-ratelimit")?.value || "none";
  if (ratelimit && ratelimit !== "none") {
    args.push("-r", ratelimit);
  }

  const sponsorblock = settings.ytdlpSponsorblock ?? document.getElementById("set-ytdlp-sponsorblock")?.checked;
  if (sponsorblock) {
    args.push("--sponsorblock-remove", "all");
  }

  const geoBypass = settings.ytdlpGeoBypass ?? document.getElementById("set-ytdlp-geo-bypass")?.checked ?? true;
  if (geoBypass) {
    args.push("--geo-bypass");
  }

  // ytdlnis-inspired robustness defaults (avoid bot-check / fragile failures).
  // Only add when the user hasn't already overridden them via custom flags.
  if (!hasFlag("--retries") && !customArgsPreview.includes("--retries")) {
    args.push("--retries", "10");
  }
  if (!hasFlag("--fragment-retries") && !customArgsPreview.includes("--fragment-retries")) {
    args.push("--fragment-retries", "10");
  }
  if (!hasFlag("--socket-timeout") && !customArgsPreview.includes("--socket-timeout")) {
    args.push("--socket-timeout", "15");
  }
  if (!hasFlag("--compat-options") && !customArgsPreview.includes("manifest-filesize-approx")) {
    args.push("--compat-options", "manifest-filesize-approx");
  }
  // Default YouTube player clients: fixes "Sign in to confirm you're not a bot"
  // (ytdlnis: setYoutubeExtractorArgs). Skip if user already set extractor-args.
  // music.youtube.com uses the web_music client, whose https formats require a
  // GVS PO token -- forcing web* clients there only produces PO-token warnings,
  // so stick to android/ios which work without one (yt-dlp PO-Token-Guide).
  if (!hasFlag("--extractor-args") && !customArgsPreview.includes("--extractor-args")) {
    const clients = /music\.youtube\.com/i.test(targetUrl || "") ? "android,ios" : "android,web";
    args.push("--extractor-args", `youtube:player_client=${clients}`);
  }
  if (!hasFlag("--no-mtime") && !hasFlag("--mtime") && !customArgsPreview.includes("--no-mtime")) {
    args.push("--no-mtime");
  }

  const customArgsStr = customArgsPreview;
  if (customArgsStr) {
    const matches = customArgsStr.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
    if (matches) {
      matches.forEach((m) => {
        args.push(m.replace(/^['"]|['"]$/g, ""));
      });
    }
  }
}

// Ensure output template ends with exactly one .%(ext)s (ytdlnis: removeSuffix + re-add).


// Ensure output template ends with exactly one .%(ext)s (ytdlnis: removeSuffix + re-add).
export function normalizeYtDlpTemplate(fmt) {
  const fallback = "%(title)s [%(id)s].%(ext)s";
  let t = (fmt || "").trim() || fallback;
  // Strip any trailing .%(ext)s occurrences, then re-add one.
  t = t.replace(/(\.\%\(ext\)s)+$/g, "");
  return `${t}.%(ext)s`;
}

// Validate --playlist-items syntax (e.g. "1-10,15,20-25"). Returns null when invalid.


// Validate --playlist-items syntax (e.g. "1-10,15,20-25"). Returns null when invalid.
export function sanitizePlaylistItems(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || s.toLowerCase() === "all") return null;
  // Allow digits, commas, dashes, colons (step), spaces.
  if (!/^[0-9,\-\:\s]+$/.test(s)) return null;
  const cleaned = s.replace(/\s+/g, "");
  if (!/[0-9]/.test(cleaned)) return null;
  return cleaned;
}

// Shared filename safety flags (ytdlnis: restrict-filenames + trim-filenames + no-part handling).


// Shared filename safety flags (ytdlnis: restrict-filenames + trim-filenames + no-part handling).
export function appendYtDlpFilenameSafety(args, outDir) {
  if (!args.includes("--restrict-filenames")) {
    args.push("--restrict-filenames");
  }
  // Windows MAX_PATH guard: yt-dlp trims to (limit) chars; reserve room for outDir.
  if (!args.includes("--trim-filenames")) {
    const reserve = Math.max(0, (outDir || "").length);
    const limit = Math.max(64, 254 - reserve);
    args.push("--trim-filenames", String(Math.min(254, limit)));
  }
}


export function resolveYtDlpOutputDir(settings = {}) {
  const customOut = document.getElementById("ytdlp-output-dir")?.value?.trim();
  if (customOut) return customOut;
  const lastSaved = getLastYtDlpOutDir();
  if (lastSaved) return lastSaved;
  return settings.outputDir || "C:\\Users\\User\\Downloads";
}


export function resolveYtDlpFilenameFormat(settings = {}) {
  const customFmt = document.getElementById("ytdlp-filename-format")?.value?.trim();
  if (customFmt) return customFmt;
  return settings.ytdlpFilenameFormat || getSavedYtDlpFormat();
}


export function buildYtDlpVideoCommand(url, outputDir, settings = {}) {
  const targetUrl = url || document.getElementById("ytdlp-url-input")?.value?.trim() || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const outDir = resolveYtDlpOutputDir(settings);
  const fmt = normalizeYtDlpTemplate(resolveYtDlpFilenameFormat(settings));
  const res = document.getElementById("dl-video-res")?.value || "best";
  const container = document.getElementById("dl-video-container")?.value || "mp4";
  const embedSubs = document.getElementById("dl-video-embed-subs")?.checked ?? true;
  const embedThumb = document.getElementById("dl-video-embed-thumb")?.checked ?? true;
  const embedMeta = document.getElementById("dl-video-embed-meta")?.checked ?? true;

  const args = [];

  // Single-video mode: never pull a whole playlist when URL contains list params
  // (ytdlnis uses --match-filter/-I for playlist items; here --no-playlist is correct).
  args.push("--no-playlist");

  // Format selection with ytdlnis-style fallbacks (bv+ba/b, not bestvideo* which
  // fails on sites without height metadata or storyboard-only entries).
  // -S sorts so the height cap is a preference, not a hard filter that errors out.
  if (res === "best") {
    args.push("-f", "bv*+ba/b");
    args.push("-S", `vcodec:h264,acodec:aac,ext:${container}`);
  } else {
    const h = parseInt(res, 10) || 1080;
    args.push("-f", `bv*[height<=${h}]+ba/b[height<=${h}]/b[height<=${h}]/b`);
    args.push("-S", `res:${h},vcodec:h264,acodec:aac,ext:${container}`);
  }

  args.push("--merge-output-format", container);

  if (embedSubs) {
    // ytdlnis: --embed-subs + --write-subs/--write-auto-subs + --sub-langs ".*-orig",
    // plus --sub-format fallback. "en,.*" is invalid and pulls every language.
    args.push("--embed-subs", "--write-subs", "--write-auto-subs");
    args.push("--sub-langs", "en.*-orig,en.*,.*-orig");
    args.push("--sub-format", "srt/best");
    args.push("--convert-subs", "srt");
  }
  if (embedThumb) {
    // convert-thumbnails is required: raw webp/png thumbs can't embed into mp4.
    args.push("--embed-thumbnail", "--convert-thumbnails", "jpg");
  }
  if (embedMeta) {
    args.push("--embed-metadata", "--embed-chapters");
  }

  appendGlobalYtDlpArgs(args, settings, targetUrl);
  appendYtDlpFilenameSafety(args, outDir);

  args.push("-P", outDir);
  args.push("-o", fmt);
  args.push(targetUrl);

  return {
    executable: "yt-dlp",
    args,
    destination: outDir,
    fullString: `yt-dlp ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}


export function buildYtDlpAudioCommand(url, outputDir, settings = {}) {
  const targetUrl = url || document.getElementById("ytdlp-url-input")?.value?.trim() || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const outDir = resolveYtDlpOutputDir(settings);
  const fmt = normalizeYtDlpTemplate(resolveYtDlpFilenameFormat(settings));
  const audioFmt = document.getElementById("dl-audio-fmt")?.value || "mp3";
  const quality = document.getElementById("dl-audio-quality")?.value || "0";
  const embedThumb = document.getElementById("dl-audio-embed-thumb")?.checked ?? true;
  const embedMeta = document.getElementById("dl-audio-embed-meta")?.checked ?? true;

  // ytdlnis audio flow: explicit ba/b selector + format sorting + -x post-extract.
  const args = ["-f", "ba/b", "-S", `acodec:${audioFmt},aext:${audioFmt}`, "--no-playlist", "-x", "--audio-format", audioFmt, "--audio-quality", quality];

  if (embedThumb) {
    args.push("--embed-thumbnail", "--convert-thumbnails", "jpg");
  }
  if (embedMeta) {
    args.push("--embed-metadata");
  }

  appendGlobalYtDlpArgs(args, settings, targetUrl);
  appendYtDlpFilenameSafety(args, outDir);

  args.push("-P", outDir);
  args.push("-o", fmt);
  args.push(targetUrl);

  return {
    executable: "yt-dlp",
    args,
    destination: outDir,
    fullString: `yt-dlp ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}


export function buildYtDlpPlaylistCommand(url, outputDir, settings = {}, selectedIndices = null) {
  const targetUrl = url || document.getElementById("ytdlp-url-input")?.value?.trim() || "https://www.youtube.com/playlist?list=PL...";
  const outDir = resolveYtDlpOutputDir(settings);
  const fmt = normalizeYtDlpTemplate(resolveYtDlpFilenameFormat(settings));
  const mode = document.getElementById("dl-playlist-mode")?.value || "video";
  const items = document.getElementById("dl-playlist-items")?.value?.trim() || "all";
  const autonumber = document.getElementById("dl-playlist-autonumber")?.checked ?? true;
  const ignoreErrors = document.getElementById("dl-playlist-ignore-errors")?.checked ?? true;

  const args = ["--yes-playlist"];

  if (ignoreErrors) {
    args.push("-i");
  }

  if (selectedIndices && selectedIndices.length > 0) {
    const clean = selectedIndices
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
      .join(",");
    if (clean) args.push("--playlist-items", clean);
  } else {
    const cleanItems = sanitizePlaylistItems(items);
    if (cleanItems) {
      args.push("--playlist-items", cleanItems);
    } else if (items && items.toLowerCase() !== "all") {
      // Invalid range syntax: fail fast with a clear message instead of a cryptic yt-dlp error.
      throw new Error(`Invalid playlist range "${items}". Use e.g. 1-10, 15, 20-25 or "all".`);
    }
  }

  if (mode === "audio") {
    args.push("-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0", "--embed-thumbnail", "--convert-thumbnails", "jpg", "--embed-metadata");
  } else {
    args.push("-f", "bv*[height<=1080]+ba/b[height<=1080]/b[height<=1080]/b", "-S", "res:1080,vcodec:h264,acodec:aac,ext:mp4", "--merge-output-format", "mp4", "--embed-thumbnail", "--convert-thumbnails", "jpg", "--embed-metadata");
  }

  appendGlobalYtDlpArgs(args, settings, targetUrl);
  appendYtDlpFilenameSafety(args, outDir);

  args.push("-P", outDir);

  // ytdlnis-style: single .%(ext)s, playlist folder prefix, optional index numbering.
  const base = fmt.replace(/(\.\%\(ext\)s)+$/g, "");
  if (autonumber) {
    if (!base.includes("%(playlist_index)s")) {
      args.push("-o", `%(playlist_title)s/%(playlist_index)s - ${base}.%(ext)s`);
    } else {
      args.push("-o", `%(playlist_title)s/${base}.%(ext)s`);
    }
  } else {
    args.push("-o", `%(playlist_title)s/${base}.%(ext)s`);
  }

  args.push(targetUrl);

  return {
    executable: "yt-dlp",
    args,
    destination: outDir,
    fullString: `yt-dlp ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}


export function buildYtDlpSubtitlesCommand(url, outputDir, settings = {}) {
  const targetUrl = url || document.getElementById("ytdlp-url-input")?.value?.trim() || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const outDir = resolveYtDlpOutputDir(settings);
  const fmt = normalizeYtDlpTemplate(resolveYtDlpFilenameFormat(settings));
  const lang = document.getElementById("dl-sub-lang")?.value?.trim() || "en";
  const subFmt = document.getElementById("dl-sub-fmt")?.value || "srt";
  const autoSubs = document.getElementById("dl-sub-auto")?.checked ?? true;
  const downloadThumb = document.getElementById("dl-sub-thumb")?.checked ?? true;
  const writeInfo = document.getElementById("dl-sub-info")?.checked ?? false;

  // --skip-download subtitle fetch: allow playlists but keep going past failures (ytdlnis: -i).
  const args = ["--skip-download", "-i"];

  // "all" is a valid yt-dlp value; normalize comma/space separated input.
  const normLang = lang.toLowerCase() === "all" ? "all" : lang.replace(/\s+/g, "").replace(/,+/g, ",") || "en";
  args.push("--write-subs", "--sub-langs", normLang, "--sub-format", `${subFmt}/best`, "--convert-subs", subFmt);
  if (autoSubs) {
    args.push("--write-auto-subs");
  }
  if (downloadThumb) {
    args.push("--write-thumbnail", "--convert-thumbnails", "jpg");
  }
  if (writeInfo) {
    args.push("--write-info-json", "--write-description", "--no-clean-info-json");
  }

  appendGlobalYtDlpArgs(args, settings, targetUrl);
  appendYtDlpFilenameSafety(args, outDir);

  args.push("-P", outDir);
  args.push("-o", fmt);
  args.push(targetUrl);

  return {
    executable: "yt-dlp",
    args,
    destination: outDir,
    fullString: `yt-dlp ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
  };
}
