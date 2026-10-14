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
const ICO: &[&str] = &["ico"];
const ASE: &[&str] = &["ase"];
const ASEPRITE: &[&str] = &["aseprite"];
const ASE_EXPORT: &[&str] = &["ase", "aseprite"];
const SVG: &[&str] = &["svg"];
const GIF: &[&str] = &["gif"];
const BMP: &[&str] = &["bmp"];
const PSD: &[&str] = &["psd"];
const MP4: &[&str] = &["mp4"];
const WEBM: &[&str] = &["webm"];
const JSON: &[&str] = &["json"];

#[path = "platform_dialogs_localization.rs"]
mod localization;
use localization::dialog_label;

pub fn project_save_filter(format: Option<&str>, language: Option<&str>) -> DialogFilter {
    let (key, extensions) = match format {
        Some("png") => ("PNG image", PNG),
        Some("jpeg") => ("JPEG image", JPEG),
        Some("webp") => ("WebP image", WEBP),
        Some("svg") => ("SVG image", SVG),
        Some("ico") => ("ICO icon", ICO),
        Some("gif") => ("GIF animation", GIF),
        Some("bmp") => ("BMP image", BMP),
        Some("psd") => ("Photoshop project", PSD),
        Some("ase") => ("Aseprite project (.ase)", ASE),
        Some("aseprite") => ("Aseprite project (.aseprite)", ASEPRITE),
        _ => ("MoonSprite project", MOONSPRITE),
    };
    (dialog_label(language, key), extensions)
}

pub fn image_export_filter(format: &str, language: Option<&str>) -> DialogFilter {
    let (key, extensions) = match format {
        "png" => ("PNG image", PNG),
        "jpeg" => ("JPEG image", JPEG),
        "webp" => ("WebP image", WEBP),
        "svg" => ("SVG image", SVG),
        "ico" => ("ICO icon", ICO),
        "gif" => ("GIF animation", GIF),
        "bmp" => ("BMP image", BMP),
        "psd" => ("Photoshop project", PSD),
        "aseprite" => ("Aseprite project", ASE_EXPORT),
        "mp4" => ("MP4 video", MP4),
        "webm" => ("WebM video", WEBM),
        _ => ("PNG image", PNG),
    };
    (dialog_label(language, key), extensions)
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
    let paths = FileDialog::new()
        .set_parent(&window)
        .add_filter(
            dialog_label(language.as_deref(), "All supported files"),
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
        .add_filter(
            dialog_label(language.as_deref(), "Aseprite files"),
            &["ase", "aseprite"],
        )
        .add_filter(
            dialog_label(language.as_deref(), "Photoshop files"),
            &["psd"],
        )
        .add_filter(
            dialog_label(language.as_deref(), "MoonSprite project"),
            &["moonsprite"],
        )
        .add_filter(
            dialog_label(language.as_deref(), "Images"),
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
            dialog_label(language.as_deref(), "Brush images"),
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
    let path = dialog
        .add_filter(label, &extensions)
        .add_filter(dialog_label(language.as_deref(), "All files"), &["*"])
        .save_file();
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
    let path = dialog
        .add_filter(label, &extensions)
        .add_filter(dialog_label(language.as_deref(), "All files"), &["*"])
        .save_file();
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
            dialog_label(language.as_deref(), "PNG palette image"),
            &["png"],
        )
        .add_filter(dialog_label(language.as_deref(), "All files"), &["*"])
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
            dialog_label(language.as_deref(), "MoonSprite shortcut settings"),
            JSON,
        )
        .add_filter(dialog_label(language.as_deref(), "All files"), &["*"])
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
        .add_filter(dialog_label(language.as_deref(), "MoonSprite theme"), JSON)
        .add_filter(dialog_label(language.as_deref(), "All files"), &["*"])
        .save_file();
    SaveDialogResult {
        canceled: path.is_none(),
        file_path: path.map(|value| value.to_string_lossy().to_string()),
    }
}

#[tauri::command]
pub(crate) fn save_usage_statistics_file(
    window: Window,
    default_path: Option<String>,
    language: Option<String>,
) -> SaveDialogResult {
    let path = file_dialog(default_path.as_deref(), &window)
        .add_filter(
            dialog_label(language.as_deref(), "MoonSprite usage statistics"),
            JSON,
        )
        .add_filter(dialog_label(language.as_deref(), "All files"), &["*"])
        .save_file();
    SaveDialogResult {
        canceled: path.is_none(),
        file_path: path.map(|value| value.to_string_lossy().to_string()),
    }
}

/// Generic extension export: the user always chooses the destination.
#[tauri::command]
pub(crate) fn save_extension_data_file(
    window: Window,
    file_name: String,
    language: Option<String>,
) -> Result<SaveDialogResult, String> {
    if file_name.is_empty()
        || file_name.len() > 240
        || file_name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
    {
        return Err(dialog_label(language.as_deref(), "Invalid export file name.").into());
    }
    let extension = file_name
        .rsplit('.')
        .next()
        .filter(|value| {
            !value.is_empty()
                && value.len() <= 16
                && value.chars().all(|c| c.is_ascii_alphanumeric())
        })
        .ok_or_else(|| {
            dialog_label(language.as_deref(), "Invalid export file extension.").to_string()
        })?;
    let path = file_dialog(Some(&file_name), &window)
        .add_filter(
            dialog_label(language.as_deref(), "Extension data"),
            &[extension],
        )
        .add_filter(dialog_label(language.as_deref(), "All files"), &["*"])
        .save_file();
    Ok(SaveDialogResult {
        canceled: path.is_none(),
        file_path: path.map(|value| value.to_string_lossy().to_string()),
    })
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
        assert_eq!(
            project_save_filter(Some("ico"), None),
            ("ICO 图标", &["ico"][..])
        );
        assert_eq!(
            project_save_filter(Some("svg"), None),
            ("SVG 图片", &["svg"][..])
        );
    }

    #[test]
    fn image_export_filter_supports_project_and_image_exports() {
        assert_eq!(image_export_filter("svg", None), ("SVG 图片", &["svg"][..]));
        assert_eq!(image_export_filter("gif", None), ("GIF 动画", &["gif"][..]));
        assert_eq!(image_export_filter("ico", None), ("ICO 图标", &["ico"][..]));
        assert_eq!(image_export_filter("bmp", None), ("BMP 图片", &["bmp"][..]));
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
        assert_eq!(
            image_export_filter("ico", Some("en-US")),
            ("ICO icon", &["ico"][..])
        );
    }
    #[test]
    fn translated_filters_preserve_extensions_and_fallbacks() {
        for locale in [
            "zh-CN", "en-US", "ja-JP", "ko-KR", "es-ES", "fr-FR", "de-DE", "pt-BR", "ru-RU",
        ] {
            for format in [
                "png", "jpeg", "webp", "svg", "ico", "gif", "bmp", "psd", "ase", "aseprite",
                "unknown",
            ] {
                assert_eq!(
                    project_save_filter(Some(format), Some(locale)).1,
                    project_save_filter(Some(format), None).1
                );
                assert_eq!(
                    image_export_filter(format, Some(locale)).1,
                    image_export_filter(format, None).1
                );
            }
            for format in ["mp4", "webm"] {
                assert_eq!(
                    image_export_filter(format, Some(locale)).1,
                    image_export_filter(format, None).1
                );
            }
        }
        assert_eq!(
            project_save_filter(None, Some("invalid")),
            project_save_filter(None, None)
        );
    }
}
