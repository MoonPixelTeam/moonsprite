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
        Foundation::{BOOL, HWND, LPARAM, POINT, WPARAM},
        Graphics::Gdi::{
            CreateBitmap, CreateDIBSection, DeleteObject, GetDC, ReleaseDC, ScreenToClient,
            BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, RGBQUAD,
        },
        UI::{
            Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
            WindowsAndMessaging::{
                CreateIconIndirect, EnumChildWindows, GetClassLongPtrW, SetClassLongPtrW,
                SetCursor, SetWindowPos, GCLP_HCURSOR, HCURSOR, HTTRANSPARENT, ICONINFO,
                SWP_NOACTIVATE, SWP_NOZORDER, WM_NCDESTROY, WM_NCHITTEST,
            },
        },
    };

    const CURSOR_BYTES: &[u8] =
        include_bytes!("../../src/renderer/src/assets/pixel-icons/01-Slice-1.png");
    const CURSOR_HOTSPOT: (u32, u32) = (9, 5);

    // Raw Win32 handles are represented as usize so the caches remain safely
    // shareable between Tauri command calls. Cursor and subclass handles stay
    // alive for the process lifetime.
    static CURSOR_HANDLE: OnceLock<Result<usize, String>> = OnceLock::new();
    static ORIGINAL_CLASS_CURSORS: OnceLock<Mutex<HashMap<usize, usize>>> = OnceLock::new();
    static HIT_REGIONS: OnceLock<Mutex<HashMap<usize, Vec<(i32, i32, i32, i32)>>>> =
        OnceLock::new();
    const HIT_TEST_SUBCLASS_ID: usize = 0x4d53_4854;

    fn class_cursors() -> &'static Mutex<HashMap<usize, usize>> {
        ORIGINAL_CLASS_CURSORS.get_or_init(|| Mutex::new(HashMap::new()))
    }

    fn hit_regions() -> &'static Mutex<HashMap<usize, Vec<(i32, i32, i32, i32)>>> {
        HIT_REGIONS.get_or_init(|| Mutex::new(HashMap::new()))
    }

    fn delete_bitmap(bitmap: HBITMAP) {
        unsafe { DeleteObject(bitmap.cast()) };
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
            bmiColors: [RGBQUAD {
                rgbBlue: 0,
                rgbGreen: 0,
                rgbRed: 0,
                rgbReserved: 0,
            }],
        };
        let screen_dc = unsafe { GetDC(null_mut()) };
        if screen_dc.is_null() {
            return Err("GetDC failed while creating the native cursor".to_string());
        }
        let mut dib_bits = null_mut();
        let color_bitmap = unsafe {
            let bitmap = CreateDIBSection(
                screen_dc,
                &bitmap_info,
                DIB_RGB_COLORS,
                &mut dib_bits,
                null_mut(),
                0,
            );
            ReleaseDC(null_mut(), screen_dc);
            bitmap
        };
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
            delete_bitmap(color_bitmap);
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
        delete_bitmap(color_bitmap);
        delete_bitmap(mask_bitmap);
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

    unsafe extern "system" fn hit_test_subclass(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _subclass_id: usize,
        root_handle: usize,
    ) -> isize {
        if message == WM_NCHITTEST {
            let mut point = POINT {
                x: (lparam as u32 & 0xffff) as i16 as i32,
                y: ((lparam as u32 >> 16) & 0xffff) as i16 as i32,
            };
            if ScreenToClient(root_handle as HWND, &mut point) != 0 {
                let is_opaque = hit_regions()
                    .lock()
                    .map(|regions| {
                        regions.get(&root_handle).is_none_or(|rectangles| {
                            rectangles.iter().any(|&(left, top, right, bottom)| {
                                point.x >= left
                                    && point.x < right
                                    && point.y >= top
                                    && point.y < bottom
                            })
                        })
                    })
                    .unwrap_or(true);
                if !is_opaque {
                    return HTTRANSPARENT as isize;
                }
            }
        } else if message == WM_NCDESTROY {
            RemoveWindowSubclass(hwnd, Some(hit_test_subclass), HIT_TEST_SUBCLASS_ID);
            if hwnd as usize == root_handle {
                if let Ok(mut regions) = hit_regions().lock() {
                    regions.remove(&root_handle);
                }
            }
        }
        DefSubclassProc(hwnd, message, wparam, lparam)
    }

    unsafe extern "system" fn install_hit_test_on_child(hwnd: HWND, root: LPARAM) -> BOOL {
        SetWindowSubclass(
            hwnd,
            Some(hit_test_subclass),
            HIT_TEST_SUBCLASS_ID,
            root as usize,
        );
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

    pub fn set_window_bounds(
        window: &tauri::WebviewWindow,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> Result<(), String> {
        let hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as HWND;
        let updated = unsafe {
            SetWindowPos(
                hwnd,
                null_mut(),
                x,
                y,
                width as i32,
                height as i32,
                SWP_NOACTIVATE | SWP_NOZORDER,
            )
        };
        if updated == 0 {
            return Err(format!(
                "无法调整扩展窗口边界：{}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(())
    }

    pub fn set_window_hit_region(
        window: &tauri::WebviewWindow,
        rectangles: &[(i32, i32, i32, i32)],
    ) -> Result<(), String> {
        let hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as HWND;
        let root_handle = hwnd as usize;
        hit_regions()
            .lock()
            .map_err(|_| "扩展窗口命中区域状态不可用。".to_string())?
            .insert(root_handle, rectangles.to_vec());
        unsafe {
            if SetWindowSubclass(
                hwnd,
                Some(hit_test_subclass),
                HIT_TEST_SUBCLASS_ID,
                root_handle,
            ) == 0
            {
                if let Ok(mut regions) = hit_regions().lock() {
                    regions.remove(&root_handle);
                }
                return Err("无法安装扩展窗口命中测试。".to_string());
            }
            EnumChildWindows(hwnd, Some(install_hit_test_on_child), hwnd as LPARAM);
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

#[cfg(windows)]
pub(crate) fn set_window_hit_region(
    window: &tauri::WebviewWindow,
    rectangles: &[(i32, i32, i32, i32)],
) -> Result<(), String> {
    windows_cursor::set_window_hit_region(window, rectangles)
}

#[cfg(windows)]
pub(crate) fn set_window_bounds(
    window: &tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    windows_cursor::set_window_bounds(window, x, y, width, height)
}

#[cfg(not(windows))]
pub(crate) fn set_window_hit_region(
    _window: &tauri::WebviewWindow,
    _rectangles: &[(i32, i32, i32, i32)],
) -> Result<(), String> {
    Ok(())
}
