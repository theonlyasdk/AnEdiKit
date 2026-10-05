import React from 'react';
import { Film, Clock, HardDrive, Cpu, Radio } from 'lucide-react';
import { MediaProbeInfo } from '@/services/tauri';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface MediaInfoCardProps {
  info: MediaProbeInfo | null;
  loading?: boolean;
}

export const MediaInfoCard: React.FC<MediaInfoCardProps> = ({ info, loading }) => {
  if (loading) {
    return (
      <Card className="p-4 bg-card/40 border-dashed animate-pulse flex items-center justify-center text-xs text-muted-foreground">
        Probing media details...
      </Card>
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
    <Card className="bg-card/60 backdrop-blur-xs border-border/60">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-border/40 text-xs">
        <div className="flex items-center gap-2 font-semibold text-foreground/90">
          <Film className="h-4 w-4 text-primary" />
          <span>Stream Information</span>
        </div>
        <Badge variant="secondary" className="font-mono text-[10px] uppercase">
          {info.format?.format_name || 'Container'}
        </Badge>
      </div>

      <CardContent className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Duration</div>
              <div className="font-semibold text-foreground">{durationStr}</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
              <HardDrive className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">File Size</div>
              <div className="font-semibold text-foreground">{sizeMb}</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Video Codec</div>
              <div className="font-semibold text-foreground truncate max-w-[120px]">
                {resolution} ({videoCodec})
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
              <Radio className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Audio Codec</div>
              <div className="font-semibold text-foreground truncate max-w-[120px]">
                {audioCodec}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
