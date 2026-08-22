use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::Emitter;

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
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ProgressPayload {
    pub time: String,
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
pub struct FinishPayload {
    pub success: bool,
    pub exit_code: i32,
    pub message: String,
}

#[tauri::command]
fn pick_file(filter_mode: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new();
    match filter_mode.as_deref() {
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
                "Media Files",
                &[
                    "mp4", "mkv", "webm", "mov", "avi", "flv", "ts", "mp3", "wav", "flac", "m4a",
                    "ogg", "opus",
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
                "Media Files",
                &[
                    "mp4", "mkv", "webm", "mov", "avi", "flv", "ts", "wmv", "m4v", "mp3", "wav", "flac", "m4a",
                    "ogg", "opus", "wma", "aiff",
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

#[tauri::command]
fn get_media_info(file_path: String) -> Result<MediaInfo, String> {
    let path = std::path::Path::new(&file_path);
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
        file_path: file_path.clone(),
        file_name,
        duration_seconds: 0.0,
        duration_string: "--:--:--".into(),
        resolution: "--".into(),
        video_codec: "--".into(),
        audio_codec: "--".into(),
        file_size_mb,
        file_size_formatted,
        bitrate_kbps: 0,
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
        &file_path,
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
    let ext_lower = std::path::Path::new(&file_path)
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

    if info.video_codec == "--" && ["mp3", "wav", "flac", "m4a", "ogg", "opus", "wma"].contains(&ext_lower.as_str()) {
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

        // Stdout reader for -progress pipe:1
        let app_out = app.clone();
        let out_handle = std::thread::spawn(move || {
            if let Some(out) = stdout {
                let reader = BufReader::new(out);
                let mut cur_time = "00:00:00".to_string();
                let mut cur_fps = "0".to_string();
                let mut cur_speed = "0x".to_string();
                let mut cur_bitrate = "0 kbits/s".to_string();
                let mut cur_pct = 0u32;

                for line in reader.lines().flatten() {
                    if CANCEL_REQUESTED.load(Ordering::SeqCst) {
                        break;
                    }

                    if line.starts_with("out_time=") {
                        let t = line[9..].trim().to_string();
                        cur_time = t.clone();
                        // Parse timestamp HH:MM:SS.ms to seconds
                        let parts: Vec<&str> = t.split(':').collect();
                        if parts.len() == 3 {
                            let h = parts[0].parse::<f64>().unwrap_or(0.0);
                            let m = parts[1].parse::<f64>().unwrap_or(0.0);
                            let s = parts[2].parse::<f64>().unwrap_or(0.0);
                            let cur_sec = h * 3600.0 + m * 60.0 + s;
                            if total_duration > 0.0 {
                                let pct = ((cur_sec / total_duration) * 100.0).clamp(0.0, 99.0);
                                cur_pct = pct.round() as u32;
                            }
                        }
                    } else if line.starts_with("fps=") {
                        cur_fps = line[4..].trim().to_string();
                    } else if line.starts_with("speed=") {
                        cur_speed = line[6..].trim().to_string();
                    } else if line.starts_with("bitrate=") {
                        cur_bitrate = line[8..].trim().to_string();
                    } else if line.starts_with("progress=end") {
                        cur_pct = 100;
                    }

                    let _ = app_out.emit(
                        "ffmpeg-progress",
                        ProgressPayload {
                            time: cur_time.clone(),
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
            }
        });

        // Stderr reader for FFmpeg console logs
        let app_err = app.clone();
        let err_handle = std::thread::spawn(move || {
            if let Some(err) = stderr {
                let reader = BufReader::new(err);
                for line in reader.lines().flatten() {
                    if CANCEL_REQUESTED.load(Ordering::SeqCst) {
                        break;
                    }
                    let _ = app_err.emit("ffmpeg-log", LogPayload { line });
                }
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
        // Force newline mode for reliable stream progress parsing
        let mut full_args = vec!["--newline".to_string()];
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
                let reader = BufReader::new(out);
                let mut cur_pct = 0u32;
                let mut cur_speed = "0 MiB/s".to_string();
                let mut cur_eta = "--:--".to_string();
                let mut cur_size = "".to_string();
                let mut cur_item = 0u32;
                let mut total_items = 0u32;
                let mut current_item_name = String::new();

                for line in reader.lines().flatten() {
                    if CANCEL_REQUESTED.load(Ordering::SeqCst) {
                        break;
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
                    if line.contains("[download]") && line.contains('%') {
                        if let Some(pct_idx) = line.find('%') {
                            let start = line[..pct_idx].rfind(' ').unwrap_or(0);
                            if let Ok(pct) = line[start..pct_idx].trim().parse::<f64>() {
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
                            let end = size_part.find(" at ").unwrap_or(size_part.len());
                            cur_size = size_part[..end].trim().to_string();
                        }

                        let _ = app_out.emit(
                            "ffmpeg-progress",
                            ProgressPayload {
                                time: format!("ETA: {}", cur_eta),
                                fps: "".to_string(),
                                speed: cur_speed.clone(),
                                bitrate: cur_size.clone(),
                                pct: cur_pct,
                                playlist_item: if total_items > 0 { Some(cur_item) } else { None },
                                playlist_total: if total_items > 0 { Some(total_items) } else { None },
                                current_item_title: if !current_item_name.is_empty() { Some(current_item_name.clone()) } else { None },
                            },
                        );
                    } else if line.contains("100% of") || line.contains("[ExtractAudio]") {
                        cur_pct = 100;
                        let _ = app_out.emit(
                            "ffmpeg-progress",
                            ProgressPayload {
                                time: "Finishing...".to_string(),
                                fps: "".to_string(),
                                speed: "".to_string(),
                                bitrate: "".to_string(),
                                pct: 100,
                                playlist_item: if total_items > 0 { Some(cur_item) } else { None },
                                playlist_total: if total_items > 0 { Some(total_items) } else { None },
                                current_item_title: if !current_item_name.is_empty() { Some(current_item_name.clone()) } else { None },
                            },
                        );
                    }
                }
            }
        });

        // Stderr reader for yt-dlp error logs
        let app_err = app.clone();
        let err_handle = std::thread::spawn(move || {
            if let Some(err) = stderr {
                let reader = BufReader::new(err);
                for line in reader.lines().flatten() {
                    if CANCEL_REQUESTED.load(Ordering::SeqCst) {
                        break;
                    }
                    let _ = app_err.emit("ffmpeg-log", LogPayload { line });
                }
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
                    "Download cancelled by user".to_string()
                } else if success {
                    "Download completed successfully".to_string()
                } else {
                    format!("yt-dlp exited with code {}", code)
                };

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
    let _ = cancel_ffmpeg();
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
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "start", "", &file_path]);
        cmd.creation_flags(0x08000000);
        cmd.spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        Command::new("xdg-open").arg(&file_path).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn show_in_folder(file_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    #[cfg(windows)]
    {
        let mut cmd = Command::new("explorer");
        if path.is_file() {
            cmd.arg(format!("/select,{}", path.to_string_lossy()));
        } else if path.is_dir() {
            cmd.arg(path.to_string_lossy().to_string());
        } else if let Some(parent) = path.parent() {
            if parent.exists() {
                cmd.arg(parent.to_string_lossy().to_string());
            } else {
                cmd.arg(".");
            }
        } else {
            cmd.arg(".");
        }
        cmd.creation_flags(0x08000000);
        cmd.spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open").args(["-R", &file_path]).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let parent = path.parent().unwrap_or(path);
        Command::new("xdg-open").arg(parent).spawn().map_err(|e| e.to_string())?;
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
            [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('AnEditKit').Show($toast);",
            escaped_title, escaped_body
        );
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script]);
        cmd.creation_flags(0x08000000);
        let _ = cmd.spawn();
    }
    Ok(())
}

fn get_thumb_cache_dir() -> std::path::PathBuf {
    let base = if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        std::path::PathBuf::from(local_app_data)
            .join("ASDK")
            .join("AnEdiKit")
            .join("ThumbCache")
    } else {
        std::env::temp_dir().join("ASDK_AnEdiKit_ThumbCache")
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

#[tauri::command]
fn extract_action_frame(file_path: String, duration_seconds: Option<f64>) -> Result<String, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err("File does not exist".into());
    }

    let cache_dir = get_thumb_cache_dir();
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
            execute_ffmpeg,
            execute_ytdlp,
            cancel_ffmpeg,
            is_job_active,
            force_exit_app,
            check_tool_versions,
            open_file,
            show_in_folder,
            send_system_notification
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
