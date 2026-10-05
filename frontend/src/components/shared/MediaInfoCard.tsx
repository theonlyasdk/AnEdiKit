import React from "react";
import type { MediaInfo } from "@/services/tauri";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface MediaInfoCardProps {
  info: MediaInfo | null;
  loading?: boolean;
  error?: string | null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="font-mono text-foreground font-bold tracking-wide truncate">
        {value}
      </dd>
    </div>
  );
}

export const MediaInfoCard: React.FC<MediaInfoCardProps> = ({
  info,
  loading,
  error,
}) => {
  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading media information"
        className="border border-dashed p-6 rounded-lg flex flex-col gap-3"
      >
        <Skeleton className="h-4 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (!info) {
    if (error) {
      return (
        <div
          role="alert"
          className="border border-destructive/50 rounded-lg p-4 text-sm text-destructive"
        >
          {error}
        </div>
      );
    }
    return null;
  }

  const display = (value: string): string =>
    value === "--" || value === "" ? "Unknown" : value;

  return (
    <Card className="bg-card/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-mono truncate">
          {info.file_name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-xs">
          <Stat label="Duration" value={display(info.duration_string)} />
          <Stat label="Size" value={display(info.file_size_formatted)} />
          <Stat
            label="Video"
            value={
              info.resolution === "N/A"
                ? display(info.video_codec)
                : `${display(info.resolution)} ${display(info.video_codec)}`.trim()
            }
          />
          <Stat label="Audio" value={display(info.audio_codec)} />
        </dl>
      </CardContent>
    </Card>
  );
};
