use serde_json::Value;
use std::{
    fs::{self, OpenOptions},
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    sync::{atomic::{AtomicU64, Ordering}, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const MAX_LOG_FILES: usize = 8;
const MAX_EVENT_BYTES: usize = 64 * 1024;
const MAX_LOG_BYTES: u64 = 4 * 1024 * 1024;
static LOG_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Default)]
pub(crate) struct DiagnosticState {
    session_file: Mutex<Option<PathBuf>>,
    write_lock: Mutex<()>,
}

// This runs in the host process: renderer-side error handlers cannot report a
// renderer crash, because they disappear together with the failed process.
#[cfg(windows)]
pub(crate) fn install_webview_failure_diagnostics(
    window: &tauri::WebviewWindow,
) -> tauri::Result<()> {
    use webview2_com::{Microsoft::Web::WebView2::Win32::*, ProcessFailedEventHandler};
    use windows_core::Interface;

    let target = window.clone();
    window.with_webview(move |webview| {
        let app = target.app_handle().clone();
        let setup = unsafe {
            (|| -> windows_core::Result<()> {
                let core = webview.controller().CoreWebView2()?;
                let callback = ProcessFailedEventHandler::create(Box::new(move |_, args| {
                    let Some(args) = args else { return Ok(()) };
                    let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
                    args.ProcessFailedKind(&mut kind)?;
                    let mut reason = None;
                    let mut exit_code = None;
                    if let Ok(details) = args.cast::<ICoreWebView2ProcessFailedEventArgs2>() {
                        let mut value = COREWEBVIEW2_PROCESS_FAILED_REASON::default();
                        if details.Reason(&mut value).is_ok() { reason = Some(value.0); }
                        let mut value = 0;
                        if details.ExitCode(&mut value).is_ok() { exit_code = Some(value); }
                    }
                    let app = app.clone();
                    let target = target.clone();
                    tauri::async_runtime::spawn_blocking(move || {
                        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)
                            .map(|duration| duration.as_millis()).unwrap_or_default();
                        let event = serde_json::json!({
                            "version": 1, "kind": "native-process-failure",
                            "name": "webview.process-failed", "timestampMs": timestamp,
                            "detail": { "processKind": kind.0, "reason": reason, "exitCode": exit_code }
                        });
                        if let Err(error) = append_events_to_file(&app, &app.state::<DiagnosticState>(), vec![event]) {
                            eprintln!("WebView2 crash diagnostic write failed: {error}");
                        }
                        // Do not reload for hangs or GPU subprocess failures:
                        // a live editor may still contain unsaved work.
                        if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED {
                            let reload = rfd::MessageDialog::new()
                                .set_title("MoonSprite")
                                .set_level(rfd::MessageLevel::Error)
                                .set_description("界面进程已退出，诊断信息已记录。是否重新载入界面？\n未保存的内容只能从已有的恢复记录中找回。")
                                .set_buttons(rfd::MessageButtons::YesNo)
                                .show();
                            if reload == rfd::MessageDialogResult::Yes {
                                if let Err(error) = target.with_webview(|webview| {
                                    let result = webview.controller().CoreWebView2().and_then(|core| core.Reload());
                                    if let Err(error) = result { eprintln!("WebView2 reload failed: {error}"); }
                                }) { eprintln!("WebView2 reload dispatch failed: {error}"); }
                            }
                        }
                    });
                    Ok(())
                }));
                let mut token = 0;
                core.add_ProcessFailed(&callback, &mut token)?;
                Ok(())
            })()
        };
        if let Err(error) = setup { eprintln!("WebView2 failure diagnostics setup failed: {error}"); }
    })
}

#[cfg(not(windows))]
pub(crate) fn install_webview_failure_diagnostics(
    _window: &tauri::WebviewWindow,
) -> tauri::Result<()> {
    Ok(())
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

fn trim_old_logs(directory: &Path, current: &Path) -> Result<(), String> {
    let mut files = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("jsonl")
            && path.file_name().and_then(|value| value.to_str()).is_some_and(|name| name.starts_with("session-")))
        .collect::<Vec<_>>();
    files.sort_by_key(|path| (path != current, std::cmp::Reverse(modified_millis(path))));
    for path in files.into_iter().skip(MAX_LOG_FILES) {
        fs::remove_file(path).map_err(|error| error.to_string())?;
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
    create_session_file(&directory, &mut current)
}

fn create_session_file(directory: &Path, current: &mut Option<PathBuf>) -> Result<PathBuf, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let sequence = LOG_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let path = directory.join(format!("session-{timestamp}-{}-{sequence}.jsonl", std::process::id()));
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| error.to_string())?;
    *current = Some(path.clone());
    trim_old_logs(directory, &path)?;
    Ok(path)
}

#[tauri::command]
pub(crate) async fn append_diagnostic_events(
    app: AppHandle,
    events: Vec<Value>,
) -> Result<(), String> {
    // File open, rotation and flush must not run on the desktop UI thread.
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<DiagnosticState>();
        append_events_to_file(&app, &state, events)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn append_events_to_file(
    app: &AppHandle,
    state: &DiagnosticState,
    events: Vec<Value>,
) -> Result<(), String> {
    if events.is_empty() {
        return Ok(());
    }
    let _write_guard = state
        .write_lock
        .lock()
        .map_err(|_| "诊断日志写入状态不可用".to_string())?;
    let path = session_file(app, state)?;
    let directory = path.parent().ok_or("诊断日志目录不可用")?;
    let mut current = state.session_file.lock().map_err(|_| "诊断日志状态不可用".to_string())?;
    append_events_to_path(directory, &mut current, &path, events)
}

fn append_events_to_path(directory: &Path, current: &mut Option<PathBuf>, path: &Path, events: Vec<Value>) -> Result<(), String> {
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    let mut bytes = file.metadata().map_err(|error| error.to_string())?.len();
    let mut writer = BufWriter::new(file);
    for event in events.into_iter().take(100) {
        let encoded = serde_json::to_vec(&event).map_err(|error| error.to_string())?;
        if encoded.len() > MAX_EVENT_BYTES { return Err("诊断事件超过大小限制".to_string()); }
        let event_bytes = encoded.len() as u64 + 1;
        if bytes > 0 && bytes + event_bytes > MAX_LOG_BYTES {
            writer.flush().map_err(|error| error.to_string())?;
            let next = create_session_file(directory, current)?;
            writer = BufWriter::new(OpenOptions::new().append(true).open(next).map_err(|error| error.to_string())?);
            bytes = 0;
        }
        writer
            .write_all(&encoded)
            .map_err(|error| error.to_string())?;
        writer.write_all(b"\n").map_err(|error| error.to_string())?;
        bytes += event_bytes;
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
    fn rotates_within_a_session_and_preserves_each_event() -> Result<(), Box<dyn std::error::Error>> {
        let directory = std::env::temp_dir().join(format!("moonsprite-log-rotation-{}-{}", std::process::id(), LOG_SEQUENCE.fetch_add(1, Ordering::Relaxed)));
        fs::create_dir_all(&directory)?;
        let mut current = None;
        let first = create_session_file(&directory, &mut current)?;
        // Simulate a long-running session reaching its file limit.
        OpenOptions::new().write(true).open(&first)?.set_len(MAX_LOG_BYTES - 2)?;
        append_events_to_path(&directory, &mut current, &first, vec![serde_json::json!({"sequence": 1}), serde_json::json!({"sequence": 2})])?;
        let next = current.as_ref().ok_or("missing current log")?;
        assert_ne!(&first, next);
        assert_eq!(fs::read_to_string(next)?, "{\"sequence\":1}\n{\"sequence\":2}\n");
        assert!(fs::metadata(&first)?.len() <= MAX_LOG_BYTES);
        fs::write(directory.join("user-notes.jsonl"), "keep")?;
        for _ in 0..MAX_LOG_FILES + 2 { create_session_file(&directory, &mut current)?; }
        let current = current.as_ref().ok_or("missing rotated log")?;
        assert!(current.exists());
        assert_eq!(fs::read_dir(&directory)?.count(), MAX_LOG_FILES + 1);
        assert_eq!(fs::read_to_string(directory.join("user-notes.jsonl"))?, "keep");
        fs::remove_dir_all(directory)?;
        Ok(())
    }

    #[test]
    fn retains_only_the_newest_diagnostic_logs() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("moonsprite-diagnostics-{timestamp}"));
        fs::create_dir_all(&directory).unwrap();
        for index in 0..(MAX_LOG_FILES + 3) {
            fs::write(
                directory.join(format!("session-{index}.jsonl")),
                format!("{index}"),
            )
            .unwrap();
            std::thread::sleep(std::time::Duration::from_millis(2));
        }

        trim_old_logs(&directory, &directory.join("session-10.jsonl")).unwrap();

        let remaining = fs::read_dir(&directory).unwrap().count();
        assert_eq!(remaining, MAX_LOG_FILES);
        fs::remove_dir_all(directory).unwrap();
    }
}
