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

                            if c_type == "video" && info.video_codec == "--" {
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

                for line in reader.lines().flatten() {
                    if CANCEL_REQUESTED.load(Ordering::SeqCst) {
                        break;
                    }

                    // Emit log line
                    let _ = app_out.emit("ffmpeg-log", LogPayload { line: line.clone() });

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            pick_file,
            pick_files,
            pick_folder,
            write_temp_text_file,
            get_media_info,
            execute_ffmpeg,
            execute_ytdlp,
            cancel_ffmpeg,
            check_tool_versions
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
