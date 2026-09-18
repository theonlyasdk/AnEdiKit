use crate::models::{AudioMetadataInfo, MediaInfo, PlaylistVideo};
use crate::system::percent_decode_path;
use crate::tools::find_binary;
use std::io::{BufReader, Read};
use std::process::{Command, Stdio};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

pub(crate) fn get_thumb_cache_dir(subfolder: &str) -> std::path::PathBuf {
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

pub(crate) fn compute_file_hash(path: &std::path::Path) -> String {
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

pub(crate) fn get_media_info_internal(file_path: String) -> Result<MediaInfo, String> {
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
pub async fn get_media_info(file_path: String) -> Result<MediaInfo, String> {
    tauri::async_runtime::spawn_blocking(move || get_media_info_internal(file_path))
        .await
        .map_err(|e| format!("Async task execution failed: {}", e))?
}

pub(crate) fn extract_album_art_internal(file_path: &str) -> Option<String> {
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
    // -vframes 1: decode a single frame only. Without it FFmpeg transcodes
    // every frame of video inputs into the cache file, pegging CPU at 100%.
    cmd.args([
        "-y",
        "-i",
        file_path,
        "-an",
        "-vframes",
        "1",
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
pub async fn extract_album_art(file_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        extract_album_art_internal(&file_path).ok_or_else(|| "No album art found".into())
    })
    .await
    .map_err(|e| format!("Async task execution failed: {}", e))?
}

pub(crate) fn get_audio_metadata_internal(file_path: &str) -> Result<AudioMetadataInfo, String> {
    let decoded_path = percent_decode_path(file_path);
    let path = std::path::Path::new(&decoded_path);
    if !path.exists() {
        return Err("Audio file does not exist".into());
    }

    let probe_bin = find_binary("ffprobe");
    let mut cmd = Command::new(&probe_bin);
    cmd.args([
        "-v",
        "error",
        "-show_entries",
        "format_tags:stream_tags:stream=codec_type,codec_name,width,height",
        "-of",
        "json",
        &decoded_path,
    ]);

    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let mut meta = AudioMetadataInfo::default();

    if let Ok(output) = cmd.output() {
        if output.status.success() {
            if let Ok(json_str) = String::from_utf8(output.stdout) {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str) {
                    let mut all_tags = std::collections::HashMap::new();

                    if let Some(tags) = parsed.get("format").and_then(|f| f.get("tags")).and_then(|t| t.as_object()) {
                        for (k, v) in tags {
                            if let Some(val_str) = v.as_str() {
                                all_tags.insert(k.to_lowercase(), val_str.to_string());
                            }
                        }
                    }

                    if let Some(streams) = parsed.get("streams").and_then(|s| s.as_array()) {
                        for stream in streams {
                            if let Some(tags) = stream.get("tags").and_then(|t| t.as_object()) {
                                for (k, v) in tags {
                                    if let Some(val_str) = v.as_str() {
                                        all_tags.entry(k.to_lowercase()).or_insert_with(|| val_str.to_string());
                                    }
                                }
                            }
                            let is_attached_pic = stream
                                .get("disposition")
                                .and_then(|d| d.get("attached_pic"))
                                .and_then(|p| p.as_i64())
                                .unwrap_or(0) == 1;
                            let c_type = stream.get("codec_type").and_then(|t| t.as_str()).unwrap_or("");
                            if is_attached_pic || (c_type == "video" && !meta.has_cover) {
                                meta.has_cover = true;
                            }
                        }
                    }

                    let get_tag = |aliases: &[&str]| -> String {
                        for alias in aliases {
                            if let Some(v) = all_tags.get(&alias.to_lowercase()) {
                                if !v.trim().is_empty() {
                                    return v.trim().to_string();
                                }
                            }
                        }
                        String::new()
                    };

                    meta.title = get_tag(&["title"]);
                    meta.artist = get_tag(&["artist", "author"]);
                    meta.album = get_tag(&["album"]);
                    meta.album_artist = get_tag(&["album_artist", "albumartist", "ensemble"]);
                    meta.genre = get_tag(&["genre"]);
                    meta.year = get_tag(&["date", "year", "tyer", "tdat", "tdrc", "originalyear"]);
                    let raw_track = get_tag(&["track", "tracknumber"]);
                    if !raw_track.is_empty() {
                        if let Some((num, total)) = raw_track.split_once('/') {
                            meta.track = num.trim().to_string();
                            meta.total_tracks = total.trim().to_string();
                        } else {
                            meta.track = raw_track;
                        }
                    }
                    meta.disc = get_tag(&["disc", "discnumber"]);
                    meta.composer = get_tag(&["composer"]);
                    meta.comment = get_tag(&["comment", "description"]);
                    meta.raw_tags = all_tags;
                }
            }
        }
    }

    if let Some(art) = extract_album_art_internal(file_path) {
        meta.has_cover = true;
        meta.cover_data_url = Some(art);
    }

    Ok(meta)
}

#[tauri::command]
pub async fn get_audio_metadata(file_path: String) -> Result<AudioMetadataInfo, String> {
    tauri::async_runtime::spawn_blocking(move || get_audio_metadata_internal(&file_path))
        .await
        .map_err(|e| format!("Async task execution failed: {}", e))?
}

pub(crate) fn prepare_ogg_cover_metadata_internal(image_path: &str) -> Result<String, String> {
    let decoded_path = percent_decode_path(image_path);
    let p = std::path::Path::new(&decoded_path);
    if !p.exists() || !p.is_file() {
        return Err("Cover image does not exist".into());
    }

    let bytes = std::fs::read(p).map_err(|e| format!("Failed to read cover image: {}", e))?;
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("jpg").to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        _ => "image/jpeg",
    };

    let mut block = Vec::with_capacity(32 + mime.len() + bytes.len());
    block.extend_from_slice(&3u32.to_be_bytes());
    block.extend_from_slice(&(mime.len() as u32).to_be_bytes());
    block.extend_from_slice(mime.as_bytes());
    block.extend_from_slice(&0u32.to_be_bytes());
    block.extend_from_slice(&500u32.to_be_bytes());
    block.extend_from_slice(&500u32.to_be_bytes());
    block.extend_from_slice(&24u32.to_be_bytes());
    block.extend_from_slice(&0u32.to_be_bytes());
    block.extend_from_slice(&(bytes.len() as u32).to_be_bytes());
    block.extend_from_slice(&bytes);

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&block);

    let temp_dir = std::env::temp_dir();
    let rand_num: u64 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(12345);
    let meta_file = temp_dir.join(format!("anedikit_ogg_meta_{}.txt", rand_num));
    let content = format!(";FFMETADATA1\nMETADATA_BLOCK_PICTURE={}\n", b64);
    std::fs::write(&meta_file, content).map_err(|e| format!("Failed to write temp metadata file: {}", e))?;

    Ok(meta_file.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn prepare_ogg_cover_metadata(image_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || prepare_ogg_cover_metadata_internal(&image_path))
        .await
        .map_err(|e| format!("Async task execution failed: {}", e))?
}

/// Peak amplitude profile for waveform rendering without loading the whole
/// file into memory. Decodes to mono 8kHz float32 and buckets peaks
/// incrementally (O(num_samples) memory regardless of media length), so
/// multi-gigabyte files no longer crash the renderer with OOM.
#[tauri::command]
pub fn extract_audio_peaks(file_path: String, num_samples: Option<usize>) -> Result<Vec<f32>, String> {
    let decoded = percent_decode_path(&file_path);
    let path = std::path::Path::new(&decoded);
    if !path.exists() || !path.is_file() {
        return Err("Media file does not exist".into());
    }
    let n = num_samples.unwrap_or(240).clamp(16, 2000);

    // Duration bounds the streaming bucket math (mono 8kHz => 32KB/s).
    let info =
        get_media_info_internal(decoded.clone()).map_err(|e| format!("Cannot probe media file: {}", e))?;
    let total_secs = info.duration_seconds;
    if !total_secs.is_finite() || total_secs <= 0.0 {
        return Err("Cannot determine media duration for peak extraction".into());
    }
    let sample_rate = 8000u32;
    let total_samples = (total_secs * sample_rate as f64).ceil() as u64;
    if total_samples == 0 {
        return Err("Media has no decodable duration".into());
    }

    let ffmpeg_bin = find_binary("ffmpeg");
    let mut child_cmd = Command::new(&ffmpeg_bin);
    child_cmd.args([
        "-v",
        "error",
        "-i",
        &decoded,
        "-ac",
        "1",
        "-ar",
        "8000",
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "-",
    ]);
    child_cmd.stdout(Stdio::piped());
    child_cmd.stderr(Stdio::null());
    #[cfg(windows)]
    child_cmd.creation_flags(0x08000000);

    let mut child = child_cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;
    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture ffmpeg output")?;

    let mut peaks = vec![0f32; n];
    let mut idx: u64 = 0;
    let mut reader = BufReader::with_capacity(65536, stdout);
    let mut chunk = [0u8; 65536];
    loop {
        let read = reader
            .read(&mut chunk)
            .map_err(|e| format!("Failed to read ffmpeg output: {}", e))?;
        if read == 0 {
            break;
        }
        let usable = read - (read % 4);
        let mut i = 0;
        while i < usable {
            let v = f32::from_le_bytes([chunk[i], chunk[i + 1], chunk[i + 2], chunk[i + 3]]).abs();
            if v.is_finite() {
                let b = ((idx * n as u64) / total_samples) as usize;
                let b = b.min(n - 1);
                if v > peaks[b] {
                    peaks[b] = v;
                }
                idx += 1;
            }
            i += 4;
        }
    }
    let status = child
        .wait()
        .map_err(|e| format!("Peak extraction failed: {}", e))?;
    if !status.success() {
        return Err("No decodable audio stream found".into());
    }

    // Normalize like the frontend extractor (strongest peak -> 1.0).
    let max_peak = peaks.iter().cloned().fold(0f32, f32::max);
    if max_peak > 0.01 {
        for p in peaks.iter_mut() {
            *p = (*p / max_peak).min(1.0);
        }
    }
    Ok(peaks)
}

pub(crate) fn extract_action_frame_internal(file_path: String, duration_seconds: Option<f64>) -> Result<String, String> {
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
pub async fn extract_action_frame(file_path: String, duration_seconds: Option<f64>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        extract_action_frame_internal(file_path, duration_seconds)
    })
    .await
    .map_err(|e| format!("Async task execution failed: {}", e))?
}

pub(crate) fn extract_timeline_thumbnails_internal(
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
pub async fn extract_timeline_thumbnails(
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

pub(crate) fn fetch_playlist_videos_internal(url: String) -> Result<Vec<PlaylistVideo>, String> {
    if url.trim().is_empty() {
        return Err("Please enter a valid playlist or video URL".into());
    }
    let ytdlp_bin = find_binary("yt-dlp");
    let mut cmd = Command::new(&ytdlp_bin);
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
                format!("00:{:02}:{:02}", m, s)
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
pub async fn fetch_playlist_videos(url: String) -> Result<Vec<PlaylistVideo>, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_playlist_videos_internal(url))
        .await
        .map_err(|e| format!("Async task execution failed: {}", e))?
}

pub(crate) fn extract_timeline_frame_internal(
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
pub async fn extract_timeline_frame(
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
