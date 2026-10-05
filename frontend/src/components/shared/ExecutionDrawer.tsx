import React, { useRef, useEffect } from 'react';
import { Terminal as TerminalIcon, XCircle, CheckCircle, Loader2 } from 'lucide-react';
import { FfmpegProgressPayload } from '@/services/tauri';

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
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
          <span className="font-semibold text-xs text-foreground">
            {isRunning ? 'Processing Operation...' : isFinished && success ? 'Job Completed Successfully' : 'Process Terminated'}
          </span>
          {isRunning && (
            <span className="text-[11px] font-mono bg-muted/60 px-2 py-0.5 rounded text-muted-foreground">
              {progress.speed ? `${progress.speed} ` : ''}{progress.time ? `(${progress.time})` : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isRunning && (
            <button
              onClick={onCancel}
              className="px-3 py-1 rounded-md text-xs font-semibold bg-destructive/15 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              Abort Process
            </button>
          )}

          {isFinished && success && onOpenFolder && (
            <button
              onClick={onOpenFolder}
              className="px-3 py-1 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
            >
              Open Output Folder
            </button>
          )}

          <button
            onClick={onClose}
            className="px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* Progress line */}
      <div className="w-full bg-muted/40 h-1.5 overflow-hidden">
        <div
          className={`h-full transition-all duration-200 ${
            isFinished && !success ? 'bg-destructive' : 'bg-primary'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Terminal logs body */}
      <div className="p-4 bg-black/85 flex-1 min-h-[220px] max-h-[360px] flex flex-col font-mono text-xs">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-[11px] text-white/50">
          <span className="flex items-center gap-1.5">
            <TerminalIcon className="h-3.5 w-3.5 text-primary" /> Process Terminal Output
          </span>
          <span>{logs.length} lines logged</span>
        </div>

        <div
          ref={logContainerRef}
          className="flex-1 overflow-y-auto space-y-1 text-white/80 leading-relaxed select-text"
        >
          {logs.length === 0 ? (
            <div className="text-white/40 italic">Waiting for process stream...</div>
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
