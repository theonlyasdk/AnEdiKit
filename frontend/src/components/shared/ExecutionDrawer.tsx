import React, { useRef, useEffect } from 'react';
import { Terminal as TerminalIcon, XCircle, CheckCircle2, Loader2, FolderOpen } from 'lucide-react';
import { FfmpegProgressPayload } from '@/services/tauri';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface ExecutionDrawerProps {
  isOpen: boolean;
  isRunning: boolean;
  isFinished: boolean;
  success: boolean;
  progress: FfmpegProgressPayload;
  logs: string[];
  onCancel: () => void;
  onClose: () => void;
  onOpenFolder?: () => void;
}

export const ExecutionDrawer: React.FC<ExecutionDrawerProps> = ({
  isOpen,
  isRunning,
  isFinished,
  success,
  progress,
  logs,
  onCancel,
  onClose,
  onOpenFolder,
}) => {
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isOpen) return null;

  const percent = Math.min(100, Math.max(0, Math.round(progress.percent || 0)));

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border shadow-2xl transition-all duration-300 max-h-[75vh] flex flex-col">
      {/* Header bar */}
      <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isRunning ? (
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
          ) : isFinished && success ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
          <span className="font-semibold text-xs text-foreground">
            {isRunning ? 'Processing Operation...' : isFinished && success ? 'Job Completed Successfully' : 'Process Terminated'}
          </span>
          {isRunning && (
            <Badge variant="secondary" className="font-mono text-[10px] tracking-normal font-normal">
              {progress.speed ? `${progress.speed} ` : ''}{progress.time ? `(${progress.time})` : ''}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isRunning && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onCancel}
              className="h-7 text-xs"
            >
              Abort Process
            </Button>
          )}

          {isFinished && success && onOpenFolder && (
            <Button
              size="sm"
              onClick={onOpenFolder}
              className="h-7 text-xs gap-1.5 shadow-sm"
            >
              <FolderOpen className="h-3.5 w-3.5" /> Open Folder
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 text-xs"
          >
            Dismiss
          </Button>
        </div>
      </div>

      {/* Progress line */}
      <Progress value={percent} className="h-1 rounded-none" />

      {/* Terminal logs body */}
      <div className="p-4 bg-zinc-950 flex-1 min-h-[220px] max-h-[360px] flex flex-col font-mono text-xs">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5 font-medium">
            <TerminalIcon className="h-3.5 w-3.5 text-primary" /> Process Terminal Output
          </span>
          <span className="text-zinc-500">{logs.length} lines logged</span>
        </div>

        <div
          ref={logContainerRef}
          className="flex-1 overflow-y-auto space-y-1 text-zinc-300 leading-relaxed select-text"
        >
          {logs.length === 0 ? (
            <div className="text-zinc-600 italic">Waiting for process stream...</div>
          ) : (
            logs.map((line, idx) => (
              <div key={idx} className="break-all whitespace-pre-wrap">
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
