use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
};

use crate::platform_extensions;

const PET_WINDOW_LABEL: &str = "moonpet";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExtensionPetBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExtensionPetHitSpan {
    x: u32,
    y: u32,
    width: u32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PetPosition {
    extension_id: String,
    pet_id: String,
    x: f64,
    y: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PetInspection {
    extension_id: String,
    pet_id: String,
    x: i32,
    y: i32,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExtensionPetSummary {
    name: String,
    width: u32,
    height: u32,
    color_mode: String,
    layer_count: usize,
    frame_count: usize,
    dirty: bool,
    drawing_minutes: u64,
    animation_state: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PetConfiguration {
    extension_id: String,
    pet_id: String,
    summary: ExtensionPetSummary,
}

fn pet_url(extension_id: &str, pet_id: &str) -> WebviewUrl {
    WebviewUrl::App(
        format!("index.html?moonpet=1&extensionId={extension_id}&petId={pet_id}").into(),
    )
}

#[cfg(windows)]
fn bind_pet_to_main_window(
    pet: &tauri::WebviewWindow,
    main: &tauri::WebviewWindow,
) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowLongPtrW, GWLP_HWNDPARENT};

    let pet_handle = pet.hwnd().map_err(|error| error.to_string())?;
    let main_handle = main.hwnd().map_err(|error| error.to_string())?;
    // An owned window remains above its owner but is not globally topmost.
    unsafe { SetWindowLongPtrW(pet_handle.0 as _, GWLP_HWNDPARENT, main_handle.0 as isize) };
    Ok(())
}

#[cfg(not(windows))]
fn bind_pet_to_main_window(
    _pet: &tauri::WebviewWindow,
    _main: &tauri::WebviewWindow,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub(crate) fn read_extension_pet_sprite(
    extension_id: String,
    pet_id: String,
) -> Result<Vec<u8>, String> {
    platform_extensions::read_enabled_pet_sprite(&extension_id, &pet_id)
}

#[tauri::command]
pub(crate) async fn show_extension_pet(
    app: AppHandle,
    extension_id: String,
    pet_id: String,
    bounds: ExtensionPetBounds,
    summary: ExtensionPetSummary,
) -> Result<(), String> {
    // Validate before a renderer can request a pet window or an asset.
    let _ = platform_extensions::read_enabled_pet_sprite(&extension_id, &pet_id)?;
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在。".to_string())?;
    let window = if let Some(window) = app.get_webview_window(PET_WINDOW_LABEL) {
        window
    } else {
        WebviewWindowBuilder::new(&app, PET_WINDOW_LABEL, pet_url(&extension_id, &pet_id))
            .title("MoonSprite Pet")
            .decorations(false)
            .transparent(true)
            .owner(&main)
            .map_err(|error| format!("无法绑定宠物窗口：{error}"))?
            .skip_taskbar(true)
            .focusable(true)
            .resizable(false)
            .shadow(false)
            .visible(false)
            .build()
            .map_err(|error| format!("无法创建宠物窗口：{error}"))?
    };
    window
        .set_always_on_top(false)
        .map_err(|error| error.to_string())?;
    bind_pet_to_main_window(&window, &main)?;
    window
        .set_size(PhysicalSize::new(bounds.width.max(1), bounds.height.max(1)))
        .map_err(|error| error.to_string())?;
    window
        .set_position(PhysicalPosition::new(bounds.x, bounds.y))
        .map_err(|error| error.to_string())?;
    let configuration = PetConfiguration {
        extension_id,
        pet_id,
        summary,
    };
    let delayed_window = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(120));
        let _ = delayed_window.emit("pet:config", configuration);
    });
    window.show().map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(windows)]
fn primary_pointer_is_pressed() -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};

    unsafe { GetAsyncKeyState(VK_LBUTTON as i32) < 0 }
}

#[cfg(not(windows))]
fn primary_pointer_is_pressed() -> bool {
    true
}

#[tauri::command]
pub(crate) fn start_extension_pet_drag_if_primary_pressed(
    window: tauri::WebviewWindow,
) -> Result<bool, String> {
    if window.label() != PET_WINDOW_LABEL || !primary_pointer_is_pressed() {
        return Ok(false);
    }
    window.start_dragging().map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
pub(crate) fn set_extension_pet_hit_region(
    app: AppHandle,
    source_width: u32,
    source_height: u32,
    spans: Vec<ExtensionPetHitSpan>,
) -> Result<(), String> {
    if source_width == 0 || source_height == 0 || spans.len() > 131_072 {
        return Err("宠物命中区域无效。".to_string());
    }
    if spans.iter().any(|span| {
        span.width == 0
            || span.x >= source_width
            || span.y >= source_height
            || span.width > source_width - span.x
    }) {
        return Err("宠物命中区域超出动画帧。".to_string());
    }
    let pet = app
        .get_webview_window(PET_WINDOW_LABEL)
        .ok_or_else(|| "宠物窗口不存在。".to_string())?;
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::HWND;
        use windows_sys::Win32::Graphics::Gdi::{
            CombineRgn, CreateRectRgn, DeleteObject, SetWindowRgn, RGN_OR,
        };

        let handle = pet.hwnd().map_err(|error| error.to_string())?;
        let size = pet.inner_size().map_err(|error| error.to_string())?;
        let region = unsafe { CreateRectRgn(0, 0, 0, 0) };
        if region.is_null() {
            return Err("无法创建宠物命中区域。".to_string());
        }
        for span in spans {
            let left = (u64::from(span.x) * u64::from(size.width) / u64::from(source_width)) as i32;
            let right = (u64::from(span.x + span.width) * u64::from(size.width)
                / u64::from(source_width)) as i32;
            let top =
                (u64::from(span.y) * u64::from(size.height) / u64::from(source_height)) as i32;
            let bottom =
                (u64::from(span.y + 1) * u64::from(size.height) / u64::from(source_height)) as i32;
            let row = unsafe { CreateRectRgn(left, top, right.max(left + 1), bottom.max(top + 1)) };
            if row.is_null() {
                unsafe { DeleteObject(region as _) };
                return Err("无法创建宠物命中区域。".to_string());
            }
            unsafe { CombineRgn(region, region, row, RGN_OR) };
            unsafe { DeleteObject(row as _) };
        }
        // SetWindowRgn takes ownership of the region on success.
        // The sprite changes frames frequently. Redrawing the whole WebView for each
        // hit-region update makes transparent windows visibly flash on Windows.
        let applied = unsafe { SetWindowRgn(handle.0 as HWND, region, 0) };
        if applied == 0 {
            unsafe { DeleteObject(region as _) };
            return Err("无法应用宠物命中区域。".to_string());
        }
    }
    #[cfg(not(windows))]
    let _ = pet;
    Ok(())
}

#[tauri::command]
pub(crate) fn hide_extension_pet(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(PET_WINDOW_LABEL) {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn report_extension_pet_position(
    app: AppHandle,
    extension_id: String,
    pet_id: String,
) -> Result<(), String> {
    let pet = app
        .get_webview_window(PET_WINDOW_LABEL)
        .ok_or_else(|| "宠物窗口不存在。".to_string())?;
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在。".to_string())?;
    let (pet_position, pet_size, main_position, main_size) = (
        pet.outer_position(),
        pet.inner_size(),
        main.outer_position(),
        main.inner_size(),
    );
    let pet_position = pet_position.map_err(|error| error.to_string())?;
    let pet_size = pet_size.map_err(|error| error.to_string())?;
    let main_position = main_position.map_err(|error| error.to_string())?;
    let main_size = main_size.map_err(|error| error.to_string())?;
    main.emit(
        "pet:position",
        PetPosition {
            extension_id,
            pet_id,
            x: (pet_position.x - main_position.x) as f64
                / f64::from(main_size.width.saturating_sub(pet_size.width).max(1)),
            y: (pet_position.y - main_position.y) as f64
                / f64::from(main_size.height.saturating_sub(pet_size.height).max(1)),
        },
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) fn report_extension_pet_inspection(
    app: AppHandle,
    extension_id: String,
    pet_id: String,
) -> Result<(), String> {
    let pet = app
        .get_webview_window(PET_WINDOW_LABEL)
        .ok_or_else(|| "宠物窗口不存在。".to_string())?;
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在。".to_string())?;
    let pet_position = pet.outer_position().map_err(|error| error.to_string())?;
    let main_position = main.outer_position().map_err(|error| error.to_string())?;
    main.emit(
        "pet:inspect",
        PetInspection {
            extension_id,
            pet_id,
            x: pet_position.x - main_position.x,
            y: pet_position.y - main_position.y,
        },
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}
