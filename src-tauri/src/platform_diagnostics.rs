use serde_json::Value;
use std::{
    fs::{self, OpenOptions},
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

const MAX_LOG_FILES: usize = 8;
const MAX_EVENT_BYTES: usize = 64 * 1024;

#[derive(Default)]
pub(crate) struct DiagnosticState {
    session_file: Mutex<Option<PathBuf>>,
    write_lock: Mutex<()>,
}

fn diagnostic_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("diagnostics");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

fn modified_millis(path: &Path) -> u128 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn trim_old_logs(directory: &Path) -> Result<(), String> {
    let mut files = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("jsonl"))
        .collect::<Vec<_>>();
    files.sort_by_key(|path| std::cmp::Reverse(modified_millis(path)));
    for path in files.into_iter().skip(MAX_LOG_FILES) {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

fn session_file(app: &AppHandle, state: &DiagnosticState) -> Result<PathBuf, String> {
    let mut current = state
        .session_file
        .lock()
        .map_err(|_| "诊断日志状态不可用".to_string())?;
    if let Some(path) = current.as_ref() {
        return Ok(path.clone());
    }
    let directory = diagnostic_dir(app)?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let path = directory.join(format!("session-{timestamp}-{}.jsonl", std::process::id()));
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| error.to_string())?;
    *current = Some(path.clone());
    trim_old_logs(&directory)?;
    Ok(path)
}

#[tauri::command]
pub(crate) fn append_diagnostic_events(
    app: AppHandle,
    state: State<'_, DiagnosticState>,
    events: Vec<Value>,
) -> Result<(), String> {
    if events.is_empty() {
        return Ok(());
    }
    let _write_guard = state
        .write_lock
        .lock()
        .map_err(|_| "诊断日志写入状态不可用".to_string())?;
    let path = session_file(&app, &state)?;
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    let mut writer = BufWriter::new(file);
    for event in events.into_iter().take(100) {
        let encoded = serde_json::to_vec(&event).map_err(|error| error.to_string())?;
        if encoded.len() > MAX_EVENT_BYTES {
            continue;
        }
        writer.write_all(&encoded).map_err(|error| error.to_string())?;
        writer.write_all(b"\n").map_err(|error| error.to_string())?;
    }
    writer.flush().map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn open_diagnostic_logs(app: AppHandle) -> Result<(), String> {
    let directory = diagnostic_dir(&app)?;
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer.exe");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(directory)
        .spawn()
        .map_err(|error| format!("无法打开诊断日志文件夹：{error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retains_only_the_newest_diagnostic_logs() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("moonsprite-diagnostics-{timestamp}"));
        fs::create_dir_all(&directory).unwrap();
        for index in 0..(MAX_LOG_FILES + 3) {
            fs::write(directory.join(format!("session-{index}.jsonl")), format!("{index}"))
                .unwrap();
            std::thread::sleep(std::time::Duration::from_millis(2));
        }

        trim_old_logs(&directory).unwrap();

        let remaining = fs::read_dir(&directory).unwrap().count();
        assert_eq!(remaining, MAX_LOG_FILES);
        fs::remove_dir_all(directory).unwrap();
    }
}
