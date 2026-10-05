import React from 'react';
import { Film, Clock, HardDrive, Cpu, Radio } from 'lucide-react';
import { MediaProbeInfo } from '@/services/tauri';

interface MediaInfoCardProps {
  info: MediaProbeInfo | null;
  loading?: boolean;
}

export const MediaInfoCard: React.FC<MediaInfoCardProps> = ({ info, loading }) => {
  if (loading) {
    return (
      <div className="p-4 rounded-xl border border-border/40 bg-card/40 animate-pulse flex items-center justify-center text-xs text-muted-foreground">
        Probing media details...
      </div>
    );
  }

  if (!info || (!info.format && !info.streams)) {
    return null;
  }

  const videoStream = info.streams?.find(s => s.codec_type === 'video');
  const audioStream = info.streams?.find(s => s.codec_type === 'audio');

  const durationSec = info.format?.duration ? parseFloat(info.format.duration) : 0;
  const minutes = Math.floor(durationSec / 60);
  const seconds = Math.floor(durationSec % 60);
  const durationStr = durationSec > 0 ? `${minutes}m ${seconds}s` : 'Unknown';

  const sizeMb = info.format?.size ? (parseInt(info.format.size) / (1024 * 1024)).toFixed(1) + ' MB' : 'Unknown';
  const resolution = videoStream?.width && videoStream?.height ? `${videoStream.width}x${videoStream.height}` : 'N/A';
  const videoCodec = videoStream?.codec_name?.toUpperCase() || 'None';
  const audioCodec = audioStream?.codec_name?.toUpperCase() || 'None';

  return (
    <div className="p-4 rounded-xl border border-border/40 bg-card/50 space-y-3">
      <div className="flex items-center justify-between text-xs font-semibold text-foreground/80 border-b border-border/30 pb-2">
        <span className="flex items-center gap-1.5">
          <Film className="h-4 w-4 text-primary" /> Stream Details
        </span>
        <span className="text-[11px] font-normal text-muted-foreground uppercase">
          {info.format?.format_name || 'Container'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <div className="text-[10px] text-muted-foreground">Duration</div>
            <div className="font-medium text-foreground">{durationStr}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <div className="text-[10px] text-muted-foreground">File Size</div>
            <div className="font-medium text-foreground">{sizeMb}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <div className="text-[10px] text-muted-foreground">Resolution / Codec</div>
            <div className="font-medium text-foreground truncate max-w-[120px]">
              {resolution} ({videoCodec})
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <div className="text-[10px] text-muted-foreground">Audio Track</div>
            <div className="font-medium text-foreground truncate max-w-[120px]">
              {audioCodec}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
