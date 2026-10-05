import React, { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, Copy, X, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const WindowHeader: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    try {
      const appWin = getCurrentWindow();
      appWin.isMaximized().then(setIsMaximized).catch(() => {});
    } catch {
      // Outside Tauri
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
      className="h-10 w-full flex items-center justify-between px-3.5 select-none border-b border-border/40 bg-background/80 backdrop-blur-md shrink-0 z-50"
    >
      <div data-tauri-drag-region className="flex items-center gap-2.5">
        <div className="h-6 w-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <span className="font-semibold text-xs tracking-wider uppercase text-foreground/90">
          AnEdiKit
        </span>
        <Badge variant="secondary" className="text-[10px] h-4.5 px-1.5 font-medium tracking-normal">
          v0.6.0
        </Badge>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          onClick={handleMinimize}
          className="h-7 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Minimize"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="h-7 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
        </button>
        <button
          onClick={handleClose}
          className="h-7 w-8 inline-flex items-center justify-center rounded-md hover:bg-destructive hover:text-destructive-foreground text-muted-foreground transition-colors"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
