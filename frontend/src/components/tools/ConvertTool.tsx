import React, { useState, useEffect } from 'react';
import { Play, Settings2, ArrowLeft } from 'lucide-react';
import { FilePicker } from '@/components/shared/FilePicker';
import { MediaInfoCard } from '@/components/shared/MediaInfoCard';
import { ExecutionDrawer } from '@/components/shared/ExecutionDrawer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

    const lastDot = filePath.lastIndexOf('.');
    const base = lastDot !== -1 ? filePath.substring(0, lastDot) : filePath;
    const targetOut = `${base}_converted.${format}`;
    setOutputPath(targetOut);

    const args = ['-y', '-i', filePath];

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
    <ScrollArea className="flex-1 h-full">
      <div className="p-8 space-y-6">
        {/* Header bar */}
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9">
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
              <p className="text-sm text-muted-foreground mt-0.5">
                Transcode media streams into modern containers and codecs with customizable quality presets
              </p>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-5">
          <FilePicker
            filePath={filePath}
            onSelectFile={handleSelectFile}
            title="Select video file to convert"
            subtitle="Supports MP4, MKV, WebM, MOV, AVI, FLV, TS"
          />

          <MediaInfoCard info={mediaInfo} loading={probing} />

          {filePath && (
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base font-semibold">Encoding Parameters</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Fine-tune output container, video codecs, compression factor, and audio streams
                </CardDescription>
              </CardHeader>

              <Separator />

              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {/* Container select */}
                  <div className="space-y-2">
                    <Label className="text-xs">Output Container</Label>
                    <Select value={format} onValueChange={setFormat}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select container" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mp4">MP4 (.mp4)</SelectItem>
                        <SelectItem value="mkv">MKV (.mkv)</SelectItem>
                        <SelectItem value="webm">WebM (.webm)</SelectItem>
                        <SelectItem value="mov">QuickTime MOV (.mov)</SelectItem>
                        <SelectItem value="avi">AVI (.avi)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Video codec select */}
                  <div className="space-y-2">
                    <Label className="text-xs">Video Codec</Label>
                    <Select value={videoCodec} onValueChange={setVideoCodec}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select video codec" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="libx264">H.264 / AVC (libx264)</SelectItem>
                        <SelectItem value="libx265">H.265 / HEVC (libx265)</SelectItem>
                        <SelectItem value="libvpx-vp9">VP9 (libvpx-vp9)</SelectItem>
                        <SelectItem value="copy">Stream Copy (No Re-encode)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Audio codec select */}
                  <div className="space-y-2">
                    <Label className="text-xs">Audio Codec</Label>
                    <Select value={audioCodec} onValueChange={setAudioCodec}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select audio codec" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aac">AAC (Standard)</SelectItem>
                        <SelectItem value="libmp3lame">MP3 (libmp3lame)</SelectItem>
                        <SelectItem value="libopus">Opus (libopus)</SelectItem>
                        <SelectItem value="copy">Stream Copy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* CRF Quality Slider */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Quality Factor (CRF)</Label>
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
                    />
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Lossless (0)</span>
                      <span>Default (23)</span>
                      <span>Small (51)</span>
                    </div>
                  </div>

                  {/* Preset select */}
                  <div className="space-y-2">
                    <Label className="text-xs">Encoder Preset</Label>
                    <Select value={preset} onValueChange={setPreset}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select preset" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ultrafast">Ultrafast (Fastest)</SelectItem>
                        <SelectItem value="fast">Fast</SelectItem>
                        <SelectItem value="medium">Medium (Standard)</SelectItem>
                        <SelectItem value="slow">Slow (Better compression)</SelectItem>
                        <SelectItem value="veryslow">Very Slow</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-end">
                  <Button
                    disabled={isRunning}
                    onClick={handleStartConversion}
                    className="gap-2"
                  >
                    <Play className="h-4 w-4 fill-current" />
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
    </ScrollArea>
  );
};
