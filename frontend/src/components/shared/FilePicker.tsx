import React from 'react';
import { UploadCloud, FolderOpen, FileCode, CheckCircle2 } from 'lucide-react';
import { pickFile } from '@/services/tauri';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
  title = "Choose or drop your media file",
  subtitle = "Supports MP4, MKV, MOV, WebM, AVI and other formats"
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
      className={`relative w-full rounded-xl border-2 border-dashed p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 group ${
        filePath
          ? "border-primary/50 bg-primary/5 hover:bg-primary/10"
          : "border-border/70 hover:border-primary/50 bg-card/40 hover:bg-muted/30"
      }`}
    >
      <div className={`h-12 w-12 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-105 duration-200 ${
        filePath ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground group-hover:text-primary group-hover:bg-primary/10"
      }`}>
        {filePath ? <FileCode className="h-6 w-6" /> : <UploadCloud className="h-6 w-6" />}
      </div>

      {filePath ? (
        <div className="space-y-1.5 max-w-full px-4">
          <div className="flex items-center justify-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <p className="font-semibold text-sm text-foreground truncate max-w-md">
              {fileName}
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground font-mono truncate max-w-lg">
            {filePath}
          </p>
          <div className="pt-2">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 pointer-events-none">
              <FolderOpen className="h-3.5 w-3.5" /> Change File
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="font-semibold text-sm text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
          <div className="pt-2">
            <Button size="sm" className="h-8 text-xs gap-1.5 shadow-sm">
              <FolderOpen className="h-3.5 w-3.5" /> Browse File
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
