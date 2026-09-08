//! Native cursor fallback for software-cursor mode.
//!
//! CSS image cursors are normally promoted to a native cursor by WebView2. If
//! the renderer is stalled while a cursor value is being changed, WebView2 can
//! briefly fall back to the Windows arrow. Installing the bundled MoonSprite
//! cursor on the window and its WebView child windows gives the platform a
//! stable native cursor to keep displaying until the renderer catches up.

#[cfg(windows)]
mod windows_cursor {
    use std::{
        collections::HashMap,
        io::Cursor,
        mem::size_of,
        ptr::{copy_nonoverlapping, null_mut},
        sync::{Mutex, OnceLock},
    };

    use windows_sys::Win32::{
        Foundation::{BOOL, HWND, LPARAM},
        Graphics::Gdi::{
            CreateBitmap, CreateDIBSection, DeleteObject, GetDC, ReleaseDC, BITMAPINFO,
            BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP,
        },
        UI::WindowsAndMessaging::{
            CreateIconIndirect, EnumChildWindows, GetClassLongPtrW, SetClassLongPtrW, SetCursor,
            GCLP_HCURSOR, HCURSOR, ICONINFO,
        },
    };

    const CURSOR_BYTES: &[u8] =
        include_bytes!("../../src/renderer/src/assets/pixel-icons/01-Slice-1.png");
    const CURSOR_HOTSPOT: (u32, u32) = (9, 5);

    // Raw Win32 handles are represented as usize so the cache remains safely
    // shareable between Tauri command calls. The cursor is intentionally kept
    // alive for the process lifetime; destroying an active HCURSOR is unsafe.
    static CURSOR_HANDLE: OnceLock<Result<usize, String>> = OnceLock::new();
    static ORIGINAL_CLASS_CURSORS: OnceLock<Mutex<HashMap<usize, usize>>> = OnceLock::new();

    fn class_cursors() -> &'static Mutex<HashMap<usize, usize>> {
        ORIGINAL_CLASS_CURSORS.get_or_init(|| Mutex::new(HashMap::new()))
    }

    fn make_cursor() -> Result<usize, String> {
        let mut decoder = png::Decoder::new(Cursor::new(CURSOR_BYTES));
        // The bundled cursor is palette encoded. Expand it up front so the
        // Win32 bitmap always receives a predictable RGBA buffer.
        decoder.set_transformations(png::Transformations::ALPHA);
        let mut reader = decoder.read_info().map_err(|error| error.to_string())?;
        let mut pixels = vec![
            0;
            reader
                .output_buffer_size()
                .ok_or("cursor PNG has no output buffer")?
        ];
        let info = reader
            .next_frame(&mut pixels)
            .map_err(|error| error.to_string())?;
        if info.width == 0 || info.height == 0 || info.width > 64 || info.height > 64 {
            return Err("cursor PNG dimensions are outside the Win32 cursor limit".to_string());
        }
        if info.color_type != png::ColorType::Rgba || info.bit_depth != png::BitDepth::Eight {
            return Err("cursor PNG must be 8-bit RGBA".to_string());
        }

        let header = BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: info.width as i32,
            // A top-down DIB keeps the asset's pixel order intact.
            biHeight: -(info.height as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        };
        let bitmap_info = BITMAPINFO {
            bmiHeader: header,
            bmiColors: [unsafe { std::mem::zeroed() }],
        };
        let screen_dc = unsafe { GetDC(null_mut()) };
        if screen_dc.is_null() {
            return Err("GetDC failed while creating the native cursor".to_string());
        }
        let mut dib_bits = null_mut();
        let color_bitmap = unsafe {
            CreateDIBSection(
                screen_dc,
                &bitmap_info,
                DIB_RGB_COLORS,
                &mut dib_bits,
                null_mut(),
                0,
            )
        };
        unsafe { ReleaseDC(null_mut(), screen_dc) };
        if color_bitmap.is_null() || dib_bits.is_null() {
            return Err("CreateDIBSection failed while creating the native cursor".to_string());
        }

        // Win32 32-bit icon bitmaps use BGRA channel order.
        let mut bgra = Vec::with_capacity((info.width * info.height * 4) as usize);
        for rgba in pixels[..info.buffer_size()].chunks_exact(4) {
            bgra.extend_from_slice(&[rgba[2], rgba[1], rgba[0], rgba[3]]);
        }
        unsafe {
            copy_nonoverlapping(bgra.as_ptr(), dib_bits.cast::<u8>(), bgra.len());
        }

        // A 1-bit all-white mask keeps transparent pixels transparent while
        // allowing the 32-bit colour bitmap's alpha channel to drive the
        // visible shape.
        let mask_stride = ((info.width as usize + 15) / 16) * 2;
        let mask_bits = vec![0xFFu8; mask_stride * info.height as usize];
        let mask_bitmap: HBITMAP = unsafe {
            CreateBitmap(
                info.width as i32,
                info.height as i32,
                1,
                1,
                mask_bits.as_ptr().cast(),
            )
        };
        if mask_bitmap.is_null() {
            unsafe { DeleteObject(color_bitmap.cast()) };
            return Err("CreateBitmap failed while creating the native cursor mask".to_string());
        }
        let icon_info = ICONINFO {
            fIcon: 0,
            xHotspot: CURSOR_HOTSPOT.0.min(info.width - 1),
            yHotspot: CURSOR_HOTSPOT.1.min(info.height - 1),
            hbmMask: mask_bitmap,
            hbmColor: color_bitmap,
        };
        let cursor = unsafe { CreateIconIndirect(&icon_info) };
        unsafe {
            DeleteObject(color_bitmap.cast());
            DeleteObject(mask_bitmap.cast());
        }
        if cursor.is_null() {
            return Err("CreateIconIndirect failed while creating the native cursor".to_string());
        }
        Ok(cursor as usize)
    }

    fn cursor_handle() -> Result<HCURSOR, String> {
        CURSOR_HANDLE
            .get_or_init(make_cursor)
            .as_ref()
            .copied()
            .map(|handle| handle as HCURSOR)
            .map_err(Clone::clone)
    }

    unsafe extern "system" fn install_on_child(hwnd: HWND, enabled: LPARAM) -> BOOL {
        install_on_window(hwnd, enabled != 0);
        1
    }

    fn install_on_window(hwnd: HWND, enabled: bool) {
        if hwnd.is_null() {
            return;
        }
        let key = hwnd as usize;
        if enabled {
            if let Ok(mut originals) = class_cursors().lock() {
                originals
                    .entry(key)
                    .or_insert_with(|| unsafe { GetClassLongPtrW(hwnd, GCLP_HCURSOR) });
            }
            if let Ok(cursor) = cursor_handle() {
                unsafe {
                    SetClassLongPtrW(hwnd, GCLP_HCURSOR, cursor as isize);
                    SetCursor(cursor);
                }
            }
        } else if let Ok(mut originals) = class_cursors().lock() {
            if let Some(original) = originals.remove(&key) {
                unsafe { SetClassLongPtrW(hwnd, GCLP_HCURSOR, original as isize) };
            }
        }
    }

    pub fn set_native_cursor(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
        let hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as HWND;
        if enabled {
            let _ = cursor_handle()?;
            install_on_window(hwnd, true);
            unsafe { EnumChildWindows(hwnd, Some(install_on_child), 1) };
        } else {
            install_on_window(hwnd, false);
            unsafe { EnumChildWindows(hwnd, Some(install_on_child), 0) };
        }
        Ok(())
    }
}

#[cfg(not(windows))]
#[tauri::command]
pub fn set_native_cursor(_window: tauri::WebviewWindow, _enabled: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
#[tauri::command]
pub fn set_native_cursor(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    windows_cursor::set_native_cursor(window, enabled)
}
