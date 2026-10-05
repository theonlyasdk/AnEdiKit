import React, { useState, useEffect } from 'react';
import { Play, Settings2 } from 'lucide-react';
import { FilePicker } from '@/components/shared/FilePicker';
import { MediaInfoCard } from '@/components/shared/MediaInfoCard';
import { ExecutionDrawer } from '@/components/shared/ExecutionDrawer';
import {
  getMediaInfo,
  executeFfmpeg,
  cancelFfmpeg,
  openFileFolder,
  onFfmpegProgress,
  onFfmpegLog,
  onFfmpegFinished,
  MediaProbeInfo,
  FfmpegProgressPayload,
} from '@/services/tauri';

export const ConvertTool: React.FC = () => {
  const [filePath, setFilePath] = useState<string>('');
  const [mediaInfo, setMediaInfo] = useState<MediaProbeInfo | null>(null);
  const [probing, setProbing] = useState<boolean>(false);

  // Conversion options
  const [format, setFormat] = useState<string>('mp4');
  const [videoCodec, setVideoCodec] = useState<string>('libx264');
  const [audioCodec, setAudioCodec] = useState<string>('aac');
  const [crf, setCrf] = useState<number>(23);
  const [preset, setPreset] = useState<string>('medium');
  const [hardwareAccel, setHardwareAccel] = useState<boolean>(false);

  // Runner execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [progress, setProgress] = useState<FfmpegProgressPayload>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [outputPath, setOutputPath] = useState<string>('');

  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenLog: (() => void) | undefined;
    let unlistenFinished: (() => void) | undefined;

    const setupListeners = async () => {
      unlistenProgress = await onFfmpegProgress((p) => {
        setProgress(p);
      });

      unlistenLog = await onFfmpegLog((l) => {
        setLogs((prev) => [...prev.slice(-300), l.line]);
      });

      unlistenFinished = await onFfmpegFinished((res) => {
        setIsRunning(false);
        setIsFinished(true);
        setSuccess(res.success);
      });
    };

    setupListeners().catch(console.error);

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenLog) unlistenLog();
      if (unlistenFinished) unlistenFinished();
    };
  }, []);

  const handleSelectFile = async (path: string) => {
    setFilePath(path);
    setProbing(true);
    setMediaInfo(null);
    try {
      const info = await getMediaInfo(path);
      setMediaInfo(info);
    } finally {
      setProbing(false);
    }
  };

  const handleStartConversion = async () => {
    if (!filePath) return;

    // Determine target output path
    const lastDot = filePath.lastIndexOf('.');
    const base = lastDot !== -1 ? filePath.substring(0, lastDot) : filePath;
    const targetOut = `${base}_converted.${format}`;
    setOutputPath(targetOut);

    // Build FFmpeg argument vector
    const args = ['-y', '-i', filePath];

    // Hardware acceleration or codec flags
    if (videoCodec === 'copy') {
      args.push('-c:v', 'copy');
    } else {
      args.push('-c:v', videoCodec);
      if (crf !== undefined && videoCodec !== 'copy') {
        args.push('-crf', crf.toString());
      }
      if (preset && (videoCodec === 'libx264' || videoCodec === 'libx265')) {
        args.push('-preset', preset);
      }
    }

    if (audioCodec === 'copy') {
      args.push('-c:a', 'copy');
    } else {
      args.push('-c:a', audioCodec);
    }

    args.push(targetOut);

    // Reset and start drawer
    setLogs([]);
    setProgress({});
    setIsRunning(true);
    setIsFinished(false);
    setDrawerOpen(true);

    try {
      await executeFfmpeg(args);
    } catch (err: any) {
      setLogs((prev) => [...prev, `Execution error: ${err}`]);
      setIsRunning(false);
      setIsFinished(true);
      setSuccess(false);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelFfmpeg();
    } catch (err) {
      console.error('Cancel error:', err);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Convert Video
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Transcode media streams into modern containers and codecs with customizable quality presets
        </p>
      </div>

      <div className="space-y-4">
        <FilePicker
          filePath={filePath}
          onSelectFile={handleSelectFile}
          title="Select video file to convert"
          subtitle="Supports MP4, MKV, WebM, MOV, AVI, FLV, TS"
        />

        <MediaInfoCard info={mediaInfo} loading={probing} />

        {filePath && (
          <div className="p-5 rounded-xl border border-border/40 bg-card/40 space-y-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground/90 border-b border-border/30 pb-2">
              <Settings2 className="h-4 w-4 text-primary" /> Encoding Settings
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
                  Output Container
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border/60 text-foreground text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value="mp4">MP4 (.mp4)</option>
                  <option value="mkv">MKV (.mkv)</option>
                  <option value="webm">WebM (.webm)</option>
                  <option value="mov">QuickTime MOV (.mov)</option>
                  <option value="avi">AVI (.avi)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
                  Video Codec
                </label>
                <select
                  value={videoCodec}
                  onChange={(e) => setVideoCodec(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border/60 text-foreground text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value="libx264">H.264 / AVC (libx264)</option>
                  <option value="libx265">H.265 / HEVC (libx265)</option>
                  <option value="libvpx-vp9">VP9 (libvpx-vp9)</option>
                  <option value="copy">Stream Copy (No Re-encode)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
                  Audio Codec
                </label>
                <select
                  value={audioCodec}
                  onChange={(e) => setAudioCodec(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border/60 text-foreground text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value="aac">AAC (Standard)</option>
                  <option value="libmp3lame">MP3 (libmp3lame)</option>
                  <option value="libopus">Opus (libopus)</option>
                  <option value="copy">Stream Copy</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Quality Level (CRF)
                  </label>
                  <span className="font-mono text-[11px] text-primary font-semibold">{crf}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="51"
                  value={crf}
                  onChange={(e) => setCrf(parseInt(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-1">
                  <span>Lossless (0)</span>
                  <span>Default (23)</span>
                  <span>Small Size (51)</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
                  Encoder Preset
                </label>
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border/60 text-foreground text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value="ultrafast">Ultrafast (Fastest)</option>
                  <option value="fast">Fast</option>
                  <option value="medium">Medium (Standard)</option>
                  <option value="slow">Slow (Better compression)</option>
                  <option value="veryslow">Very Slow</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                disabled={isRunning}
                onClick={handleStartConversion}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all shadow-sm shadow-primary/30"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                {isRunning ? 'Converting...' : 'Start Conversion'}
              </button>
            </div>
          </div>
        )}
      </div>

      <ExecutionDrawer
        isOpen={drawerOpen}
        isRunning={isRunning}
        isFinished={isFinished}
        success={success}
        progress={progress}
        logs={logs}
        onCancel={handleCancel}
        onClose={() => setDrawerOpen(false)}
        onOpenFolder={() => outputPath && openFileFolder(outputPath)}
      />
    </div>
  );
};
