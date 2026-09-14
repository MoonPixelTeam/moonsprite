use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    ffi::OsStr,
    fs::{self, File, OpenOptions},
    io::{self, BufReader, Read, Seek},
    path::{Component, Path, PathBuf},
};
use zip::ZipArchive;

use crate::{platform_paths::ensure_executable_subdirectory, platform_storage::atomic_write};

pub(crate) const EXTENSION_PACKAGE_EXTENSION: &str = "msext";
const EXTENSION_DIRECTORY_NAME: &str = "extensions";
const EXTENSION_STATE_FILE: &str = ".state.json";
const MAX_PACKAGE_BYTES: u64 = 50 * 1024 * 1024;
const MAX_PACKAGE_FILES: usize = 256;
const MAX_UNPACKED_BYTES: u64 = 256 * 1024 * 1024;
const MAX_MANIFEST_BYTES: usize = 256 * 1024;
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
const MAX_EXTENSION_TOOLS: usize = 16;
const MAX_EXTENSION_PETS: usize = 8;
const MAX_PET_ANIMATIONS: usize = 16;
const MAX_PET_ANIMATION_FRAMES: usize = 128;
const MAX_PET_FRAME_DIMENSION: u32 = 512;
const MAX_PANEL_COMMANDS: usize = 32;
const MAX_MENU_COMMANDS: usize = 32;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredExtension {
    id: String,
    name: String,
    version: String,
    description: String,
    author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    api_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    entry: Option<String>,
    commands: Vec<StoredExtensionCommand>,
    panels: Vec<StoredExtensionPanel>,
    menu_items: Vec<StoredExtensionMenuItem>,
    top_menus: Vec<StoredExtensionTopMenu>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tools: Vec<StoredExtensionTool>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pets: Vec<StoredExtensionPet>,
    file_path: String,
    enabled: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredExtensionPet {
    id: String,
    name: String,
    description: String,
    sprite_sheet: String,
    frame_width: u32,
    frame_height: u32,
    animations: Vec<StoredExtensionPetAnimation>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredExtensionPetAnimation {
    state: String,
    frames: Vec<u32>,
    fps: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredExtensionCommand {
    id: String,
    name: String,
    description: String,
    entry: String,
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredExtensionTool {
    id: String,
    name: String,
    description: String,
    kind: String,
    placement: String,
    icon: String,
    modes: Vec<StoredExtensionToolMode>,
    default_mode: String,
    preview_color: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredExtensionToolMode {
    id: String,
    name: String,
    description: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExtensionListing {
    directory_path: String,
    extensions: Vec<StoredExtension>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExtensionPackagePreview {
    name: String,
    version: String,
    description: String,
    author: String,
    id: String,
    command_count: usize,
    panel_count: usize,
    menu_count: usize,
    tool_count: usize,
    pet_count: usize,
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
    entry: String,
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
    menu: String,
    #[serde(default = "default_menu_item_position")]
    position: String,
    #[serde(default)]
    commands: Vec<String>,
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
#[serde(rename_all = "camelCase")]
struct ExtensionToolManifest {
    id: String,
    name: String,
    #[serde(default)]
    description: String,
    kind: String,
    #[serde(default = "default_tool_placement")]
    placement: String,
    #[serde(default = "default_tool_icon")]
    icon: String,
    #[serde(default)]
    modes: Vec<ExtensionToolModeManifest>,
    #[serde(default)]
    default_mode: String,
    #[serde(default = "default_tool_preview_color")]
    preview_color: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtensionPetAnimationManifest {
    state: String,
    frames: Vec<u32>,
    #[serde(default = "default_pet_animation_fps")]
    fps: u32,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtensionPetManifest {
    id: String,
    name: String,
    #[serde(default)]
    description: String,
    sprite_sheet: String,
    frame_width: u32,
    frame_height: u32,
    animations: Vec<ExtensionPetAnimationManifest>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtensionToolModeManifest {
    id: String,
    name: String,
    #[serde(default)]
    description: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtensionManifest {
    schema_version: u32,
    id: String,
    name: String,
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
    commands: Vec<ExtensionCommandManifest>,
    #[serde(default)]
    panels: Vec<ExtensionPanelManifest>,
    #[serde(default)]
    menu_items: Vec<ExtensionMenuItemManifest>,
    #[serde(default)]
    top_menus: Vec<ExtensionTopMenuManifest>,
    #[serde(default)]
    tools: Vec<ExtensionToolManifest>,
    #[serde(default)]
    pets: Vec<ExtensionPetManifest>,
}

#[derive(Debug, Default, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtensionState {
    #[serde(default)]
    enabled: BTreeMap<String, bool>,
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

pub(crate) fn ensure_extension_folder() -> Result<PathBuf, String> {
    extension_directory()
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

fn default_tool_placement() -> String {
    "pencil".to_string()
}

fn default_tool_icon() -> String {
    "tool-smooth".to_string()
}

fn default_tool_preview_color() -> String {
    "#2979ff66".to_string()
}

fn default_pet_animation_fps() -> u32 { 8 }

fn valid_pet_animation_state(value: &str) -> bool {
    matches!(value, "show" | "idle" | "drag" | "inspect" | "save" | "export-complete" | "unsaved-reminder" | "break-reminder" | "sleep")
}

fn validate_pet_sprite_path(path: &str) -> Result<(), String> {
    validate_package_relative_path(path, "宠物精灵图")?;
    if Path::new(path).extension().and_then(OsStr::to_str).is_none_or(|extension| !extension.eq_ignore_ascii_case("png")) {
        return Err("宠物精灵图必须是 PNG 文件。".to_string());
    }
    Ok(())
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

fn validate_manifest(manifest: &ExtensionManifest) -> Result<(), String> {
    if manifest.schema_version != 1 {
        return Err("扩展清单版本不受支持。".to_string());
    }
    if !valid_extension_id(&manifest.id) {
        return Err("扩展 ID 无效，只能使用字母、数字、点、短横线和下划线。".to_string());
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
        validate_lua_entry_path(&command.entry, "扩展命令入口")?;
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
    if manifest.tools.len() > MAX_EXTENSION_TOOLS {
        return Err(format!("扩展工具数量不能超过 {MAX_EXTENSION_TOOLS} 个。"));
    }
    let mut tool_ids = HashSet::new();
    for tool in &manifest.tools {
        if !valid_extension_id(&tool.id) {
            return Err("扩展工具 ID 无效，只能使用字母、数字、点、短横线和下划线。".to_string());
        }
        if !tool_ids.insert(tool.id.to_ascii_lowercase()) {
            return Err("扩展工具 ID 不能重复。".to_string());
        }
        if !valid_text(&tool.name, MAX_NAME_BYTES, true) {
            return Err("扩展工具名称无效或过长。".to_string());
        }
        if !valid_text(&tool.description, MAX_DESCRIPTION_BYTES, false) {
            return Err("扩展工具描述过长或包含控制字符。".to_string());
        }
        if tool.kind != "remote-pixel-brush" {
            return Err(format!("扩展工具“{}”声明了不受支持的宿主能力。", tool.id));
        }
        if tool.placement != "pencil" {
            return Err(format!("扩展工具“{}”只能放置在 pencil 工具组。", tool.id));
        }
        if !valid_text(&tool.icon, MAX_ID_BYTES, true) {
            return Err(format!("扩展工具“{}”图标标识无效。", tool.id));
        }
        if tool.modes.is_empty() || tool.modes.len() > 16 {
            return Err(format!("扩展工具“{}”必须声明 1 至 16 个模式。", tool.id));
        }
        let mut mode_ids = HashSet::new();
        for mode in &tool.modes {
            if !valid_extension_id(&mode.id) || !mode_ids.insert(mode.id.to_ascii_lowercase()) {
                return Err(format!("扩展工具“{}”包含无效或重复的模式 ID。", tool.id));
            }
            if !valid_text(&mode.name, MAX_NAME_BYTES, true)
                || !valid_text(&mode.description, MAX_DESCRIPTION_BYTES, false)
            {
                return Err(format!("扩展工具“{}”包含无效的模式文案。", tool.id));
            }
        }
        if !mode_ids.contains(&tool.default_mode.to_ascii_lowercase()) {
            return Err(format!("扩展工具“{}”的默认模式不存在。", tool.id));
        }
        if tool.preview_color.len() != 9
            || !tool.preview_color.starts_with('#')
            || !tool.preview_color[1..]
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(format!("扩展工具“{}”的预览色必须是 #RRGGBBAA。", tool.id));
        }
    }
    if manifest.pets.len() > MAX_EXTENSION_PETS {
        return Err(format!("扩展宠物数量不能超过 {MAX_EXTENSION_PETS} 个。"));
    }
    let mut pet_ids = HashSet::new();
    for pet in &manifest.pets {
        if !valid_extension_id(&pet.id) || !pet_ids.insert(pet.id.to_ascii_lowercase()) {
            return Err("扩展宠物 ID 无效或重复。".to_string());
        }
        if !valid_text(&pet.name, MAX_NAME_BYTES, true) || !valid_text(&pet.description, MAX_DESCRIPTION_BYTES, false) {
            return Err(format!("扩展宠物“{}”的名称或描述无效。", pet.id));
        }
        validate_pet_sprite_path(&pet.sprite_sheet)?;
        if pet.frame_width == 0 || pet.frame_height == 0 || pet.frame_width > MAX_PET_FRAME_DIMENSION || pet.frame_height > MAX_PET_FRAME_DIMENSION {
            return Err(format!("扩展宠物“{}”的帧尺寸无效。", pet.id));
        }
        if pet.animations.is_empty() || pet.animations.len() > MAX_PET_ANIMATIONS {
            return Err(format!("扩展宠物“{}”必须声明 1 至 {MAX_PET_ANIMATIONS} 个动画。", pet.id));
        }
        let mut states = HashSet::new();
        for animation in &pet.animations {
            if !valid_pet_animation_state(&animation.state) || !states.insert(animation.state.clone()) {
                return Err(format!("扩展宠物“{}”包含未知或重复的动画状态。", pet.id));
            }
            if animation.fps == 0 || animation.fps > 60 || animation.frames.is_empty() || animation.frames.len() > MAX_PET_ANIMATION_FRAMES {
                return Err(format!("扩展宠物“{}”的动画帧或速度无效。", pet.id));
            }
        }
        if !states.contains("idle") {
            return Err(format!("扩展宠物“{}”必须声明 idle 动画。", pet.id));
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
    for command in &manifest.commands {
        if !entries
            .iter()
            .any(|candidate| !candidate.is_dir && candidate.name == command.entry.as_str())
        {
            return Err(format!("扩展命令“{}”指定的入口文件不存在。", command.name));
        }
    }
    for pet in &manifest.pets {
        if !entries.iter().any(|candidate| !candidate.is_dir && candidate.name == pet.sprite_sheet) {
            return Err(format!("扩展宠物“{}”指定的精灵图不存在。", pet.name));
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
    validate_pet_assets_at(path, &manifest)?;
    Ok(manifest)
}

fn pet_sprite_path_at(root: &Path, pet: &ExtensionPetManifest) -> Result<PathBuf, String> {
    let parts = validate_package_relative_path(&pet.sprite_sheet, "宠物精灵图")?;
    let path = parts.iter().fold(root.to_path_buf(), |current, part| current.join(part));
    let metadata = fs::symlink_metadata(&path).map_err(|error| format!("宠物精灵图不存在或无法访问：{error}"))?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("宠物精灵图必须是普通 PNG 文件。".to_string());
    }
    let canonical_root = fs::canonicalize(root).map_err(|error| format!("无法确定扩展目录位置：{error}"))?;
    let canonical_path = fs::canonicalize(&path).map_err(|error| format!("无法确定宠物精灵图位置：{error}"))?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err("宠物精灵图不能位于扩展目录之外。".to_string());
    }
    Ok(path)
}

fn validate_pet_assets_at(root: &Path, manifest: &ExtensionManifest) -> Result<(), String> {
    for pet in &manifest.pets {
        let path = pet_sprite_path_at(root, pet)?;
        let decoder = png::Decoder::new(BufReader::new(File::open(path).map_err(|error| format!("无法读取宠物精灵图：{error}"))?));
        let reader = decoder.read_info().map_err(|error| format!("宠物精灵图不是有效 PNG：{error}"))?;
        let info = reader.info();
        if info.width == 0 || info.height == 0 || info.width % pet.frame_width != 0 || info.height % pet.frame_height != 0 {
            return Err(format!("扩展宠物“{}”的精灵图尺寸不能被帧尺寸整除。", pet.id));
        }
        let frame_count = (u64::from(info.width) / u64::from(pet.frame_width)) * (u64::from(info.height) / u64::from(pet.frame_height));
        if pet.animations.iter().flat_map(|animation| animation.frames.iter()).any(|frame| u64::from(*frame) >= frame_count) {
            return Err(format!("扩展宠物“{}”引用了精灵图之外的帧。", pet.id));
        }
    }
    Ok(())
}

pub(crate) fn read_enabled_pet_sprite(extension_id: &str, pet_id: &str) -> Result<Vec<u8>, String> {
    let directory = extension_directory()?;
    if !valid_extension_id(extension_id) || !valid_extension_id(pet_id) {
        return Err("无效的扩展宠物标识。".to_string());
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
    let pet = manifest.pets.iter().find(|candidate| candidate.id == pet_id).ok_or_else(|| "扩展宠物不存在。".to_string())?;
    fs::read(pet_sprite_path_at(&root, pet)?).map_err(|error| format!("无法读取宠物精灵图：{error}"))
}

fn stored_extension(path: &Path, manifest: ExtensionManifest, enabled: bool) -> StoredExtension {
    let commands = manifest
        .commands
        .iter()
        .map(|command| StoredExtensionCommand {
            id: command.id.clone(),
            name: command.name.clone(),
            description: command.description.clone(),
            entry: command.entry.clone(),
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
    let tools = manifest
        .tools
        .iter()
        .map(|tool| StoredExtensionTool {
            id: tool.id.clone(),
            name: tool.name.clone(),
            description: tool.description.clone(),
            kind: tool.kind.clone(),
            placement: tool.placement.clone(),
            icon: tool.icon.clone(),
            modes: tool
                .modes
                .iter()
                .map(|mode| StoredExtensionToolMode {
                    id: mode.id.clone(),
                    name: mode.name.clone(),
                    description: mode.description.clone(),
                })
                .collect(),
            default_mode: tool.default_mode.clone(),
            preview_color: tool.preview_color.clone(),
        })
        .collect();
    let pets = manifest
        .pets
        .iter()
        .map(|pet| StoredExtensionPet {
            id: pet.id.clone(),
            name: pet.name.clone(),
            description: pet.description.clone(),
            sprite_sheet: pet.sprite_sheet.clone(),
            frame_width: pet.frame_width,
            frame_height: pet.frame_height,
            animations: pet.animations.iter().map(|animation| StoredExtensionPetAnimation {
                state: animation.state.clone(),
                frames: animation.frames.clone(),
                fps: animation.fps,
            }).collect(),
        })
        .collect();
    StoredExtension {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        api_version: manifest.api_version,
        entry: manifest.entry,
        commands,
        panels,
        menu_items,
        top_menus,
        tools,
        pets,
        file_path: path.to_string_lossy().to_string(),
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
                command.entry.clone(),
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
        if extension.entry.is_some() {
            if let Ok(entry) = resolve_enabled_lua_entry_at(directory, &extension.id) {
                entries.push(entry);
            }
        }
        for command in extension.commands {
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
        directory_path: directory.to_string_lossy().to_string(),
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
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        id: manifest.id,
        command_count: manifest.commands.len(),
        panel_count: manifest.panels.len(),
        menu_count: manifest.menu_items.len() + manifest.top_menus.len(),
        tool_count: manifest.tools.len(),
        pet_count: manifest.pets.len(),
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
pub(crate) fn choose_and_install_extension(
    language: Option<String>,
) -> Result<Option<StoredExtension>, String> {
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
    install_extension(path.to_string_lossy().to_string()).map(Some)
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
    fn accepts_host_owned_tool_contribution() {
        let bytes = archive(&[(
            "manifest.json",
            br#"{"schemaVersion":1,"id":"com.example.remote","name":"Remote","version":"1.0.0","tools":[{"id":"remote","name":"Remote","kind":"remote-pixel-brush","placement":"pencil","icon":"tool-smooth","modes":[{"id":"default","name":"Default"}],"defaultMode":"default"}]}"#,
        )]);
        let inspection = inspect_archive(Cursor::new(bytes)).unwrap();
        assert_eq!(inspection.manifest.tools.len(), 1);
        assert_eq!(inspection.manifest.tools[0].kind, "remote-pixel-brush");
    }

    #[test]
    fn accepts_a_host_rendered_pet_declaration_with_a_packaged_sprite() {
        let bytes = archive(&[
            ("manifest.json", br#"{"schemaVersion":1,"id":"com.example.pet","name":"Pet","version":"1.0.0","pets":[{"id":"companion","name":"Companion","spriteSheet":"assets/pet.png","frameWidth":16,"frameHeight":16,"animations":[{"state":"idle","frames":[0],"fps":8}]}]}"#),
            ("assets/pet.png", b"not-decoded-until-install"),
        ]);
        let inspection = inspect_archive(Cursor::new(bytes)).unwrap();
        assert_eq!(inspection.manifest.pets[0].id, "companion");
    }

    #[test]
    fn rejects_pet_declarations_with_unknown_states_or_missing_sprites() {
        let unknown_state = archive(&[("manifest.json", br#"{"schemaVersion":1,"id":"com.example.pet","name":"Pet","version":"1.0.0","pets":[{"id":"companion","name":"Companion","spriteSheet":"assets/pet.png","frameWidth":16,"frameHeight":16,"animations":[{"state":"dance","frames":[0]}]}]}"#)]);
        let missing_sprite = archive(&[("manifest.json", br#"{"schemaVersion":1,"id":"com.example.pet","name":"Pet","version":"1.0.0","pets":[{"id":"companion","name":"Companion","spriteSheet":"assets/pet.png","frameWidth":16,"frameHeight":16,"animations":[{"state":"idle","frames":[0]}]}]}"#)]);
        assert!(inspect_archive(Cursor::new(unknown_state)).is_err());
        assert!(inspect_archive(Cursor::new(missing_sprite)).is_err());
    }

    #[test]
    fn rejects_unknown_host_tool_capability() {
        let bytes = archive(&[(
            "manifest.json",
            br#"{"schemaVersion":1,"id":"com.example.bad","name":"Bad","version":"1.0.0","tools":[{"id":"bad","name":"Bad","kind":"arbitrary-code","placement":"pencil","icon":"tool-smooth","modes":[{"id":"default","name":"Default"}],"defaultMode":"default"}]}"#,
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
        let invalid = archive(&[("manifest.json", br#"{"schemaVersion":2}"#)]);
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
