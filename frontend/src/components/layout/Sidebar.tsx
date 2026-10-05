import React from "react";
import {
  FilmIcon,
  ArchiveIcon,
  ScissorsIcon,
  GaugeIcon,
  CropIcon,
  CompassIcon,
  RepeatIcon,
  Volume2Icon,
  VolumeXIcon,
  ImageIcon,
  MusicIcon,
  SlidersIcon,
  TagIcon,
  CombineIcon,
  TerminalIcon,
  DownloadIcon,
  FileTextIcon,
  SparklesIcon,
  SettingsIcon,
  LayoutGridIcon,
  UploadCloudIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ToolCategory = "video" | "audio" | "ytdlp" | "image" | "tools";

export interface ToolItem {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  icon: React.ComponentType<{ className?: string }>;
}

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  video: "Video",
  audio: "Audio",
  ytdlp: "Downloader",
  image: "AI & Image",
  tools: "Advanced",
};

// Tools with a real implementation behind them. Everything else renders as
// a disabled "coming soon" entry — the nav must never advertise tools that
// do nothing.
export const AVAILABLE_TOOLS: ReadonlySet<string> = new Set(["convert"]);

export const TOOLS: ToolItem[] = [
  // Video Tools
  { id: "convert", name: "Convert Video", description: "Convert containers & codecs with hardware acceleration", category: "video", icon: FilmIcon },
  { id: "compress", name: "Compress Video", description: "Reduce size targeting precise MB or CRF quality", category: "video", icon: ArchiveIcon },
  { id: "trim", name: "Trim & Cut", description: "Cut video intervals without re-encoding or precise cut", category: "video", icon: ScissorsIcon },
  { id: "speed", name: "Speed & Motion", description: "Adjust playback speed or reverse frames", category: "video", icon: GaugeIcon },
  { id: "crop", name: "Aspect & Crop", description: "Change aspect ratios and crop framing", category: "video", icon: CropIcon },
  { id: "stabilize", name: "Stabilize Video", description: "Smooth camera shakes via two-pass vidstab", category: "video", icon: CompassIcon },
  { id: "loop", name: "Loop Duration", description: "Extend video duration by looping streams", category: "video", icon: RepeatIcon },
  { id: "normalize", name: "Normalize Audio", description: "EBU R128 loudness and peak normalization", category: "video", icon: Volume2Icon },
  { id: "mute", name: "Mute & Replace", description: "Strip audio or inject alternative soundtracks", category: "video", icon: VolumeXIcon },
  { id: "gif", name: "GIF & Frames", description: "Generate animated GIFs with high quality palettes", category: "video", icon: ImageIcon },

  // Audio Tools
  { id: "extract-audio", name: "Extract Audio", description: "Rip audio tracks from video containers", category: "audio", icon: MusicIcon },
  { id: "compress-audio", name: "Compress Audio", description: "Reduce audio file sizes with bitrate scaling", category: "audio", icon: SlidersIcon },
  { id: "audio-tags", name: "Audio Tags", description: "Edit artist, album, title, and cover art", category: "audio", icon: TagIcon },

  // Multi / Advanced
  { id: "merge", name: "Merge Files", description: "Combine multiple videos or tracks sequentially", category: "tools", icon: CombineIcon },
  { id: "custom", name: "Custom FFmpeg", description: "Execute raw FFmpeg command line arguments", category: "tools", icon: TerminalIcon },

  // Download Suite
  { id: "ytdlp-video", name: "Video Downloader", description: "Download online videos in best quality", category: "ytdlp", icon: DownloadIcon },
  { id: "ytdlp-audio", name: "Audio Downloader", description: "Extract audio from online streams", category: "ytdlp", icon: MusicIcon },

  // Image & AI
  { id: "bg-remover", name: "Background Remover", description: "AI background extraction with RMBG / BiRefNet", category: "image", icon: SparklesIcon },
  { id: "ai-upscaler", name: "AI Upscaler", description: "Super-resolution scaling with RealESRGAN", category: "image", icon: SparklesIcon },

  // Documents
  { id: "pdf-tools", name: "PDF Toolkit", description: "Merge, split, compress, and OCR documents", category: "tools", icon: FileTextIcon },
];

interface SidebarProps {
  activeTool: string;
  onSelectTool: (id: string) => void;
}

function NavButton({
  id,
  label,
  description,
  isActive,
  onSelect,
  Icon,
  className,
  disabled,
}: {
  id: string;
  label: string;
  description?: string;
  isActive: boolean;
  onSelect: (id: string) => void;
  Icon: React.ComponentType<{ className?: string }>;
  className?: string;
  disabled?: boolean;
}) {
  const hint = disabled ? `${label} — coming soon` : description;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Disabled buttons don't emit hover events, so the tooltip
            anchors to the wrapping span instead. */}
        <span className="block">
          <Button
            variant={isActive ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onSelect(id)}
            disabled={disabled}
            aria-current={isActive ? "page" : undefined}
            aria-label={hint ? `${label}: ${hint}` : label}
            className={cn("w-full justify-start text-xs font-normal", className)}
          >
            <Icon aria-hidden="true" />
            <span className="truncate">{label}</span>
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p className="font-medium">{label}</p>
        {hint && (
          <p className="text-muted-foreground text-xs">{hint}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTool,
  onSelectTool,
}) => {
  const renderNavGroup = (category: ToolCategory) => {
    const items = TOOLS.filter((t) => t.category === category);
    if (!items.length) return null;

    return (
      <div className="flex flex-col gap-1">
        <h4 className="px-3 text-[10px] font-semibold text-muted-foreground">
          {CATEGORY_LABELS[category]}
        </h4>
        <div className="flex flex-col gap-0.5">
          {items.map((tool) => (
            <NavButton
              key={tool.id}
              id={tool.id}
              label={tool.name}
              description={tool.description}
              isActive={activeTool === tool.id}
              onSelect={onSelectTool}
              Icon={tool.icon}
              disabled={!AVAILABLE_TOOLS.has(tool.id)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <nav
      aria-label="Media tools"
      className="w-60 h-full border-r bg-card/50 flex flex-col shrink-0 select-none-chrome"
    >
      <div className="p-3 flex flex-col gap-1">
        <NavButton
          id="workspace"
          label="Quick Workspace"
          isActive={activeTool === "workspace"}
          onSelect={onSelectTool}
          Icon={UploadCloudIcon}
          className="font-semibold"
        />
        <NavButton
          id="dashboard"
          label="All Tools"
          isActive={activeTool === "dashboard"}
          onSelect={onSelectTool}
          Icon={LayoutGridIcon}
          className="font-semibold"
        />
      </div>

      <Separator />

      <ScrollArea className="flex-1 p-2">
        <div className="flex flex-col gap-4 py-2">
          {renderNavGroup("video")}
          {renderNavGroup("audio")}
          {renderNavGroup("ytdlp")}
          {renderNavGroup("image")}
          {renderNavGroup("tools")}
        </div>
      </ScrollArea>

      <Separator />

      <div className="p-2.5">
        <NavButton
          id="settings"
          label="Settings & Binaries"
          isActive={activeTool === "settings"}
          onSelect={onSelectTool}
          Icon={SettingsIcon}
        />
      </div>
    </nav>
  );
};
