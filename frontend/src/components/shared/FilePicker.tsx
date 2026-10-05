import React from 'react';
import { UploadCloud, FolderOpen, FileCode } from 'lucide-react';
import { pickFile } from '@/services/tauri';

interface FilePickerProps {
  filePath: string;
  onSelectFile: (path: string) => void;
  extensions?: string[];
  title?: string;
  subtitle?: string;
}

export const FilePicker: React.FC<FilePickerProps> = ({
  filePath,
  onSelectFile,
  extensions = [],
  title = "Drop your media file here",
  subtitle = "Supports MP4, MKV, MOV, WebM, AVI and other popular formats"
}) => {
  const handleBrowse = async () => {
    const selected = await pickFile(extensions);
    if (selected) {
      onSelectFile(selected);
    }
  };

  const fileName = filePath ? filePath.split(/[/\\]/).pop() : '';

  return (
    <div
      onClick={handleBrowse}
      className={`relative w-full rounded-xl border-2 border-dashed p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
        filePath
          ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
          : "border-border/60 hover:border-primary/40 bg-card/20 hover:bg-muted/30"
      }`}
    >
      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3">
        {filePath ? <FileCode className="h-6 w-6" /> : <UploadCloud className="h-6 w-6" />}
      </div>

      {filePath ? (
        <div className="space-y-1 max-w-full px-4">
          <p className="font-semibold text-sm text-foreground truncate max-w-md">
            {fileName}
          </p>
          <p className="text-[11px] text-muted-foreground truncate max-w-lg">
            {filePath}
          </p>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-primary hover:underline flex items-center gap-1.5 mx-auto"
          >
            <FolderOpen className="h-3.5 w-3.5" /> Change File
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="font-medium text-sm text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
          <div className="pt-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground shadow-xs">
              <FolderOpen className="h-3.5 w-3.5" /> Browse File
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
