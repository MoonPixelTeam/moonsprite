use crate::platform_storage::{
    atomic_write, atomic_write_with, atomic_write_with_validation_and_backup,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    hash::{Hash, Hasher},
    io::{BufWriter, Cursor, Read, Seek, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::UNIX_EPOCH,
};
use tauri::{
    ipc::{Channel, InvokeBody, Request, Response},
    AppHandle, Emitter, Manager, State,
};

const FILE_PATH_HEADER: &str = "x-moonsprite-file-path";
const SOURCE_PATH_HEADER: &str = "x-moonsprite-source-path";
const SOURCE_WIDTH_HEADER: &str = "x-moonsprite-source-width";
const SOURCE_HEIGHT_HEADER: &str = "x-moonsprite-source-height";
const OUTPUT_WIDTH_HEADER: &str = "x-moonsprite-output-width";
const OUTPUT_HEIGHT_HEADER: &str = "x-moonsprite-output-height";
const FORCE_RGBA_HEADER: &str = "x-moonsprite-force-rgba";
const SOURCE_FORMAT_HEADER: &str = "x-moonsprite-source-format";
const SOURCE_PALETTE_HEADER: &str = "x-moonsprite-source-palette";
const OPERATION_ID_HEADER: &str = "x-moonsprite-operation-id";
const SCALED_PNG_PROGRESS_EVENT: &str = "moonsprite:scaled-png-progress";
const SCALED_PNG_EXPORT_CANCELED: &str = "MOONSPRITE_EXPORT_CANCELED";
const SAVE_PLAN_ENTRY: &str = ".moonsprite-save-plan.json";
const PNG_STREAM_BUFFER_BYTES: usize = 64 * 1024;
const PNG_FILE_BUFFER_BYTES: usize = 1024 * 1024;
const PNG_ROW_BATCH_BYTES: usize = 1024 * 1024;
const PROJECT_BACKUP_DIRECTORY: &str = "project-backups";

#[derive(Clone, Default)]
pub struct ScaledPngCancellation {
    operation_ids: Arc<Mutex<HashSet<String>>>,
}

impl ScaledPngCancellation {
    fn request(&self, operation_id: String) {
        if let Ok(mut operation_ids) = self.operation_ids.lock() {
            operation_ids.insert(operation_id);
        }
    }

    fn is_requested(&self, operation_id: &str) -> bool {
        self.operation_ids
            .lock()
            .map(|operation_ids| operation_ids.contains(operation_id))
            .unwrap_or(true)
    }

    fn clear(&self, operation_id: &str) {
        if let Ok(mut operation_ids) = self.operation_ids.lock() {
            operation_ids.remove(operation_id);
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaledPngWriteResult {
    indexed: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScaledPngProgress {
    operation_id: String,
    value: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSaveReuseEntry {
    path: String,
    crc32: u32,
    #[serde(default)]
    byte_length: Option<u64>,
    #[serde(default)]
    encoding: Option<String>,
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    height: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ProjectSavePlan {
    version: u8,
    entries: Vec<ProjectSaveReuseEntry>,
}

fn decode_file_path_header(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'%' {
            decoded.push(bytes[index]);
            index += 1;
            continue;
        }
        if index + 2 >= bytes.len() {
            return Err("Invalid encoded file path.".to_string());
        }
        let hex = |byte: u8| match byte {
            b'0'..=b'9' => Some(byte - b'0'),
            b'a'..=b'f' => Some(byte - b'a' + 10),
            b'A'..=b'F' => Some(byte - b'A' + 10),
            _ => None,
        };
        let high = hex(bytes[index + 1]).ok_or_else(|| "Invalid encoded file path.".to_string())?;
        let low = hex(bytes[index + 2]).ok_or_else(|| "Invalid encoded file path.".to_string())?;
        decoded.push((high << 4) | low);
        index += 3;
    }
    String::from_utf8(decoded).map_err(|_| "Invalid encoded file path.".to_string())
}

fn request_path(request: &Request<'_>, header: &str) -> Result<String, String> {
    let encoded = request
        .headers()
        .get(header)
        .ok_or_else(|| "Missing file path.".to_string())?
        .to_str()
        .map_err(|_| "Invalid encoded file path.".to_string())?;
    decode_file_path_header(encoded)
}

fn raw_request_data<'a>(request: &'a Request<'_>) -> Result<&'a [u8], String> {
    match request.body() {
        InvokeBody::Raw(data) => Ok(data),
        InvokeBody::Json(_) => Err("Binary file data is required.".to_string()),
    }
}

fn request_positive_u32_header(request: &Request<'_>, header: &str) -> Result<u32, String> {
    let value = request
        .headers()
        .get(header)
        .ok_or_else(|| format!("Missing {header} header."))?
        .to_str()
        .map_err(|_| format!("Invalid {header} header."))?
        .parse::<u32>()
        .map_err(|_| format!("Invalid {header} header."))?;
    if value == 0 {
        return Err(format!("Invalid {header} header."));
    }
    Ok(value)
}

fn request_boolean_header(request: &Request<'_>, header: &str) -> Result<bool, String> {
    match request
        .headers()
        .get(header)
        .ok_or_else(|| format!("Missing {header} header."))?
        .to_str()
        .map_err(|_| format!("Invalid {header} header."))?
    {
        "0" => Ok(false),
        "1" => Ok(true),
        _ => Err(format!("Invalid {header} header.")),
    }
}

fn request_string_header(request: &Request<'_>, header: &str) -> Result<String, String> {
    let value = request
        .headers()
        .get(header)
        .ok_or_else(|| format!("Missing {header} header."))?
        .to_str()
        .map_err(|_| format!("Invalid {header} header."))?;
    if value.is_empty() {
        return Err(format!("Invalid {header} header."));
    }
    Ok(value.to_string())
}

fn request_source_format(request: &Request<'_>) -> Result<ScaledPngSourceFormat, String> {
    let format = request
        .headers()
        .get(SOURCE_FORMAT_HEADER)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("rgba");
    match format {
        "rgba" => Ok(ScaledPngSourceFormat::Rgba),
        "indexed" => {
            let encoded = request
                .headers()
                .get(SOURCE_PALETTE_HEADER)
                .ok_or_else(|| "Missing indexed PNG source palette.".to_string())?
                .to_str()
                .map_err(|_| "Invalid indexed PNG source palette.".to_string())?;
            Ok(ScaledPngSourceFormat::Indexed(parse_palette_hex(encoded)?))
        }
        _ => Err("Invalid PNG source format.".to_string()),
    }
}

fn project_backup_directory(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(PROJECT_BACKUP_DIRECTORY))
        .map_err(|error| error.to_string())
}

fn parse_palette_hex(encoded: &str) -> Result<Vec<u32>, String> {
    if encoded.is_empty() || encoded.len() % 8 != 0 || encoded.len() / 8 > 256 {
        return Err("Invalid indexed PNG source palette.".to_string());
    }
    let parse_byte = |high: u8, low: u8| -> Option<u8> {
        let nibble = |value: u8| match value {
            b'0'..=b'9' => Some(value - b'0'),
            b'a'..=b'f' => Some(value - b'a' + 10),
            b'A'..=b'F' => Some(value - b'A' + 10),
            _ => None,
        };
        Some((nibble(high)? << 4) | nibble(low)?)
    };
    let bytes = encoded.as_bytes();
    let mut colors = Vec::with_capacity(encoded.len() / 8);
    for chunk in bytes.chunks_exact(8) {
        let red = parse_byte(chunk[0], chunk[1])
            .ok_or_else(|| "Invalid indexed PNG source palette.".to_string())?;
        let green = parse_byte(chunk[2], chunk[3])
            .ok_or_else(|| "Invalid indexed PNG source palette.".to_string())?;
        let blue = parse_byte(chunk[4], chunk[5])
            .ok_or_else(|| "Invalid indexed PNG source palette.".to_string())?;
        let alpha = parse_byte(chunk[6], chunk[7])
            .ok_or_else(|| "Invalid indexed PNG source palette.".to_string())?;
        colors.push(u32::from_be_bytes([red, green, blue, alpha]));
    }
    Ok(colors)
}

fn checked_rgba_len(width: u32, height: u32) -> Result<usize, String> {
    let bytes = u64::from(width)
        .checked_mul(u64::from(height))
        .and_then(|value| value.checked_mul(4))
        .ok_or_else(|| "PNG pixel dimensions are too large.".to_string())?;
    usize::try_from(bytes).map_err(|_| "PNG pixel dimensions are too large.".to_string())
}

fn checked_pixel_len(width: u32, height: u32, bytes_per_pixel: usize) -> Result<usize, String> {
    let bytes = u64::from(width)
        .checked_mul(u64::from(height))
        .and_then(|value| value.checked_mul(bytes_per_pixel as u64))
        .ok_or_else(|| "PNG pixel dimensions are too large.".to_string())?;
    usize::try_from(bytes).map_err(|_| "PNG pixel dimensions are too large.".to_string())
}

fn scaled_source_coordinate(output: u32, source_size: u32, output_size: u32) -> u32 {
    ((u64::from(output) * u64::from(source_size)) / u64::from(output_size)) as u32
}

fn export_color(pixel: &[u8]) -> u32 {
    if pixel[3] == 0 {
        0
    } else {
        u32::from_be_bytes([pixel[0], pixel[1], pixel[2], pixel[3]])
    }
}

const PALETTE_LOOKUP_SIZE: usize = 512;

#[derive(Clone)]
struct PaletteLookup {
    keys: [u32; PALETTE_LOOKUP_SIZE],
    values: [u8; PALETTE_LOOKUP_SIZE],
    occupied: [bool; PALETTE_LOOKUP_SIZE],
}

impl Default for PaletteLookup {
    fn default() -> Self {
        Self {
            keys: [0; PALETTE_LOOKUP_SIZE],
            values: [0; PALETTE_LOOKUP_SIZE],
            occupied: [false; PALETTE_LOOKUP_SIZE],
        }
    }
}

impl PaletteLookup {
    fn slot(color: u32) -> usize {
        let mut value = color ^ (color >> 16);
        value = value.wrapping_mul(0x7feb_352d);
        value ^= value >> 15;
        value = value.wrapping_mul(0x846c_a68b);
        value ^= value >> 16;
        (value as usize) & (PALETTE_LOOKUP_SIZE - 1)
    }

    fn get(&self, color: u32) -> Option<u8> {
        let mut slot = Self::slot(color);
        for _ in 0..PALETTE_LOOKUP_SIZE {
            if !self.occupied[slot] {
                return None;
            }
            if self.keys[slot] == color {
                return Some(self.values[slot]);
            }
            slot = (slot + 1) & (PALETTE_LOOKUP_SIZE - 1);
        }
        None
    }

    fn insert(&mut self, color: u32, index: u8) -> bool {
        let mut slot = Self::slot(color);
        for _ in 0..PALETTE_LOOKUP_SIZE {
            if !self.occupied[slot] {
                self.occupied[slot] = true;
                self.keys[slot] = color;
                self.values[slot] = index;
                return true;
            }
            if self.keys[slot] == color {
                return false;
            }
            slot = (slot + 1) & (PALETTE_LOOKUP_SIZE - 1);
        }
        false
    }
}

struct IndexedPngPalette {
    colors: Vec<u32>,
    lookup: PaletteLookup,
    depth: png::BitDepth,
    bits: usize,
    source_indices: Option<Vec<u8>>,
}

enum ScaledPngSourceFormat {
    Rgba,
    Indexed(Vec<u32>),
}

struct ScaledPngAnalysis {
    palette: Option<IndexedPngPalette>,
    opaque: bool,
}

#[derive(Clone, Copy)]
struct ScaledSourceRun {
    source: u32,
    output_len: u32,
}

fn scaled_source_runs(source_size: u32, output_size: u32) -> Result<Vec<ScaledSourceRun>, String> {
    let capacity = usize::try_from(source_size.min(output_size))
        .map_err(|_| "PNG dimensions are too large.".to_string())?;
    let mut runs: Vec<ScaledSourceRun> = Vec::new();
    runs.try_reserve_exact(capacity)
        .map_err(|_| "PNG dimensions are too large.".to_string())?;

    for output in 0..output_size {
        let source = scaled_source_coordinate(output, source_size, output_size);
        if let Some(last) = runs.last_mut() {
            if last.source == source {
                last.output_len += 1;
                continue;
            }
        }
        runs.push(ScaledSourceRun {
            source,
            output_len: 1,
        });
    }
    Ok(runs)
}

fn integer_scale_repeat(source_size: u32, output_size: u32) -> Option<usize> {
    if source_size == 0 || output_size < source_size || output_size % source_size != 0 {
        return None;
    }
    usize::try_from(output_size / source_size).ok()
}

fn analyze_scaled_png_output(
    source: &[u8],
    source_width: u32,
    source_height: u32,
    output_width: u32,
    output_height: u32,
    is_canceled: &impl Fn() -> bool,
) -> Result<ScaledPngAnalysis, String> {
    let sampled_width = source_width.min(output_width);
    let sampled_height = source_height.min(output_height);
    let direct_x = output_width >= source_width;
    let direct_y = output_height >= source_height;
    let mut colors = Vec::new();
    let mut lookup = PaletteLookup::default();
    let mut palette_overflow = false;
    let mut opaque = true;

    for sampled_y in 0..sampled_height {
        if is_canceled() {
            return Err(SCALED_PNG_EXPORT_CANCELED.to_string());
        }
        let source_y = if direct_y {
            sampled_y
        } else {
            scaled_source_coordinate(sampled_y, source_height, output_height)
        };
        let source_row_offset = usize::try_from(u64::from(source_y) * u64::from(source_width) * 4)
            .map_err(|_| "PNG source row is too large.".to_string())?;
        let source_row = &source[source_row_offset..source_row_offset + source_width as usize * 4];
        if direct_x {
            for pixel in source_row[..sampled_width as usize * 4].chunks_exact(4) {
                let color = export_color(pixel);
                opaque &= pixel[3] == 255;
                if palette_overflow || lookup.get(color).is_some() {
                    continue;
                }
                if colors.len() == 256 {
                    palette_overflow = true;
                    continue;
                }
                if !lookup.insert(color, colors.len() as u8) {
                    palette_overflow = true;
                    continue;
                }
                colors.push(color);
            }
            continue;
        }
        for sampled_x in 0..sampled_width {
            let source_x = scaled_source_coordinate(sampled_x, source_width, output_width) as usize;
            let pixel = &source_row[source_x * 4..source_x * 4 + 4];
            let color = export_color(pixel);
            opaque &= pixel[3] == 255;
            if palette_overflow || lookup.get(color).is_some() {
                continue;
            }
            if colors.len() == 256 {
                palette_overflow = true;
                continue;
            }
            if !lookup.insert(color, colors.len() as u8) {
                palette_overflow = true;
                continue;
            }
            colors.push(color);
        }
    }

    if palette_overflow {
        return Ok(ScaledPngAnalysis {
            palette: None,
            opaque,
        });
    }
    let (depth, bits) = match colors.len() {
        0..=2 => (png::BitDepth::One, 1),
        3..=4 => (png::BitDepth::Two, 2),
        5..=16 => (png::BitDepth::Four, 4),
        _ => (png::BitDepth::Eight, 8),
    };
    Ok(ScaledPngAnalysis {
        palette: Some(IndexedPngPalette {
            colors,
            lookup,
            depth,
            bits,
            source_indices: None,
        }),
        opaque,
    })
}

fn analyze_indexed_scaled_png_output(
    source: &[u8],
    source_width: u32,
    source_height: u32,
    output_width: u32,
    output_height: u32,
    colors: &[u32],
    is_canceled: &impl Fn() -> bool,
) -> Result<ScaledPngAnalysis, String> {
    if colors.is_empty() || colors.len() > 256 {
        return Err("Invalid indexed PNG source palette.".to_string());
    }
    let expected_source_len = checked_pixel_len(source_width, source_height, 1)?;
    if source.len() != expected_source_len {
        return Err("Invalid indexed PNG source pixel length.".to_string());
    }
    let sampled_width = source_width.min(output_width);
    let sampled_height = source_height.min(output_height);
    let direct_x = output_width >= source_width;
    let direct_y = output_height >= source_height;
    let mut opaque = true;
    let mut output_colors = Vec::new();
    let mut output_lookup = PaletteLookup::default();
    let mut source_indices = vec![u8::MAX; colors.len()];
    for sampled_y in 0..sampled_height {
        if is_canceled() {
            return Err(SCALED_PNG_EXPORT_CANCELED.to_string());
        }
        let source_y = if direct_y {
            sampled_y
        } else {
            scaled_source_coordinate(sampled_y, source_height, output_height)
        };
        for sampled_x in 0..sampled_width {
            let source_x = if direct_x {
                sampled_x
            } else {
                scaled_source_coordinate(sampled_x, source_width, output_width)
            };
            let source_offset = usize::try_from(
                u64::from(source_y) * u64::from(source_width) + u64::from(source_x),
            )
            .map_err(|_| "PNG source row is too large.".to_string())?;
            let palette_index = source[source_offset] as usize;
            let source_color = colors
                .get(palette_index)
                .ok_or_else(|| "Indexed PNG source pixel is outside the palette.".to_string())?;
            opaque &= source_color.to_be_bytes()[3] == 255;
            let color = if source_color.to_be_bytes()[3] == 0 {
                0
            } else {
                *source_color
            };
            if source_indices[palette_index] == u8::MAX {
                let output_index = if let Some(index) = output_lookup.get(color) {
                    index
                } else {
                    let index = u8::try_from(output_colors.len()).map_err(|_| {
                        "Indexed PNG output palette has too many colors.".to_string()
                    })?;
                    output_colors.push(color);
                    if !output_lookup.insert(color, index) {
                        return Err("Indexed PNG output palette lookup is full.".to_string());
                    }
                    index
                };
                source_indices[palette_index] = output_index;
            }
        }
    }
    let (depth, bits) = match output_colors.len() {
        0..=2 => (png::BitDepth::One, 1),
        3..=4 => (png::BitDepth::Two, 2),
        5..=16 => (png::BitDepth::Four, 4),
        _ => (png::BitDepth::Eight, 8),
    };
    let mut lookup = PaletteLookup::default();
    for (index, color) in output_colors.iter().enumerate() {
        let _ = lookup.insert(*color, index as u8);
    }
    Ok(ScaledPngAnalysis {
        palette: Some(IndexedPngPalette {
            colors: output_colors,
            lookup,
            depth,
            bits,
            source_indices: Some(source_indices),
        }),
        opaque,
    })
}

fn fill_indexed_png_row(
    row: &mut [u8],
    source: &[u8],
    source_width: u32,
    source_y: u32,
    horizontal_runs: Option<&[ScaledSourceRun]>,
    integer_repeat: Option<usize>,
    palette: &IndexedPngPalette,
) -> Result<(), String> {
    row.fill(0);
    let source_row_offset = u64::from(source_y) * u64::from(source_width) * 4;
    let mut output_x = 0usize;
    let mut write_index =
        |source_x: u32, output_len: usize, output_x: &mut usize| -> Result<(), String> {
            let source_offset = usize::try_from(source_row_offset + u64::from(source_x) * 4)
                .map_err(|_| "PNG source row is too large.".to_string())?;
            let color = export_color(&source[source_offset..source_offset + 4]);
            let index = palette
                .lookup
                .get(color)
                .ok_or_else(|| "PNG palette lookup failed.".to_string())?;
            if palette.bits == 8 {
                row[*output_x..*output_x + output_len].fill(index);
                *output_x += output_len;
                return Ok(());
            }
            for _ in 0..output_len {
                let bit_offset = *output_x * palette.bits;
                let shift = 8 - palette.bits - bit_offset % 8;
                row[bit_offset / 8] |= index << shift;
                *output_x += 1;
            }
            Ok(())
        };
    if let Some(repeat) = integer_repeat {
        for source_x in 0..source_width {
            write_index(source_x, repeat, &mut output_x)?;
        }
        return Ok(());
    }
    for run in horizontal_runs
        .ok_or_else(|| "PNG horizontal scaling plan is missing.".to_string())?
        .iter()
    {
        write_index(run.source, run.output_len as usize, &mut output_x)?;
    }
    Ok(())
}

fn fill_indexed_source_row(
    row: &mut [u8],
    source: &[u8],
    source_width: u32,
    source_y: u32,
    horizontal_runs: Option<&[ScaledSourceRun]>,
    integer_repeat: Option<usize>,
    palette: &IndexedPngPalette,
) -> Result<(), String> {
    row.fill(0);
    let source_row_offset = usize::try_from(u64::from(source_y) * u64::from(source_width))
        .map_err(|_| "PNG source row is too large.".to_string())?;
    let mut output_x = 0usize;
    let mut write_index =
        |source_x: u32, output_len: usize, output_x: &mut usize| -> Result<(), String> {
            let source_offset = source_row_offset
                .checked_add(source_x as usize)
                .ok_or_else(|| "PNG source row is too large.".to_string())?;
            let source_index = source
                .get(source_offset)
                .copied()
                .ok_or_else(|| "Indexed PNG source pixel is outside the palette.".to_string())?;
            let index = palette
                .source_indices
                .as_ref()
                .and_then(|indices| indices.get(usize::from(source_index)).copied())
                .filter(|index| *index != u8::MAX)
                .ok_or_else(|| "Indexed PNG source pixel is outside the palette.".to_string())?;
            if usize::from(index) >= palette.colors.len() {
                return Err("Indexed PNG source pixel is outside the palette.".to_string());
            }
            if palette.bits == 8 {
                row[*output_x..*output_x + output_len].fill(index);
                *output_x += output_len;
                return Ok(());
            }
            for _ in 0..output_len {
                let bit_offset = *output_x * palette.bits;
                let shift = 8 - palette.bits - bit_offset % 8;
                row[bit_offset / 8] |= index << shift;
                *output_x += 1;
            }
            Ok(())
        };
    if let Some(repeat) = integer_repeat {
        for source_x in 0..source_width {
            write_index(source_x, repeat, &mut output_x)?;
        }
        return Ok(());
    }
    for run in horizontal_runs
        .ok_or_else(|| "PNG horizontal scaling plan is missing.")?
        .iter()
    {
        write_index(run.source, run.output_len as usize, &mut output_x)?;
    }
    Ok(())
}

fn fill_truecolor_png_row(
    row: &mut [u8],
    source: &[u8],
    source_width: u32,
    source_y: u32,
    horizontal_runs: Option<&[ScaledSourceRun]>,
    integer_repeat: Option<usize>,
    channels: usize,
    normalize_transparent: bool,
) -> Result<(), String> {
    let source_row_offset = u64::from(source_y) * u64::from(source_width) * 4;
    if let Some(repeat) = integer_repeat {
        let mut target_offset = 0usize;
        let source_row_offset = usize::try_from(source_row_offset)
            .map_err(|_| "PNG source row is too large.".to_string())?;
        let source_row = &source[source_row_offset..source_row_offset + source_width as usize * 4];
        for pixel in source_row.chunks_exact(4) {
            let target_len = repeat
                .checked_mul(channels)
                .ok_or_else(|| "PNG output row is too large.".to_string())?;
            let target = &mut row[target_offset..target_offset + target_len];
            if normalize_transparent && channels == 4 && pixel[3] == 0 {
                target.fill(0);
            } else {
                target[..channels].copy_from_slice(&pixel[..channels]);
            }
            let mut filled = channels;
            while filled < target_len {
                let copy_len = filled.min(target_len - filled);
                target.copy_within(..copy_len, filled);
                filled += copy_len;
            }
            target_offset += target_len;
        }
        return Ok(());
    }
    let mut target_offset = 0usize;
    for run in horizontal_runs
        .ok_or_else(|| "PNG horizontal scaling plan is missing.")?
        .iter()
    {
        let source_offset = usize::try_from(source_row_offset + u64::from(run.source) * 4)
            .map_err(|_| "PNG source row is too large.".to_string())?;
        let output_len = run.output_len as usize;
        let target_len = output_len
            .checked_mul(channels)
            .ok_or_else(|| "PNG output row is too large.".to_string())?;
        let source_pixel = &source[source_offset..source_offset + 4];
        for target in row[target_offset..target_offset + target_len].chunks_exact_mut(channels) {
            if normalize_transparent && channels == 4 && source_pixel[3] == 0 {
                target.fill(0);
            } else {
                target.copy_from_slice(&source_pixel[..channels]);
            }
        }
        target_offset += target_len;
    }
    Ok(())
}

fn fill_truecolor_indexed_row(
    row: &mut [u8],
    source: &[u8],
    source_width: u32,
    source_y: u32,
    horizontal_runs: Option<&[ScaledSourceRun]>,
    integer_repeat: Option<usize>,
    channels: usize,
    normalize_transparent: bool,
    palette: &[u32],
) -> Result<(), String> {
    let source_row_offset = usize::try_from(u64::from(source_y) * u64::from(source_width))
        .map_err(|_| "PNG source row is too large.".to_string())?;
    let write_pixel = |target: &mut [u8], source_index: u8| -> Result<(), String> {
        let [red, green, blue, alpha] = palette
            .get(usize::from(source_index))
            .ok_or_else(|| "Indexed PNG source pixel is outside the palette.".to_string())?
            .to_be_bytes();
        if normalize_transparent && channels == 4 && alpha == 0 {
            target.fill(0);
        } else if channels == 4 {
            target.copy_from_slice(&[red, green, blue, alpha]);
        } else {
            target.copy_from_slice(&[red, green, blue]);
        }
        Ok(())
    };
    if let Some(repeat) = integer_repeat {
        let mut target_offset = 0usize;
        for source_x in 0..source_width as usize {
            let source_index = *source
                .get(source_row_offset + source_x)
                .ok_or_else(|| "Indexed PNG source row is too large.".to_string())?;
            let target_len = repeat
                .checked_mul(channels)
                .ok_or_else(|| "PNG output row is too large.".to_string())?;
            let target = &mut row[target_offset..target_offset + target_len];
            write_pixel(&mut target[..channels], source_index)?;
            let mut filled = channels;
            while filled < target_len {
                let copy_len = filled.min(target_len - filled);
                target.copy_within(..copy_len, filled);
                filled += copy_len;
            }
            target_offset += target_len;
        }
        return Ok(());
    }
    let mut target_offset = 0usize;
    for run in horizontal_runs
        .ok_or_else(|| "PNG horizontal scaling plan is missing.")?
        .iter()
    {
        let source_index = *source
            .get(source_row_offset + run.source as usize)
            .ok_or_else(|| "Indexed PNG source row is too large.".to_string())?;
        let target_len = (run.output_len as usize)
            .checked_mul(channels)
            .ok_or_else(|| "PNG output row is too large.".to_string())?;
        for target in row[target_offset..target_offset + target_len].chunks_exact_mut(channels) {
            write_pixel(target, source_index)?;
        }
        target_offset += target_len;
    }
    Ok(())
}

#[cfg(test)]
fn write_scaled_png<W: Write, F: FnMut(f64), C: Fn() -> bool>(
    output: W,
    source: &[u8],
    source_width: u32,
    source_height: u32,
    output_width: u32,
    output_height: u32,
    force_rgba: bool,
    on_progress: F,
    is_canceled: C,
) -> Result<bool, String> {
    write_scaled_png_with_source(
        output,
        source,
        source_width,
        source_height,
        output_width,
        output_height,
        ScaledPngSourceFormat::Rgba,
        force_rgba,
        on_progress,
        is_canceled,
    )
}

fn write_scaled_png_with_source<W: Write, F: FnMut(f64), C: Fn() -> bool>(
    output: W,
    source: &[u8],
    source_width: u32,
    source_height: u32,
    output_width: u32,
    output_height: u32,
    source_format: ScaledPngSourceFormat,
    force_rgba: bool,
    mut on_progress: F,
    is_canceled: C,
) -> Result<bool, String> {
    on_progress(0.0);
    if is_canceled() {
        return Err(SCALED_PNG_EXPORT_CANCELED.to_string());
    }
    let expected_source_len = match &source_format {
        ScaledPngSourceFormat::Rgba => checked_rgba_len(source_width, source_height)?,
        ScaledPngSourceFormat::Indexed(_) => checked_pixel_len(source_width, source_height, 1)?,
    };
    if source.len() != expected_source_len {
        return Err(match &source_format {
            ScaledPngSourceFormat::Rgba => "Invalid PNG source pixel length.",
            ScaledPngSourceFormat::Indexed(_) => "Invalid indexed PNG source pixel length.",
        }
        .to_string());
    }

    let analysis = if force_rgba {
        ScaledPngAnalysis {
            palette: None,
            opaque: false,
        }
    } else {
        match &source_format {
            ScaledPngSourceFormat::Rgba => analyze_scaled_png_output(
                source,
                source_width,
                source_height,
                output_width,
                output_height,
                &is_canceled,
            )?,
            ScaledPngSourceFormat::Indexed(colors) => analyze_indexed_scaled_png_output(
                source,
                source_width,
                source_height,
                output_width,
                output_height,
                colors,
                &is_canceled,
            )?,
        }
    };
    let palette = analysis.palette;
    let indexed = palette.is_some();
    let channels = if indexed {
        0
    } else if analysis.opaque {
        3
    } else {
        4
    };
    let mut encoder = png::Encoder::new(output, output_width, output_height);
    if let Some(palette) = palette.as_ref() {
        let mut rgb = Vec::with_capacity(palette.colors.len() * 3);
        let mut alpha = Vec::with_capacity(palette.colors.len());
        for color in &palette.colors {
            let [red, green, blue, opacity] = color.to_be_bytes();
            rgb.extend_from_slice(&[red, green, blue]);
            alpha.push(opacity);
        }
        encoder.set_color(png::ColorType::Indexed);
        encoder.set_depth(palette.depth);
        encoder.set_palette(rgb);
        while alpha.last() == Some(&255) {
            alpha.pop();
        }
        if !alpha.is_empty() {
            encoder.set_trns(alpha);
        }
        encoder.set_deflate_compression(png::DeflateCompression::Level(6));
        encoder.set_filter(png::Filter::NoFilter);
    } else {
        encoder.set_color(if channels == 3 {
            png::ColorType::Rgb
        } else {
            png::ColorType::Rgba
        });
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_deflate_compression(png::DeflateCompression::Level(6));
        encoder.set_filter(if output_height > source_height {
            png::Filter::Up
        } else {
            png::Filter::Adaptive
        });
    }

    let mut writer = encoder.write_header().map_err(|error| error.to_string())?;
    let row_len = if let Some(palette) = palette.as_ref() {
        let bits = u64::from(output_width)
            .checked_mul(palette.bits as u64)
            .ok_or_else(|| "PNG output row is too large.".to_string())?;
        usize::try_from((bits + 7) / 8).map_err(|_| "PNG output row is too large.".to_string())?
    } else {
        usize::try_from(u64::from(output_width) * channels as u64)
            .map_err(|_| "PNG output row is too large.".to_string())?
    };
    let mut row = vec![0u8; row_len];
    let integer_repeat = integer_scale_repeat(source_width, output_width);
    let horizontal_runs = if integer_repeat.is_some() {
        None
    } else {
        Some(scaled_source_runs(source_width, output_width)?)
    };
    let vertical_repeat = integer_scale_repeat(source_height, output_height);
    let vertical_runs = if vertical_repeat.is_some() {
        None
    } else {
        Some(scaled_source_runs(source_height, output_height)?)
    };
    let progress_stride = (output_height / 200).max(1);
    let mut completed_rows = 0u32;
    let batch_rows = (PNG_ROW_BATCH_BYTES / row_len.max(1)).clamp(1, 128);
    let mut row_batch = vec![0u8; row_len.saturating_mul(batch_rows)];
    {
        let mut stream = writer
            .stream_writer_with_size(PNG_STREAM_BUFFER_BYTES)
            .map_err(|error| error.to_string())?;
        let mut write_source_row = |source_y: u32, output_len: u32| -> Result<(), String> {
            if is_canceled() {
                return Err(SCALED_PNG_EXPORT_CANCELED.to_string());
            }
            if let Some(palette) = palette.as_ref() {
                match &source_format {
                    ScaledPngSourceFormat::Rgba => fill_indexed_png_row(
                        &mut row,
                        source,
                        source_width,
                        source_y,
                        horizontal_runs.as_deref(),
                        integer_repeat,
                        palette,
                    )?,
                    ScaledPngSourceFormat::Indexed(_) => fill_indexed_source_row(
                        &mut row,
                        source,
                        source_width,
                        source_y,
                        horizontal_runs.as_deref(),
                        integer_repeat,
                        palette,
                    )?,
                }
            } else {
                match &source_format {
                    ScaledPngSourceFormat::Rgba => fill_truecolor_png_row(
                        &mut row,
                        source,
                        source_width,
                        source_y,
                        horizontal_runs.as_deref(),
                        integer_repeat,
                        channels,
                        !force_rgba,
                    )?,
                    ScaledPngSourceFormat::Indexed(colors) => fill_truecolor_indexed_row(
                        &mut row,
                        source,
                        source_width,
                        source_y,
                        horizontal_runs.as_deref(),
                        integer_repeat,
                        channels,
                        !force_rgba,
                        colors,
                    )?,
                }
            }
            if is_canceled() {
                return Err(SCALED_PNG_EXPORT_CANCELED.to_string());
            }
            let mut remaining_rows = output_len;
            while remaining_rows > 0 {
                if is_canceled() {
                    return Err(SCALED_PNG_EXPORT_CANCELED.to_string());
                }
                let write_rows = remaining_rows.min(batch_rows as u32);
                if write_rows == 1 {
                    stream.write_all(&row).map_err(|error| error.to_string())?;
                } else {
                    let batch_len = row_len
                        .checked_mul(write_rows as usize)
                        .ok_or_else(|| "PNG output row batch is too large.".to_string())?;
                    for target in row_batch[..batch_len].chunks_exact_mut(row_len) {
                        target.copy_from_slice(&row);
                    }
                    stream
                        .write_all(&row_batch[..batch_len])
                        .map_err(|error| error.to_string())?;
                }
                completed_rows += write_rows;
                remaining_rows -= write_rows;
                if completed_rows == output_height || completed_rows % progress_stride == 0 {
                    on_progress(f64::from(completed_rows) / f64::from(output_height) * 99.0);
                }
            }
            Ok(())
        };
        if let Some(repeat) = vertical_repeat {
            for source_y in 0..source_height {
                write_source_row(source_y, repeat as u32)?;
            }
        } else {
            for vertical_run in vertical_runs
                .as_deref()
                .ok_or_else(|| "PNG vertical scaling plan is missing.".to_string())?
            {
                write_source_row(vertical_run.source, vertical_run.output_len)?;
            }
        }
        if is_canceled() {
            return Err(SCALED_PNG_EXPORT_CANCELED.to_string());
        }
        stream.finish().map_err(|error| error.to_string())?;
    }
    writer.finish().map_err(|error| error.to_string())?;
    if is_canceled() {
        return Err(SCALED_PNG_EXPORT_CANCELED.to_string());
    }
    on_progress(100.0);
    Ok(indexed)
}

fn merge_project_archive<R: Read + Seek, W: Write + Seek>(
    source: R,
    patch: &[u8],
    output: W,
) -> Result<(), String> {
    let mut source_archive = zip::ZipArchive::new(source).map_err(|error| error.to_string())?;
    let mut patch_archive =
        zip::ZipArchive::new(Cursor::new(patch)).map_err(|error| error.to_string())?;
    let plan = {
        let mut entry = patch_archive
            .by_name(SAVE_PLAN_ENTRY)
            .map_err(|error| error.to_string())?;
        let mut bytes = Vec::with_capacity(entry.size().min(1024 * 1024) as usize);
        entry
            .read_to_end(&mut bytes)
            .map_err(|error| error.to_string())?;
        serde_json::from_slice::<ProjectSavePlan>(&bytes).map_err(|error| error.to_string())?
    };
    if !(1..=2).contains(&plan.version) || plan.entries.is_empty() {
        return Err("Invalid incremental save plan.".to_string());
    }
    let mut names = HashSet::new();
    for entry in &plan.entries {
        if entry.path.is_empty()
            || entry.path == SAVE_PLAN_ENTRY
            || !names.insert(entry.path.clone())
            || entry.width == Some(0)
            || entry.height == Some(0)
            || entry
                .encoding
                .as_deref()
                .is_some_and(|value| !matches!(value, "raw" | "sparse-tiles-v1"))
        {
            return Err("Invalid incremental save entry.".to_string());
        }
    }
    let mut patch_names = HashSet::new();
    for index in 0..patch_archive.len() {
        let entry = patch_archive
            .by_index(index)
            .map_err(|error| error.to_string())?;
        if entry.name() == SAVE_PLAN_ENTRY {
            continue;
        }
        if !patch_names.insert(entry.name().to_string()) {
            return Err("Incremental patch contains duplicate entries.".to_string());
        }
        if names.contains(entry.name()) {
            return Err("Incremental save entry conflicts with patch data.".to_string());
        }
        names.insert(entry.name().to_string());
    }
    let mut writer = zip::ZipWriter::new(output);
    for index in 0..patch_archive.len() {
        let entry = patch_archive
            .by_index(index)
            .map_err(|error| error.to_string())?;
        if entry.name() == SAVE_PLAN_ENTRY {
            continue;
        }
        writer
            .raw_copy_file(entry)
            .map_err(|error| error.to_string())?;
    }
    for reuse in plan.entries {
        let entry = source_archive
            .by_name(&reuse.path)
            .map_err(|error| error.to_string())?;
        if entry.crc32() != reuse.crc32 {
            return Err("Incremental save source changed.".to_string());
        }
        if let Some(byte_length) = reuse.byte_length {
            if entry.size() != byte_length {
                return Err("Incremental save source length changed.".to_string());
            }
        } else if plan.version >= 2 {
            return Err("Incremental save plan is missing resource length.".to_string());
        }
        writer
            .raw_copy_file(entry)
            .map_err(|error| error.to_string())?;
    }
    writer
        .finish()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn collect_manifest_file_references(value: &serde_json::Value, references: &mut HashSet<String>) {
    match value {
        serde_json::Value::Object(object) => {
            for (key, value) in object {
                if matches!(key.as_str(), "dataFile" | "colorsFile") {
                    if let Some(path) = value.as_str() {
                        references.insert(path.to_string());
                    }
                }
                collect_manifest_file_references(value, references);
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                collect_manifest_file_references(value, references);
            }
        }
        _ => {}
    }
}

fn validate_project_archive<R: Read + Seek>(source: R) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(source).map_err(|error| error.to_string())?;
    let mut names = HashSet::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let name = entry.name();
        if name.is_empty() || name.contains('\\') || name.starts_with('/') || name.contains("..") {
            return Err("工程压缩包包含无效资源路径。".to_string());
        }
        if !names.insert(name.to_string()) {
            return Err("工程压缩包包含重复资源。".to_string());
        }
    }
    let mut manifest_entry = archive
        .by_name("manifest.json")
        .map_err(|error| format!("工程压缩包缺少清单：{error}"))?;
    if manifest_entry.size() > 16 * 1024 * 1024 {
        return Err("工程清单过大。".to_string());
    }
    let mut manifest_bytes = Vec::with_capacity(manifest_entry.size() as usize);
    manifest_entry
        .read_to_end(&mut manifest_bytes)
        .map_err(|error| error.to_string())?;
    drop(manifest_entry);
    let manifest = serde_json::from_slice::<serde_json::Value>(&manifest_bytes)
        .map_err(|error| format!("工程清单无效：{error}"))?;
    if manifest.get("app").and_then(serde_json::Value::as_str) != Some("MoonSprite")
        || !manifest
            .get("document")
            .is_some_and(serde_json::Value::is_object)
    {
        return Err("工程清单不是有效的 MoonSprite 工程。".to_string());
    }
    let mut references = HashSet::new();
    collect_manifest_file_references(&manifest, &mut references);
    for path in references {
        if !names.contains(&path) {
            return Err(format!("工程清单引用了缺失资源：{path}"));
        }
    }
    Ok(())
}

fn validate_project_archive_file(path: &Path) -> Result<(), String> {
    let file = fs::File::open(path).map_err(|error| error.to_string())?;
    validate_project_archive(file)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPreview {
    preview: Vec<u8>,
    width: u32,
    height: u32,
    color_mode: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryReadProgress {
    bytes_read: u64,
    total_bytes: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectPreviewCacheMetadata {
    source_size: u64,
    source_modified_at: u64,
    width: u32,
    height: u32,
    color_mode: String,
}

fn project_preview_cache_paths(
    app: &AppHandle,
    file_path: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    file_path.to_lowercase().hash(&mut hasher);
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("project-previews");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let key = format!("{:016x}", hasher.finish());
    Ok((
        directory.join(format!("{key}.json")),
        directory.join(format!("{key}.png")),
    ))
}

fn source_fingerprint(path: &Path) -> Result<(u64, u64), String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or_default();
    Ok((metadata.len(), modified_at))
}

fn supports_preview_cache(path: &Path) -> bool {
    if is_moonsprite_backup_path(path) {
        return true;
    }
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| {
            matches!(
                value.to_ascii_lowercase().as_str(),
                "moonsprite" | "ase" | "aseprite" | "psd" | "png" | "jpg" | "jpeg" | "webp" | "bmp" | "gif"
            )
        })
}

fn is_moonsprite_backup_path(path: &Path) -> bool {
    path.to_string_lossy()
        .to_ascii_lowercase()
        .ends_with(".moonsprite.bak")
}

fn is_moonsprite_project_path(path: &Path) -> bool {
    is_moonsprite_backup_path(path)
        || path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("moonsprite"))
}

fn write_project_preview_cache(
    app: &AppHandle,
    file_path: &str,
    preview: &[u8],
    width: u32,
    height: u32,
    color_mode: &str,
) -> Result<(), String> {
    if preview.is_empty()
        || width == 0
        || height == 0
        || !matches!(color_mode, "rgba" | "indexed" | "grayscale")
    {
        return Err("工程缩略图数据无效。".to_string());
    }
    let path = Path::new(file_path);
    let (source_size, source_modified_at) = source_fingerprint(path)?;
    let (cache_metadata_path, cache_preview_path) = project_preview_cache_paths(app, file_path)?;
    let cache = ProjectPreviewCacheMetadata {
        source_size,
        source_modified_at,
        width,
        height,
        color_mode: color_mode.to_string(),
    };
    let metadata = serde_json::to_vec(&cache).map_err(|error| error.to_string())?;
    atomic_write(&cache_preview_path, preview)?;
    atomic_write(&cache_metadata_path, &metadata)
}

#[tauri::command]
pub fn file_exists(file_path: String) -> bool {
    Path::new(&file_path).is_file()
}

#[tauri::command]
pub fn read_binary(
    file_path: String,
    on_progress: Channel<BinaryReadProgress>,
) -> Result<Response, String> {
    let mut file = fs::File::open(&file_path).map_err(|error| error.to_string())?;
    let total_bytes = file.metadata().map_err(|error| error.to_string())?.len();
    let capacity = usize::try_from(total_bytes).unwrap_or(0);
    let mut output = Vec::with_capacity(capacity);
    let mut chunk = vec![0_u8; 256 * 1024];
    let mut bytes_read = 0_u64;
    let _ = on_progress.send(BinaryReadProgress {
        bytes_read,
        total_bytes,
    });
    loop {
        let count = file.read(&mut chunk).map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        output.extend_from_slice(&chunk[..count]);
        bytes_read = bytes_read.saturating_add(count as u64);
        let _ = on_progress.send(BinaryReadProgress {
            bytes_read,
            total_bytes,
        });
    }
    Ok(Response::new(output))
}

#[tauri::command]
pub fn read_project_preview(app: AppHandle, file_path: String) -> Result<ProjectPreview, String> {
    let path = Path::new(&file_path);
    if !supports_preview_cache(path) {
        return Err("该文件类型不支持首页缩略图缓存。".to_string());
    }
    let (source_size, source_modified_at) = source_fingerprint(path)?;
    let (cache_metadata_path, cache_preview_path) = project_preview_cache_paths(&app, &file_path)?;
    if let Ok(cache_metadata_bytes) = fs::read(&cache_metadata_path) {
        if let Ok(cache) =
            serde_json::from_slice::<ProjectPreviewCacheMetadata>(&cache_metadata_bytes)
        {
            if cache.source_size == source_size && cache.source_modified_at == source_modified_at {
                if let Ok(preview) = fs::read(&cache_preview_path) {
                    if !preview.is_empty() {
                        return Ok(ProjectPreview {
                            preview,
                            width: cache.width,
                            height: cache.height,
                            color_mode: cache.color_mode,
                        });
                    }
                }
            }
        }
    }
    if !is_moonsprite_project_path(path) {
        return Err("该文件尚未生成首页缩略图。".to_string());
    }
    let file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| error.to_string())?;
    let manifest = {
        let mut entry = archive
            .by_name("manifest.json")
            .map_err(|error| format!("无法读取工程清单：{error}"))?;
        let mut bytes = Vec::with_capacity(entry.size().min(256 * 1024) as usize);
        entry
            .read_to_end(&mut bytes)
            .map_err(|error| error.to_string())?;
        serde_json::from_slice::<serde_json::Value>(&bytes).map_err(|error| error.to_string())?
    };
    let document = manifest
        .get("document")
        .ok_or_else(|| "工程清单缺少文档信息。".to_string())?;
    let width = document
        .get("width")
        .and_then(|value| value.as_u64())
        .and_then(|value| u32::try_from(value).ok())
        .ok_or_else(|| "工程宽度无效。".to_string())?;
    let height = document
        .get("height")
        .and_then(|value| value.as_u64())
        .and_then(|value| u32::try_from(value).ok())
        .ok_or_else(|| "工程高度无效。".to_string())?;
    let color_mode = document
        .get("colorMode")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "rgba" | "indexed" | "grayscale"))
        .ok_or_else(|| "工程颜色模式无效。".to_string())?
        .to_string();
    let preview = {
        let mut entry = archive
            .by_name("preview.png")
            .map_err(|error| format!("无法读取工程缩略图：{error}"))?;
        let mut bytes = Vec::with_capacity(entry.size().min(4 * 1024 * 1024) as usize);
        entry
            .read_to_end(&mut bytes)
            .map_err(|error| error.to_string())?;
        bytes
    };
    if preview.is_empty() {
        return Err("工程缩略图为空。".to_string());
    }
    let _ = write_project_preview_cache(&app, &file_path, &preview, width, height, &color_mode);
    Ok(ProjectPreview {
        preview,
        width,
        height,
        color_mode,
    })
}

#[tauri::command]
pub fn cache_project_preview(
    app: AppHandle,
    file_path: String,
    preview: Vec<u8>,
    width: u32,
    height: u32,
    color_mode: String,
) -> Result<(), String> {
    if !supports_preview_cache(Path::new(&file_path)) {
        return Err("该文件类型不支持首页缩略图缓存。".to_string());
    }
    write_project_preview_cache(&app, &file_path, &preview, width, height, &color_mode)
}

#[tauri::command]
pub fn write_binary_atomic(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let file_path = request_path(&request, FILE_PATH_HEADER)?;
    let data = raw_request_data(&request)?;
    let path = Path::new(&file_path);
    if is_moonsprite_backup_path(path) {
        return Err("工程备份为只读文件，请另存为新的 .moonsprite 工程。".to_string());
    }
    if is_moonsprite_project_path(path) {
        atomic_write_with_validation_and_backup(
            path,
            &project_backup_directory(&app)?,
            |output| output.write_all(data).map_err(|error| error.to_string()),
            validate_project_archive_file,
        )
    } else {
        atomic_write(path, data)
    }
}

#[tauri::command]
pub fn cancel_scaled_png_export(state: State<'_, ScaledPngCancellation>, operation_id: String) {
    state.request(operation_id);
}

#[tauri::command]
pub async fn write_scaled_png_atomic(
    app: AppHandle,
    state: State<'_, ScaledPngCancellation>,
    request: Request<'_>,
) -> Result<ScaledPngWriteResult, String> {
    let file_path = request_path(&request, FILE_PATH_HEADER)?;
    let source_width = request_positive_u32_header(&request, SOURCE_WIDTH_HEADER)?;
    let source_height = request_positive_u32_header(&request, SOURCE_HEIGHT_HEADER)?;
    let output_width = request_positive_u32_header(&request, OUTPUT_WIDTH_HEADER)?;
    let output_height = request_positive_u32_header(&request, OUTPUT_HEIGHT_HEADER)?;
    let force_rgba = request_boolean_header(&request, FORCE_RGBA_HEADER)?;
    let source_format = request_source_format(&request)?;
    let operation_id = request_string_header(&request, OPERATION_ID_HEADER)?;
    let source = raw_request_data(&request)?;
    let expected_source_len = match &source_format {
        ScaledPngSourceFormat::Rgba => checked_rgba_len(source_width, source_height)?,
        ScaledPngSourceFormat::Indexed(_) => checked_pixel_len(source_width, source_height, 1)?,
    };
    if source.len() != expected_source_len {
        return Err(match &source_format {
            ScaledPngSourceFormat::Rgba => "Invalid PNG source pixel length.",
            ScaledPngSourceFormat::Indexed(_) => "Invalid indexed PNG source pixel length.",
        }
        .to_string());
    }
    let source = source.to_vec();
    let cancellation = state.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        let mut indexed = false;
        let write_result = atomic_write_with(Path::new(&file_path), |output| {
            let write_canceled = cancellation.clone();
            let write_operation_id = operation_id.clone();
            let mut buffered = BufWriter::with_capacity(PNG_FILE_BUFFER_BYTES, output);
            indexed = write_scaled_png_with_source(
                &mut buffered,
                &source,
                source_width,
                source_height,
                output_width,
                output_height,
                source_format,
                force_rgba,
                |value| {
                    let _ = app.emit(
                        SCALED_PNG_PROGRESS_EVENT,
                        ScaledPngProgress {
                            operation_id: operation_id.clone(),
                            value,
                        },
                    );
                },
                || write_canceled.is_requested(&write_operation_id),
            )?;
            buffered.flush().map_err(|error| error.to_string())?;
            if cancellation.is_requested(&operation_id) {
                return Err(SCALED_PNG_EXPORT_CANCELED.to_string());
            }
            Ok(())
        });
        cancellation.clear(&operation_id);
        write_result?;
        Ok(ScaledPngWriteResult { indexed })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn write_project_incremental(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let file_path = request_path(&request, FILE_PATH_HEADER)?;
    let source_path = request_path(&request, SOURCE_PATH_HEADER)?;
    if is_moonsprite_backup_path(Path::new(&file_path)) {
        return Err("工程备份为只读文件，请另存为新的 .moonsprite 工程。".to_string());
    }
    let patch = raw_request_data(&request)?.to_vec();
    let backup_directory = project_backup_directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let source = fs::File::open(&source_path).map_err(|error| error.to_string())?;
        atomic_write_with_validation_and_backup(
            Path::new(&file_path),
            &backup_directory,
            |output| merge_project_archive(source, &patch, output),
            validate_project_archive_file,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        decode_file_path_header, merge_project_archive, parse_palette_hex, supports_preview_cache,
        validate_project_archive, write_scaled_png, write_scaled_png_with_source,
        ScaledPngSourceFormat, SAVE_PLAN_ENTRY, SCALED_PNG_EXPORT_CANCELED,
    };
    use std::io::{Cursor, Read, Write};
    use std::path::Path;
    use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

    fn archive(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        for (name, data) in entries {
            writer
                .start_file(
                    *name,
                    SimpleFileOptions::default()
                        .compression_method(zip::CompressionMethod::Deflated),
                )
                .unwrap();
            writer.write_all(data).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    #[test]
    fn decodes_unicode_windows_file_paths() {
        assert_eq!(
            decode_file_path_header("D%3A%5CMoonSprite%5C%E5%9B%BE%E6%A0%87.moonsprite").unwrap(),
            "D:\\MoonSprite\\图标.moonsprite"
        );
    }

    #[test]
    fn rejects_invalid_path_encoding() {
        assert!(decode_file_path_header("D%3A%5Cbroken%ZZ").is_err());
        assert!(decode_file_path_header("D%3A%5Cbroken%").is_err());
    }

    #[test]
    fn decodes_compact_indexed_source_palettes() {
        assert_eq!(
            parse_palette_hex("00000000ff8040ff").unwrap(),
            vec![0x00000000, 0xff8040ff]
        );
        assert!(parse_palette_hex("fff").is_err());
    }

    #[test]
    fn accepts_every_supported_home_thumbnail_format() {
        for file_name in [
            "project.moonsprite",
            "project.moonsprite.bak",
            "sprite.ase",
            "sprite.aseprite",
            "sprite.psd",
            "sprite.png",
            "sprite.jpg",
            "sprite.jpeg",
            "sprite.webp",
            "sprite.bmp",
            "sprite.gif",
        ] {
            assert!(supports_preview_cache(Path::new(file_name)), "{file_name}");
        }
        assert!(!supports_preview_cache(Path::new("notes.txt")));
        assert!(!supports_preview_cache(Path::new("notes.bak")));
    }

    #[test]
    fn streams_nearest_neighbor_rgba_png_rows() {
        let source = [255, 0, 0, 255, 0, 0, 255, 128];
        let mut encoded = Vec::new();
        let mut progress = Vec::new();
        assert!(!write_scaled_png(
            &mut encoded,
            &source,
            2,
            1,
            4,
            2,
            true,
            |value| {
                progress.push(value);
            },
            || false
        )
        .unwrap());
        assert_eq!(progress.first(), Some(&0.0));
        assert_eq!(progress.last(), Some(&100.0));
        assert!(progress.windows(2).all(|values| values[0] <= values[1]));

        let decoder = png::Decoder::new(Cursor::new(encoded));
        let mut reader = decoder.read_info().unwrap();
        let mut pixels = vec![0; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut pixels).unwrap();
        assert_eq!(info.width, 4);
        assert_eq!(info.height, 2);
        assert_eq!(info.color_type, png::ColorType::Rgba);
        let expected_row = [
            255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 128, 0, 0, 255, 128,
        ];
        assert_eq!(
            &pixels[..info.buffer_size()],
            [expected_row, expected_row].concat()
        );
    }

    #[test]
    fn keeps_nearest_neighbor_mapping_for_non_integer_scaling() {
        let source = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255];
        let mut encoded = Vec::new();
        assert!(
            !write_scaled_png(&mut encoded, &source, 3, 1, 5, 2, true, |_| {}, || false).unwrap()
        );

        let decoder = png::Decoder::new(Cursor::new(encoded));
        let mut reader = decoder.read_info().unwrap();
        let mut pixels = vec![0; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut pixels).unwrap();
        let expected_row = [
            255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
        ];
        assert_eq!(
            &pixels[..info.buffer_size()],
            [expected_row, expected_row].concat()
        );
    }

    #[test]
    fn keeps_png_auto_indexed_without_allocating_the_scaled_surface() {
        let source = [10, 20, 30, 255, 40, 50, 60, 0];
        let mut encoded = Vec::new();
        assert!(write_scaled_png(
            &mut encoded,
            &source,
            2,
            1,
            200,
            100,
            false,
            |_| {},
            || false
        )
        .unwrap());

        let reader = png::Decoder::new(Cursor::new(encoded)).read_info().unwrap();
        assert_eq!(reader.info().width, 200);
        assert_eq!(reader.info().height, 100);
        assert_eq!(reader.info().color_type, png::ColorType::Indexed);
    }

    #[test]
    fn writes_indexed_rows_for_non_integer_scaling() {
        let source = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255];
        let mut encoded = Vec::new();
        assert!(
            write_scaled_png(&mut encoded, &source, 3, 1, 5, 2, false, |_| {}, || false).unwrap()
        );

        let decoder = png::Decoder::new(Cursor::new(encoded));
        let mut reader = decoder.read_info().unwrap();
        assert_eq!(reader.info().color_type, png::ColorType::Indexed);
        let mut pixels = vec![0; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut pixels).unwrap();
        assert_eq!(&pixels[..info.buffer_size()], &[5, 128, 5, 128]);
    }

    #[test]
    fn streams_compact_indexed_sources_without_rgba_expansion() {
        let source = [0, 1, 2, 1];
        let palette = vec![0x00000000, 0xff0000ff, 0x0000ffff, 0x00ff00ff];
        let mut encoded = Vec::new();
        assert!(write_scaled_png_with_source(
            &mut encoded,
            &source,
            2,
            2,
            4,
            4,
            ScaledPngSourceFormat::Indexed(palette),
            false,
            |_| {},
            || false,
        )
        .unwrap());

        let decoder = png::Decoder::new(Cursor::new(encoded));
        let mut reader = decoder.read_info().unwrap();
        assert_eq!(reader.info().color_type, png::ColorType::Indexed);
        assert_eq!(
            reader.info().palette.as_ref().map(|palette| palette.len()),
            Some(9)
        );
        let mut pixels = vec![0; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut pixels).unwrap();
        assert_eq!(info.width, 4);
        assert_eq!(info.height, 4);
        assert_eq!(&pixels[..info.buffer_size()], &[5, 5, 165, 165]);
    }

    #[test]
    fn converts_compact_indexed_sources_to_rgba_when_requested() {
        let source = [0, 1];
        let palette = vec![0x00000000, 0xff8040ff];
        let mut encoded = Vec::new();
        assert!(!write_scaled_png_with_source(
            &mut encoded,
            &source,
            2,
            1,
            2,
            1,
            ScaledPngSourceFormat::Indexed(palette),
            true,
            |_| {},
            || false,
        )
        .unwrap());

        let decoder = png::Decoder::new(Cursor::new(encoded));
        let mut reader = decoder.read_info().unwrap();
        assert_eq!(reader.info().color_type, png::ColorType::Rgba);
        let mut pixels = vec![0; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut pixels).unwrap();
        assert_eq!(
            &pixels[..info.buffer_size()],
            &[0, 0, 0, 0, 255, 128, 64, 255]
        );
    }

    #[test]
    fn collapses_hidden_rgb_variants_when_auto_indexing_transparent_pixels() {
        let mut source = Vec::with_capacity(257 * 4);
        source.extend_from_slice(&[255, 0, 0, 255]);
        for color in 0..256u16 {
            source.extend_from_slice(&[color as u8, (color >> 8) as u8, 127, 0]);
        }
        let mut encoded = Vec::new();
        assert!(write_scaled_png(
            &mut encoded,
            &source,
            257,
            1,
            257,
            1,
            false,
            |_| {},
            || false
        )
        .unwrap());

        let reader = png::Decoder::new(Cursor::new(encoded)).read_info().unwrap();
        assert_eq!(reader.info().color_type, png::ColorType::Indexed);
    }

    #[test]
    fn writes_opaque_non_indexed_png_as_rgb() {
        let mut source = Vec::with_capacity(257 * 4);
        for color in 0..257u16 {
            source.extend_from_slice(&[color as u8, (color >> 8) as u8, 0, 255]);
        }
        let mut encoded = Vec::new();
        assert!(!write_scaled_png(
            &mut encoded,
            &source,
            257,
            1,
            257,
            1,
            false,
            |_| {},
            || false
        )
        .unwrap());

        let decoder = png::Decoder::new(Cursor::new(encoded));
        let mut reader = decoder.read_info().unwrap();
        assert_eq!(reader.info().color_type, png::ColorType::Rgb);
        let mut pixels = vec![0; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut pixels).unwrap();
        let expected = source
            .chunks_exact(4)
            .flat_map(|pixel| pixel[..3].iter().copied())
            .collect::<Vec<_>>();
        assert_eq!(&pixels[..info.buffer_size()], expected);
    }

    #[test]
    fn keeps_transparent_non_indexed_png_as_rgba() {
        let mut source = Vec::with_capacity(257 * 4);
        for color in 0..257u16 {
            source.extend_from_slice(&[
                color as u8,
                (color >> 8) as u8,
                0,
                if color == 256 { 128 } else { 255 },
            ]);
        }
        let mut encoded = Vec::new();
        assert!(!write_scaled_png(
            &mut encoded,
            &source,
            257,
            1,
            257,
            1,
            false,
            |_| {},
            || false
        )
        .unwrap());

        let reader = png::Decoder::new(Cursor::new(encoded)).read_info().unwrap();
        assert_eq!(reader.info().color_type, png::ColorType::Rgba);
    }

    #[test]
    fn stops_scaled_png_encoding_when_canceled() {
        let source = [255, 0, 0, 255];
        let mut encoded = Vec::new();
        let result = write_scaled_png(&mut encoded, &source, 1, 1, 100, 100, true, |_| {}, || true);
        assert_eq!(result, Err(SCALED_PNG_EXPORT_CANCELED.to_string()));
        assert!(encoded.is_empty());
    }

    #[test]
    #[ignore = "manual PNG export performance probe"]
    fn benchmarks_scaled_png_streaming_export() {
        let source_width = 1024;
        let source_height = 1024;
        let mut source = Vec::with_capacity(source_width * source_height * 4);
        for y in 0..source_height {
            for x in 0..source_width {
                source.extend_from_slice(&[x as u8, y as u8, (x ^ y) as u8, 255]);
            }
        }

        let started = std::time::Instant::now();
        let mut encoded = Vec::new();
        assert!(!write_scaled_png(
            &mut encoded,
            &source,
            source_width as u32,
            source_height as u32,
            10240,
            10240,
            false,
            |_| {},
            || false,
        )
        .unwrap());
        eprintln!(
            "scaled PNG probe: elapsed={:?}, bytes={}",
            started.elapsed(),
            encoded.len()
        );
    }

    #[test]
    #[ignore = "manual indexed PNG export performance probe"]
    fn benchmarks_compact_indexed_png_export() {
        let source_width = 1024;
        let source_height = 1024;
        let source = (0..source_width * source_height)
            .map(|index| ((index / source_width + index) % 4) as u8)
            .collect::<Vec<_>>();
        let palette = vec![0x00000000, 0x202020ff, 0x2979ffff, 0xff7043ff];

        let started = std::time::Instant::now();
        let mut encoded = Vec::new();
        assert!(write_scaled_png_with_source(
            &mut encoded,
            &source,
            source_width as u32,
            source_height as u32,
            10240,
            10240,
            ScaledPngSourceFormat::Indexed(palette),
            false,
            |_| {},
            || false,
        )
        .unwrap());
        eprintln!(
            "compact indexed PNG probe: elapsed={:?}, bytes={}",
            started.elapsed(),
            encoded.len()
        );
    }

    #[test]
    fn merges_changed_entries_with_raw_reused_blocks() {
        let source = archive(&[
            ("layers/a.rgba", b"unchanged pixels"),
            ("manifest.json", b"old"),
        ]);
        let crc32 = ZipArchive::new(Cursor::new(&source))
            .unwrap()
            .by_name("layers/a.rgba")
            .unwrap()
            .crc32();
        let plan =
            format!(r#"{{"version":1,"entries":[{{"path":"layers/a.rgba","crc32":{crc32}}}]}}"#);
        let patch = archive(&[
            ("manifest.json", b"new"),
            (SAVE_PLAN_ENTRY, plan.as_bytes()),
        ]);

        let mut merged = Cursor::new(Vec::new());
        merge_project_archive(Cursor::new(&source), &patch, &mut merged).unwrap();
        let mut output = ZipArchive::new(Cursor::new(merged.into_inner())).unwrap();
        let mut manifest = String::new();
        output
            .by_name("manifest.json")
            .unwrap()
            .read_to_string(&mut manifest)
            .unwrap();
        let mut pixels = String::new();
        output
            .by_name("layers/a.rgba")
            .unwrap()
            .read_to_string(&mut pixels)
            .unwrap();
        assert_eq!(manifest, "new");
        assert_eq!(pixels, "unchanged pixels");
        assert!(output.by_name(SAVE_PLAN_ENTRY).is_err());
    }

    #[test]
    fn rejects_reuse_when_the_source_crc_changed() {
        let source = archive(&[("layers/a.rgba", b"changed externally")]);
        let plan = br#"{"version":1,"entries":[{"path":"layers/a.rgba","crc32":1}]}"#;
        let patch = archive(&[("manifest.json", b"new"), (SAVE_PLAN_ENTRY, plan)]);
        assert!(
            merge_project_archive(Cursor::new(&source), &patch, Cursor::new(Vec::new())).is_err()
        );
    }

    #[test]
    fn rejects_reuse_when_the_source_length_changed() {
        let source = archive(&[("layers/a.rgba", b"changed size")]);
        let plan =
            br#"{"version":2,"entries":[{"path":"layers/a.rgba","crc32":0,"byteLength":1}]}"#;
        let patch = archive(&[
            ("manifest.json", br#"{"app":"MoonSprite","document":{}}"#),
            (SAVE_PLAN_ENTRY, plan),
        ]);
        assert!(
            merge_project_archive(Cursor::new(&source), &patch, Cursor::new(Vec::new())).is_err()
        );
    }

    #[test]
    fn validates_manifest_resource_references_without_reading_pixel_payloads() {
        let valid = archive(&[
            (
                "manifest.json",
                br#"{"app":"MoonSprite","document":{"layers":[{"dataFile":"layers/a.rgba"}]}}"#,
            ),
            ("layers/a.rgba", b"pixels"),
        ]);
        validate_project_archive(Cursor::new(&valid)).unwrap();

        let missing = archive(&[(
            "manifest.json",
            br#"{"app":"MoonSprite","document":{"layers":[{"dataFile":"layers/missing.rgba"}]}}"#,
        )]);
        assert!(validate_project_archive(Cursor::new(&missing)).is_err());
    }
}
