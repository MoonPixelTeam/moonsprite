use serde::{Deserialize, Serialize};
use std::hash::{DefaultHasher, Hash, Hasher};
use tauri::{
    webview::Color, AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};

#[cfg(not(windows))]
use tauri::{LogicalSize, PhysicalPosition};

use crate::{platform_cursor, platform_extensions};

const EXTENSION_WINDOW_PREFIX: &str = "msext-";
const MAX_HIT_SPANS: usize = 131_072;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExtensionWindowOptions {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    #[serde(default = "default_true")]
    transparent: bool,
    #[serde(default)]
    focusable: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExtensionWindowHitSpan {
    x: u32,
    y: u32,
    width: u32,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExtensionWindowBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn apply_extension_window_bounds(
    main: &tauri::WebviewWindow,
    window: &tauri::WebviewWindow,
    bounds: &ExtensionWindowBounds,
) -> Result<(), String> {
    if !(32..=2048).contains(&bounds.width) || !(32..=2048).contains(&bounds.height) {
        return Err("扩展窗口尺寸必须在 32 至 2048 像素之间。".to_string());
    }
    let main_position = main.outer_position().map_err(|error| error.to_string())?;
    let scale = main.scale_factor().map_err(|error| error.to_string())?;
    let x = main_position.x + (f64::from(bounds.x) * scale).round() as i32;
    let y = main_position.y + (f64::from(bounds.y) * scale).round() as i32;
    apply_native_window_bounds(
        window,
        x,
        y,
        (f64::from(bounds.width) * scale).round() as u32,
        (f64::from(bounds.height) * scale).round() as u32,
    )
}

#[cfg(windows)]
fn apply_native_window_bounds(
    window: &tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    platform_cursor::set_window_bounds(window, x, y, width, height)
}

#[cfg(not(windows))]
fn apply_native_window_bounds(
    window: &tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    window
        .set_size(LogicalSize::new(f64::from(width), f64::from(height)))
        .map_err(|error| error.to_string())?;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())
}

fn default_true() -> bool {
    true
}

fn extension_window_label(extension_id: &str, window_id: &str) -> String {
    format!(
        "{}{:016x}",
        extension_window_prefix(extension_id),
        hash_value(window_id)
    )
}

fn hash_value(value: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn extension_window_prefix(extension_id: &str) -> String {
    format!(
        "{EXTENSION_WINDOW_PREFIX}{:016x}-",
        hash_value(extension_id)
    )
}

fn extension_window_url(extension_id: &str, window_id: &str, resource_id: &str) -> WebviewUrl {
    WebviewUrl::App(
        format!(
            "index.html?extensionWindow=1&extensionId={extension_id}&windowId={window_id}&resourceId={resource_id}"
        )
        .into(),
    )
}

#[tauri::command]
pub(crate) async fn show_extension_window(
    app: AppHandle,
    extension_id: String,
    window_id: String,
    resource_id: String,
    options: ExtensionWindowOptions,
) -> Result<(), String> {
    platform_extensions::ensure_extension_runtime_permission(&extension_id, "windows")?;
    platform_extensions::read_enabled_runtime_resource(&extension_id, &resource_id)?;
    if window_id.is_empty()
        || window_id.len() > 80
        || !window_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
    {
        return Err("扩展窗口 ID 无效。".to_string());
    }
    if !(32..=2048).contains(&options.width) || !(32..=2048).contains(&options.height) {
        return Err("扩展窗口尺寸必须在 32 至 2048 像素之间。".to_string());
    }
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在。".to_string())?;
    let label = extension_window_label(&extension_id, &window_id);
    let window = if let Some(window) = app.get_webview_window(&label) {
        window
    } else {
        let builder = WebviewWindowBuilder::new(
            &app,
            &label,
            extension_window_url(&extension_id, &window_id, &resource_id),
        )
        .title("MoonSprite Extension")
        .decorations(false)
        .transparent(options.transparent);
        let builder = if options.transparent {
            builder.background_color(Color(0, 0, 0, 0))
        } else {
            builder
        };
        builder
        .owner(&main)
        .map_err(|error| format!("无法绑定扩展窗口：{error}"))?
        .skip_taskbar(true)
        .focusable(options.focusable)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .build()
        .map_err(|error| format!("无法创建扩展窗口：{error}"))?
    };
    window
        .set_always_on_top(false)
        .map_err(|error| error.to_string())?;
    if options.transparent {
        window
            .set_background_color(Some(Color(0, 0, 0, 0)))
            .map_err(|error| format!("无法设置扩展窗口透明背景：{error}"))?;
    }
    platform_cursor::set_native_cursor(window.clone(), true)?;
    apply_extension_window_bounds(
        &main,
        &window,
        &ExtensionWindowBounds {
            x: options.x,
            y: options.y,
            width: options.width,
            height: options.height,
        },
    )?;
    window.show().map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn close_extension_windows(
    app: AppHandle,
    extension_id: String,
    window_id: Option<String>,
) -> Result<(), String> {
    if extension_id.is_empty() || extension_id.len() > 80 {
        return Err("扩展 ID 无效。".to_string());
    }
    if let Some(window_id) = window_id {
        if let Some(window) =
            app.get_webview_window(&extension_window_label(&extension_id, &window_id))
        {
            window.close().map_err(|error| error.to_string())?;
        }
        return Ok(());
    }
    let prefix = extension_window_prefix(&extension_id);
    for (label, window) in app.webview_windows() {
        if label.starts_with(&prefix) {
            window.close().map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn emit_extension_window_message(
    app: AppHandle,
    extension_id: String,
    window_id: String,
    message: serde_json::Value,
) -> Result<(), String> {
    platform_extensions::ensure_extension_runtime_permission(&extension_id, "windows")?;
    let window = app
        .get_webview_window(&extension_window_label(&extension_id, &window_id))
        .ok_or_else(|| "扩展窗口不存在。".to_string())?;
    window
        .emit("extension:message", message)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn start_extension_window_drag(window: tauri::WebviewWindow) -> Result<(), String> {
    if !window.label().starts_with(EXTENSION_WINDOW_PREFIX) {
        return Err("当前窗口不是扩展窗口。".to_string());
    }
    window.start_dragging().map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn get_extension_window_bounds(
    app: AppHandle,
    window: tauri::WebviewWindow,
) -> Result<ExtensionWindowBounds, String> {
    if !window.label().starts_with(EXTENSION_WINDOW_PREFIX) {
        return Err("当前窗口不是扩展窗口。".to_string());
    }
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在。".to_string())?;
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let main_position = main.outer_position().map_err(|error| error.to_string())?;
    let size = window.inner_size().map_err(|error| error.to_string())?;
    let scale = main.scale_factor().map_err(|error| error.to_string())?;
    Ok(ExtensionWindowBounds {
        x: (f64::from(position.x - main_position.x) / scale).round() as i32,
        y: (f64::from(position.y - main_position.y) / scale).round() as i32,
        width: (f64::from(size.width) / scale).round().max(1.0) as u32,
        height: (f64::from(size.height) / scale).round().max(1.0) as u32,
    })
}

#[tauri::command]
pub(crate) fn set_extension_window_bounds(
    app: AppHandle,
    window: tauri::WebviewWindow,
    bounds: ExtensionWindowBounds,
) -> Result<(), String> {
    if !window.label().starts_with(EXTENSION_WINDOW_PREFIX) {
        return Err("当前窗口不是扩展窗口。".to_string());
    }
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在。".to_string())?;
    apply_extension_window_bounds(&main, &window, &bounds)
}

#[tauri::command]
pub(crate) fn set_extension_window_hit_region(
    window: tauri::WebviewWindow,
    source_width: u32,
    source_height: u32,
    spans: Vec<ExtensionWindowHitSpan>,
) -> Result<(), String> {
    if !window.label().starts_with(EXTENSION_WINDOW_PREFIX) {
        return Err("当前窗口不是扩展窗口。".to_string());
    }
    if source_width == 0 || source_height == 0 || spans.len() > MAX_HIT_SPANS {
        return Err("扩展窗口命中区域无效。".to_string());
    }
    if spans.iter().any(|span| {
        span.width == 0
            || span.x >= source_width
            || span.y >= source_height
            || span.width > source_width - span.x
    }) {
        return Err("扩展窗口命中区域超出内容范围。".to_string());
    }
    let size = window.inner_size().map_err(|error| error.to_string())?;
    let rectangles = spans
        .into_iter()
        .map(|span| {
            let left = (u64::from(span.x) * u64::from(size.width) / u64::from(source_width)) as i32;
            let right = (u64::from(span.x + span.width) * u64::from(size.width)
                / u64::from(source_width)) as i32;
            let top =
                (u64::from(span.y) * u64::from(size.height) / u64::from(source_height)) as i32;
            let bottom =
                (u64::from(span.y + 1) * u64::from(size.height) / u64::from(source_height)) as i32;
            (left, top, right, bottom)
        })
        .collect::<Vec<_>>();
    platform_cursor::set_window_hit_region(&window, &rectangles)
}
