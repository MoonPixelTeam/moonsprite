use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle, Manager,
};

const MAX_FRAME: usize = 32 * 1024 * 1024;
const CHUNK_BYTES: u64 = 64 * 1024 * 1024;
static CHUNKS: Mutex<Option<HashMap<PathBuf, PathBuf>>> = Mutex::new(None);
static SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameReference {
    pub store: String,
    pub chunk: String,
    pub offset: u64,
    pub length: u64,
    pub checksum: u32,
}

fn safe_id(value: &str) -> Result<&str, String> {
    if value.is_empty()
        || value.len() > 100
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("Invalid local recording identifier.".into());
    }
    Ok(value)
}

pub fn root() -> Result<PathBuf, String> {
    crate::platform_paths::executable_directory().map(|p| p.join("timelapse-v1"))
}

fn checksum(data: &[u8]) -> u32 {
    let mut crc = !0u32;
    for byte in data {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = (crc >> 1) ^ (0xedb88320u32 & (0u32.wrapping_sub(crc & 1)));
        }
    }
    !crc
}

fn contained(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    if !path.starts_with(root) {
        return Err("Recording path escapes its library.".into());
    }
    Ok(path)
}

pub fn append_frame(root: &Path, store: &str, data: &[u8]) -> Result<FrameReference, String> {
    safe_id(store)?;
    if data.len() < 24 || data.len() > MAX_FRAME || !data.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Invalid or oversized recording frame.".into());
    }
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let directory = root.join(store);
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let directory = contained(root, &directory)?;
    let mut guard = CHUNKS.lock().map_err(|e| e.to_string())?;
    let chunks = guard.get_or_insert_with(HashMap::new);
    let existing = chunks
        .get(&directory)
        .filter(|p| fs::metadata(p).is_ok_and(|m| m.len() + data.len() as u64 <= CHUNK_BYTES))
        .cloned();
    let path = match existing {
        Some(path) => path,
        None => {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_nanos();
            let path = directory.join(format!(
                "{}-{}-{}.bin",
                std::process::id(),
                stamp,
                SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ));
            OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
                .map_err(|e| e.to_string())?;
            chunks.insert(directory.clone(), path.clone());
            path
        }
    };
    let path = contained(root, &path)?;
    let mut file = OpenOptions::new()
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    let offset = file.metadata().map_err(|e| e.to_string())?.len();
    // A reference is returned only after bytes are durable. Failed/torn tails
    // have no committed reference and are never replayed or silently truncated.
    file.write_all(data)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    let chunk = path
        .file_stem()
        .and_then(|v| v.to_str())
        .ok_or("Invalid chunk name")?
        .to_string();
    Ok(FrameReference {
        store: store.into(),
        chunk,
        offset,
        length: data.len() as u64,
        checksum: checksum(data),
    })
}

pub fn read_frame(root: &Path, reference: &FrameReference) -> Result<Vec<u8>, String> {
    safe_id(&reference.store)?;
    safe_id(&reference.chunk)?;
    if reference.length == 0 || reference.length > MAX_FRAME as u64 {
        return Err("Invalid recording frame length.".into());
    }
    let path = contained(
        root,
        &root
            .join(&reference.store)
            .join(format!("{}.bin", reference.chunk)),
    )?;
    let mut file = fs::File::open(path).map_err(|e| format!("Local recording unavailable: {e}"))?;
    let end = reference
        .offset
        .checked_add(reference.length)
        .ok_or("Invalid recording range")?;
    if end > file.metadata().map_err(|e| e.to_string())?.len() {
        return Err("Incomplete recording frame.".into());
    }
    let mut data = vec![0; reference.length as usize];
    file.seek(SeekFrom::Start(reference.offset))
        .and_then(|_| file.read_exact(&mut data))
        .map_err(|e| e.to_string())?;
    if checksum(&data) != reference.checksum {
        return Err("Recording checksum mismatch.".into());
    }
    Ok(data)
}

/** Only missing chunks fall back; corruption or access errors must remain visible. */
pub fn read_frame_with_legacy(
    directory: &Path,
    legacy: &Path,
    reference: &FrameReference,
) -> Result<Vec<u8>, String> {
    safe_id(&reference.store)?;
    safe_id(&reference.chunk)?;
    let path = directory
        .join(&reference.store)
        .join(format!("{}.bin", reference.chunk));
    match fs::symlink_metadata(&path) {
        Ok(_) => read_frame(directory, reference),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => read_frame(legacy, reference),
        Err(error) => Err(format!("Local recording unavailable: {error}")),
    }
}

#[tauri::command]
pub async fn append_timelapse_frame(request: Request<'_>) -> Result<FrameReference, String> {
    let store = request
        .headers()
        .get("x-moonsprite-recording")
        .and_then(|v| v.to_str().ok())
        .ok_or("Missing recording identifier")?
        .to_string();
    safe_id(&store)?;
    let data = match request.body() {
        InvokeBody::Raw(data) if data.len() <= MAX_FRAME => data.clone(),
        _ => return Err("Invalid recording payload".into()),
    };
    let directory = root()?;
    tauri::async_runtime::spawn_blocking(move || {
        append_frame(&directory, &store, &data)
            .map_err(|error| format!("无法写入缩时录像库 {}：{error}", directory.display()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_timelapse_frame(
    app: AppHandle,
    reference: FrameReference,
) -> Result<Response, String> {
    let directory = root()?;
    let legacy = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("timelapse-v1");
    tauri::async_runtime::spawn_blocking(move || {
        read_frame_with_legacy(&directory, &legacy, &reference).map(Response::new)
    })
    .await
    .map_err(|e| e.to_string())?
}
