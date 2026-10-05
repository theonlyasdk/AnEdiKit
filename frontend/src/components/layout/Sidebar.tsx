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
  return (
    <div className="w-64 h-full border-r border-border/40 bg-card/60 backdrop-blur-md flex flex-col shrink-0 select-none">
      <div className="p-3 border-b border-border/30">
        <button
          onClick={() => onSelectTool('dashboard')}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
            activeTool === 'dashboard'
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
              : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
          )}
        >
          <LayoutGrid className="h-4 w-4" />
          <span>All Tools</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        <div>
          <div className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Video Processing
          </div>
          <div className="space-y-0.5">
            {TOOLS.filter(t => t.category === 'video').map(tool => {
              const Icon = tool.icon;
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  onClick={() => onSelectTool(tool.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium text-left transition-colors",
                    isActive
                      ? "bg-primary/15 text-primary font-semibold"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span className="truncate">{tool.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Audio
          </div>
          <div className="space-y-0.5">
            {TOOLS.filter(t => t.category === 'audio').map(tool => {
              const Icon = tool.icon;
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  onClick={() => onSelectTool(tool.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium text-left transition-colors",
                    isActive
                      ? "bg-primary/15 text-primary font-semibold"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span className="truncate">{tool.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Downloader & Media
          </div>
          <div className="space-y-0.5">
            {TOOLS.filter(t => t.category === 'ytdlp').map(tool => {
              const Icon = tool.icon;
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  onClick={() => onSelectTool(tool.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium text-left transition-colors",
                    isActive
                      ? "bg-primary/15 text-primary font-semibold"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span className="truncate">{tool.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            AI & Documents
          </div>
          <div className="space-y-0.5">
            {TOOLS.filter(t => t.category === 'image' || t.category === 'tools').map(tool => {
              const Icon = tool.icon;
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  onClick={() => onSelectTool(tool.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium text-left transition-colors",
                    isActive
                      ? "bg-primary/15 text-primary font-semibold"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span className="truncate">{tool.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-border/30">
        <button
          onClick={() => onSelectTool('settings')}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
            activeTool === 'settings'
              ? "bg-primary/15 text-primary font-semibold"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )}
        >
          <Settings className="h-4 w-4" />
          <span>Preferences & Binaries</span>
        </button>
      </div>
    </div>
  );
};
