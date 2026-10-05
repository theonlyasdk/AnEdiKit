import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface MediaInfo {
  file_path: string;
  file_name: string;
  duration_seconds: number;
  duration_string: string;
  resolution: string;
  video_codec: string;
  audio_codec: string;
  file_size_mb: number;
  file_size_formatted: string;
  bitrate_kbps: number;
  album_art_url: string | null;
}

export interface FfmpegProgress {
  time: string;
  eta: string | null;
  fps: string;
  speed: string;
  bitrate: string;
  pct: number;
  playlist_item: number | null;
  playlist_total: number | null;
  current_item_title: string | null;
}

export interface FfmpegLog {
  line: string;
}

export interface FfmpegFinish {
  success: boolean;
  exit_code: number;
  message: string;
}

export type PickFilter = "pdf" | "image" | "audio" | "video";

export function pickFile(filterMode?: PickFilter): Promise<string | null> {
  return invoke<string | null>("pick_file", { filterMode: filterMode ?? null });
}

export function pickFolder(defaultPath?: string): Promise<string | null> {
  return invoke<string | null>("pick_folder", {
    defaultPath: defaultPath ?? null,
  });
}

export function getMediaInfo(filePath: string): Promise<MediaInfo> {
  return invoke<MediaInfo>("get_media_info", { filePath });
}

export function checkFileExists(filePath: string): Promise<boolean> {
  return invoke<boolean>("check_file_exists", { filePath });
}

export function showInFolder(filePath: string): Promise<void> {
  return invoke<void>("show_in_folder", { filePath });
}

export function executeFfmpeg(
  args: string[],
  totalDuration?: number,
): Promise<void> {
  return invoke<void>("execute_ffmpeg", {
    args,
    totalDuration: totalDuration ?? null,
  });
}

export function cancelFfmpeg(): Promise<void> {
  return invoke<void>("cancel_ffmpeg");
}

export function onFfmpegProgress(
  handler: (payload: FfmpegProgress) => void,
): Promise<UnlistenFn> {
  return listen<FfmpegProgress>("ffmpeg-progress", (event) =>
    handler(event.payload),
  );
}

export function onFfmpegLog(
  handler: (payload: FfmpegLog) => void,
): Promise<UnlistenFn> {
  return listen<FfmpegLog>("ffmpeg-log", (event) => handler(event.payload));
}

export function onFfmpegFinished(
  handler: (payload: FfmpegFinish) => void,
): Promise<UnlistenFn> {
  return listen<FfmpegFinish>("ffmpeg-finished", (event) =>
    handler(event.payload),
  );
}

export function onConfirmExitRequested(
  handler: () => void,
): Promise<UnlistenFn> {
  return listen("confirm-exit-requested", () => handler());
}
