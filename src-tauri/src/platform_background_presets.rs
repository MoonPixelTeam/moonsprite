use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::platform_paths::ensure_executable_subdirectory;
use crate::platform_storage::atomic_write;

const PRESET_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp", "gif"];
const BUILTIN_SEED_MARKER: &str = ".moonsprite-background-presets";
const BUILTIN_PRESET_VERSION: &[u8] = b"2";
const MAX_PRESET_FILE_BYTES: usize = 32 * 1024 * 1024;
const MAX_PRESET_DIMENSION: u32 = 4096;
const MAX_PRESET_PIXELS: u64 = 16_777_216;
const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
const BUILTIN_PRESETS: &[(&str, &[u8])] = &[
    (
        "grid.png",
        include_bytes!("../resources/background-presets/grid.png"),
    ),
    (
        "stripes.png",
        include_bytes!("../resources/background-presets/stripes.png"),
    ),
    (
        "diamond.png",
        include_bytes!("../resources/background-presets/diamond.png"),
    ),
    (
        "diamond-nested.png",
        include_bytes!("../resources/background-presets/diamond-nested.png"),
    ),
    (
        "circles.png",
        include_bytes!("../resources/background-presets/circles.png"),
    ),
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredBackgroundPreset {
    id: String,
    name: String,
    file_path: String,
    built_in: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackgroundPresetListing {
    directory_path: String,
    presets: Vec<StoredBackgroundPreset>,
}

fn preset_dir() -> Result<PathBuf, String> {
    let directory = ensure_executable_subdirectory("BackgroundPresets", "背景图层预设")?;
    seed_builtin_presets(&directory)?;
    Ok(directory)
}

fn seed_builtin_presets(directory: &Path) -> Result<(), String> {
    let marker = directory.join(BUILTIN_SEED_MARKER);
    if fs::read(&marker).ok().as_deref() == Some(BUILTIN_PRESET_VERSION) {
        return Ok(());
    }
    for (name, bytes) in BUILTIN_PRESETS {
        let destination = directory.join(name);
        atomic_write(&destination, bytes)?;
    }
    atomic_write(&marker, BUILTIN_PRESET_VERSION)
}

fn is_preset_file(path: &Path) -> bool {
    path.is_file()
        && path
            .metadata()
            .map(|metadata| metadata.len() <= 32 * 1024 * 1024)
            .unwrap_or(false)
        && path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| {
                PRESET_EXTENSIONS
                    .iter()
                    .any(|extension| value.eq_ignore_ascii_case(extension))
            })
}

fn readable_name(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Background preset")
        .replace('-', " ")
        .replace('_', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn clean_preset_name(name: &str) -> String {
    let cleaned = name
        .trim()
        .chars()
        .filter(|character| {
            !character.is_control()
                && !['/', '\\', ':', '*', '?', '"', '<', '>', '|'].contains(character)
        })
        .take(80)
        .collect::<String>();
    let cleaned =
        cleaned.trim_matches(|character: char| character.is_whitespace() || character == '.');
    if cleaned.is_empty() {
        "选区背景预设".to_string()
    } else {
        cleaned.to_string()
    }
}

fn validate_png_preset(data: &[u8]) -> Result<(), String> {
    if data.len() > MAX_PRESET_FILE_BYTES {
        return Err("背景预设文件不能超过 32 MB。".to_string());
    }
    if data.len() < 24 || !data.starts_with(PNG_SIGNATURE) || data.get(12..16) != Some(b"IHDR") {
        return Err("背景预设必须是有效的 PNG 图片。".to_string());
    }
    let width = u32::from_be_bytes([data[16], data[17], data[18], data[19]]);
    let height = u32::from_be_bytes([data[20], data[21], data[22], data[23]]);
    if width == 0
        || height == 0
        || width > MAX_PRESET_DIMENSION
        || height > MAX_PRESET_DIMENSION
        || u64::from(width) * u64::from(height) > MAX_PRESET_PIXELS
    {
        return Err("背景预设尺寸无效或超过限制。".to_string());
    }
    Ok(())
}

fn stored_background_preset(path: &Path) -> Option<StoredBackgroundPreset> {
    let id = path.file_name()?.to_str()?.to_string();
    Some(StoredBackgroundPreset {
        name: readable_name(path),
        file_path: path.to_string_lossy().to_string(),
        built_in: built_in_order(&id) != usize::MAX,
        id,
    })
}

fn unique_preset_path(directory: &Path, name: &str) -> PathBuf {
    let mut suffix = 1;
    loop {
        let file_name = if suffix == 1 {
            format!("{name}.png")
        } else {
            format!("{name} {suffix}.png")
        };
        let path = directory.join(file_name);
        if !path.exists() {
            return path;
        }
        suffix += 1;
    }
}

fn save_background_preset_to(
    directory: &Path,
    name: &str,
    data: &[u8],
) -> Result<StoredBackgroundPreset, String> {
    validate_png_preset(data)?;
    fs::create_dir_all(directory)
        .map_err(|error| format!("无法创建背景图层预设文件夹：{error}"))?;
    let path = unique_preset_path(directory, &clean_preset_name(name));
    atomic_write(&path, data)?;
    stored_background_preset(&path).ok_or_else(|| "无法读取已保存的背景预设。".to_string())
}

fn built_in_order(id: &str) -> usize {
    BUILTIN_PRESETS
        .iter()
        .position(|(name, _)| *name == id)
        .unwrap_or(usize::MAX)
}

pub(crate) fn ensure_background_preset_folder() -> Result<PathBuf, String> {
    preset_dir()
}

#[tauri::command]
pub(crate) fn list_background_presets() -> Result<BackgroundPresetListing, String> {
    let directory = preset_dir()?;
    let mut presets = fs::read_dir(&directory)
        .map_err(|error| format!("无法读取背景图层预设文件夹：{error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| is_preset_file(path))
        .filter_map(|path| stored_background_preset(&path))
        .collect::<Vec<_>>();
    presets.sort_by(|left, right| {
        built_in_order(&left.id)
            .cmp(&built_in_order(&right.id))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(BackgroundPresetListing {
        directory_path: directory.to_string_lossy().to_string(),
        presets,
    })
}

#[tauri::command]
pub(crate) fn save_background_preset(
    name: String,
    data: Vec<u8>,
) -> Result<StoredBackgroundPreset, String> {
    let directory = preset_dir()?;
    save_background_preset_to(&directory, &name, &data)
}

#[tauri::command]
pub(crate) fn open_background_preset_folder() -> Result<(), String> {
    let directory = preset_dir()?;
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer.exe");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(&directory)
        .spawn()
        .map_err(|error| format!("无法打开背景图层预设文件夹：{error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        save_background_preset_to, seed_builtin_presets, BUILTIN_PRESETS, BUILTIN_PRESET_VERSION,
        BUILTIN_SEED_MARKER,
    };
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn seeds_once_and_respects_user_deletions() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("moonsprite-background-presets-{stamp}"));
        fs::create_dir_all(&directory).unwrap();

        seed_builtin_presets(&directory).unwrap();
        assert!(BUILTIN_PRESETS
            .iter()
            .all(|(name, _)| directory.join(name).is_file()));
        assert!(directory.join(BUILTIN_SEED_MARKER).is_file());

        let deleted = directory.join(BUILTIN_PRESETS[0].0);
        fs::remove_file(&deleted).unwrap();
        seed_builtin_presets(&directory).unwrap();
        assert!(!deleted.exists());

        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn upgrades_versioned_builtin_presets() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("moonsprite-background-preset-upgrade-{stamp}"));
        fs::create_dir_all(&directory).unwrap();
        let (name, bytes) = BUILTIN_PRESETS[0];
        fs::write(directory.join(name), b"old preset").unwrap();
        fs::write(directory.join(BUILTIN_SEED_MARKER), b"1").unwrap();

        seed_builtin_presets(&directory).unwrap();

        assert_eq!(fs::read(directory.join(name)).unwrap(), bytes);
        assert_eq!(fs::read(directory.join(BUILTIN_SEED_MARKER)).unwrap(), BUILTIN_PRESET_VERSION);
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn saves_valid_png_presets_without_overwriting_existing_files() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory =
            std::env::temp_dir().join(format!("moonsprite-save-background-presets-{stamp}"));
        fs::create_dir_all(&directory).unwrap();
        let bytes = BUILTIN_PRESETS[0].1;

        let first = save_background_preset_to(&directory, "选区:/背景预设.", bytes).unwrap();
        let second = save_background_preset_to(&directory, "选区:/背景预设.", bytes).unwrap();

        assert_eq!(first.id, "选区背景预设.png");
        assert_eq!(first.name, "选区背景预设");
        assert!(!first.built_in);
        assert_eq!(second.id, "选区背景预设 2.png");
        assert_eq!(fs::read(first.file_path).unwrap(), bytes);
        assert!(save_background_preset_to(&directory, "invalid", b"not a png").is_err());

        let _ = fs::remove_dir_all(directory);
    }
}
