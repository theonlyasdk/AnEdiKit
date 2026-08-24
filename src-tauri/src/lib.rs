use serde::{Deserialize, Serialize};
use std::io::{BufReader, Read};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

static RUNNING_CHILD_PID: Mutex<Option<u32>> = Mutex::new(None);
static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

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

#[derive(Serialize, Deserialize, Debug, Clone)]
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

#[tauri::command]
fn read_image_data(file_path: String) -> Result<String, String> {
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

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct ToolVersionsInfo {
    pub ytdlp_installed: String,
    pub deno_installed: String,
    pub ffmpeg_installed: String,
    pub ffprobe_installed: String,
}

#[tauri::command]
fn check_tool_versions() -> ToolVersionsInfo {
    let mut info = ToolVersionsInfo {
        ytdlp_installed: "Not Found".into(),
        deno_installed: "Not Found".into(),
        ffmpeg_installed: "Not Found".into(),
        ffprobe_installed: "Not Found".into(),
    };

    // yt-dlp
    let ytdlp_bin = find_binary("yt-dlp");
    let mut cmd = Command::new(&ytdlp_bin);
    cmd.arg("--version");
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    if let Ok(out) = cmd.output() {
        if out.status.success() {
            if let Ok(s) = String::from_utf8(out.stdout) {
                info.ytdlp_installed = s.trim().to_string();
            }
        }
    }

    // Deno
    let deno_bin = find_binary("deno");
    let mut cmd = Command::new(&deno_bin);
    cmd.arg("--version");
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    if let Ok(out) = cmd.output() {
        if out.status.success() {
            if let Ok(s) = String::from_utf8(out.stdout) {
                if let Some(line1) = s.lines().next() {
                    let ver = line1.replace("deno", "").trim().to_string();
                    info.deno_installed = if ver.is_empty() { line1.trim().to_string() } else { ver };
                }
            }
        }
    }

    // FFmpeg
    let ffmpeg_bin = find_binary("ffmpeg");
    let mut cmd = Command::new(&ffmpeg_bin);
    cmd.arg("-version");
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    if let Ok(out) = cmd.output() {
        if out.status.success() {
            if let Ok(s) = String::from_utf8(out.stdout) {
                if let Some(line1) = s.lines().next() {
                    let parts: Vec<&str> = line1.split_whitespace().collect();
                    if parts.len() >= 3 {
                        info.ffmpeg_installed = parts[2].to_string();
                    } else {
                        info.ffmpeg_installed = line1.trim().to_string();
                    }
                }
            }
        }
    }

    // FFprobe
    let ffprobe_bin = find_binary("ffprobe");
    let mut cmd = Command::new(&ffprobe_bin);
    cmd.arg("-version");
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    if let Ok(out) = cmd.output() {
        if out.status.success() {
            if let Ok(s) = String::from_utf8(out.stdout) {
                if let Some(line1) = s.lines().next() {
                    let parts: Vec<&str> = line1.split_whitespace().collect();
                    if parts.len() >= 3 {
                        info.ffprobe_installed = parts[2].to_string();
                    } else {
                        info.ffprobe_installed = line1.trim().to_string();
                    }
                }
            }
        }
    }

    info
}

fn find_binary(bin: &str) -> String {
    let mut check_cmd = Command::new(bin);
    check_cmd.arg("-version");
    #[cfg(windows)]
    check_cmd.creation_flags(0x08000000);
    if let Ok(out) = check_cmd.output() {
        if out.status.success() {
            return bin.to_string();
        }
    }

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let p = std::path::Path::new(&local_app_data)
            .join("ASDK")
            .join("Shared")
            .join("bin")
            .join(format!("{}.exe", bin));
        if p.exists() {
            return p.to_string_lossy().to_string();
        }
    }

    let p2 = std::path::Path::new(r"C:\ffmpeg\bin").join(format!("{}.exe", bin));
    if p2.exists() {
        return p2.to_string_lossy().to_string();
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

#[tauri::command]
fn get_media_info(file_path: String) -> Result<MediaInfo, String> {
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

#[tauri::command]
fn get_hardware_info() -> HardwareInfo {
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

    HardwareInfo {
        cpu_name,
        nvidia_gpu,
        intel_gpu,
        amd_gpu,
        default_recommended,
    }
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
        let mut full_args = vec!["--newline".to_string(), "--no-colors".to_string(), "--progress".to_string()];
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

        // Stdout reader for yt-dlp download progress and stdout logs
        let app_out = app.clone();
        let out_handle = std::thread::spawn(move || {
            if let Some(out) = stdout {
                let mut cur_pct = 0u32;
                let mut cur_speed = "0 MiB/s".to_string();
                let mut cur_eta = "--:--".to_string();
                let mut cur_size = "".to_string();
                let mut cur_item = 0u32;
                let mut total_items = 0u32;
                let mut current_item_name = String::new();

                stream_lines(out, move |line| {
                    if CANCEL_REQUESTED.load(Ordering::SeqCst) {
                        return;
                    }

                    // Emit log line
                    let _ = app_out.emit("ffmpeg-log", LogPayload { line: line.clone() });

                    // Parse playlist / batch item progress: [download] Downloading item 3 of 12
                    if let Some(item_idx) = line.find("Downloading item ")
                        .or_else(|| line.find("Downloading video "))
                        .or_else(|| line.find("Downloading playlist item ")) {
                        let sub = &line[item_idx..];
                        let parts: Vec<&str> = sub.split_whitespace().collect();
                        if let Some(of_pos) = parts.iter().position(|&w| w == "of") {
                            if of_pos > 0 && of_pos + 1 < parts.len() {
                                if let (Ok(cur), Ok(tot)) = (parts[of_pos - 1].parse::<u32>(), parts[of_pos + 1].parse::<u32>()) {
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
                    } else if line.contains("[Merger] Merging formats into \"") {
                        if let Some(idx) = line.find("into \"") {
                            let path = line[idx + 6..].trim().trim_matches('"');
                            if !path.is_empty() {
                                let name = path.split(['/', '\\']).last().unwrap_or(path);
                                current_item_name = name.to_string();
                            }
                        }
                    }

                    // Parse download percentage: [download]  45.2% of  120.50MiB at 12.34MiB/s ETA 00:05
                    // Or: [download] 100% of 15.00MiB in 00:02
                    if line.contains("[download]") && line.contains('%') {
                        if let Some(pct_idx) = line.find('%') {
                            let before = &line[..pct_idx];
                            let num_str: String = before.chars().rev().take_while(|c| c.is_digit(10) || *c == '.' || *c == ' ').collect();
                            let clean_num: String = num_str.chars().rev().collect();
                            if let Ok(pct) = clean_num.trim().parse::<f64>() {
                                cur_pct = pct.clamp(0.0, 100.0).round() as u32;
                            }
                        }

                        if let Some(at_idx) = line.find(" at ") {
                            let speed_part = &line[at_idx + 4..];
                            let end = speed_part.find(" ETA").unwrap_or(speed_part.len());
                            cur_speed = speed_part[..end].trim().to_string();
                        }

                        if let Some(eta_idx) = line.find(" ETA ") {
                            cur_eta = line[eta_idx + 5..].trim().to_string();
                        }

                        if let Some(of_idx) = line.find(" of ") {
                            let size_part = &line[of_idx + 4..];
                            let end = size_part.find(" at ").or_else(|| size_part.find(" in ")).unwrap_or(size_part.len());
                            cur_size = size_part[..end].trim().to_string();
                        }

                        let eta_val = if cur_eta != "--:--" && !cur_eta.is_empty() {
                            Some(cur_eta.clone())
                        } else {
                            None
                        };

                        let _ = app_out.emit(
                            "ffmpeg-progress",
                            ProgressPayload {
                                time: format!("Size: {}", cur_size),
                                eta: eta_val,
                                fps: "".to_string(),
                                speed: cur_speed.clone(),
                                bitrate: cur_size.clone(),
                                pct: cur_pct,
                                playlist_item: if total_items > 0 { Some(cur_item) } else { None },
                                playlist_total: if total_items > 0 { Some(total_items) } else { None },
                                current_item_title: if !current_item_name.is_empty() { Some(current_item_name.clone()) } else { None },
                            },
                        );
                    } else if line.contains("100% of") || line.contains("[ExtractAudio]") || line.contains("[Merger]") {
                        cur_pct = 100;
                        let _ = app_out.emit(
                            "ffmpeg-progress",
                            ProgressPayload {
                                time: "Finishing...".to_string(),
                                eta: Some("00:00:00".to_string()),
                                fps: "".to_string(),
                                speed: cur_speed.clone(),
                                bitrate: cur_size.clone(),
                                pct: 100,
                                playlist_item: if total_items > 0 { Some(cur_item) } else { None },
                                playlist_total: if total_items > 0 { Some(total_items) } else { None },
                                current_item_title: if !current_item_name.is_empty() { Some(current_item_name.clone()) } else { None },
                            },
                        );
                    }
                });
            }
        });

        // Stderr reader for yt-dlp error logs
        let app_err = app.clone();
        let err_handle = std::thread::spawn(move || {
            if let Some(err) = stderr {
                stream_lines(err, move |line| {
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
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err("File does not exist".into());
    }
    #[cfg(windows)]
    {
        let _ = Command::new("cmd")
            .args(["/C", "start", "", &file_path])
            .creation_flags(0x08000000)
            .spawn();
    }
    Ok(())
}

#[tauri::command]
fn show_in_folder(file_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err("Path does not exist".into());
    }
    #[cfg(windows)]
    {
        let _ = Command::new("explorer")
            .args(["/select,", &file_path])
            .creation_flags(0x08000000)
            .spawn();
    }
    Ok(())
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
fn extract_album_art(file_path: String) -> Result<String, String> {
    extract_album_art_internal(&file_path).ok_or_else(|| "No album art found".into())
}

#[tauri::command]
fn extract_action_frame(file_path: String, duration_seconds: Option<f64>) -> Result<String, String> {
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
fn extract_timeline_thumbnails(
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
fn fetch_playlist_videos(url: String) -> Result<Vec<PlaylistVideo>, String> {
    if url.trim().is_empty() {
        return Err("Please enter a valid playlist or video URL".into());
    }
    let ytdlp_bin = find_binary("yt-dlp");
    let mut cmd = Command::new(&ytdlp_bin);
    cmd.args([
        "--flat-playlist",
        "--print",
        "%(id)s\t%(title)s\t%(url)s\t%(duration)s",
        "--no-warnings",
        url.trim(),
    ]);

    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = cmd.output().map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(if err.trim().is_empty() { "Failed to fetch playlist items".into() } else { err.to_string() });
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();
    let mut idx = 1;

    for line in stdout_str.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }
        let parts: Vec<&str> = line.split('\t').collect();
        if !parts.is_empty() {
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
                parts[3].parse::<f64>().ok()
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
        return Err("No videos found in the specified URL / playlist".into());
    }

    Ok(entries)
}

#[tauri::command]
fn extract_timeline_frame(
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
            get_hardware_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
