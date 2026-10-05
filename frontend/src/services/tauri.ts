import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface MediaProbeInfo {
  format?: {
    format_name?: string;
    duration?: string;
    size?: string;
    bit_rate?: string;
  };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    bit_rate?: string;
  }>;
}

export interface FfmpegProgressPayload {
  percent?: number;
  time?: string;
  speed?: string;
  frame?: number;
  fps?: number;
  size?: string;
  bitrate?: string;
}

export interface FfmpegLogPayload {
  line: string;
}

export interface FfmpegFinishedPayload {
  code: number;
  success: boolean;
  message?: string;
}

export async function pickFile(extensions: string[] = []): Promise<string | null> {
  try {
    const res = await invoke<string | null>('pick_file', { extensions });
    return res;
  } catch (err) {
    console.error('pickFile failed:', err);
    return null;
  }
}

export async function pickFolder(): Promise<string | null> {
  try {
    const res = await invoke<string | null>('pick_folder');
    return res;
  } catch (err) {
    console.error('pickFolder failed:', err);
    return null;
  }
}

export async function getMediaInfo(filePath: string): Promise<MediaProbeInfo | null> {
  try {
    const info = await invoke<MediaProbeInfo>('get_media_info', { filePath });
    return info;
  } catch (err) {
    console.error('getMediaInfo error:', err);
    return null;
  }
}

export async function executeFfmpeg(args: string[]): Promise<void> {
  return await invoke<void>('execute_ffmpeg', { args });
}

export async function cancelFfmpeg(): Promise<void> {
  return await invoke<void>('cancel_ffmpeg');
}

export async function checkFileExists(path: string): Promise<boolean> {
  return await invoke<boolean>('check_file_exists', { path });
}

export async function openFileFolder(path: string): Promise<void> {
  return await invoke<void>('open_file_folder', { path });
}

export function onFfmpegProgress(cb: (payload: FfmpegProgressPayload) => void): Promise<UnlistenFn> {
  return listen<FfmpegProgressPayload>('ffmpeg-progress', (event) => cb(event.payload));
}

export function onFfmpegLog(cb: (payload: FfmpegLogPayload) => void): Promise<UnlistenFn> {
  return listen<FfmpegLogPayload>('ffmpeg-log', (event) => cb(event.payload));
}

export function onFfmpegFinished(cb: (payload: FfmpegFinishedPayload) => void): Promise<UnlistenFn> {
  return listen<FfmpegFinishedPayload>('ffmpeg-finished', (event) => cb(event.payload));
}
