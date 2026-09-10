use std::{path::PathBuf, sync::OnceLock};
use tauri::Manager;

static DATA_ROOT: OnceLock<PathBuf> = OnceLock::new();

pub fn initialize(app: &tauri::AppHandle) -> Result<(), String> {
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    DATA_ROOT.set(path).map_err(|_| "Android storage already initialized".to_string())
}

pub fn data_root() -> Result<PathBuf, String> {
    DATA_ROOT.get().cloned().ok_or_else(|| "Android storage is not initialized".into())
}

// Allocate a new private directory, not just a guessed unused filename. Save As
// and importing two files with the same name cannot overwrite an existing work.
#[tauri::command]
pub fn android_allocate_file(name: String, gallery: bool) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\', '\0']) {
        return Err("Invalid Android file name".into());
    }
    let root = crate::platform_paths::ensure_executable_subdirectory(
        if gallery { "gallery" } else { "exports" }, "文件")?;
    // Gallery is scanned non-recursively, so reserve the file itself with create_new.
    for index in 0..100_000 {
        let candidate = if index == 0 { root.join(name) } else {
            let path = std::path::Path::new(name);
            let stem = path.file_stem().unwrap_or_default().to_string_lossy();
            let ext = path.extension().map(|v| format!(".{}", v.to_string_lossy())).unwrap_or_default();
            root.join(format!("{stem}-{index}{ext}"))
        };
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&candidate) {
            Ok(_) => return Ok(candidate.to_string_lossy().into_owned()),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("Too many files with the same name".into())
}
