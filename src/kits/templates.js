// AnEdiKit - User Kits Starter Templates and ID Utilities
import { loadUserKits, saveUserKits } from "./storage.js";

// Starter Templates for New Kits
export const STARTER_TEMPLATES = {
  converter: {
    id: "converter_template",
    name: "Video Format Converter",
    author: "User",
    version: "1.0.0",
    license: "MIT",
    description: "Convert video streams between MP4, MKV, and WebM with custom CRF quality",
    icon: "film-outline",
    category: "video",
    engine: "ffmpeg",
    blocks: [
      {
        id: "inputFile",
        type: "file_input",
        label: "Source Media File",
        fileFilter: "video",
        help: "Choose or drop a video file to convert",
        required: true,
      },
      {
        id: "containerFormat",
        type: "select",
        label: "Target Container Format",
        options: [
          { value: "mp4", label: "MP4 (.mp4)" },
          { value: "mkv", label: "MKV (.mkv)" },
          { value: "webm", label: "WebM (.webm)" },
          { value: "mov", label: "MOV (.mov)" },
        ],
        default: "mp4",
      },
      {
        id: "videoCodec",
        type: "select",
        label: "Video Codec",
        options: [
          { value: "libx264", label: "H.264 (libx264 - Universal)" },
          { value: "libx265", label: "H.265 / HEVC (libx265 - Smaller File)" },
          { value: "libvpx-vp9", label: "VP9 (libvpx-vp9)" },
          { value: "copy", label: "Stream Copy (Lossless / Fast)" },
        ],
        default: "libx264",
      },
      {
        id: "crfQuality",
        type: "number",
        label: "CRF Quality Value",
        min: 0,
        max: 51,
        step: 1,
        default: 23,
        unit: "CRF",
        help: "0 is lossless, 23 is default, 51 is worst quality",
      },
      {
        id: "fastStart",
        type: "checkbox",
        label: "Optimize for Web Streaming (+faststart)",
        default: true,
      },
      {
        id: "outputFolder",
        type: "folder_picker",
        label: "Output Destination Folder",
        placeholder: "Default Videos folder...",
      },
      {
        id: "outputFilename",
        type: "output_filename",
        label: "Output File Name",
        suffix: "_converted",
        ext: "mp4",
      },
    ],
    script: `/**
 * AnEdiKit Script Editor - buildCommand
 *
 * @param {Object} ctx
 * @param {Object} ctx.values - Block input values mapped by block ID:
 *   - ctx.values.inputFile (string): Path to source media file
 *   - ctx.values.containerFormat (string): Selected output container format
 *   - ctx.values.videoCodec (string): Selected video encoder codec
 *   - ctx.values.crfQuality (number): CRF quality factor
 *   - ctx.values.fastStart (boolean): Web faststart moov atom flag
 *   - ctx.values.outputFolder (string): Output destination folder path
 *   - ctx.values.outputFilename (string): Output base filename
 * @param {Object} ctx.helpers - Helper utilities:
 *   - ctx.helpers.getDefaultOutputDir(): string - Default Videos directory path
 *   - ctx.helpers.joinPath(dir, filename): string - Platform-safe path join
 *   - ctx.helpers.splitArgs(argString): string[] - Parse space-separated CLI flags
 *   - ctx.helpers.getSettings(): Object - Current application settings
 * @returns {string[]} Argument list array passed to FFmpeg / CLI engine
 */
function buildCommand(ctx) {
  const { values, helpers } = ctx;
  const input = values.inputFile;
  if (!input) return [];

  const outDir = values.outputFolder || helpers.getDefaultOutputDir();
  const baseName = values.outputFilename || "output";
  const ext = values.containerFormat || "mp4";
  const finalOut = helpers.joinPath(outDir, baseName.endsWith("." + ext) ? baseName : baseName + "." + ext);

  const args = ["-i", input];

  if (values.videoCodec && values.videoCodec !== "none") {
    args.push("-c:v", values.videoCodec);
  }
  if (values.crfQuality !== undefined && values.videoCodec !== "copy") {
    args.push("-crf", String(values.crfQuality));
  }
  if (values.fastStart && ext === "mp4") {
    args.push("-movflags", "+faststart");
  }

  args.push("-y", finalOut);
  return args;
}`,
  },
  audio_filter: {
    id: "audio_filter_template",
    name: "Audio Normalizer & Extractor",
    author: "User",
    version: "1.0.0",
    license: "MIT",
    description: "Extract audio and apply volume gain or peak normalization",
    icon: "musical-notes-outline",
    category: "audio",
    engine: "ffmpeg",
    blocks: [
      {
        id: "inputFile",
        type: "file_input",
        label: "Source Media File",
        fileFilter: "all",
        required: true,
      },
      {
        id: "audioFormat",
        type: "select",
        label: "Audio Format",
        options: [
          { value: "mp3", label: "MP3 (.mp3)" },
          { value: "m4a", label: "AAC (.m4a)" },
          { value: "flac", label: "FLAC Lossless (.flac)" },
          { value: "wav", label: "WAV PCM (.wav)" },
        ],
        default: "mp3",
      },
      {
        id: "audioBitrate",
        type: "select",
        label: "Audio Bitrate",
        options: [
          { value: "128k", label: "128 kbps (Standard)" },
          { value: "192k", label: "192 kbps (High)" },
          { value: "256k", label: "256 kbps (Very High)" },
          { value: "320k", label: "320 kbps (Maximum)" },
        ],
        default: "256k",
      },
      {
        id: "volumeGain",
        type: "slider",
        label: "Volume Boost / Gain",
        default: 100,
        min: 10,
        max: 300,
        step: 5,
        unit: "%",
      },
      {
        id: "outputFolder",
        type: "folder_picker",
        label: "Output Destination Folder",
      },
      {
        id: "outputFilename",
        type: "output_filename",
        label: "Output File Name",
        suffix: "_audio",
        ext: "mp3",
      },
    ],
    script: `/**
 * AnEdiKit Script Editor - buildCommand
 *
 * @param {Object} ctx
 * @param {Object} ctx.values - Block input values (ctx.values.inputFile, ctx.values.volumeGain, etc.)
 * @param {Object} ctx.helpers - Helper utilities (getDefaultOutputDir, joinPath, splitArgs)
 * @returns {string[]} Argument list array passed to FFmpeg / CLI engine
 */
function buildCommand(ctx) {
  const { values, helpers } = ctx;
  const input = values.inputFile;
  if (!input) return [];

  const outDir = values.outputFolder || helpers.getDefaultOutputDir();
  const baseName = values.outputFilename || "audio_extracted";
  const ext = values.audioFormat || "mp3";
  const finalOut = helpers.joinPath(outDir, \`\${baseName}.\${ext}\`);

  const args = ["-i", input, "-vn"];

  if (values.volumeGain && values.volumeGain !== 100) {
    const vol = (values.volumeGain / 100).toFixed(2);
    args.push("-af", \`volume=\${vol}\`);
  }

  if (ext === "mp3") {
    args.push("-c:a", "libmp3lame", "-b:a", values.audioBitrate || "256k");
  } else if (ext === "m4a") {
    args.push("-c:a", "aac", "-b:a", values.audioBitrate || "256k");
  } else if (ext === "flac") {
    args.push("-c:a", "flac");
  } else if (ext === "wav") {
    args.push("-c:a", "pcm_s16le");
  }

  args.push("-y", finalOut);
  return args;
}`,
  },
  blank: {
    id: "blank_template",
    name: "Blank Scriptable Kit",
    author: "User",
    version: "1.0.0",
    license: "MIT",
    description: "Custom modular FFmpeg script kit",
    icon: "code-slash-outline",
    category: "tools",
    engine: "ffmpeg",
    blocks: [
      {
        id: "inputFile",
        type: "file_input",
        label: "Source Input File",
        fileFilter: "all",
      },
      {
        id: "customArgs",
        type: "text",
        label: "Command Arguments",
        placeholder: "-c copy output.mp4",
        default: "",
      },
    ],
    script: `/**
 * AnEdiKit Script Editor - buildCommand
 *
 * @param {Object} ctx
 * @param {Object} ctx.values - Block input values
 * @param {Object} ctx.helpers - Helper utilities (getDefaultOutputDir, joinPath, splitArgs)
 * @returns {string[]} Argument list array passed to FFmpeg / CLI engine
 */
function buildCommand(ctx) {
  const { values, helpers } = ctx;
  const input = values.inputFile;
  if (!input) return [];

  const args = ["-i", input];
  if (values.customArgs && values.customArgs.trim()) {
    args.push(...helpers.splitArgs(values.customArgs));
  }
  return args;
}`,
  },
};

// Autogenerate a clean Kit ID based on author and name
export function generateKitId(author, name) {
  const cleanAuthor = (author || "user")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  const cleanName = (name || "kit")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `${cleanAuthor || "user"}.${cleanName || "new_kit"}`;
}

// Populate sample kits if list is empty
export function ensureDefaultSampleKits() {
  const existing = loadUserKits();
  if (existing.length === 0) {
    const sampleKit = {
      ...STARTER_TEMPLATES.converter,
      id: "user.webm_to_mp4_fast",
      name: "Fast MP4 Converter",
      author: "AnEdiKit",
    };
    saveUserKits([sampleKit]);
  }
}
