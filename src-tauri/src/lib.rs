#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    ffi::OsString,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, State, WindowEvent};

mod close_coordinator;
mod platform_background_presets;
mod platform_brushes;
mod platform_clipboard;
mod platform_cursor;
mod platform_diagnostics;
mod platform_dialogs;
mod platform_extensions;
mod platform_files;
mod platform_fonts;
mod platform_gallery;
mod platform_local_history;
mod platform_palette;
mod platform_paths;
mod platform_recovery;
mod platform_resources;
mod platform_scripts;
mod platform_storage;
mod platform_workspaces;
use close_coordinator::CloseCoordinator;

#[derive(Default)]
struct AppState {
    close_requests: Arc<CloseCoordinator>,
    startup_files: Mutex<Vec<String>>,
}

fn supported_file_paths(arguments: impl IntoIterator<Item = OsString>) -> Vec<String> {
    arguments
        .into_iter()
        .map(PathBuf::from)
        .filter(|path| {
            path.is_file()
                && (path
                    .to_string_lossy()
                    .to_ascii_lowercase()
                    .ends_with(".moonsprite.bak")
                    || path
                        .extension()
                        .and_then(|value| value.to_str())
                        .is_some_and(|value| {
                            matches!(
                                value.to_ascii_lowercase().as_str(),
                                "moonsprite"
                                    | "ase"
                                    | "aseprite"
                                    | "psd"
                                    | "png"
                                    | "jpg"
                                    | "jpeg"
                                    | "webp"
                                    | "bmp"
                                    | "gif"
                                    | "msext"
                            )
                        }))
        })
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

fn startup_file_paths() -> Vec<String> {
    supported_file_paths(std::env::args_os().skip(1))
}

#[tauri::command]
fn take_startup_files(state: State<'_, AppState>) -> Vec<String> {
    let Ok(mut files) = state.startup_files.lock() else {
        return Vec::new();
    };
    std::mem::take(&mut *files)
}

#[tauri::command]
fn cancel_close(state: State<'_, AppState>) {
    state.close_requests.cancel();
}

#[tauri::command]
fn close_listener_ready(
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    if !state.close_requests.is_pending() {
        return Ok(false);
    }
    window
        .emit("app:request-close", ())
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn approve_close(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.close_requests.cancel();
    platform_recovery::mark_session(&app, true)?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn confirm_unsaved(_name: String) -> String {
    "cancel".to_string()
}

#[cfg(windows)]
fn primary_pointer_is_pressed() -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};

    unsafe { GetAsyncKeyState(VK_LBUTTON as i32) < 0 }
}

#[cfg(not(windows))]
fn primary_pointer_is_pressed() -> bool {
    true
}

#[tauri::command]
fn start_window_drag_if_primary_pressed(window: tauri::WebviewWindow) -> Result<bool, String> {
    if !primary_pointer_is_pressed() {
        return Ok(false);
    }
    window.start_dragging().map_err(|error| error.to_string())?;
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup_files = startup_file_paths();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(
            |app, arguments, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                    let paths =
                        supported_file_paths(arguments.into_iter().skip(1).map(OsString::from));
                    if !paths.is_empty() {
                        let _ = window.emit("app:file-drop", paths);
                    }
                }
            },
        ))
        .manage(AppState {
            startup_files: Mutex::new(startup_files),
            ..AppState::default()
        })
        .manage(platform_recovery::RecoveryState::default())
        .manage(platform_diagnostics::DiagnosticState::default())
        .manage(platform_files::ScaledPngCancellation::default())
        .manage(platform_scripts::LuaScriptRuntime::default())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;
                window.set_icon(icon)?;
                platform_diagnostics::install_webview_failure_diagnostics(&window)?;
            }
            platform_recovery::initialize_session_marker(app.handle())?;
            let _ = platform_gallery::ensure_builtin_example(app.handle().clone());
            let _ = platform_paths::export_directory();
            let _ = platform_background_presets::ensure_background_preset_folder();
            let _ = platform_extensions::ensure_extension_folder();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            platform_dialogs::open_files,
            platform_dialogs::open_brush_images,
            take_startup_files,
            platform_dialogs::save_project,
            platform_dialogs::export_image,
            platform_dialogs::save_palette_image,
            platform_dialogs::save_shortcut_file,
            platform_dialogs::save_theme_file,
            platform_dialogs::default_file_directories,
            platform_dialogs::choose_directory,
            platform_diagnostics::append_diagnostic_events,
            platform_diagnostics::open_diagnostic_logs,
            platform_extensions::list_extensions,
            platform_extensions::install_extension,
            platform_extensions::choose_and_install_extension,
            platform_extensions::set_extension_enabled,
            platform_extensions::uninstall_extension,
            platform_extensions::open_extension_folder,
            platform_files::file_exists,
            platform_files::read_binary,
            platform_files::read_project_preview,
            platform_files::cache_project_preview,
            platform_files::write_binary_atomic,
            platform_files::open_project_backup_folder,
            platform_files::list_project_backups,
            platform_files::cancel_scaled_png_export,
            platform_files::write_scaled_png_atomic,
            platform_files::write_project_incremental,
            platform_clipboard::write_clipboard_image,
            platform_clipboard::read_clipboard_text,
            platform_clipboard::read_clipboard_image,
            platform_clipboard::read_clipboard_image_size,
            platform_cursor::set_native_cursor,
            platform_resources::get_resource_info,
            platform_palette::list_palettes,
            platform_palette::save_palette,
            platform_palette::delete_palette,
            platform_palette::open_palette_folder,
            platform_workspaces::list_workspaces,
            platform_workspaces::save_workspace,
            platform_workspaces::delete_workspace,
            platform_workspaces::open_workspace_folder,
            platform_brushes::list_brushes,
            platform_brushes::save_brush,
            platform_brushes::delete_brush,
            platform_brushes::set_brush_order,
            platform_brushes::create_brush_folder,
            platform_brushes::rename_brush_folder,
            platform_brushes::delete_brush_folder,
            platform_brushes::move_brush,
            platform_brushes::open_brush_folder,
            platform_fonts::list_fonts,
            platform_fonts::list_system_fonts,
            platform_fonts::import_font,
            platform_fonts::import_system_font,
            platform_fonts::delete_font,
            platform_background_presets::list_background_presets,
            platform_background_presets::save_background_preset,
            platform_background_presets::open_background_preset_folder,
            platform_recovery::list_recoveries,
            platform_recovery::read_recovery,
            platform_recovery::write_recovery,
            platform_recovery::delete_recovery,
            platform_local_history::read_local_history,
            platform_local_history::write_local_history,
            platform_local_history::delete_local_history,
            platform_gallery::list_gallery_projects,
            platform_gallery::list_folder_projects,
            platform_gallery::delete_gallery_project,
            platform_gallery::open_gallery_folder,
            platform_gallery::open_directory,
            platform_gallery::ensure_builtin_example,
            platform_gallery::open_project_in_folder,
            platform_gallery::open_external_url,
            platform_scripts::list_lua_scripts,
            platform_scripts::open_lua_script_folder,
            platform_scripts::delete_lua_script,
            platform_scripts::run_lua_script,
            platform_scripts::dispatch_lua_script_dialog,
            platform_scripts::close_lua_script_session,
            start_window_drag_if_primary_pressed,
            cancel_close,
            close_listener_ready,
            approve_close,
            confirm_unsaved
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                let dropped_paths = paths
                    .iter()
                    .map(|path| path.to_string_lossy().to_string())
                    .collect::<Vec<_>>();
                let _ = window.emit("app:file-drop", dropped_paths);
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let pending = window.state::<AppState>().close_requests.clone();
                let Some(generation) = pending.begin() else {
                    // A request may have arrived before the renderer finished
                    // registering its listener. Re-emit it so the ready
                    // listener can recover the existing close transaction.
                    let _ = window.emit("app:request-close", ());
                    return;
                };
                let _ = window.emit("app:request-close", ());
                let app = window.app_handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(12));
                    if pending.expire(generation) {
                        app.exit(1);
                    }
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running MoonSprite");
}
