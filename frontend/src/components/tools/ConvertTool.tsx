import React, { useState, useEffect, useCallback, useRef } from "react";
import { PlayIcon, ArrowLeftIcon, Disc3Icon, FolderOpenIcon, TerminalIcon } from "lucide-react";
import { toast } from "sonner";
import { FilePicker } from "@/components/shared/FilePicker";
import { MediaInfoCard } from "@/components/shared/MediaInfoCard";
import { ExecutionDrawer } from "@/components/shared/ExecutionDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getMediaInfo,
  executeFfmpeg,
  cancelFfmpeg,
  checkFileExists,
  pickFolder,
  showInFolder,
  onFfmpegProgress,
  onFfmpegLog,
  onFfmpegFinished,
  type MediaInfo,
  type FfmpegProgress,
  type FfmpegFinish,
} from "@/services/tauri";
import { loadSettings } from "@/lib/settings";

interface ConvertToolProps {
  onBack?: () => void;
  initialFilePath?: string | null;
  onConsumeInitialFile?: () => void;
}

function fileNameOf(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

function dirOf(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx > 0 ? path.substring(0, idx) : "";
}

function joinDir(dir: string, file: string): string {
  const clean = dir.replace(/[/\\]+$/, "");
  const sep = clean.includes("\\") ? "\\" : "/";
  return `${clean}${sep}${file}`;
}

function stemOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.substring(0, dot) : fileName;
}

function defaultOutputPath(
  inputPath: string,
  format: string,
  outputDir: string,
): string {
  const file = `${stemOf(fileNameOf(inputPath))}_converted.${format}`;
  if (!outputDir.trim()) {
    const inputDir = dirOf(inputPath);
    return inputDir ? joinDir(inputDir, file) : file;
  }
  return joinDir(outputDir, file);
}

function samePath(a: string, b: string): boolean {
  return (
    a.trim().toLowerCase().replace(/[/\\]+$/, "") ===
    b.trim().toLowerCase().replace(/[/\\]+$/, "")
  );
}

export const ConvertTool: React.FC<ConvertToolProps> = ({
  onBack,
  initialFilePath,
  onConsumeInitialFile,
}) => {
  const [settings] = useState(loadSettings);
  const [filePath, setFilePath] = useState<string>("");
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [probing, setProbing] = useState<boolean>(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  const [format, setFormat] = useState<string>("mp4");
  const [videoCodec, setVideoCodec] = useState<string>("libx264");
  const [audioCodec, setAudioCodec] = useState<string>("aac");
  const [crf, setCrf] = useState<number>(23);
  const [preset, setPreset] = useState<string>("medium");

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [finish, setFinish] = useState<FfmpegFinish | null>(null);
  const [progress, setProgress] = useState<FfmpegProgress | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [outputPath, setOutputPath] = useState<string>("");
  const [outputCustomised, setOutputCustomised] = useState<boolean>(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState<boolean>(false);

  const outputPathRef = useRef(outputPath);
  outputPathRef.current = outputPath;

  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenLog: (() => void) | undefined;
    let unlistenFinished: (() => void) | undefined;
    let cancelled = false;

    const setupListeners = async () => {
      const up = await onFfmpegProgress((p) => setProgress(p));
      const ul = await onFfmpegLog((l) =>
        setLogs((prev) => [...prev.slice(-300), l.line]),
      );
      const uf = await onFfmpegFinished((res) => {
        setIsRunning(false);
        setIsFinished(true);
        setSuccess(res.success);
        setFinish(res);
        if (res.success) {
          toast.success("Conversion finished.");
          const out = outputPathRef.current;
          if (settings.autoOpenFolder && out) {
            showInFolder(out).catch(() =>
              toast.error("Conversion finished, but the output folder could not be opened."),
            );
          }
        } else {
          toast.error(`Conversion failed: ${res.message} (code ${res.exit_code}).`);
        }
      });
      if (cancelled) {
        up();
        ul();
        uf();
        return;
      }
      unlistenProgress = up;
      unlistenLog = ul;
      unlistenFinished = uf;
    };

    setupListeners().catch(() =>
      toast.error("Could not attach to conversion events. Progress will not update."),
    );

    return () => {
      cancelled = true;
      unlistenProgress?.();
      unlistenLog?.();
      unlistenFinished?.();
    };
    // Settings are read once per mount; the tool view remounts on navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectFile = useCallback(async (path: string) => {
    setFilePath(path);
    setProbing(true);
    setMediaInfo(null);
    setProbeError(null);
    setIsFinished(false);
    setFinish(null);
    setOutputCustomised(false);
    // The sync effect below derives the suggested output from filePath.
    try {
      const info = await getMediaInfo(path);
      setMediaInfo(info);
    } catch (err) {
      const message = `Could not read media info: ${err}`;
      setProbeError(message);
      toast.error(message);
    } finally {
      setProbing(false);
    }
  }, []);

  // A file dropped on the workspace (or picked there) arrives here.
  useEffect(() => {
    if (initialFilePath && initialFilePath !== filePath) {
      void handleSelectFile(initialFilePath);
      onConsumeInitialFile?.();
    }
    // Load once per new arrival; handleSelectFile is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilePath]);

  // Keep the suggested output in sync while the user hasn't customised it.
  useEffect(() => {
    if (filePath && !outputCustomised) {
      setOutputPath(defaultOutputPath(filePath, format, settings.outputDir));
    }
  }, [filePath, format, outputCustomised, settings.outputDir]);

  const buildArgs = (): string[] => {
    const args: string[] = [];
    if (settings.hwAccel !== "off") {
      args.push("-hwaccel", settings.hwAccel);
    }
    if (settings.maxThreads !== "0") {
      args.push("-threads", settings.maxThreads);
    }
    args.push("-y", "-i", filePath);

    if (videoCodec === "copy") {
      args.push("-c:v", "copy");
    } else {
      args.push("-c:v", videoCodec, "-crf", crf.toString());
      if (videoCodec === "libx264" || videoCodec === "libx265") {
        args.push("-preset", preset);
      }
    }

    args.push("-c:a", audioCodec);
    args.push(outputPath);
    return args;
  };

  const runConversion = async () => {
    setLogs([]);
    setProgress(null);
    setFinish(null);
    setIsRunning(true);
    setIsFinished(false);
    setDrawerOpen(true);

    try {
      await executeFfmpeg(buildArgs(), mediaInfo?.duration_seconds);
    } catch (err) {
      setLogs((prev) => [...prev, `Execution error: ${err}`]);
      setIsRunning(false);
      setIsFinished(true);
      setSuccess(false);
      toast.error(`Could not start conversion: ${err}`);
    }
  };

  const handleStartConversion = async () => {
    if (!filePath || !outputPath.trim()) {
      toast.error("Choose an input file and an output path first.");
      return;
    }
    if (samePath(filePath, outputPath)) {
      toast.error("Output must be different from the input file.");
      return;
    }

    let exists = false;
    try {
      exists = await checkFileExists(outputPath);
    } catch {
      // Outside Tauri or IPC failure: proceed; executeFfmpeg reports errors.
    }
    if (exists && !settings.overwriteOutput) {
      setConfirmOverwrite(true);
      return;
    }
    await runConversion();
  };

  const handleBrowseOutputDir = async () => {
    try {
      const currentDir = dirOf(outputPath) || settings.outputDir || undefined;
      const selected = await pickFolder(currentDir);
      if (selected) {
        setOutputCustomised(true);
        setOutputPath(joinDir(selected, fileNameOf(outputPath)));
      }
    } catch {
      toast.error("Could not open the folder dialog.");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelFfmpeg();
    } catch (err) {
      toast.error(`Cancel failed, the job may still be running: ${err}`);
    }
  };

  return (
    <div className="flex flex-1 flex-col bg-background min-h-0">
      <div className="flex-shrink-0 px-8 pt-8 pb-4 border-b">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button
              variant="outline"
              size="icon"
              onClick={onBack}
              aria-label="Back to dashboard"
              className="rounded-full"
            >
              <ArrowLeftIcon aria-hidden="true" />
            </Button>
          )}
          <div className="flex items-center gap-3">
            <Disc3Icon aria-hidden="true" className="size-6 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              FFmpeg Transcode
            </h1>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-10 p-8 max-w-4xl">
          <section aria-labelledby="convert-input-heading" className="flex flex-col gap-4">
            <h2 id="convert-input-heading" className="text-sm font-semibold text-muted-foreground">
              Input file
            </h2>
            <FilePicker
              filePath={filePath}
              onSelectFile={(path) => void handleSelectFile(path)}
            />
            {filePath && (
              <MediaInfoCard
                info={mediaInfo}
                loading={probing}
                error={probeError}
              />
            )}
          </section>

          {filePath && (
            <section aria-labelledby="convert-params-heading" className="flex flex-col gap-4">
              <h2 id="convert-params-heading" className="text-sm font-semibold text-muted-foreground">
                Encode settings
              </h2>

              <div className="border rounded-lg p-6">
                <FieldGroup>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                    <Field>
                      <FieldLabel htmlFor="format">Target Container</FieldLabel>
                      <Select value={format} onValueChange={setFormat}>
                        <SelectTrigger id="format">
                          <SelectValue placeholder="Select container" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="mp4">.MP4 (MPEG-4 Part 14)</SelectItem>
                            <SelectItem value="mkv">.MKV (Matroska)</SelectItem>
                            <SelectItem value="webm">.WEBM (WebM)</SelectItem>
                            <SelectItem value="mov">.MOV (QuickTime)</SelectItem>
                            <SelectItem value="avi">.AVI (Audio Video Interleave)</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="vcodec">Video Codec</FieldLabel>
                      <Select value={videoCodec} onValueChange={setVideoCodec}>
                        <SelectTrigger id="vcodec">
                          <SelectValue placeholder="Select video codec" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="libx264">libx264 (H.264/AVC)</SelectItem>
                            <SelectItem value="libx265">libx265 (H.265/HEVC)</SelectItem>
                            <SelectItem value="libvpx-vp9">libvpx-vp9 (VP9)</SelectItem>
                            <SelectItem value="copy">Stream Copy (No Re-encode)</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="acodec">Audio Codec</FieldLabel>
                      <Select value={audioCodec} onValueChange={setAudioCodec}>
                        <SelectTrigger id="acodec">
                          <SelectValue placeholder="Select audio codec" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="aac">aac (Advanced Audio Coding)</SelectItem>
                            <SelectItem value="libmp3lame">libmp3lame (MP3)</SelectItem>
                            <SelectItem value="libopus">libopus (Opus)</SelectItem>
                            <SelectItem value="copy">Stream Copy</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="preset">CPU Preset</FieldLabel>
                      <Select
                        value={preset}
                        onValueChange={setPreset}
                        disabled={videoCodec === 'copy'}
                      >
                        <SelectTrigger id="preset">
                          <SelectValue placeholder="Select preset" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="ultrafast">ultrafast</SelectItem>
                            <SelectItem value="fast">fast</SelectItem>
                            <SelectItem value="medium">medium (Standard)</SelectItem>
                            <SelectItem value="slow">slow</SelectItem>
                            <SelectItem value="veryslow">veryslow</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {videoCodec === 'copy' && (
                        <FieldDescription>
                          Preset has no effect with stream copy.
                        </FieldDescription>
                      )}
                    </Field>

                    <Field className="md:col-span-2">
                      <div className="flex items-center justify-between">
                        <FieldLabel htmlFor="crf-slider">Constant Rate Factor (CRF)</FieldLabel>
                        <output htmlFor="crf-slider" className="font-mono text-sm text-foreground">
                          {crf}
                        </output>
                      </div>
                      <Slider
                        id="crf-slider"
                        min={0}
                        max={51}
                        step={1}
                        value={[crf]}
                        onValueChange={(val) => setCrf(val[0])}
                        disabled={videoCodec === 'copy'}
                        aria-label="Constant rate factor"
                        className="py-2"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0 (Lossless)</span>
                        <span>23 (Default)</span>
                        <span>51 (Worst)</span>
                      </div>
                    </Field>

                    <Field className="md:col-span-2">
                      <FieldLabel htmlFor="output-path">Output file</FieldLabel>
                      <div className="flex items-center gap-2">
                        <Input
                          id="output-path"
                          value={outputPath}
                          onChange={(e) => {
                            setOutputCustomised(true);
                            setOutputPath(e.target.value);
                          }}
                          aria-describedby="output-path-hint"
                          className="font-mono text-xs select-text"
                          spellCheck={false}
                        />
                        <Button
                          variant="outline"
                          onClick={() => void handleBrowseOutputDir()}
                        >
                          <FolderOpenIcon aria-hidden="true" />
                          Folder
                        </Button>
                      </div>
                      <FieldDescription id="output-path-hint">
                        {settings.outputDir
                          ? `Defaults to ${settings.outputDir}.`
                          : "Defaults to the input folder with a _converted suffix."}
                      </FieldDescription>
                    </Field>
                  </div>
                </FieldGroup>
              </div>
            </section>
          )}

          {filePath && (
            <div className="flex items-center justify-between pt-4">
              {(logs.length > 0 || isRunning || isFinished) &&
                !drawerOpen && (
                  <Button
                    variant="outline"
                    onClick={() => setDrawerOpen(true)}
                  >
                    <TerminalIcon aria-hidden="true" />
                    Open console
                  </Button>
                )}
              <div className="flex-1" />
              <Button
                size="lg"
                disabled={isRunning || !outputPath.trim()}
                onClick={() => void handleStartConversion()}
              >
                {isRunning ? (
                  <Spinner aria-hidden="true" />
                ) : (
                  <PlayIcon aria-hidden="true" />
                )}
                {isRunning ? "Converting…" : "Start conversion"}
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      <ExecutionDrawer
        isOpen={drawerOpen}
        isRunning={isRunning}
        isFinished={isFinished}
        success={success}
        finish={finish}
        progress={progress}
        logs={logs}
        onCancel={() => void handleCancel()}
        onClose={() => setDrawerOpen(false)}
        onOpenFolder={
          outputPath
            ? () => showInFolder(outputPath).catch(() =>
                toast.error("Could not open the output folder."),
              )
            : undefined
        }
      />

      <AlertDialog open={confirmOverwrite} onOpenChange={setConfirmOverwrite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite this file?</AlertDialogTitle>
            <AlertDialogDescription className="break-all">
              {outputPath} already exists. Overwrite it? Enable
              “Overwrite existing files” in Settings to skip this prompt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep both</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runConversion()}>
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
