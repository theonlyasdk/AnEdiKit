use tauri::Manager;

#[tauri::command]
pub fn set_decorations(app: tauri::AppHandle, decorations: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_decorations(decorations)
            .map_err(|e| format!("Failed to set decorations: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_window_blur(app: tauri::AppHandle, mode: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        #[cfg(target_os = "windows")]
        {
            use window_vibrancy::{apply_acrylic, apply_mica, clear_blur};
            if crate::system::is_windows_10() {
                let _ = clear_blur(&window);
            } else {
                match mode.as_str() {
                    "acrylic" => {
                        let _ = apply_acrylic(&window, Some((0, 0, 0, 0)));
                    }
                    "mica" => {
                        let _ = apply_mica(&window, None);
                    }
                    "off" => {
                        let _ = clear_blur(&window);
                    }
                    _ => {
                        let _ = apply_acrylic(&window, Some((0, 0, 0, 0)));
                    }
                }
            }
        }
        #[cfg(target_os = "macos")]
        {
            use window_vibrancy::{apply_vibrancy, clear_blur, NSVisualEffectMaterial};
            if mode != "off" {
                let _ = apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None);
            } else {
                let _ = clear_blur(&window);
            }
        }
    }
    Ok(())
}
