import { useState } from "react";

export interface AppSettings {
  outputDir: string;
  autoOpenFolder: boolean;
  overwriteOutput: boolean;
  ffmpegPath: string;
  ffprobePath: string;
  ytdlpPath: string;
  hwAccel: string;
  maxThreads: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  outputDir: "",
  autoOpenFolder: true,
  overwriteOutput: false,
  ffmpegPath: "bundled (ffmpeg)",
  ffprobePath: "bundled (ffprobe)",
  ytdlpPath: "bundled (yt-dlp)",
  hwAccel: "auto",
  maxThreads: "0",
};

const STORAGE_KEY = "anedi-settings";

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode / denied storage: settings simply don't persist.
  }
}

export function useSettingsState(): [
  AppSettings,
  React.Dispatch<React.SetStateAction<AppSettings>>,
] {
  return useState<AppSettings>(loadSettings);
}
