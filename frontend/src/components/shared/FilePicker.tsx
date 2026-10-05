import React, { useCallback } from "react";
import {
  UploadCloudIcon,
  FolderOpenIcon,
  FileCodeIcon,
  CheckCircle2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { pickFile, type PickFilter } from "@/services/tauri";
import { cn } from "@/lib/utils";

interface FilePickerProps {
  filePath: string;
  onSelectFile: (path: string) => void;
  filter?: PickFilter;
  title?: string;
  subtitle?: string;
}

export const FilePicker: React.FC<FilePickerProps> = ({
  filePath,
  onSelectFile,
  filter,
  title = "Select a media file",
  subtitle = "Video, audio, or image",
}) => {
  const handleBrowse = useCallback(async () => {
    try {
      const selected = await pickFile(filter);
      if (selected) {
        onSelectFile(selected);
      }
    } catch {
      toast.error("Could not open the file dialog.");
    }
  }, [filter, onSelectFile]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void handleBrowse();
      }
    },
    [handleBrowse],
  );

  const fileName = filePath ? filePath.split(/[/\\]/).pop() : "";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={filePath ? `Selected file ${fileName}. Activate to choose a different file.` : title}
      onClick={() => void handleBrowse()}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative w-full border border-dashed p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 group rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        filePath
          ? "border-primary/50 bg-primary/5 hover:bg-primary/10"
          : "border-border hover:border-primary/50 bg-card/20 hover:bg-card/40",
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "size-12 flex items-center justify-center mb-4 transition-transform group-hover:scale-110 duration-200",
          filePath
            ? "text-primary"
            : "text-muted-foreground group-hover:text-primary",
        )}
      >
        {filePath ? (
          <FileCodeIcon className="size-8" />
        ) : (
          <UploadCloudIcon className="size-8" />
        )}
      </div>

      {filePath ? (
        <div className="flex flex-col gap-2 max-w-full px-4">
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2Icon aria-hidden="true" className="size-4 text-primary" />
            <p className="font-bold text-sm text-foreground truncate max-w-md">
              {fileName}
            </p>
          </div>
          <p className="text-xs text-muted-foreground font-mono truncate max-w-lg select-text">
            {filePath}
          </p>
          <div className="pt-2">
            <span className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs">
              <FolderOpenIcon aria-hidden="true" className="size-4" />
              Change file
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="font-bold text-sm text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
          <div className="pt-2">
            <span className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground">
              <FolderOpenIcon aria-hidden="true" className="size-4" />
              Browse files
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
