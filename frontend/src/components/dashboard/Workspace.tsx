import React, { useCallback, useEffect, useState } from "react";
import { UploadCloudIcon, ZapIcon, Settings2Icon } from "lucide-react";
import { toast } from "sonner";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { pickFile } from "@/services/tauri";

interface WorkspaceProps {
  onSelectTool: (id: string) => void;
  onDropFile: (path: string) => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  onSelectTool,
  onDropFile,
}) => {
  const [isHovering, setIsHovering] = useState(false);

  const handlePick = useCallback(async () => {
    try {
      const selected = await pickFile();
      if (selected) {
        onDropFile(selected);
      }
    } catch {
      toast.error("Could not open the file dialog.");
    }
  }, [onDropFile]);

  // Native OS file drops arrive via the Tauri window drag-drop event with
  // real filesystem paths (the DOM DataTransfer has no paths in a webview).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    try {
      getCurrentWindow()
        .onDragDropEvent((event) => {
          if (event.payload.type === "over") {
            setIsHovering(true);
          } else if (event.payload.type === "drop") {
            setIsHovering(false);
            const first = event.payload.paths[0];
            if (first) {
              onDropFile(first);
            }
          } else {
            setIsHovering(false);
          }
        })
        .then((fn) => {
          unlisten = fn;
        })
        .catch(() => {
          // Outside Tauri (browser dev) -- DOM drop handler below applies.
        });
    } catch {
      // Outside Tauri
    }
    return () => unlisten?.();
  }, [onDropFile]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void handlePick();
      }
    },
    [handlePick],
  );

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 bg-background relative overflow-hidden">
      <div
        aria-hidden="true"
        className="workspace-grid absolute inset-0 pointer-events-none text-foreground opacity-[0.03]"
      />

      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a media file here or activate to browse. Video, audio, or image."
        onClick={() => void handlePick()}
        onKeyDown={handleKeyDown}
        onDragOver={(e) => {
          e.preventDefault();
          setIsHovering(true);
        }}
        onDragLeave={() => setIsHovering(false)}
        onDrop={(e) => {
          // Browser fallback: no filesystem paths available here, so route
          // to Convert where the user can browse explicitly.
          e.preventDefault();
          setIsHovering(false);
          const file = e.dataTransfer.files?.[0];
          if (!file) {
            onSelectTool("convert");
          }
        }}
        className={cn(
          "relative z-10 w-full max-w-2xl aspect-video border-2 border-dashed flex flex-col items-center justify-center gap-6 rounded-xl transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isHovering
            ? "border-primary bg-primary/5 scale-[1.02]"
            : "border-border hover:border-primary/50 bg-card/30",
        )}
      >
        <UploadCloudIcon
          aria-hidden="true"
          className="relative z-10 size-10 text-muted-foreground"
        />

        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Drop media to begin
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Drop a video, audio, or image file to open it in the converter.
          </p>
        </div>

        <Separator className="max-w-xs" />

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <ZapIcon aria-hidden="true" />
            <span>Hardware accel</span>
          </div>
          <div aria-hidden="true" className="size-1 rounded-full bg-border" />
          <div className="flex items-center gap-1.5">
            <Settings2Icon aria-hidden="true" />
            <span>Raw FFmpeg</span>
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none text-xs"
        >
          Browse files
        </Button>
      </div>
    </div>
  );
};
