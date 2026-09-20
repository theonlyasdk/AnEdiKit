// AnEdiKit - Static tool registry (no DOM, no cycles).
// Extracted from navigation.js so TOOL_METADATA / TOOL_ORDER can be imported
// by contract tests, kits, and navigation UI without pulling in runner,
// audio_tags, or pdf_tools. navigation.js re-exports these for backward compat.

export const TOOL_METADATA = {
  all_tools: {
    title: "All Tools",
    desc: "Browse every AnEdiKit tool, grouped by section.",
    viewId: "all-tools-browser",
  },
  convert: {
    title: "Convert Video Formats",
    desc: "Convert between MP4, MKV, WebM, MOV, and AVI with codec, CRF quality, and resolution controls.",
    viewId: "view-convert",
  },
  extract_audio: {
    title: "Extract & Convert Audio",
    desc: "Extract audio tracks from video files or convert between MP3, M4A, FLAC, WAV, OGG, and OPUS.",
    viewId: "view-extract_audio",
  },
  trim: {
    title: "Trim and Cut Media",
    desc: "Cut video or audio clips instantly with lossless stream copy or accurate re-encode.",
    viewId: "view-trim",
  },
  speed_motion: {
    title: "Speed & Motion Control",
    desc: "Speed up, slow down, timelapse, hyperlapse, pitch correction, and optical flow frame interpolation.",
    viewId: "view-speed_motion",
  },
  aspect_crop: {
    title: "Aspect Ratio & Crop Framing",
    desc: "Convert aspect ratios for TikTok 9:16, Square 1:1, Ultrawide 21:9 with center crop or blurred background.",
    viewId: "view-aspect_crop",
  },
  stabilize: {
    title: "Video Stabilization & Deshake",
    desc: "Remove handheld camera shakes and stabilize action or drone footage using native FFmpeg algorithms.",
    viewId: "view-stabilize",
  },
  loop_duration: {
    title: "Loop to Duration",
    desc: "Repeat and loop videos or audio to an exact target duration or repeat count with seamless stream copy.",
    viewId: "view-loop_duration",
  },
  normalize: {
    title: "Volume Normalization & Loudness",
    desc: "Standardize audio loudness to YouTube, Spotify, Podcasts, or broadcast EBU R128 standards.",
    viewId: "view-normalize",
  },
  compress: {
    title: "Compress Video",
    desc: "Reduce video file size for Discord (24 MB), WhatsApp (15 MB), Email (10 MB), or custom target size.",
    viewId: "view-compress",
  },
  compress_audio: {
    title: "Compress Audio",
    desc: "Reduce audio file sizes for voice notes, podcasts, Discord, WhatsApp, or email attachments with Opus, MP3, and AAC codecs.",
    viewId: "view-compress_audio",
  },
  audio_tags: {
    title: "Audio Tag & Metadata Editor",
    desc: "Edit ID3 tags (title, artist, album, genre, year, track number) and embed custom cover artwork into MP3, M4A, FLAC, and OGG files.",
    viewId: "view-audio_tags",
  },
  merge: {
    title: "Merge and Concatenate",
    desc: "Combine multiple video or audio files into a single seamless continuous media stream.",
    viewId: "view-merge",
  },
  mute_replace: {
    title: "Mute or Replace Audio",
    desc: "Remove audio tracks completely or replace background audio with an external audio file.",
    viewId: "view-mute_replace",
  },
  gif_frames: {
    title: "GIF and Frame Extraction",
    desc: "Generate animated GIFs with PaletteGen color optimization or export individual image frames.",
    viewId: "view-gif_frames",
  },
  custom: {
    title: "Custom FFmpeg Command",
    desc: "Execute custom FFmpeg argument strings with live command preview and real-time execution logs.",
    viewId: "view-custom",
  },
  bg_remover: {
    title: "AI Background Remover",
    desc: "Remove background and extract subjects locally using on-device neural segmentation models.",
    viewId: "view-bg_remover",
  },
  ai_upscaler: {
    title: "AI Image Upscaler",
    desc: "Super-resolution deep learning 2x, 3x, 4x image upscaling with edge sharpening and noise reduction.",
    viewId: "view-ai_upscaler",
  },
  vectorizer: {
    title: "Image Vectorizer (SVG)",
    desc: "Convert raster images (PNG, JPG) into clean, scalable vector SVG layers and curves.",
    viewId: "view-vectorizer",
  },
  restore_denoise: {
    title: "Image Restoration & Denoise",
    desc: "Remove photo noise, grain, and blur using Non-Local Means, Bilateral, and Unsharp Mask algorithms.",
    viewId: "view-restore_denoise",
  },
  icon_generator: {
    title: "Icon & Asset Generator",
    desc: "Generate multi-resolution Windows .ico, Apple Touch icons, Android PWA assets, and web favicons.",
    viewId: "view-icon_generator",
  },
  metadata_cleaner: {
    title: "Metadata Viewer & Cleaner",
    desc: "Inspect and strip EXIF tags, GPS coordinates, and camera metadata for photo privacy.",
    viewId: "view-metadata_cleaner",
  },
  pdf_organize: {
    title: "Organize PDF",
    desc: "Merge, split, remove, extract, organize, and scan PDF pages.",
    viewId: "view-pdf",
  },
  pdf_optimize: {
    title: "Optimize PDF",
    desc: "Compress, repair, and OCR PDF documents.",
    viewId: "view-pdf",
  },
  pdf_to: {
    title: "Convert to PDF",
    desc: "Convert images, Word, PowerPoint, Excel, and HTML to PDF.",
    viewId: "view-pdf",
  },
  pdf_from: {
    title: "Convert from PDF",
    desc: "Convert PDFs to images, Word, PowerPoint, Excel, PDF/A, and Markdown.",
    viewId: "view-pdf",
  },
  pdf_edit: {
    title: "Edit PDF",
    desc: "Edit text, rotate, crop, add page numbers, watermarks, and fill interactive forms.",
    viewId: "view-pdf",
  },
  pdf_security: {
    title: "PDF Security",
    desc: "Protect, unlock, sign, redact, and compare PDF documents.",
    viewId: "view-pdf",
  },
  pdf_intelligence: {
    title: "PDF Intelligence",
    desc: "AI document summarization and multi-language translation.",
    viewId: "view-pdf",
  },
  ytdlp_video: {
    title: "Download Video",
    desc: "Download full video streams from YouTube, Twitch, Twitter, TikTok, and 1000+ sites with resolution and container options.",
    viewId: "view-ytdlp_video",
  },
  ytdlp_audio: {
    title: "Download Audio & Music",
    desc: "Extract and convert online media directly to MP3, M4A, FLAC, or OPUS with automatic album art and metadata.",
    viewId: "view-ytdlp_audio",
  },
  ytdlp_playlist: {
    title: "Download Playlist",
    desc: "Fetch and download complete playlists, video series, channels, or select specific videos to download.",
    viewId: "view-ytdlp_playlist",
  },
  ytdlp_subtitles: {
    title: "Subtitles & Thumbnails",
    desc: "Extract closed captions, auto-generated subtitles, cover thumbnails, and video metadata without re-downloading media.",
    viewId: "view-ytdlp_subtitles",
  },
  settings: {
    title: "Settings & Defaults",
    desc: "Configure default output folders, hardware acceleration engine, encoding threads, and system binaries.",
    viewId: "view-settings",
  },
};

export const TOOL_ORDER = [
  "all_tools",
  "ytdlp_audio",
  "ytdlp_video",
  "ytdlp_playlist",
  "ytdlp_subtitles",
  "convert",
  "compress",
  "trim",
  "speed_motion",
  "aspect_crop",
  "stabilize",
  "loop_duration",
  "normalize",
  "mute_replace",
  "gif_frames",
  "extract_audio",
  "compress_audio",
  "audio_tags",
  "merge",
  "custom",
  "bg_remover",
  "ai_upscaler",
  "vectorizer",
  "restore_denoise",
  "icon_generator",
  "metadata_cleaner",
  "pdf_organize",
  "pdf_optimize",
  "pdf_to",
  "pdf_from",
  "pdf_edit",
  "pdf_security",
  "pdf_intelligence",
  "settings",
];

export function isPdfToolId(toolId) {
  return typeof toolId === "string" && (toolId === "pdf" || toolId.startsWith("pdf_"));
}

export function getViewIdForTool(toolId) {
  return TOOL_METADATA[toolId]?.viewId || null;
}

export function isKnownTool(toolId) {
  return Object.prototype.hasOwnProperty.call(TOOL_METADATA, toolId);
}
