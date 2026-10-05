import React, { useRef, useEffect, useState } from "react";
import {
  TerminalIcon,
  XCircleIcon,
  CheckCircle2Icon,
  FolderOpenIcon,
} from "lucide-react";
import type { FfmpegProgress, FfmpegFinish } from "@/services/tauri";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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

interface ExecutionDrawerProps {
  isOpen: boolean;
  isRunning: boolean;
  isFinished: boolean;
  success: boolean;
  finish: FfmpegFinish | null;
  progress: FfmpegProgress | null;
  logs: string[];
  onCancel: () => void;
  onClose: () => void;
  onOpenFolder?: () => void;
}

const EMPTY_PROGRESS: FfmpegProgress = {
  time: "",
  eta: null,
  fps: "",
  speed: "",
  bitrate: "",
  pct: 0,
  playlist_item: null,
  playlist_total: null,
  current_item_title: null,
};

export const ExecutionDrawer: React.FC<ExecutionDrawerProps> = ({
  isOpen,
  isRunning,
  isFinished,
  success,
  finish,
  progress,
  logs,
  onCancel,
  onClose,
  onOpenFolder,
}) => {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const pct = progress ?? EMPTY_PROGRESS;

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  const requestClose = () => {
    if (isRunning) {
      setConfirmDismiss(true);
      return;
    }
    onClose();
  };

  const percent = Math.min(100, Math.max(0, Math.round(pct.pct || 0)));

  const statusText = isRunning
    ? "Converting…"
    : isFinished && success
      ? "Conversion finished"
      : "Conversion failed";

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && requestClose()}>
        <SheetContent
          side="bottom"
          aria-label="FFmpeg execution console"
          className="max-h-[75vh] flex flex-col p-0 gap-0"
        >
          <SheetHeader className="px-5 py-3 border-b border-border">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {isRunning ? (
                  <Spinner className="size-4 text-primary" />
                ) : isFinished && success ? (
                  <CheckCircle2Icon
                    aria-hidden="true"
                    className="size-4 text-primary"
                  />
                ) : (
                  <XCircleIcon
                    aria-hidden="true"
                    className="size-4 text-destructive"
                  />
                )}
                <SheetTitle className="text-sm font-semibold truncate">
                  {statusText}
                </SheetTitle>
                {isRunning && (pct.speed || pct.time) && (
                  <span className="font-mono text-xs text-muted-foreground shrink-0">
                    {pct.speed ? `${pct.speed} ` : ""}
                    {pct.time ? `(${pct.time})` : ""}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isRunning && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onCancel}
                    className="text-xs"
                  >
                    Abort
                  </Button>
                )}
                {isFinished && success && onOpenFolder && (
                  <Button
                    size="sm"
                    onClick={onOpenFolder}
                    className="text-xs"
                  >
                    <FolderOpenIcon aria-hidden="true" />
                    Open output dir
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={requestClose}
                  className="text-xs"
                >
                  Dismiss
                </Button>
              </div>
            </div>
            {isFinished && finish?.message && (
              <p className="text-xs text-muted-foreground text-left truncate">
                {finish.message}
                {!finish.success && ` (exit code ${finish.exit_code})`}
              </p>
            )}
            <SheetDescription className="sr-only">
              Live FFmpeg progress and terminal output for the current job.
            </SheetDescription>
          </SheetHeader>

          <Progress
            value={percent}
            aria-label={`Conversion progress: ${percent} percent`}
            className="h-1 rounded-none"
          />

          <div className="p-4 bg-muted/40 flex-1 min-h-[220px] max-h-[360px] flex flex-col font-mono text-xs overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-border text-xs text-muted-foreground">
              <span className="flex items-center gap-2 font-medium">
                <TerminalIcon aria-hidden="true" className="size-3" />
                Output
              </span>
              <span className="opacity-50">{logs.length} lines</span>
            </div>

            <div
              ref={logContainerRef}
              role="log"
              aria-label="FFmpeg output"
              className="flex-1 overflow-y-auto flex flex-col gap-1 text-primary/80 leading-relaxed select-text"
            >
              {logs.length === 0 ? (
                <div className="opacity-40 italic">Awaiting output…</div>
              ) : (
                logs.map((line, idx) => (
                  <div key={idx} className="break-all whitespace-pre-wrap">
                    <span aria-hidden="true" className="opacity-40 mr-3">
                      {String(idx).padStart(4, "0")}
                    </span>
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDismiss} onOpenChange={setConfirmDismiss}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss while converting?</AlertDialogTitle>
            <AlertDialogDescription>
              The job keeps running in the background. Reopen the console
              from the Convert view to follow it, or abort it first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep watching</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDismiss(false);
                onClose();
              }}
            >
              Dismiss
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
