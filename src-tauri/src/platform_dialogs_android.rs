// Android file selection is handled by the renderer's platform adapter using
// the official dialog/fs plugins. These legacy commands fail explicitly.
macro_rules! unsupported {
    ($($name:ident),*) => { $(
        #[tauri::command]
        pub fn $name() -> Result<(), String> {
            Err("This desktop dialog is unavailable in the Android test build".into())
        }
    )* };
}
unsupported!(open_files, open_brush_images, save_project, export_image,
    save_palette_image, save_shortcut_file, save_theme_file, choose_directory);

#[tauri::command]
pub fn default_file_directories() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "saveDirectory": crate::platform_gallery::gallery_dir()?.to_string_lossy(),
        "exportDirectory": crate::platform_paths::export_directory()?.to_string_lossy()
    }))
}
