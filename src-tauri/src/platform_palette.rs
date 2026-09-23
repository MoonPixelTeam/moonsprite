use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    io::Cursor,
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

const IMPORTED_PALETTE_COLUMNS: u32 = 16;
const MAX_IMPORTED_PALETTE_COLORS: usize = 65_536;
const MAX_IMPORTED_IMAGE_PIXELS: u64 = 16_777_216;
const IMPORTABLE_PALETTE_EXTENSIONS: &[&str] = &[
    "json", "gpl", "pal", "act", "aco", "ase", "txt", "hex", "csv", "png", "jpg", "jpeg", "webp",
    "bmp", "gif", "ico",
];

#[derive(Debug)]
struct ImportedPalette {
    name: String,
    colors: Vec<PaletteColor>,
    columns: u32,
    slots: Vec<Option<usize>>,
}

fn imported_palette_name(path: &Path) -> String {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Imported Palette");
    let suffix = ".palette.json";
    let base = if file_name.to_ascii_lowercase().ends_with(suffix) {
        &file_name[..file_name.len().saturating_sub(suffix.len())]
    } else {
        path.file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or(file_name)
    };
    let trimmed = base.trim();
    if trimmed.is_empty() {
        "Imported Palette".to_string()
    } else {
        trimmed.to_string()
    }
}

fn is_native_palette_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase().ends_with(".palette.json"))
        .unwrap_or(false)
}

fn has_importable_palette_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|extension| {
            IMPORTABLE_PALETTE_EXTENSIONS
                .iter()
                .any(|supported| extension.eq_ignore_ascii_case(supported))
        })
        .unwrap_or(false)
}

fn is_importable_palette_path(path: &Path) -> bool {
    path.is_file() && has_importable_palette_extension(path)
}

fn external_palette_id(path: &Path) -> String {
    // FNV-1a keeps the id stable across restarts without exposing a path in the
    // renderer. It also lets Save to Current Palette write a native copy.
    let mut hash = 0xcbf29ce484222325u64;
    for byte in path.to_string_lossy().as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("external-{hash:016x}")
}

fn linear_imported_palette(
    name: String,
    colors: Vec<PaletteColor>,
) -> Result<ImportedPalette, String> {
    if colors.is_empty() {
        return Err("色板中没有可导入的颜色。".to_string());
    }
    if colors.len() > MAX_IMPORTED_PALETTE_COLORS {
        return Err(format!(
            "单个色板最多包含 {MAX_IMPORTED_PALETTE_COLORS} 种颜色。"
        ));
    }
    let columns = (colors.len() as u32).min(IMPORTED_PALETTE_COLUMNS).max(1);
    let slots = (0..colors.len()).map(Some).collect();
    Ok(ImportedPalette {
        name,
        colors,
        columns,
        slots,
    })
}

fn native_imported_palette(stored: StoredPalette) -> Result<ImportedPalette, String> {
    if stored.colors.is_empty() {
        return Err("色板中没有可导入的颜色。".to_string());
    }
    if stored.colors.len() > MAX_IMPORTED_PALETTE_COLORS {
        return Err(format!(
            "单个色板最多包含 {MAX_IMPORTED_PALETTE_COLORS} 种颜色。"
        ));
    }
    let columns = stored.columns.unwrap_or_else(|| {
        (stored.colors.len() as u32)
            .min(IMPORTED_PALETTE_COLUMNS)
            .max(1)
    });
    let slots = stored
        .slots
        .unwrap_or_else(|| (0..stored.colors.len()).map(Some).collect());
    Ok(ImportedPalette {
        name: stored.name,
        colors: stored.colors,
        columns,
        slots,
    })
}

fn json_color(value: &serde_json::Value) -> Option<PaletteColor> {
    if let Some(hex) = value.as_str() {
        return parse_palette_color(hex).ok();
    }
    let values = if let Some(array) = value.as_array() {
        array.iter().collect::<Vec<_>>()
    } else {
        let object = value.as_object()?;
        ["r", "g", "b", "a"]
            .iter()
            .filter_map(|key| {
                object
                    .get(*key)
                    .or_else(|| object.get(&key.to_ascii_uppercase()))
            })
            .collect::<Vec<_>>()
    };
    if values.len() < 3 {
        return None;
    }
    let channels = values
        .iter()
        .take(4)
        .map(|entry| entry.as_f64())
        .collect::<Option<Vec<_>>>()?;
    let rgb_normalized = channels[..3]
        .iter()
        .all(|value| (0.0..=1.0).contains(value));
    let channel = |value: f64, normalized: bool| -> Option<u8> {
        let scaled = if normalized { value * 255.0 } else { value };
        if !scaled.is_finite() || !(0.0..=255.0).contains(&scaled) {
            return None;
        }
        Some(scaled.round() as u8)
    };
    Some(PaletteColor {
        r: channel(channels[0], rgb_normalized)?,
        g: channel(channels[1], rgb_normalized)?,
        b: channel(channels[2], rgb_normalized)?,
        a: channels
            .get(3)
            .and_then(|value| channel(*value, (0.0..=1.0).contains(value)))
            .unwrap_or(255),
    })
}

fn json_imported_palette(
    bytes: &[u8],
    fallback_name: String,
    source: &str,
) -> Result<ImportedPalette, String> {
    if let Ok(file) = serde_json::from_slice::<PaletteDiskFile>(bytes) {
        return stored_palette_from_file(file, String::new(), false, source)
            .and_then(native_imported_palette);
    }
    let value: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|error| format!("无法读取 JSON 色板 {source}：{error}"))?;
    let entries = value
        .as_array()
        .or_else(|| {
            value.as_object().and_then(|object| {
                ["colors", "palette", "swatches"]
                    .iter()
                    .find_map(|key| object.get(*key).and_then(serde_json::Value::as_array))
            })
        })
        .ok_or_else(|| format!("JSON 色板缺少颜色列表：{source}"))?;
    let colors = entries.iter().filter_map(json_color).collect();
    linear_imported_palette(fallback_name, colors)
}

fn text_imported_colors(bytes: &[u8]) -> Vec<PaletteColor> {
    let text = String::from_utf8_lossy(bytes);
    let mut colors = Vec::new();
    for raw_line in text.lines() {
        let line = raw_line.trim().trim_start_matches('\u{feff}');
        if line.is_empty()
            || line.starts_with('#')
            || line.starts_with("//")
            || line.starts_with(";")
        {
            continue;
        }
        if let Some(color) =
            parse_palette_color(line.split_whitespace().next().unwrap_or_default()).ok()
        {
            colors.push(color);
            continue;
        }
        let values = line
            .split(|character: char| {
                character.is_whitespace() || matches!(character, ',' | ';' | '(' | ')')
            })
            .filter(|value| !value.is_empty())
            .filter_map(|value| value.parse::<u16>().ok())
            .collect::<Vec<_>>();
        if values.len() >= 3 && values[..3].iter().all(|value| *value <= u8::MAX as u16) {
            colors.push(PaletteColor {
                r: values[0] as u8,
                g: values[1] as u8,
                b: values[2] as u8,
                a: values
                    .get(3)
                    .filter(|value| **value <= u8::MAX as u16)
                    .map(|value| *value as u8)
                    .unwrap_or(255),
            });
        }
    }
    colors
}

fn read_u16_be(bytes: &[u8], offset: &mut usize) -> Result<u16, String> {
    let end = offset
        .checked_add(2)
        .ok_or_else(|| "色板数据过大。".to_string())?;
    let slice = bytes
        .get(*offset..end)
        .ok_or_else(|| "色板文件已截断。".to_string())?;
    *offset = end;
    Ok(u16::from_be_bytes([slice[0], slice[1]]))
}

fn read_u32_be(bytes: &[u8], offset: &mut usize) -> Result<u32, String> {
    let end = offset
        .checked_add(4)
        .ok_or_else(|| "色板数据过大。".to_string())?;
    let slice = bytes
        .get(*offset..end)
        .ok_or_else(|| "色板文件已截断。".to_string())?;
    *offset = end;
    Ok(u32::from_be_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn read_f32_be(bytes: &[u8], offset: &mut usize) -> Result<f32, String> {
    let bits = read_u32_be(bytes, offset)?;
    Ok(f32::from_bits(bits))
}

fn float_channel(value: f32) -> Option<u8> {
    if !value.is_finite() {
        return None;
    }
    Some((value.clamp(0.0, 1.0) * 255.0).round() as u8)
}

fn required_float_channel(value: f32) -> Result<u8, String> {
    float_channel(value).ok_or_else(|| "ASE 色板包含无效颜色值。".to_string())
}

fn ase_imported_colors(bytes: &[u8]) -> Result<Vec<PaletteColor>, String> {
    if bytes.get(..4) != Some(b"ASEF") {
        return Err("不是 Adobe ASE 色板文件。".to_string());
    }
    let mut offset = 4;
    let _major = read_u16_be(bytes, &mut offset)?;
    let _minor = read_u16_be(bytes, &mut offset)?;
    let count = read_u32_be(bytes, &mut offset)?;
    if count > 1_000_000 {
        return Err("ASE 色板条目过多。".to_string());
    }
    let mut colors = Vec::new();
    for _ in 0..count {
        let block_type = read_u16_be(bytes, &mut offset)?;
        let length = read_u32_be(bytes, &mut offset)? as usize;
        let end = offset
            .checked_add(length)
            .ok_or_else(|| "ASE 色板数据过大。".to_string())?;
        let block = bytes
            .get(offset..end)
            .ok_or_else(|| "ASE 色板文件已截断。".to_string())?;
        offset = end;
        if block_type != 0x0001 {
            continue;
        }
        let mut block_offset = 0;
        let name_length = read_u16_be(block, &mut block_offset)? as usize;
        let name_bytes = name_length
            .checked_mul(2)
            .ok_or_else(|| "ASE 色板名称过长。".to_string())?;
        block_offset = block_offset
            .checked_add(name_bytes)
            .ok_or_else(|| "ASE 色板数据过大。".to_string())?;
        let model = block
            .get(block_offset..block_offset.saturating_add(4))
            .ok_or_else(|| "ASE 色板缺少颜色模型。".to_string())?;
        block_offset += 4;
        let color = match model {
            b"RGB " => Some(PaletteColor {
                r: required_float_channel(read_f32_be(block, &mut block_offset)?)?,
                g: required_float_channel(read_f32_be(block, &mut block_offset)?)?,
                b: required_float_channel(read_f32_be(block, &mut block_offset)?)?,
                a: 255,
            }),
            b"GRAY" => {
                let value = required_float_channel(read_f32_be(block, &mut block_offset)?)?;
                Some(PaletteColor {
                    r: value,
                    g: value,
                    b: value,
                    a: 255,
                })
            }
            b"CMYK" => {
                let c = read_f32_be(block, &mut block_offset)?.clamp(0.0, 1.0);
                let m = read_f32_be(block, &mut block_offset)?.clamp(0.0, 1.0);
                let y = read_f32_be(block, &mut block_offset)?.clamp(0.0, 1.0);
                let k = read_f32_be(block, &mut block_offset)?.clamp(0.0, 1.0);
                Some(PaletteColor {
                    r: required_float_channel((1.0 - c) * (1.0 - k))?,
                    g: required_float_channel((1.0 - m) * (1.0 - k))?,
                    b: required_float_channel((1.0 - y) * (1.0 - k))?,
                    a: 255,
                })
            }
            _ => None,
        };
        if let Some(color) = color {
            colors.push(color);
        }
    }
    Ok(colors)
}

fn hsv_color(hue: f32, saturation: f32, value: f32) -> PaletteColor {
    let h = hue.rem_euclid(360.0) / 60.0;
    let chroma = value * saturation;
    let x = chroma * (1.0 - (h.rem_euclid(2.0) - 1.0).abs());
    let (r, g, b) = if h < 1.0 {
        (chroma, x, 0.0)
    } else if h < 2.0 {
        (x, chroma, 0.0)
    } else if h < 3.0 {
        (0.0, chroma, x)
    } else if h < 4.0 {
        (0.0, x, chroma)
    } else if h < 5.0 {
        (x, 0.0, chroma)
    } else {
        (chroma, 0.0, x)
    };
    let match_value = value - chroma;
    PaletteColor {
        r: float_channel(r + match_value).unwrap_or(0),
        g: float_channel(g + match_value).unwrap_or(0),
        b: float_channel(b + match_value).unwrap_or(0),
        a: 255,
    }
}

fn aco_color(space: u16, values: [u16; 4]) -> Option<PaletteColor> {
    match space {
        0 => Some(PaletteColor {
            r: (values[0] >> 8) as u8,
            g: (values[1] >> 8) as u8,
            b: (values[2] >> 8) as u8,
            a: 255,
        }),
        1 => Some(hsv_color(
            values[0] as f32 / 65_535.0 * 360.0,
            values[1] as f32 / 65_535.0,
            values[2] as f32 / 65_535.0,
        )),
        8 => {
            let value = (values[0] >> 8) as u8;
            Some(PaletteColor {
                r: value,
                g: value,
                b: value,
                a: 255,
            })
        }
        _ => None,
    }
}

fn aco_imported_colors(bytes: &[u8]) -> Result<Vec<PaletteColor>, String> {
    let mut offset = 0;
    let version = read_u16_be(bytes, &mut offset)?;
    if version != 1 && version != 2 {
        return Err("不支持的 ACO 色板版本。".to_string());
    }
    let count = read_u16_be(bytes, &mut offset)? as usize;
    let mut colors = Vec::new();
    for _ in 0..count {
        let space = read_u16_be(bytes, &mut offset)?;
        let values = [
            read_u16_be(bytes, &mut offset)?,
            read_u16_be(bytes, &mut offset)?,
            read_u16_be(bytes, &mut offset)?,
            read_u16_be(bytes, &mut offset)?,
        ];
        if version == 2 {
            let characters = read_u32_be(bytes, &mut offset)? as usize;
            let byte_length = characters
                .checked_mul(2)
                .ok_or_else(|| "ACO 色板名称过长。".to_string())?;
            offset = offset
                .checked_add(byte_length)
                .ok_or_else(|| "ACO 色板数据过大。".to_string())?;
            if offset > bytes.len() {
                return Err("ACO 色板文件已截断。".to_string());
            }
        }
        if let Some(color) = aco_color(space, values) {
            colors.push(color);
        }
    }
    Ok(colors)
}

fn act_imported_colors(bytes: &[u8]) -> Result<Vec<PaletteColor>, String> {
    if bytes.len() < 768 {
        return Err("ACT 色板文件已截断。".to_string());
    }
    let count = if bytes.len() >= 770 {
        let declared = u16::from_be_bytes([bytes[768], bytes[769]]) as usize;
        if declared == 0 {
            256
        } else {
            declared.min(256)
        }
    } else {
        256
    };
    let transparent = if bytes.len() >= 772 {
        Some(u16::from_be_bytes([bytes[770], bytes[771]]) as usize)
    } else {
        None
    };
    Ok((0..count)
        .map(|index| PaletteColor {
            r: bytes[index * 3],
            g: bytes[index * 3 + 1],
            b: bytes[index * 3 + 2],
            a: if transparent == Some(index) { 0 } else { 255 },
        })
        .collect())
}

fn ordered_image_colors(
    pixels: impl IntoIterator<Item = [u8; 4]>,
) -> Result<Vec<PaletteColor>, String> {
    let mut seen = HashSet::new();
    let mut colors = Vec::new();
    for [r, g, b, a] in pixels {
        let packed = u32::from_be_bytes([r, g, b, a]);
        if !seen.insert(packed) {
            continue;
        }
        if colors.len() == MAX_IMPORTED_PALETTE_COLORS {
            return Err(format!(
                "图片包含超过 {MAX_IMPORTED_PALETTE_COLORS} 种颜色，无法作为色板导入。"
            ));
        }
        colors.push(PaletteColor { r, g, b, a });
    }
    Ok(colors)
}

fn image_imported_colors(path: &Path) -> Result<Vec<PaletteColor>, String> {
    let reader = image::ImageReader::open(path)
        .map_err(|error| format!("无法读取图片色板 {}：{error}", path.display()))?
        .with_guessed_format()
        .map_err(|error| format!("无法识别图片色板 {}：{error}", path.display()))?;
    let (width, height) = reader
        .into_dimensions()
        .map_err(|error| format!("无法读取图片色板尺寸 {}：{error}", path.display()))?;
    let pixels = u64::from(width).saturating_mul(u64::from(height));
    if pixels > MAX_IMPORTED_IMAGE_PIXELS {
        return Err(format!(
            "图片色板尺寸过大，最多支持 {MAX_IMPORTED_IMAGE_PIXELS} 个像素。"
        ));
    }
    let image = image::open(path)
        .map_err(|error| format!("无法解码图片色板 {}：{error}", path.display()))?
        .to_rgba8();
    ordered_image_colors(image.pixels().map(|pixel| pixel.0))
}

fn png_imported_colors(bytes: &[u8]) -> Result<Vec<PaletteColor>, String> {
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::ALPHA);
    let mut reader = decoder
        .read_info()
        .map_err(|error| format!("无法读取 PNG 色板：{error}"))?;
    let metadata = reader.info();
    let pixel_count = u64::from(metadata.width).saturating_mul(u64::from(metadata.height));
    if pixel_count > MAX_IMPORTED_IMAGE_PIXELS {
        return Err(format!(
            "图片色板尺寸过大，最多支持 {MAX_IMPORTED_IMAGE_PIXELS} 个像素。"
        ));
    }
    let mut pixels = vec![
        0;
        reader
            .output_buffer_size()
            .ok_or_else(|| "PNG 色板没有可读取的像素缓冲区。".to_string())?
    ];
    let info = reader
        .next_frame(&mut pixels)
        .map_err(|error| format!("无法解码 PNG 色板：{error}"))?;
    if info.color_type != png::ColorType::Rgba || info.bit_depth != png::BitDepth::Eight {
        return Err("PNG 色板必须能转换为 8 位 RGBA 像素。".to_string());
    }
    ordered_image_colors(
        pixels[..info.buffer_size()]
            .chunks_exact(4)
            .map(|pixel| [pixel[0], pixel[1], pixel[2], pixel[3]]),
    )
}

fn imported_palette_from_path(path: &Path) -> Result<ImportedPalette, String> {
    let bytes =
        fs::read(path).map_err(|error| format!("无法读取色板 {}：{error}", path.display()))?;
    let name = imported_palette_name(path);
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let colors = match extension.as_str() {
        "json" => return json_imported_palette(&bytes, name, &path.display().to_string()),
        "ase" => ase_imported_colors(&bytes)?,
        "aco" => aco_imported_colors(&bytes)?,
        "act" => act_imported_colors(&bytes)?,
        "png" => png_imported_colors(&bytes)?,
        "jpg" | "jpeg" | "webp" | "bmp" | "gif" | "ico" => image_imported_colors(path)?,
        "gpl" | "txt" | "hex" | "csv" => text_imported_colors(&bytes),
        "pal" => {
            let text_colors = text_imported_colors(&bytes);
            if text_colors.is_empty() {
                act_imported_colors(&bytes)?
            } else {
                text_colors
            }
        }
        _ => text_imported_colors(&bytes),
    };
    linear_imported_palette(name, colors)
}

fn stored_imported_palette_from_path(path: &Path) -> Result<StoredPalette, String> {
    let ImportedPalette {
        name,
        colors,
        columns,
        slots,
    } = imported_palette_from_path(path)?;
    Ok(StoredPalette {
        id: external_palette_id(path),
        name,
        file_path: path.to_string_lossy().to_string(),
        colors,
        built_in: false,
        columns: Some(columns),
        slots: Some(slots),
    })
}

#[tauri::command]
pub(crate) fn import_palette(window: tauri::Window) -> Result<Option<StoredPalette>, String> {
    let Some(path) = FileDialog::new()
        .set_parent(&window)
        .add_filter("Supported palette files", IMPORTABLE_PALETTE_EXTENSIONS)
        .pick_file()
    else {
        return Ok(None);
    };
    let ImportedPalette {
        name,
        colors,
        columns,
        slots,
    } = imported_palette_from_path(&path)?;
    save_palette(None, name, colors, columns, slots).map(Some)
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
    let mut paths = fs::read_dir(&directory)
        .map_err(|error| format!("无法读取色板文件夹：{error}"))?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .collect::<Vec<_>>();
    paths.sort();
    let mut known_ids = palettes
        .iter()
        .map(|palette| palette.id.clone())
        .collect::<HashSet<_>>();

    // Native files take precedence so saving an external palette as the current
    // palette creates its editable native copy without showing a duplicate.
    for path in paths.iter().filter(|path| is_native_palette_path(path)) {
        let palette = match read_palette(path) {
            Ok(palette) => palette,
            Err(_) => continue,
        };
        if !is_built_in_palette_id(&palette.id) && known_ids.insert(palette.id.clone()) {
            palettes.push(palette);
        }
    }
    for path in paths
        .iter()
        .filter(|path| !is_native_palette_path(path) && is_importable_palette_path(path))
    {
        let palette = match stored_imported_palette_from_path(path) {
            Ok(palette) => palette,
            // One malformed or unsupported-looking file must not hide the
            // other valid palettes in the same user-owned folder.
            Err(_) => continue,
        };
        if known_ids.insert(palette.id.clone()) {
            palettes.push(palette);
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
    let directory = palette_dir()?;
    let native_path = directory.join(format!("{id}.palette.json"));
    let path = if native_path.exists() {
        native_path
    } else {
        fs::read_dir(&directory)
            .map_err(|error| format!("无法读取色板文件夹：{error}"))?
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .find(|path| {
                !is_native_palette_path(path)
                    && is_importable_palette_path(path)
                    && external_palette_id(path) == id
            })
            .ok_or_else(|| "色板文件不存在。".to_string())?
    };
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

    #[test]
    fn imports_native_json_with_its_row_major_layout() {
        let mut file = palette_file(2);
        file.columns = Some(4);
        file.slots = Some(vec![Some(0), None, None, Some(1)]);
        let encoded = match serde_json::to_vec(&file) {
            Ok(value) => value,
            Err(error) => {
                assert!(error.to_string().is_empty());
                return;
            }
        };
        match json_imported_palette(&encoded, "fallback".to_string(), "test") {
            Ok(imported) => {
                assert_eq!(imported.name, "Test Palette");
                assert_eq!(imported.columns, 4);
                assert_eq!(imported.slots, vec![Some(0), None, None, Some(1)]);
            }
            Err(error) => assert!(error.is_empty()),
        }
    }

    #[test]
    fn imports_gimp_palette_colors_in_file_order() {
        let source = b"GIMP Palette\nName: Ordered\n#\n17 34 51 First\n68 85 102 Second\n";
        let colors = text_imported_colors(source);
        assert_eq!(colors.len(), 2);
        assert_eq!((colors[0].r, colors[0].g, colors[0].b), (17, 34, 51));
        assert_eq!((colors[1].r, colors[1].g, colors[1].b), (68, 85, 102));
    }

    #[test]
    fn imports_act_transparent_entry_without_reordering() {
        let mut source = vec![0u8; 772];
        source[0..3].copy_from_slice(&[17, 34, 51]);
        source[3..6].copy_from_slice(&[68, 85, 102]);
        source[768..770].copy_from_slice(&2u16.to_be_bytes());
        source[770..772].copy_from_slice(&1u16.to_be_bytes());
        match act_imported_colors(&source) {
            Ok(colors) => {
                assert_eq!(colors.len(), 2);
                assert_eq!(colors[0].a, 255);
                assert_eq!(colors[1].a, 0);
            }
            Err(error) => assert!(error.is_empty()),
        }
    }

    #[test]
    fn imports_ase_rgb_swatch() {
        let mut block = Vec::new();
        block.extend_from_slice(&1u16.to_be_bytes());
        block.extend_from_slice(&0u16.to_be_bytes());
        block.extend_from_slice(b"RGB ");
        block.extend_from_slice(&1.0f32.to_bits().to_be_bytes());
        block.extend_from_slice(&0.5f32.to_bits().to_be_bytes());
        block.extend_from_slice(&0.0f32.to_bits().to_be_bytes());
        block.extend_from_slice(&0u16.to_be_bytes());
        let mut source = b"ASEF".to_vec();
        source.extend_from_slice(&1u16.to_be_bytes());
        source.extend_from_slice(&0u16.to_be_bytes());
        source.extend_from_slice(&1u32.to_be_bytes());
        source.extend_from_slice(&1u16.to_be_bytes());
        source.extend_from_slice(&(block.len() as u32).to_be_bytes());
        source.extend_from_slice(&block);
        match ase_imported_colors(&source) {
            Ok(colors) => {
                assert_eq!(colors.len(), 1);
                assert_eq!((colors[0].r, colors[0].g, colors[0].b), (255, 128, 0));
            }
            Err(error) => assert!(error.is_empty()),
        }
    }

    #[test]
    fn imports_image_colors_once_in_row_major_order() {
        let pixels = [
            [17, 34, 51, 255],
            [68, 85, 102, 255],
            [17, 34, 51, 255],
            [119, 136, 153, 128],
        ];
        match ordered_image_colors(pixels) {
            Ok(colors) => {
                assert_eq!(colors.len(), 3);
                assert_eq!(
                    (colors[0].r, colors[0].g, colors[0].b, colors[0].a),
                    (17, 34, 51, 255)
                );
                assert_eq!(
                    (colors[1].r, colors[1].g, colors[1].b, colors[1].a),
                    (68, 85, 102, 255)
                );
                assert_eq!(
                    (colors[2].r, colors[2].g, colors[2].b, colors[2].a),
                    (119, 136, 153, 128)
                );
            }
            Err(error) => assert!(error.is_empty()),
        }
    }

    #[test]
    fn imports_png_colors_in_row_major_order() {
        let mut encoded = Vec::new();
        let mut encoder = png::Encoder::new(&mut encoded, 2, 2);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        match encoder.write_header() {
            Ok(mut writer) => {
                let write = writer.write_image_data(&[
                    17, 34, 51, 255, 68, 85, 102, 255, 17, 34, 51, 255, 119, 136, 153, 128,
                ]);
                assert!(write.is_ok());
            }
            Err(error) => assert!(error.to_string().is_empty()),
        }
        match png_imported_colors(&encoded) {
            Ok(colors) => {
                assert_eq!(colors.len(), 3);
                assert_eq!(
                    (colors[0].r, colors[0].g, colors[0].b, colors[0].a),
                    (17, 34, 51, 255)
                );
                assert_eq!(
                    (colors[1].r, colors[1].g, colors[1].b, colors[1].a),
                    (68, 85, 102, 255)
                );
                assert_eq!(
                    (colors[2].r, colors[2].g, colors[2].b, colors[2].a),
                    (119, 136, 153, 128)
                );
            }
            Err(error) => assert!(error.is_empty()),
        }
    }

    #[test]
    fn recognizes_supported_palette_files_inside_the_palette_folder() {
        for name in [
            "colors.palette.json",
            "colors.json",
            "colors.gpl",
            "colors.pal",
            "colors.act",
            "colors.aco",
            "colors.ase",
            "colors.txt",
            "colors.hex",
            "colors.csv",
            "colors.png",
            "colors.jpg",
            "colors.webp",
            "colors.bmp",
            "colors.gif",
            "colors.ico",
        ] {
            assert!(has_importable_palette_extension(Path::new(name)), "{name}");
        }
        assert!(!has_importable_palette_extension(Path::new("notes.md")));
    }

    #[test]
    fn external_palette_ids_are_stable_and_do_not_expose_the_file_path() {
        let path = Path::new("C:/palettes/example.png");
        let first = external_palette_id(path);
        assert_eq!(first, external_palette_id(path));
        assert!(first.starts_with("external-"));
        assert!(!first.contains("example"));
    }
}
