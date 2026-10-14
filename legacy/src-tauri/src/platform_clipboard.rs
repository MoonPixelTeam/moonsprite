use arboard::{Clipboard, ImageData};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use tauri::ipc::Response;

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardImageSize {
    width: usize,
    height: usize,
}

fn image_bytes(width: usize, height: usize) -> Result<usize, String> {
    let pixels = width
        .checked_mul(height)
        .ok_or_else(|| "剪贴板图像尺寸过大。".to_string())?;
    let bytes = pixels
        .checked_mul(4)
        .ok_or_else(|| "剪贴板图像尺寸过大。".to_string())?;
    if width == 0 || height == 0 || bytes > 64 * 1024 * 1024 {
        return Err("剪贴板图像尺寸无效或超过 64 MiB 限制。".to_string());
    }
    Ok(bytes)
}

#[tauri::command]
pub fn write_clipboard_image(width: usize, height: usize, data: Vec<u8>) -> Result<(), String> {
    let expected = image_bytes(width, height)?;
    if data.len() != expected {
        return Err("剪贴板图像像素数据长度无效。".to_string());
    }
    let mut clipboard = Clipboard::new().map_err(|error| format!("无法访问系统剪贴板：{error}"))?;
    clipboard
        .set_image(ImageData {
            width,
            height,
            bytes: Cow::Owned(data),
        })
        .map_err(|error| format!("无法写入系统剪贴板：{error}"))
}

#[tauri::command]
pub fn read_clipboard_text() -> Result<Option<String>, String> {
    let mut clipboard = Clipboard::new()
        .map_err(|error| format!("Unable to access the system clipboard: {error}"))?;
    match clipboard.get_text() {
        Ok(text) => Ok(Some(text)),
        Err(arboard::Error::ContentNotAvailable) => Ok(None),
        Err(error) => Err(format!("Unable to read clipboard text: {error}")),
    }
}

#[tauri::command]
pub fn read_clipboard_image() -> Result<Response, String> {
    let mut clipboard = Clipboard::new().map_err(|error| format!("无法访问系统剪贴板：{error}"))?;
    match clipboard.get_image() {
        Ok(image) => {
            let expected = image_bytes(image.width, image.height)?;
            if image.bytes.len() != expected {
                return Err("系统剪贴板图像数据无效。".to_string());
            }
            let width = u32::try_from(image.width).map_err(|_| "系统剪贴板图像宽度无效。")?;
            let height = u32::try_from(image.height).map_err(|_| "系统剪贴板图像高度无效。")?;
            let mut payload = Vec::with_capacity(8 + expected);
            payload.extend_from_slice(&width.to_le_bytes());
            payload.extend_from_slice(&height.to_le_bytes());
            payload.extend_from_slice(image.bytes.as_ref());
            Ok(Response::new(payload))
        }
        Err(arboard::Error::ContentNotAvailable) => Ok(Response::new(Vec::new())),
        Err(error) => Err(format!("无法读取系统剪贴板图像：{error}")),
    }
}

fn clipboard_image_size_from_dib_header(header: &[u8]) -> Option<ClipboardImageSize> {
    if header.len() < 12 {
        return None;
    }
    let header_size = u32::from_le_bytes(header[0..4].try_into().ok()?);
    if header_size < 40 {
        return None;
    }
    let width = i32::from_le_bytes(header[4..8].try_into().ok()?).checked_abs()? as usize;
    let height = i32::from_le_bytes(header[8..12].try_into().ok()?).checked_abs()? as usize;
    image_bytes(width, height).ok()?;
    Some(ClipboardImageSize { width, height })
}

#[cfg(windows)]
#[tauri::command]
pub fn read_clipboard_image_size() -> Result<Option<ClipboardImageSize>, String> {
    use std::{ptr, slice};
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    };
    use windows_sys::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};

    const CF_DIB: u32 = 8;
    const CF_DIBV5: u32 = 17;

    struct ClipboardGuard;
    impl Drop for ClipboardGuard {
        fn drop(&mut self) {
            unsafe { CloseClipboard() };
        }
    }

    if unsafe { OpenClipboard(ptr::null_mut()) } == 0 {
        return Err("无法访问系统剪贴板。".to_string());
    }
    let _guard = ClipboardGuard;
    let format = [CF_DIBV5, CF_DIB]
        .into_iter()
        .find(|format| unsafe { IsClipboardFormatAvailable(*format) } != 0);
    let Some(format) = format else {
        return Ok(None);
    };
    let handle = unsafe { GetClipboardData(format) };
    if handle.is_null() {
        return Err("无法读取系统剪贴板图像尺寸。".to_string());
    }
    let byte_len = unsafe { GlobalSize(handle) };
    if byte_len < 12 {
        return Err("系统剪贴板图像头部无效。".to_string());
    }
    let pointer = unsafe { GlobalLock(handle) };
    if pointer.is_null() {
        return Err("无法锁定系统剪贴板图像数据。".to_string());
    }
    let header = unsafe { slice::from_raw_parts(pointer.cast::<u8>(), 12) };
    let size = clipboard_image_size_from_dib_header(header);
    unsafe { GlobalUnlock(handle) };
    size.map(Some)
        .ok_or_else(|| "系统剪贴板图像尺寸无效。".to_string())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn read_clipboard_image_size() -> Result<Option<ClipboardImageSize>, String> {
    let mut clipboard = Clipboard::new().map_err(|error| format!("无法访问系统剪贴板：{error}"))?;
    match clipboard.get_image() {
        Ok(image) => {
            image_bytes(image.width, image.height)?;
            Ok(Some(ClipboardImageSize {
                width: image.width,
                height: image.height,
            }))
        }
        Err(arboard::Error::ContentNotAvailable) => Ok(None),
        Err(error) => Err(format!("无法读取系统剪贴板图像：{error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::{clipboard_image_size_from_dib_header, image_bytes, ClipboardImageSize};

    #[test]
    fn validates_rgba_image_size_without_overflow() {
        assert_eq!(image_bytes(2, 3).unwrap(), 24);
        assert!(image_bytes(0, 3).is_err());
        assert!(image_bytes(usize::MAX, 2).is_err());
    }

    #[test]
    fn reads_dimensions_from_a_dib_header_without_pixel_data() {
        let mut header = [0_u8; 12];
        header[0..4].copy_from_slice(&40_u32.to_le_bytes());
        header[4..8].copy_from_slice(&320_i32.to_le_bytes());
        header[8..12].copy_from_slice(&(-180_i32).to_le_bytes());
        assert_eq!(
            clipboard_image_size_from_dib_header(&header),
            Some(ClipboardImageSize {
                width: 320,
                height: 180
            })
        );
    }
}
