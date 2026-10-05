import React, { useState, useEffect } from 'react';
import { Play, Settings2, Sparkles, ArrowLeft } from 'lucide-react';
import { FilePicker } from '@/components/shared/FilePicker';
import { MediaInfoCard } from '@/components/shared/MediaInfoCard';
import { ExecutionDrawer } from '@/components/shared/ExecutionDrawer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
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

interface ConvertToolProps {
  onBack?: () => void;
}

export const ConvertTool: React.FC<ConvertToolProps> = ({ onBack }) => {
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
    <div className="flex-1 h-full overflow-y-auto p-8 space-y-6">
      {/* Top title and breadcrumb */}
      <div className="flex items-center justify-between pb-2 border-b border-border/40">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Convert Video
              </h1>
              <Badge variant="secondary" className="text-xs">
                FFmpeg Transcode
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Transcode media streams into modern containers and codecs with customizable quality presets
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <FilePicker
          filePath={filePath}
          onSelectFile={handleSelectFile}
          title="Select video file to convert"
          subtitle="Supports MP4, MKV, WebM, MOV, AVI, FLV, TS"
        />

        <MediaInfoCard info={mediaInfo} loading={probing} />

        {filePath && (
          <Card className="bg-card/60 backdrop-blur-xs border-border/60">
            <CardHeader className="pb-4 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">Encoding Parameters</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Fine-tune output container, video codecs, compression factor, and audio streams
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 text-xs">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">
                    Output Container
                  </label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full h-9 px-3 rounded-md bg-muted/30 border border-input text-foreground text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="mp4">MP4 (.mp4)</option>
                    <option value="mkv">MKV (.mkv)</option>
                    <option value="webm">WebM (.webm)</option>
                    <option value="mov">QuickTime MOV (.mov)</option>
                    <option value="avi">AVI (.avi)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">
                    Video Codec
                  </label>
                  <select
                    value={videoCodec}
                    onChange={(e) => setVideoCodec(e.target.value)}
                    className="w-full h-9 px-3 rounded-md bg-muted/30 border border-input text-foreground text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="libx264">H.264 / AVC (libx264)</option>
                    <option value="libx265">H.265 / HEVC (libx265)</option>
                    <option value="libvpx-vp9">VP9 (libvpx-vp9)</option>
                    <option value="copy">Stream Copy (No Re-encode)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">
                    Audio Codec
                  </label>
                  <select
                    value={audioCodec}
                    onChange={(e) => setAudioCodec(e.target.value)}
                    className="w-full h-9 px-3 rounded-md bg-muted/30 border border-input text-foreground text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="aac">AAC (Standard)</option>
                    <option value="libmp3lame">MP3 (libmp3lame)</option>
                    <option value="libopus">Opus (libopus)</option>
                    <option value="copy">Stream Copy</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-foreground">
                      Quality Level (CRF)
                    </label>
                    <Badge variant="outline" className="font-mono text-xs">
                      {crf}
                    </Badge>
                  </div>
                  <Slider
                    min={0}
                    max={51}
                    step={1}
                    value={[crf]}
                    onValueChange={(val) => setCrf(val[0])}
                    className="py-1"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Lossless (0)</span>
                    <span>Default (23)</span>
                    <span>Small Size (51)</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">
                    Encoder Preset
                  </label>
                  <select
                    value={preset}
                    onChange={(e) => setPreset(e.target.value)}
                    className="w-full h-9 px-3 rounded-md bg-muted/30 border border-input text-foreground text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="ultrafast">Ultrafast (Fastest)</option>
                    <option value="fast">Fast</option>
                    <option value="medium">Medium (Standard)</option>
                    <option value="slow">Slow (High Compression)</option>
                    <option value="veryslow">Very Slow</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-border/40 flex items-center justify-end">
                <Button
                  disabled={isRunning}
                  onClick={handleStartConversion}
                  className="gap-2 shadow-sm"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  {isRunning ? 'Converting...' : 'Start Conversion'}
                </Button>
              </div>
            </CardContent>
          </Card>
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
