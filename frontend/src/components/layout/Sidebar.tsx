import React from 'react';
import { 
  Film, 
  Archive, 
  Scissors, 
  Gauge, 
  Crop, 
  Compass, 
  Repeat, 
  Volume2, 
  VolumeX, 
  Image as ImageIcon,
  Music,
  Sliders,
  Tag,
  Combine,
  Terminal,
  Download,
  FileText,
  Sparkles,
  Settings,
  LayoutGrid
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface ToolItem {
  id: string;
  name: string;
  description: string;
  category: 'video' | 'audio' | 'ytdlp' | 'image' | 'tools';
  icon: React.ComponentType<{ className?: string }>;
}

export const TOOLS: ToolItem[] = [
  // Video Tools
  { id: 'convert', name: 'Convert Video', description: 'Convert containers & codecs with hardware acceleration', category: 'video', icon: Film },
  { id: 'compress', name: 'Compress Video', description: 'Reduce size targeting precise MB or CRF quality', category: 'video', icon: Archive },
  { id: 'trim', name: 'Trim & Cut', description: 'Cut video intervals without re-encoding or precise cut', category: 'video', icon: Scissors },
  { id: 'speed', name: 'Speed & Motion', description: 'Adjust playback speed or reverse frames', category: 'video', icon: Gauge },
  { id: 'crop', name: 'Aspect & Crop', description: 'Change aspect ratios and crop framing', category: 'video', icon: Crop },
  { id: 'stabilize', name: 'Stabilize Video', description: 'Smooth camera shakes via two-pass vidstab', category: 'video', icon: Compass },
  { id: 'loop', name: 'Loop Duration', description: 'Extend video duration by looping streams', category: 'video', icon: Repeat },
  { id: 'normalize', name: 'Normalize Audio', description: 'EBU R128 loudness and peak normalization', category: 'video', icon: Volume2 },
  { id: 'mute', name: 'Mute & Replace', description: 'Strip audio or inject alternative soundtracks', category: 'video', icon: VolumeX },
  { id: 'gif', name: 'GIF & Frames', description: 'Generate animated GIFs with high quality palettes', category: 'video', icon: ImageIcon },

  // Audio Tools
  { id: 'extract-audio', name: 'Extract Audio', description: 'Rip audio tracks from video containers', category: 'audio', icon: Music },
  { id: 'compress-audio', name: 'Compress Audio', description: 'Reduce audio file sizes with bitrate scaling', category: 'audio', icon: Sliders },
  { id: 'audio-tags', name: 'Audio Tags', description: 'Edit artist, album, title, and cover art', category: 'audio', icon: Tag },

  // Multi / Advanced
  { id: 'merge', name: 'Merge Files', description: 'Combine multiple videos or tracks sequentially', category: 'tools', icon: Combine },
  { id: 'custom', name: 'Custom FFmpeg', description: 'Execute raw FFmpeg command line arguments', category: 'tools', icon: Terminal },

  // Download Suite
  { id: 'ytdlp-video', name: 'Video Downloader', description: 'Download online videos in best quality', category: 'ytdlp', icon: Download },
  { id: 'ytdlp-audio', name: 'Audio Downloader', description: 'Extract audio from online streams', category: 'ytdlp', icon: Music },

  // Image & AI
  { id: 'bg-remover', name: 'Background Remover', description: 'AI background extraction with RMBG / BiRefNet', category: 'image', icon: Sparkles },
  { id: 'ai-upscaler', name: 'AI Upscaler', description: 'Super-resolution scaling with RealESRGAN', category: 'image', icon: Sparkles },

  // Documents
  { id: 'pdf-tools', name: 'PDF Toolkit', description: 'Merge, split, compress, and OCR documents', category: 'tools', icon: FileText },
];

interface SidebarProps {
  activeTool: string;
  onSelectTool: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTool, onSelectTool }) => {
  const renderNavGroup = (title: string, category: 'video' | 'audio' | 'ytdlp' | 'image' | 'tools') => {
    const items = TOOLS.filter(t => t.category === category);
    if (!items.length) return null;

    return (
      <div className="space-y-1">
        <h4 className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
          {title}
        </h4>
        <div className="space-y-0.5">
          {items.map(tool => {
            const Icon = tool.icon;
            const isActive = activeTool === tool.id;
            return (
              <Button
                key={tool.id}
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                onClick={() => onSelectTool(tool.id)}
                className={cn(
                  "w-full justify-start gap-2.5 h-8 px-2.5 font-medium text-xs",
                  isActive && "bg-secondary font-semibold text-foreground"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", isActive ? "text-primary" : "text-muted-foreground")} />
                <span className="truncate">{tool.name}</span>
              </Button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="w-60 h-full border-r border-border/40 bg-card/40 backdrop-blur-md flex flex-col shrink-0 select-none">
      <div className="p-3 border-b border-border/40">
        <Button
          variant={activeTool === 'dashboard' ? "default" : "outline"}
          size="sm"
          onClick={() => onSelectTool('dashboard')}
          className="w-full justify-start gap-2.5 h-9"
        >
          <LayoutGrid className="h-4 w-4" />
          <span>All Tools</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {renderNavGroup("Video Processing", "video")}
        {renderNavGroup("Audio Tools", "audio")}
        {renderNavGroup("Download Suite", "ytdlp")}
        {renderNavGroup("AI & Documents", "image")}
        {renderNavGroup("Advanced Tools", "tools")}
      </div>

      <div className="p-2.5 border-t border-border/40">
        <Button
          variant={activeTool === 'settings' ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onSelectTool('settings')}
          className="w-full justify-start gap-2.5 h-8.5 font-medium text-xs"
        >
          <Settings className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Settings & Binaries</span>
        </Button>
      </div>
    </div>
  );
};
