use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    ipc::{InvokeBody, Request},
    AppHandle, Manager, State,
};

use crate::platform_storage::atomic_write;

const MILLIS_PER_DAY: u128 = 86_400_000;
const RECOVERY_ID_HEADER: &str = "x-moonsprite-recovery-id";
const RECOVERY_NAME_HEADER: &str = "x-moonsprite-recovery-name";

#[derive(Default)]
pub(crate) struct RecoveryState {
    previous_session_crashed: Mutex<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecoveryRecord {
    id: String,
    name: String,
    updated_at: String,
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn recovery_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("recovery"))
}

fn session_marker(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("session-state.json"))
}

fn chrono_like_timestamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
}

fn unix_timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn recovery_timestamp_millis(value: &str) -> Option<u128> {
    let numeric = value.trim().parse::<u128>().ok()?;
    if numeric >= 100_000_000_000_000_000 {
        Some(numeric / 1_000_000)
    } else if numeric >= 100_000_000_000_000 {
        Some(numeric / 1_000)
    } else if numeric > 0 && numeric < 100_000_000_000 {
        Some(numeric * 1_000)
    } else {
        Some(numeric)
    }
}

fn file_modified_millis(path: &Path) -> Option<u128> {
    fs::metadata(path)
        .ok()?
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis())
}

fn remove_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn purge_expired_recoveries(
    directory: &Path,
    retention_days: u32,
    now_millis: u128,
) -> Result<(), String> {
    let retention_days = retention_days.clamp(1, 365) as u128;
    let retention_millis = retention_days.saturating_mul(MILLIS_PER_DAY);
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        if safe_recovery_id(id).is_err() {
            continue;
        }
        let updated_at = fs::read_to_string(&path)
            .ok()
            .and_then(|value| serde_json::from_str::<RecoveryRecord>(&value).ok())
            .and_then(|record| recovery_timestamp_millis(&record.updated_at))
            .or_else(|| file_modified_millis(&path));
        let Some(updated_at) = updated_at else {
            continue;
        };
        if now_millis.saturating_sub(updated_at) <= retention_millis {
            continue;
        }
        remove_if_exists(&directory.join(format!("{id}.moonsprite")))?;
        remove_if_exists(&path)?;
    }
    Ok(())
}

pub(crate) fn mark_session(app: &AppHandle, clean: bool) -> Result<(), String> {
    let payload = serde_json::json!({ "clean": clean, "updatedAt": chrono_like_timestamp() });
    atomic_write(&session_marker(app)?, payload.to_string().as_bytes())
}

pub(crate) fn initialize_session_marker(
    app: &AppHandle,
    state: &RecoveryState,
) -> Result<(), String> {
    if let Err(error) = migrate_legacy_data(app) {
        eprintln!("无法迁移恢复数据，继续启动 MoonSprite：{error}");
    }
    let marker = session_marker(app)?;
    let crashed = fs::read_to_string(marker)
        .ok()
        .and_then(|value| serde_json::from_str::<serde_json::Value>(&value).ok())
        .and_then(|value| value.get("clean").and_then(serde_json::Value::as_bool))
        .map(|clean| !clean)
        .unwrap_or(false);
    *state
        .previous_session_crashed
        .lock()
        .map_err(|_| "恢复状态锁不可用")? = crashed;
    if let Err(error) = mark_session(app, false) {
        eprintln!("无法写入恢复会话标记，继续启动 MoonSprite：{error}");
    }
    Ok(())
}

fn migrate_legacy_data(app: &AppHandle) -> Result<(), String> {
    let Some(roaming) = std::env::var_os("APPDATA") else {
        return Ok(());
    };
    let legacy = PathBuf::from(roaming).join("moonsprite");
    let current = app_data_dir(app)?;
    if !legacy.exists() || legacy == current {
        return Ok(());
    }
    fs::create_dir_all(&current).map_err(|error| error.to_string())?;
    let legacy_marker = legacy.join("session-state.json");
    let current_marker = current.join("session-state.json");
    if legacy_marker.exists() && !current_marker.exists() {
        fs::copy(legacy_marker, current_marker).map_err(|error| error.to_string())?;
    }
    let legacy_recovery = legacy.join("recovery");
    let current_recovery = current.join("recovery");
    if legacy_recovery.exists() && !current_recovery.exists() {
        fs::create_dir_all(&current_recovery).map_err(|error| error.to_string())?;
        for entry in fs::read_dir(legacy_recovery).map_err(|error| error.to_string())? {
            let path = entry.map_err(|error| error.to_string())?.path();
            if path.is_file() {
                if let Some(name) = path.file_name() {
                    fs::copy(&path, current_recovery.join(name))
                        .map_err(|error| error.to_string())?;
                }
            }
        }
    }
    Ok(())
}

fn safe_recovery_id(id: &str) -> Result<&str, String> {
    if id.is_empty()
        || !id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '-'
        })
    {
        return Err("无效的恢复文件 ID".to_string());
    }
    Ok(id)
}

fn decode_header(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'%' {
            decoded.push(bytes[index]);
            index += 1;
            continue;
        }
        if index + 2 >= bytes.len() {
            return Err("无效的恢复数据头".to_string());
        }
        let hex = |byte: u8| match byte {
            b'0'..=b'9' => Some(byte - b'0'),
            b'a'..=b'f' => Some(byte - b'a' + 10),
            b'A'..=b'F' => Some(byte - b'A' + 10),
            _ => None,
        };
        let high = hex(bytes[index + 1]).ok_or_else(|| "无效的恢复数据头".to_string())?;
        let low = hex(bytes[index + 2]).ok_or_else(|| "无效的恢复数据头".to_string())?;
        decoded.push((high << 4) | low);
        index += 3;
    }
    String::from_utf8(decoded).map_err(|_| "无效的恢复数据头".to_string())
}

fn request_header(request: &Request<'_>, name: &str) -> Result<String, String> {
    let value = request
        .headers()
        .get(name)
        .ok_or_else(|| "恢复数据头不完整".to_string())?
        .to_str()
        .map_err(|error| error.to_string())?;
    decode_header(value)
}

fn request_data(request: &Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(data) => Ok(data.clone()),
        _ => Err("恢复数据必须使用二进制传输".to_string()),
    }
}

#[tauri::command]
pub(crate) fn list_recoveries(
    app: AppHandle,
    state: State<'_, RecoveryState>,
    retention_days: u32,
) -> Result<Vec<RecoveryRecord>, String> {
    let directory = recovery_dir(&app)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    purge_expired_recoveries(&directory, retention_days, unix_timestamp_millis())?;
    if !*state
        .previous_session_crashed
        .lock()
        .map_err(|_| "恢复状态锁不可用")?
    {
        return Ok(Vec::new());
    }
    let mut records = Vec::new();
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        if let Ok(value) = fs::read_to_string(path) {
            if let Ok(record) = serde_json::from_str::<RecoveryRecord>(&value) {
                records.push(record);
            }
        }
    }
    records.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(records)
}

#[tauri::command]
pub(crate) fn read_recovery(app: AppHandle, id: String) -> Result<Vec<u8>, String> {
    let id = safe_recovery_id(&id)?;
    fs::read(recovery_dir(&app)?.join(format!("{id}.moonsprite")))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn write_recovery(
    app: AppHandle,
    request: Request<'_>,
) -> Result<(), String> {
    let id = request_header(&request, RECOVERY_ID_HEADER)?;
    let name = request_header(&request, RECOVERY_NAME_HEADER)?;
    let data = request_data(&request)?;
    let id = safe_recovery_id(&id)?;
    let directory = recovery_dir(&app)?;
    let id = id.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        atomic_write(&directory.join(format!("{id}.moonsprite")), &data)?;
        let record = RecoveryRecord {
            id: id.clone(),
            name,
            updated_at: unix_timestamp_millis().to_string(),
        };
        atomic_write(
            &directory.join(format!("{id}.json")),
            serde_json::to_string(&record)
                .map_err(|error| error.to_string())?
                .as_bytes(),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) fn delete_recovery(app: AppHandle, id: String) -> Result<(), String> {
    let id = safe_recovery_id(&id)?;
    let directory = recovery_dir(&app)?;
    let _ = fs::remove_file(directory.join(format!("{id}.moonsprite")));
    let _ = fs::remove_file(directory.join(format!("{id}.json")));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_recovery_directory() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("test clock should be after epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "moonsprite-recovery-test-{}-{suffix}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).expect("temporary recovery directory should be created");
        directory
    }

    fn write_test_recovery(directory: &Path, id: &str, updated_at: u128) {
        let record = RecoveryRecord {
            id: id.to_string(),
            name: id.to_string(),
            updated_at: updated_at.to_string(),
        };
        fs::write(
            directory.join(format!("{id}.json")),
            serde_json::to_vec(&record).expect("record should serialize"),
        )
        .expect("record should be written");
        fs::write(directory.join(format!("{id}.moonsprite")), [1, 2, 3])
            .expect("recovery data should be written");
    }

    #[test]
    fn parses_legacy_recovery_timestamp_units() {
        expect_timestamp("1700000000", 1_700_000_000_000);
        expect_timestamp("1700000000000", 1_700_000_000_000);
        expect_timestamp("1700000000000000", 1_700_000_000_000);
        expect_timestamp("1700000000000000000", 1_700_000_000_000);
    }

    #[test]
    fn decodes_recovery_headers_without_accepting_malformed_percent_sequences() {
        assert_eq!(decode_header("draft%20%E6%81%A2%E5%A4%8D").unwrap(), "draft 恢复");
        assert!(decode_header("broken%ZZ").is_err());
        assert!(decode_header("broken%").is_err());
    }

    fn expect_timestamp(value: &str, expected: u128) {
        assert_eq!(recovery_timestamp_millis(value), Some(expected));
    }

    #[test]
    fn purges_only_recoveries_older_than_the_retention_window() {
        let directory = temporary_recovery_directory();
        let now = 1_800_000_000_000_u128;
        write_test_recovery(&directory, "expired", now - 8 * MILLIS_PER_DAY);
        write_test_recovery(&directory, "recent", now - 6 * MILLIS_PER_DAY);

        purge_expired_recoveries(&directory, 7, now).expect("cleanup should succeed");

        assert!(!directory.join("expired.json").exists());
        assert!(!directory.join("expired.moonsprite").exists());
        assert!(directory.join("recent.json").exists());
        assert!(directory.join("recent.moonsprite").exists());
        fs::remove_dir_all(directory).expect("temporary recovery directory should be removed");
    }
}
