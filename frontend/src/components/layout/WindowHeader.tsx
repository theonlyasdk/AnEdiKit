import React, { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, Copy, X } from 'lucide-react';

export const WindowHeader: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    try {
      const appWin = getCurrentWindow();
      appWin.isMaximized().then(setIsMaximized).catch(() => {});
    } catch {
      // Running outside Tauri webview
    }
  }, []);

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      console.log('Minimize not available', e);
    }
  };

  const handleMaximize = async () => {
    try {
      const win = getCurrentWindow();
      await win.toggleMaximize();
      setIsMaximized(await win.isMaximized());
    } catch (e) {
      console.log('Toggle maximize not available', e);
    }
  };

  const handleClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch (e) {
      console.log('Close not available', e);
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="h-10 w-full flex items-center justify-between px-3 select-none border-b border-border/40 backdrop-blur-md bg-background/80 shrink-0 z-50"
    >
      <div data-tauri-drag-region className="flex items-center gap-2">
        <div className="h-5 w-5 rounded bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
          A
        </div>
        <span className="font-semibold text-xs tracking-wider uppercase text-foreground/90">
          AnEdiKit
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
          v0.6.0
        </span>
      </div>

      <div className="flex items-center">
        <button
          onClick={handleMinimize}
          className="h-8 w-9 inline-flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          title="Minimize"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="h-8 w-9 inline-flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={handleClose}
          className="h-8 w-9 inline-flex items-center justify-center rounded hover:bg-destructive hover:text-destructive-foreground text-muted-foreground transition-colors"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
