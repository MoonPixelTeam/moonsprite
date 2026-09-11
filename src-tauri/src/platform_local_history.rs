use std::{fs, path::PathBuf};
use tauri::{ipc::{InvokeBody, Request, Response}, AppHandle, Manager};

use crate::platform_storage::atomic_write;

const HISTORY_ID_HEADER: &str = "x-moonsprite-local-history-id";

fn history_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|error| error.to_string())?.join("local-history"))
}

fn safe_history_id(id: &str) -> Result<&str, String> {
    if id.is_empty() || !id.chars().all(|character| character.is_ascii_alphanumeric() || character == '_' || character == '-') {
        return Err("无效的本地历史 ID".to_string());
    }
    Ok(id)
}

fn decode_header(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'%' { decoded.push(bytes[index]); index += 1; continue; }
        if index + 2 >= bytes.len() { return Err("无效的本地历史数据头".to_string()); }
        let hex = |byte: u8| match byte { b'0'..=b'9' => Some(byte - b'0'), b'a'..=b'f' => Some(byte - b'a' + 10), b'A'..=b'F' => Some(byte - b'A' + 10), _ => None };
        let high = hex(bytes[index + 1]).ok_or_else(|| "无效的本地历史数据头".to_string())?;
        let low = hex(bytes[index + 2]).ok_or_else(|| "无效的本地历史数据头".to_string())?;
        decoded.push((high << 4) | low);
        index += 3;
    }
    String::from_utf8(decoded).map_err(|_| "无效的本地历史数据头".to_string())
}

fn request_id(request: &Request<'_>) -> Result<String, String> {
    let header = request.headers().get(HISTORY_ID_HEADER)
        .ok_or_else(|| "本地历史数据头不完整".to_string())?
        .to_str().map_err(|error| error.to_string())?;
    decode_header(header)
}

fn request_data(request: &Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() { InvokeBody::Raw(data) => Ok(data.clone()), _ => Err("本地历史必须使用二进制传输".to_string()) }
}

#[tauri::command]
pub(crate) async fn read_local_history(app: AppHandle, id: String) -> Result<Response, String> {
    let id = safe_history_id(&id)?;
    let path = history_dir(&app)?.join(format!("{id}.history"));
    // Vec<u8> as a command result is serialized as a JSON number array. Keep
    // archives binary across IPC and perform disk IO off the window thread.
    tauri::async_runtime::spawn_blocking(move || {
        fs::read(path).map(Response::new).map_err(|error| error.to_string())
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn write_local_history(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let id = safe_history_id(&request_id(&request)?)?.to_string();
    let data = request_data(&request)?;
    let directory = history_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        atomic_write(&directory.join(format!("{id}.history")), &data)
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) fn delete_local_history(app: AppHandle, id: String) -> Result<(), String> {
    let id = safe_history_id(&id)?;
    let path = history_dir(&app)?.join(format!("{id}.history"));
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}
