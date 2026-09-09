use std::{
    collections::HashMap,
    ffi::OsStr,
    fs,
    path::{Component, Path, PathBuf},
    sync::mpsc,
};

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use tauri::State;

use crate::{
    platform_extensions, platform_paths::ensure_executable_subdirectory,
    platform_storage::atomic_write,
};

mod lua_api;

use lua_api::{LuaInvocation, LuaSession};

pub(super) const MAX_SCRIPT_BYTES: usize = 1024 * 1024;
pub(super) const MAX_IMAGE_PIXELS: usize = 4_194_304;
pub(super) const MAX_CHANGED_PIXELS: usize = 4_194_304;
pub(super) const MAX_OUTPUT_BYTES: usize = 64 * 1024;
pub(super) const MAX_LUA_MEMORY_BYTES: usize = 64 * 1024 * 1024;
pub(super) const MAX_INSTRUCTIONS: u64 = 20_000_000;
pub(super) const MAX_EXECUTION_MILLIS: u64 = 2_000;
const BUILTIN_SCRIPT_FILE_NAME: &str = "moon-phase.lua";
const BUILTIN_SCRIPT_MARKER: &str = ".moonsprite-script-examples.v1";
const BUILTIN_MOON_PHASE_SCRIPT: &[u8] = include_bytes!("../resources/scripts/moon-phase.lua");

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LuaScriptEntry {
    id: String,
    name: String,
    file_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    extension_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    extension_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    extension_command_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    extension_description: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LuaScriptListing {
    directory_path: String,
    scripts: Vec<LuaScriptEntry>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LuaScriptSelectionContext {
    pub(super) x: i32,
    pub(super) y: i32,
    pub(super) width: u32,
    pub(super) height: u32,
    pub(super) mask: Option<Vec<u8>>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LuaScriptCelContext {
    pub(super) id: String,
    pub(super) frame_id: String,
    pub(super) frame_number: u32,
    pub(super) surface: LuaScriptSurfaceSnapshot,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LuaScriptContext {
    pub(super) document_id: String,
    pub(super) document_name: String,
    pub(super) document_width: u32,
    pub(super) document_height: u32,
    pub(super) document_file_path: String,
    pub(super) color_mode: String,
    pub(super) layer_id: String,
    pub(super) layer_name: String,
    pub(super) layer_width: u32,
    pub(super) layer_height: u32,
    pub(super) layer_offset_x: i32,
    pub(super) layer_offset_y: i32,
    pub(super) layer_opacity: u8,
    pub(super) layer_visible: bool,
    pub(super) layer_locked: bool,
    pub(super) layer_format: String,
    pub(super) layer_group_id: Option<String>,
    pub(super) layer_stack_index: u32,
    pub(super) frame_number: u32,
    pub(super) pixels: Vec<u32>,
    #[serde(default)]
    pub(super) active_layer_cels: Vec<LuaScriptCelContext>,
    pub(super) selection: Option<LuaScriptSelectionContext>,
    pub(super) transparent_color: u32,
    pub(super) foreground: u32,
    pub(super) background: u32,
    #[serde(default)]
    pub(super) mse_snapshot: JsonValue,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LuaScriptPixelChange {
    pub(super) index: u32,
    pub(super) before: u32,
    pub(super) after: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LuaScriptSurfaceSnapshot {
    pub(super) format: String,
    pub(super) width: u32,
    pub(super) height: u32,
    pub(super) offset_x: i32,
    pub(super) offset_y: i32,
    pub(super) pixels: Vec<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LuaScriptSurfaceChange {
    pub(super) before: LuaScriptSurfaceSnapshot,
    pub(super) after: LuaScriptSurfaceSnapshot,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LuaScriptBatch {
    pub(super) label: String,
    pub(super) changes: Vec<LuaScriptPixelChange>,
    pub(super) surface_change: Option<LuaScriptSurfaceChange>,
    pub(super) operations: Vec<LuaScriptOperation>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LuaScriptOperation {
    pub(super) path: String,
    pub(super) arguments: JsonValue,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LuaScriptCreatedLayer {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) opacity: u8,
    pub(super) visible: bool,
    pub(super) locked: bool,
    pub(super) frame_number: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) parent_group_id: Option<String>,
    pub(super) stack_index: u32,
    pub(super) surface: LuaScriptSurfaceSnapshot,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LuaScriptCreatedDocument {
    pub(super) name: String,
    pub(super) width: u32,
    pub(super) height: u32,
    pub(super) color_mode: String,
    pub(super) layers: Vec<LuaScriptCreatedLayer>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LuaScriptDialogControl {
    pub(super) id: String,
    pub(super) data_key: Option<String>,
    pub(super) kind: String,
    pub(super) label: String,
    pub(super) text: String,
    pub(super) value: JsonValue,
    pub(super) min: Option<f64>,
    pub(super) max: Option<f64>,
    pub(super) step: Option<f64>,
    pub(super) decimals: Option<u32>,
    pub(super) options: Vec<String>,
    pub(super) enabled: bool,
    pub(super) visible: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LuaScriptDialog {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) controls: Vec<LuaScriptDialogControl>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LuaScriptDialogAction {
    pub(super) dialog_id: String,
    pub(super) control_id: Option<String>,
    pub(super) event: String,
    pub(super) values: HashMap<String, JsonValue>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LuaScriptRunResult {
    session_id: Option<String>,
    file_path: String,
    file_name: String,
    output: Vec<String>,
    batches: Vec<LuaScriptBatch>,
    created_layers: Vec<LuaScriptCreatedLayer>,
    created_documents: Vec<LuaScriptCreatedDocument>,
    dialogs: Vec<LuaScriptDialog>,
    active_layer_id: Option<String>,
    active_frame_number: Option<u32>,
    finished: bool,
    elapsed_ms: u64,
}

fn script_directory() -> Result<PathBuf, String> {
    let directory = ensure_executable_subdirectory("scripts", "脚本")?;
    seed_builtin_scripts(&directory)?;
    Ok(directory)
}

fn seed_builtin_scripts(directory: &Path) -> Result<(), String> {
    let marker = directory.join(BUILTIN_SCRIPT_MARKER);
    if marker.is_file() {
        return Ok(());
    }
    let script = directory.join(BUILTIN_SCRIPT_FILE_NAME);
    if !script.exists() {
        atomic_write(&script, BUILTIN_MOON_PHASE_SCRIPT)
            .map_err(|error| format!("无法安装内置 Lua 示例：{error}"))?;
    }
    atomic_write(&marker, b"1").map_err(|error| format!("无法记录内置 Lua 示例状态：{error}"))?;
    Ok(())
}

fn is_lua_file(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| extension.eq_ignore_ascii_case("lua"))
}

fn script_entry(path: &Path) -> Option<LuaScriptEntry> {
    let id = path.file_name()?.to_str()?.to_string();
    if !is_lua_file(path) {
        return None;
    }
    let name = path
        .file_stem()
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty())
        .unwrap_or(&id)
        .to_string();
    Some(LuaScriptEntry {
        id,
        name,
        file_path: path.to_string_lossy().to_string(),
        extension_id: None,
        extension_name: None,
        extension_command_id: None,
        extension_description: None,
    })
}

fn extension_script_entry(entry: platform_extensions::ExtensionLuaEntry) -> LuaScriptEntry {
    let name = entry
        .command_name
        .clone()
        .unwrap_or_else(|| entry.extension_name.clone());
    let id = match &entry.command_id {
        Some(command_id) => format!("extension:{}:{}", entry.extension_id, command_id),
        None => format!("extension:{}", entry.extension_id),
    };
    LuaScriptEntry {
        id,
        name,
        file_path: entry.path.to_string_lossy().to_string(),
        extension_id: Some(entry.extension_id),
        extension_name: Some(entry.extension_name),
        extension_command_id: entry.command_id,
        extension_description: entry.command_description,
    }
}

fn sort_script_entries(scripts: &mut [LuaScriptEntry]) {
    scripts.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.extension_name.cmp(&right.extension_name))
            .then_with(|| left.id.cmp(&right.id))
    });
}

fn list_lua_scripts_in(directory: &Path) -> Result<Vec<LuaScriptEntry>, String> {
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("无法读取脚本文件夹 {}：{error}", directory.display()))?;
    let mut scripts = entries
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_type()
                .map(|file_type| file_type.is_file())
                .unwrap_or(false)
        })
        .filter_map(|entry| script_entry(&entry.path()))
        .collect::<Vec<_>>();
    sort_script_entries(&mut scripts);
    Ok(scripts)
}

fn resolve_lua_script_path(directory: &Path, script_id: &str) -> Result<PathBuf, String> {
    let requested = Path::new(script_id);
    let mut components = requested.components();
    let valid_component = matches!(components.next(), Some(Component::Normal(name)) if name == OsStr::new(script_id))
        && components.next().is_none()
        && !script_id.contains('/')
        && !script_id.contains('\\');
    if !valid_component || !is_lua_file(requested) {
        return Err("无效的 Lua 脚本标识。".to_string());
    }
    let path = directory.join(requested);
    let metadata =
        fs::symlink_metadata(&path).map_err(|_| format!("脚本文件不存在：{script_id}"))?;
    if !metadata.file_type().is_file() {
        return Err("只允许运行脚本文件夹内的普通 Lua 文件。".to_string());
    }
    Ok(path)
}

fn load_lua_script_file(
    path: PathBuf,
    fallback_name: &str,
) -> Result<(PathBuf, String, String), String> {
    let metadata =
        fs::symlink_metadata(&path).map_err(|error| format!("无法访问 Lua 脚本：{error}"))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("只允许运行普通 Lua 文件。".to_string());
    }
    let source =
        fs::read(&path).map_err(|error| format!("无法读取脚本 {}：{error}", path.display()))?;
    if source.len() > MAX_SCRIPT_BYTES {
        return Err(format!(
            "Lua scripts cannot exceed {MAX_SCRIPT_BYTES} bytes."
        ));
    }
    let source =
        String::from_utf8(source).map_err(|_| "Lua scripts must use UTF-8.".to_string())?;
    let file_name = path
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or(fallback_name)
        .to_string();
    Ok((path, file_name, source))
}

fn load_lua_script(script_id: &str) -> Result<(PathBuf, String, String), String> {
    if let Some(extension_reference) = script_id.strip_prefix("extension:") {
        let (extension_id, command_id) = extension_reference
            .split_once(':')
            .map_or((extension_reference, None), |(extension_id, command_id)| {
                (extension_id, Some(command_id))
            });
        if extension_id.is_empty() {
            return Err("无效的扩展脚本标识。".to_string());
        }
        let entry = match command_id {
            Some(command_id) if !command_id.is_empty() => {
                platform_extensions::resolve_enabled_lua_command(extension_id, command_id)?
            }
            Some(_) => return Err("无效的扩展命令标识。".to_string()),
            None => platform_extensions::resolve_enabled_lua_entry(extension_id)?,
        };
        return load_lua_script_file(entry.path, &entry.entry_name);
    }
    let directory = script_directory()?;
    let path = resolve_lua_script_path(&directory, script_id)?;
    load_lua_script_file(path, script_id)
}

struct StoredLuaSession {
    file_path: String,
    file_name: String,
    session: LuaSession,
}

enum RuntimeRequest {
    Start {
        script_id: String,
        context: LuaScriptContext,
        reply: mpsc::Sender<Result<LuaScriptRunResult, String>>,
    },
    Dispatch {
        session_id: String,
        action: LuaScriptDialogAction,
        context: LuaScriptContext,
        reply: mpsc::Sender<Result<LuaScriptRunResult, String>>,
    },
    Close {
        session_id: String,
        reply: mpsc::Sender<Result<(), String>>,
    },
}

#[derive(Clone)]
pub(crate) struct LuaScriptRuntime {
    sender: mpsc::Sender<RuntimeRequest>,
}

impl Default for LuaScriptRuntime {
    fn default() -> Self {
        let (sender, receiver) = mpsc::channel();
        std::thread::Builder::new()
            .name("moonsprite-lua-runtime".into())
            .spawn(move || runtime_loop(receiver))
            .expect("failed to start Lua runtime thread");
        Self { sender }
    }
}

fn run_result(
    session_id: Option<String>,
    file_path: String,
    file_name: String,
    invocation: LuaInvocation,
) -> LuaScriptRunResult {
    let finished = invocation.dialogs.is_empty();
    LuaScriptRunResult {
        session_id: if finished { None } else { session_id },
        file_path,
        file_name,
        output: invocation.output,
        batches: invocation.batches,
        created_layers: invocation.created_layers,
        created_documents: invocation.created_documents,
        dialogs: invocation.dialogs,
        active_layer_id: invocation.active_layer_id,
        active_frame_number: invocation.active_frame_number,
        finished,
        elapsed_ms: invocation.elapsed_ms,
    }
}

fn runtime_loop(receiver: mpsc::Receiver<RuntimeRequest>) {
    let mut sessions = HashMap::<String, StoredLuaSession>::new();
    let mut next_session_id = 1_u64;
    while let Ok(request) = receiver.recv() {
        match request {
            RuntimeRequest::Start {
                script_id,
                context,
                reply,
            } => {
                let result = (|| {
                    let (file_path, file_name, source) = load_lua_script(&script_id)?;
                    let mut session = LuaSession::new(context, &file_name)?;
                    let invocation = session.execute_source(&source)?;
                    let session_id = format!("lua-{next_session_id}");
                    next_session_id = next_session_id.saturating_add(1);
                    let result = run_result(
                        Some(session_id.clone()),
                        file_path.to_string_lossy().to_string(),
                        file_name.clone(),
                        invocation,
                    );
                    if !result.finished {
                        sessions.insert(
                            session_id,
                            StoredLuaSession {
                                file_path: result.file_path.clone(),
                                file_name,
                                session,
                            },
                        );
                    }
                    Ok(result)
                })();
                let _ = reply.send(result);
            }
            RuntimeRequest::Dispatch {
                session_id,
                action,
                context,
                reply,
            } => {
                let result = match sessions.remove(&session_id) {
                    Some(mut stored) => match stored
                        .session
                        .rebase(context)
                        .and_then(|_| stored.session.dispatch(action))
                    {
                        Ok(invocation) => {
                            let result = run_result(
                                Some(session_id.clone()),
                                stored.file_path.clone(),
                                stored.file_name.clone(),
                                invocation,
                            );
                            if !result.finished {
                                sessions.insert(session_id, stored);
                            }
                            Ok(result)
                        }
                        Err(error) => Err(error),
                    },
                    None => Err("The Lua script session is no longer available.".into()),
                };
                let _ = reply.send(result);
            }
            RuntimeRequest::Close { session_id, reply } => {
                sessions.remove(&session_id);
                let _ = reply.send(Ok(()));
            }
        }
    }
}

fn send_runtime_request<T>(
    sender: mpsc::Sender<RuntimeRequest>,
    build: impl FnOnce(mpsc::Sender<Result<T, String>>) -> RuntimeRequest,
) -> Result<T, String> {
    let (reply_sender, reply_receiver) = mpsc::channel();
    sender
        .send(build(reply_sender))
        .map_err(|_| "The Lua runtime is unavailable.".to_string())?;
    reply_receiver
        .recv()
        .map_err(|_| "The Lua runtime stopped unexpectedly.".to_string())?
}

#[tauri::command]
pub(crate) fn list_lua_scripts() -> Result<LuaScriptListing, String> {
    let directory = script_directory()?;
    let mut scripts = list_lua_scripts_in(&directory)?;
    scripts.extend(
        platform_extensions::list_enabled_lua_entries()?
            .into_iter()
            .map(extension_script_entry),
    );
    sort_script_entries(&mut scripts);
    Ok(LuaScriptListing {
        directory_path: directory.to_string_lossy().to_string(),
        scripts,
    })
}

#[tauri::command]
pub(crate) fn open_lua_script_folder() -> Result<(), String> {
    let directory = script_directory()?;
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer.exe");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(&directory)
        .spawn()
        .map_err(|error| format!("无法打开脚本文件夹：{error}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn run_lua_script(
    state: State<'_, LuaScriptRuntime>,
    script_id: String,
    context: LuaScriptContext,
) -> Result<LuaScriptRunResult, String> {
    let sender = state.sender.clone();
    tauri::async_runtime::spawn_blocking(move || {
        send_runtime_request(sender, |reply| RuntimeRequest::Start {
            script_id,
            context,
            reply,
        })
    })
    .await
    .map_err(|error| format!("Lua runtime task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn dispatch_lua_script_dialog(
    state: State<'_, LuaScriptRuntime>,
    session_id: String,
    action: LuaScriptDialogAction,
    context: LuaScriptContext,
) -> Result<LuaScriptRunResult, String> {
    let sender = state.sender.clone();
    tauri::async_runtime::spawn_blocking(move || {
        send_runtime_request(sender, |reply| RuntimeRequest::Dispatch {
            session_id,
            action,
            context,
            reply,
        })
    })
    .await
    .map_err(|error| format!("Lua runtime task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn close_lua_script_session(
    state: State<'_, LuaScriptRuntime>,
    session_id: String,
) -> Result<(), String> {
    let sender = state.sender.clone();
    tauri::async_runtime::spawn_blocking(move || {
        send_runtime_request(sender, |reply| RuntimeRequest::Close { session_id, reply })
    })
    .await
    .map_err(|error| format!("Lua runtime task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_script_directory() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("moonsprite-lua-scripts-{stamp}"));
        fs::create_dir_all(&directory).unwrap();
        directory
    }

    #[test]
    fn lists_only_top_level_lua_files_in_stable_order() {
        let directory = temporary_script_directory();
        fs::write(directory.join("zebra.lua"), "return true").unwrap();
        fs::write(directory.join("Alpha.LUA"), "return true").unwrap();
        fs::write(directory.join("notes.txt"), "not a script").unwrap();
        fs::create_dir_all(directory.join("nested")).unwrap();
        fs::write(directory.join("nested").join("hidden.lua"), "return true").unwrap();

        let scripts = list_lua_scripts_in(&directory).unwrap();

        assert_eq!(
            scripts
                .iter()
                .map(|script| script.id.as_str())
                .collect::<Vec<_>>(),
            vec!["Alpha.LUA", "zebra.lua"]
        );
        assert_eq!(scripts[0].name, "Alpha");
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn seeds_the_moon_phase_example_once_without_overwriting_user_files() {
        let directory = temporary_script_directory();
        let script = directory.join(BUILTIN_SCRIPT_FILE_NAME);
        fs::write(&script, b"-- user copy").unwrap();

        seed_builtin_scripts(&directory).unwrap();
        assert_eq!(fs::read_to_string(&script).unwrap(), "-- user copy");
        assert!(directory.join(BUILTIN_SCRIPT_MARKER).is_file());

        fs::remove_file(&script).unwrap();
        seed_builtin_scripts(&directory).unwrap();
        assert!(!script.exists());
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn script_resolution_rejects_paths_outside_the_script_directory() {
        let directory = temporary_script_directory();
        fs::write(directory.join("allowed.lua"), "return true").unwrap();

        assert_eq!(
            resolve_lua_script_path(&directory, "allowed.lua").unwrap(),
            directory.join("allowed.lua")
        );
        assert!(resolve_lua_script_path(&directory, "../outside.lua").is_err());
        assert!(resolve_lua_script_path(&directory, "nested/inside.lua").is_err());
        assert!(resolve_lua_script_path(&directory, "nested\\inside.lua").is_err());
        assert!(resolve_lua_script_path(&directory, "notes.txt").is_err());
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn extension_entry_uses_the_same_lua_loader_as_a_regular_script() {
        let directory = temporary_script_directory();
        let extension_directory = directory.join("com.example.runner");
        fs::create_dir_all(extension_directory.join("lua")).unwrap();
        fs::write(
            extension_directory.join("manifest.json"),
            br#"{"schemaVersion":1,"id":"com.example.runner","name":"Runner","version":"1.0.0","entry":"lua/main.lua"}"#,
        )
        .unwrap();
        fs::write(extension_directory.join("lua/main.lua"), b"return true").unwrap();

        let entry = crate::platform_extensions::resolve_enabled_lua_entry_at(
            &directory,
            "com.example.runner",
        )
        .unwrap();
        let (path, file_name, source) =
            load_lua_script_file(entry.path.clone(), &entry.entry_name).unwrap();
        assert_eq!(path, extension_directory.join("lua/main.lua"));
        assert_eq!(file_name, "main.lua");
        assert_eq!(source, "return true");
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn extension_command_entries_generate_opaque_script_ids() {
        let entry = crate::platform_extensions::ExtensionLuaEntry {
            extension_id: "com.example.tools".into(),
            extension_name: "Example Tools".into(),
            command_id: Some("paint".into()),
            command_name: Some("Paint Pixel".into()),
            command_description: Some("Paints one test pixel.".into()),
            entry_name: "paint.lua".into(),
            path: PathBuf::from("extensions/com.example.tools/commands/paint.lua"),
        };

        let script = extension_script_entry(entry);

        assert_eq!(script.id, "extension:com.example.tools:paint");
        assert_eq!(script.name, "Paint Pixel");
        assert_eq!(script.extension_id.as_deref(), Some("com.example.tools"));
        assert_eq!(script.extension_name.as_deref(), Some("Example Tools"));
        assert_eq!(script.extension_command_id.as_deref(), Some("paint"));
        assert_eq!(
            script.extension_description.as_deref(),
            Some("Paints one test pixel.")
        );
    }

    #[test]
    fn legacy_extension_entries_use_the_extension_name_in_the_script_menu() {
        let entry = crate::platform_extensions::ExtensionLuaEntry {
            extension_id: "com.example.legacy".into(),
            extension_name: "Legacy Extension".into(),
            command_id: None,
            command_name: None,
            command_description: None,
            entry_name: "main.lua".into(),
            path: PathBuf::from("extensions/com.example.legacy/main.lua"),
        };

        let script = extension_script_entry(entry);

        assert_eq!(script.id, "extension:com.example.legacy");
        assert_eq!(script.name, "Legacy Extension");
        assert_eq!(script.extension_command_id, None);
    }
}
