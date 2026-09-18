use crate::models::{ToolDownloadProgressPayload, ToolExtractProgressPayload};
use std::collections::HashMap;
use std::io::{BufReader, Read, Write};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::LazyLock;
use std::sync::Mutex;
use tauri::Emitter;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

pub(crate) static BINARY_PATH_CACHE: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
static ACTIVE_TOOL_CHILD_PID: LazyLock<Mutex<Option<u32>>> = LazyLock::new(|| Mutex::new(None));
static TOOL_UPDATE_CANCELLED: LazyLock<AtomicBool> = LazyLock::new(|| AtomicBool::new(false));
static ACTIVE_TEMP_PATHS: LazyLock<Mutex<Vec<std::path::PathBuf>>> = LazyLock::new(|| Mutex::new(Vec::new()));

pub(crate) fn register_temp_path(path: std::path::PathBuf) {
    ACTIVE_TEMP_PATHS.lock().unwrap().push(path);
}

pub(crate) fn unregister_temp_path(path: &std::path::Path) {
    ACTIVE_TEMP_PATHS.lock().unwrap().retain(|p| p != path);
}

pub(crate) fn cleanup_temp_paths() {
    let mut paths = ACTIVE_TEMP_PATHS.lock().unwrap();
    for p in paths.drain(..) {
        if p.is_dir() {
            let _ = std::fs::remove_dir_all(&p);
        } else if p.is_file() {
            let _ = std::fs::remove_file(&p);
        }
    }
}

pub(crate) fn find_binary(bin: &str) -> String {
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

pub(crate) fn resolve_binary_path(bin: &str) -> String {
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

#[tauri::command]
pub fn check_tool_versions() -> HashMap<String, String> {
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

    let t_python = std::thread::spawn(|| {
        let bin = find_binary("python");
        let mut cmd = Command::new(&bin);
        cmd.arg("--version");
        #[cfg(windows)]
        cmd.creation_flags(0x08000000);
        if let Ok(out) = cmd.output() {
            if out.status.success() {
                let out_str = String::from_utf8_lossy(&out.stdout);
                let err_str = String::from_utf8_lossy(&out.stderr);
                let s = if !out_str.trim().is_empty() { out_str } else { err_str };
                if let Some(line1) = s.lines().next() {
                    let trimmed = line1.trim();
                    if trimmed.to_lowercase().starts_with("python") {
                        let parts: Vec<&str> = trimmed.split_whitespace().collect();
                        if parts.len() >= 2 {
                            return parts[1].to_string();
                        }
                        return trimmed.to_string();
                    }
                }
            }
        }

        // Fallback to py -3 --version on Windows
        let bin_py = find_binary("py");
        let mut cmd_py = Command::new(&bin_py);
        cmd_py.args(["-3", "--version"]);
        #[cfg(windows)]
        cmd_py.creation_flags(0x08000000);
        if let Ok(out) = cmd_py.output() {
            if out.status.success() {
                let out_str = String::from_utf8_lossy(&out.stdout);
                let err_str = String::from_utf8_lossy(&out.stderr);
                let s = if !out_str.trim().is_empty() { out_str } else { err_str };
                if let Some(line1) = s.lines().next() {
                    let trimmed = line1.trim();
                    if trimmed.to_lowercase().starts_with("python") {
                        let parts: Vec<&str> = trimmed.split_whitespace().collect();
                        if parts.len() >= 2 {
                            return parts[1].to_string();
                        }
                        return trimmed.to_string();
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
    let python_ver = t_python.join().unwrap_or_else(|_| "Not Found".into());

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

    map.insert("python".to_string(), python_ver.clone());
    map.insert("python_installed".to_string(), python_ver);

    map
}

pub(crate) fn format_size(bytes: u64) -> String {
    if bytes >= 1024 * 1024 * 1024 {
        format!("{:.2}G", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    } else if bytes >= 1024 * 1024 {
        format!("{:.1}M", bytes as f64 / (1024.0 * 1024.0))
    } else if bytes >= 1024 {
        format!("{}k", bytes / 1024)
    } else {
        format!("{}B", bytes)
    }
}

pub(crate) fn run_curl_download_verbose(
    app: &tauri::AppHandle,
    tool_name: &str,
    url: &str,
    output_path: &std::path::Path,
) -> Result<(), String> {
    let temp_dir = std::env::temp_dir();
    let temp_download_file = temp_dir.join(format!(
        "anedikit_dl_{}_{}.part",
        tool_name,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    ));

    register_temp_path(temp_download_file.clone());

    let mut cmd = Command::new("curl.exe");
    cmd.args([
        "-fL",
        "--retry", "2",
        "--retry-delay", "1",
        "-o",
        temp_download_file.to_string_lossy().as_ref(),
        url,
    ]);
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    TOOL_UPDATE_CANCELLED.store(false, Ordering::SeqCst);
    let mut child = cmd.spawn().map_err(|e| {
        let _ = std::fs::remove_file(&temp_download_file);
        unregister_temp_path(&temp_download_file);
        format!("Failed to run curl: {}", e)
    })?;
    let pid = child.id();
    *ACTIVE_TOOL_CHILD_PID.lock().unwrap() = Some(pid);
    let stderr = child.stderr.take();

    let app_clone = app.clone();
    let tool_name_owned = tool_name.to_string();

    let reader_thread = std::thread::spawn(move || {
        if let Some(mut err_pipe) = stderr {
            let mut byte_buf = [0u8; 1];
            let mut line_buf = Vec::with_capacity(256);
            let mut last_reported_pct: i32 = -1;

            while let Ok(n) = err_pipe.read(&mut byte_buf) {
                if n == 0 {
                    break;
                }
                let b = byte_buf[0];
                if b == b'\r' || b == b'\n' {
                    if !line_buf.is_empty() {
                        let text = String::from_utf8_lossy(&line_buf);
                        let trimmed = text.trim();
                        let parts: Vec<&str> = trimmed.split_whitespace().collect();
                        if parts.len() >= 4 {
                            if let Ok(pct_val) = parts[0].parse::<f32>() {
                                let total_str = parts[1];
                                let dl_str = parts[3];
                                let (speed_str, eta_str) = if parts.len() >= 12 {
                                    (Some(parts[11].to_string()), Some(parts[10].to_string()))
                                } else if parts.len() == 11 {
                                    (Some(parts[10].to_string()), None)
                                } else if parts.len() >= 7 {
                                    (Some(parts[6].to_string()), None)
                                } else {
                                    (None, None)
                                };

                                if total_str != "0" && dl_str != "0" {
                                    let rounded = pct_val.round() as i32;
                                    if rounded != last_reported_pct {
                                        last_reported_pct = rounded;
                                        let _ = app_clone.emit(
                                            "tool_download_progress",
                                            ToolDownloadProgressPayload {
                                                tool_name: tool_name_owned.clone(),
                                                pct: pct_val,
                                                downloaded: Some(dl_str.to_string()),
                                                total: Some(total_str.to_string()),
                                                speed: speed_str,
                                                eta: eta_str,
                                            },
                                        );
                                    }
                                }
                            }
                        }
                        line_buf.clear();
                    }
                } else {
                    line_buf.push(b);
                }
            }
        }
    });

    let status = child.wait().map_err(|e| format!("Failed to wait for curl: {}", e))?;
    *ACTIVE_TOOL_CHILD_PID.lock().unwrap() = None;
    let _ = reader_thread.join();

    if TOOL_UPDATE_CANCELLED.load(Ordering::SeqCst) {
        if temp_download_file.exists() {
            let _ = std::fs::remove_file(&temp_download_file);
        }
        unregister_temp_path(&temp_download_file);
        return Err("Download cancelled by user".to_string());
    }

    if !status.success() || !temp_download_file.exists() {
        if temp_download_file.exists() {
            let _ = std::fs::remove_file(&temp_download_file);
        }
        unregister_temp_path(&temp_download_file);
        return Err(format!("Download failed with exit code {:?}", status.code()));
    }

    // Move / copy completed temporary file over to output_path cleanly
    if let Some(parent) = output_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::copy(&temp_download_file, output_path)
        .map_err(|e| format!("Failed to copy downloaded file to destination: {}", e))?;
    let _ = std::fs::remove_file(&temp_download_file);
    unregister_temp_path(&temp_download_file);

    let _ = app.emit(
        "tool_download_progress",
        ToolDownloadProgressPayload {
            tool_name: tool_name.to_string(),
            pct: 100.0,
            downloaded: None,
            total: None,
            speed: None,
            eta: None,
        },
    );

    Ok(())
}

pub(crate) fn extract_zip_archive_verbose(
    app: &tauri::AppHandle,
    tool_name: &str,
    zip_path: &std::path::Path,
    dest_dir: &std::path::Path,
    files_filter: Option<&[&str]>,
) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| format!("Failed to open downloaded archive: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip archive format: {}", e))?;

    let total = archive.len();
    for i in 0..total {
        if TOOL_UPDATE_CANCELLED.load(Ordering::SeqCst) {
            return Err("Archive extraction cancelled by user".to_string());
        }
        let mut file_entry = archive.by_index(i).map_err(|e| format!("Failed to read zip entry #{}: {}", i, e))?;
        let outpath = match file_entry.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue,
        };

        let file_name_str = outpath.to_string_lossy().replace('\\', "/");

        if let Some(filters) = files_filter {
            let matches_filter = filters.iter().any(|f| {
                file_name_str.ends_with(f) || file_name_str.eq_ignore_ascii_case(f)
            });
            if !matches_filter && !file_entry.is_dir() {
                continue;
            }
        }

        let target_path = dest_dir.join(&outpath);

        if file_entry.is_dir() {
            let _ = std::fs::create_dir_all(&target_path);
        } else {
            if let Some(p) = target_path.parent() {
                if !p.exists() {
                    let _ = std::fs::create_dir_all(p);
                }
            }

            let file_size = file_entry.size();
            let total_str = format_size(file_size);

            let mut outfile = std::fs::File::create(&target_path).map_err(|e| format!("Failed creating destination file: {}", e))?;

            // Emit initial extraction progress for this single file
            let _ = app.emit(
                "tool_extraction_progress",
                ToolExtractProgressPayload {
                    tool_name: tool_name.to_string(),
                    step: file_name_str.clone(),
                    progress: Some(format!("0B/{}", total_str)),
                },
            );

            let mut buf = [0u8; 131072]; // 128 KB buffer
            let mut extracted_bytes: u64 = 0;
            let mut last_pct: u32 = 0;

            while let Ok(n) = file_entry.read(&mut buf) {
                if TOOL_UPDATE_CANCELLED.load(Ordering::SeqCst) {
                    return Err("Archive extraction cancelled by user".to_string());
                }
                if n == 0 {
                    break;
                }
                outfile.write_all(&buf[..n]).map_err(|e| format!("Failed writing archive content: {}", e))?;
                extracted_bytes += n as u64;

                let pct = if file_size > 0 {
                    ((extracted_bytes as f64 / file_size as f64) * 100.0) as u32
                } else {
                    100
                };

                if pct > last_pct && (pct - last_pct >= 2 || pct == 100) {
                    last_pct = pct;
                    let _ = app.emit(
                        "tool_extraction_progress",
                        ToolExtractProgressPayload {
                            tool_name: tool_name.to_string(),
                            step: file_name_str.clone(),
                            progress: Some(format!("{}/{}", format_size(extracted_bytes), total_str)),
                        },
                    );
                }
            }
        }
    }

    Ok(())
}

pub(crate) fn update_tool_internal(app: &tauri::AppHandle, tool_name: String) -> Result<String, String> {
    TOOL_UPDATE_CANCELLED.store(false, Ordering::SeqCst);

    // Clear binary path cache so version checks re-evaluate
    {
        let mut cache = BINARY_PATH_CACHE.lock().unwrap();
        *cache = None;
    }

    let clean_name = tool_name.trim().to_lowercase().replace('_', "-");
    match clean_name.as_str() {
        "yt-dlp" | "ytdlp" => {
            let bin = find_binary("yt-dlp");
            let is_existing = (bin != "yt-dlp" && std::path::Path::new(&bin).is_file())
                || std::path::Path::new(&bin).is_file();

            if !is_existing {
                let target_dir = if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
                    std::path::PathBuf::from(local_app_data)
                        .join("ASDK")
                        .join("Shared")
                        .join("bin")
                } else {
                    return Err("LOCALAPPDATA directory environment variable not found".into());
                };
                std::fs::create_dir_all(&target_dir).map_err(|e| format!("Failed to create bin folder: {}", e))?;
                let out_file = target_dir.join("yt-dlp.exe");
                let dl_url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
                run_curl_download_verbose(app, "yt-dlp", dl_url, &out_file)?;
                {
                    let mut cache = BINARY_PATH_CACHE.lock().unwrap();
                    *cache = None;
                }
                return Ok("yt-dlp successfully downloaded and installed.".into());
            }

            let mut cmd = Command::new(&bin);
            cmd.arg("-U");
            cmd.stdout(Stdio::piped());
            cmd.stderr(Stdio::piped());
            #[cfg(windows)]
            cmd.creation_flags(0x08000000);

            TOOL_UPDATE_CANCELLED.store(false, Ordering::SeqCst);
            let mut child = cmd.spawn().map_err(|e| format!("Failed to execute yt-dlp update: {}", e))?;
            let pid = child.id();
            *ACTIVE_TOOL_CHILD_PID.lock().unwrap() = Some(pid);
            let stdout = child.stdout.take();

            let app_out = app.clone();
            let tool_out = tool_name.to_string();
            let handle_stdout = std::thread::spawn(move || {
                if let Some(out) = stdout {
                    use std::io::BufRead;
                    let reader = BufReader::new(out);
                    for line in reader.lines().flatten() {
                        let trimmed = line.trim().to_string();
                        if !trimmed.is_empty() {
                            let _ = app_out.emit(
                                "tool_extraction_progress",
                                ToolExtractProgressPayload {
                                    tool_name: tool_out.clone(),
                                    step: trimmed,
                                    progress: None,
                                },
                            );
                        }
                    }
                }
            });

            let status = child.wait().map_err(|e| format!("Failed to wait for yt-dlp: {}", e))?;
            *ACTIVE_TOOL_CHILD_PID.lock().unwrap() = None;
            let _ = handle_stdout.join();

            if TOOL_UPDATE_CANCELLED.load(Ordering::SeqCst) {
                return Err("yt-dlp update cancelled by user".into());
            }

            // Clear cache again after update so version query sees the fresh binary
            {
                let mut cache = BINARY_PATH_CACHE.lock().unwrap();
                *cache = None;
            }

            if status.success() {
                Ok("yt-dlp update check completed successfully".into())
            } else {
                Err(format!("yt-dlp update failed with exit code {:?}", status.code()))
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
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis();
            let zip_path = temp_dir.join(format!("deno_update_{}.zip", timestamp));
            let extract_tmp_dir = temp_dir.join(format!("deno_extract_{}", timestamp));
            register_temp_path(zip_path.clone());
            register_temp_path(extract_tmp_dir.clone());

            // Fetch Deno latest release zip from GitHub with live progress streaming
            let download_url = "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip";
            let dl_res = run_curl_download_verbose(app, "deno", download_url, &zip_path);
            if dl_res.is_err() || !zip_path.exists() {
                let _ = std::fs::remove_file(&zip_path);
                unregister_temp_path(&zip_path);
                let _ = std::fs::remove_dir_all(&extract_tmp_dir);
                unregister_temp_path(&extract_tmp_dir);
                return Err(format!("Failed to download Deno from GitHub: {:?}", dl_res.err()));
            }

            if TOOL_UPDATE_CANCELLED.load(Ordering::SeqCst) {
                let _ = std::fs::remove_file(&zip_path);
                unregister_temp_path(&zip_path);
                let _ = std::fs::remove_dir_all(&extract_tmp_dir);
                unregister_temp_path(&extract_tmp_dir);
                return Err("Deno update cancelled by user".into());
            }

            let _ = std::fs::create_dir_all(&extract_tmp_dir);
            // Extract deno.exe into temporary directory first
            let ext_res = extract_zip_archive_verbose(
                app,
                "deno",
                &zip_path,
                &extract_tmp_dir,
                Some(&["deno.exe"]),
            );
            let _ = std::fs::remove_file(&zip_path);
            unregister_temp_path(&zip_path);

            if let Err(e) = ext_res {
                let _ = std::fs::remove_dir_all(&extract_tmp_dir);
                unregister_temp_path(&extract_tmp_dir);
                return Err(e);
            }

            if TOOL_UPDATE_CANCELLED.load(Ordering::SeqCst) {
                let _ = std::fs::remove_dir_all(&extract_tmp_dir);
                unregister_temp_path(&extract_tmp_dir);
                return Err("Deno update cancelled by user".into());
            }

            let extracted_deno = extract_tmp_dir.join("deno.exe");
            if extracted_deno.is_file() {
                std::fs::copy(&extracted_deno, target_dir.join("deno.exe"))
                    .map_err(|e| format!("Failed to copy deno.exe to destination: {}", e))?;
            }
            let _ = std::fs::remove_dir_all(&extract_tmp_dir);
            unregister_temp_path(&extract_tmp_dir);

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
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis();
            let zip_path = temp_dir.join(format!("ffmpeg_update_{}.zip", timestamp));
            let extract_tmp_dir = temp_dir.join(format!("ffmpeg_update_extracted_{}", timestamp));
            register_temp_path(zip_path.clone());
            register_temp_path(extract_tmp_dir.clone());
            let _ = std::fs::remove_file(&zip_path);
            let _ = std::fs::remove_dir_all(&extract_tmp_dir);
            let _ = std::fs::create_dir_all(&extract_tmp_dir);

            // Primary source: BtbN/FFmpeg-Builds latest master GPL build
            let primary_url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";
            let mut used_fallback = false;

            let dl_res = run_curl_download_verbose(app, "ffmpeg", primary_url, &zip_path);
            if dl_res.is_err() || !zip_path.exists() {
                if TOOL_UPDATE_CANCELLED.load(Ordering::SeqCst) {
                    let _ = std::fs::remove_file(&zip_path);
                    unregister_temp_path(&zip_path);
                    let _ = std::fs::remove_dir_all(&extract_tmp_dir);
                    unregister_temp_path(&extract_tmp_dir);
                    return Err("FFmpeg update cancelled by user".into());
                }

                used_fallback = true;
                let fallback_ffmpeg = "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-win-64.zip";
                let fallback_ffprobe = "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffprobe-6.1-win-64.zip";

                let fb_res = run_curl_download_verbose(app, "ffmpeg", fallback_ffmpeg, &zip_path);
                if fb_res.is_err() || !zip_path.exists() {
                    let _ = std::fs::remove_file(&zip_path);
                    unregister_temp_path(&zip_path);
                    let _ = std::fs::remove_dir_all(&extract_tmp_dir);
                    unregister_temp_path(&extract_tmp_dir);
                    return Err("Failed to download FFmpeg from primary and alternative GitHub sources.".into());
                }

                if TOOL_UPDATE_CANCELLED.load(Ordering::SeqCst) {
                    let _ = std::fs::remove_file(&zip_path);
                    unregister_temp_path(&zip_path);
                    let _ = std::fs::remove_dir_all(&extract_tmp_dir);
                    unregister_temp_path(&extract_tmp_dir);
                    return Err("FFmpeg update cancelled by user".into());
                }

                // Also download ffprobe zip
                let probe_zip = temp_dir.join(format!("ffprobe_fallback_{}.zip", timestamp));
                register_temp_path(probe_zip.clone());
                if run_curl_download_verbose(app, "ffprobe", fallback_ffprobe, &probe_zip).is_ok() && probe_zip.exists() {
                    let _ = extract_zip_archive_verbose(
                        app,
                        "ffprobe",
                        &probe_zip,
                        &extract_tmp_dir,
                        None,
                    );
                }
                let _ = std::fs::remove_file(&probe_zip);
                unregister_temp_path(&probe_zip);
            }

            if TOOL_UPDATE_CANCELLED.load(Ordering::SeqCst) {
                let _ = std::fs::remove_file(&zip_path);
                unregister_temp_path(&zip_path);
                let _ = std::fs::remove_dir_all(&extract_tmp_dir);
                unregister_temp_path(&extract_tmp_dir);
                return Err("FFmpeg update cancelled by user".into());
            }

            // Always extract into extract_tmp_dir first to protect existing binaries
            let zip_res = extract_zip_archive_verbose(
                app,
                "ffmpeg",
                &zip_path,
                &extract_tmp_dir,
                None,
            );
            let _ = std::fs::remove_file(&zip_path);
            unregister_temp_path(&zip_path);

            if let Err(e) = zip_res {
                let _ = std::fs::remove_dir_all(&extract_tmp_dir);
                unregister_temp_path(&extract_tmp_dir);
                return Err(format!("Failed to extract FFmpeg archive: {}", e));
            }

            if TOOL_UPDATE_CANCELLED.load(Ordering::SeqCst) {
                let _ = std::fs::remove_dir_all(&extract_tmp_dir);
                unregister_temp_path(&extract_tmp_dir);
                return Err("FFmpeg update cancelled by user".into());
            }

            // Locate ffmpeg.exe and ffprobe.exe inside extracted directory structure
            let mut found_ffmpeg = false;
            let mut found_ffprobe = false;

            fn find_binaries_in_dir(
                dir: &std::path::Path,
                ffmpeg_path: &mut Option<std::path::PathBuf>,
                ffprobe_path: &mut Option<std::path::PathBuf>,
            ) {
                if let Ok(entries) = std::fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() {
                            let name = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                            if name == "ffmpeg.exe" {
                                *ffmpeg_path = Some(path.clone());
                            } else if name == "ffprobe.exe" {
                                *ffprobe_path = Some(path.clone());
                            }
                        } else if path.is_dir() {
                            find_binaries_in_dir(&path, ffmpeg_path, ffprobe_path);
                        }
                    }
                }
            }

            let mut ffmpeg_found = None;
            let mut ffprobe_found = None;
            find_binaries_in_dir(&extract_tmp_dir, &mut ffmpeg_found, &mut ffprobe_found);

            if let Some(src_ffmpeg) = ffmpeg_found {
                let _ = app.emit(
                    "tool_extraction_progress",
                    ToolExtractProgressPayload {
                        tool_name: "ffmpeg".to_string(),
                        step: "bin/ffmpeg.exe".to_string(),
                        progress: Some("verified".to_string()),
                    },
                );
                let _ = std::fs::copy(&src_ffmpeg, target_dir.join("ffmpeg.exe"));
                found_ffmpeg = true;
            }

            if let Some(src_ffprobe) = ffprobe_found {
                let _ = app.emit(
                    "tool_extraction_progress",
                    ToolExtractProgressPayload {
                        tool_name: "ffmpeg".to_string(),
                        step: "bin/ffprobe.exe".to_string(),
                        progress: Some("verified".to_string()),
                    },
                );
                let _ = std::fs::copy(&src_ffprobe, target_dir.join("ffprobe.exe"));
                found_ffprobe = true;
            }

            let _ = app.emit(
                "tool_extraction_progress",
                ToolExtractProgressPayload {
                    tool_name: "ffmpeg".to_string(),
                    step: "finishing up...".to_string(),
                    progress: None,
                },
            );
            let _ = std::fs::remove_dir_all(&extract_tmp_dir);
            unregister_temp_path(&extract_tmp_dir);

            if !found_ffmpeg && !found_ffprobe {
                return Err("Could not locate ffmpeg/ffprobe binaries in downloaded release archive.".into());
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
pub async fn update_tool(app_handle: tauri::AppHandle, tool_name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || update_tool_internal(&app_handle, tool_name))
        .await
        .map_err(|e| format!("Update task failed: {}", e))?
}

pub(crate) fn delete_tool_internal(tool_name: String) -> Result<String, String> {
    {
        let mut cache = BINARY_PATH_CACHE.lock().unwrap();
        *cache = None;
    }

    let clean_name = tool_name.trim().to_lowercase().replace('_', "-");
    let mut deleted_files = Vec::new();

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let bin_dir = std::path::PathBuf::from(local_app_data)
            .join("ASDK")
            .join("Shared")
            .join("bin");

        let files_to_check = match clean_name.as_str() {
            "yt-dlp" | "ytdlp" => vec!["yt-dlp.exe", "yt-dlp"],
            "ffmpeg" | "ffprobe" | "ffmpeg / ffprobe" | "ffmpeg & ffprobe" => vec!["ffmpeg.exe", "ffprobe.exe", "ffmpeg", "ffprobe"],
            "deno" => vec!["deno.exe", "deno"],
            _ => vec![],
        };

        for fname in files_to_check {
            let p = bin_dir.join(fname);
            if p.is_file() {
                if std::fs::remove_file(&p).is_ok() {
                    deleted_files.push(fname.to_string());
                }
            }
        }
    }

    {
        let mut cache = BINARY_PATH_CACHE.lock().unwrap();
        *cache = None;
    }

    if !deleted_files.is_empty() {
        Ok(format!("Successfully removed {}", deleted_files.join(", ")))
    } else {
        Err(format!("No local binary files found to delete for {}. (System binaries in PATH cannot be deleted from app)", tool_name))
    }
}

#[tauri::command]
pub async fn delete_tool(tool_name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || delete_tool_internal(tool_name))
        .await
        .map_err(|e| format!("Delete task failed: {}", e))?
}

#[tauri::command]
pub fn open_binaries_folder() -> Result<(), String> {
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
pub fn cancel_tool_update() -> Result<String, String> {
    TOOL_UPDATE_CANCELLED.store(true, Ordering::SeqCst);
    let pid = ACTIVE_TOOL_CHILD_PID.lock().unwrap().take();
    if let Some(pid) = pid {
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
    cleanup_temp_paths();
    Ok("Tool update cancelled".into())
}
