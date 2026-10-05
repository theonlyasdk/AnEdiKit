import React, { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import {
  MinusIcon,
  SquareIcon,
  CopyIcon,
  XIcon,
  SparklesIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const WindowHeader: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [version, setVersion] = useState("dev");

  useEffect(() => {
    let unlistenResize: (() => void) | undefined;
    try {
      const appWin = getCurrentWindow();
      appWin.isMaximized().then(setIsMaximized).catch(() => {});
      // Win+Arrow / snap changes maximize state without a click.
      appWin
        .onResized(() => {
          appWin.isMaximized().then(setIsMaximized).catch(() => {});
        })
        .then((fn) => {
          unlistenResize = fn;
        })
        .catch(() => {});
    } catch {
      // Outside Tauri
    }
    getVersion()
      .then((v) => setVersion(`v${v}`))
      .catch(() => setVersion("dev"));
    return () => unlistenResize?.();
  }, []);

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      console.log("Minimize not available", e);
    }
  };

  const handleMaximize = async () => {
    try {
      const win = getCurrentWindow();
      await win.toggleMaximize();
      setIsMaximized(await win.isMaximized());
    } catch (e) {
      console.log("Toggle maximize not available", e);
    }
  };

  const handleClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch (e) {
      console.log("Close not available", e);
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="h-10 w-full flex items-center justify-between px-3.5 border-b bg-background shrink-0 select-none-chrome"
    >
      <div data-tauri-drag-region className="flex items-center gap-2.5">
        <SparklesIcon aria-hidden="true" className="size-4 text-primary" />
        <span className="font-semibold text-xs text-foreground">
          AnEdiKit
        </span>
        <Badge variant="secondary" className="text-[10px] font-medium">
          {version}
        </Badge>
      </div>

      <div className="flex items-center self-stretch -mr-3.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMinimize}
          aria-label="Minimize window"
          className="h-10 w-[46px] rounded-none text-muted-foreground hover:text-foreground hover:bg-foreground/10 active:bg-foreground/20"
        >
          <MinusIcon aria-hidden="true" strokeWidth={1} className="size-2.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMaximize}
          aria-label={isMaximized ? "Restore window" : "Maximize window"}
          className="h-10 w-[46px] rounded-none text-muted-foreground hover:text-foreground hover:bg-foreground/10 active:bg-foreground/20"
        >
          {isMaximized ? (
            <CopyIcon aria-hidden="true" strokeWidth={1} className="size-2.5" />
          ) : (
            <SquareIcon aria-hidden="true" strokeWidth={1} className="size-2.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          aria-label="Close window"
          className="h-10 w-[46px] rounded-none text-muted-foreground hover:text-white hover:bg-[#E81123] active:bg-[#F1707A]"
        >
          <XIcon aria-hidden="true" strokeWidth={1} className="size-2.5" />
        </Button>
      </div>
    </header>
  );
};
