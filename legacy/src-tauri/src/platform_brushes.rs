use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::platform_paths::ensure_executable_subdirectory;
use crate::platform_storage::atomic_write;

const BRUSH_ORDER_FILE: &str = ".brush-order.json";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredBrush {
    id: String,
    name: String,
    file_path: String,
    intrinsic_size: bool,
    source_x: Option<i32>,
    source_y: Option<i32>,
    folder_id: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredBrushFolder {
    id: String,
    name: String,
    file_path: String,
}

#[derive(Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct BrushMetadata {
    intrinsic_size: bool,
    source_x: Option<i32>,
    source_y: Option<i32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BrushListing {
    directory_path: String,
    brushes: Vec<StoredBrush>,
    folders: Vec<StoredBrushFolder>,
}

fn brush_dir() -> Result<PathBuf, String> {
    ensure_executable_subdirectory("brushes", "笔刷")
}

fn read_brush_order(directory: &Path) -> Vec<String> {
    fs::read(directory.join(BRUSH_ORDER_FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Vec<String>>(&bytes).ok())
        .unwrap_or_default()
}

fn write_brush_order(directory: &Path, ids: &[String]) -> Result<(), String> {
    let bytes = serde_json::to_vec(ids).map_err(|error| format!("无法保存笔刷顺序：{error}"))?;
    atomic_write(&directory.join(BRUSH_ORDER_FILE), &bytes)
}

fn uuid_suffix() -> String {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("{}-{timestamp}", std::process::id())
}

fn relative_folder_id(directory: &Path, folder: &Path) -> Option<String> {
    let relative = folder.strip_prefix(directory).ok()?;
    let parts = relative
        .components()
        .filter_map(|component| component.as_os_str().to_str())
        .filter(|component| !component.is_empty())
        .collect::<Vec<_>>();
    (!parts.is_empty()).then(|| parts.join("/"))
}

fn folder_id_for_brush_path(directory: &Path, path: &Path) -> Option<String> {
    relative_folder_id(directory, path.parent()?)
}

fn folder_name(folder_id: &str) -> String {
    folder_id
        .rsplit('/')
        .next()
        .unwrap_or(folder_id)
        .to_string()
}

fn collect_entries(
    directory: &Path,
    current: &Path,
    brushes: &mut Vec<PathBuf>,
    folders: &mut Vec<PathBuf>,
) -> Result<(), String> {
    for entry in fs::read_dir(current).map_err(|error| format!("无法读取笔刷文件夹：{error}"))?
    {
        let path = entry
            .map_err(|error| format!("无法读取笔刷文件：{error}"))?
            .path();
        if path.is_dir() {
            if path != directory {
                folders.push(path.clone());
            }
            collect_entries(directory, &path, brushes, folders)?;
            continue;
        }
        let is_png = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("png"))
            .unwrap_or(false);
        if is_png {
            brushes.push(path);
        }
    }
    Ok(())
}

fn brush_path(directory: &Path, id: &str) -> Result<PathBuf, String> {
    let id = safe_brush_id(id)?;
    let mut brushes = Vec::new();
    let mut folders = Vec::new();
    collect_entries(directory, directory, &mut brushes, &mut folders)?;
    brushes
        .into_iter()
        .find(|path| path.file_name().and_then(|value| value.to_str()) == Some(id))
        .ok_or_else(|| "笔刷文件不存在。".to_string())
}

fn stored_brush(directory: &Path, path: &Path) -> Result<StoredBrush, String> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("笔刷文件名无效：{}", path.display()))?;
    let name = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(file_name)
        .to_string();
    let metadata_path = path.with_extension("meta.json");
    let metadata = fs::read(&metadata_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<BrushMetadata>(&bytes).ok())
        .unwrap_or_default();
    Ok(StoredBrush {
        id: file_name.to_string(),
        name,
        file_path: path.to_string_lossy().to_string(),
        intrinsic_size: true,
        source_x: metadata.source_x,
        source_y: metadata.source_y,
        folder_id: folder_id_for_brush_path(directory, path),
    })
}

fn safe_brush_id(id: &str) -> Result<&str, String> {
    if id.is_empty()
        || id.contains(['/', '\\'])
        || id.contains("..")
        || !id.to_ascii_lowercase().ends_with(".png")
    {
        return Err("无效的笔刷文件 ID。".to_string());
    }
    Ok(id)
}

fn safe_folder_id(id: &str) -> Result<&str, String> {
    if id.is_empty() || id.starts_with('/') || id.starts_with('\\') || id.contains("..") {
        return Err("无效的笔刷文件夹 ID。".to_string());
    }
    for part in id.split('/') {
        if part.is_empty()
            || part == "."
            || part.contains(['\\', ':', '*', '?', '"', '<', '>', '|'])
        {
            return Err("无效的笔刷文件夹 ID。".to_string());
        }
    }
    Ok(id)
}

fn folder_path(directory: &Path, folder_id: Option<&str>) -> Result<PathBuf, String> {
    let Some(folder_id) = folder_id else {
        return Ok(directory.to_path_buf());
    };
    let folder_id = safe_folder_id(folder_id)?;
    let path = folder_id
        .split('/')
        .fold(directory.to_path_buf(), |path, part| path.join(part));
    if !path.starts_with(directory) {
        return Err("无效的笔刷文件夹路径。".to_string());
    }
    Ok(path)
}

fn clean_folder_name(name: &str) -> String {
    name.trim()
        .chars()
        .filter(|character| !['/', '\\', ':', '*', '?', '"', '<', '>', '|'].contains(character))
        .collect::<String>()
        .trim()
        .to_string()
}

#[tauri::command]
pub(crate) fn list_brushes() -> Result<BrushListing, String> {
    let directory = brush_dir()?;
    let order = read_brush_order(&directory);
    let mut brush_paths = Vec::new();
    let mut folder_paths = Vec::new();
    collect_entries(&directory, &directory, &mut brush_paths, &mut folder_paths)?;
    let mut brushes = brush_paths
        .iter()
        .map(|path| stored_brush(&directory, path))
        .collect::<Result<Vec<_>, _>>()?;
    let mut folders = folder_paths
        .iter()
        .filter_map(|path| {
            let id = relative_folder_id(&directory, path)?;
            Some(StoredBrushFolder {
                name: folder_name(&id),
                id,
                file_path: path.to_string_lossy().to_string(),
            })
        })
        .collect::<Vec<_>>();
    folders.sort_by(|left, right| left.id.cmp(&right.id));
    brushes.sort_by(|left, right| {
        let left_index = order.iter().position(|id| id == &left.id);
        let right_index = order.iter().position(|id| id == &right.id);
        left_index
            .unwrap_or(usize::MAX)
            .cmp(&right_index.unwrap_or(usize::MAX))
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(BrushListing {
        directory_path: directory.to_string_lossy().to_string(),
        brushes,
        folders,
    })
}

#[tauri::command]
pub(crate) fn save_brush(
    name: String,
    data: Vec<u8>,
    intrinsic_size: Option<bool>,
    source_x: Option<i32>,
    source_y: Option<i32>,
    folder_id: Option<String>,
) -> Result<StoredBrush, String> {
    let directory = brush_dir()?;
    let target_directory = folder_path(&directory, folder_id.as_deref())?;
    if !target_directory.exists() {
        return Err("笔刷文件夹不存在。".to_string());
    }
    let clean_name: String = name
        .trim()
        .chars()
        .filter(|character| !['/', '\\', ':', '*', '?', '"', '<', '>', '|'].contains(character))
        .collect();
    let clean_name = if clean_name.trim().is_empty() {
        "选区笔刷"
    } else {
        clean_name.trim()
    };
    let file_name = format!("{}-{}.png", clean_name, uuid_suffix());
    let path = target_directory.join(&file_name);
    atomic_write(&path, &data)?;
    let metadata_path = path.with_extension("meta.json");
    let metadata = serde_json::to_vec(&BrushMetadata {
        intrinsic_size: intrinsic_size.unwrap_or(true),
        source_x,
        source_y,
    })
    .map_err(|error| format!("无法保存笔刷元数据：{error}"))?;
    if let Err(error) = atomic_write(&metadata_path, &metadata) {
        let _ = fs::remove_file(&path);
        return Err(error);
    }
    let stored = stored_brush(&directory, &path)?;
    let mut order = read_brush_order(&directory);
    order.retain(|id| id != &stored.id);
    order.push(stored.id.clone());
    if let Err(error) = write_brush_order(&directory, &order) {
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(&metadata_path);
        return Err(error);
    }
    Ok(stored)
}

#[tauri::command]
pub(crate) fn delete_brush(id: String) -> Result<(), String> {
    let directory = brush_dir()?;
    let path = brush_path(&directory, &id)?;
    let metadata_path = path.with_extension("meta.json");
    let previous_order = read_brush_order(&directory);
    let mut next_order = previous_order.clone();
    next_order.retain(|item| item != &id);
    write_brush_order(&directory, &next_order)?;
    if let Err(error) = fs::remove_file(&path) {
        let _ = write_brush_order(&directory, &previous_order);
        return Err(format!("无法删除笔刷：{error}"));
    }
    let _ = fs::remove_file(metadata_path);
    Ok(())
}

#[tauri::command]
pub(crate) fn set_brush_order(ids: Vec<String>) -> Result<(), String> {
    let directory = brush_dir()?;
    let mut normalized = Vec::new();
    for id in ids {
        let id = safe_brush_id(&id)?.to_string();
        if brush_path(&directory, &id).is_ok() && !normalized.contains(&id) {
            normalized.push(id);
        }
    }
    write_brush_order(&directory, &normalized)
}

fn create_brush_folder_in(
    directory: &Path,
    name: String,
    parent_folder_id: Option<String>,
) -> Result<StoredBrushFolder, String> {
    let parent_directory = folder_path(directory, parent_folder_id.as_deref())?;
    if !parent_directory.is_dir() {
        return Err("父级笔刷文件夹不存在。".to_string());
    }
    let clean_name = clean_folder_name(&name);
    if clean_name.is_empty() {
        return Err("笔刷文件夹名称不能为空。".to_string());
    }
    let mut folder_name = clean_name.clone();
    let mut suffix = 2;
    while parent_directory.join(&folder_name).exists() {
        folder_name = format!("{clean_name}-{suffix}");
        suffix += 1;
    }
    let path = parent_directory.join(&folder_name);
    fs::create_dir_all(&path).map_err(|error| format!("无法创建笔刷文件夹：{error}"))?;
    let id = relative_folder_id(directory, &path)
        .ok_or_else(|| "无法生成笔刷文件夹 ID。".to_string())?;
    Ok(StoredBrushFolder {
        id,
        name: folder_name,
        file_path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub(crate) fn create_brush_folder(
    name: String,
    parent_folder_id: Option<String>,
) -> Result<StoredBrushFolder, String> {
    let directory = brush_dir()?;
    create_brush_folder_in(&directory, name, parent_folder_id)
}

fn rename_brush_folder_in(
    directory: &Path,
    id: String,
    name: String,
) -> Result<StoredBrushFolder, String> {
    let source = folder_path(directory, Some(&id))?;
    if !source.is_dir() {
        return Err("笔刷文件夹不存在。".to_string());
    }
    let clean_name = clean_folder_name(&name);
    if clean_name.is_empty() {
        return Err("笔刷文件夹名称不能为空。".to_string());
    }
    if source.file_name().and_then(|value| value.to_str()) == Some(clean_name.as_str()) {
        return Ok(StoredBrushFolder {
            id,
            name: clean_name,
            file_path: source.to_string_lossy().to_string(),
        });
    }
    let parent = source
        .parent()
        .filter(|path| path.starts_with(directory))
        .ok_or_else(|| "无效的笔刷文件夹路径。".to_string())?;
    let target = parent.join(&clean_name);
    if target.exists() {
        let same_folder = match (fs::canonicalize(&source), fs::canonicalize(&target)) {
            (Ok(source), Ok(target)) => source == target,
            _ => false,
        };
        if !same_folder {
            return Err("同级目录中已存在同名笔刷文件夹。".to_string());
        }
        let temporary = parent.join(format!(".moonsprite-folder-{}", uuid_suffix()));
        fs::rename(&source, &temporary)
            .map_err(|error| format!("无法重命名笔刷文件夹：{error}"))?;
        if let Err(error) = fs::rename(&temporary, &target) {
            let _ = fs::rename(&temporary, &source);
            return Err(format!("无法重命名笔刷文件夹：{error}"));
        }
    } else {
        fs::rename(&source, &target).map_err(|error| format!("无法重命名笔刷文件夹：{error}"))?;
    }
    let next_id = relative_folder_id(directory, &target)
        .ok_or_else(|| "无法生成笔刷文件夹 ID。".to_string())?;
    Ok(StoredBrushFolder {
        id: next_id,
        name: clean_name,
        file_path: target.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub(crate) fn rename_brush_folder(id: String, name: String) -> Result<StoredBrushFolder, String> {
    let directory = brush_dir()?;
    rename_brush_folder_in(&directory, id, name)
}

fn delete_brush_folder_in(directory: &Path, id: String) -> Result<(), String> {
    let path = folder_path(directory, Some(&id))?;
    if !path.is_dir() {
        return Err("笔刷文件夹不存在。".to_string());
    }
    let mut brush_paths = Vec::new();
    let mut folder_paths = Vec::new();
    collect_entries(directory, &path, &mut brush_paths, &mut folder_paths)?;
    let deleted_ids = brush_paths
        .iter()
        .filter_map(|brush| {
            brush
                .file_name()
                .and_then(|value| value.to_str())
                .map(str::to_string)
        })
        .collect::<Vec<_>>();
    let previous_order = read_brush_order(directory);
    let next_order = previous_order
        .iter()
        .filter(|item| !deleted_ids.contains(item))
        .cloned()
        .collect::<Vec<_>>();
    write_brush_order(directory, &next_order)?;
    if let Err(error) = fs::remove_dir_all(&path) {
        let _ = write_brush_order(directory, &previous_order);
        return Err(format!("无法删除笔刷文件夹：{error}"));
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn delete_brush_folder(id: String) -> Result<(), String> {
    let directory = brush_dir()?;
    delete_brush_folder_in(&directory, id)
}

#[tauri::command]
pub(crate) fn move_brush(id: String, folder_id: Option<String>) -> Result<StoredBrush, String> {
    let directory = brush_dir()?;
    let source = brush_path(&directory, &id)?;
    let target_directory = folder_path(&directory, folder_id.as_deref())?;
    if !target_directory.exists() {
        return Err("笔刷文件夹不存在。".to_string());
    }
    let target = target_directory.join(
        source
            .file_name()
            .ok_or_else(|| "笔刷文件名无效。".to_string())?,
    );
    if source != target {
        if target.exists() {
            return Err("目标文件夹中已经存在同名笔刷。".to_string());
        }
        fs::rename(&source, &target).map_err(|error| format!("无法移动笔刷：{error}"))?;
        let source_metadata = source.with_extension("meta.json");
        if source_metadata.exists() {
            let target_metadata = target.with_extension("meta.json");
            if let Err(error) = fs::rename(&source_metadata, &target_metadata) {
                let _ = fs::rename(&target, &source);
                return Err(format!("无法移动笔刷元数据：{error}"));
            }
        }
    }
    stored_brush(&directory, &target)
}

#[tauri::command]
pub(crate) fn open_brush_folder() -> Result<(), String> {
    let directory = brush_dir()?;
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer.exe");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(&directory)
        .spawn()
        .map_err(|error| format!("无法打开笔刷文件夹：{error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        create_brush_folder_in, delete_brush_folder_in, folder_id_for_brush_path, read_brush_order,
        relative_folder_id, rename_brush_folder_in, uuid_suffix, write_brush_order,
    };
    use std::{fs, path::PathBuf};

    #[test]
    fn resolves_visible_brush_folder_ids() {
        let root = PathBuf::from("brushes");
        let top_level = root.join("Characters");
        let nested = top_level.join("Heroes");

        assert_eq!(relative_folder_id(&root, &root), None);
        assert_eq!(
            relative_folder_id(&root, &top_level).as_deref(),
            Some("Characters")
        );
        assert_eq!(
            relative_folder_id(&root, &nested).as_deref(),
            Some("Characters/Heroes")
        );
        assert_eq!(
            folder_id_for_brush_path(&root, &root.join("round.png")),
            None
        );
        assert_eq!(
            folder_id_for_brush_path(&root, &nested.join("round.png")).as_deref(),
            Some("Characters/Heroes")
        );
    }

    #[test]
    fn creates_renames_and_recursively_deletes_nested_folders() {
        let root = std::env::temp_dir().join(format!("moonsprite-brush-folders-{}", uuid_suffix()));
        fs::create_dir_all(&root).unwrap();

        let parent = create_brush_folder_in(&root, "Characters".to_string(), None).unwrap();
        let child =
            create_brush_folder_in(&root, "Heroes".to_string(), Some(parent.id.clone())).unwrap();
        assert_eq!(child.id, "Characters/Heroes");

        let brush_id = "round.png".to_string();
        fs::write(root.join(&child.id).join(&brush_id), [0_u8]).unwrap();
        write_brush_order(&root, std::slice::from_ref(&brush_id)).unwrap();

        let renamed = rename_brush_folder_in(&root, parent.id, "Actors".to_string()).unwrap();
        assert_eq!(renamed.id, "Actors");
        assert!(root.join("Actors/Heroes/round.png").is_file());

        delete_brush_folder_in(&root, renamed.id).unwrap();
        assert!(!root.join("Actors").exists());
        assert!(read_brush_order(&root).is_empty());

        fs::remove_dir_all(root).unwrap();
    }
}
