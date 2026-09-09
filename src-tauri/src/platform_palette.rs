use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::platform_paths::ensure_executable_subdirectory;
use crate::platform_storage::atomic_write;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaletteColor {
    r: u8,
    g: u8,
    b: u8,
    a: u8,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaletteDiskFile {
    schema_version: u32,
    id: String,
    name: String,
    colors: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    columns: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    slots: Option<Vec<Option<usize>>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredPalette {
    id: String,
    name: String,
    file_path: String,
    colors: Vec<PaletteColor>,
    built_in: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    columns: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    slots: Option<Vec<Option<usize>>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaletteListing {
    directory_path: String,
    palettes: Vec<StoredPalette>,
}

const DEFAULT_PALETTES: &[(&str, &str)] = &[
    (
        "palette-1787134251358577400.palette.json",
        include_str!("../../palettes/palette-1787134251358577400.palette.json"),
    ),
    (
        "palette-1787825099718557000.palette.json",
        include_str!("../../palettes/palette-1787825099718557000.palette.json"),
    ),
    (
        "palette-1787826522645068600.palette.json",
        include_str!("../../palettes/palette-1787826522645068600.palette.json"),
    ),
    (
        "pixel-core-32.palette.json",
        include_str!("../../palettes/pixel-core-32.palette.json"),
    ),
    (
        "pico-8-16.palette.json",
        include_str!("../../palettes/pico-8-16.palette.json"),
    ),
    (
        "game-boy-4.palette.json",
        include_str!("../../palettes/game-boy-4.palette.json"),
    ),
    (
        "nes-16.palette.json",
        include_str!("../../palettes/nes-16.palette.json"),
    ),
    (
        "warm-autumn-24.palette.json",
        include_str!("../../palettes/warm-autumn-24.palette.json"),
    ),
    (
        "ocean-depths-24.palette.json",
        include_str!("../../palettes/ocean-depths-24.palette.json"),
    ),
    (
        "forest-trail-24.palette.json",
        include_str!("../../palettes/forest-trail-24.palette.json"),
    ),
    (
        "neon-night-24.palette.json",
        include_str!("../../palettes/neon-night-24.palette.json"),
    ),
    (
        "candy-pop-24.palette.json",
        include_str!("../../palettes/candy-pop-24.palette.json"),
    ),
    (
        "paper-ink-16.palette.json",
        include_str!("../../palettes/paper-ink-16.palette.json"),
    ),
];

const LEGACY_DEFAULT_PALETTE_FILES: &[&str] = &[
    "moonlight-12.palette.json",
    "tiny-console-16.palette.json",
    "forest-dusk-12.palette.json",
    "sunset-12.palette.json",
    "mono-10.palette.json",
    "universal-spectrum-48.palette.json",
    "soft-spectrum-48.palette.json",
    "vivid-spectrum-48.palette.json",
    "deep-spectrum-48.palette.json",
];

fn chrono_like_timestamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
}

fn palette_dir() -> Result<PathBuf, String> {
    let directory = ensure_executable_subdirectory("palettes", "色板")?;
    // Built-in palettes are embedded resources. Remove copies created by older builds so
    // the user palette directory contains only user-owned files.
    for (file_name, _) in DEFAULT_PALETTES {
        let _ = fs::remove_file(directory.join(file_name));
    }
    for file_name in LEGACY_DEFAULT_PALETTE_FILES {
        let _ = fs::remove_file(directory.join(file_name));
    }
    Ok(directory)
}

fn parse_palette_color(value: &str) -> Result<PaletteColor, String> {
    let hex = value.strip_prefix('#').unwrap_or(value);
    if hex.len() != 6 && hex.len() != 8 {
        return Err(format!("无效的色板颜色：{value}"));
    }
    let number = u32::from_str_radix(hex, 16).map_err(|_| format!("无效的色板颜色：{value}"))?;
    let alpha = if hex.len() == 8 { number as u8 } else { 255 };
    let rgb = if hex.len() == 8 { number >> 8 } else { number };
    Ok(PaletteColor {
        r: (rgb >> 16) as u8,
        g: (rgb >> 8) as u8,
        b: rgb as u8,
        a: alpha,
    })
}

fn palette_color_hex(color: &PaletteColor) -> String {
    format!(
        "#{:02X}{:02X}{:02X}{:02X}",
        color.r, color.g, color.b, color.a
    )
}

fn valid_palette_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 96
        && id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
}

fn palette_slug(name: &str) -> String {
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
        format!("palette-{}", chrono_like_timestamp())
    } else {
        slug
    }
}

fn validate_palette_layout(
    schema_version: u32,
    color_count: usize,
    columns: Option<u32>,
    slots: Option<Vec<Option<usize>>>,
    source: &str,
) -> Result<(Option<u32>, Option<Vec<Option<usize>>>), String> {
    match schema_version {
        1 => {
            if columns.is_some() || slots.is_some() {
                return Err(format!("旧版色板不能包含槽位布局：{source}"));
            }
            Ok((None, None))
        }
        2 => {
            let columns = columns.ok_or_else(|| format!("色板缺少列数：{source}"))?;
            let slots = slots.ok_or_else(|| format!("色板缺少槽位：{source}"))?;
            if !(1..=256).contains(&columns) {
                return Err(format!("色板列数无效：{source}"));
            }
            if slots.len() > 1_048_576 || slots.len() % columns as usize != 0 {
                return Err(format!("色板槽位数量无效：{source}"));
            }
            let mut seen = vec![false; color_count];
            for color_index in slots.iter().flatten().copied() {
                if color_index >= color_count {
                    return Err(format!("色板槽位引用了不存在的颜色：{source}"));
                }
                if seen[color_index] {
                    return Err(format!("色板槽位重复引用颜色：{source}"));
                }
                seen[color_index] = true;
            }
            if seen.iter().any(|placed| !placed) {
                return Err(format!("色板槽位缺少颜色：{source}"));
            }
            Ok((Some(columns), Some(slots)))
        }
        version => Err(format!("不支持色板版本 {version}：{source}")),
    }
}

fn stored_palette_from_file(
    file: PaletteDiskFile,
    file_path: String,
    built_in: bool,
    source: &str,
) -> Result<StoredPalette, String> {
    let PaletteDiskFile {
        schema_version,
        id,
        name,
        colors: encoded_colors,
        columns,
        slots,
    } = file;
    if !valid_palette_id(&id) || name.trim().is_empty() {
        return Err(format!("色板信息无效：{source}"));
    }
    let (columns, slots) =
        validate_palette_layout(schema_version, encoded_colors.len(), columns, slots, source)?;
    let colors = encoded_colors
        .iter()
        .map(|color| parse_palette_color(color))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(StoredPalette {
        id,
        name,
        file_path,
        colors,
        built_in,
        columns,
        slots,
    })
}

fn read_palette(path: &Path) -> Result<StoredPalette, String> {
    let bytes =
        fs::read(path).map_err(|error| format!("无法读取色板 {}：{error}", path.display()))?;
    let file: PaletteDiskFile = serde_json::from_slice(&bytes)
        .map_err(|error| format!("色板文件损坏 {}：{error}", path.display()))?;
    stored_palette_from_file(
        file,
        path.to_string_lossy().to_string(),
        false,
        &path.display().to_string(),
    )
}

fn read_built_in_palette(contents: &str) -> Result<StoredPalette, String> {
    let file: PaletteDiskFile =
        serde_json::from_str(contents).map_err(|error| format!("内置色板资源损坏：{error}"))?;
    stored_palette_from_file(file, String::new(), true, "内置色板")
}

fn is_built_in_palette_id(id: &str) -> bool {
    DEFAULT_PALETTES
        .iter()
        .any(|(file_name, _)| file_name.strip_suffix(".palette.json") == Some(id))
}

#[tauri::command]
pub(crate) fn list_palettes() -> Result<PaletteListing, String> {
    let directory = palette_dir()?;
    let mut palettes = DEFAULT_PALETTES
        .iter()
        .map(|(_, contents)| read_built_in_palette(contents))
        .collect::<Result<Vec<_>, _>>()?;
    for entry in fs::read_dir(&directory).map_err(|error| format!("无法读取色板文件夹：{error}"))?
    {
        let path = entry
            .map_err(|error| format!("无法读取色板文件：{error}"))?
            .path();
        let is_palette = path
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value.ends_with(".palette.json"))
            .unwrap_or(false);
        if path.is_file() && is_palette {
            let palette = read_palette(&path)?;
            if !is_built_in_palette_id(&palette.id) {
                palettes.push(palette);
            }
        }
    }
    palettes.sort_by(|left, right| {
        right.built_in.cmp(&left.built_in).then_with(|| {
            left.name
                .cmp(&right.name)
                .then_with(|| left.id.cmp(&right.id))
        })
    });
    Ok(PaletteListing {
        directory_path: directory.to_string_lossy().to_string(),
        palettes,
    })
}

#[tauri::command]
pub(crate) fn save_palette(
    id: Option<String>,
    name: String,
    colors: Vec<PaletteColor>,
    columns: u32,
    slots: Vec<Option<usize>>,
) -> Result<StoredPalette, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("色板名称不能为空。".to_string());
    }
    if colors.is_empty() {
        return Err("色板至少需要一种颜色。".to_string());
    }
    if colors.len() > 65_536 {
        return Err("单个色板最多保存 65536 种颜色。".to_string());
    }
    let (columns, slots) =
        validate_palette_layout(2, colors.len(), Some(columns), Some(slots), "保存的色板")?;
    let directory = palette_dir()?;
    let palette_id = match id {
        Some(value) if valid_palette_id(&value) && !is_built_in_palette_id(&value) => value,
        Some(_) => return Err("色板 ID 无效。".to_string()),
        None => {
            let base = palette_slug(name);
            let mut candidate = base.clone();
            let mut suffix = 2;
            while is_built_in_palette_id(&candidate)
                || directory.join(format!("{candidate}.palette.json")).exists()
            {
                candidate = format!("{base}-{suffix}");
                suffix += 1;
            }
            candidate
        }
    };
    let path = directory.join(format!("{palette_id}.palette.json"));
    let file = PaletteDiskFile {
        schema_version: 2,
        id: palette_id,
        name: name.to_string(),
        colors: colors.iter().map(palette_color_hex).collect(),
        columns,
        slots,
    };
    let encoded = serde_json::to_vec_pretty(&file).map_err(|error| error.to_string())?;
    atomic_write(&path, &encoded)?;
    read_palette(&path)
}

#[tauri::command]
pub(crate) fn delete_palette(id: String) -> Result<(), String> {
    if !valid_palette_id(&id) || is_built_in_palette_id(&id) {
        return Err("内置色板不能删除。".to_string());
    }
    let path = palette_dir()?.join(format!("{id}.palette.json"));
    if !path.exists() {
        return Err("色板文件不存在。".to_string());
    }
    fs::remove_file(path).map_err(|error| format!("无法删除色板：{error}"))
}

#[tauri::command]
pub(crate) fn open_palette_folder() -> Result<(), String> {
    let directory = palette_dir()?;
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer.exe");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(&directory)
        .spawn()
        .map_err(|error| format!("无法打开色板文件夹：{error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn palette_file(schema_version: u32) -> PaletteDiskFile {
        PaletteDiskFile {
            schema_version,
            id: "test-palette".to_string(),
            name: "Test Palette".to_string(),
            colors: vec!["#112233FF".to_string(), "#445566FF".to_string()],
            columns: None,
            slots: None,
        }
    }

    #[test]
    fn reads_legacy_compact_palette_without_layout() {
        let stored = stored_palette_from_file(palette_file(1), String::new(), false, "test")
            .expect("legacy palette should load");
        assert_eq!(stored.colors.len(), 2);
        assert_eq!(stored.columns, None);
        assert_eq!(stored.slots, None);
    }

    #[test]
    fn reads_positioned_palette_layout() {
        let mut file = palette_file(2);
        file.columns = Some(4);
        file.slots = Some(vec![Some(0), None, None, Some(1)]);
        let encoded = serde_json::to_string(&file).expect("palette should serialize");
        let decoded: PaletteDiskFile =
            serde_json::from_str(&encoded).expect("palette should parse");
        let stored = stored_palette_from_file(decoded, String::new(), false, "test")
            .expect("positioned palette should load");
        assert_eq!(stored.columns, Some(4));
        assert_eq!(stored.slots, Some(vec![Some(0), None, None, Some(1)]));
    }

    #[test]
    fn rejects_invalid_or_duplicate_slot_indexes() {
        let mut missing = palette_file(2);
        missing.columns = Some(2);
        missing.slots = Some(vec![Some(0), Some(2)]);
        assert!(stored_palette_from_file(missing, String::new(), false, "test").is_err());

        let mut duplicate = palette_file(2);
        duplicate.columns = Some(2);
        duplicate.slots = Some(vec![Some(0), Some(0)]);
        assert!(stored_palette_from_file(duplicate, String::new(), false, "test").is_err());
    }

    #[test]
    fn rejects_unknown_palette_schema() {
        assert!(stored_palette_from_file(palette_file(99), String::new(), false, "test").is_err());
    }

}
