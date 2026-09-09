use rfd::FileDialog;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Window;

use crate::platform_gallery::gallery_dir;
use crate::platform_paths::export_directory;

pub type DialogFilter = (&'static str, &'static [&'static str]);

const MOONSPRITE: &[&str] = &["moonsprite"];
const PNG: &[&str] = &["png"];
const JPEG: &[&str] = &["jpg", "jpeg"];
const WEBP: &[&str] = &["webp"];
const ASE: &[&str] = &["ase"];
const ASEPRITE: &[&str] = &["aseprite"];
const ASE_EXPORT: &[&str] = &["ase", "aseprite"];
const SVG: &[&str] = &["svg"];
const GIF: &[&str] = &["gif"];
const PSD: &[&str] = &["psd"];
const MP4: &[&str] = &["mp4"];
const WEBM: &[&str] = &["webm"];
const JSON: &[&str] = &["json"];

fn is_english(language: Option<&str>) -> bool {
    language == Some("en-US")
}

pub fn project_save_filter(format: Option<&str>, language: Option<&str>) -> DialogFilter {
    match (format, is_english(language)) {
        (Some("png"), true) => ("PNG image", PNG),
        (Some("jpeg"), true) => ("JPEG image", JPEG),
        (Some("webp"), true) => ("WebP image", WEBP),
        (Some("psd"), true) => ("Photoshop project", PSD),
        (Some("ase"), true) => ("Aseprite project (.ase)", ASE),
        (Some("aseprite"), true) => ("Aseprite project (.aseprite)", ASEPRITE),
        (_, true) => ("MoonSprite project", MOONSPRITE),
        (Some("png"), false) => ("PNG 图片", PNG),
        (Some("jpeg"), false) => ("JPEG 图片", JPEG),
        (Some("webp"), false) => ("WebP 图片", WEBP),
        (Some("psd"), false) => ("Photoshop 工程", PSD),
        (Some("ase"), false) => ("Aseprite 工程 (.ase)", ASE),
        (Some("aseprite"), false) => ("Aseprite 工程 (.aseprite)", ASEPRITE),
        _ => ("MoonSprite 工程", MOONSPRITE),
    }
}

pub fn image_export_filter(format: &str, language: Option<&str>) -> DialogFilter {
    if format == "mp4" {
        return (
            if is_english(language) {
                "MP4 video"
            } else {
                "MP4 视频"
            },
            MP4,
        );
    }
    if format == "webm" {
        return (
            if is_english(language) {
                "WebM video"
            } else {
                "WebM 视频"
            },
            WEBM,
        );
    }
    if format == "gif" {
        return (
            if is_english(language) {
                "GIF animation"
            } else {
                "GIF 动画"
            },
            GIF,
        );
    }
    match (format, is_english(language)) {
        ("jpeg", true) => ("JPEG image", JPEG),
        ("webp", true) => ("WebP image", WEBP),
        ("svg", true) => ("SVG image", SVG),
        ("psd", true) => ("Photoshop project", PSD),
        ("gif", true) => ("GIF animation", GIF),
        ("aseprite", true) => ("Aseprite project", ASE_EXPORT),
        (_, true) => ("PNG image", PNG),
        ("jpeg", false) => ("JPEG 图片", JPEG),
        ("webp", false) => ("WebP 图片", WEBP),
        ("svg", false) => ("SVG 图片", SVG),
        ("psd", false) => ("Photoshop 工程", PSD),
        ("aseprite", false) => ("Aseprite 工程", ASE_EXPORT),
        _ => ("PNG 图片", PNG),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenDialogResult {
    canceled: bool,
    file_paths: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveDialogResult {
    canceled: bool,
    file_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DirectoryDialogResult {
    canceled: bool,
    directory_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DefaultFileDirectories {
    save_directory: String,
    export_directory: String,
}

fn has_explicit_directory(default_path: Option<&str>) -> bool {
    default_path
        .and_then(|value| Path::new(value).parent())
        .is_some_and(|parent| !parent.as_os_str().is_empty())
}

fn file_dialog(default_path: Option<&str>, parent: &Window) -> FileDialog {
    let mut dialog = FileDialog::new().set_parent(parent);
    if let Some(path) = default_path {
        let path = PathBuf::from(path);
        if let Some(parent) = path.parent() {
            if parent.exists() {
                dialog = dialog.set_directory(parent);
            }
        }
        if let Some(name) = path.file_name().and_then(|value| value.to_str()) {
            dialog = dialog.set_file_name(name);
        }
    }
    dialog
}

#[tauri::command]
pub(crate) fn open_files(window: Window, language: Option<String>) -> OpenDialogResult {
    let english = is_english(language.as_deref());
    let paths = FileDialog::new()
        .set_parent(&window)
        .add_filter(
            if english {
                "All supported files"
            } else {
                "所有支持的文件"
            },
            &[
                "moonsprite",
                "ase",
                "aseprite",
                "psd",
                "png",
                "jpg",
                "jpeg",
                "webp",
                "bmp",
                "gif",
            ],
        )
        .add_filter("Aseprite files", &["ase", "aseprite"])
        .add_filter("Photoshop files", &["psd"])
        .add_filter(
            if english {
                "MoonSprite project"
            } else {
                "MoonSprite 工程"
            },
            &["moonsprite"],
        )
        .add_filter(
            if english { "Images" } else { "图片" },
            &["png", "jpg", "jpeg", "webp", "bmp", "gif"],
        )
        .pick_files();
    let file_paths = paths
        .unwrap_or_default()
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>();
    OpenDialogResult {
        canceled: file_paths.is_empty(),
        file_paths,
    }
}

#[tauri::command]
pub(crate) fn open_brush_images(window: Window, language: Option<String>) -> OpenDialogResult {
    let paths = FileDialog::new()
        .set_parent(&window)
        .add_filter(
            if is_english(language.as_deref()) {
                "Brush images"
            } else {
                "笔刷图片"
            },
            &["png", "jpg", "jpeg", "webp", "bmp", "gif"],
        )
        .pick_files();
    let file_paths = paths
        .unwrap_or_default()
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>();
    OpenDialogResult {
        canceled: file_paths.is_empty(),
        file_paths,
    }
}

#[tauri::command]
pub(crate) fn save_project(
    window: Window,
    default_path: Option<String>,
    format: Option<String>,
    language: Option<String>,
) -> SaveDialogResult {
    let has_explicit_directory = has_explicit_directory(default_path.as_deref());
    let mut dialog = file_dialog(default_path.as_deref(), &window);
    if !has_explicit_directory {
        if let Ok(directory) = gallery_dir() {
            dialog = dialog.set_directory(directory);
        }
    }
    let (label, extensions) = project_save_filter(format.as_deref(), language.as_deref());
    let path = dialog.add_filter(label, &extensions).save_file();
    SaveDialogResult {
        canceled: path.is_none(),
        file_path: path.map(|value| value.to_string_lossy().to_string()),
    }
}

#[tauri::command]
pub(crate) fn export_image(
    window: Window,
    default_path: Option<String>,
    format: String,
    language: Option<String>,
) -> SaveDialogResult {
    let has_explicit_directory = has_explicit_directory(default_path.as_deref());
    let (label, extensions) = image_export_filter(&format, language.as_deref());
    let mut dialog = file_dialog(default_path.as_deref(), &window);
    if !has_explicit_directory {
        if let Ok(directory) = export_directory() {
            dialog = dialog.set_directory(directory);
        }
    }
    let path = dialog.add_filter(label, &extensions).save_file();
    SaveDialogResult {
        canceled: path.is_none(),
        file_path: path.map(|value| value.to_string_lossy().to_string()),
    }
}

#[tauri::command]
pub(crate) fn save_palette_image(
    window: Window,
    default_path: Option<String>,
    language: Option<String>,
) -> SaveDialogResult {
    let has_explicit_directory = has_explicit_directory(default_path.as_deref());
    let mut dialog = file_dialog(default_path.as_deref(), &window);
    if !has_explicit_directory {
        if let Ok(directory) = export_directory() {
            dialog = dialog.set_directory(directory);
        }
    }
    let path = dialog
        .add_filter(
            if is_english(language.as_deref()) {
                "PNG palette image"
            } else {
                "PNG 色板图像"
            },
            &["png"],
        )
        .save_file();
    SaveDialogResult {
        canceled: path.is_none(),
        file_path: path.map(|value| value.to_string_lossy().to_string()),
    }
}

#[tauri::command]
pub(crate) fn default_file_directories() -> Result<DefaultFileDirectories, String> {
    Ok(DefaultFileDirectories {
        save_directory: gallery_dir()?.to_string_lossy().to_string(),
        export_directory: export_directory()?.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub(crate) fn choose_directory(
    window: Window,
    default_path: Option<String>,
) -> DirectoryDialogResult {
    let mut dialog = FileDialog::new().set_parent(&window);
    if let Some(value) = default_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        let path = PathBuf::from(value);
        if path.is_dir() {
            dialog = dialog.set_directory(path);
        } else if let Some(parent) = path.parent().filter(|parent| parent.is_dir()) {
            dialog = dialog.set_directory(parent);
        }
    }
    let path = dialog.pick_folder();
    DirectoryDialogResult {
        canceled: path.is_none(),
        directory_path: path.map(|value| value.to_string_lossy().to_string()),
    }
}

#[tauri::command]
pub(crate) fn save_shortcut_file(
    window: Window,
    default_path: Option<String>,
    language: Option<String>,
) -> SaveDialogResult {
    let path = file_dialog(default_path.as_deref(), &window)
        .add_filter(
            if is_english(language.as_deref()) {
                "MoonSprite shortcut settings"
            } else {
                "MoonSprite 快捷键设置"
            },
            JSON,
        )
        .save_file();
    SaveDialogResult {
        canceled: path.is_none(),
        file_path: path.map(|value| value.to_string_lossy().to_string()),
    }
}

#[tauri::command]
pub(crate) fn save_theme_file(
    window: Window,
    default_path: Option<String>,
    language: Option<String>,
) -> SaveDialogResult {
    let path = file_dialog(default_path.as_deref(), &window)
        .add_filter(
            if is_english(language.as_deref()) {
                "MoonSprite theme"
            } else {
                "MoonSprite 主题"
            },
            JSON,
        )
        .save_file();
    SaveDialogResult {
        canceled: path.is_none(),
        file_path: path.map(|value| value.to_string_lossy().to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::{has_explicit_directory, image_export_filter, project_save_filter};

    #[test]
    fn detects_when_a_dialog_path_already_contains_a_directory() {
        assert!(!has_explicit_directory(Some("sprite.png")));
        assert!(has_explicit_directory(Some("D:/exports/sprite.png")));
        assert!(has_explicit_directory(Some("D:\\exports\\sprite.png")));
    }

    #[test]
    fn project_save_filters_keep_moonsprite_and_aseprite_distinct() {
        assert_eq!(
            project_save_filter(None, None),
            ("MoonSprite 工程", &["moonsprite"][..])
        );
        assert_eq!(
            project_save_filter(Some("ase"), None),
            ("Aseprite 工程 (.ase)", &["ase"][..])
        );
        assert_eq!(
            project_save_filter(Some("aseprite"), None),
            ("Aseprite 工程 (.aseprite)", &["aseprite"][..])
        );
        assert_eq!(
            project_save_filter(Some("psd"), None),
            ("Photoshop 工程", &["psd"][..])
        );
    }

    #[test]
    fn image_export_filter_supports_project_and_image_exports() {
        assert_eq!(image_export_filter("svg", None), ("SVG 图片", &["svg"][..]));
        assert_eq!(image_export_filter("gif", None), ("GIF 动画", &["gif"][..]));
        assert_eq!(
            image_export_filter("psd", None),
            ("Photoshop 工程", &["psd"][..])
        );
        assert_eq!(
            image_export_filter("aseprite", None),
            ("Aseprite 工程", &["ase", "aseprite"][..])
        );
    }

    #[test]
    fn dialog_filters_follow_the_selected_english_locale() {
        assert_eq!(
            project_save_filter(None, Some("en-US")),
            ("MoonSprite project", &["moonsprite"][..])
        );
        assert_eq!(
            project_save_filter(Some("aseprite"), Some("en-US")),
            ("Aseprite project (.aseprite)", &["aseprite"][..])
        );
        assert_eq!(
            project_save_filter(Some("psd"), Some("en-US")),
            ("Photoshop project", &["psd"][..])
        );
        assert_eq!(
            image_export_filter("svg", Some("en-US")),
            ("SVG image", &["svg"][..])
        );
        assert_eq!(
            image_export_filter("psd", Some("en-US")),
            ("Photoshop project", &["psd"][..])
        );
    }
}
