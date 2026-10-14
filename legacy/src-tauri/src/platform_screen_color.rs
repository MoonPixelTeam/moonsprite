//! Reads the final rendered color at a point in MoonSprite's WebView.

use serde::Serialize;

#[derive(Serialize)]
pub struct ScreenColor {
    r: u8,
    g: u8,
    b: u8,
    a: u8,
}

fn colorref_to_screen_color(value: u32) -> ScreenColor {
    ScreenColor {
        r: (value & 0xff) as u8,
        g: ((value >> 8) & 0xff) as u8,
        b: ((value >> 16) & 0xff) as u8,
        a: 255,
    }
}

#[cfg(windows)]
fn capture_screen_region(x: i32, y: i32, radius: i32) -> Result<Vec<ScreenColor>, String> {
    use std::{mem::size_of, ptr::null_mut, slice};
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC,
        SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, SRCCOPY,
    };

    let diameter = radius * 2 + 1;
    let screen_dc = unsafe { GetDC(null_mut()) };
    if screen_dc.is_null() {
        return Err("Unable to read the screen color".to_string());
    }
    let memory_dc = unsafe { CreateCompatibleDC(screen_dc) };
    if memory_dc.is_null() {
        unsafe { ReleaseDC(null_mut(), screen_dc) };
        return Err("Unable to allocate the screen color sampler".to_string());
    }
    let bitmap_info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: diameter,
            // A top-down DIB preserves screen row order.
            biHeight: -diameter,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [unsafe { std::mem::zeroed() }],
    };
    let mut bits = null_mut();
    let bitmap = unsafe {
        CreateDIBSection(
            screen_dc,
            &bitmap_info,
            DIB_RGB_COLORS,
            &mut bits,
            null_mut(),
            0,
        )
    };
    if bitmap.is_null() || bits.is_null() {
        unsafe {
            DeleteDC(memory_dc);
            ReleaseDC(null_mut(), screen_dc);
        }
        return Err("Unable to allocate the screen color bitmap".to_string());
    }
    let previous = unsafe { SelectObject(memory_dc, bitmap) };
    let copied = unsafe {
        BitBlt(
            memory_dc,
            0,
            0,
            diameter,
            diameter,
            screen_dc,
            x.saturating_sub(radius),
            y.saturating_sub(radius),
            SRCCOPY,
        )
    };
    let result = if copied == 0 {
        Err("Unable to capture the screen color region".to_string())
    } else {
        let byte_len = (diameter * diameter * 4) as usize;
        let bytes = unsafe { slice::from_raw_parts(bits.cast::<u8>(), byte_len) };
        Ok(bytes
            .chunks_exact(4)
            .map(|bgra| ScreenColor {
                r: bgra[2],
                g: bgra[1],
                b: bgra[0],
                a: 255,
            })
            .collect())
    };
    unsafe {
        SelectObject(memory_dc, previous);
        DeleteObject(bitmap);
        DeleteDC(memory_dc);
        ReleaseDC(null_mut(), screen_dc);
    }
    result
}

#[cfg(windows)]
fn screen_point_for_client(
    window: &tauri::WebviewWindow,
    client_x: f64,
    client_y: f64,
) -> Result<(i32, i32), String> {
    if !client_x.is_finite() || !client_y.is_finite() {
        return Err("Invalid screen color sample position".to_string());
    }
    let origin = window.inner_position().map_err(|error| error.to_string())?;
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    let x = origin.x as f64 + client_x * scale;
    let y = origin.y as f64 + client_y * scale;
    if !(i32::MIN as f64..=i32::MAX as f64).contains(&x)
        || !(i32::MIN as f64..=i32::MAX as f64).contains(&y)
    {
        return Err("Screen color sample position is out of range".to_string());
    }
    Ok((x.round() as i32, y.round() as i32))
}

#[tauri::command]
pub async fn sample_window_color(
    window: tauri::WebviewWindow,
    client_x: f64,
    client_y: f64,
) -> Result<ScreenColor, String> {
    #[cfg(windows)]
    {
        use std::ptr::null_mut;
        use windows_sys::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC, CLR_INVALID};

        let (x, y) = screen_point_for_client(&window, client_x, client_y)?;
        return tauri::async_runtime::spawn_blocking(move || {
            let screen_dc = unsafe { GetDC(null_mut()) };
            if screen_dc.is_null() {
                return Err("Unable to read the screen color".to_string());
            }
            let value = unsafe { GetPixel(screen_dc, x, y) };
            unsafe { ReleaseDC(null_mut(), screen_dc) };
            if value == CLR_INVALID {
                return Err("Unable to read the screen color".to_string());
            }
            Ok(colorref_to_screen_color(value))
        })
        .await
        .map_err(|error| error.to_string())?;
    }

    #[cfg(not(windows))]
    {
        let _ = (window, client_x, client_y);
        Err("Screen color sampling is only available on Windows".to_string())
    }
}

#[tauri::command]
pub async fn sample_window_color_region(
    window: tauri::WebviewWindow,
    client_x: f64,
    client_y: f64,
    radius: u8,
) -> Result<Vec<ScreenColor>, String> {
    #[cfg(windows)]
    {
        if radius > 12 {
            return Err("Screen color sample radius is out of range".to_string());
        }
        let (x, y) = screen_point_for_client(&window, client_x, client_y)?;
        return tauri::async_runtime::spawn_blocking(move || {
            capture_screen_region(x, y, i32::from(radius))
        })
        .await
        .map_err(|error| error.to_string())?;
    }

    #[cfg(not(windows))]
    {
        let _ = (window, client_x, client_y, radius);
        Err("Screen color sampling is only available on Windows".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::colorref_to_screen_color;

    #[test]
    fn decodes_win32_colorref_channel_order() {
        let color = colorref_to_screen_color(0x0034_12_ab);
        assert_eq!(
            (color.r, color.g, color.b, color.a),
            (0xab, 0x12, 0x34, 255)
        );
    }
}
