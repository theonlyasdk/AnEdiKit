use crate::models::HardwareInfo;
use std::process::Command;
use std::sync::Mutex;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

static HARDWARE_INFO_CACHE: Mutex<Option<HardwareInfo>> = Mutex::new(None);

pub(crate) fn percent_decode_path(input: &str) -> String {
    // Only percent-decode file:// URLs. Plain filesystem paths (which may
    // legitimately contain '%' e.g. `Promo_100%_Final.mp4` or `%20` folders)
    // must be returned verbatim to avoid path corruption.
    let trimmed = input.trim();
    let url_path: Option<&str> = if trimmed.starts_with("file:///") {
        // Keep one leading slash: "file:///home/x" -> "/home/x",
        // "file:///C:/x" -> "/C:/x" (drive slash stripped below).
        Some(&trimmed[7..])
    } else if trimmed.starts_with("file://") {
        Some(&trimmed[7..])
    } else {
        None
    };

    match url_path {
        Some(p) => {
            // Strip optional "localhost" authority: file://localhost/C:/...
            let p = p.strip_prefix("localhost/").unwrap_or(p);
            let p = p.strip_prefix("localhost").unwrap_or(p);
            // Normalize Windows drive prefix: "/C:/..." -> "C:/...",
            // "/C|/..." (legacy) -> "C:/...".
            if p.len() >= 3
                && p.as_bytes()[0] == b'/'
                && p.as_bytes()[1].is_ascii_alphabetic()
                && (p.as_bytes()[2] == b':' || p.as_bytes()[2] == b'|')
            {
                let mut owned = String::with_capacity(p.len());
                owned.push(p.as_bytes()[1] as char);
                owned.push(':');
                owned.push_str(&p[3..]);
                return percent_decode_str(&owned);
            }
            percent_decode_str(p)
        }
        None => input.to_string(),
    }
}

fn percent_decode_str(clean: &str) -> String {
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
pub fn pick_file(filter_mode: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new();
    match filter_mode.as_deref() {
        Some("pdf") => {
            dialog = dialog.add_filter("PDF Files", &["pdf"]);
        }
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
pub fn pick_files(filter_mode: Option<String>) -> Vec<String> {
    let mut dialog = rfd::FileDialog::new();
    match filter_mode.as_deref() {
        Some("pdf") => {
            dialog = dialog.add_filter("PDF Files", &["pdf"]);
        }
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
pub fn save_image_as(source_path: String, suggested_name: Option<String>) -> Result<Option<String>, String> {
    let decoded = percent_decode_path(&source_path);
    let src = std::path::Path::new(&decoded);
    if !src.exists() || !src.is_file() {
        return Err("Source image does not exist".into());
    }
    let default_name = suggested_name.filter(|n| !n.trim().is_empty()).unwrap_or_else(|| {
        src.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "image.png".to_string())
    });
    let mut dialog = rfd::FileDialog::new().set_file_name(&default_name);
    dialog = dialog.add_filter(
        "Image Files",
        &["png", "jpg", "jpeg", "webp", "bmp", "tiff", "gif"],
    );
    if let Some(parent) = src.parent() {
        if parent.exists() {
            dialog = dialog.set_directory(parent);
        }
    }
    let dest = match dialog.save_file() {
        Some(p) => p,
        None => return Ok(None),
    };
    std::fs::copy(src, &dest).map_err(|e| format!("Failed to save image: {}", e))?;
    Ok(Some(dest.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn write_temp_text_file(filename: String, content: String) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join(&filename);
    std::fs::write(&file_path, content.as_bytes())
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn replace_file(source_temp: String, target_dest: String) -> Result<(), String> {
    let src_decoded = percent_decode_path(&source_temp);
    let dst_decoded = percent_decode_path(&target_dest);
    let src = std::path::Path::new(&src_decoded);
    let dst = std::path::Path::new(&dst_decoded);
    if !src.exists() {
        return Err("Source file does not exist".into());
    }
    std::fs::copy(src, dst).map_err(|e| format!("Failed to overwrite target file: {}", e))?;
    let _ = std::fs::remove_file(src);
    Ok(())
}

#[tauri::command]
pub fn pick_folder(default_path: Option<String>) -> Option<String> {
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
pub fn check_file_exists(file_path: String) -> bool {
    let decoded = percent_decode_path(&file_path);
    let p = std::path::Path::new(&decoded);
    p.exists() && p.is_file()
}

pub(crate) fn read_image_data_internal(file_path: String) -> Result<String, String> {
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
pub async fn read_image_data(file_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || read_image_data_internal(file_path))
        .await
        .map_err(|e| format!("Async task execution failed: {}", e))?
}

#[tauri::command]
pub fn open_file(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let decoded = percent_decode_path(&file_path);
    let path = std::path::Path::new(&decoded);
    if !path.exists() {
        return Err("File does not exist".into());
    }
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(decoded, None::<&str>)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn show_in_folder(file_path: String) -> Result<(), String> {
    let decoded = percent_decode_path(&file_path);
    let path = std::path::Path::new(&decoded);
    #[cfg(windows)]
    {
        if path.is_dir() {
            let _ = Command::new("explorer")
                .arg(&decoded)
                .creation_flags(0x08000000)
                .spawn();
        } else if path.is_file() {
            let _ = Command::new("explorer")
                .arg(format!("/select,{}", decoded))
                .creation_flags(0x08000000)
                .spawn();
        } else if let Some(parent) = path.parent() {
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

#[tauri::command]
pub fn send_system_notification(title: String, body: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let script = "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; \
            $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); \
            $textNodes = $template.GetElementsByTagName('text'); \
            $textNodes.Item(0).AppendChild($template.CreateTextNode($env:ANEDIKIT_TOAST_TITLE)) > $null; \
            $textNodes.Item(1).AppendChild($template.CreateTextNode($env:ANEDIKIT_TOAST_BODY)) > $null; \
            $toast = [Windows.UI.Notifications.ToastNotification]::new($template); \
            [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('AnEdiKit').Show($toast);";
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script]);
        cmd.env("ANEDIKIT_TOAST_TITLE", &title);
        cmd.env("ANEDIKIT_TOAST_BODY", &body);
        cmd.creation_flags(0x08000000);
        let _ = cmd.spawn();
    }
    Ok(())
}

pub(crate) fn get_hardware_info_internal() -> HardwareInfo {
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

    let ffmpeg_bin = crate::tools::find_binary("ffmpeg");

    let ff_nvenc = ffmpeg_bin.clone();
    let t_nvenc = std::thread::spawn(move || probe_encoder_available(&ff_nvenc, "h264_nvenc"));

    let ff_qsv = ffmpeg_bin.clone();
    let t_qsv = std::thread::spawn(move || probe_encoder_available(&ff_qsv, "h264_qsv"));

    let ff_amf = ffmpeg_bin.clone();
    let t_amf = std::thread::spawn(move || probe_encoder_available(&ff_amf, "h264_amf"));

    let ff_d3d = ffmpeg_bin.clone();
    let t_d3d = std::thread::spawn(move || probe_hwaccel_available(&ff_d3d, "d3d11va"));

    let ff_vt = ffmpeg_bin.clone();
    let t_vt = std::thread::spawn(move || {
        #[cfg(target_os = "macos")]
        {
            probe_encoder_available(&ff_vt, "h264_videotoolbox")
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = ff_vt;
            false
        }
    });

    let nvenc_available = t_nvenc.join().unwrap_or(false);
    let qsv_available = t_qsv.join().unwrap_or(false);
    let amf_available = t_amf.join().unwrap_or(false);
    let d3d11va_available = t_d3d.join().unwrap_or(false);
    let videotoolbox_available = t_vt.join().unwrap_or(false);

    let default_recommended = if nvenc_available {
        "cuda".to_string()
    } else if qsv_available {
        "qsv".to_string()
    } else if amf_available {
        "amf".to_string()
    } else if videotoolbox_available {
        "videotoolbox".to_string()
    } else if d3d11va_available {
        "d3d11va".to_string()
    } else {
        "cpu".to_string()
    };

    let result = HardwareInfo {
        cpu_name,
        nvidia_gpu,
        intel_gpu,
        amd_gpu,
        default_recommended,
        nvenc_available,
        qsv_available,
        amf_available,
        d3d11va_available,
        videotoolbox_available,
    };

    let mut cache = HARDWARE_INFO_CACHE.lock().unwrap();
    *cache = Some(result.clone());
    result
}

pub fn probe_encoder_available(ffmpeg_bin: &str, encoder: &str) -> bool {
    let mut cmd = Command::new(ffmpeg_bin);
    cmd.args([
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=s=256x256:d=0.04",
        "-c:v",
        encoder,
        "-f",
        "null",
        "-",
    ]);
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    match cmd.status() {
        Ok(s) => s.success(),
        Err(_) => false,
    }
}

pub fn probe_hwaccel_available(ffmpeg_bin: &str, method: &str) -> bool {
    let mut cmd = Command::new(ffmpeg_bin);
    cmd.args([
        "-y",
        "-hwaccel",
        method,
        "-f",
        "lavfi",
        "-i",
        "color=s=256x256:d=0.04",
        "-f",
        "null",
        "-",
    ]);
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    match cmd.status() {
        Ok(s) => s.success(),
        Err(_) => false,
    }
}

#[tauri::command]
pub async fn get_hardware_info() -> HardwareInfo {
    tauri::async_runtime::spawn_blocking(move || get_hardware_info_internal())
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub async fn probe_hardware_acceleration() -> HardwareInfo {
    tauri::async_runtime::spawn_blocking(move || get_hardware_info_internal())
        .await
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    /// Unique per-process temp file name so parallel or repeated runs never collide.
    fn unique_name(tag: &str) -> String {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
        format!("anedikit_test_{}_{}_{}_{}", tag, std::process::id(), nanos, seq)
    }

    /// Removes the tracked temp files on drop, including after a panic.
    struct TempCleanup(Vec<PathBuf>);

    impl Drop for TempCleanup {
        fn drop(&mut self) {
            for path in &self.0 {
                let _ = std::fs::remove_file(path);
            }
        }
    }

    fn temp_path(tag: &str) -> PathBuf {
        std::env::temp_dir().join(unique_name(tag))
    }

    #[test]
    fn temp_text_file_round_trip() {
        let src_path = temp_path("src.txt");
        let dest_path = temp_path("dest.txt");
        let _cleanup = TempCleanup(vec![src_path.clone(), dest_path.clone()]);

        // A pre-existing destination proves replace_file overwrites it.
        std::fs::write(&dest_path, b"before").unwrap();

        let written = write_temp_text_file(
            src_path.file_name().unwrap().to_string_lossy().to_string(),
            "after".to_string(),
        )
        .unwrap();
        assert_eq!(PathBuf::from(&written), src_path);
        assert!(
            check_file_exists(written.clone()),
            "temp file should exist right after write_temp_text_file"
        );

        replace_file(written.clone(), dest_path.to_string_lossy().to_string()).unwrap();

        assert_eq!(std::fs::read_to_string(&dest_path).unwrap(), "after");
        assert!(
            !src_path.exists(),
            "replace_file should remove the source temp file"
        );
        assert!(
            !check_file_exists(written),
            "check_file_exists should report the consumed source as gone"
        );
    }

    #[test]
    fn replace_file_errors_when_source_is_missing() {
        let missing = temp_path("missing.txt");
        let dest = temp_path("missing_dest.txt");
        let _cleanup = TempCleanup(vec![missing.clone(), dest.clone()]);

        let err = replace_file(
            missing.to_string_lossy().to_string(),
            dest.to_string_lossy().to_string(),
        )
        .unwrap_err();
        assert!(
            err.contains("Source file does not exist"),
            "unexpected error message: {err}"
        );
    }

    #[test]
    fn check_file_exists_distinguishes_files_from_missing_paths() {
        let file = temp_path("exists.txt");
        let _cleanup = TempCleanup(vec![file.clone()]);

        assert!(!check_file_exists(file.to_string_lossy().to_string()));

        std::fs::write(&file, b"x").unwrap();
        assert!(check_file_exists(file.to_string_lossy().to_string()));
    }

    #[test]
    fn percent_decode_path_regressions() {
        let cases: [(&str, &str); 10] = [
            // Plain filesystem paths are returned verbatim, literal '%' included.
            (
                r"C:\Users\me\Promo_100%_Final.mp4",
                r"C:\Users\me\Promo_100%_Final.mp4",
            ),
            (
                "/home/user/My%20Videos/clip.mp4",
                "/home/user/My%20Videos/clip.mp4",
            ),
            // file:// URLs are decoded, including drive-slash normalization.
            ("file:///C:/Videos/My%20Video.mp4", "C:/Videos/My Video.mp4"),
            (
                "file:///C:/Videos/Promo_100%_Final.mp4",
                "C:/Videos/Promo_100%_Final.mp4",
            ),
            (
                "file:///C:/Videos/Promo_100%25_Final.mp4",
                "C:/Videos/Promo_100%_Final.mp4",
            ),
            ("file://localhost/C:/Videos/a%20b.mp4", "C:/Videos/a b.mp4"),
            ("file:///C|/Videos/a.mp4", "C:/Videos/a.mp4"),
            ("file:///home/user/My%20Video.mp4", "/home/user/My Video.mp4"),
            ("file:///C:/a%2Fb.mp4", "C:/a/b.mp4"),
            ("file:///C:/100%", "C:/100%"),
        ];

        for (input, expected) in cases {
            assert_eq!(percent_decode_path(input), expected, "input: {input}");
        }
    }
}
