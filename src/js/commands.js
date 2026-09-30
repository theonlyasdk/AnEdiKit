// AnEdiKit - Command builders facade (API-preserving).
// Implementations live in ./commands/*.js; this module re-exports
// every public symbol plus the buildCommandForTool dispatcher so all
// existing import paths keep working.

import {
  setCachedMediaProbe,
  getCachedMediaProbe,
  probeHasAudio,
  probeIsAudioOnly,
} from "./commands/probe_cache.js";
import {
  isAudioPath,
  audioCodecToContainer,
  resolveDestinationPath,
  parseTimestampToSeconds,
} from "./commands/path_helpers.js";
import {
  setDetectedHardware,
  getResolvedHwaccel,
  mapHardwareEncoder,
  getHwaccelInputArgs,
  applyVideoEncoderOptions,
} from "./commands/hwaccel.js";
import {
  buildConvertCommand,
  buildAudioExtractCommand,
  buildTrimCommand,
  buildCompressCommand,
  buildCompressAudioCommand,
  buildAudioTagsCommand,
  buildLoopDurationCommand,
  buildMergeCommand,
  buildMuteReplaceCommand,
  buildGifFramesCommand,
  buildCustomCommand,
} from "./commands/video_builders.js";
import {
  appendGlobalYtDlpArgs,
  normalizeYtDlpTemplate,
  sanitizePlaylistItems,
  appendYtDlpFilenameSafety,
  resolveYtDlpOutputDir,
  resolveYtDlpFilenameFormat,
  buildYtDlpVideoCommand,
  buildYtDlpAudioCommand,
  buildYtDlpPlaylistCommand,
  buildYtDlpSubtitlesCommand,
} from "./commands/ytdlp_builders.js";
import {
  buildSpeedMotionCommand,
  buildAspectCropCommand,
  buildStabilizeCommand,
  buildNormalizeCommand,
} from "./commands/filter_builders.js";
export {
  setCachedMediaProbe,
  getCachedMediaProbe,
  probeHasAudio,
  probeIsAudioOnly,
  isAudioPath,
  audioCodecToContainer,
  resolveDestinationPath,
  parseTimestampToSeconds,
  setDetectedHardware,
  getResolvedHwaccel,
  mapHardwareEncoder,
  getHwaccelInputArgs,
  applyVideoEncoderOptions,
  buildConvertCommand,
  buildAudioExtractCommand,
  buildTrimCommand,
  buildCompressCommand,
  buildCompressAudioCommand,
  buildAudioTagsCommand,
  buildLoopDurationCommand,
  buildMergeCommand,
  buildMuteReplaceCommand,
  buildGifFramesCommand,
  buildCustomCommand,
  appendGlobalYtDlpArgs,
  normalizeYtDlpTemplate,
  sanitizePlaylistItems,
  appendYtDlpFilenameSafety,
  resolveYtDlpOutputDir,
  resolveYtDlpFilenameFormat,
  buildYtDlpVideoCommand,
  buildYtDlpAudioCommand,
  buildYtDlpPlaylistCommand,
  buildYtDlpSubtitlesCommand,
  buildSpeedMotionCommand,
  buildAspectCropCommand,
  buildStabilizeCommand,
  buildNormalizeCommand,
};

// Re-export Image & AI commands from image_commands.js
export {
  resolveImageAiDestinationPath,
  buildBgRemoverCommand,
  buildAiUpscalerCommand,
  buildVectorizerCommand,
  buildRestoreDenoiseCommand,
  buildIconGeneratorCommand,
  buildMetadataCleanerCommand,
} from "./image_commands.js";

import {
  buildBgRemoverCommand,
  buildAiUpscalerCommand,
  buildVectorizerCommand,
  buildRestoreDenoiseCommand,
  buildIconGeneratorCommand,
  buildMetadataCleanerCommand,
} from "./image_commands.js";

export function buildCommandForTool(
  toolId,
  inputFile,
  outputDir,
  settings = {},
  extraParams = {},
) {
  switch (toolId) {
    case "all_tools":
    case "pdf_organize":
    case "pdf_optimize":
    case "pdf_to":
    case "pdf_from":
    case "pdf_edit":
    case "pdf_security":
    case "pdf_intelligence":
      return null;
    case "convert":
      return buildConvertCommand(inputFile, outputDir, settings);
    case "extract_audio":
      return buildAudioExtractCommand(inputFile, outputDir, settings);
    case "trim":
      return buildTrimCommand(inputFile, outputDir, settings);
    case "speed_motion":
      return buildSpeedMotionCommand(inputFile, outputDir, settings);
    case "aspect_crop":
      return buildAspectCropCommand(inputFile, outputDir, settings);
    case "stabilize":
      return buildStabilizeCommand(inputFile, outputDir, settings);
    case "loop_duration":
      return buildLoopDurationCommand(inputFile, outputDir, settings);
    case "normalize":
      return buildNormalizeCommand(inputFile, outputDir, settings);
    case "compress":
      return buildCompressCommand(inputFile, outputDir, settings);
    case "compress_audio":
      return buildCompressAudioCommand(inputFile, outputDir, settings);
    case "audio_tags":
      return buildAudioTagsCommand(inputFile, outputDir, settings, extraParams);
    case "merge":
      return buildMergeCommand(extraParams.mergeFiles || [], outputDir, settings, extraParams.concatListPath);
    case "mute_replace":
      return buildMuteReplaceCommand(inputFile, outputDir, settings);
    case "gif_frames":
      return buildGifFramesCommand(inputFile, outputDir, settings);
    case "bg_remover":
      return buildBgRemoverCommand(inputFile, outputDir, settings);
    case "ai_upscaler":
      return buildAiUpscalerCommand(inputFile, outputDir, settings);
    case "vectorizer":
      return buildVectorizerCommand(inputFile, outputDir, settings);
    case "restore_denoise":
      return buildRestoreDenoiseCommand(inputFile, outputDir, settings);
    case "icon_generator":
      return buildIconGeneratorCommand(inputFile, outputDir, settings);
    case "metadata_cleaner":
      return buildMetadataCleanerCommand(inputFile, outputDir, settings);
    case "custom":
      return buildCustomCommand(inputFile, outputDir, settings);
    case "ytdlp_video":
      return buildYtDlpVideoCommand(extraParams.url, outputDir, settings);
    case "ytdlp_audio":
      return buildYtDlpAudioCommand(extraParams.url, outputDir, settings);
    case "ytdlp_playlist":
      return buildYtDlpPlaylistCommand(extraParams.url, outputDir, settings, extraParams.selectedIndices);
    case "ytdlp_subtitles":
      return buildYtDlpSubtitlesCommand(extraParams.url, outputDir, settings);
    default:
      return buildConvertCommand(inputFile, outputDir, settings);
  }
}
