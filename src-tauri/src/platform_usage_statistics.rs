use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::platform_storage::atomic_write;

fn statistics_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("usage-statistics.json"))
}

#[tauri::command]
pub(crate) fn read_usage_statistics(app: AppHandle) -> Result<Option<String>, String> {
    let path = statistics_path(&app)?;
    match fs::read_to_string(path) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub(crate) fn write_usage_statistics(app: AppHandle, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json)
        .map_err(|error| format!("Invalid usage statistics JSON: {error}"))?;
    atomic_write(&statistics_path(&app)?, json.as_bytes())
}

#[tauri::command]
pub(crate) fn usage_statistics_path(app: AppHandle) -> Result<String, String> {
    Ok(statistics_path(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
pub(crate) fn open_usage_statistics_folder(app: AppHandle) -> Result<(), String> {
    let path = statistics_path(&app)?;
    let directory = path
        .parent()
        .ok_or_else(|| "Unable to locate usage statistics folder.".to_string())?;
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer.exe");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(directory)
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}
