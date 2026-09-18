use crate::models::{FinishPayload, LogPayload, ProgressPayload};
use crate::tools::find_binary;
use std::collections::HashMap;
use std::io::{BufReader, Read};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::LazyLock;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Per-task child process tracking. A single global PID + cancel flag races
/// when a main job overlaps background work: cancelling could kill the wrong
/// process or clear another task's flag. Each spawned job registers here with
/// its own PID slot and cancellation flag instead.
struct JobState {
    pid: Option<u32>,
    foreground: bool,
    cancelled: Arc<AtomicBool>,
}

static RUNNING_JOBS: LazyLock<Mutex<HashMap<u64, JobState>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static FOREGROUND_JOB: Mutex<Option<u64>> = Mutex::new(None);
static NEXT_JOB_ID: AtomicU64 = AtomicU64::new(1);

/// Registers a job and returns its id plus its private cancellation flag.
/// Foreground jobs (ffmpeg / yt-dlp / image-ai) occupy the foreground slot
/// and are the only ones affected by user cancellation; background helper
/// tasks never register, so they can neither be killed by Cancel nor disturb
/// main-job state.
fn register_job(foreground: bool) -> (u64, Arc<AtomicBool>) {
    let id = NEXT_JOB_ID.fetch_add(1, Ordering::SeqCst);
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut jobs = RUNNING_JOBS.lock().unwrap();
        jobs.insert(
            id,
            JobState {
                pid: None,
                foreground,
                cancelled: cancelled.clone(),
            },
        );
        if foreground {
            *FOREGROUND_JOB.lock().unwrap() = Some(id);
        }
    }
    (id, cancelled)
}

fn set_job_pid(id: u64, pid: u32) {
    if let Some(job) = RUNNING_JOBS.lock().unwrap().get_mut(&id) {
        job.pid = Some(pid);
    }
}

/// Unregisters a finished job. Only clears the foreground slot when it still
/// points at this job, so a newer job is never disturbed by a stale thread.
fn finish_job(id: u64) {
    RUNNING_JOBS.lock().unwrap().remove(&id);
    let mut fg = FOREGROUND_JOB.lock().unwrap();
    if *fg == Some(id) {
        *fg = None;
    }
}

fn kill_pid(pid: u32) {
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
}

/// Marks every foreground job cancelled and kills its process. Background
/// helper tasks (thumbnails, probes) are deliberately left running.
fn cancel_foreground_jobs() {
    let pids: Vec<u32> = {
        let mut jobs = RUNNING_JOBS.lock().unwrap();
        let mut pids = Vec::new();
        for job in jobs.values_mut() {
            if job.foreground {
                job.cancelled.store(true, Ordering::SeqCst);
                if let Some(pid) = job.pid.take() {
                    pids.push(pid);
                }
            }
        }
        pids
    };
    for pid in pids {
        kill_pid(pid);
    }
}

/// Marks and kills every tracked job. Used only for forced app exit.
fn kill_all_jobs() {
    let pids: Vec<u32> = {
        let mut jobs = RUNNING_JOBS.lock().unwrap();
        let mut pids = Vec::new();
        for job in jobs.values_mut() {
            job.cancelled.store(true, Ordering::SeqCst);
            if let Some(pid) = job.pid.take() {
                pids.push(pid);
            }
        }
        pids
    };
    for pid in pids {
        kill_pid(pid);
    }
    *FOREGROUND_JOB.lock().unwrap() = None;
}

pub fn is_foreground_job_active() -> bool {
    FOREGROUND_JOB.lock().unwrap().is_some()
}

#[tauri::command]
pub fn cancel_ffmpeg() -> Result<(), String> {
    cancel_foreground_jobs();
    Ok(())
}

#[tauri::command]
pub fn cancel_job() -> Result<(), String> {
    cancel_ffmpeg()
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
    cancel: Arc<AtomicBool>,
    mut on_line: F,
) {
    let mut buf = BufReader::new(reader);
    let mut line_bytes = Vec::new();
    let mut byte = [0u8; 1];

    while let Ok(n) = buf.read(&mut byte) {
        if n == 0 {
            break;
        }
        if cancel.load(Ordering::SeqCst) {
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

fn is_hardware_acceleration_failure(line: &str) -> bool {
    let lower = line.to_lowercase();
    lower.contains("initializeencoder failed")
        || lower.contains("error creating a mfx session")
        || lower.contains("mfx implementation is not supported")
        || lower.contains("dll amfrt64.dll failed to open")
        || lower.contains("failed to create  hardware device context")
        || lower.contains("failed to create hardware device context")
        || lower.contains("cannot load nvcuda.dll")
        || lower.contains("device creation failed")
        || lower.contains("failed to initialize amf")
        || lower.contains("selected hardware device not found")
        || lower.contains("hardware acceleration failed")
        || lower.contains("device setup failed for decoder on input")
        || lower.contains("no nvenc capable devices found")
        || lower.contains("no capable devices found")
        || lower.contains("driver does not support the required nvenc api version")
        || lower.contains("error while opening encoder")
}

fn uses_hardware_acceleration(args: &[String]) -> bool {
    args.iter().any(|arg| {
        arg == "-hwaccel"
            || arg.ends_with("_nvenc")
            || arg.ends_with("_qsv")
            || arg.ends_with("_amf")
            || arg.ends_with("_videotoolbox")
            || arg.ends_with("_d3d12va")
    })
}

fn convert_args_to_cpu_fallback(args: &[String]) -> Vec<String> {
    let mut fallback = Vec::new();
    let mut skip_next = false;
    let mut i = 0;

    while i < args.len() {
        if skip_next {
            skip_next = false;
            i += 1;
            continue;
        }

        let arg = &args[i];

        // 1. Remove -hwaccel and its argument
        if arg == "-hwaccel" {
            skip_next = true;
            i += 1;
            continue;
        }

        // 2. Map video encoders to software CPU encoders
        if arg == "-c:v" && i + 1 < args.len() {
            let enc = &args[i + 1];
            let cpu_enc = if enc.contains("h264_") {
                "libx264"
            } else if enc.contains("hevc_") {
                "libx265"
            } else if enc.contains("av1_") {
                "libsvtav1"
            } else if enc.contains("vp9_") {
                "libvpx-vp9"
            } else {
                enc.as_str()
            };
            fallback.push("-c:v".to_string());
            fallback.push(cpu_enc.to_string());
            i += 2;
            continue;
        }

        // 3. Convert NVENC/QSV quality parameters (-cq, -global_quality) to -crf
        if arg == "-cq" || arg == "-global_quality" {
            fallback.push("-crf".to_string());
            if i + 1 < args.len() {
                fallback.push(args[i + 1].clone());
                i += 2;
                continue;
            }
        }

        // 4. Clean AMF rate control flags (-rc cqp -qp_i <val> -qp_p <val>)
        if arg == "-rc" && i + 1 < args.len() && args[i + 1] == "cqp" {
            i += 2;
            continue;
        }
        if arg == "-qp_i" && i + 1 < args.len() {
            fallback.push("-crf".to_string());
            fallback.push(args[i + 1].clone());
            i += 2;
            continue;
        }
        if arg == "-qp_p" && i + 1 < args.len() {
            i += 2;
            continue;
        }

        // 5. Convert NVENC presets (p1..p7) to libx264/libx265 presets
        if arg == "-preset" && i + 1 < args.len() {
            let p = &args[i + 1];
            if p.starts_with('p') && p.len() == 2 && p[1..].chars().all(|c| c.is_ascii_digit()) {
                let mapped_p = match p.as_str() {
                    "p1" => "ultrafast",
                    "p2" => "veryfast",
                    "p3" => "fast",
                    "p6" | "p7" => "slow",
                    _ => "medium",
                };
                fallback.push("-preset".to_string());
                fallback.push(mapped_p.to_string());
                i += 2;
                continue;
            }
        }

        fallback.push(arg.clone());
        i += 1;
    }

    fallback
}

fn run_ffmpeg_process(
    app: &tauri::AppHandle,
    ffmpeg_bin: &str,
    args: &[String],
    job_id: u64,
    job_cancelled: &Arc<AtomicBool>,
    dur_state: &Arc<Mutex<f64>>,
    had_hw_failure: &Arc<AtomicBool>,
) -> Result<std::process::ExitStatus, String> {
    let mut child_cmd = Command::new(ffmpeg_bin);
    child_cmd.args(args);
    child_cmd.stdout(Stdio::piped());
    child_cmd.stderr(Stdio::piped());

    #[cfg(windows)]
    child_cmd.creation_flags(0x08000000);

    let mut child = child_cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;
    set_job_pid(job_id, child.id());

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_out = app.clone();
    let cancel_out = job_cancelled.clone();
    let out_handle = std::thread::spawn(move || {
        if let Some(out) = stdout {
            let cancel_line = cancel_out.clone();
            stream_lines(out, cancel_out, move |line| {
                if cancel_line.load(Ordering::SeqCst) {
                    return;
                }
                let _ = app_out.emit("ffmpeg-log", LogPayload { line });
            });
        }
    });

    let app_err = app.clone();
    let cancel_err = job_cancelled.clone();
    let dur_clone = dur_state.clone();
    let hw_fail = had_hw_failure.clone();

    let err_handle = std::thread::spawn(move || {
        if let Some(err) = stderr {
            let cancel_line = cancel_err.clone();
            stream_lines(err, cancel_err, move |line| {
                if cancel_line.load(Ordering::SeqCst) {
                    return;
                }

                if is_hardware_acceleration_failure(&line) {
                    hw_fail.store(true, Ordering::SeqCst);
                }

                if line.contains("Duration:") {
                    if let Some(d) = parse_duration_from_str(&line) {
                        let mut guard = dur_clone.lock().unwrap();
                        if *guard == 0.0 {
                            *guard = d;
                        }
                    }
                }

                if line.contains("time=") {
                    let time_str = extract_kv_value(&line, "time=")
                        .unwrap_or_else(|| "00:00:00".into());
                    let fps = extract_kv_value(&line, "fps=").unwrap_or_else(|| "0".into());
                    let speed = extract_kv_value(&line, "speed=").unwrap_or_else(|| "0x".into());
                    let bitrate = extract_kv_value(&line, "bitrate=")
                        .unwrap_or_else(|| "0 kbits/s".into());

                    let cur_sec = parse_duration_from_str(&time_str).unwrap_or(0.0);
                    let tot = *dur_clone.lock().unwrap();
                    let pct = if tot > 0.0 {
                        ((cur_sec / tot) * 100.0).clamp(0.0, 100.0) as u32
                    } else {
                        0
                    };

                    let eta_str = if tot > 0.0 && cur_sec > 0.0 {
                        let rem_sec = (tot - cur_sec).max(0.0);
                        Some(format_seconds_to_hms(rem_sec))
                    } else {
                        None
                    };

                    let _ = app_err.emit(
                        "ffmpeg-progress",
                        ProgressPayload {
                            time: time_str,
                            eta: eta_str,
                            fps,
                            speed,
                            bitrate,
                            pct,
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

    let status = child
        .wait()
        .map_err(|e| format!("Failed to wait for ffmpeg: {}", e));
    let _ = out_handle.join();
    let _ = err_handle.join();
    status
}

#[tauri::command]
pub fn execute_ffmpeg(
    app: tauri::AppHandle,
    args: Vec<String>,
    total_duration: Option<f64>,
) -> Result<(), String> {
    let (job_id, job_cancelled) = register_job(true);

    std::thread::spawn(move || {
        let ffmpeg_bin = find_binary("ffmpeg");
        let dur_state = Arc::new(Mutex::new(total_duration.unwrap_or(0.0)));
        let had_hw_failure = Arc::new(AtomicBool::new(false));

        let mut status = run_ffmpeg_process(
            &app,
            &ffmpeg_bin,
            &args,
            job_id,
            &job_cancelled,
            &dur_state,
            &had_hw_failure,
        );

        let was_cancelled = job_cancelled.load(Ordering::SeqCst);
        let hw_failed = had_hw_failure.load(Ordering::SeqCst);
        let is_err = status.as_ref().map(|s| !s.success()).unwrap_or(true);

        let mut used_fallback = false;

        if !was_cancelled && is_err && hw_failed && uses_hardware_acceleration(&args) {
            let fallback_args = convert_args_to_cpu_fallback(&args);
            let _ = app.emit(
                "ffmpeg-log",
                LogPayload {
                    line: "[AnEdiKit] Hardware encoder initialization failed. Automatically falling back to CPU software encoding (libx264/libx265)...".to_string(),
                },
            );

            let dummy_hw_fail = Arc::new(AtomicBool::new(false));
            status = run_ffmpeg_process(
                &app,
                &ffmpeg_bin,
                &fallback_args,
                job_id,
                &job_cancelled,
                &dur_state,
                &dummy_hw_fail,
            );
            used_fallback = true;
        }

        finish_job(job_id);

        let final_cancelled = job_cancelled.load(Ordering::SeqCst);
        match status {
            Ok(s) => {
                let code = s.code().unwrap_or(0);
                let _ = app.emit(
                    "ffmpeg-finished",
                    FinishPayload {
                        success: !final_cancelled && s.success(),
                        exit_code: if final_cancelled { -999 } else { code },
                        message: if final_cancelled {
                            "Operation cancelled by user".into()
                        } else if s.success() {
                            if used_fallback {
                                "Operation completed successfully (CPU fallback)".into()
                            } else {
                                "Operation completed successfully".into()
                            }
                        } else {
                            format!("ffmpeg exited with code {}", code)
                        },
                    },
                );
            }
            Err(e) => {
                let _ = app.emit(
                    "ffmpeg-finished",
                    FinishPayload {
                        success: false,
                        exit_code: -1,
                        message: e,
                    },
                );
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn execute_ytdlp(app: tauri::AppHandle, args: Vec<String>) -> Result<(), String> {
    let (job_id, job_cancelled) = register_job(true);

    std::thread::spawn(move || {
        let ytdlp_bin = find_binary("yt-dlp");
        let ffmpeg_bin = find_binary("ffmpeg");
        let mut final_args = args.clone();

        // Ensure yt-dlp uses our resolved ffmpeg directory
        if let Some(p) = std::path::Path::new(&ffmpeg_bin).parent() {
            final_args.push("--ffmpeg-location".to_string());
            final_args.push(p.to_string_lossy().to_string());
        }

        // Print final destination path after files are merged/moved so runner.js
        // can offer a direct "Open file" action on success.
        final_args.push("--print".to_string());
        final_args.push("after_move:filepath:%(filepath)s".to_string());

        let mut child_cmd = Command::new(&ytdlp_bin);
        child_cmd.args(&final_args);
        child_cmd.stdout(Stdio::piped());
        child_cmd.stderr(Stdio::piped());

        #[cfg(windows)]
        child_cmd.creation_flags(0x08000000);

        let mut child = match child_cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                finish_job(job_id);
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

        set_job_pid(job_id, child.id());

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let app_out = app.clone();
        let cancel_out = job_cancelled.clone();
        let playlist_item_state = Arc::new(Mutex::new(None::<u32>));
        let playlist_total_state = Arc::new(Mutex::new(None::<u32>));
        let current_title_state = Arc::new(Mutex::new(None::<String>));

        let pi_clone = playlist_item_state.clone();
        let pt_clone = playlist_total_state.clone();
        let ct_clone = current_title_state.clone();

        let out_handle = std::thread::spawn(move || {
            if let Some(out) = stdout {
                let cancel_line = cancel_out.clone();
                stream_lines(out, cancel_out, move |line| {
                    if cancel_line.load(Ordering::SeqCst) {
                        return;
                    }

                    // Parse downloading item tag e.g. [download] Downloading item 1 of 5
                    if line.contains("Downloading item ") {
                        if let Some(idx) = line.find("Downloading item ") {
                            let sub = &line[idx + 17..];
                            let parts: Vec<&str> = sub.split_whitespace().collect();
                            if parts.len() >= 3 && parts[1] == "of" {
                                if let (Ok(cur), Ok(tot)) =
                                    (parts[0].parse::<u32>(), parts[2].parse::<u32>())
                                {
                                    *pi_clone.lock().unwrap() = Some(cur);
                                    *pt_clone.lock().unwrap() = Some(tot);
                                }
                            }
                        }
                    }

                    // Parse destination filename e.g. [download] Destination: ...
                    if line.contains("Destination:") {
                        if let Some(idx) = line.find("Destination:") {
                            let path_str = line[idx + 12..].trim();
                            if let Some(fname) = std::path::Path::new(path_str).file_name() {
                                *ct_clone.lock().unwrap() =
                                    Some(fname.to_string_lossy().to_string());
                            }
                        }
                    }

                    // Parse yt-dlp progress: [download]  45.2% of 120.5MiB at 4.5MiB/s ETA 00:15
                    if line.contains("[download]") && line.contains('%') {
                        let parts: Vec<&str> = line.split_whitespace().collect();
                        let mut pct: u32 = 0;
                        let mut speed = "0x".to_string();
                        let mut eta: Option<String> = None;
                        let mut size_str = "0 MB".to_string();

                        for (i, &p) in parts.iter().enumerate() {
                            if p.ends_with('%') {
                                if let Ok(val) = p.trim_end_matches('%').parse::<f32>() {
                                    pct = val.clamp(0.0, 100.0) as u32;
                                }
                            } else if p == "of" && i + 1 < parts.len() {
                                size_str = parts[i + 1].to_string();
                            } else if p == "at" && i + 1 < parts.len() {
                                speed = parts[i + 1].to_string();
                            } else if p == "ETA" && i + 1 < parts.len() {
                                eta = Some(parts[i + 1].to_string());
                            }
                        }

                        let cur_item = *pi_clone.lock().unwrap();
                        let tot_items = *pt_clone.lock().unwrap();
                        let title = ct_clone.lock().unwrap().clone();

                        let _ = app_out.emit(
                            "ffmpeg-progress",
                            ProgressPayload {
                                time: format!("Size: {}", size_str),
                                eta,
                                fps: "--".into(),
                                speed,
                                bitrate: "--".into(),
                                pct,
                                playlist_item: cur_item,
                                playlist_total: tot_items,
                                current_item_title: title,
                            },
                        );
                    }

                    let _ = app_out.emit("ffmpeg-log", LogPayload { line });
                });
            }
        });

        let app_err = app.clone();
        let cancel_err = job_cancelled.clone();
        let err_handle = std::thread::spawn(move || {
            if let Some(err) = stderr {
                let cancel_line = cancel_err.clone();
                stream_lines(err, cancel_err, move |line| {
                    if cancel_line.load(Ordering::SeqCst) {
                        return;
                    }
                    let _ = app_err.emit("ffmpeg-log", LogPayload { line });
                });
            }
        });

        let status = child.wait();
        let _ = out_handle.join();
        let _ = err_handle.join();

        finish_job(job_id);

        let was_cancelled = job_cancelled.load(Ordering::SeqCst);
        match status {
            Ok(s) => {
                let code = s.code().unwrap_or(0);
                let _ = app.emit(
                    "ffmpeg-finished",
                    FinishPayload {
                        success: !was_cancelled && s.success(),
                        exit_code: if was_cancelled { -999 } else { code },
                        message: if was_cancelled {
                            "Download cancelled by user".into()
                        } else if s.success() {
                            "Download completed successfully".into()
                        } else {
                            format!("yt-dlp exited with code {}", code)
                        },
                    },
                );
            }
            Err(e) => {
                let _ = app.emit(
                    "ffmpeg-finished",
                    FinishPayload {
                        success: false,
                        exit_code: -1,
                        message: format!("Failed to wait for yt-dlp: {}", e),
                    },
                );
            }
        }
    });

    Ok(())
}

fn find_image_ai_script(app: &tauri::AppHandle) -> std::path::PathBuf {
    // 1. Check bundled resource path
    if let Ok(resource_dir) = app.path().resource_dir() {
        let script = resource_dir.join("src").join("py").join("image_ai_engine.py");
        if script.is_file() {
            return script;
        }
        let script_flat = resource_dir.join("image_ai_engine.py");
        if script_flat.is_file() {
            return script_flat;
        }
    }

    // 2. Check current working directory structure
    let cwd_script = std::path::PathBuf::from("src").join("py").join("image_ai_engine.py");
    if cwd_script.is_file() {
        return cwd_script;
    }

    // 3. Check AppData local script storage
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let p = std::path::Path::new(&local_app_data)
            .join("ASDK")
            .join("AnEdiKit")
            .join("py")
            .join("image_ai_engine.py");
        if p.is_file() {
            return p;
        }
    }

    // Fallback default
    std::path::PathBuf::from("src/py/image_ai_engine.py")
}

#[tauri::command]
pub fn execute_image_ai(app: tauri::AppHandle, task: String, params: String) -> Result<(), String> {
    let (job_id, job_cancelled) = register_job(true);

    std::thread::spawn(move || {
        let py_script = find_image_ai_script(&app);
        let py_bin = find_binary("python");

        let mut child_cmd = Command::new(&py_bin);
        child_cmd.args([
            py_script.to_string_lossy().as_ref(),
            "--task",
            &task,
            "--params",
            &params,
        ]);
        child_cmd.stdout(Stdio::piped());
        child_cmd.stderr(Stdio::piped());

        #[cfg(windows)]
        child_cmd.creation_flags(0x08000000);

        let mut child = match child_cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                finish_job(job_id);
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

        set_job_pid(job_id, child.id());

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let app_out = app.clone();
        let cancel_out = job_cancelled.clone();
        let out_handle = std::thread::spawn(move || {
            if let Some(out) = stdout {
                let cancel_line = cancel_out.clone();
                stream_lines(out, cancel_out, move |line| {
                    if cancel_line.load(Ordering::SeqCst) {
                        return;
                    }

                    // Parse JSON progress lines from python engine: {"type":"progress","pct":...,"msg":"..."}
                    if line.starts_with('{') && line.contains("\"type\":\"progress\"") {
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&line) {
                            let pct = parsed.get("pct").and_then(|p| p.as_u64()).unwrap_or(0) as u32;
                            let msg = parsed.get("msg").and_then(|m| m.as_str()).unwrap_or("");
                            let _ = app_out.emit(
                                "ffmpeg-progress",
                                ProgressPayload {
                                    time: msg.to_string(),
                                    eta: None,
                                    fps: "--".into(),
                                    speed: "--".into(),
                                    bitrate: "--".into(),
                                    pct,
                                    playlist_item: None,
                                    playlist_total: None,
                                    current_item_title: None,
                                },
                            );
                            return;
                        }
                    }

                    let _ = app_out.emit("ffmpeg-log", LogPayload { line });
                });
            }
        });

        let app_err = app.clone();
        let cancel_err = job_cancelled.clone();
        let err_handle = std::thread::spawn(move || {
            if let Some(err) = stderr {
                let cancel_line = cancel_err.clone();
                stream_lines(err, cancel_err, move |line| {
                    if cancel_line.load(Ordering::SeqCst) {
                        return;
                    }

                    let _ = app_err.emit("ffmpeg-log", LogPayload { line });
                });
            }
        });

        let status = child.wait();
        let _ = out_handle.join();
        let _ = err_handle.join();

        finish_job(job_id);

        let was_cancelled = job_cancelled.load(Ordering::SeqCst);
        match status {
            Ok(s) => {
                let code = s.code().unwrap_or(0);
                let _ = app.emit(
                    "ffmpeg-finished",
                    FinishPayload {
                        success: !was_cancelled && s.success(),
                        exit_code: if was_cancelled { -999 } else { code },
                        message: if was_cancelled {
                            "Image AI task cancelled by user".into()
                        } else if s.success() {
                            "Image AI task completed successfully".into()
                        } else {
                            format!("Image AI engine exited with code {}", code)
                        },
                    },
                );
            }
            Err(e) => {
                let _ = app.emit(
                    "ffmpeg-finished",
                    FinishPayload {
                        success: false,
                        exit_code: -1,
                        message: format!("Failed to wait for Image AI engine: {}", e),
                    },
                );
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn is_job_active() -> bool {
    FOREGROUND_JOB.lock().unwrap().is_some()
}

#[tauri::command]
pub fn force_exit_app(app: tauri::AppHandle) {
    kill_all_jobs();
    app.exit(0);
}
