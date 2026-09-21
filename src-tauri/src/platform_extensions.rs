use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    ffi::OsStr,
    fs::{self, File, OpenOptions},
    io::{self, Read, Seek},
    path::{Component, Path, PathBuf},
};
use zip::ZipArchive;

use crate::{platform_paths::ensure_executable_subdirectory, platform_storage::atomic_write};

pub(crate) const EXTENSION_PACKAGE_EXTENSION: &str = "msext";
const EXTENSION_DIRECTORY_NAME: &str = "extensions";
const EXTENSION_STATE_FILE: &str = ".state.json";
const BUILTIN_PET_COMPANION_ID: &str = "moonsprite.pet.nailong";
const BUILTIN_PET_COMPANION_PACKAGE: &[u8] =
    include_bytes!("../resources/bundled-extensions/pet-companion.msext");
const MAX_PACKAGE_BYTES: u64 = 50 * 1024 * 1024;
const MAX_PACKAGE_FILES: usize = 256;
const MAX_UNPACKED_BYTES: u64 = 256 * 1024 * 1024;
const MAX_MANIFEST_BYTES: usize = 256 * 1024;
const MAX_SETTINGS_ENTRY_BYTES: usize = 512 * 1024;
const MAX_RUNTIME_ENTRY_BYTES: usize = 1024 * 1024;
const MAX_RUNTIME_RESOURCE_BYTES: usize = 16 * 1024 * 1024;
const MAX_RUNTIME_RESOURCES: usize = 64;
const MAX_ID_BYTES: usize = 80;
const MAX_NAME_BYTES: usize = 160;
const MAX_VERSION_BYTES: usize = 80;
const MAX_DESCRIPTION_BYTES: usize = 4 * 1024;
const MAX_AUTHOR_BYTES: usize = 160;
const MAX_API_VERSION_BYTES: usize = 80;
const MAX_PACKAGE_PATH_BYTES: usize = 240;
const MAX_EXTENSION_COMMANDS: usize = 64;
const MAX_EXTENSION_PANELS: usize = 16;
const MAX_EXTENSION_MENU_ITEMS: usize = 32;
const MAX_EXTENSION_TOP_MENUS: usize = 16;
const MAX_EXTENSION_SETTINGS_CONTROLS: usize = 64;
const MAX_EXTENSION_SETTINGS_OPTIONS: usize = 64;
const MAX_PANEL_COMMANDS: usize = 32;
const MAX_MENU_COMMANDS: usize = 32;
const EXTENSION_RUNTIME_API_VERSION: &str = "1.0.0";
const EXTENSION_RUNTIME_PERMISSIONS: &[&str] = &[
    "runtime",
    "commands",
    "menus",
    "ui",
    "windows",
    "workspace.read",
    "workspace.write",
    "document.read",
    "document.write",
    "events",
    "storage",
    "resources",
    "tools",
    "io",
    "clipboard",
    "notifications",
    "network",
    "diagnostics",
];

fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredExtension {
    id: String,
    name: String,
    #[serde(default)]
    translations: BTreeMap<String, BTreeMap<String, String>>,
    version: String,
    description: String,
    author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    api_version: Option<String>,
    has_lua_entry: bool,
    has_settings: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    settings_ui: Option<ExtensionSettingsUiManifest>,
    #[serde(skip_serializing_if = "Option::is_none")]
    runtime: Option<StoredExtensionRuntime>,
    commands: Vec<StoredExtensionCommand>,
    panels: Vec<StoredExtensionPanel>,
    menu_items: Vec<StoredExtensionMenuItem>,
    top_menus: Vec<StoredExtensionTopMenu>,
    enabled: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredExtensionCommand {
    id: String,
    name: String,
    description: String,
    handler: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    runtime_event: Option<String>,
    #[serde(skip_serializing_if = "is_false")]
    opens_settings: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredExtensionRuntime {
    permissions: Vec<String>,
    resources: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredExtensionPanel {
    id: String,
    name: String,
    description: String,
    default_visible: bool,
    commands: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredExtensionMenuItem {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    menu: String,
    position: String,
    commands: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredExtensionTopMenu {
    id: String,
    name: String,
    description: String,
    position: String,
    commands: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExtensionListing {
    extensions: Vec<StoredExtension>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExtensionPackagePreview {
    name: String,
    #[serde(default)]
    translations: BTreeMap<String, BTreeMap<String, String>>,
    version: String,
    description: String,
    author: String,
    id: String,
    command_count: usize,
    panel_count: usize,
    menu_count: usize,
}

/// A validated Lua entry point belonging to an enabled extension.
///
/// The path is only produced after the package directory and entry have been
/// checked. Renderer code never uses this path to resolve or execute a script;
/// execution starts from the opaque extension id.
#[derive(Clone, Debug)]
pub(crate) struct ExtensionLuaEntry {
    pub(crate) extension_id: String,
    pub(crate) extension_name: String,
    pub(crate) command_id: Option<String>,
    pub(crate) command_name: Option<String>,
    pub(crate) command_description: Option<String>,
    pub(crate) entry_name: String,
    pub(crate) path: PathBuf,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtensionCommandManifest {
    id: String,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    entry: Option<String>,
    #[serde(default)]
    runtime_event: Option<String>,
    #[serde(default)]
    opens_settings: bool,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtensionPanelManifest {
    id: String,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    default_visible: bool,
    #[serde(default)]
    commands: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtensionMenuItemManifest {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    menu: String,
    #[serde(default = "default_menu_item_position")]
    position: String,
    #[serde(default)]
    commands: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtensionRuntimeManifest {
    entry: String,
    #[serde(default)]
    permissions: Vec<String>,
    #[serde(default)]
    resources: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtensionSettingsUiManifest {
    storage_key: String,
    #[serde(default)]
    controls: Vec<ExtensionSettingsControlManifest>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtensionSettingsControlManifest {
    id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    visible_when: Option<std::collections::BTreeMap<String, bool>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    full_width: Option<bool>,
    #[serde(rename = "type")]
    kind: String,
    label: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    default_value: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    min: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    max: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    step: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    suffix: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    placeholder: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    max_length: Option<u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    options: Vec<ExtensionSettingsOptionManifest>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    command_id: Option<String>,
    #[serde(default = "default_settings_button_variant")]
    variant: String,
    #[serde(default)]
    close_on_run: bool,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtensionSettingsOptionManifest {
    value: String,
    label: String,
    #[serde(default)]
    description: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtensionTopMenuManifest {
    id: String,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default = "default_top_menu_position")]
    position: String,
    #[serde(default)]
    commands: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExtensionManifest {
    schema_version: u32,
    id: String,
    name: String,
    #[serde(default)]
    translations: BTreeMap<String, BTreeMap<String, String>>,
    version: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    author: String,
    #[serde(default)]
    api_version: Option<String>,
    #[serde(default)]
    entry: Option<String>,
    #[serde(default)]
    settings_entry: Option<String>,
    #[serde(default)]
    settings_ui: Option<ExtensionSettingsUiManifest>,
    #[serde(default)]
    runtime: Option<ExtensionRuntimeManifest>,
    #[serde(default)]
    commands: Vec<ExtensionCommandManifest>,
    #[serde(default)]
    panels: Vec<ExtensionPanelManifest>,
    #[serde(default)]
    menu_items: Vec<ExtensionMenuItemManifest>,
    #[serde(default)]
    top_menus: Vec<ExtensionTopMenuManifest>,
}

#[derive(Debug, Default, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtensionState {
    #[serde(default)]
    enabled: BTreeMap<String, bool>,
    #[serde(default)]
    seeded_builtin: HashSet<String>,
    #[serde(default)]
    builtin_revisions: BTreeMap<String, BTreeMap<String, (u32, u64)>>,
}

#[derive(Debug, Clone)]
struct PackageEntry {
    name: String,
    is_dir: bool,
    size: u64,
}

#[derive(Debug)]
struct PackageInspection {
    manifest: ExtensionManifest,
    entries: Vec<PackageEntry>,
}

fn extension_directory() -> Result<PathBuf, String> {
    let directory = ensure_executable_subdirectory(EXTENSION_DIRECTORY_NAME, "扩展")?;
    let metadata =
        fs::symlink_metadata(&directory).map_err(|error| format!("无法检查扩展文件夹：{error}"))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("扩展文件夹不能是符号链接。".to_string());
    }
    Ok(directory)
}

/// Installs or updates bundled extensions through the ordinary atomic installer.
///
/// The seed state is distinct from the enabled state so the companion behaves
/// can remain disabled or uninstalled across application updates. Content revisions
/// detect same-version bundle changes and migrate older seed-only state.
pub(crate) fn ensure_builtin_extensions() -> Result<(), String> {
    let directory = extension_directory()?;
    ensure_builtin_extension_at(
        &directory,
        BUILTIN_PET_COMPANION_ID,
        BUILTIN_PET_COMPANION_PACKAGE,
    )
}

fn ensure_builtin_extension_at(
    directory: &Path,
    extension_id: &str,
    package: &[u8],
) -> Result<(), String> {
    let mut state = read_state(directory)?;
    let installed_path = installed_extension_path(directory, extension_id)?;
    let installed = match fs::symlink_metadata(&installed_path) {
        Ok(_) => {
            ensure_safe_directory(&installed_path)?;
            true
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => false,
        Err(error) => return Err(format!("无法访问内置扩展：{error}")),
    };
    // A previously seeded but absent extension was uninstalled by the user.
    if state.seeded_builtin.contains(extension_id) && !installed {
        return Ok(());
    }

    let inspection = inspect_archive(io::Cursor::new(package))?;
    if inspection.manifest.id != extension_id {
        return Err("内置扩展包 ID 与预期不一致。".to_string());
    }
    // ZIP CRC and uncompressed size are a content revision, not an authenticity check.
    // Names are sorted so archive ordering and compression changes do not force updates.
    let mut archive = ZipArchive::new(io::Cursor::new(package))
        .map_err(|error| format!("无法读取内置扩展修订信息：{error}"))?;
    let mut revision = BTreeMap::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index)
            .map_err(|error| format!("无法读取内置扩展修订项：{error}"))?;
        if !entry.is_dir() {
            revision.insert(entry.name().to_string(), (entry.crc32(), entry.size()));
        }
    }
    if installed {
        let manifest = manifest_from_directory(&installed_path)?;
        if manifest.id != extension_id {
            return Err("已安装扩展的 ID 与内置扩展不一致。".to_string());
        }
        if state.builtin_revisions.get(extension_id) == Some(&revision) {
            return Ok(());
        }
    }

    let package_path =
        directory.join(format!(".bundled-{extension_id}-{}.msext", unique_suffix()));
    atomic_write(&package_path, package)?;
    let install_result = install_extension_at(&package_path, directory);
    let cleanup_result = fs::remove_file(&package_path)
        .map_err(|error| format!("无法清理内置扩展安装包：{error}"));
    match (install_result, cleanup_result) {
        (Err(install), Err(cleanup)) => return Err(format!("{install}；{cleanup}")),
        (Err(error), _) | (_, Err(error)) => return Err(error),
        (Ok(_), Ok(())) => {}
    }

    state = read_state(directory)?;
    state.seeded_builtin.insert(extension_id.to_string());
    state.builtin_revisions.insert(extension_id.to_string(), revision);
    write_state(directory, &state)
}

fn extension_state_path(directory: &Path) -> PathBuf {
    directory.join(EXTENSION_STATE_FILE)
}

fn unique_suffix() -> String {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    format!("{}-{timestamp}", std::process::id())
}

pub(crate) fn is_extension_package_path(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| extension.eq_ignore_ascii_case(EXTENSION_PACKAGE_EXTENSION))
}

fn valid_extension_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_ID_BYTES
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
        && !value.starts_with('.')
        && !value.ends_with('.')
        && !value.contains("..")
}

fn valid_text(value: &str, max_bytes: usize, required: bool) -> bool {
    (!required || !value.trim().is_empty())
        && value.len() <= max_bytes
        && !value.chars().any(char::is_control)
}

fn default_menu_item_position() -> String {
    "end".to_string()
}

fn default_top_menu_position() -> String {
    "end".to_string()
}

fn default_settings_button_variant() -> String {
    "secondary".to_string()
}

fn validate_settings_entry_path(path: &str) -> Result<Vec<String>, String> {
    let parts = validate_package_relative_path(path, "扩展设置页面")?;
    if Path::new(path)
        .extension()
        .and_then(OsStr::to_str)
        .is_none_or(|extension| !matches!(extension.to_ascii_lowercase().as_str(), "html" | "htm"))
    {
        return Err("扩展设置页面必须是 HTML 文件。".to_string());
    }
    Ok(parts)
}

fn validate_runtime_entry_path(path: &str) -> Result<Vec<String>, String> {
    let parts = validate_package_relative_path(path, "扩展运行时页面")?;
    if Path::new(path)
        .extension()
        .and_then(OsStr::to_str)
        .is_none_or(|extension| !matches!(extension.to_ascii_lowercase().as_str(), "html" | "htm"))
    {
        return Err("扩展运行时页面必须是 HTML 文件。".to_string());
    }
    Ok(parts)
}

fn valid_builtin_menu(value: &str) -> bool {
    matches!(
        value,
        "file" | "edit" | "select" | "canvas" | "layer" | "window" | "help"
    )
}

fn valid_menu_item_position(value: &str) -> bool {
    matches!(value, "start" | "end")
}

fn valid_top_menu_position(value: &str) -> bool {
    if valid_menu_item_position(value) {
        return true;
    }
    value
        .split_once(':')
        .is_some_and(|(side, menu)| matches!(side, "before" | "after") && valid_builtin_menu(menu))
}

fn validate_lua_entry_path(entry: &str, label: &str) -> Result<(), String> {
    validate_package_relative_path(entry, label)?;
    if entry.eq_ignore_ascii_case("manifest.json") {
        return Err(format!("{label}不能指向 manifest.json。"));
    }
    if Path::new(entry)
        .extension()
        .and_then(OsStr::to_str)
        .is_none_or(|extension| !extension.eq_ignore_ascii_case("lua"))
    {
        return Err(format!("{label}必须是 Lua 文件。"));
    }
    Ok(())
}

fn validate_settings_ui(settings: &ExtensionSettingsUiManifest) -> Result<(), String> {
    if !valid_extension_id(&settings.storage_key) {
        return Err("扩展组件设置的 storageKey 无效。".to_string());
    }
    if settings.controls.is_empty() || settings.controls.len() > MAX_EXTENSION_SETTINGS_CONTROLS {
        return Err(format!(
            "扩展组件设置必须包含 1 至 {MAX_EXTENSION_SETTINGS_CONTROLS} 个控件。"
        ));
    }
    let mut ids = HashSet::new();
    for control in &settings.controls {
        if let Some(conditions) = &control.visible_when {
            if conditions.len() > MAX_EXTENSION_SETTINGS_CONTROLS
                || conditions.keys().any(|id| {
                    id == &control.id
                        || !settings
                            .controls
                            .iter()
                            .any(|candidate| &candidate.id == id && candidate.kind == "checkbox")
                })
            {
                return Err("扩展设置显示条件必须引用其他复选框。".to_string());
            }
        }
        if control.full_width.is_some() && control.kind != "button" {
            return Err("整行布局仅用于扩展设置按钮。".to_string());
        }
        if !valid_extension_id(&control.id) || !ids.insert(control.id.to_ascii_lowercase()) {
            return Err("扩展设置控件 ID 无效或重复。".to_string());
        }
        if !valid_text(&control.label, MAX_NAME_BYTES, true)
            || !valid_text(&control.description, MAX_DESCRIPTION_BYTES, false)
        {
            return Err("扩展设置控件文案无效或过长。".to_string());
        }
        for value in [&control.suffix, &control.placeholder]
            .into_iter()
            .flatten()
        {
            if !valid_text(value, MAX_NAME_BYTES, false) {
                return Err("扩展设置控件辅助文案无效或过长。".to_string());
            }
        }
        match control.kind.as_str() {
            "checkbox" => {
                if !control.default_value.is_boolean() {
                    return Err(format!(
                        "复选框“{}”必须提供布尔 defaultValue。",
                        control.label
                    ));
                }
            }
            "number" => {
                let Some(default_value) = control.default_value.as_f64() else {
                    return Err(format!(
                        "数值控件“{}”必须提供数值 defaultValue。",
                        control.label
                    ));
                };
                if control.min.is_some_and(|value| !value.is_finite())
                    || control.max.is_some_and(|value| !value.is_finite())
                    || control
                        .step
                        .is_some_and(|value| !value.is_finite() || value <= 0.0)
                    || control
                        .min
                        .zip(control.max)
                        .is_some_and(|(min, max)| min > max)
                    || control.min.is_some_and(|min| default_value < min)
                    || control.max.is_some_and(|max| default_value > max)
                {
                    return Err(format!(
                        "数值控件“{}”的范围、步长或默认值无效。",
                        control.label
                    ));
                }
            }
            "text" => {
                let Some(default_value) = control.default_value.as_str() else {
                    return Err(format!(
                        "文本控件“{}”必须提供字符串 defaultValue。",
                        control.label
                    ));
                };
                let max_length = control.max_length.unwrap_or(1024);
                if max_length == 0
                    || max_length > 4096
                    || default_value.chars().count() > max_length as usize
                {
                    return Err(format!(
                        "文本控件“{}”的 maxLength 或默认值无效。",
                        control.label
                    ));
                }
            }
            "select" => {
                let Some(default_value) = control.default_value.as_str() else {
                    return Err(format!(
                        "选择控件“{}”必须提供字符串 defaultValue。",
                        control.label
                    ));
                };
                if control.options.is_empty()
                    || control.options.len() > MAX_EXTENSION_SETTINGS_OPTIONS
                {
                    return Err(format!("选择控件“{}”的选项数量无效。", control.label));
                }
                let mut values = HashSet::new();
                for option in &control.options {
                    if !valid_text(&option.value, MAX_NAME_BYTES, true)
                        || !valid_text(&option.label, MAX_NAME_BYTES, true)
                        || !valid_text(&option.description, MAX_DESCRIPTION_BYTES, false)
                        || !values.insert(option.value.to_ascii_lowercase())
                    {
                        return Err(format!("选择控件“{}”包含无效或重复选项。", control.label));
                    }
                }
                if !control
                    .options
                    .iter()
                    .any(|option| option.value == default_value)
                {
                    return Err(format!("选择控件“{}”的默认值不在选项中。", control.label));
                }
            }
            "button" => {
                if control
                    .command_id
                    .as_deref()
                    .is_none_or(|id| !valid_extension_id(id))
                    || !matches!(control.variant.as_str(), "primary" | "secondary" | "danger")
                {
                    return Err(format!("按钮“{}”的命令或样式无效。", control.label));
                }
            }
            _ => return Err(format!("扩展设置控件“{}”的类型不受支持。", control.label)),
        }
    }
    Ok(())
}

fn validate_manifest(manifest: &ExtensionManifest) -> Result<(), String> {
    if !matches!(manifest.schema_version, 1 | 2) {
        return Err("扩展清单版本不受支持。".to_string());
    }
    if !valid_extension_id(&manifest.id) {
        return Err("扩展 ID 无效，只能使用字母、数字、点、短横线和下划线。".to_string());
    }
    if manifest.translations.len() > 64 || manifest.translations.iter().any(|(locale, catalog)| {
        !valid_text(locale, 32, true) || catalog.len() > 512 || catalog.iter().any(|(key, value)| {
            !valid_text(key, MAX_DESCRIPTION_BYTES, true) || !valid_text(value, MAX_DESCRIPTION_BYTES, true)
        })
    }) {
        return Err("扩展翻译内容无效或超过限制。".to_string());
    }
    if !valid_text(&manifest.name, MAX_NAME_BYTES, true) {
        return Err("扩展名称无效或过长。".to_string());
    }
    if !valid_text(&manifest.version, MAX_VERSION_BYTES, true) {
        return Err("扩展版本无效或过长。".to_string());
    }
    if !valid_text(&manifest.description, MAX_DESCRIPTION_BYTES, false) {
        return Err("扩展描述过长或包含控制字符。".to_string());
    }
    if !valid_text(&manifest.author, MAX_AUTHOR_BYTES, false) {
        return Err("扩展作者信息过长或包含控制字符。".to_string());
    }
    if let Some(api_version) = &manifest.api_version {
        if !valid_text(api_version, MAX_API_VERSION_BYTES, true) {
            return Err("扩展 API 版本无效或过长。".to_string());
        }
    }
    if let Some(entry) = &manifest.entry {
        validate_lua_entry_path(entry, "扩展入口")?;
    }
    if let Some(settings_entry) = &manifest.settings_entry {
        validate_settings_entry_path(settings_entry)?;
    }
    if manifest.settings_entry.is_some() && manifest.settings_ui.is_some() {
        return Err("扩展不能同时声明 settingsEntry 和 settingsUi。".to_string());
    }
    if let Some(settings_ui) = &manifest.settings_ui {
        if manifest.schema_version != 2 {
            return Err("宿主组件设置仅支持 schemaVersion 2。".to_string());
        }
        validate_settings_ui(settings_ui)?;
    }
    if let Some(runtime) = &manifest.runtime {
        if manifest.schema_version != 2 {
            return Err("Extension Runtime 仅支持 schemaVersion 2。".to_string());
        }
        if manifest.api_version.as_deref() != Some(EXTENSION_RUNTIME_API_VERSION) {
            return Err(format!(
                "Extension Runtime 需要 apiVersion {EXTENSION_RUNTIME_API_VERSION}。"
            ));
        }
        validate_runtime_entry_path(&runtime.entry)?;
        let mut permissions = HashSet::new();
        for permission in &runtime.permissions {
            if !EXTENSION_RUNTIME_PERMISSIONS.contains(&permission.as_str()) {
                return Err(format!("扩展声明了未知权限“{permission}”。"));
            }
            if !permissions.insert(permission.to_ascii_lowercase()) {
                return Err(format!("扩展权限“{permission}”不能重复声明。"));
            }
        }
        if !permissions.contains("runtime") {
            return Err("Extension Runtime 必须声明 runtime 权限。".to_string());
        }
        if runtime.resources.len() > MAX_RUNTIME_RESOURCES {
            return Err(format!(
                "扩展运行时资源不能超过 {MAX_RUNTIME_RESOURCES} 个。"
            ));
        }
        let mut resource_ids = HashSet::new();
        for (resource_id, path) in &runtime.resources {
            if !valid_extension_id(resource_id)
                || !resource_ids.insert(resource_id.to_ascii_lowercase())
            {
                return Err("扩展运行时资源 ID 无效或重复。".to_string());
            }
            validate_package_relative_path(path, "扩展运行时资源")?;
            if path.eq_ignore_ascii_case("manifest.json") || path == &runtime.entry {
                return Err(format!("扩展运行时资源“{resource_id}”不能指向受保护入口。"));
            }
        }
    }
    if manifest.commands.len() > MAX_EXTENSION_COMMANDS {
        return Err(format!(
            "扩展命令数量不能超过 {MAX_EXTENSION_COMMANDS} 个。"
        ));
    }
    let mut command_ids = HashSet::new();
    let mut normalized_command_ids = HashSet::new();
    for command in &manifest.commands {
        if !valid_extension_id(&command.id) {
            return Err("扩展命令 ID 无效，只能使用字母、数字、点、短横线和下划线。".to_string());
        }
        if !valid_text(&command.name, MAX_NAME_BYTES, true) {
            return Err("扩展命令名称无效或过长。".to_string());
        }
        if !valid_text(&command.description, MAX_DESCRIPTION_BYTES, false) {
            return Err("扩展命令描述过长或包含控制字符。".to_string());
        }
        if !normalized_command_ids.insert(command.id.to_ascii_lowercase()) {
            return Err("扩展命令 ID 不能重复。".to_string());
        }
        command_ids.insert(command.id.clone());
        let handler_count = usize::from(command.entry.is_some())
            + usize::from(command.runtime_event.is_some())
            + usize::from(command.opens_settings);
        if handler_count != 1 {
            return Err(format!(
                "扩展命令“{}”必须且只能声明 entry、runtimeEvent 或 opensSettings 中的一种处理方式。",
                command.name
            ));
        }
        if let Some(entry) = &command.entry {
            validate_lua_entry_path(entry, "扩展命令入口")?;
        }
        if let Some(runtime_event) = &command.runtime_event {
            if manifest.runtime.is_none() {
                return Err(format!(
                    "扩展命令“{}”需要 Extension Runtime。",
                    command.name
                ));
            }
            if !manifest.runtime.as_ref().is_some_and(|runtime| {
                runtime
                    .permissions
                    .iter()
                    .any(|permission| permission == "commands")
            }) {
                return Err(format!("扩展命令“{}”需要 commands 权限。", command.name));
            }
            if !valid_extension_id(runtime_event) {
                return Err(format!("扩展命令“{}”的 runtimeEvent 无效。", command.name));
            }
        }
        if command.opens_settings
            && manifest.settings_entry.is_none()
            && manifest.settings_ui.is_none()
        {
            return Err(format!(
                "扩展命令“{}”需要 settingsEntry 或 settingsUi。",
                command.name
            ));
        }
    }
    if let Some(settings_ui) = &manifest.settings_ui {
        for control in &settings_ui.controls {
            if control.kind != "button" {
                continue;
            }
            let command_id = control.command_id.as_deref().unwrap_or_default();
            if !manifest
                .commands
                .iter()
                .any(|command| command.id == command_id && command.runtime_event.is_some())
            {
                return Err(format!(
                    "设置按钮“{}”必须引用本扩展的 Runtime 命令。",
                    control.label
                ));
            }
        }
    }
    if manifest.panels.len() > MAX_EXTENSION_PANELS {
        return Err(format!("扩展栏目数量不能超过 {MAX_EXTENSION_PANELS} 个。"));
    }
    let mut panel_ids = HashSet::new();
    for panel in &manifest.panels {
        if !valid_extension_id(&panel.id) {
            return Err("扩展栏目 ID 无效，只能使用字母、数字、点、短横线和下划线。".to_string());
        }
        if !valid_text(&panel.name, MAX_NAME_BYTES, true) {
            return Err("扩展栏目名称无效或过长。".to_string());
        }
        if !valid_text(&panel.description, MAX_DESCRIPTION_BYTES, false) {
            return Err("扩展栏目描述过长或包含控制字符。".to_string());
        }
        if !panel_ids.insert(panel.id.to_ascii_lowercase()) {
            return Err("扩展栏目 ID 不能重复。".to_string());
        }
        if panel.commands.len() > MAX_PANEL_COMMANDS {
            return Err(format!(
                "单个扩展栏目引用的命令不能超过 {MAX_PANEL_COMMANDS} 个。"
            ));
        }
        let mut panel_command_ids = HashSet::new();
        for command_id in &panel.commands {
            if !valid_extension_id(command_id) {
                return Err("扩展栏目引用了无效的命令 ID。".to_string());
            }
            if !command_ids.contains(command_id) {
                return Err(format!(
                    "扩展栏目“{}”引用了不存在的命令“{}”。",
                    panel.name, command_id
                ));
            }
            if !panel_command_ids.insert(command_id.to_ascii_lowercase()) {
                return Err(format!("扩展栏目“{}”不能重复引用同一命令。", panel.name));
            }
        }
    }
    if manifest.menu_items.len() > MAX_EXTENSION_MENU_ITEMS {
        return Err(format!(
            "扩展现有菜单贡献数量不能超过 {MAX_EXTENSION_MENU_ITEMS} 个。"
        ));
    }
    let mut menu_item_ids = HashSet::new();
    for menu_item in &manifest.menu_items {
        if !valid_extension_id(&menu_item.id) {
            return Err("扩展现有菜单贡献 ID 无效。".to_string());
        }
        if !menu_item_ids.insert(menu_item.id.to_ascii_lowercase()) {
            return Err("扩展现有菜单贡献 ID 不能重复。".to_string());
        }
        if menu_item
            .name
            .as_deref()
            .is_some_and(|name| !valid_text(name, MAX_NAME_BYTES, true))
        {
            return Err("扩展子菜单名称无效或过长。".to_string());
        }
        if menu_item
            .description
            .as_deref()
            .is_some_and(|description| !valid_text(description, MAX_DESCRIPTION_BYTES, false))
        {
            return Err("扩展子菜单描述过长或包含控制字符。".to_string());
        }
        if !valid_builtin_menu(&menu_item.menu) {
            return Err("扩展引用了不存在的内置菜单。".to_string());
        }
        if !valid_menu_item_position(&menu_item.position) {
            return Err("扩展现有菜单贡献位置只能是 start 或 end。".to_string());
        }
        if menu_item.commands.is_empty() || menu_item.commands.len() > MAX_MENU_COMMANDS {
            return Err(format!(
                "单个现有菜单贡献必须引用 1 至 {MAX_MENU_COMMANDS} 个命令。"
            ));
        }
        let mut referenced_commands = HashSet::new();
        for command_id in &menu_item.commands {
            if !valid_extension_id(command_id) || !command_ids.contains(command_id) {
                return Err(format!(
                    "现有菜单贡献“{}”引用了不存在的命令“{}”。",
                    menu_item.id, command_id
                ));
            }
            if !referenced_commands.insert(command_id.to_ascii_lowercase()) {
                return Err(format!(
                    "现有菜单贡献“{}”不能重复引用同一命令。",
                    menu_item.id
                ));
            }
        }
    }
    if manifest.top_menus.len() > MAX_EXTENSION_TOP_MENUS {
        return Err(format!(
            "扩展顶层菜单数量不能超过 {MAX_EXTENSION_TOP_MENUS} 个。"
        ));
    }
    let mut top_menu_ids = HashSet::new();
    for top_menu in &manifest.top_menus {
        if !valid_extension_id(&top_menu.id) {
            return Err("扩展顶层菜单 ID 无效。".to_string());
        }
        if !top_menu_ids.insert(top_menu.id.to_ascii_lowercase()) {
            return Err("扩展顶层菜单 ID 不能重复。".to_string());
        }
        if !valid_text(&top_menu.name, MAX_NAME_BYTES, true) {
            return Err("扩展顶层菜单名称无效或过长。".to_string());
        }
        if !valid_text(&top_menu.description, MAX_DESCRIPTION_BYTES, false) {
            return Err("扩展顶层菜单描述过长或包含控制字符。".to_string());
        }
        if !valid_top_menu_position(&top_menu.position) {
            return Err("扩展顶层菜单位置无效。".to_string());
        }
        if top_menu.commands.is_empty() || top_menu.commands.len() > MAX_MENU_COMMANDS {
            return Err(format!(
                "单个顶层菜单必须引用 1 至 {MAX_MENU_COMMANDS} 个命令。"
            ));
        }
        let mut referenced_commands = HashSet::new();
        for command_id in &top_menu.commands {
            if !valid_extension_id(command_id) || !command_ids.contains(command_id) {
                return Err(format!(
                    "顶层菜单“{}”引用了不存在的命令“{}”。",
                    top_menu.name, command_id
                ));
            }
            if !referenced_commands.insert(command_id.to_ascii_lowercase()) {
                return Err(format!("顶层菜单“{}”不能重复引用同一命令。", top_menu.name));
            }
        }
    }
    Ok(())
}

fn validate_package_component(component: &str) -> Result<(), String> {
    if component.is_empty()
        || component == "."
        || component == ".."
        || component.ends_with('.')
        || component.ends_with(' ')
        || component.chars().any(|character| {
            character.is_control() || matches!(character, ':' | '*' | '?' | '"' | '<' | '>' | '|')
        })
    {
        return Err("扩展包包含无效的文件名。".to_string());
    }
    let upper = component.trim_end_matches(['.', ' ']).to_ascii_uppercase();
    let reserved_stem = upper.split('.').next().unwrap_or(&upper);
    if matches!(
        reserved_stem,
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    ) {
        return Err("扩展包包含 Windows 保留文件名。".to_string());
    }
    Ok(())
}

fn validate_package_relative_path(value: &str, label: &str) -> Result<Vec<String>, String> {
    if value.is_empty()
        || value.len() > MAX_PACKAGE_PATH_BYTES
        || value.contains('\\')
        || value.starts_with('/')
        || value.starts_with('~')
        || Path::new(value).is_absolute()
        || Path::new(value)
            .components()
            .any(|component| matches!(component, Component::Prefix(_) | Component::RootDir))
    {
        return Err(format!("{label}路径无效。"));
    }
    let parts = value.split('/').map(str::to_string).collect::<Vec<_>>();
    if parts
        .iter()
        .any(|part| validate_package_component(part).is_err())
    {
        return Err(format!("{label}路径无效。"));
    }
    Ok(parts)
}

fn package_entry_parts(name: &str, is_dir: bool) -> Result<Vec<String>, String> {
    if name.is_empty() || name.contains('\\') || name.contains('\0') {
        return Err("扩展包包含无效的路径。".to_string());
    }
    let trimmed = if is_dir {
        name.strip_suffix('/').unwrap_or(name)
    } else {
        name
    };
    validate_package_relative_path(trimmed, "扩展包")
}

fn read_manifest_bytes<R: Read>(source: R) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    source
        .take((MAX_MANIFEST_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("无法读取扩展清单：{error}"))?;
    if bytes.len() > MAX_MANIFEST_BYTES {
        return Err("扩展清单不能超过 256 KiB。".to_string());
    }
    Ok(bytes)
}

fn inspect_archive<R: Read + Seek>(reader: R) -> Result<PackageInspection, String> {
    let mut archive =
        ZipArchive::new(reader).map_err(|error| format!("扩展包不是有效 ZIP：{error}"))?;
    if archive.len() == 0 {
        return Err("扩展包为空。".to_string());
    }
    if archive.len() > MAX_PACKAGE_FILES {
        return Err(format!("扩展包文件数量不能超过 {MAX_PACKAGE_FILES} 个。"));
    }

    let mut entries = Vec::with_capacity(archive.len());
    let mut seen = HashSet::new();
    let mut total_size = 0_u64;
    let mut manifest_bytes = None;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("无法读取扩展包条目：{error}"))?;
        let name = file.name().to_string();
        let is_dir = file.is_dir() || name.ends_with('/');
        let parts = package_entry_parts(&name, is_dir)?;
        let normalized_name = parts.join("/");
        let key = normalized_name.to_ascii_lowercase();
        if !seen.insert(key) {
            return Err("扩展包包含重复的文件路径。".to_string());
        }
        if file
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("扩展包不允许包含符号链接。".to_string());
        }
        let size = if is_dir { 0 } else { file.size() };
        total_size = total_size
            .checked_add(size)
            .ok_or_else(|| "扩展包解压大小无效。".to_string())?;
        if total_size > MAX_UNPACKED_BYTES {
            return Err("扩展包解压后的总大小不能超过 256 MiB。".to_string());
        }
        if normalized_name == "manifest.json" {
            if is_dir {
                return Err("manifest.json 必须是文件。".to_string());
            }
            manifest_bytes = Some(read_manifest_bytes(&mut file)?);
        }
        entries.push(PackageEntry {
            name: normalized_name,
            is_dir,
            size,
        });
    }

    let manifest_bytes =
        manifest_bytes.ok_or_else(|| "扩展包缺少根目录 manifest.json。".to_string())?;
    let manifest = serde_json::from_slice::<ExtensionManifest>(&manifest_bytes)
        .map_err(|error| format!("扩展清单无效：{error}"))?;
    validate_manifest(&manifest)?;
    if let Some(entry) = &manifest.entry {
        if !entries
            .iter()
            .any(|candidate| !candidate.is_dir && candidate.name == entry.as_str())
        {
            return Err("扩展清单指定的入口文件不存在。".to_string());
        }
    }
    if let Some(settings_entry) = &manifest.settings_entry {
        if !entries
            .iter()
            .any(|candidate| !candidate.is_dir && candidate.name == settings_entry.as_str())
        {
            return Err("扩展清单指定的设置页面不存在。".to_string());
        }
    }
    if let Some(runtime) = &manifest.runtime {
        if !entries
            .iter()
            .any(|candidate| !candidate.is_dir && candidate.name == runtime.entry)
        {
            return Err("扩展清单指定的运行时页面不存在。".to_string());
        }
        for (resource_id, path) in &runtime.resources {
            let Some(entry) = entries
                .iter()
                .find(|candidate| !candidate.is_dir && candidate.name == path.as_str())
            else {
                return Err(format!("扩展运行时资源“{resource_id}”不存在。"));
            };
            if entry.size > MAX_RUNTIME_RESOURCE_BYTES as u64 {
                return Err(format!("扩展运行时资源“{resource_id}”超过大小限制。"));
            }
        }
    }
    for command in &manifest.commands {
        if let Some(entry) = &command.entry {
            if !entries
                .iter()
                .any(|candidate| !candidate.is_dir && candidate.name == entry.as_str())
            {
                return Err(format!("扩展命令“{}”指定的入口文件不存在。", command.name));
            }
        }
    }
    Ok(PackageInspection { manifest, entries })
}

fn extract_archive(
    package_path: &Path,
    destination: &Path,
    inspection: &PackageInspection,
) -> Result<(), String> {
    let file = File::open(package_path).map_err(|error| format!("无法打开扩展包：{error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("扩展包不是有效 ZIP：{error}"))?;
    let expected = inspection
        .entries
        .iter()
        .map(|entry| (entry.name.as_str(), (entry.is_dir, entry.size)))
        .collect::<HashMap<_, _>>();
    for index in 0..archive.len() {
        let source = archive
            .by_index(index)
            .map_err(|error| format!("无法读取扩展包条目：{error}"))?;
        let raw_name = source.name().to_string();
        let is_dir = source.is_dir() || raw_name.ends_with('/');
        let parts = package_entry_parts(&raw_name, is_dir)?;
        let name = parts.join("/");
        let Some((expected_is_dir, expected_size)) = expected.get(name.as_str()) else {
            return Err("扩展包内容在校验后发生变化。".to_string());
        };
        if *expected_is_dir != is_dir || *expected_size != if is_dir { 0 } else { source.size() } {
            return Err("扩展包条目大小在校验后发生变化。".to_string());
        }
        let target = parts
            .iter()
            .fold(destination.to_path_buf(), |path, part| path.join(part));
        if is_dir {
            fs::create_dir_all(&target).map_err(|error| format!("无法解压扩展文件夹：{error}"))?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("无法创建扩展文件夹：{error}"))?;
        }
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map_err(|error| format!("无法写入扩展文件：{error}"))?;
        let copied = io::copy(
            &mut source.take(expected_size.saturating_add(1)),
            &mut output,
        )
        .map_err(|error| format!("无法解压扩展文件：{error}"))?;
        if copied != *expected_size {
            return Err("扩展文件大小与清单不一致。".to_string());
        }
        output
            .sync_all()
            .map_err(|error| format!("无法保存扩展文件：{error}"))?;
    }
    Ok(())
}

fn read_state(directory: &Path) -> Result<ExtensionState, String> {
    let path = extension_state_path(directory);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(ExtensionState::default());
        }
        Err(error) => return Err(format!("无法读取扩展状态：{error}")),
    };
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("扩展状态文件必须是普通文件。".to_string());
    }
    let bytes = fs::read(&path).map_err(|error| format!("无法读取扩展状态：{error}"))?;
    serde_json::from_slice(&bytes).map_err(|error| format!("扩展状态文件无效：{error}"))
}

fn write_state(directory: &Path, state: &ExtensionState) -> Result<(), String> {
    let bytes =
        serde_json::to_vec_pretty(state).map_err(|error| format!("无法生成扩展状态：{error}"))?;
    atomic_write(&extension_state_path(directory), &bytes)
}

fn ensure_safe_directory(path: &Path) -> Result<(), String> {
    let metadata =
        fs::symlink_metadata(path).map_err(|error| format!("扩展目录不存在或无法访问：{error}"))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("扩展目录必须是普通文件夹。".to_string());
    }
    let canonical_root =
        fs::canonicalize(path).map_err(|error| format!("无法确定扩展目录位置：{error}"))?;
    let mut directories = vec![path.to_path_buf()];
    while let Some(current) = directories.pop() {
        for entry in fs::read_dir(&current).map_err(|error| format!("无法检查扩展目录：{error}"))?
        {
            let entry = entry.map_err(|error| format!("无法检查扩展目录：{error}"))?;
            let metadata = fs::symlink_metadata(entry.path())
                .map_err(|error| format!("无法检查扩展文件：{error}"))?;
            if metadata.file_type().is_symlink() {
                return Err("扩展目录不能包含符号链接。".to_string());
            }
            let canonical_entry = fs::canonicalize(entry.path())
                .map_err(|error| format!("无法确定扩展文件位置：{error}"))?;
            if !canonical_entry.starts_with(&canonical_root) {
                return Err("扩展目录不能包含指向外部的重解析点。".to_string());
            }
            if metadata.is_dir() {
                directories.push(entry.path());
            }
        }
    }
    Ok(())
}

fn manifest_from_directory(path: &Path) -> Result<ExtensionManifest, String> {
    ensure_safe_directory(path)?;
    let manifest_path = path.join("manifest.json");
    let metadata = fs::symlink_metadata(&manifest_path)
        .map_err(|error| format!("扩展缺少 manifest.json：{error}"))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("扩展清单必须是普通文件。".to_string());
    }
    let bytes =
        read_manifest_bytes(File::open(&manifest_path).map_err(|error| error.to_string())?)?;
    let manifest = serde_json::from_slice::<ExtensionManifest>(&bytes)
        .map_err(|error| format!("扩展清单无效：{error}"))?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

#[tauri::command]
pub(crate) fn read_extension_settings_entry(extension_id: String) -> Result<String, String> {
    let directory = extension_directory()?;
    if !valid_extension_id(&extension_id) {
        return Err("无效的扩展 ID。".to_string());
    }
    let state = read_state(&directory)?;
    if !state.enabled.get(&extension_id).copied().unwrap_or(true) {
        return Err("扩展已停用。".to_string());
    }
    let root = installed_extension_path(&directory, &extension_id)?;
    let manifest = manifest_from_directory(&root)?;
    if manifest.id != extension_id {
        return Err("扩展清单与扩展 ID 不一致。".to_string());
    }
    let entry = manifest
        .settings_entry
        .ok_or_else(|| "该扩展未提供设置页面。".to_string())?;
    let parts = validate_settings_entry_path(&entry)?;
    let path = parts.iter().fold(root, |path, part| path.join(part));
    let bytes = fs::read(path).map_err(|error| format!("无法读取扩展设置页面：{error}"))?;
    if bytes.len() > MAX_SETTINGS_ENTRY_BYTES {
        return Err("扩展设置页面超过大小限制。".to_string());
    }
    String::from_utf8(bytes).map_err(|_| "扩展设置页面必须是 UTF-8 编码。".to_string())
}

#[tauri::command]
pub(crate) fn read_extension_runtime_entry(extension_id: String) -> Result<String, String> {
    let directory = extension_directory()?;
    if !valid_extension_id(&extension_id) {
        return Err("无效的扩展 ID。".to_string());
    }
    let state = read_state(&directory)?;
    if !state.enabled.get(&extension_id).copied().unwrap_or(true) {
        return Err("扩展已停用。".to_string());
    }
    let root = installed_extension_path(&directory, &extension_id)?;
    let manifest = manifest_from_directory(&root)?;
    if manifest.id != extension_id {
        return Err("扩展清单与扩展 ID 不一致。".to_string());
    }
    let runtime = manifest
        .runtime
        .ok_or_else(|| "该扩展未提供运行时页面。".to_string())?;
    let parts = validate_runtime_entry_path(&runtime.entry)?;
    let path = parts.iter().fold(root, |path, part| path.join(part));
    let bytes = fs::read(path).map_err(|error| format!("无法读取扩展运行时页面：{error}"))?;
    if bytes.len() > MAX_RUNTIME_ENTRY_BYTES {
        return Err("扩展运行时页面超过大小限制。".to_string());
    }
    String::from_utf8(bytes).map_err(|_| "扩展运行时页面必须是 UTF-8 编码。".to_string())
}

#[tauri::command]
pub(crate) fn read_extension_runtime_resource(
    extension_id: String,
    resource_id: String,
) -> Result<Vec<u8>, String> {
    read_enabled_runtime_resource(&extension_id, &resource_id)
}

pub(crate) fn ensure_extension_runtime_permission(
    extension_id: &str,
    permission: &str,
) -> Result<(), String> {
    let directory = extension_directory()?;
    if !valid_extension_id(extension_id) || !EXTENSION_RUNTIME_PERMISSIONS.contains(&permission) {
        return Err("无效的扩展或权限 ID。".to_string());
    }
    let state = read_state(&directory)?;
    if !state.enabled.get(extension_id).copied().unwrap_or(true) {
        return Err("扩展已停用。".to_string());
    }
    let root = installed_extension_path(&directory, extension_id)?;
    let manifest = manifest_from_directory(&root)?;
    if manifest.id != extension_id {
        return Err("扩展清单与扩展 ID 不一致。".to_string());
    }
    let runtime = manifest
        .runtime
        .ok_or_else(|| "该扩展未提供运行时页面。".to_string())?;
    if !runtime
        .permissions
        .iter()
        .any(|candidate| candidate == permission)
    {
        return Err(format!("扩展未获准使用 {permission}。"));
    }
    Ok(())
}

pub(crate) fn read_enabled_runtime_resource(
    extension_id: &str,
    resource_id: &str,
) -> Result<Vec<u8>, String> {
    ensure_extension_runtime_permission(extension_id, "resources")?;
    if !valid_extension_id(resource_id) {
        return Err("无效的扩展资源 ID。".to_string());
    }
    let directory = extension_directory()?;
    let root = installed_extension_path(&directory, extension_id)?;
    let manifest = manifest_from_directory(&root)?;
    let runtime = manifest
        .runtime
        .ok_or_else(|| "该扩展未提供运行时页面。".to_string())?;
    let resource = runtime
        .resources
        .get(resource_id)
        .ok_or_else(|| "扩展运行时资源不存在。".to_string())?;
    let parts = validate_package_relative_path(resource, "扩展运行时资源")?;
    let path = parts.iter().fold(root, |path, part| path.join(part));
    let bytes = fs::read(path).map_err(|error| format!("无法读取扩展运行时资源：{error}"))?;
    if bytes.len() > MAX_RUNTIME_RESOURCE_BYTES {
        return Err("扩展运行时资源超过大小限制。".to_string());
    }
    Ok(bytes)
}

fn stored_extension(_path: &Path, manifest: ExtensionManifest, enabled: bool) -> StoredExtension {
    let commands = manifest
        .commands
        .iter()
        .map(|command| StoredExtensionCommand {
            id: command.id.clone(),
            name: command.name.clone(),
            description: command.description.clone(),
            handler: if command.entry.is_some() {
                "lua"
            } else if command.runtime_event.is_some() {
                "runtime"
            } else {
                "settings"
            }
            .to_string(),
            runtime_event: command.runtime_event.clone(),
            opens_settings: command.opens_settings,
        })
        .collect();
    let panels = manifest
        .panels
        .iter()
        .map(|panel| StoredExtensionPanel {
            id: panel.id.clone(),
            name: panel.name.clone(),
            description: panel.description.clone(),
            default_visible: panel.default_visible,
            commands: panel.commands.clone(),
        })
        .collect();
    let menu_items = manifest
        .menu_items
        .iter()
        .map(|menu_item| StoredExtensionMenuItem {
            id: menu_item.id.clone(),
            name: menu_item.name.clone(),
            description: menu_item.description.clone(),
            menu: menu_item.menu.clone(),
            position: menu_item.position.clone(),
            commands: menu_item.commands.clone(),
        })
        .collect();
    let top_menus = manifest
        .top_menus
        .iter()
        .map(|top_menu| StoredExtensionTopMenu {
            id: top_menu.id.clone(),
            name: top_menu.name.clone(),
            description: top_menu.description.clone(),
            position: top_menu.position.clone(),
            commands: top_menu.commands.clone(),
        })
        .collect();
    StoredExtension {
        id: manifest.id,
        name: manifest.name,
        translations: manifest.translations,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        api_version: manifest.api_version,
        has_lua_entry: manifest.entry.is_some(),
        has_settings: manifest.settings_entry.is_some() || manifest.settings_ui.is_some(),
        settings_ui: manifest.settings_ui,
        runtime: manifest.runtime.map(|runtime| StoredExtensionRuntime {
            permissions: runtime.permissions,
            resources: runtime.resources.into_keys().collect(),
        }),
        commands,
        panels,
        menu_items,
        top_menus,
        enabled,
    }
}

fn installed_extension_path(directory: &Path, id: &str) -> Result<PathBuf, String> {
    if !valid_extension_id(id) {
        return Err("无效的扩展 ID。".to_string());
    }
    let path = directory.join(id);
    if path.parent() != Some(directory) {
        return Err("无效的扩展路径。".to_string());
    }
    Ok(path)
}

fn list_installed_extensions(
    directory: &Path,
    state: &ExtensionState,
) -> Result<Vec<StoredExtension>, String> {
    let mut extensions = Vec::new();
    for entry in fs::read_dir(directory).map_err(|error| format!("无法读取扩展文件夹：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法读取扩展文件夹：{error}"))?;
        let path = entry.path();
        let metadata =
            fs::symlink_metadata(&path).map_err(|error| format!("无法读取扩展文件夹：{error}"))?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            continue;
        }
        let Some(id) = path.file_name().and_then(OsStr::to_str) else {
            continue;
        };
        if !valid_extension_id(id) {
            continue;
        }
        let Ok(manifest) = manifest_from_directory(&path) else {
            continue;
        };
        if manifest.id != id {
            continue;
        }
        extensions.push(stored_extension(
            &path,
            manifest,
            state.enabled.get(id).copied().unwrap_or(true),
        ));
    }
    extensions.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(extensions)
}

fn resolve_enabled_lua_entry_for_manifest_at(
    directory: &Path,
    extension_id: &str,
    command_id: Option<&str>,
) -> Result<ExtensionLuaEntry, String> {
    let path = installed_extension_path(directory, extension_id)?;
    let state = read_state(directory)?;
    if !state.enabled.get(extension_id).copied().unwrap_or(true) {
        return Err("扩展已停用。".to_string());
    }
    let manifest = manifest_from_directory(&path)?;
    if manifest.id != extension_id {
        return Err("扩展清单与扩展 ID 不一致。".to_string());
    }
    let (entry, command_name, command_description) = match command_id {
        None => (
            manifest
                .entry
                .ok_or_else(|| "扩展没有可运行的 Lua 入口。".to_string())?,
            None,
            None,
        ),
        Some(command_id) => {
            if !valid_extension_id(command_id) {
                return Err("无效的扩展命令 ID。".to_string());
            }
            let command = manifest
                .commands
                .iter()
                .find(|command| command.id == command_id)
                .ok_or_else(|| "扩展命令不存在。".to_string())?;
            (
                command
                    .entry
                    .clone()
                    .ok_or_else(|| "该扩展命令不是 Lua 命令。".to_string())?,
                Some(command.name.clone()),
                (!command.description.is_empty()).then(|| command.description.clone()),
            )
        }
    };
    validate_lua_entry_path(
        &entry,
        if command_id.is_some() {
            "扩展命令入口"
        } else {
            "扩展入口"
        },
    )?;
    let parts = validate_package_relative_path(
        &entry,
        if command_id.is_some() {
            "扩展命令入口"
        } else {
            "扩展入口"
        },
    )?;

    let entry_path = parts
        .iter()
        .fold(path.clone(), |current, part| current.join(part));
    let metadata = fs::symlink_metadata(&entry_path)
        .map_err(|error| format!("扩展入口不存在或无法访问：{error}"))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("扩展入口必须是普通 Lua 文件。".to_string());
    }
    let canonical_root =
        fs::canonicalize(&path).map_err(|error| format!("无法确定扩展目录位置：{error}"))?;
    let canonical_entry =
        fs::canonicalize(&entry_path).map_err(|error| format!("无法确定扩展入口位置：{error}"))?;
    if !canonical_entry.starts_with(&canonical_root) {
        return Err("扩展入口不能位于扩展目录之外。".to_string());
    }

    Ok(ExtensionLuaEntry {
        extension_id: extension_id.to_string(),
        extension_name: manifest.name,
        command_id: command_id.map(str::to_string),
        command_name,
        command_description,
        entry_name: entry_path
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or(&entry)
            .to_string(),
        path: entry_path,
    })
}

pub(crate) fn resolve_enabled_lua_entry_at(
    directory: &Path,
    extension_id: &str,
) -> Result<ExtensionLuaEntry, String> {
    resolve_enabled_lua_entry_for_manifest_at(directory, extension_id, None)
}

pub(crate) fn resolve_enabled_lua_command_at(
    directory: &Path,
    extension_id: &str,
    command_id: &str,
) -> Result<ExtensionLuaEntry, String> {
    resolve_enabled_lua_entry_for_manifest_at(directory, extension_id, Some(command_id))
}

pub(crate) fn list_enabled_lua_entries() -> Result<Vec<ExtensionLuaEntry>, String> {
    let directory = extension_directory()?;
    list_enabled_lua_entries_at(&directory)
}

fn list_enabled_lua_entries_at(directory: &Path) -> Result<Vec<ExtensionLuaEntry>, String> {
    let state = read_state(directory)?;
    let extensions = list_installed_extensions(directory, &state)?;
    let mut entries = Vec::new();
    for extension in extensions.into_iter().filter(|extension| extension.enabled) {
        if extension.has_lua_entry {
            if let Ok(entry) = resolve_enabled_lua_entry_at(directory, &extension.id) {
                entries.push(entry);
            }
        }
        for command in extension.commands {
            if command.handler != "lua" {
                continue;
            }
            if let Ok(entry) = resolve_enabled_lua_command_at(directory, &extension.id, &command.id)
            {
                entries.push(entry);
            }
        }
    }
    entries.sort_by(|left, right| {
        left.extension_name
            .to_lowercase()
            .cmp(&right.extension_name.to_lowercase())
            .then_with(|| left.command_name.cmp(&right.command_name))
            .then_with(|| left.extension_id.cmp(&right.extension_id))
            .then_with(|| left.command_id.cmp(&right.command_id))
    });
    Ok(entries)
}

pub(crate) fn resolve_enabled_lua_entry(extension_id: &str) -> Result<ExtensionLuaEntry, String> {
    let directory = extension_directory()?;
    resolve_enabled_lua_entry_at(&directory, extension_id)
}

pub(crate) fn resolve_enabled_lua_command(
    extension_id: &str,
    command_id: &str,
) -> Result<ExtensionLuaEntry, String> {
    let directory = extension_directory()?;
    resolve_enabled_lua_command_at(&directory, extension_id, command_id)
}

#[tauri::command]
pub(crate) fn list_extensions() -> Result<ExtensionListing, String> {
    let directory = extension_directory()?;
    let state = read_state(&directory)?;
    Ok(ExtensionListing {
        extensions: list_installed_extensions(&directory, &state)?,
    })
}

#[tauri::command]
pub(crate) fn inspect_extension_package(
    package_path: String,
) -> Result<ExtensionPackagePreview, String> {
    let package_path = PathBuf::from(package_path.trim());
    if !is_extension_package_path(&package_path) {
        return Err("只能预览 .msext 扩展包。".to_string());
    }
    let metadata = fs::symlink_metadata(&package_path)
        .map_err(|error| format!("扩展包不存在或无法访问：{error}"))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("扩展包必须是普通文件。".to_string());
    }
    if metadata.len() > MAX_PACKAGE_BYTES {
        return Err("扩展包不能超过 50 MiB。".to_string());
    }
    let inspection = inspect_archive(
        File::open(&package_path).map_err(|error| format!("无法打开扩展包：{error}"))?,
    )?;
    let manifest = inspection.manifest;
    Ok(ExtensionPackagePreview {
        name: manifest.name,
        translations: manifest.translations,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        id: manifest.id,
        command_count: manifest.commands.len(),
        panel_count: manifest.panels.len(),
        menu_count: manifest.menu_items.len() + manifest.top_menus.len(),
    })
}

#[tauri::command]
pub(crate) fn install_extension(package_path: String) -> Result<StoredExtension, String> {
    let package_path = PathBuf::from(package_path.trim());
    let directory = extension_directory()?;
    install_extension_at(&package_path, &directory)
}

fn install_extension_at(package_path: &Path, directory: &Path) -> Result<StoredExtension, String> {
    if !is_extension_package_path(&package_path) {
        return Err("只能安装 .msext 扩展包。".to_string());
    }
    let metadata = fs::symlink_metadata(&package_path)
        .map_err(|error| format!("扩展包不存在或无法访问：{error}"))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("扩展包必须是普通文件。".to_string());
    }
    if metadata.len() > MAX_PACKAGE_BYTES {
        return Err("扩展包不能超过 50 MiB。".to_string());
    }
    let inspection = inspect_archive(
        File::open(&package_path).map_err(|error| format!("无法打开扩展包：{error}"))?,
    )?;
    let target = installed_extension_path(&directory, &inspection.manifest.id)?;
    let staging = directory.join(format!(".staging-{}", unique_suffix()));
    fs::create_dir(&staging).map_err(|error| format!("无法创建扩展临时目录：{error}"))?;
    if let Err(error) = extract_archive(&package_path, &staging, &inspection) {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    let installed_manifest = match manifest_from_directory(&staging) {
        Ok(manifest) => manifest,
        Err(error) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(error);
        }
    };
    if installed_manifest.id != inspection.manifest.id {
        let _ = fs::remove_dir_all(&staging);
        return Err("扩展清单在安装过程中发生变化。".to_string());
    }

    let state_before = match read_state(directory) {
        Ok(state) => state,
        Err(error) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(error);
        }
    };
    let enabled = state_before
        .enabled
        .get(&inspection.manifest.id)
        .copied()
        .unwrap_or(true);
    let backup = directory.join(format!(
        ".backup-{}-{}",
        inspection.manifest.id,
        unique_suffix()
    ));
    let target_exists = match fs::symlink_metadata(&target) {
        Ok(_) => true,
        Err(error) if error.kind() == io::ErrorKind::NotFound => false,
        Err(error) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(format!("无法访问原有扩展：{error}"));
        }
    };
    if target_exists {
        if let Err(error) = ensure_safe_directory(&target) {
            let _ = fs::remove_dir_all(&staging);
            return Err(error);
        }
        if let Err(error) = fs::rename(&target, &backup) {
            let _ = fs::remove_dir_all(&staging);
            return Err(format!("无法替换原有扩展：{error}"));
        }
    }
    let swap_result = fs::rename(&staging, &target);
    if let Err(error) = swap_result {
        if target_exists {
            let _ = fs::rename(&backup, &target);
        }
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("无法安装扩展：{error}"));
    }

    let mut next_state = state_before.clone();
    next_state
        .enabled
        .insert(inspection.manifest.id.clone(), enabled);
    if let Err(error) = write_state(&directory, &next_state) {
        let _ = fs::remove_dir_all(&target);
        if target_exists {
            let _ = fs::rename(&backup, &target);
        }
        return Err(error);
    }
    if target_exists {
        let _ = fs::remove_dir_all(&backup);
    }
    Ok(stored_extension(&target, installed_manifest, enabled))
}

#[tauri::command]
pub(crate) fn choose_extension_package(language: Option<String>) -> Result<Option<String>, String> {
    let english = language.as_deref() == Some("en-US");
    let Some(path) = FileDialog::new()
        .add_filter(
            if english {
                "MoonSprite extension"
            } else {
                "MoonSprite 扩展"
            },
            &[EXTENSION_PACKAGE_EXTENSION],
        )
        .pick_file()
    else {
        return Ok(None);
    };
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
pub(crate) fn set_extension_enabled(id: String, enabled: bool) -> Result<StoredExtension, String> {
    let directory = extension_directory()?;
    set_extension_enabled_at(&directory, &id, enabled)
}

fn set_extension_enabled_at(
    directory: &Path,
    id: &str,
    enabled: bool,
) -> Result<StoredExtension, String> {
    let path = installed_extension_path(directory, id)?;
    let manifest = manifest_from_directory(&path)?;
    if manifest.id != id {
        return Err("扩展清单与扩展 ID 不一致。".to_string());
    }
    let mut state = read_state(&directory)?;
    state.enabled.insert(id.to_string(), enabled);
    write_state(directory, &state)?;
    Ok(stored_extension(&path, manifest, enabled))
}

#[tauri::command]
pub(crate) fn uninstall_extension(id: String) -> Result<(), String> {
    let directory = extension_directory()?;
    uninstall_extension_at(&directory, &id)
}

fn uninstall_extension_at(directory: &Path, id: &str) -> Result<(), String> {
    let path = installed_extension_path(directory, id)?;
    let metadata =
        fs::symlink_metadata(&path).map_err(|error| format!("扩展不存在或无法访问：{error}"))?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("只能卸载已安装的扩展文件夹。".to_string());
    }
    let manifest = manifest_from_directory(&path)?;
    if manifest.id != id {
        return Err("扩展清单与扩展 ID 不一致。".to_string());
    }
    let previous_state = read_state(directory)?;
    let mut next_state = previous_state.clone();
    next_state.enabled.remove(id);
    write_state(directory, &next_state)?;
    if let Err(error) = fs::remove_dir_all(&path) {
        let _ = write_state(directory, &previous_state);
        return Err(format!("无法卸载扩展：{error}"));
    }
    Ok(())
}

fn launch_directory(directory: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer.exe");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(directory)
        .spawn()
        .map_err(|error| format!("无法打开扩展文件夹：{error}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn open_extension_folder() -> Result<(), String> {
    let directory = extension_directory()?;
    launch_directory(&directory)
}

#[cfg(test)]
mod tests {
    use super::{
        inspect_archive, is_extension_package_path, list_enabled_lua_entries_at,
        resolve_enabled_lua_command_at, resolve_enabled_lua_entry_at, set_extension_enabled_at,
        valid_extension_id, MAX_MANIFEST_BYTES,
    };
    use std::{
        fs,
        io::{Cursor, Write},
        path::Path,
        time::{SystemTime, UNIX_EPOCH},
    };
    use zip::{write::SimpleFileOptions, ZipWriter};

    fn archive(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        for (name, data) in entries {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(data).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    fn manifest(id: &str) -> Vec<u8> {
        manifest_with_version(id, "1.0.0")
    }

    fn manifest_with_version(id: &str, version: &str) -> Vec<u8> {
        format!(
            r#"{{"schemaVersion":1,"id":"{id}","name":"Sample","version":"{version}","entry":"main.lua"}}"#
        )
        .into_bytes()
    }

    fn temporary_directory() -> std::path::PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("moonsprite-extension-test-{stamp}"));
        fs::create_dir_all(&directory).unwrap();
        directory
    }

    #[test]
    fn accepts_a_valid_extension_manifest() {
        let bytes = archive(&[
            ("manifest.json", &manifest("com.example.sample")),
            ("main.lua", b"return 1"),
        ]);
        let inspection = inspect_archive(Cursor::new(bytes)).unwrap();
        assert_eq!(inspection.manifest.id, "com.example.sample");
        assert_eq!(inspection.entries.len(), 2);
    }

    #[test]
    fn accepts_a_sandboxed_runtime_with_opaque_resources() {
        let bytes = archive(&[
            (
                "manifest.json",
                br#"{"schemaVersion":2,"apiVersion":"1.0.0","id":"com.example.runtime","name":"Runtime","version":"1.0.0","settingsEntry":"settings.html","runtime":{"entry":"runtime.html","permissions":["runtime","commands","resources","windows"],"resources":{"window":"window.html","image":"image.png"}},"commands":[{"id":"show","name":"Show","runtimeEvent":"show"},{"id":"settings","name":"Settings","opensSettings":true}],"menuItems":[{"id":"menu","name":"Example","menu":"window","commands":["show","settings"]}]}"#,
            ),
            ("runtime.html", b"<!doctype html>"),
            ("settings.html", b"<!doctype html>"),
            ("window.html", b"<!doctype html>"),
            ("image.png", b"opaque runtime resource"),
        ]);
        assert!(inspect_archive(Cursor::new(bytes)).is_ok());
    }

    #[test]
    fn bundled_update_migrates_legacy_state_and_preserves_disabled_settings() -> Result<(), String> {
        let directory = temporary_directory();
        let id = "com.example.bundled";
        let metadata = manifest(id);
        let old = archive(&[("manifest.json", &metadata), ("main.lua", b"return 1")]);
        let new = archive(&[("manifest.json", &metadata), ("main.lua", b"return 2")]);
        super::ensure_builtin_extension_at(&directory, id, &old)?;
        super::set_extension_enabled_at(&directory, id, false)?;
        let mut legacy = super::read_state(&directory)?;
        legacy.builtin_revisions.clear();
        super::write_state(&directory, &legacy)?;
        let settings = directory.join("user-pet-settings.json");
        fs::write(&settings, b"preserved").map_err(|error| error.to_string())?;

        super::ensure_builtin_extension_at(&directory, id, &new)?;
        let state = super::read_state(&directory)?;
        assert_eq!(state.enabled.get(id), Some(&false));
        assert!(state.builtin_revisions.contains_key(id));
        assert_eq!(fs::read(directory.join(id).join("main.lua")).map_err(|error| error.to_string())?, b"return 2");
        assert_eq!(fs::read(&settings).map_err(|error| error.to_string())?, b"preserved");

        // An unchanged bundle must not replace the installation on every launch.
        fs::write(directory.join(id).join("main.lua"), b"manual edit").map_err(|error| error.to_string())?;
        super::ensure_builtin_extension_at(&directory, id, &new)?;
        assert_eq!(fs::read(directory.join(id).join("main.lua")).map_err(|error| error.to_string())?, b"manual edit");
        let third = archive(&[("manifest.json", &metadata), ("main.lua", b"return 3")]);
        super::ensure_builtin_extension_at(&directory, id, &third)?;
        assert_eq!(fs::read(directory.join(id).join("main.lua")).map_err(|error| error.to_string())?, b"return 3");
        assert_eq!(super::read_state(&directory)?.enabled.get(id), Some(&false));
        fs::remove_dir_all(directory).map_err(|error| error.to_string())
    }

    #[test]
    fn bundled_update_failure_and_uninstall_do_not_restore_or_damage_existing_data() -> Result<(), String> {
        let directory = temporary_directory();
        let id = "com.example.bundled";
        let metadata = manifest(id);
        let old = archive(&[("manifest.json", &metadata), ("main.lua", b"return 1")]);
        let new = archive(&[("manifest.json", &metadata), ("main.lua", b"return 2")]);
        super::ensure_builtin_extension_at(&directory, id, &old)?;
        let state_before = fs::read(super::extension_state_path(&directory)).map_err(|error| error.to_string())?;
        assert!(super::ensure_builtin_extension_at(&directory, id, b"broken zip").is_err());
        let invalid = archive(&[("manifest.json", &metadata)]);
        assert!(super::ensure_builtin_extension_at(&directory, id, &invalid).is_err());
        assert_eq!(fs::read(super::extension_state_path(&directory)).map_err(|error| error.to_string())?, state_before);
        assert_eq!(fs::read(directory.join(id).join("main.lua")).map_err(|error| error.to_string())?, b"return 1");
        super::uninstall_extension_at(&directory, id)?;
        super::ensure_builtin_extension_at(&directory, id, &new)?;
        assert!(!directory.join(id).exists());
        fs::remove_dir_all(directory).map_err(|error| error.to_string())
    }

    #[test]
    fn seeds_the_bundled_pet_once_without_restoring_an_uninstalled_extension() {
        let directory = temporary_directory();
        assert!(super::ensure_builtin_extension_at(
            &directory,
            super::BUILTIN_PET_COMPANION_ID,
            super::BUILTIN_PET_COMPANION_PACKAGE,
        )
        .is_ok());
        let installed = directory.join(super::BUILTIN_PET_COMPANION_ID);
        assert!(installed.is_dir());

        assert!(super::uninstall_extension_at(&directory, super::BUILTIN_PET_COMPANION_ID).is_ok());
        assert!(!installed.exists());
        assert!(super::ensure_builtin_extension_at(
            &directory,
            super::BUILTIN_PET_COMPANION_ID,
            super::BUILTIN_PET_COMPANION_PACKAGE,
        )
        .is_ok());
        assert!(!installed.exists());
        assert!(fs::remove_dir_all(directory).is_ok());
    }

    #[test]
    fn accepts_host_rendered_extension_settings_components() {
        let bytes = archive(&[
            (
                "manifest.json",
                br#"{"schemaVersion":2,"apiVersion":"1.0.0","id":"com.example.components","name":"Components","version":"1.0.0","runtime":{"entry":"runtime.html","permissions":["runtime","commands"]},"settingsUi":{"storageKey":"preferences","controls":[{"id":"enabled","type":"checkbox","label":"Enabled","defaultValue":true},{"id":"scale","type":"number","label":"Scale","defaultValue":2,"min":1,"max":4,"step":1},{"id":"name","type":"text","label":"Name","defaultValue":"Moon","maxLength":32},{"id":"mode","type":"select","label":"Mode","defaultValue":"idle","options":[{"value":"idle","label":"Idle"},{"value":"active","label":"Active"}]},{"id":"apply","type":"button","label":"Apply","commandId":"apply","variant":"primary"}]},"commands":[{"id":"apply","name":"Apply","runtimeEvent":"apply"},{"id":"settings","name":"Settings","opensSettings":true}]}"#,
            ),
            ("runtime.html", b"<!doctype html>"),
        ]);
        let inspection = inspect_archive(Cursor::new(bytes));
        assert!(inspection.is_ok());
        assert_eq!(
            inspection
                .as_ref()
                .ok()
                .and_then(|value| value.manifest.settings_ui.as_ref())
                .map(|settings| settings.controls.len()),
            Some(5)
        );
    }

    #[test]
    fn rejects_invalid_host_rendered_extension_settings() {
        let unknown_control = archive(&[(
            "manifest.json",
            br#"{"schemaVersion":2,"id":"com.example.bad","name":"Bad","version":"1.0.0","settingsUi":{"storageKey":"preferences","controls":[{"id":"bad","type":"slider","label":"Bad","defaultValue":1}]}}"#,
        )]);
        let missing_button_command = archive(&[(
            "manifest.json",
            br#"{"schemaVersion":2,"id":"com.example.bad","name":"Bad","version":"1.0.0","settingsUi":{"storageKey":"preferences","controls":[{"id":"run","type":"button","label":"Run","commandId":"missing"}]}}"#,
        )]);
        assert!(inspect_archive(Cursor::new(unknown_control)).is_err());
        assert!(inspect_archive(Cursor::new(missing_button_command)).is_err());
    }

    #[test]
    fn rejects_invalid_runtime_permissions_and_command_handlers() {
        let unknown_permission = archive(&[
            ("manifest.json", br#"{"schemaVersion":2,"apiVersion":"1.0.0","id":"com.example.runtime","name":"Runtime","version":"1.0.0","runtime":{"entry":"runtime.html","permissions":["runtime","system.raw"]}}"#),
            ("runtime.html", b"<!doctype html>"),
        ]);
        let duplicate_permission = archive(&[
            ("manifest.json", br#"{"schemaVersion":2,"apiVersion":"1.0.0","id":"com.example.runtime","name":"Runtime","version":"1.0.0","runtime":{"entry":"runtime.html","permissions":["runtime","runtime"]}}"#),
            ("runtime.html", b"<!doctype html>"),
        ]);
        let multiple_handlers = archive(&[
            ("manifest.json", br#"{"schemaVersion":2,"apiVersion":"1.0.0","id":"com.example.runtime","name":"Runtime","version":"1.0.0","runtime":{"entry":"runtime.html","permissions":["runtime"]},"commands":[{"id":"bad","name":"Bad","entry":"bad.lua","runtimeEvent":"bad"}]}"#),
            ("runtime.html", b"<!doctype html>"),
            ("bad.lua", b"return 1"),
        ]);
        assert!(inspect_archive(Cursor::new(unknown_permission)).is_err());
        assert!(inspect_archive(Cursor::new(duplicate_permission)).is_err());
        assert!(inspect_archive(Cursor::new(multiple_handlers)).is_err());
    }

    #[test]
    fn rejects_unknown_manifest_fields() {
        let bytes = archive(&[(
            "manifest.json",
            br#"{"schemaVersion":1,"id":"com.example.strict","name":"Strict","version":"1.0.0","unsupportedContribution":[]}"#,
        )]);
        assert!(inspect_archive(Cursor::new(bytes)).is_err());
    }

    #[test]
    fn accepts_multiple_commands_and_panel_declarations() {
        let bytes = archive(&[
            (
                "manifest.json",
                br#"{
                    "schemaVersion": 1,
                    "id": "com.example.tools",
                    "name": "Tools",
                    "version": "1.0.0",
                    "commands": [
                        { "id": "paint", "name": "Paint", "entry": "commands/paint.lua" },
                        { "id": "inspect", "name": "Inspect", "description": "Show context", "entry": "commands/inspect.lua" }
                    ],
                    "panels": [
                        { "id": "tools", "name": "Tools", "defaultVisible": true, "commands": ["paint", "inspect"] }
                    ],
                    "menuItems": [
                        { "id": "file-tools", "menu": "file", "position": "end", "commands": ["inspect"] }
                    ],
                    "topMenus": [
                        { "id": "tools-menu", "name": "Tools", "position": "before:help", "commands": ["paint", "inspect"] }
                    ]
                }"#,
            ),
            ("commands/paint.lua", b"return 1"),
            ("commands/inspect.lua", b"return 2"),
        ]);

        let inspection = inspect_archive(Cursor::new(bytes)).unwrap();
        assert_eq!(inspection.manifest.commands.len(), 2);
        assert_eq!(inspection.manifest.panels.len(), 1);
        assert_eq!(inspection.manifest.menu_items.len(), 1);
        assert_eq!(inspection.manifest.top_menus.len(), 1);
        assert_eq!(inspection.manifest.panels[0].commands, ["paint", "inspect"]);
        assert!(inspection.manifest.panels[0].default_visible);
    }

    #[test]
    fn rejects_missing_command_entries() {
        let bytes = archive(&[(
            "manifest.json",
            br#"{
                "schemaVersion": 1,
                "id": "com.example.missing",
                "name": "Missing",
                "version": "1.0.0",
                "commands": [
                    { "id": "paint", "name": "Paint", "entry": "commands/paint.lua" }
                ]
            }"#,
        )]);

        let error = inspect_archive(Cursor::new(bytes)).unwrap_err();
        assert!(error.contains("入口文件不存在"));
    }

    #[test]
    fn rejects_duplicate_command_and_panel_ids_case_insensitively() {
        let duplicate_commands = archive(&[
            (
                "manifest.json",
                br#"{
                    "schemaVersion": 1,
                    "id": "com.example.duplicates",
                    "name": "Duplicates",
                    "version": "1.0.0",
                    "commands": [
                        { "id": "paint", "name": "Paint", "entry": "paint.lua" },
                        { "id": "Paint", "name": "Paint Again", "entry": "paint-again.lua" }
                    ]
                }"#,
            ),
            ("paint.lua", b"return 1"),
            ("paint-again.lua", b"return 2"),
        ]);
        assert!(inspect_archive(Cursor::new(duplicate_commands)).is_err());

        let duplicate_panels = archive(&[
            (
                "manifest.json",
                br#"{
                    "schemaVersion": 1,
                    "id": "com.example.duplicates",
                    "name": "Duplicates",
                    "version": "1.0.0",
                    "commands": [
                        { "id": "paint", "name": "Paint", "entry": "paint.lua" }
                    ],
                    "panels": [
                        { "id": "tools", "name": "Tools", "commands": ["paint"] },
                        { "id": "Tools", "name": "Tools Again", "commands": ["paint"] }
                    ]
                }"#,
            ),
            ("paint.lua", b"return 1"),
        ]);
        assert!(inspect_archive(Cursor::new(duplicate_panels)).is_err());
    }

    #[test]
    fn rejects_missing_or_wrong_case_panel_command_references() {
        for command_id in ["missing", "Paint"] {
            let manifest = format!(
                r#"{{
                    "schemaVersion": 1,
                    "id": "com.example.panel",
                    "name": "Panel",
                    "version": "1.0.0",
                    "commands": [
                        {{ "id": "paint", "name": "Paint", "entry": "paint.lua" }}
                    ],
                    "panels": [
                        {{ "id": "tools", "name": "Tools", "commands": ["{command_id}"] }}
                    ]
                }}"#
            );
            let bytes = archive(&[
                ("manifest.json", manifest.as_bytes()),
                ("paint.lua", b"return 1"),
            ]);
            assert!(inspect_archive(Cursor::new(bytes)).is_err(), "{command_id}");
        }
    }

    #[test]
    fn rejects_invalid_menu_contributions() {
        let manifests = [
            br#"{
                "schemaVersion": 1,
                "id": "com.example.menu",
                "name": "Menu",
                "version": "1.0.0",
                "commands": [
                    { "id": "paint", "name": "Paint", "entry": "paint.lua" }
                ],
                "menuItems": [
                    { "id": "bad-target", "menu": "extensions", "commands": ["paint"] }
                ]
            }"#
            .as_slice(),
            br#"{
                "schemaVersion": 1,
                "id": "com.example.menu",
                "name": "Menu",
                "version": "1.0.0",
                "commands": [
                    { "id": "paint", "name": "Paint", "entry": "paint.lua" }
                ],
                "menuItems": [
                    { "id": "missing-command", "menu": "file", "commands": ["missing"] }
                ]
            }"#
            .as_slice(),
            br#"{
                "schemaVersion": 1,
                "id": "com.example.menu",
                "name": "Menu",
                "version": "1.0.0",
                "commands": [
                    { "id": "paint", "name": "Paint", "entry": "paint.lua" }
                ],
                "topMenus": [
                    { "id": "bad-position", "name": "Tools", "position": "inside:file", "commands": ["paint"] }
                ]
            }"#
            .as_slice(),
        ];

        for manifest in manifests {
            let bytes = archive(&[("manifest.json", manifest), ("paint.lua", b"return 1")]);
            assert!(inspect_archive(Cursor::new(bytes)).is_err());
        }
    }

    #[test]
    fn rejects_traversal_and_absolute_zip_paths() {
        for path in [
            "../escape.txt",
            "/absolute.txt",
            "C:/absolute.txt",
            "nested/../../escape.txt",
        ] {
            let bytes = archive(&[
                (path, b"bad"),
                ("manifest.json", &manifest("safe")),
                ("main.lua", b"ok"),
            ]);
            assert!(inspect_archive(Cursor::new(bytes)).is_err(), "{path}");
        }
    }

    #[test]
    fn rejects_duplicate_paths_case_insensitively() {
        let bytes = archive(&[
            ("manifest.json", &manifest("safe")),
            ("MAIN.LUA", b"one"),
            ("main.lua", b"two"),
        ]);
        assert!(inspect_archive(Cursor::new(bytes)).is_err());
    }

    #[test]
    fn rejects_missing_or_invalid_manifests() {
        let missing = archive(&[("main.lua", b"ok")]);
        assert!(inspect_archive(Cursor::new(missing)).is_err());
        let invalid = archive(&[("manifest.json", br#"{"schemaVersion":3}"#)]);
        assert!(inspect_archive(Cursor::new(invalid)).is_err());
    }

    #[test]
    fn rejects_oversized_manifest() {
        let mut data = manifest("safe");
        data.extend(std::iter::repeat_n(b' ', MAX_MANIFEST_BYTES));
        let bytes = archive(&[("manifest.json", &data)]);
        assert!(inspect_archive(Cursor::new(bytes)).is_err());
    }

    #[test]
    fn recognizes_only_the_msext_suffix() {
        assert!(is_extension_package_path(Path::new("sample.msext")));
        assert!(is_extension_package_path(Path::new("sample.MSEXT")));
        assert!(!is_extension_package_path(Path::new("sample.zip")));
    }

    #[test]
    fn installs_replaces_and_uninstalls_a_package_without_losing_disabled_state() {
        let directory = temporary_directory();
        let package_path = directory.join("sample.msext");
        let first = archive(&[
            (
                "manifest.json",
                &manifest_with_version("com.example.sample", "1.0.0"),
            ),
            ("main.lua", b"one"),
        ]);
        fs::write(&package_path, first).unwrap();
        let installed = super::install_extension_at(&package_path, &directory).unwrap();
        assert!(installed.enabled);
        assert!(directory.join("com.example.sample/main.lua").is_file());

        let disabled =
            super::set_extension_enabled_at(&directory, "com.example.sample", false).unwrap();
        assert!(!disabled.enabled);
        let second = archive(&[
            (
                "manifest.json",
                &manifest_with_version("com.example.sample", "2.0.0"),
            ),
            ("main.lua", b"two"),
        ]);
        fs::write(&package_path, second).unwrap();
        let replaced = super::install_extension_at(&package_path, &directory).unwrap();
        assert_eq!(replaced.version, "2.0.0");
        assert!(!replaced.enabled);
        assert_eq!(
            fs::read(directory.join("com.example.sample/main.lua")).unwrap(),
            b"two"
        );

        super::uninstall_extension_at(&directory, "com.example.sample").unwrap();
        assert!(!directory.join("com.example.sample").exists());
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn validates_extension_ids() {
        assert!(valid_extension_id("com.example.ok"));
        assert!(!valid_extension_id("../escape"));
        assert!(!valid_extension_id(".hidden"));
    }

    #[test]
    fn lists_and_resolves_only_enabled_lua_entries() {
        let directory = temporary_directory();
        let extension_directory = directory.join("com.example.runner");
        fs::create_dir_all(extension_directory.join("lua")).unwrap();
        fs::write(
            extension_directory.join("manifest.json"),
            br#"{"schemaVersion":1,"id":"com.example.runner","name":"Runner","version":"1.0.0","entry":"lua/main.lua"}"#,
        )
        .unwrap();
        fs::write(extension_directory.join("lua/main.lua"), b"print('ok')").unwrap();

        let entries = list_enabled_lua_entries_at(&directory).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].extension_id, "com.example.runner");
        assert_eq!(entries[0].extension_name, "Runner");
        assert_eq!(entries[0].entry_name, "main.lua");
        assert_eq!(entries[0].path, extension_directory.join("lua/main.lua"));

        set_extension_enabled_at(&directory, "com.example.runner", false).unwrap();
        assert!(list_enabled_lua_entries_at(&directory).unwrap().is_empty());
        assert!(resolve_enabled_lua_entry_at(&directory, "com.example.runner").is_err());
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn lists_and_resolves_only_enabled_extension_commands() {
        let directory = temporary_directory();
        let extension_directory = directory.join("com.example.commands");
        fs::create_dir_all(extension_directory.join("commands")).unwrap();
        fs::write(
            extension_directory.join("manifest.json"),
            br#"{
                "schemaVersion": 1,
                "id": "com.example.commands",
                "name": "Command Tools",
                "version": "1.0.0",
                "commands": [
                    { "id": "paint", "name": "Paint", "description": "Paint a pixel", "entry": "commands/paint.lua" },
                    { "id": "inspect", "name": "Inspect", "entry": "commands/inspect.lua" }
                ],
                "panels": [
                    { "id": "tools", "name": "Tools", "commands": ["paint", "inspect"] }
                ]
            }"#,
        )
        .unwrap();
        fs::write(
            extension_directory.join("commands/paint.lua"),
            b"return 'paint'",
        )
        .unwrap();
        fs::write(
            extension_directory.join("commands/inspect.lua"),
            b"return 'inspect'",
        )
        .unwrap();

        let entries = list_enabled_lua_entries_at(&directory).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(
            entries
                .iter()
                .filter_map(|entry| entry.command_id.as_deref())
                .collect::<Vec<_>>(),
            vec!["inspect", "paint"]
        );

        let paint =
            resolve_enabled_lua_command_at(&directory, "com.example.commands", "paint").unwrap();
        assert_eq!(paint.command_name.as_deref(), Some("Paint"));
        assert_eq!(paint.command_description.as_deref(), Some("Paint a pixel"));
        assert_eq!(paint.path, extension_directory.join("commands/paint.lua"));
        assert!(
            resolve_enabled_lua_command_at(&directory, "com.example.commands", "Paint").is_err()
        );

        set_extension_enabled_at(&directory, "com.example.commands", false).unwrap();
        assert!(list_enabled_lua_entries_at(&directory).unwrap().is_empty());
        assert!(
            resolve_enabled_lua_command_at(&directory, "com.example.commands", "paint").is_err()
        );
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn rejects_non_lua_manifest_entries() {
        let bytes = archive(&[
            (
                "manifest.json",
                br#"{"schemaVersion":1,"id":"com.example.native","name":"Native","version":"1.0.0","entry":"main.js"}"#,
            ),
            ("main.js", b"not executable here"),
        ]);
        assert!(inspect_archive(Cursor::new(bytes)).is_err());
    }
}
