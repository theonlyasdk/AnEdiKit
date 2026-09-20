pub mod jobs;
pub mod media;
pub mod models;
pub mod system;
pub mod tools;
pub mod window;

use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "windows")]
                {
                    if !system::is_windows_10() {
                        use window_vibrancy::apply_acrylic;
                        let _ = apply_acrylic(&window, Some((0, 0, 0, 0)));
                    }
                }
                #[cfg(target_os = "macos")]
                {
                    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                    let _ = apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None);
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if jobs::is_foreground_job_active() {
                    api.prevent_close();
                    let _ = window.emit("confirm-exit-requested", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            system::is_windows_10,
            system::pick_file,
            system::pick_files,
            system::pick_folder,
            system::save_image_as,
            system::write_temp_text_file,
            system::replace_file,
            system::check_file_exists,
            system::read_image_data,
            system::open_file,
            system::show_in_folder,
            system::send_system_notification,
            system::get_hardware_info,
            system::probe_hardware_acceleration,
            media::get_media_info,
            media::get_audio_metadata,
            media::prepare_ogg_cover_metadata,
            media::extract_action_frame,
            media::extract_album_art,
            media::extract_audio_peaks,
            media::extract_timeline_thumbnails,
            media::extract_timeline_frame,
            media::fetch_playlist_videos,
            jobs::execute_ffmpeg,
            jobs::execute_ytdlp,
            jobs::execute_image_ai,
            jobs::render_pdf_pages,
            jobs::get_pdf_info,
            jobs::install_pdf_dependencies,
            jobs::cancel_ffmpeg,
            jobs::cancel_job,
            jobs::is_job_active,
            jobs::force_exit_app,
            tools::open_binaries_folder,
            tools::check_tool_versions,
            tools::update_tool,
            tools::delete_tool,
            tools::cancel_tool_update,
            window::set_decorations,
            window::set_window_blur
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
