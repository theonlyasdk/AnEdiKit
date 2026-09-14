use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufReader, Read};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

static RUNNING_CHILD_PID: Mutex<Option<u32>> = Mutex::new(None);
static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);
static BINARY_PATH_CACHE: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
static HARDWARE_INFO_CACHE: Mutex<Option<HardwareInfo>> = Mutex::new(None);

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

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct HardwareInfo {
    pub cpu_name: Option<String>,
    pub nvidia_gpu: Option<String>,
    pub intel_gpu: Option<String>,
    pub amd_gpu: Option<String>,
    pub default_recommended: String,
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

#[tauri::command]
fn pick_file(filter_mode: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new();
    match filter_mode.as_deref() {
        Some("image") => {
            dialog = dialog.add_filter(
                "Image Files",
                &["png", "jpg", "jpeg", "webp", "bmp", "tiff", "gif", "svg", "ico"],
            );
        }
        Some("audio") => {
            dialog = dialog.add_filter(
                "Audio Files",
                &["mp3", "wav", "flac", "m4a", "ogg", "opus", "aac"],
            );
        }
        Some("video") => {
            dialog = dialog.add_filter(
                "Video Files",
                &["mp4", "mkv", "webm", "mov", "avi", "flv", "ts", "wmv"],
            );
        }
        _ => {
            dialog = dialog.add_filter(
                "Media & Image Files",
                &[
                    "mp4", "mkv", "webm", "mov", "avi", "flv", "ts", "wmv", "m4v", "mp3", "wav", "flac", "m4a",
                    "ogg", "opus", "wma", "aiff", "png", "jpg", "jpeg", "webp", "bmp", "tiff", "gif", "svg",
                ],
            );
        }
    }
    dialog.pick_file().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn pick_files(filter_mode: Option<String>) -> Vec<String> {
    let mut dialog = rfd::FileDialog::new();
    match filter_mode.as_deref() {
        Some("image") => {
            dialog = dialog.add_filter(
                "Image Files",
                &["png", "jpg", "jpeg", "webp", "bmp", "tiff", "gif", "svg", "ico"],
            );
        }
        Some("audio") => {
            dialog = dialog.add_filter(
                "Audio Files",
                &["mp3", "wav", "flac", "m4a", "ogg", "opus", "aac", "wma", "aiff"],
            );
        }
        Some("video") => {
            dialog = dialog.add_filter(
                "Video Files",
                &["mp4", "mkv", "webm", "mov", "avi", "flv", "ts", "wmv", "m4v"],
            );
        }
        _ => {
            dialog = dialog.add_filter(
                "Media & Image Files",
                &[
                    "mp4", "mkv", "webm", "mov", "avi", "flv", "ts", "wmv", "m4v", "mp3", "wav", "flac", "m4a",
                    "ogg", "opus", "wma", "aiff", "png", "jpg", "jpeg", "webp", "bmp", "tiff", "gif", "svg",
                ],
            );
        }
    }
    dialog
        .pick_files()
        .map(|paths| {
            paths
                .into_iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
fn write_temp_text_file(filename: String, content: String) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join(&filename);
    std::fs::write(&file_path, content.as_bytes())
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn pick_folder(default_path: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new();
    if let Some(dp) = default_path {
        let p = std::path::Path::new(&dp);
        if p.is_dir() {
            dialog = dialog.set_directory(p);
        } else if let Some(parent) = p.parent() {
            if parent.exists() {
                dialog = dialog.set_directory(parent);
            }
        }
    }
    dialog.pick_folder().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn check_file_exists(file_path: String) -> bool {
    let decoded = percent_decode_path(&file_path);
    let p = std::path::Path::new(&decoded);
    p.exists() && p.is_file()
}

fn read_image_data_internal(file_path: String) -> Result<String, String> {
    let decoded = percent_decode_path(&file_path);
    let p = std::path::Path::new(&decoded);
    if !p.exists() || !p.is_file() {
        return Err("Image file does not exist".into());
    }

    let bytes = std::fs::read(p).map_err(|e| format!("Failed to read image: {}", e))?;
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();

    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "tiff" | "tif" => "image/tiff",
        _ => "image/png",
    };

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
async fn read_image_data(file_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || read_image_data_internal(file_path))
        .await
        .map_err(|e| format!("Async task execution failed: {}", e))?
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct ToolVersionsInfo {
    pub ytdlp_installed: String,
    pub deno_installed: String,
    pub ffmpeg_installed: String,
    pub ffprobe_installed: String,
}

#[tauri::command]
fn check_tool_versions() -> HashMap<String, String> {
    let t_ytdlp = std::thread::spawn(|| {
        let bin = find_binary("yt-dlp");
        let mut cmd = Command::new(&bin);
        cmd.arg("--version");
        #[cfg(windows)]
        cmd.creation_flags(0x08000000);
        if let Ok(out) = cmd.output() {
            if out.status.success() {
                if let Ok(s) = String::from_utf8(out.stdout) {
                    return s.trim().to_string();
                }
            }
        }
        "Not Found".to_string()
    });

    let t_deno = std::thread::spawn(|| {
        let bin = find_binary("deno");
        let mut cmd = Command::new(&bin);
        cmd.arg("--version");
        #[cfg(windows)]
        cmd.creation_flags(0x08000000);
        if let Ok(out) = cmd.output() {
            if out.status.success() {
                if let Ok(s) = String::from_utf8(out.stdout) {
                    if let Some(line1) = s.lines().next() {
                        let parts: Vec<&str> = line1.split_whitespace().collect();
                        if parts.len() >= 2 {
                            return parts[1].trim_start_matches('v').to_string();
                        } else {
                            let ver = line1.replace("deno", "").trim().trim_start_matches('v').to_string();
                            return if ver.is_empty() { line1.trim().to_string() } else { ver };
                        }
                    }
                }
            }
        }
        "Not Found".to_string()
    });

    let t_ffmpeg = std::thread::spawn(|| {
        let bin = find_binary("ffmpeg");
        let mut cmd = Command::new(&bin);
        cmd.arg("-version");
        #[cfg(windows)]
        cmd.creation_flags(0x08000000);
        if let Ok(out) = cmd.output() {
            if out.status.success() {
                if let Ok(s) = String::from_utf8(out.stdout) {
                    // Extract date stamp or release version e.g. from extra-version=20260811 or N-...-20260811
                    if let Some(pos) = s.find("extra-version=") {
                        let sub = &s[pos + 14..];
                        let date_str = sub.chars().take_while(|c| c.is_ascii_digit()).collect::<String>();
                        if date_str.len() == 8 {
                            return format!("{}-{}-{}", &date_str[0..4], &date_str[4..6], &date_str[6..8]);
                        }
                    }
                    if let Some(line1) = s.lines().next() {
                        let parts: Vec<&str> = line1.split_whitespace().collect();
                        if parts.len() >= 3 {
                            let raw_ver = parts[2];
                            // Check if git commit/date format e.g. N-126060-g03dc244a69-20260811
                            if let Some(last_dash) = raw_ver.rfind('-') {
                                let date_candidate = &raw_ver[last_dash + 1..];
                                if date_candidate.len() == 8 && date_candidate.chars().all(|c| c.is_ascii_digit()) {
                                    return format!("{}-{}-{}", &date_candidate[0..4], &date_candidate[4..6], &date_candidate[6..8]);
                                }
                            }
                            return raw_ver.to_string();
                        }
                    }
                }
            }
        }
        "Not Found".to_string()
    });

    let t_ffprobe = std::thread::spawn(|| {
        let bin = find_binary("ffprobe");
        let mut cmd = Command::new(&bin);
        cmd.arg("-version");
        #[cfg(windows)]
        cmd.creation_flags(0x08000000);
        if let Ok(out) = cmd.output() {
            if out.status.success() {
                if let Ok(s) = String::from_utf8(out.stdout) {
                    if let Some(pos) = s.find("extra-version=") {
                        let sub = &s[pos + 14..];
                        let date_str = sub.chars().take_while(|c| c.is_ascii_digit()).collect::<String>();
                        if date_str.len() == 8 {
                            return format!("{}-{}-{}", &date_str[0..4], &date_str[4..6], &date_str[6..8]);
                        }
                    }
                    if let Some(line1) = s.lines().next() {
                        let parts: Vec<&str> = line1.split_whitespace().collect();
                        if parts.len() >= 3 {
                            let raw_ver = parts[2];
                            if let Some(last_dash) = raw_ver.rfind('-') {
                                let date_candidate = &raw_ver[last_dash + 1..];
                                if date_candidate.len() == 8 && date_candidate.chars().all(|c| c.is_ascii_digit()) {
                                    return format!("{}-{}-{}", &date_candidate[0..4], &date_candidate[4..6], &date_candidate[6..8]);
                                }
                            }
                            return raw_ver.to_string();
                        }
                    }
                }
            }
        }
        "Not Found".to_string()
    });

    let ytdlp_ver = t_ytdlp.join().unwrap_or_else(|_| "Not Found".into());
    let deno_ver = t_deno.join().unwrap_or_else(|_| "Not Found".into());
    let ffmpeg_ver = t_ffmpeg.join().unwrap_or_else(|_| "Not Found".into());
    let ffprobe_ver = t_ffprobe.join().unwrap_or_else(|_| "Not Found".into());

    let mut map = HashMap::new();
    map.insert("ytdlp".to_string(), ytdlp_ver.clone());
    map.insert("yt-dlp".to_string(), ytdlp_ver.clone());
    map.insert("ytdlp_installed".to_string(), ytdlp_ver);

    map.insert("deno".to_string(), deno_ver.clone());
    map.insert("deno_installed".to_string(), deno_ver);

    map.insert("ffmpeg".to_string(), ffmpeg_ver.clone());
    map.insert("ffmpeg_installed".to_string(), ffmpeg_ver);

    map.insert("ffprobe".to_string(), ffprobe_ver.clone());
    map.insert("ffprobe_installed".to_string(), ffprobe_ver);

    map.insert("python".to_string(), "Available".to_string());
    map.insert("python_installed".to_string(), "Available".to_string());

    map
}

fn find_binary(bin: &str) -> String {
    let mut cache = BINARY_PATH_CACHE.lock().unwrap();
    if cache.is_none() {
        *cache = Some(HashMap::new());
    }
    if let Some(ref map) = *cache {
        if let Some(cached_path) = map.get(bin) {
            return cached_path.clone();
        }
    }

    let resolved = resolve_binary_path(bin);
    if let Some(ref mut map) = *cache {
        map.insert(bin.to_string(), resolved.clone());
    }
    resolved
}

fn resolve_binary_path(bin: &str) -> String {
    // 1. Check local tools and app directories first
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let p = std::path::Path::new(&local_app_data)
            .join("ASDK")
            .join("Shared")
            .join("bin")
            .join(format!("{}.exe", bin));
        if p.is_file() {
            return p.to_string_lossy().to_string();
        }
        let p_tauri = std::path::Path::new(&local_app_data)
            .join("tauri")
            .join("bin")
            .join(format!("{}.exe", bin));
        if p_tauri.is_file() {
            return p_tauri.to_string_lossy().to_string();
        }
    }

    let p2 = std::path::Path::new(r"C:\ffmpeg\bin").join(format!("{}.exe", bin));
    if p2.is_file() {
        return p2.to_string_lossy().to_string();
    }

    // 2. Check PATH environment variable directly via filesystem checks without process spawning
    if let Some(paths) = std::env::var_os("PATH") {
        for path_entry in std::env::split_paths(&paths) {
            let candidate_exe = path_entry.join(format!("{}.exe", bin));
            if candidate_exe.is_file() {
                return candidate_exe.to_string_lossy().to_string();
            }
            let candidate_bare = path_entry.join(bin);
            if candidate_bare.is_file() {
                return candidate_bare.to_string_lossy().to_string();
            }
        }
    }

    bin.to_string()
}

fn percent_decode_path(input: &str) -> String {
    let mut clean = input;
    if clean.starts_with("file:///") {
        clean = &clean[8..];
    } else if clean.starts_with("file://") {
        clean = &clean[7..];
    }

    let bytes = clean.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(val) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..=i + 2]).unwrap_or(""), 16) {
                decoded.push(val);
                i += 3;
                continue;
            }
        }
        decoded.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(decoded).unwrap_or_else(|_| clean.to_string())
}

fn get_media_info_internal(file_path: String) -> Result<MediaInfo, String> {
    let decoded_path = percent_decode_path(&file_path);
    let path = std::path::Path::new(&decoded_path);
    if !path.exists() {
        return Err("Selected file does not exist".into());
    }

    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let file_size_bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let file_size_mb = (file_size_bytes as f64) / (1024.0 * 1024.0);
    let file_size_formatted = format!("{:.2} MB", file_size_mb);

    let mut info = MediaInfo {
        file_path: decoded_path.clone(),
        file_name,
        duration_seconds: 0.0,
        duration_string: "--:--:--".into(),
        resolution: "--".into(),
        video_codec: "--".into(),
        audio_codec: "--".into(),
        file_size_mb,
        file_size_formatted,
        bitrate_kbps: 0,
        album_art_url: None,
    };

    let probe_bin = find_binary("ffprobe");
    let mut cmd = Command::new(&probe_bin);
    cmd.args([
        "-v",
        "error",
        "-show_entries",
        "format=duration,bit_rate:stream=codec_type,codec_name,width,height,duration:stream_tags=DURATION",
        "-of",
        "json",
        &decoded_path,
    ]);

    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    if let Ok(output) = cmd.output() {
        if output.status.success() {
            if let Ok(json_str) = String::from_utf8(output.stdout) {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str) {
                    if let Some(streams) = parsed.get("streams").and_then(|s| s.as_array()) {
                        for stream in streams {
                            let c_type = stream
                                .get("codec_type")
                                .and_then(|t| t.as_str())
                                .unwrap_or("");
                            let c_name = stream
                                .get("codec_name")
                                .and_then(|n| n.as_str())
                                .unwrap_or("");

                            let is_attached_pic = stream
                                .get("disposition")
                                .and_then(|d| d.get("attached_pic"))
                                .and_then(|p| p.as_i64())
                                .unwrap_or(0) == 1;

                            if c_type == "video" && !is_attached_pic && info.video_codec == "--" {
                                info.video_codec = c_name.to_string();
                                if let (Some(w), Some(h)) = (
                                    stream.get("width").and_then(|w| w.as_i64()),
                                    stream.get("height").and_then(|h| h.as_i64()),
                                ) {
                                    info.resolution = format!("{}x{}", w, h);
                                }
                            } else if c_type == "audio" && info.audio_codec == "--" {
                                info.audio_codec = c_name.to_string();
                            }

                            // Fallback stream duration
                            if info.duration_seconds == 0.0 {
                                if let Some(d_str) = stream.get("duration").and_then(|d| d.as_str()) {
                                    if let Ok(dur) = d_str.parse::<f64>() {
                                        info.duration_seconds = dur;
                                    }
                                }
                            }
                        }
                    }

                    if let Some(format_obj) = parsed.get("format") {
                        if let Some(dur_str) =
                            format_obj.get("duration").and_then(|d| d.as_str())
                        {
                            if let Ok(dur_sec) = dur_str.parse::<f64>() {
                                info.duration_seconds = dur_sec;
                            }
                        }
                        if let Some(br_str) = format_obj.get("bit_rate").and_then(|b| b.as_str())
                        {
                            if let Ok(br) = br_str.parse::<u64>() {
                                info.bitrate_kbps = br / 1000;
                            }
                        }
                    }

                    if info.duration_seconds > 0.0 {
                        let total_sec = info.duration_seconds.round() as u64;
                        let h = total_sec / 3600;
                        let m = (total_sec % 3600) / 60;
                        let s = total_sec % 60;
                        info.duration_string = format!("{:02}:{:02}:{:02}", h, m, s);
                    }
                }
            }
        }
    }

    // Audio file format / codec fallback if ffprobe didn't detect
    let ext_lower = std::path::Path::new(&decoded_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if info.audio_codec == "--" {
        match ext_lower.as_str() {
            "mp3" => info.audio_codec = "mp3".into(),
            "flac" => info.audio_codec = "flac".into(),
            "wav" => info.audio_codec = "pcm".into(),
            "m4a" | "aac" => info.audio_codec = "aac".into(),
            "ogg" => info.audio_codec = "vorbis".into(),
            "opus" => info.audio_codec = "opus".into(),
            "wma" => info.audio_codec = "wma".into(),
            _ => {}
        }
    }

    let is_img = ["png", "jpg", "jpeg", "webp", "bmp", "tiff", "tif", "gif", "svg", "ico", "avif", "heic"].contains(&ext_lower.as_str());
    if is_img {
        if info.video_codec == "--" {
            info.video_codec = ext_lower.to_uppercase();
        }
        info.audio_codec = "None".into();
        info.duration_seconds = 0.0;
        info.duration_string = "--:--:--".into();
    } else if info.video_codec == "--" && ["mp3", "wav", "flac", "m4a", "ogg", "opus", "wma", "aac", "alac", "aiff"].contains(&ext_lower.as_str()) {
        info.video_codec = "None".into();
        info.resolution = "N/A".into();
    }

    Ok(info)
}

#[tauri::command]
async fn get_media_info(file_path: String) -> Result<MediaInfo, String> {
    tauri::async_runtime::spawn_blocking(move || get_media_info_internal(file_path))
        .await
        .map_err(|e| format!("Async task execution failed: {}", e))?
}

#[tauri::command]
fn cancel_ffmpeg() -> Result<(), String> {
    CANCEL_REQUESTED.store(true, Ordering::SeqCst);
    let mut pid_lock = RUNNING_CHILD_PID.lock().unwrap();
    if let Some(pid) = *pid_lock {
        #[cfg(windows)]
        {
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/F", "/T"])
                .creation_flags(0x08000000)
                .output();
        }
        #[cfg(not(windows))]
        {
            let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
        }
        *pid_lock = None;
    }
    Ok(())
}

#[tauri::command]
fn cancel_job() -> Result<(), String> {
    cancel_ffmpeg()
}

fn get_hardware_info_internal() -> HardwareInfo {
    {
        let cache = HARDWARE_INFO_CACHE.lock().unwrap();
        if let Some(ref info) = *cache {
            return info.clone();
        }
    }

    let mut cpu_name: Option<String> = None;
    let mut nvidia_gpu: Option<String> = None;
    let mut intel_gpu: Option<String> = None;
    let mut amd_gpu: Option<String> = None;

    #[cfg(windows)]
    {
        // 1. Query CPU Name from Registry
        let cpu_output = Command::new("reg")
            .args(["query", r"HKLM\HARDWARE\DESCRIPTION\System\CentralProcessor\0", "/v", "ProcessorNameString"])
            .creation_flags(0x08000000)
            .output();

        if let Ok(out) = cpu_output {
            if let Ok(text) = String::from_utf8(out.stdout) {
                for line in text.lines() {
                    if line.contains("ProcessorNameString") {
                        if let Some(idx) = line.find("REG_SZ") {
                            let name = line[idx + 6..].trim();
                            if !name.is_empty() {
                                cpu_name = Some(name.to_string());
                            }
                        }
                    }
                }
            }
        }

        // 2. Query Display Adapters (GPUs) from Registry
        let gpu_output = Command::new("reg")
            .args([
                "query",
                r"HKLM\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}",
                "/s",
                "/v",
                "DriverDesc",
            ])
            .creation_flags(0x08000000)
            .output();

        if let Ok(out) = gpu_output {
            if let Ok(text) = String::from_utf8(out.stdout) {
                for line in text.lines() {
                    if line.contains("DriverDesc") {
                        if let Some(idx) = line.find("REG_SZ") {
                            let desc = line[idx + 6..].trim();
                            let desc_lower = desc.to_lowercase();
                            if desc_lower.contains("nvidia")
                                || desc_lower.contains("geforce")
                                || desc_lower.contains("quadro")
                                || desc_lower.contains("rtx")
                                || desc_lower.contains("gtx")
                            {
                                if nvidia_gpu.is_none() {
                                    nvidia_gpu = Some(desc.to_string());
                                }
                            } else if desc_lower.contains("intel")
                                || desc_lower.contains("arc ")
                                || desc_lower.contains("iris")
                                || desc_lower.contains("uhd graphics")
                                || desc_lower.contains("hd graphics")
                            {
                                if intel_gpu.is_none() {
                                    intel_gpu = Some(desc.to_string());
                                }
                            } else if desc_lower.contains("amd")
                                || desc_lower.contains("radeon")
                            {
                                if amd_gpu.is_none() {
                                    amd_gpu = Some(desc.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let default_recommended = if nvidia_gpu.is_some() {
        "cuda".to_string()
    } else if intel_gpu.is_some() {
        "qsv".to_string()
    } else if amd_gpu.is_some() {
        "amf".to_string()
    } else {
        "cpu".to_string()
    };

    let result = HardwareInfo {
        cpu_name,
        nvidia_gpu,
        intel_gpu,
        amd_gpu,
        default_recommended,
    };

    let mut cache = HARDWARE_INFO_CACHE.lock().unwrap();
    *cache = Some(result.clone());
    result
}

#[tauri::command]
async fn get_hardware_info() -> HardwareInfo {
    tauri::async_runtime::spawn_blocking(move || get_hardware_info_internal())
        .await
        .unwrap_or_default()
}

fn strip_ansi_codes(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_escape = false;
    for c in s.chars() {
        if c == '\x1b' {
            in_escape = true;
        } else if in_escape {
            if c.is_ascii_alphabetic() {
                in_escape = false;
            }
        } else {
            out.push(c);
        }
    }
    out
}

fn extract_kv_value(line: &str, key: &str) -> Option<String> {
    if let Some(idx) = line.find(key) {
        let after_key = &line[idx + key.len()..];
        let trimmed = after_key.trim_start();
        let end = trimmed.find(|c: char| c.is_whitespace()).unwrap_or(trimmed.len());
        let val = trimmed[..end].trim();
        if !val.is_empty() && val != "N/A" {
            return Some(val.to_string());
        }
    }
    None
}

fn parse_duration_from_str(s: &str) -> Option<f64> {
    let target = if let Some(idx) = s.find("Duration: ") {
        let sub = &s[idx + 10..];
        let end = sub.find(',').unwrap_or(sub.len());
        sub[..end].trim()
    } else {
        s.trim()
    };
    if target.is_empty() || target == "N/A" {
        return None;
    }
    let parts: Vec<&str> = target.split(':').collect();
    if parts.len() == 3 {
        let h = parts[0].trim().parse::<f64>().ok()?;
        let m = parts[1].trim().parse::<f64>().ok()?;
        let s = parts[2].trim().parse::<f64>().ok()?;
        Some(h * 3600.0 + m * 60.0 + s)
    } else if parts.len() == 2 {
        let m = parts[0].trim().parse::<f64>().ok()?;
        let s = parts[1].trim().parse::<f64>().ok()?;
        Some(m * 60.0 + s)
    } else if let Ok(sec) = target.parse::<f64>() {
        Some(sec)
    } else {
        None
    }
}

fn format_seconds_to_hms(sec: f64) -> String {
    let s_total = sec.round() as u64;
    let h = s_total / 3600;
    let m = (s_total % 3600) / 60;
    let s = s_total % 60;
    if h > 0 {
        format!("{:02}:{:02}:{:02}", h, m, s)
    } else {
        format!("00:{:02}:{:02}", m, s)
    }
}

fn stream_lines<R: Read + Send + 'static, F: FnMut(String) + Send + 'static>(
    reader: R,
    mut on_line: F,
) {
    let mut buf = BufReader::new(reader);
    let mut line_bytes = Vec::new();
    let mut byte = [0u8; 1];

    while let Ok(n) = buf.read(&mut byte) {
        if n == 0 {
            break;
        }
        if CANCEL_REQUESTED.load(Ordering::SeqCst) {
            break;
        }
        let b = byte[0];
        if b == b'\n' || b == b'\r' {
            if !line_bytes.is_empty() {
                if let Ok(s) = String::from_utf8(line_bytes.clone()) {
                    let cleaned = strip_ansi_codes(&s);
                    let trimmed = cleaned.trim();
                    if !trimmed.is_empty() {
                        on_line(trimmed.to_string());
                    }
                }
                line_bytes.clear();
            }
        } else {
            line_bytes.push(b);
        }
    }
    if !line_bytes.is_empty() {
        if let Ok(s) = String::from_utf8(line_bytes) {
            let cleaned = strip_ansi_codes(&s);
            let trimmed = cleaned.trim();
            if !trimmed.is_empty() {
                on_line(trimmed.to_string());
            }
        }
    }
}

#[tauri::command]
fn execute_ffmpeg(
    app: tauri::AppHandle,
    args: Vec<String>,
    total_duration: f64,
) -> Result<(), String> {
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);

    std::thread::spawn(move || {
        let ffmpeg_bin = find_binary("ffmpeg");
        let mut cmd = Command::new(&ffmpeg_bin);
        cmd.args(&args);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        #[cfg(windows)]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit(
                    "ffmpeg-finished",
                    FinishPayload {
                        success: false,
                        exit_code: -1,
                        message: format!("Failed to spawn ffmpeg: {}", e),
                    },
                );
                return;
            }
        };

        let child_pid = child.id();
        {
            let mut pid_lock = RUNNING_CHILD_PID.lock().unwrap();
            *pid_lock = Some(child_pid);
        }

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let dur_arc = Arc::new(Mutex::new(total_duration));

        // Stdout reader for -progress pipe:1
        let app_out = app.clone();
        let dur_out = dur_arc.clone();
        let out_handle = std::thread::spawn(move || {
            if let Some(out) = stdout {
                let mut cur_time = "00:00:00".to_string();
                let mut cur_fps = "0".to_string();
                let mut cur_speed = "0x".to_string();
                let mut cur_bitrate = "0 kbits/s".to_string();
                let mut cur_pct = 0u32;
                let mut cur_sec = 0.0f64;

                stream_lines(out, move |line| {
                    if line.starts_with("out_time=") {
                        let t = line[9..].trim().to_string();
                        if !t.starts_with("N/A") {
                            if let Some(s) = parse_duration_from_str(&t) {
                                cur_sec = s;
                                cur_time = format_seconds_to_hms(s);
                            } else {
                                cur_time = t.clone();
                            }
                        }
                    } else if line.starts_with("out_time_us=") {
                        if let Ok(us) = line[12..].trim().parse::<f64>() {
                            cur_sec = us / 1_000_000.0;
                            cur_time = format_seconds_to_hms(cur_sec);
                        }
                    } else if line.starts_with("out_time_ms=") {
                        if let Ok(val) = line[12..].trim().parse::<f64>() {
                            cur_sec = if val > 1_000_000.0 { val / 1_000_000.0 } else { val / 1_000.0 };
                            cur_time = format_seconds_to_hms(cur_sec);
                        }
                    } else if line.starts_with("fps=") {
                        cur_fps = line[4..].trim().to_string();
                    } else if line.starts_with("speed=") {
                        cur_speed = line[6..].trim().to_string();
                    } else if line.starts_with("bitrate=") {
                        cur_bitrate = line[8..].trim().to_string();
                    } else if line.starts_with("progress=") {
                        let is_end = line.ends_with("end");
                        let total_dur = *dur_out.lock().unwrap();
                        let cur_eta = if is_end {
                            Some("00:00:00".to_string())
                        } else if total_dur > 0.0 && cur_sec > 0.0 {
                            let rem = (total_dur - cur_sec).max(0.0);
                            let sp = cur_speed.trim_end_matches('x').trim().parse::<f64>().unwrap_or(1.0).max(0.05);
                            Some(format_seconds_to_hms(rem / sp))
                        } else {
                            None
                        };

                        if is_end {
                            cur_pct = 100;
                        } else if total_dur > 0.0 && cur_sec > 0.0 {
                            cur_pct = ((cur_sec / total_dur) * 100.0).clamp(0.0, 99.0).round() as u32;
                        }

                        let _ = app_out.emit(
                            "ffmpeg-progress",
                            ProgressPayload {
                                time: cur_time.clone(),
                                eta: cur_eta,
                                fps: cur_fps.clone(),
                                speed: cur_speed.clone(),
                                bitrate: cur_bitrate.clone(),
                                pct: cur_pct,
                                playlist_item: None,
                                playlist_total: None,
                                current_item_title: None,
                            },
                        );
                    }
                });
            }
        });

        // Stderr reader for FFmpeg console logs and fallback progress
        let app_err = app.clone();
        let dur_err = dur_arc.clone();
        let err_handle = std::thread::spawn(move || {
            if let Some(err) = stderr {
                stream_lines(err, move |line| {
                    // Check for Duration header in stderr: "Duration: 00:01:23.45"
                    if line.contains("Duration:") {
                        if let Some(d) = parse_duration_from_str(&line) {
                            let mut d_lock = dur_err.lock().unwrap();
                            if *d_lock <= 0.0 {
                                *d_lock = d;
                            }
                        }
                    }

                    // Progress parsing from stderr line e.g.:
                    // frame=  120 fps= 30 q=28.0 size=    1024kB time=00:00:04.50 bitrate= 1864.0kbits/s speed= 1.5x
                    if line.contains("time=") && (line.contains("frame=") || line.contains("size=") || line.contains("bitrate=") || line.contains("speed=")) {
                        let parsed_time = extract_kv_value(&line, "time=");
                        let parsed_fps = extract_kv_value(&line, "fps=").unwrap_or_default();
                        let parsed_speed = extract_kv_value(&line, "speed=").unwrap_or_default();
                        let parsed_bitrate = extract_kv_value(&line, "bitrate=").unwrap_or_default();

                        if let Some(t_str) = parsed_time {
                            let mut cur_sec = 0.0f64;
                            let mut display_time = t_str.clone();
                            if let Some(s) = parse_duration_from_str(&t_str) {
                                cur_sec = s;
                                display_time = format_seconds_to_hms(s);
                            }

                            let total_dur = *dur_err.lock().unwrap();
                            let mut pct = 0u32;
                            let cur_eta = if total_dur > 0.0 && cur_sec > 0.0 {
                                let rem = (total_dur - cur_sec).max(0.0);
                                let sp = parsed_speed.trim_end_matches('x').trim().parse::<f64>().unwrap_or(1.0).max(0.05);
                                pct = ((cur_sec / total_dur) * 100.0).clamp(0.0, 99.0).round() as u32;
                                Some(format_seconds_to_hms(rem / sp))
                            } else {
                                None
                            };

                            let _ = app_err.emit(
                                "ffmpeg-progress",
                                ProgressPayload {
                                    time: display_time,
                                    eta: cur_eta,
                                    fps: parsed_fps,
                                    speed: parsed_speed,
                                    bitrate: parsed_bitrate,
                                    pct,
                                    playlist_item: None,
                                    playlist_total: None,
                                    current_item_title: None,
                                },
                            );
                        }
                    }

                    // Emit log line
                    let _ = app_err.emit("ffmpeg-log", LogPayload { line });
                });
            }
        });

        let status = child.wait();
        let _ = out_handle.join();
        let _ = err_handle.join();

        {
            let mut pid_lock = RUNNING_CHILD_PID.lock().unwrap();
            *pid_lock = None;
        }

        let was_cancelled = CANCEL_REQUESTED.load(Ordering::SeqCst);
        match status {
            Ok(exit_status) => {
                let code = exit_status.code().unwrap_or(if was_cancelled { -1 } else { 0 });
                let success = exit_status.success() && !was_cancelled;
                let msg = if was_cancelled {
                    "Operation cancelled by user".to_string()
                } else if success {
                    "Operation completed successfully".to_string()
                } else {
                    format!("FFmpeg exited with error code {}", code)
                };

                if success {
                    let _ = app.emit(
                        "ffmpeg-progress",
                        ProgressPayload {
                            time: "Completed".to_string(),
                            eta: Some("00:00:00".to_string()),
                            fps: "".to_string(),
                            speed: "".to_string(),
                            bitrate: "".to_string(),
                            pct: 100,
                            playlist_item: None,
                            playlist_total: None,
                            current_item_title: None,
                        },
                    );
                }

                let _ = app.emit(
                    "ffmpeg-finished",
                    FinishPayload {
                        success,
                        exit_code: code,
                        message: msg,
                    },
                );
            }
            Err(e) => {
                let _ = app.emit(
                    "ffmpeg-finished",
                    FinishPayload {
                        success: false,
                        exit_code: -1,
                        message: format!("Process error: {}", e),
                    },
                );
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn execute_ytdlp(app: tauri::AppHandle, args: Vec<String>) -> Result<(), String> {
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);

    std::thread::spawn(move || {
        let ytdlp_bin = find_binary("yt-dlp");
        let mut cmd = Command::new(&ytdlp_bin);
        // Force newline and no-colors mode for reliable stream progress parsing
        // (ytdlnis: --newline). Don't duplicate flags the frontend already sent.
        let mut full_args: Vec<String> = Vec::new();
        let has = |f: &str| args.iter().any(|a| a == f);
        if !has("--newline") {
            full_args.push("--newline".to_string());
        }
        if !has("--no-colors") && !has("--no-color") {
            full_args.push("--no-colors".to_string());
        }
        if !has("--progress") {
            full_args.push("--progress".to_string());
        }
        // Final filepath report (ytdlnis: --print after_move:'%(filepath)s').
        // Lets the UI show the real file instead of just the output folder.
        if !args.iter().any(|a| a == "after_move:filepath") && !args.iter().any(|a| a.contains("after_move")) {
            full_args.push("--print".to_string());
            full_args.push("after_move:filepath:%(filepath,_filename)s".to_string());
        }
        full_args.extend(args);
        cmd.args(&full_args);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        #[cfg(windows)]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit(
                    "ffmpeg-finished",
                    FinishPayload {
                        success: false,
                        exit_code: -1,
                        message: format!("Failed to spawn yt-dlp: {}", e),
                    },
                );
                return;
            }
        };

        let child_pid = child.id();
        {
            let mut pid_lock = RUNNING_CHILD_PID.lock().unwrap();
            *pid_lock = Some(child_pid);
        }

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        // Stdout reader for yt-dlp download progress and stdout logs.
        // NOTE: yt-dlp writes progress to stdout with --newline, but warnings,
        // fragment retries and some extractor logs go to stderr -- so both
        // threads below share the same parsing rules (ytdlnis: StreamGobbler).
        let app_out = app.clone();
        let out_handle = std::thread::spawn(move || {
            if let Some(out) = stdout {
                let mut cur_pct = 0u32;
                let mut cur_speed = String::new();
                let mut cur_eta = String::new();
                let mut cur_size = String::new();
                let mut cur_item = 0u32;
                let mut total_items = 0u32;
                let mut current_item_name = String::new();

                stream_lines(out, move |line| {
                    if CANCEL_REQUESTED.load(Ordering::SeqCst) {
                        return;
                    }

                    // Emit log line
                    let _ = app_out.emit("ffmpeg-log", LogPayload { line: line.clone() });

                    // Final filepath report: "filepath:/abs/path/file.mp4"
                    if let Some(path) = line.strip_prefix("filepath:") {
                        let path = path.trim();
                        if !path.is_empty() && path != "NA" {
                            let name = path.split(['/', '\\']).last().unwrap_or(path);
                            current_item_name = name.to_string();
                        }
                        return;
                    }

                    // Parse playlist / batch item progress: [download] Downloading item 3 of 12
                    if let Some(item_idx) = line.find("Downloading item ")
                        .or_else(|| line.find("Downloading video "))
                        .or_else(|| line.find("Downloading playlist item ")) {
                        let sub = &line[item_idx..];
                        let parts: Vec<&str> = sub.split_whitespace().collect();
                        if let Some(of_pos) = parts.iter().position(|&w| w == "of") {
                            if of_pos > 0 && of_pos + 1 < parts.len() {
                                let tot_raw = parts[of_pos + 1].trim_matches(|c| c == ',' || c == '.' || c == ')');
                                if let (Ok(cur), Ok(tot)) = (parts[of_pos - 1].parse::<u32>(), tot_raw.parse::<u32>()) {
                                    cur_item = cur;
                                    total_items = tot;
                                }
                            }
                        }
                    }

                    // Parse destination / downloading item title
                    if line.contains("[download] Destination: ") || line.contains("[ExtractAudio] Destination: ") {
                        if let Some(idx) = line.find("Destination: ") {
                            let path = line[idx + 13..].trim();
                            if !path.is_empty() {
                                let name = path.split(['/', '\\']).last().unwrap_or(path);
                                current_item_name = name.to_string();
                            }
                        }
                        return;
                    } else if line.contains("[Merger] Merging formats into \"") {
                        if let Some(idx) = line.find("into \"") {
                            let path = line[idx + 6..].trim().trim_matches('"');
                            if !path.is_empty() {
                                let name = path.split(['/', '\\']).last().unwrap_or(path);
                                current_item_name = name.to_string();
                            }
                        }
                        return;
                    } else if line.starts_with("[Info] ") && line.contains("Downloading") {
                        // e.g. "[Info] Downloading 1 format(s): 248+251" -- post-selection stage
                        let _ = app_out.emit(
                            "ffmpeg-progress",
                            ProgressPayload {
                                time: "Selecting formats...".to_string(),
                                eta: None,
                                fps: "".to_string(),
                                speed: cur_speed.clone(),
                                bitrate: cur_size.clone(),
                                pct: cur_pct.min(99),
                                playlist_item: if total_items > 0 { Some(cur_item) } else { None },
                                playlist_total: if total_items > 0 { Some(total_items) } else { None },
                                current_item_title: if !current_item_name.is_empty() { Some(current_item_name.clone()) } else { None },
                            },
                        );
                        return;
                    }

                    // Parse download percentage: [download]  45.2% of  120.50MiB at 12.34MiB/s ETA 00:05
                    // Or: [download] 100% of 15.00MiB in 00:02
                    // Skip non-progress lines like "[download] NA% ..." or fragment notices.
                    if line.contains("[download]") && line.contains('%') && !line.contains("NA%") {
                        if let Some(pct_idx) = line.find('%') {
                            let before = &line[..pct_idx];
                            let num_str: String = before.chars().rev().take_while(|c| c.is_ascii_digit() || *c == '.' || *c == ' ').collect();
                            let clean_num: String = num_str.chars().rev().collect();
                            if let Ok(pct) = clean_num.trim().parse::<f64>() {
                                cur_pct = pct.clamp(0.0, 100.0).round() as u32;
                            } else {
                                return;
                            }
                        } else {
                            return;
                        }

                        if let Some(at_idx) = line.find(" at ") {
                            let speed_part = &line[at_idx + 4..];
                            let end = speed_part.find(" ETA").unwrap_or(speed_part.len());
                            let s = speed_part[..end].trim();
                            if !s.is_empty() && s != "NA" {
                                cur_speed = s.to_string();
                            }
                        }

                        if let Some(eta_idx) = line.find(" ETA ") {
                            let e = line[eta_idx + 5..].trim();
                            if !e.is_empty() && e != "NA" {
                                cur_eta = e.to_string();
                            }
                        } else if line.contains(" in ") && cur_pct >= 100 {
                            cur_eta = "00:00:00".to_string();
                        }

                        if let Some(of_idx) = line.find(" of ") {
                            let size_part = &line[of_idx + 4..];
                            let end = size_part.find(" at ").or_else(|| size_part.find(" in ")).unwrap_or(size_part.len());
                            let s = size_part[..end].trim();
                            if !s.is_empty() && s != "NA" {
                                cur_size = s.to_string();
                            }
                        }

                        let eta_val = if !cur_eta.is_empty() && cur_eta != "--:--" && cur_eta != "NA" {
                            Some(cur_eta.clone())
                        } else {
                            None
                        };

                        let _ = app_out.emit(
                            "ffmpeg-progress",
                            ProgressPayload {
                                time: if cur_size.is_empty() { "Downloading...".to_string() } else { format!("Size: {}", cur_size) },
                                eta: eta_val,
                                fps: "".to_string(),
                                speed: cur_speed.clone(),
                                bitrate: cur_size.clone(),
                                pct: cur_pct.min(100),
                                playlist_item: if total_items > 0 { Some(cur_item) } else { None },
                                playlist_total: if total_items > 0 { Some(total_items) } else { None },
                                current_item_title: if !current_item_name.is_empty() { Some(current_item_name.clone()) } else { None },
                            },
                        );
                    } else if line.contains("[ExtractAudio] Not converting")
                        || line.contains("Deleting original file")
                        || (line.contains("[Merger]") && line.contains("Deleting"))
                        || line.contains("[EmbedThumbnail]")
                        || line.contains("[Metadata]")
                        || line.contains("[Subtitles]") {
                        // Genuine post-processing completion stages only (ytdlnis: keep at
                        // 99% until after_move). Never jump to 100% on "Destination" lines.
                        let stage = if line.contains("[ExtractAudio]") {
                            "Converting audio..."
                        } else if line.contains("[Merger]") {
                            "Merging formats..."
                        } else if line.contains("[EmbedThumbnail]") {
                            "Embedding thumbnail..."
                        } else if line.contains("[Metadata]") {
                            "Embedding metadata..."
                        } else if line.contains("[Subtitles]") {
                            "Embedding subtitles..."
                        } else {
                            "Finishing..."
                        };
                        cur_pct = 99;
                        let _ = app_out.emit(
                            "ffmpeg-progress",
                            ProgressPayload {
                                time: stage.to_string(),
                                eta: None,
                                fps: "".to_string(),
                                speed: cur_speed.clone(),
                                bitrate: cur_size.clone(),
                                pct: cur_pct,
                                playlist_item: if total_items > 0 { Some(cur_item) } else { None },
                                playlist_total: if total_items > 0 { Some(total_items) } else { None },
                                current_item_title: if !current_item_name.is_empty() { Some(current_item_name.clone()) } else { None },
                            },
                        );
                    }
                });
            }
        });

        // Stderr reader: yt-dlp errors AND progress lines (fragmented/aria2c output
        // also lands here). Parse progress identically, always forward logs.
        let app_err = app.clone();
        let err_handle = std::thread::spawn(move || {
            if let Some(err) = stderr {
                let cur_pct = std::sync::atomic::AtomicU32::new(0);
                let mut cur_speed = String::new();
                let mut cur_eta = String::new();
                let mut cur_size = String::new();
                stream_lines(err, move |line| {
                    let _ = app_err.emit("ffmpeg-log", LogPayload { line: line.clone() });
                    if CANCEL_REQUESTED.load(Ordering::SeqCst) {
                        return;
                    }
                    if line.contains("[download]") && line.contains('%') && !line.contains("NA%") {
                        if let Some(pct_idx) = line.find('%') {
                            let before = &line[..pct_idx];
                            let num_str: String = before.chars().rev().take_while(|c| c.is_ascii_digit() || *c == '.' || *c == ' ').collect();
                            let clean_num: String = num_str.chars().rev().collect();
                            if let Ok(pct) = clean_num.trim().parse::<f64>() {
                                cur_pct.store(pct.clamp(0.0, 100.0).round() as u32, Ordering::Relaxed);
                            } else {
                                return;
                            }
                        } else {
                            return;
                        }
                        if let Some(at_idx) = line.find(" at ") {
                            let speed_part = &line[at_idx + 4..];
                            let end = speed_part.find(" ETA").unwrap_or(speed_part.len());
                            let s = speed_part[..end].trim();
                            if !s.is_empty() && s != "NA" {
                                cur_speed = s.to_string();
                            }
                        }
                        if let Some(eta_idx) = line.find(" ETA ") {
                            let e = line[eta_idx + 5..].trim();
                            if !e.is_empty() && e != "NA" {
                                cur_eta = e.to_string();
                            }
                        }
                        if let Some(of_idx) = line.find(" of ") {
                            let size_part = &line[of_idx + 4..];
                            let end = size_part.find(" at ").or_else(|| size_part.find(" in ")).unwrap_or(size_part.len());
                            let s = size_part[..end].trim();
                            if !s.is_empty() && s != "NA" {
                                cur_size = s.to_string();
                            }
                        }
                        let eta_val = if !cur_eta.is_empty() && cur_eta != "--:--" && cur_eta != "NA" {
                            Some(cur_eta.clone())
                        } else {
                            None
                        };
                        let _ = app_err.emit(
                            "ffmpeg-progress",
                            ProgressPayload {
                                time: if cur_size.is_empty() { "Downloading...".to_string() } else { format!("Size: {}", cur_size) },
                                eta: eta_val,
                                fps: "".to_string(),
                                speed: cur_speed.clone(),
                                bitrate: cur_size.clone(),
                                pct: cur_pct.load(Ordering::Relaxed).min(100),
                                playlist_item: None,
                                playlist_total: None,
                                current_item_title: None,
                            },
                        );
                    }
                });
            }
        });


        let status = child.wait();
        let _ = out_handle.join();
        let _ = err_handle.join();

        {
            let mut pid_lock = RUNNING_CHILD_PID.lock().unwrap();
            *pid_lock = None;
        }

        let was_cancelled = CANCEL_REQUESTED.load(Ordering::SeqCst);
        match status {
            Ok(s) => {
                let success = s.success() && !was_cancelled;
                let exit_code = s.code().unwrap_or(if was_cancelled { -999 } else { 0 });
                let msg = if was_cancelled {
                    "Download cancelled by user".into()
                } else if success {
                    "Download completed successfully".into()
                } else {
                    format!("yt-dlp exited with code {}", exit_code)
                };

                if success {
                    let _ = app.emit(
                        "ffmpeg-progress",
                        ProgressPayload {
                            time: "Completed".to_string(),
                            eta: Some("00:00:00".to_string()),
                            fps: "".to_string(),
                            speed: "".to_string(),
                            bitrate: "".to_string(),
                            pct: 100,
                            playlist_item: None,
                            playlist_total: None,
                            current_item_title: None,
                        },
                    );
                }

                let _ = app.emit(
                    "ffmpeg-finished",
                    FinishPayload {
                        success,
                        exit_code,
                        message: msg,
                    },
                );
            }
            Err(e) => {
                let _ = app.emit(
                    "ffmpeg-finished",
                    FinishPayload {
                        success: false,
                        exit_code: -1,
                        message: format!("Process error: {}", e),
                    },
                );
            }
        }
    });

    Ok(())
}

fn find_image_ai_script(app: &tauri::AppHandle) -> std::path::PathBuf {
    let script_name = "image_ai_engine.py";
    let cwd = std::env::current_dir().unwrap_or_default();
    let candidates = [
        cwd.join("..").join("src").join("py").join(script_name),
        cwd.join("src").join("py").join(script_name),
        cwd.join("py").join(script_name),
    ];
    for p in &candidates {
        if p.exists() {
            return p.canonicalize().unwrap_or_else(|_| p.clone());
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            let exe_candidates = [
                parent.join("..").join("..").join("..").join("src").join("py").join(script_name),
                parent.join("..").join("..").join("src").join("py").join(script_name),
                parent.join("src").join("py").join(script_name),
                parent.join("py").join(script_name),
                parent.join("resources").join("src").join("py").join(script_name),
            ];
            for p in &exe_candidates {
                if p.exists() {
                    return p.canonicalize().unwrap_or_else(|_| p.clone());
                }
            }
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let res_candidates = [
            resource_dir.join("src").join("py").join(script_name),
            resource_dir.join("py").join(script_name),
            resource_dir.join(script_name),
        ];
        for p in &res_candidates {
            if p.exists() {
                return p.canonicalize().unwrap_or_else(|_| p.clone());
            }
        }
    }

    cwd.join("..").join("src").join("py").join(script_name)
}

#[tauri::command]
fn execute_image_ai(app: tauri::AppHandle, task: String, params: String) -> Result<(), String> {
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);

    let app_handle = app.clone();
    std::thread::spawn(move || {
        let python_bin = "python".to_string();
        let script_path = find_image_ai_script(&app_handle);

        let mut cmd = Command::new(&python_bin);
        cmd.args(["-u", &script_path.to_string_lossy(), "--task", &task, "--params", &params]);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        #[cfg(windows)]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit(
                    "ffmpeg-finished",
                    FinishPayload {
                        success: false,
                        exit_code: -1,
                        message: format!("Failed to spawn Python AI engine: {}", e),
                    },
                );
                return;
            }
        };

        let child_pid = child.id();
        {
            let mut pid_lock = RUNNING_CHILD_PID.lock().unwrap();
            *pid_lock = Some(child_pid);
        }

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let app_out = app.clone();
        let out_handle = std::thread::spawn(move || {
            if let Some(out) = stdout {
                stream_lines(out, move |line| {
                    if CANCEL_REQUESTED.load(Ordering::SeqCst) {
                        return;
                    }

                    if line.starts_with("ANEDIKIT_PROGRESS:") {
                        let json_str = &line["ANEDIKIT_PROGRESS:".len()..];
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                            let pct = val.get("pct").and_then(|p| p.as_u64()).unwrap_or(0) as u32;
                            let msg = val.get("msg").and_then(|m| m.as_str()).unwrap_or("").to_string();
                            let speed = val.get("speed").and_then(|s| s.as_str()).unwrap_or("").to_string();
                            let eta = val.get("eta").and_then(|e| e.as_str()).map(|s| s.to_string());
                            let bitrate = val.get("bitrate").and_then(|b| b.as_str()).unwrap_or("").to_string();

                            let _ = app_out.emit(
                                "ffmpeg-progress",
                                ProgressPayload {
                                    time: msg,
                                    eta,
                                    fps: "".into(),
                                    speed,
                                    bitrate,
                                    pct,
                                    playlist_item: None,
                                    playlist_total: None,
                                    current_item_title: None,
                                },
                            );
                        }
                    } else if !line.starts_with("ANEDIKIT_RESULT:") {
                        let _ = app_out.emit("ffmpeg-log", LogPayload { line });
                    }
                });
            }
        });

        let app_err = app.clone();
        let err_handle = std::thread::spawn(move || {
            if let Some(err) = stderr {
                stream_lines(err, move |line| {
                    if CANCEL_REQUESTED.load(Ordering::SeqCst) {
                        return;
                    }

                    if line.starts_with("ANEDIKIT_PROGRESS:") {
                        let json_str = &line["ANEDIKIT_PROGRESS:".len()..];
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                            let pct = val.get("pct").and_then(|p| p.as_u64()).unwrap_or(0) as u32;
                            let msg = val.get("msg").and_then(|m| m.as_str()).unwrap_or("").to_string();
                            let speed = val.get("speed").and_then(|s| s.as_str()).unwrap_or("").to_string();
                            let eta = val.get("eta").and_then(|e| e.as_str()).map(|s| s.to_string());
                            let bitrate = val.get("bitrate").and_then(|b| b.as_str()).unwrap_or("").to_string();

                            let _ = app_err.emit(
                                "ffmpeg-progress",
                                ProgressPayload {
                                    time: msg,
                                    eta,
                                    fps: "".into(),
                                    speed,
                                    bitrate,
                                    pct,
                                    playlist_item: None,
                                    playlist_total: None,
                                    current_item_title: None,
                                },
                            );
                        }
                    } else if line.contains('%') && (line.contains("MB/s") || line.contains("kB/s") || line.contains("B/s") || line.contains("it/s")) {
                        // Fallback parsing for raw tqdm progress outputs on stderr
                        let mut cur_pct = 0u32;
                        if let Some(pct_idx) = line.find('%') {
                            let before = &line[..pct_idx];
                            let num_str: String = before.chars().rev().take_while(|c| c.is_digit(10) || *c == '.' || *c == ' ').collect();
                            let clean_num: String = num_str.chars().rev().collect();
                            if let Ok(pct) = clean_num.trim().parse::<f64>() {
                                cur_pct = pct.clamp(0.0, 100.0).round() as u32;
                            }
                        }

                        let mut cur_speed = String::new();
                        if let Some(speed_idx) = line.rfind(", ") {
                            let sub = &line[speed_idx + 2..];
                            if let Some(end_idx) = sub.find(']') {
                                cur_speed = sub[..end_idx].trim().to_string();
                            }
                        }

                        let mut cur_eta: Option<String> = None;
                        if let Some(open_bracket) = line.find('[') {
                            let sub = &line[open_bracket + 1..];
                            if let Some(lt_idx) = sub.find('<') {
                                let eta_part = &sub[lt_idx + 1..];
                                if let Some(comma_idx) = eta_part.find(',') {
                                    let eta_str = eta_part[..comma_idx].trim();
                                    if !eta_str.is_empty() && eta_str != "--:--" {
                                        cur_eta = Some(eta_str.to_string());
                                    }
                                }
                            }
                        }

                        let mut cur_size = String::new();
                        if let Some(pipe_idx) = line.rfind('|') {
                            let sub = &line[pipe_idx + 1..];
                            if let Some(bracket_idx) = sub.find('[') {
                                cur_size = sub[..bracket_idx].trim().to_string();
                            }
                        }

                        let time_label = if !cur_size.is_empty() {
                            format!("Downloading Model: {}", cur_size)
                        } else {
                            format!("Downloading Model... ({}%)", cur_pct)
                        };

                        let _ = app_err.emit(
                            "ffmpeg-progress",
                            ProgressPayload {
                                time: time_label,
                                eta: cur_eta,
                                fps: "".into(),
                                speed: cur_speed,
                                bitrate: cur_size,
                                pct: cur_pct,
                                playlist_item: None,
                                playlist_total: None,
                                current_item_title: None,
                            },
                        );
                    }

                    let _ = app_err.emit("ffmpeg-log", LogPayload { line });
                });
            }
        });

        let status = child.wait();
        let _ = out_handle.join();
        let _ = err_handle.join();

        {
            let mut pid_lock = RUNNING_CHILD_PID.lock().unwrap();
            *pid_lock = None;
        }

        let was_cancelled = CANCEL_REQUESTED.load(Ordering::SeqCst);
        match status {
            Ok(s) => {
                let code = s.code().unwrap_or(0);
                let success = s.success() && !was_cancelled;
                let msg = if was_cancelled {
                    "Operation cancelled by user".to_string()
                } else if success {
                    "Task completed successfully".to_string()
                } else {
                    format!("AI engine exited with code {}", code)
                };

                if success {
                    let _ = app.emit(
                        "ffmpeg-progress",
                        ProgressPayload {
                            time: "Completed".to_string(),
                            eta: Some("00:00:00".to_string()),
                            fps: "".to_string(),
                            speed: "".to_string(),
                            bitrate: "".to_string(),
                            pct: 100,
                            playlist_item: None,
                            playlist_total: None,
                            current_item_title: None,
                        },
                    );
                }

                let _ = app.emit(
                    "ffmpeg-finished",
                    FinishPayload {
                        success,
                        exit_code: code,
                        message: msg,
                    },
                );
            }
            Err(e) => {
                let _ = app.emit(
                    "ffmpeg-finished",
                    FinishPayload {
                        success: false,
                        exit_code: -1,
                        message: format!("Process error: {}", e),
                    },
                );
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn is_job_active() -> bool {
    let pid_lock = RUNNING_CHILD_PID.lock().unwrap();
    pid_lock.is_some()
}

#[tauri::command]
fn force_exit_app(app: tauri::AppHandle) {
    let mut pid_lock = RUNNING_CHILD_PID.lock().unwrap();
    if let Some(pid) = *pid_lock {
        #[cfg(windows)]
        {
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/F", "/T"])
                .creation_flags(0x08000000)
                .output();
        }
        #[cfg(not(windows))]
        {
            let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
        }
        *pid_lock = None;
    }
    app.exit(0);
}

#[tauri::command]
fn open_file(file_path: String) -> Result<(), String> {
    let decoded = percent_decode_path(&file_path);
    let path = std::path::Path::new(&decoded);
    if !path.exists() {
        return Err("File does not exist".into());
    }
    #[cfg(windows)]
    {
        let _ = Command::new("cmd")
            .args(["/C", "start", "", &decoded])
            .creation_flags(0x08000000)
            .spawn();
    }
    Ok(())
}

#[tauri::command]
fn show_in_folder(file_path: String) -> Result<(), String> {
    let decoded = percent_decode_path(&file_path);
    let path = std::path::Path::new(&decoded);
    #[cfg(windows)]
    {
        if path.is_dir() {
            // Open the folder itself, not its parent.
            let _ = Command::new("explorer")
                .arg(&decoded)
                .creation_flags(0x08000000)
                .spawn();
        } else if path.is_file() {
            // "/select,<file>" must be ONE argument -- split args make
            // explorer ignore /select and just open the parent folder.
            let _ = Command::new("explorer")
                .arg(format!("/select,{}", decoded))
                .creation_flags(0x08000000)
                .spawn();
        } else if let Some(parent) = path.parent() {
            // Target missing (e.g. not finished yet): fall back to closest
            // existing ancestor instead of erroring out.
            let mut ancestor = parent;
            loop {
                if ancestor.exists() {
                    let _ = Command::new("explorer")
                        .arg(ancestor.to_string_lossy().as_ref())
                        .creation_flags(0x08000000)
                        .spawn();
                    break;
                }
                match ancestor.parent() {
                    Some(p) if p != ancestor => ancestor = p,
                    _ => return Err("Path does not exist".into()),
                }
            }
        } else {
            return Err("Path does not exist".into());
        }
    }
    Ok(())
}

fn update_tool_internal(tool_name: String) -> Result<String, String> {
    // Clear binary path cache so version checks re-evaluate
    {
        let mut cache = BINARY_PATH_CACHE.lock().unwrap();
        *cache = None;
    }

    let clean_name = tool_name.trim().to_lowercase().replace('_', "-");
    match clean_name.as_str() {
        "yt-dlp" | "ytdlp" => {
            let bin = find_binary("yt-dlp");
            if bin == "yt-dlp" && !std::path::Path::new(&bin).is_file() {
                return Err("yt-dlp executable not found on system or in local app data".into());
            }

            let mut cmd = Command::new(&bin);
            cmd.arg("-U");
            #[cfg(windows)]
            cmd.creation_flags(0x08000000);

            let out = cmd.output().map_err(|e| format!("Failed to execute yt-dlp update: {}", e))?;
            let stdout_str = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr_str = String::from_utf8_lossy(&out.stderr).to_string();
            let combined = format!("{}\n{}", stdout_str.trim(), stderr_str.trim()).trim().to_string();

            // Clear cache again after update so version query sees the fresh binary
            {
                let mut cache = BINARY_PATH_CACHE.lock().unwrap();
                *cache = None;
            }

            if out.status.success() {
                Ok(if combined.is_empty() {
                    "yt-dlp update check completed successfully".into()
                } else {
                    combined
                })
            } else {
                Err(if combined.is_empty() {
                    format!("yt-dlp update failed with exit code {:?}", out.status.code())
                } else {
                    combined
                })
            }
        }
        "deno" => {
            let target_dir = if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
                std::path::PathBuf::from(local_app_data)
                    .join("ASDK")
                    .join("Shared")
                    .join("bin")
            } else {
                return Err("LOCALAPPDATA directory environment variable not found".into());
            };
            std::fs::create_dir_all(&target_dir).map_err(|e| format!("Failed to create bin folder: {}", e))?;

            let temp_dir = std::env::temp_dir();
            let zip_path = temp_dir.join("deno_update.zip");
            let _ = std::fs::remove_file(&zip_path);

            // Fetch Deno latest release zip from GitHub
            let download_url = "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip";
            let mut curl_cmd = Command::new("curl.exe");
            curl_cmd.args([
                "-fL",
                "--retry", "3",
                "--retry-delay", "2",
                "-o",
                zip_path.to_string_lossy().as_ref(),
                download_url,
            ]);
            #[cfg(windows)]
            curl_cmd.creation_flags(0x08000000);

            let curl_out = curl_cmd.output().map_err(|e| format!("Failed to run curl: {}", e))?;
            if !curl_out.status.success() || !zip_path.exists() {
                let err_msg = String::from_utf8_lossy(&curl_out.stderr).to_string();
                let _ = std::fs::remove_file(&zip_path);
                return Err(format!("Failed to download Deno from GitHub: {}", err_msg.trim()));
            }

            // Extract deno.exe into destination bin folder using bsdtar
            let mut tar_cmd = Command::new("tar.exe");
            tar_cmd.args([
                "-xf",
                zip_path.to_string_lossy().as_ref(),
                "-C",
                target_dir.to_string_lossy().as_ref(),
                "deno.exe",
            ]);
            #[cfg(windows)]
            tar_cmd.creation_flags(0x08000000);

            let tar_out = tar_cmd.output().map_err(|e| format!("Failed to run tar: {}", e))?;
            let _ = std::fs::remove_file(&zip_path);

            if !tar_out.status.success() {
                let err_msg = String::from_utf8_lossy(&tar_out.stderr).to_string();
                return Err(format!("Failed to extract Deno archive: {}", err_msg.trim()));
            }

            // Clear binary path cache
            {
                let mut cache = BINARY_PATH_CACHE.lock().unwrap();
                *cache = None;
            }

            Ok("Deno successfully downloaded and updated from GitHub releases.".into())
        }
        "ffmpeg" | "ffprobe" => {
            let target_dir = if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
                std::path::PathBuf::from(local_app_data)
                    .join("ASDK")
                    .join("Shared")
                    .join("bin")
            } else {
                return Err("LOCALAPPDATA directory environment variable not found".into());
            };
            std::fs::create_dir_all(&target_dir).map_err(|e| format!("Failed to create bin folder: {}", e))?;

            let temp_dir = std::env::temp_dir();
            let zip_path = temp_dir.join("ffmpeg_update.zip");
            let extract_tmp_dir = temp_dir.join("ffmpeg_update_extracted");
            let _ = std::fs::remove_file(&zip_path);
            let _ = std::fs::remove_dir_all(&extract_tmp_dir);
            let _ = std::fs::create_dir_all(&extract_tmp_dir);

            // Primary source: BtbN/FFmpeg-Builds latest master GPL build
            let primary_url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";
            let mut curl_cmd = Command::new("curl.exe");
            curl_cmd.args([
                "-fL",
                "--retry", "2",
                "--retry-delay", "1",
                "-o",
                zip_path.to_string_lossy().as_ref(),
                primary_url,
            ]);
            #[cfg(windows)]
            curl_cmd.creation_flags(0x08000000);

            let mut curl_out = curl_cmd.output().map_err(|e| format!("Failed to run curl: {}", e))?;
            let mut used_fallback = false;

            // Alternative fallback source: ffbinaries/ffbinaries-prebuilt
            if !curl_out.status.success() || !zip_path.exists() {
                used_fallback = true;
                let fallback_ffmpeg = "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-win-64.zip";
                let fallback_ffprobe = "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffprobe-6.1-win-64.zip";

                let mut fb_cmd = Command::new("curl.exe");
                fb_cmd.args([
                    "-fL",
                    "--retry", "2",
                    "--retry-delay", "1",
                    "-o",
                    zip_path.to_string_lossy().as_ref(),
                    fallback_ffmpeg,
                ]);
                #[cfg(windows)]
                fb_cmd.creation_flags(0x08000000);

                curl_out = fb_cmd.output().map_err(|e| format!("Failed to run curl for fallback: {}", e))?;

                // Also download ffprobe zip
                let probe_zip = temp_dir.join("ffprobe_fallback.zip");
                let mut probe_cmd = Command::new("curl.exe");
                probe_cmd.args([
                    "-fL",
                    "--retry", "2",
                    "--retry-delay", "1",
                    "-o",
                    probe_zip.to_string_lossy().as_ref(),
                    fallback_ffprobe,
                ]);
                #[cfg(windows)]
                probe_cmd.creation_flags(0x08000000);
                if let Ok(probe_out) = probe_cmd.output() {
                    if probe_out.status.success() && probe_zip.exists() {
                        let mut tar_probe = Command::new("tar.exe");
                        tar_probe.args([
                            "-xf",
                            probe_zip.to_string_lossy().as_ref(),
                            "-C",
                            target_dir.to_string_lossy().as_ref(),
                        ]);
                        #[cfg(windows)]
                        tar_probe.creation_flags(0x08000000);
                        let _ = tar_probe.output();
                    }
                }
                let _ = std::fs::remove_file(&probe_zip);
            }

            if !curl_out.status.success() || !zip_path.exists() {
                let err_msg = String::from_utf8_lossy(&curl_out.stderr).to_string();
                let _ = std::fs::remove_file(&zip_path);
                let _ = std::fs::remove_dir_all(&extract_tmp_dir);
                return Err(format!("Failed to download FFmpeg from primary and alternative GitHub sources: {}", err_msg.trim()));
            }

            // Extract archive into temp folder or directly into target folder
            let extract_dest = if used_fallback {
                target_dir.to_string_lossy().to_string()
            } else {
                extract_tmp_dir.to_string_lossy().to_string()
            };

            let mut tar_cmd = Command::new("tar.exe");
            tar_cmd.args([
                "-xf",
                zip_path.to_string_lossy().as_ref(),
                "-C",
                &extract_dest,
            ]);
            #[cfg(windows)]
            tar_cmd.creation_flags(0x08000000);

            let tar_out = tar_cmd.output().map_err(|e| format!("Failed to run tar: {}", e))?;
            let _ = std::fs::remove_file(&zip_path);

            if !tar_out.status.success() {
                let _ = std::fs::remove_dir_all(&extract_tmp_dir);
                let err_msg = String::from_utf8_lossy(&tar_out.stderr).to_string();
                return Err(format!("Failed to extract FFmpeg archive: {}", err_msg.trim()));
            }

            if !used_fallback {
                // Locate ffmpeg.exe and ffprobe.exe inside extracted directory structure and copy to destination
                let mut found_ffmpeg = false;
                let mut found_ffprobe = false;
                if let Ok(entries) = std::fs::read_dir(&extract_tmp_dir) {
                    for entry in entries.flatten() {
                        let sub_bin = entry.path().join("bin");
                        if sub_bin.is_dir() {
                            let src_ffmpeg = sub_bin.join("ffmpeg.exe");
                            let src_ffprobe = sub_bin.join("ffprobe.exe");
                            if src_ffmpeg.is_file() {
                                let _ = std::fs::copy(&src_ffmpeg, target_dir.join("ffmpeg.exe"));
                                found_ffmpeg = true;
                            }
                            if src_ffprobe.is_file() {
                                let _ = std::fs::copy(&src_ffprobe, target_dir.join("ffprobe.exe"));
                                found_ffprobe = true;
                            }
                        }
                    }
                }

                let _ = std::fs::remove_dir_all(&extract_tmp_dir);

                if !found_ffmpeg && !found_ffprobe {
                    return Err("Could not locate ffmpeg/ffprobe binaries in downloaded release archive.".into());
                }
            } else {
                let _ = std::fs::remove_dir_all(&extract_tmp_dir);
            }

            // Clear binary path cache
            {
                let mut cache = BINARY_PATH_CACHE.lock().unwrap();
                *cache = None;
            }

            Ok(if used_fallback {
                "FFmpeg & FFprobe successfully updated from alternative GitHub release source (ffbinaries).".into()
            } else {
                "FFmpeg & FFprobe successfully updated from latest GitHub release.".into()
            })
        }
        _ => Err(format!("Automatic update is not supported for {}.", tool_name)),
    }
}

#[tauri::command]
async fn update_tool(tool_name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || update_tool_internal(tool_name))
        .await
        .map_err(|e| format!("Update task failed: {}", e))?
}

#[tauri::command]
fn open_binaries_folder() -> Result<(), String> {
    let bin_dir = if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        std::path::PathBuf::from(local_app_data)
            .join("ASDK")
            .join("Shared")
            .join("bin")
    } else {
        std::path::PathBuf::from(r"C:\ffmpeg\bin")
    };
    let _ = std::fs::create_dir_all(&bin_dir);
    #[cfg(windows)]
    {
        let _ = Command::new("explorer")
            .arg(&bin_dir)
            .creation_flags(0x08000000)
            .spawn();
    }
    Ok(())
}

#[tauri::command]
fn send_system_notification(title: String, body: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let escaped_title = title.replace('"', "`\"");
        let escaped_body = body.replace('"', "`\"");
        let script = format!(
            "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; \
            $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); \
            $textNodes = $template.GetElementsByTagName('text'); \
            $textNodes.Item(0).AppendChild($template.CreateTextNode(\"{}\")) > $null; \
            $textNodes.Item(1).AppendChild($template.CreateTextNode(\"{}\")) > $null; \
            $toast = [Windows.UI.Notifications.ToastNotification]::new($template); \
            [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('AnEdiKit').Show($toast);",
            escaped_title, escaped_body
        );
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script]);
        cmd.creation_flags(0x08000000);
        let _ = cmd.spawn();
    }
    Ok(())
}

fn get_thumb_cache_dir(subfolder: &str) -> std::path::PathBuf {
    let base = if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        std::path::PathBuf::from(local_app_data)
            .join("ASDK")
            .join("AnEdiKit")
            .join("ThumbCache")
            .join(subfolder)
    } else {
        std::env::temp_dir().join("ASDK_AnEdiKit_ThumbCache").join(subfolder)
    };
    let _ = std::fs::create_dir_all(&base);
    base
}

fn compute_file_hash(path: &std::path::Path) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    path.to_string_lossy().hash(&mut hasher);

    if let Ok(metadata) = std::fs::metadata(path) {
        metadata.len().hash(&mut hasher);
        if let Ok(modified) = metadata.modified() {
            modified.hash(&mut hasher);
        }
    }

    format!("{:016x}", hasher.finish())
}

fn extract_album_art_internal(file_path: &str) -> Option<String> {
    let path = std::path::Path::new(file_path);
    if !path.exists() {
        return None;
    }

    let cache_dir = get_thumb_cache_dir("Audio");
    let hash = compute_file_hash(path);
    let cache_file = cache_dir.join(format!("{}.jpg", hash));

    if cache_file.exists() {
        if let Ok(bytes) = std::fs::read(&cache_file) {
            if !bytes.is_empty() {
                use base64::Engine;
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                return Some(format!("data:image/jpeg;base64,{}", b64));
            }
        }
    }

    let ffmpeg_bin = find_binary("ffmpeg");
    let mut cmd = Command::new(&ffmpeg_bin);
    cmd.args([
        "-y",
        "-i",
        file_path,
        "-an",
        "-vcodec",
        "mjpeg",
        "-q:v",
        "2",
        cache_file.to_string_lossy().as_ref(),
    ]);

    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    if let Ok(output) = cmd.output() {
        if output.status.success() && cache_file.exists() {
            if let Ok(bytes) = std::fs::read(&cache_file) {
                if !bytes.is_empty() {
                    use base64::Engine;
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    return Some(format!("data:image/jpeg;base64,{}", b64));
                }
            }
        }
    }
    None
}

#[tauri::command]
async fn extract_album_art(file_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        extract_album_art_internal(&file_path).ok_or_else(|| "No album art found".into())
    })
    .await
    .map_err(|e| format!("Async task execution failed: {}", e))?
}

fn extract_action_frame_internal(file_path: String, duration_seconds: Option<f64>) -> Result<String, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err("File does not exist".into());
    }

    let cache_dir = get_thumb_cache_dir("Video");
    let hash = compute_file_hash(path);
    let cache_file = cache_dir.join(format!("{}.jpg", hash));

    // Instant return if thumbnail exists in persistent disk cache
    if cache_file.exists() {
        if let Ok(bytes) = std::fs::read(&cache_file) {
            if !bytes.is_empty() {
                use base64::Engine;
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                return Ok(format!("data:image/jpeg;base64,{}", b64));
            }
        }
    }

    let ffmpeg_bin = find_binary("ffmpeg");
    let dur = duration_seconds.unwrap_or(10.0);
    // Seek into video to avoid black intro frames (~15% or 3s)
    let target_time = if dur > 20.0 {
        (dur * 0.15).min(15.0)
    } else if dur > 2.0 {
        1.0
    } else {
        0.0
    };

    let mut cmd = Command::new(&ffmpeg_bin);
    cmd.args([
        "-y",
        "-ss",
        &format!("{:.3}", target_time),
        "-i",
        &file_path,
        "-vframes",
        "1",
        "-vf",
        "scale=640:-1",
        "-q:v",
        "3",
        cache_file.to_string_lossy().as_ref(),
    ]);

    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd.output().map_err(|e| format!("Failed to run ffmpeg: {}", e))?;
    if !output.status.success() || !cache_file.exists() {
        return Err("Failed to extract action frame".into());
    }

    let bytes = std::fs::read(&cache_file).map_err(|e| format!("Failed to read cached frame: {}", e))?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

#[tauri::command]
async fn extract_action_frame(file_path: String, duration_seconds: Option<f64>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        extract_action_frame_internal(file_path, duration_seconds)
    })
    .await
    .map_err(|e| format!("Async task execution failed: {}", e))?
}

fn extract_timeline_thumbnails_internal(
    file_path: String,
    count: Option<usize>,
    duration_seconds: Option<f64>,
) -> Result<Vec<String>, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err("File does not exist".into());
    }

    let num_frames = count.unwrap_or(12).clamp(4, 24);
    let cache_dir = get_thumb_cache_dir("Timeline");
    let hash = compute_file_hash(path);

    // Check if cached frames already exist on disk
    let mut cached_results = Vec::new();
    let mut all_exist = true;
    use base64::Engine;

    for i in 1..=num_frames {
        let frame_file = cache_dir.join(format!("{}_{:03}.jpg", hash, i));
        if frame_file.exists() {
            if let Ok(bytes) = std::fs::read(&frame_file) {
                if !bytes.is_empty() {
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    cached_results.push(format!("data:image/jpeg;base64,{}", b64));
                    continue;
                }
            }
        }
        all_exist = false;
        break;
    }

    if all_exist && cached_results.len() == num_frames {
        return Ok(cached_results);
    }

    // Generate thumbnails using FFmpeg
    let ffmpeg_bin = find_binary("ffmpeg");
    let dur = duration_seconds.unwrap_or(10.0).max(0.5);
    let pattern = cache_dir.join(format!("{}_%03d.jpg", hash));

    // fps = num_frames / dur
    let fps_filter = format!(
        "fps={:.5}/{},scale=160:90:force_original_aspect_ratio=increase,crop=160:90",
        num_frames, dur
    );

    let mut cmd = Command::new(&ffmpeg_bin);
    cmd.args([
        "-y",
        "-i",
        &file_path,
        "-vf",
        &fps_filter,
        "-vframes",
        &num_frames.to_string(),
        "-q:v",
        "4",
        pattern.to_string_lossy().as_ref(),
    ]);

    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd.output().map_err(|e| format!("Failed to run ffmpeg: {}", e))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(if err.trim().is_empty() {
            "Failed to extract timeline thumbnails".into()
        } else {
            err.to_string()
        });
    }

    let mut results = Vec::new();
    for i in 1..=num_frames {
        let frame_file = cache_dir.join(format!("{}_{:03}.jpg", hash, i));
        if frame_file.exists() {
            if let Ok(bytes) = std::fs::read(&frame_file) {
                if !bytes.is_empty() {
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    results.push(format!("data:image/jpeg;base64,{}", b64));
                }
            }
        }
    }

    if results.is_empty() {
        return Err("No timeline thumbnails generated".into());
    }

    Ok(results)
}

#[tauri::command]
async fn extract_timeline_thumbnails(
    file_path: String,
    count: Option<usize>,
    duration_seconds: Option<f64>,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        extract_timeline_thumbnails_internal(file_path, count, duration_seconds)
    })
    .await
    .map_err(|e| format!("Async task execution failed: {}", e))?
}

fn fetch_playlist_videos_internal(url: String) -> Result<Vec<PlaylistVideo>, String> {
    if url.trim().is_empty() {
        return Err("Please enter a valid playlist or video URL".into());
    }
    let ytdlp_bin = find_binary("yt-dlp");
    let mut cmd = Command::new(&ytdlp_bin);
    // ytdlnis-style fetch: JSON lines survive tabs/newlines in titles, --flat-playlist
    // keeps it fast, --ignore-errors/--no-warnings keep one bad item from killing
    // the whole list, extractor-args dodges the YouTube bot-check.
    // music.youtube.com uses the web_music client, whose https formats require a
    // GVS PO token -- forcing web* clients there only yields PO-token warnings.
    let extractor_clients = if url.trim().contains("music.youtube.com") {
        "youtube:player_client=android,ios"
    } else {
        "youtube:player_client=android,web"
    };
    cmd.args([
        "-j",
        "--flat-playlist",
        "--lazy-playlist",
        "--ignore-errors",
        "--no-warnings",
        "-R",
        "1",
        "--socket-timeout",
        "15",
        "--compat-options",
        "manifest-filesize-approx",
        "--extractor-args",
        extractor_clients,
        url.trim(),
    ]);

    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let stderr_str = String::from_utf8_lossy(&output.stderr);

    let mut entries = Vec::new();
    let mut idx = 1;

    // Primary: one JSON object per line (-j). Robust against tabs/quotes in titles
    // (the old TSV split broke on those) and against %(url)s == NA in flat mode.
    for line in stdout_str.lines() {
        let line = line.trim();
        if line.is_empty() || !line.starts_with('{') {
            continue;
        }
        let parsed: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if parsed.get("_type").and_then(|t| t.as_str()) == Some("playlist")
            && parsed.get("entries").is_some()
        {
            continue;
        }
        let title_raw = parsed
            .get("title")
            .and_then(|t| t.as_str())
            .or_else(|| parsed.get("alt_title").and_then(|t| t.as_str()))
            .unwrap_or("");
        if title_raw == "[Private video]" || title_raw == "[Deleted video]" || title_raw.is_empty() {
            // Keep numbering stable but skip unusable entries like ytdlnis does.
            if title_raw == "[Private video]" || title_raw == "[Deleted video]" {
                idx += 1;
                continue;
            }
        }
        let title = if title_raw.is_empty() {
            format!("Video {}", idx)
        } else {
            title_raw.to_string()
        };
        // Flat playlist often reports url == NA; fall back through webpage_url chain,
        // then synthesize a watch URL from the id (ytdlnis: webpage_url/original_url/url).
        let id = parsed
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let url_str = parsed
            .get("webpage_url")
            .and_then(|v| v.as_str())
            .or_else(|| parsed.get("original_url").and_then(|v| v.as_str()))
            .or_else(|| parsed.get("url").and_then(|v| v.as_str()))
            .filter(|u| !u.is_empty() && *u != "NA")
            .map(|u| u.to_string())
            .unwrap_or_else(|| {
                if !id.is_empty() && !id.starts_with("http") {
                    format!("https://www.youtube.com/watch?v={}", id)
                } else if !id.is_empty() {
                    id.clone()
                } else {
                    url.trim().to_string()
                }
            });
        // Flat mode has no durations (NA/null) -- leave None instead of 0 (ytdlnis).
        let dur = parsed
            .get("duration")
            .and_then(|v| v.as_f64())
            .filter(|d| *d > 0.0);

        let duration_string = dur.map(|d| {
            let total_sec = d.round() as u64;
            let h = total_sec / 3600;
            let m = (total_sec % 3600) / 60;
            let s = total_sec % 60;
            if h > 0 {
                format!("{:02}:{:02}:{:02}", h, m, s)
            } else {
                format!("{:02}:{:02}", m, s)
            }
        });

        entries.push(PlaylistVideo {
            index: idx,
            id,
            title,
            url: url_str,
            duration: dur,
            duration_string,
        });
        idx += 1;
    }

    // Fallback: legacy TSV print (older yt-dlp without -j quirks) so we never
    // return empty when stdout had content but JSON parsing found nothing.
    if entries.is_empty() && !stdout_str.trim().is_empty() {
        idx = 1;
        for line in stdout_str.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('{') {
                continue;
            }
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.is_empty() {
                continue;
            }
            let id = parts[0].to_string();
            let title = if parts.len() > 1 && !parts[1].is_empty() && parts[1] != "NA" {
                parts[1].to_string()
            } else {
                format!("Video {}", idx)
            };
            let url_str = if parts.len() > 2 && !parts[2].is_empty() && parts[2] != "NA" {
                parts[2].to_string()
            } else if !id.is_empty() && !id.starts_with("http") {
                format!("https://www.youtube.com/watch?v={}", id)
            } else {
                id.clone()
            };
            let dur = if parts.len() > 3 {
                parts[3].parse::<f64>().ok().filter(|d| *d > 0.0)
            } else {
                None
            };

            let duration_string = dur.map(|d| {
                let total_sec = d.round() as u64;
                let h = total_sec / 3600;
                let m = (total_sec % 3600) / 60;
                let s = total_sec % 60;
                if h > 0 {
                    format!("{:02}:{:02}:{:02}", h, m, s)
                } else {
                    format!("{:02}:{:02}", m, s)
                }
            });

            entries.push(PlaylistVideo {
                index: idx,
                id,
                title,
                url: url_str,
                duration: dur,
                duration_string,
            });
            idx += 1;
        }
    }

    if entries.is_empty() {
        // Surface yt-dlp's own error (bot-check, private playlist, bad URL) but
        // trimmed -- raw stderr can be an HTML dump (ytdlnis logs it separately).
        let err_line = stderr_str
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty())
            .filter(|l| !l.starts_with("WARNING"))
            .next()
            .unwrap_or("")
            .chars()
            .take(300)
            .collect::<String>();
        if output.status.success() || err_line.is_empty() {
            return Err("No videos found in the specified URL / playlist".into());
        }
        return Err(format!("yt-dlp: {}", err_line));
    }

    Ok(entries)
}

#[tauri::command]
async fn fetch_playlist_videos(url: String) -> Result<Vec<PlaylistVideo>, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_playlist_videos_internal(url))
        .await
        .map_err(|e| format!("Async task execution failed: {}", e))?
}

fn extract_timeline_frame_internal(
    file_path: String,
    frame_index: usize,
    timestamp_seconds: f64,
) -> Result<String, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err("File does not exist".into());
    }

    let cache_dir = get_thumb_cache_dir("Timeline");
    let hash = compute_file_hash(path);
    let frame_file = cache_dir.join(format!("{}_{:03}.jpg", hash, frame_index));

    use base64::Engine;

    // Check disk cache first
    if frame_file.exists() {
        if let Ok(bytes) = std::fs::read(&frame_file) {
            if !bytes.is_empty() {
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                return Ok(format!("data:image/jpeg;base64,{}", b64));
            }
        }
    }

    let ffmpeg_bin = find_binary("ffmpeg");
    let mut cmd = Command::new(&ffmpeg_bin);
    cmd.args([
        "-y",
        "-ss",
        &format!("{:.3}", timestamp_seconds.max(0.0)),
        "-i",
        &file_path,
        "-vframes",
        "1",
        "-vf",
        "scale=160:90:force_original_aspect_ratio=increase,crop=160:90",
        "-q:v",
        "3",
        frame_file.to_string_lossy().as_ref(),
    ]);

    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd.output().map_err(|e| format!("Failed to run ffmpeg: {}", e))?;
    if !output.status.success() || !frame_file.exists() {
        return Err("Failed to extract frame".into());
    }

    let bytes = std::fs::read(&frame_file).map_err(|e| format!("Failed to read frame: {}", e))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

#[tauri::command]
async fn extract_timeline_frame(
    file_path: String,
    frame_index: usize,
    timestamp_seconds: f64,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        extract_timeline_frame_internal(file_path, frame_index, timestamp_seconds)
    })
    .await
    .map_err(|e| format!("Async task execution failed: {}", e))?
}

#[tauri::command]
fn set_decorations(app: tauri::AppHandle, decorations: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_decorations(decorations)
            .map_err(|e| format!("Failed to set decorations: {}", e))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let is_active = {
                    let pid_lock = RUNNING_CHILD_PID.lock().unwrap();
                    pid_lock.is_some()
                };
                if is_active {
                    api.prevent_close();
                    let _ = window.emit("confirm-exit-requested", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            pick_file,
            pick_files,
            pick_folder,
            write_temp_text_file,
            get_media_info,
            extract_action_frame,
            extract_album_art,
            extract_timeline_thumbnails,
            extract_timeline_frame,
            open_binaries_folder,
            fetch_playlist_videos,
            execute_ffmpeg,
            execute_ytdlp,
            execute_image_ai,
            cancel_ffmpeg,
            cancel_job,
            is_job_active,
            force_exit_app,
            check_tool_versions,
            open_file,
            show_in_folder,
            send_system_notification,
            check_file_exists,
            read_image_data,
            get_hardware_info,
            update_tool,
            set_decorations
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

