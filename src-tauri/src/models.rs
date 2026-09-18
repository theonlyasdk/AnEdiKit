use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct MediaInfo {
    pub file_path: String,
    pub file_name: String,
    pub duration_seconds: f64,
    pub duration_string: String,
    pub resolution: String,
    pub video_codec: String,
    pub audio_codec: String,
    pub file_size_mb: f64,
    pub file_size_formatted: String,
    pub bitrate_kbps: u64,
    pub album_art_url: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct AudioMetadataInfo {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub genre: String,
    pub year: String,
    pub track: String,
    pub total_tracks: String,
    pub disc: String,
    pub composer: String,
    pub comment: String,
    pub has_cover: bool,
    pub cover_data_url: Option<String>,
    pub raw_tags: std::collections::HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ProgressPayload {
    pub time: String,
    pub eta: Option<String>,
    pub fps: String,
    pub speed: String,
    pub bitrate: String,
    pub pct: u32,
    pub playlist_item: Option<u32>,
    pub playlist_total: Option<u32>,
    pub current_item_title: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LogPayload {
    pub line: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ToolExtractProgressPayload {
    pub tool_name: String,
    pub step: String,
    pub progress: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ToolDownloadProgressPayload {
    pub tool_name: String,
    pub pct: f32,
    pub downloaded: Option<String>,
    pub total: Option<String>,
    pub speed: Option<String>,
    pub eta: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct HardwareInfo {
    pub cpu_name: Option<String>,
    pub nvidia_gpu: Option<String>,
    pub intel_gpu: Option<String>,
    pub amd_gpu: Option<String>,
    pub default_recommended: String,
    pub nvenc_available: bool,
    pub qsv_available: bool,
    pub amf_available: bool,
    pub d3d11va_available: bool,
    pub videotoolbox_available: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FinishPayload {
    pub success: bool,
    pub exit_code: i32,
    pub message: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlaylistVideo {
    pub index: usize,
    pub id: String,
    pub title: String,
    pub url: String,
    pub duration: Option<f64>,
    pub duration_string: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct ToolVersionsInfo {
    pub ytdlp_installed: String,
    pub deno_installed: String,
    pub ffmpeg_installed: String,
    pub ffprobe_installed: String,
}
