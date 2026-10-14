use rfd::FileDialog;
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::platform_paths::{ensure_executable_subdirectory, executable_directory};
use crate::platform_storage::atomic_write;

const FONT_EXTENSIONS: &[&str] = &["ttf", "ttc", "otf", "woff", "woff2"];
const BUILTIN_FONT_SEED_VERSION: &str = "2";
const BUILTIN_FONT_SEED_MARKER: &str = ".moonsprite-builtin-fonts";
const RETIRED_BUILTIN_FONTS: &[&str] = &["moonsprite-builtin-press-start-2p-regular.ttf"];
const BUILTIN_FONTS: &[(&str, &[u8])] = &[
    (
        "moonsprite-builtin-fusion-pixel-10px-prop-zh-hans.woff2",
        include_bytes!(
            "../resources/fonts/moonsprite-builtin-fusion-pixel-10px-prop-zh-hans.woff2"
        ),
    ),
    (
        "moonsprite-builtin-silkscreen-regular.ttf",
        include_bytes!("../resources/fonts/moonsprite-builtin-silkscreen-regular.ttf"),
    ),
    (
        "moonsprite-builtin-tiny5-regular.ttf",
        include_bytes!("../resources/fonts/moonsprite-builtin-tiny5-regular.ttf"),
    ),
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredFont {
    id: String,
    family: String,
    file_path: String,
    imported: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FontListing {
    directory_path: String,
    fonts: Vec<StoredFont>,
}

fn font_dir() -> Result<PathBuf, String> {
    let directory = ensure_executable_subdirectory("Font", "字体")?;
    let legacy = executable_directory()?.join("fonts");
    if legacy.is_dir() {
        for source in fs::read_dir(&legacy)
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| is_font_file(path))
        {
            let Some(name) = source.file_name() else {
                continue;
            };
            let destination = directory.join(name);
            if destination.exists() {
                continue;
            }
            if let Ok(bytes) = fs::read(&source) {
                let _ = atomic_write(&destination, &bytes);
            }
        }
    }
    seed_builtin_fonts(&directory)?;
    Ok(directory)
}

fn seed_builtin_fonts(directory: &Path) -> Result<(), String> {
    let marker = directory.join(BUILTIN_FONT_SEED_MARKER);
    let marker_version = fs::read_to_string(&marker).ok();
    if marker_version.as_deref() == Some(BUILTIN_FONT_SEED_VERSION)
        && BUILTIN_FONTS
            .iter()
            .all(|(name, _)| directory.join(name).is_file())
    {
        return Ok(());
    }
    for name in RETIRED_BUILTIN_FONTS {
        let path = directory.join(name);
        if path.is_file() {
            fs::remove_file(&path)
                .map_err(|error| format!("Unable to remove retired bundled font: {}", error))?;
        }
    }
    for (name, bytes) in BUILTIN_FONTS {
        let destination = directory.join(name);
        if !destination.exists() {
            atomic_write(&destination, bytes)?;
        }
    }
    atomic_write(&marker, BUILTIN_FONT_SEED_VERSION.as_bytes())
}

fn is_font_file(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| {
                FONT_EXTENSIONS
                    .iter()
                    .any(|extension| value.eq_ignore_ascii_case(extension))
            })
}

fn fallback_font_family(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("MoonSprite Font")
        .replace('_', " ")
        .replace('-', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn bundled_font_family(path: &Path) -> Option<&'static str> {
    match path.file_name()?.to_str()? {
        "moonsprite-builtin-fusion-pixel-10px-prop-zh-hans.woff2" => {
            Some("Fusion Pixel 10px Prop Zh_hans")
        }
        "moonsprite-builtin-silkscreen-regular.ttf" => Some("Silkscreen"),
        "moonsprite-builtin-tiny5-regular.ttf" => Some("Tiny5"),
        _ => None,
    }
}

fn font_family(path: &Path) -> String {
    if let Some(family) = bundled_font_family(path) {
        return family.to_string();
    }
    let bytes = fs::read(path).ok();
    let parsed = bytes.as_deref().and_then(|data| {
        let face_count = ttf_parser::fonts_in_collection(data).unwrap_or(1);
        (0..face_count).find_map(|index| {
            let face = ttf_parser::Face::parse(data, index).ok()?;
            face.names()
                .into_iter()
                .filter(|name| {
                    name.name_id == ttf_parser::name_id::TYPOGRAPHIC_FAMILY
                        || name.name_id == ttf_parser::name_id::FAMILY
                })
                .filter_map(|name| name.to_string())
                .map(|name| name.trim().to_string())
                .find(|name| !name.is_empty())
        })
    });
    parsed.unwrap_or_else(|| fallback_font_family(path))
}

fn stored_font(path: &Path, imported: bool) -> Result<StoredFont, String> {
    let id = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("字体文件名无效：{}", path.display()))?
        .to_string();
    Ok(StoredFont {
        id,
        family: font_family(path),
        file_path: path.to_string_lossy().to_string(),
        imported,
    })
}

fn font_dialog() -> FileDialog {
    FileDialog::new().add_filter("Font files", FONT_EXTENSIONS)
}

fn copy_font_into_library(source: &Path) -> Result<StoredFont, String> {
    if !is_font_file(source) {
        return Err("请选择 TTF、TTC、OTF、WOFF 或 WOFF2 字体文件。".to_string());
    }
    let directory = font_dir()?;
    let original_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("font.ttf");
    let mut destination = directory.join(original_name);
    let bytes = fs::read(source).map_err(|error| format!("无法读取字体：{error}"))?;
    if destination.exists() {
        if fs::read(&destination).ok().as_deref() == Some(bytes.as_slice()) {
            return stored_font(&destination, true);
        }
        let stem = source
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("font");
        let extension = source
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("ttf");
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_millis())
            .unwrap_or_default();
        destination = directory.join(format!("{stem}-{stamp}.{extension}"));
    }
    atomic_write(&destination, &bytes)?;
    stored_font(&destination, true)
}

#[cfg(target_os = "windows")]
fn windows_system_fonts() -> Result<Vec<StoredFont>, String> {
    use std::{
        ffi::OsString,
        os::windows::ffi::OsStringExt,
        ptr::{null, null_mut},
    };
    use windows_sys::Win32::{
        Foundation::{ERROR_MORE_DATA, ERROR_NO_MORE_ITEMS, ERROR_SUCCESS},
        System::Registry::{
            RegCloseKey, RegEnumValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE,
            KEY_READ, REG_EXPAND_SZ, REG_SZ,
        },
    };

    let mut fonts = Vec::new();
    let windows_fonts = std::env::var_os("WINDIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("C:\\Windows"))
        .join("Fonts");
    let key_path = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"
        .encode_utf16()
        .chain(Some(0))
        .collect::<Vec<_>>();
    for root in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let mut key: HKEY = null_mut();
        let status = unsafe { RegOpenKeyExW(root, key_path.as_ptr(), 0, KEY_READ, &mut key) };
        if status != ERROR_SUCCESS {
            continue;
        }
        for index in 0_u32.. {
            let mut name = vec![0_u16; 512];
            let mut name_len = name.len() as u32;
            let mut data = vec![0_u16; 2048];
            let mut data_len = (data.len() * size_of::<u16>()) as u32;
            let mut kind = 0_u32;
            let status = unsafe {
                RegEnumValueW(
                    key,
                    index,
                    name.as_mut_ptr(),
                    &mut name_len,
                    null(),
                    &mut kind,
                    data.as_mut_ptr() as *mut u8,
                    &mut data_len,
                )
            };
            if status == ERROR_NO_MORE_ITEMS {
                break;
            }
            if status == ERROR_MORE_DATA {
                continue;
            }
            if status != ERROR_SUCCESS || !matches!(kind, REG_SZ | REG_EXPAND_SZ) {
                continue;
            }
            let family = OsString::from_wide(&name[..name_len as usize])
                .to_string_lossy()
                .trim()
                .trim_end_matches(" (TrueType)")
                .trim_end_matches(" (OpenType)")
                .to_string();
            data.truncate(data_len as usize / size_of::<u16>());
            let mut file_name = OsString::from_wide(&data)
                .to_string_lossy()
                .trim_end_matches('\0')
                .to_string();
            if kind == REG_EXPAND_SZ {
                if let Some(windows) = std::env::var_os("WINDIR") {
                    file_name = file_name.replace("%WINDIR%", &windows.to_string_lossy())
                }
            }
            let candidate = PathBuf::from(&file_name);
            let path = if candidate.is_absolute() {
                candidate
            } else {
                windows_fonts.join(candidate)
            };
            if family.is_empty() || !is_font_file(&path) {
                continue;
            }
            fonts.push(StoredFont {
                id: format!("system:{family}"),
                family,
                file_path: path.to_string_lossy().to_string(),
                imported: false,
            });
        }
        unsafe { RegCloseKey(key) };
    }
    fonts.sort_by(|left, right| left.family.to_lowercase().cmp(&right.family.to_lowercase()));
    fonts.dedup_by(|left, right| left.family.eq_ignore_ascii_case(&right.family));
    Ok(fonts)
}

#[cfg(not(target_os = "windows"))]
fn windows_system_fonts() -> Result<Vec<StoredFont>, String> {
    Ok(Vec::new())
}

#[tauri::command]
pub(crate) fn list_fonts() -> Result<FontListing, String> {
    let directory = font_dir()?;
    let mut fonts = fs::read_dir(&directory)
        .map_err(|error| format!("无法读取字体文件夹：{error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| is_font_file(path))
        .filter_map(|path| stored_font(&path, true).ok())
        .collect::<Vec<_>>();
    fonts.sort_by(|left, right| {
        left.family
            .cmp(&right.family)
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(FontListing {
        directory_path: directory.to_string_lossy().to_string(),
        fonts,
    })
}

#[tauri::command]
pub(crate) fn list_system_fonts() -> Result<Vec<StoredFont>, String> {
    windows_system_fonts()
}

#[tauri::command]
pub(crate) fn import_font() -> Result<Option<StoredFont>, String> {
    let Some(source) = font_dialog().pick_file() else {
        return Ok(None);
    };
    copy_font_into_library(&source).map(Some)
}

#[tauri::command]
pub(crate) fn import_system_font(id: String) -> Result<StoredFont, String> {
    let font = windows_system_fonts()?
        .into_iter()
        .find(|font| font.id == id)
        .ok_or_else(|| "找不到选择的系统字体。".to_string())?;
    copy_font_into_library(Path::new(&font.file_path))
}

fn safe_font_id(id: &str) -> Result<&str, String> {
    if id.is_empty()
        || id.contains(['/', '\\'])
        || id.contains("..")
        || !FONT_EXTENSIONS
            .iter()
            .any(|extension| id.to_ascii_lowercase().ends_with(&format!(".{extension}")))
    {
        return Err("无效的字体文件 ID。".to_string());
    }
    Ok(id)
}

#[tauri::command]
pub(crate) fn delete_font(id: String) -> Result<(), String> {
    let path = font_dir()?.join(safe_font_id(&id)?);
    if !path.exists() {
        return Err("字体文件不存在。".to_string());
    }
    fs::remove_file(path).map_err(|error| format!("无法删除字体：{error}"))
}

#[cfg(test)]
mod tests {
    use super::{
        bundled_font_family, fallback_font_family, seed_builtin_fonts, BUILTIN_FONTS,
        BUILTIN_FONT_SEED_MARKER, BUILTIN_FONT_SEED_VERSION, RETIRED_BUILTIN_FONTS,
    };
    use std::{
        fs,
        path::Path,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn derives_a_readable_family_alias_from_the_file_name() {
        assert_eq!(
            fallback_font_family(Path::new("C:/Fonts/Moon_Pixel-Bold.ttf")),
            "Moon Pixel Bold"
        );
    }

    #[test]
    fn exposes_stable_families_for_bundled_fonts() {
        assert_eq!(
            bundled_font_family(Path::new(BUILTIN_FONTS[0].0)),
            Some("Fusion Pixel 10px Prop Zh_hans")
        );
        assert_eq!(
            bundled_font_family(Path::new(BUILTIN_FONTS[1].0)),
            Some("Silkscreen")
        );
    }

    #[test]
    fn seeds_bundled_fonts_and_restores_missing_builtins() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("moonsprite-font-seed-{stamp}"));
        fs::create_dir_all(&directory).unwrap();

        seed_builtin_fonts(&directory).unwrap();
        assert!(BUILTIN_FONTS
            .iter()
            .all(|(name, _)| directory.join(name).is_file()));
        assert_eq!(
            fs::read_to_string(directory.join(BUILTIN_FONT_SEED_MARKER)).unwrap(),
            BUILTIN_FONT_SEED_VERSION
        );

        let removed = directory.join(BUILTIN_FONTS[0].0);
        fs::remove_file(&removed).unwrap();
        seed_builtin_fonts(&directory).unwrap();
        assert!(removed.is_file());

        let retired = directory.join(RETIRED_BUILTIN_FONTS[0]);
        fs::write(&retired, b"retired").unwrap();
        fs::write(directory.join(BUILTIN_FONT_SEED_MARKER), b"1").unwrap();
        seed_builtin_fonts(&directory).unwrap();
        assert!(!retired.exists());

        let _ = fs::remove_dir_all(directory);
    }
}
