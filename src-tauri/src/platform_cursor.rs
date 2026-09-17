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
        Foundation::{BOOL, HWND, LPARAM, POINT, RECT, WPARAM},
        Graphics::Gdi::{
            CombineRgn, CreateBitmap, CreateDIBSection, CreateRectRgn, DeleteObject, GetDC,
            ReleaseDC, ScreenToClient, SetWindowRgn, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
            DIB_RGB_COLORS, HBITMAP, RGBQUAD, RGN_OR,
        },
        UI::{
            Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
            WindowsAndMessaging::{
                CreateIconIndirect, EnumChildWindows, GetClassLongPtrW, GetCursorPos,
                GetWindowRect, IsChild, SetClassLongPtrW, SetCursor, SetWindowPos, WindowFromPoint,
                GCLP_HCURSOR, HCURSOR, HTTRANSPARENT, ICONINFO, SWP_NOACTIVATE, SWP_NOSIZE,
                SWP_NOZORDER, WM_NCDESTROY, WM_NCHITTEST, WM_SETCURSOR,
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
    static CURSOR_POLICIES: OnceLock<Mutex<HashMap<usize, CursorPolicy>>> = OnceLock::new();
    const WINDOW_SUBCLASS_ID: usize = 0x4d53_4854;

    /// Per-window software-cursor policy owned by the renderer.
    ///
    /// The bundled pixel pointer must only be installed while the window is in
    /// MoonSprite software-cursor mode. Extension windows live outside the main
    /// window and are created by the platform before any policy is known, so
    /// each one remembers its own policy and re-applies it on every re-show.
    #[derive(Clone, Copy, Debug)]
    pub struct CursorPolicy {
        pub use_local_cursors: bool,
    }

    fn class_cursors() -> &'static Mutex<HashMap<usize, usize>> {
        ORIGINAL_CLASS_CURSORS.get_or_init(|| Mutex::new(HashMap::new()))
    }

    fn hit_regions() -> &'static Mutex<HashMap<usize, Vec<(i32, i32, i32, i32)>>> {
        HIT_REGIONS.get_or_init(|| Mutex::new(HashMap::new()))
    }

    fn cursor_policies() -> &'static Mutex<HashMap<usize, CursorPolicy>> {
        CURSOR_POLICIES.get_or_init(|| Mutex::new(HashMap::new()))
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

    pub(crate) fn root_handle_of(window: &tauri::WebviewWindow) -> Result<usize, String> {
        let hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as HWND;
        if hwnd.is_null() {
            return Err("窗口句柄不可用。".to_string());
        }
        Ok(hwnd as usize)
    }

    pub(crate) fn stored_cursor_policy(root_handle: usize) -> Option<CursorPolicy> {
        cursor_policies()
            .lock()
            .ok()
            .and_then(|policies| policies.get(&root_handle).copied())
    }

    /// Install or remove the bundled pointer on `root_handle` according to the
    /// stored policy. A window with no policy yet keeps the platform default so
    /// callers that never opt in are untouched.

    fn install_window_subclass(
        root_handle: usize,
        rectangles: Option<&[(i32, i32, i32, i32)]>,
    ) -> Result<(), String> {
        let hwnd = root_handle as HWND;
        unsafe {
            if SetWindowSubclass(hwnd, Some(window_subclass), WINDOW_SUBCLASS_ID, root_handle) == 0
            {
                return Err("无法安装窗口命中测试。".to_string());
            }
            EnumChildWindows(hwnd, Some(install_subclass_on_child), hwnd as LPARAM);
            // A native region also excludes transparent pixels from cross-thread
            // WebView input routing, where HTTRANSPARENT alone is insufficient.
            if let Some(rectangles) = rectangles {
                let region = CreateRectRgn(0, 0, 0, 0);
                if region.is_null() {
                    return Err("无法创建扩展窗口区域。".to_string());
                }
                for &(left, top, right, bottom) in rectangles {
                    let part = CreateRectRgn(left, top, right, bottom);
                    if part.is_null() {
                        DeleteObject(region);
                        return Err("无法创建扩展内容区域。".to_string());
                    }
                    let combined = CombineRgn(region, region, part, RGN_OR);
                    DeleteObject(part);
                    if combined == 0 {
                        DeleteObject(region);
                        return Err("无法合并扩展内容区域。".to_string());
                    }
                }
                if SetWindowRgn(hwnd, region, 1) == 0 {
                    DeleteObject(region);
                    return Err("无法应用扩展窗口区域。".to_string());
                }
                // Windows owns region after a successful SetWindowRgn.
            }
        }
        Ok(())
    }

    /// One subclass owns both window behaviours that must beat WebView2:
    /// `HTTRANSPARENT` for hit-region passthrough and `WM_SETCURSOR` for the
    /// software-cursor policy. WebView2 re-asserts the class cursor on every
    /// `WM_SETCURSOR`, so the installed pointer has to be re-applied here rather
    /// than only through `SetClassLongPtrW`.
    unsafe extern "system" fn window_subclass(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _subclass_id: usize,
        root_handle: usize,
    ) -> isize {
        if message == WM_NCDESTROY {
            RemoveWindowSubclass(hwnd, Some(window_subclass), WINDOW_SUBCLASS_ID);
            if hwnd as usize == root_handle {
                if let Ok(mut regions) = hit_regions().lock() {
                    regions.remove(&root_handle);
                }
                if let Ok(mut policies) = cursor_policies().lock() {
                    policies.remove(&root_handle);
                }
                if let Ok(mut originals) = class_cursors().lock() {
                    originals.remove(&root_handle);
                }
            }
            return DefSubclassProc(hwnd, message, wparam, lparam);
        }
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
        }
        // A delayed WebView cursor message must never take over the canvas cursor.
        let mut pointer = POINT { x: 0, y: 0 };
        let owns_pointer = message == WM_SETCURSOR && GetCursorPos(&mut pointer) != 0 && {
            let target = WindowFromPoint(pointer);
            target == root_handle as HWND || IsChild(root_handle as HWND, target) != 0
        };
        if message == WM_SETCURSOR && !owns_pointer {
            return 0;
        }
        let result = DefSubclassProc(hwnd, message, wparam, lparam);
        if owns_pointer {
            let policy = cursor_policies()
                .lock()
                .ok()
                .and_then(|policies| policies.get(&root_handle).copied());
            if let Some(policy) = policy {
                if !policy.use_local_cursors {
                    if let Ok(cursor) = cursor_handle() {
                        SetCursor(cursor);
                        return 1;
                    }
                }
            }
        }
        result
    }

    unsafe extern "system" fn install_subclass_on_child(hwnd: HWND, root: LPARAM) -> BOOL {
        SetWindowSubclass(
            hwnd,
            Some(window_subclass),
            WINDOW_SUBCLASS_ID,
            root as usize,
        );
        1
    }

    pub fn set_native_cursor(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
        let root_handle = root_handle_of(&window)?;
        if enabled {
            let _ = cursor_handle()?;
        }
        install_on_window(root_handle as HWND, enabled);
        Ok(())
    }

    /// Apply one extension window's software-cursor policy.
    ///
    /// `use_local_cursors: true` delegates to the platform cursor; `false`
    /// installs the bundled pixel pointer and keeps it installed against
    /// WebView2's cursor re-assertions.
    pub fn set_cursor_policy(
        window: &tauri::WebviewWindow,
        use_local_cursors: bool,
    ) -> Result<(), String> {
        let root_handle = root_handle_of(window)?;
        cursor_policies()
            .lock()
            .map_err(|_| "窗口指针策略状态不可用。".to_string())?
            .insert(root_handle, CursorPolicy { use_local_cursors });
        install_window_subclass(root_handle, None)?;
        // Never change a shared window-class cursor or SetCursor from a background update.
        // WM_SETCURSOR applies the policy only while this window owns the pointer.
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
            let mut current: RECT = std::mem::zeroed();
            let same_size = GetWindowRect(hwnd, &mut current) != 0
                && current.right - current.left == width as i32
                && current.bottom - current.top == height as i32;
            SetWindowPos(
                hwnd,
                null_mut(),
                x,
                y,
                width as i32,
                height as i32,
                SWP_NOACTIVATE | SWP_NOZORDER | if same_size { SWP_NOSIZE } else { 0 },
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
        let root_handle = root_handle_of(window)?;
        {
            let mut regions = hit_regions()
                .lock()
                .map_err(|_| "扩展窗口命中区域状态不可用。".to_string())?;
            if regions
                .get(&root_handle)
                .is_some_and(|current| current.as_slice() == rectangles)
            {
                return Ok(());
            }
            regions.insert(root_handle, rectangles.to_vec());
        }
        if let Err(error) = install_window_subclass(root_handle, Some(rectangles)) {
            if let Ok(mut regions) = hit_regions().lock() {
                regions.remove(&root_handle);
            }
            return Err(error);
        }
        Ok(())
    }
}

#[cfg(not(windows))]
#[tauri::command]
pub fn set_native_cursor(_window: tauri::WebviewWindow, _enabled: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn set_extension_window_cursor_policy(
    _window: tauri::WebviewWindow,
    _use_local_cursors: bool,
) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
#[tauri::command]
pub fn set_native_cursor(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    windows_cursor::set_native_cursor(window, enabled)
}

#[cfg(windows)]
#[tauri::command]
pub fn set_extension_window_cursor_policy(
    window: tauri::WebviewWindow,
    use_local_cursors: bool,
) -> Result<(), String> {
    windows_cursor::set_cursor_policy(&window, use_local_cursors)
}

#[cfg(windows)]
pub(crate) fn set_window_hit_region(
    window: &tauri::WebviewWindow,
    rectangles: &[(i32, i32, i32, i32)],
) -> Result<(), String> {
    windows_cursor::set_window_hit_region(window, rectangles)
}

/// Re-arm a previously stored cursor policy when an existing window is re-shown.
#[cfg(windows)]
pub(crate) fn reapply_cursor_policy(window: &tauri::WebviewWindow) {
    let Ok(root_handle) = windows_cursor::root_handle_of(window) else {
        return;
    };
    let Some(policy) = windows_cursor::stored_cursor_policy(root_handle) else {
        return;
    };
    if let Err(error) = windows_cursor::set_cursor_policy(window, policy.use_local_cursors) {
        eprintln!("无法恢复扩展窗口指针策略：{error}");
    }
}

#[cfg(not(windows))]
pub(crate) fn reapply_cursor_policy(_window: &tauri::WebviewWindow) {}

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
