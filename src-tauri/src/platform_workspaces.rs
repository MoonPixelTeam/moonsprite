use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::platform_paths::ensure_executable_subdirectory;
use crate::platform_storage::atomic_write;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceDiskFile {
    schema_version: u32,
    id: String,
    name: String,
    updated_at: String,
    layout: serde_json::Value,
    #[serde(default)]
    initial_layout: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredWorkspace {
    id: String,
    name: String,
    file_path: String,
    updated_at: String,
    built_in: bool,
    layout: serde_json::Value,
    initial_layout: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceListing {
    directory_path: String,
    workspaces: Vec<StoredWorkspace>,
}

fn workspace_dir() -> Result<PathBuf, String> {
    ensure_executable_subdirectory("workspaces", "工作区")
}

fn valid_workspace_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 96
        && id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
}

fn workspace_slug(name: &str) -> String {
    let mut slug = String::new();
    let mut separator = false;
    for character in name.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            separator = false;
        } else if (character == '-' || character == '_' || character.is_whitespace())
            && !slug.is_empty()
            && !separator
        {
            slug.push('-');
            separator = true;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        format!("workspace-{}", chrono_like_timestamp())
    } else {
        slug
    }
}

fn chrono_like_timestamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
}

fn workspace_from_file(
    file: WorkspaceDiskFile,
    file_path: String,
    source: &str,
    built_in: bool,
) -> Result<StoredWorkspace, String> {
    if file.schema_version != 1 {
        return Err(format!(
            "不支持工作区版本 {}：{source}",
            file.schema_version
        ));
    }
    if !valid_workspace_id(&file.id) || file.name.trim().is_empty() || !file.layout.is_object() {
        return Err(format!("工作区信息无效：{source}"));
    }
    let initial_layout = file.initial_layout.unwrap_or_else(|| file.layout.clone());
    if !initial_layout.is_object() {
        return Err(format!("工作区初始布局无效：{source}"));
    }
    Ok(StoredWorkspace {
        id: file.id,
        name: file.name,
        file_path,
        updated_at: file.updated_at,
        built_in,
        layout: file.layout,
        initial_layout,
    })
}

fn built_in_workspace() -> StoredWorkspace {
    let layout = serde_json::json!({
        "panelDocks": { "color": "left", "palette": "left", "layers": "bottom", "freeTileInstances": "bottom", "history": "right", "preview": "right", "tileset": "right", "brushes": "right" },
        "panelVisibility": { "color": true, "palette": true, "layers": true, "freeTileInstances": false, "history": true, "preview": true, "tileset": false, "brushes": false },
        "inspectorWidth": 300,
        "leftDockWidth": 280,
        "bottomDockHeight": 220,
        "inspectorWidthRatio": 0.20833333333333334,
        "leftDockWidthRatio": 0.19444444444444445,
        "bottomDockHeightRatio": 0.275,
        "toolRailSide": "right",
        "previewOpen": true,
        "inspectorLayout": "{\"order\":[\"palette\",\"color\",\"layers\",\"freeTileInstances\",\"history\",\"preview\",\"tileset\",\"brushes\"],\"verticalWeights\":{\"color\":330,\"palette\":620,\"layers\":560,\"freeTileInstances\":180,\"history\":220,\"preview\":220,\"tileset\":280,\"brushes\":240},\"bottomWeights\":{\"color\":280,\"palette\":280,\"layers\":720,\"freeTileInstances\":300,\"history\":320,\"preview\":280,\"tileset\":360,\"brushes\":320}}",
        "colorSquareDock": "left",
        "colorSquareAnchor": "end",
        "floatingPanels": { "color": null, "palette": null, "layers": null, "freeTileInstances": null, "history": null, "preview": null, "tileset": null, "brushes": null },
        "mainWindow": null
    });
    StoredWorkspace {
        id: "builtin-default".to_string(),
        name: "默认工作区".to_string(),
        file_path: String::new(),
        updated_at: String::new(),
        built_in: true,
        layout: layout.clone(),
        initial_layout: layout,
    }
}

fn looks_like_legacy_builtin_layout(layout: &serde_json::Value) -> bool {
    let Some(object) = layout.as_object() else {
        return false;
    };
    let Some(docks) = object
        .get("panelDocks")
        .and_then(serde_json::Value::as_object)
    else {
        return false;
    };
    let expected_docks = [
        ("color", "left"),
        ("palette", "left"),
        ("layers", "bottom"),
        ("preview", "bottom"),
    ];
    if !expected_docks
        .iter()
        .all(|(key, value)| docks.get(*key).and_then(serde_json::Value::as_str) == Some(*value))
    {
        return false;
    }
    if object
        .get("toolRailSide")
        .and_then(serde_json::Value::as_str)
        .map(|side| side != "right")
        .unwrap_or(false)
    {
        return false;
    }
    if object
        .get("previewOpen")
        .and_then(serde_json::Value::as_bool)
        .map(|open| !open)
        .unwrap_or(false)
    {
        return false;
    }
    for (key, expected) in [
        ("inspectorWidth", 300.0),
        ("leftDockWidth", 280.0),
        ("bottomDockHeight", 220.0),
    ] {
        if object
            .get(key)
            .and_then(serde_json::Value::as_f64)
            .map(|value| (value - expected).abs() > f64::EPSILON)
            .unwrap_or(false)
        {
            return false;
        }
    }
    let brushes_were_visible = object
        .get("panelVisibility")
        .and_then(serde_json::Value::as_object)
        .and_then(|visibility| visibility.get("brushes"))
        .map(|value| value.as_bool().unwrap_or(true))
        .unwrap_or(true);
    if !brushes_were_visible {
        return false;
    }
    let Some(inspector_layout) = object
        .get("inspectorLayout")
        .and_then(serde_json::Value::as_str)
    else {
        return true;
    };
    let Ok(inspector_layout) = serde_json::from_str::<serde_json::Value>(inspector_layout) else {
        return true;
    };
    let Some(order) = inspector_layout
        .get("order")
        .and_then(serde_json::Value::as_array)
    else {
        return true;
    };
    let old_rust_order = ["palette", "color", "layers", "preview"];
    let old_frontend_order = [
        "palette",
        "color",
        "layers",
        "freeTileInstances",
        "history",
        "brushes",
        "tileset",
        "preview",
    ];
    [old_rust_order.as_slice(), old_frontend_order.as_slice()]
        .iter()
        .any(|expected| {
            order.len() == expected.len()
                && order
                    .iter()
                    .zip(expected.iter())
                    .all(|(actual, expected)| actual.as_str() == Some(*expected))
        })
}

fn read_workspace(path: &Path) -> Result<StoredWorkspace, String> {
    let bytes =
        fs::read(path).map_err(|error| format!("无法读取工作区 {}：{error}", path.display()))?;
    let file: WorkspaceDiskFile = serde_json::from_slice(&bytes)
        .map_err(|error| format!("工作区文件损坏 {}：{error}", path.display()))?;
    workspace_from_file(
        file,
        path.to_string_lossy().to_string(),
        &path.display().to_string(),
        false,
    )
}

fn default_workspace_path(directory: &Path) -> PathBuf {
    directory.join("default.workspace.json")
}

fn read_default_workspace(path: &Path) -> Result<StoredWorkspace, String> {
    let bytes = fs::read(path)
        .map_err(|error| format!("无法读取默认工作区 {}：{error}", path.display()))?;
    let file: WorkspaceDiskFile = serde_json::from_slice(&bytes)
        .map_err(|error| format!("默认工作区文件损坏 {}：{error}", path.display()))?;
    let mut workspace = workspace_from_file(
        file,
        path.to_string_lossy().to_string(),
        &path.display().to_string(),
        true,
    )?;
    if workspace.id != "builtin-default" {
        return Err("默认工作区 ID 无效。".to_string());
    }
    // The built-in workspace is editable, but keeps its stable user-facing name.
    workspace.name = "默认工作区".to_string();
    // Migrate an untouched copy of the previous built-in defaults. User-edited
    // layouts remain intact, including an intentional bottom-docked preview.
    let legacy_layout = looks_like_legacy_builtin_layout(&workspace.layout);
    let legacy_baseline = looks_like_legacy_builtin_layout(&workspace.initial_layout);
    if legacy_layout && (workspace.layout == workspace.initial_layout || legacy_baseline) {
        workspace.layout = built_in_workspace().layout;
    }
    // Preserve the current layout while keeping Reset aligned with this build.
    workspace.initial_layout = built_in_workspace().initial_layout;
    Ok(workspace)
}

#[tauri::command]
pub(crate) fn list_workspaces() -> Result<WorkspaceListing, String> {
    let directory = workspace_dir()?;
    let default_path = default_workspace_path(&directory);
    let default_workspace = if default_path.is_file() {
        read_default_workspace(&default_path).unwrap_or_else(|_| built_in_workspace())
    } else {
        built_in_workspace()
    };
    let mut workspaces = vec![default_workspace];
    for entry in
        fs::read_dir(&directory).map_err(|error| format!("无法读取工作区文件夹：{error}"))?
    {
        let path = entry
            .map_err(|error| format!("无法读取工作区文件：{error}"))?
            .path();
        let is_workspace = path
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value.ends_with(".workspace.json"))
            .unwrap_or(false);
        if path.is_file() && is_workspace && path != default_path {
            if let Ok(workspace) = read_workspace(&path) {
                workspaces.push(workspace);
            }
        }
    }
    workspaces.sort_by(|left, right| {
        right
            .built_in
            .cmp(&left.built_in)
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(WorkspaceListing {
        directory_path: directory.to_string_lossy().to_string(),
        workspaces,
    })
}

#[tauri::command]
pub(crate) fn save_workspace(
    id: Option<String>,
    name: String,
    layout: serde_json::Value,
) -> Result<StoredWorkspace, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 96 {
        return Err("工作区名称必须为 1 到 96 个字符。".to_string());
    }
    if !layout.is_object() {
        return Err("工作区布局无效。".to_string());
    }
    let layout_size = serde_json::to_vec(&layout)
        .map_err(|error| error.to_string())?
        .len();
    if layout_size > 256 * 1024 {
        return Err("工作区布局过大。".to_string());
    }
    let directory = workspace_dir()?;
    let workspace_id = match id {
        Some(value) if valid_workspace_id(&value) => value,
        Some(_) => return Err("工作区 ID 无效。".to_string()),
        None => {
            let base = workspace_slug(name);
            let mut candidate = base.clone();
            let mut suffix = 2;
            while directory
                .join(format!("{candidate}.workspace.json"))
                .exists()
            {
                candidate = format!("{base}-{suffix}");
                suffix += 1;
            }
            candidate
        }
    };
    let built_in = workspace_id == "builtin-default";
    let path = if built_in {
        default_workspace_path(&directory)
    } else {
        directory.join(format!("{workspace_id}.workspace.json"))
    };
    let initial_layout = if built_in {
        built_in_workspace().initial_layout
    } else if path.is_file() {
        let existing: WorkspaceDiskFile =
            serde_json::from_slice(&fs::read(&path).map_err(|error| error.to_string())?)
                .map_err(|error| format!("无法读取现有工作区 {}：{error}", path.display()))?;
        existing.initial_layout.unwrap_or(existing.layout)
    } else {
        layout.clone()
    };
    let file = WorkspaceDiskFile {
        schema_version: 1,
        id: workspace_id,
        name: name.to_string(),
        updated_at: chrono_like_timestamp().to_string(),
        layout,
        initial_layout: Some(initial_layout),
    };
    let encoded = serde_json::to_vec_pretty(&file).map_err(|error| error.to_string())?;
    atomic_write(&path, &encoded)?;
    if built_in {
        read_default_workspace(&path)
    } else {
        read_workspace(&path)
    }
}

#[tauri::command]
pub(crate) fn delete_workspace(id: String) -> Result<(), String> {
    if !valid_workspace_id(&id) || id == "builtin-default" {
        return Err("工作区 ID 无效。".to_string());
    }
    let path = workspace_dir()?.join(format!("{id}.workspace.json"));
    if !path.is_file() {
        return Err("工作区文件不存在。".to_string());
    }
    fs::remove_file(path).map_err(|error| format!("无法删除工作区：{error}"))
}

#[tauri::command]
pub(crate) fn open_workspace_folder() -> Result<(), String> {
    let directory = workspace_dir()?;
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer.exe");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(&directory)
        .spawn()
        .map_err(|error| format!("无法打开工作区文件夹：{error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn refreshes_built_in_reset_baseline_without_replacing_current_layout() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should follow the Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "moonsprite-default-workspace-{}-{suffix}.json",
            std::process::id()
        ));
        let legacy_layout = serde_json::json!({
            "panelDocks": { "color": "left", "palette": "left", "layers": "right", "preview": "right" },
            "toolRailSide": "left"
        });
        let file = WorkspaceDiskFile {
            schema_version: 1,
            id: "builtin-default".to_string(),
            name: "旧默认工作区".to_string(),
            updated_at: String::new(),
            layout: legacy_layout.clone(),
            initial_layout: Some(legacy_layout.clone()),
        };
        fs::write(
            &path,
            serde_json::to_vec(&file).expect("workspace should encode"),
        )
        .expect("temporary workspace should be writable");

        let result = read_default_workspace(&path);
        let _ = fs::remove_file(&path);
        let workspace = result.expect("default workspace should load");

        assert_eq!(workspace.layout, legacy_layout);
        assert_eq!(workspace.initial_layout["panelDocks"]["layers"], "bottom");
        assert_eq!(workspace.initial_layout["panelDocks"]["preview"], "right");
        assert_eq!(workspace.initial_layout["toolRailSide"], "right");
    }

    #[test]
    fn migrates_untouched_legacy_builtin_layout() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should follow the Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "moonsprite-legacy-default-workspace-{}-{suffix}.json",
            std::process::id()
        ));
        let legacy_layout = serde_json::json!({
            "panelDocks": { "color": "left", "palette": "left", "layers": "bottom", "preview": "bottom" },
            "panelVisibility": { "color": true, "palette": true, "layers": true, "preview": true, "brushes": true },
            "toolRailSide": "right",
            "inspectorLayout": "{\"order\":[\"palette\",\"color\",\"layers\",\"preview\"]}"
        });
        let file = WorkspaceDiskFile {
            schema_version: 1,
            id: "builtin-default".to_string(),
            name: "默认工作区".to_string(),
            updated_at: String::new(),
            layout: legacy_layout.clone(),
            initial_layout: Some(legacy_layout),
        };
        fs::write(
            &path,
            serde_json::to_vec(&file).expect("workspace should encode"),
        )
        .expect("temporary workspace should be writable");

        let result = read_default_workspace(&path);
        let _ = fs::remove_file(&path);
        let workspace = result.expect("legacy default workspace should load");

        assert_eq!(workspace.layout["panelDocks"]["preview"], "right");
        assert_eq!(workspace.layout["panelVisibility"]["brushes"], false);
        assert_eq!(workspace.initial_layout["panelDocks"]["preview"], "right");
    }
}
