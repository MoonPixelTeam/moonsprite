#![allow(non_snake_case)]

use std::{
    ffi::c_void,
    io::{Cursor, Read},
    ptr,
    sync::{
        atomic::{AtomicU32, Ordering},
        Mutex,
    },
};

use image::{imageops::FilterType, DynamicImage, ImageFormat};
use windows::{
    core::{implement, ComObject, Error, IUnknown, Interface, Ref, Result, BOOL, GUID, HRESULT},
    Win32::{
        Foundation::{
            CLASS_E_CLASSNOTAVAILABLE, CLASS_E_NOAGGREGATION, E_FAIL, E_INVALIDARG, E_POINTER,
            HMODULE, S_FALSE, S_OK,
        },
        Graphics::Gdi::{
            CreateDIBSection, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP,
        },
        System::{
            Com::{IClassFactory, IClassFactory_Impl, IStream, STREAM_SEEK_SET},
            LibraryLoader::DisableThreadLibraryCalls,
        },
        UI::Shell::{
            IThumbnailProvider, IThumbnailProvider_Impl,
            PropertiesSystem::{IInitializeWithStream, IInitializeWithStream_Impl},
            WTSAT_ARGB, WTS_ALPHATYPE,
        },
    },
};
use zip::ZipArchive;

const MAX_PROJECT_BYTES: usize = 512 * 1024 * 1024;
const MAX_PREVIEW_BYTES: u64 = 64 * 1024 * 1024;
const APPLICATION_ICON_PNG: &[u8] = include_bytes!("../../icons/128x128.png");
static ACTIVE_OBJECTS: AtomicU32 = AtomicU32::new(0);
static SERVER_LOCKS: AtomicU32 = AtomicU32::new(0);

pub const THUMBNAIL_PROVIDER_CLSID: GUID = GUID::from_u128(0x1a7c2847_2cd7_4d31_98f0_4d844840e2b7);

fn com_error(code: HRESULT) -> Error {
    Error::from_hresult(code)
}

#[implement(IInitializeWithStream, IThumbnailProvider)]
struct ThumbnailProvider {
    stream: Mutex<Option<IStream>>,
}

impl ThumbnailProvider {
    fn new() -> Self {
        ACTIVE_OBJECTS.fetch_add(1, Ordering::Relaxed);
        Self {
            stream: Mutex::new(None),
        }
    }

    fn read_project(&self) -> Result<Vec<u8>> {
        let stream = self
            .stream
            .lock()
            .map_err(|_| com_error(E_FAIL))?
            .clone()
            .ok_or_else(|| com_error(E_FAIL))?;

        unsafe { stream.Seek(0, STREAM_SEEK_SET, None)? };

        let mut bytes = Vec::new();
        let mut chunk = [0u8; 64 * 1024];
        loop {
            let mut read = 0u32;
            let result = unsafe {
                stream.Read(
                    chunk.as_mut_ptr().cast(),
                    chunk.len() as u32,
                    Some(&mut read),
                )
            };
            if result.is_err() {
                return Err(Error::from_hresult(result));
            }
            if read == 0 {
                break;
            }
            let next_len = bytes
                .len()
                .checked_add(read as usize)
                .filter(|length| *length <= MAX_PROJECT_BYTES)
                .ok_or_else(|| com_error(E_FAIL))?;
            bytes.reserve(next_len - bytes.len());
            bytes.extend_from_slice(&chunk[..read as usize]);
        }
        Ok(bytes)
    }

    fn decode_preview(&self) -> Result<DynamicImage> {
        let project = self.read_project()?;
        let mut archive = ZipArchive::new(Cursor::new(project)).map_err(|_| com_error(E_FAIL))?;
        let mut entry = archive
            .by_name("preview.png")
            .map_err(|_| com_error(E_FAIL))?;
        if entry.size() > MAX_PREVIEW_BYTES {
            return Err(com_error(E_FAIL));
        }

        let mut png = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut png).map_err(|_| com_error(E_FAIL))?;
        image::load_from_memory_with_format(&png, ImageFormat::Png).map_err(|_| com_error(E_FAIL))
    }

    fn render_bitmap(&self, requested_size: u32) -> Result<HBITMAP> {
        if requested_size == 0 {
            return Err(com_error(E_INVALIDARG));
        }

        let source = self.decode_preview()?.into_rgba8();
        let (source_width, source_height) = source.dimensions();
        if source_width == 0 || source_height == 0 {
            return Err(com_error(E_FAIL));
        }

        let scale = (requested_size as f64 / source_width as f64)
            .min(requested_size as f64 / source_height as f64);
        let width = ((source_width as f64 * scale).round() as u32).max(1);
        let height = ((source_height as f64 * scale).round() as u32).max(1);
        let mut resized = image::imageops::resize(&source, width, height, FilterType::Nearest);
        let badge_size = (requested_size / 4).clamp(16, 48).min(width).min(height);
        let badge = image::imageops::resize(
            &image::load_from_memory_with_format(APPLICATION_ICON_PNG, ImageFormat::Png)
                .map_err(|_| com_error(E_FAIL))?
                .into_rgba8(),
            badge_size,
            badge_size,
            FilterType::Nearest,
        );
        let badge_margin = (badge_size / 12).max(2);
        image::imageops::overlay(
            &mut resized,
            &badge,
            i64::from(
                width
                    .saturating_sub(badge_size)
                    .saturating_sub(badge_margin),
            ),
            i64::from(
                height
                    .saturating_sub(badge_size)
                    .saturating_sub(badge_margin),
            ),
        );

        let header = BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width as i32,
            biHeight: -(height as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            biSizeImage: width
                .checked_mul(height)
                .and_then(|pixels| pixels.checked_mul(4))
                .ok_or_else(|| com_error(E_FAIL))?,
            ..Default::default()
        };
        let bitmap_info = BITMAPINFO {
            bmiHeader: header,
            ..Default::default()
        };
        let mut bitmap_bits: *mut c_void = ptr::null_mut();
        let bitmap = unsafe {
            CreateDIBSection(
                None,
                &bitmap_info,
                DIB_RGB_COLORS,
                &mut bitmap_bits,
                None,
                0,
            )?
        };
        if bitmap_bits.is_null() {
            return Err(com_error(E_FAIL));
        }

        let destination = unsafe {
            std::slice::from_raw_parts_mut(bitmap_bits.cast::<u8>(), (width * height * 4) as usize)
        };
        for (source_pixel, destination_pixel) in
            resized.pixels().zip(destination.chunks_exact_mut(4))
        {
            let [red, green, blue, alpha] = source_pixel.0;
            let alpha16 = alpha as u16;
            destination_pixel[0] = ((blue as u16 * alpha16 + 127) / 255) as u8;
            destination_pixel[1] = ((green as u16 * alpha16 + 127) / 255) as u8;
            destination_pixel[2] = ((red as u16 * alpha16 + 127) / 255) as u8;
            destination_pixel[3] = alpha;
        }
        Ok(bitmap)
    }
}

impl Drop for ThumbnailProvider {
    fn drop(&mut self) {
        ACTIVE_OBJECTS.fetch_sub(1, Ordering::Release);
    }
}

impl IInitializeWithStream_Impl for ThumbnailProvider_Impl {
    fn Initialize(&self, stream: Ref<IStream>, _mode: u32) -> Result<()> {
        let stream = stream.cloned().ok_or_else(|| com_error(E_POINTER))?;
        let mut current = self.stream.lock().map_err(|_| com_error(E_FAIL))?;
        if current.is_some() {
            return Err(com_error(E_FAIL));
        }
        *current = Some(stream);
        Ok(())
    }
}

impl IThumbnailProvider_Impl for ThumbnailProvider_Impl {
    fn GetThumbnail(
        &self,
        size: u32,
        bitmap: *mut HBITMAP,
        alpha_type: *mut WTS_ALPHATYPE,
    ) -> Result<()> {
        if bitmap.is_null() || alpha_type.is_null() {
            return Err(com_error(E_POINTER));
        }
        let rendered = self.render_bitmap(size)?;
        unsafe {
            *bitmap = rendered;
            *alpha_type = WTSAT_ARGB;
        }
        Ok(())
    }
}

#[implement(IClassFactory)]
struct ThumbnailClassFactory;

impl ThumbnailClassFactory {
    fn new() -> Self {
        ACTIVE_OBJECTS.fetch_add(1, Ordering::Relaxed);
        Self
    }
}

impl Drop for ThumbnailClassFactory {
    fn drop(&mut self) {
        ACTIVE_OBJECTS.fetch_sub(1, Ordering::Release);
    }
}

impl IClassFactory_Impl for ThumbnailClassFactory_Impl {
    fn CreateInstance(
        &self,
        outer: Ref<IUnknown>,
        interface_id: *const GUID,
        output: *mut *mut c_void,
    ) -> Result<()> {
        if !outer.is_null() {
            return Err(com_error(CLASS_E_NOAGGREGATION));
        }
        if interface_id.is_null() || output.is_null() {
            return Err(com_error(E_POINTER));
        }
        unsafe { *output = ptr::null_mut() };

        let provider = ComObject::new(ThumbnailProvider::new());
        let unknown = provider.to_interface::<IUnknown>();
        let result = unsafe { unknown.query(interface_id, output) };
        if result.is_ok() {
            Ok(())
        } else {
            Err(Error::from_hresult(result))
        }
    }

    fn LockServer(&self, lock: BOOL) -> Result<()> {
        if lock.as_bool() {
            SERVER_LOCKS.fetch_add(1, Ordering::Relaxed);
        } else {
            SERVER_LOCKS
                .fetch_update(Ordering::Release, Ordering::Relaxed, |count| {
                    Some(count.saturating_sub(1))
                })
                .ok();
        }
        Ok(())
    }
}

#[no_mangle]
extern "system" fn DllGetClassObject(
    class_id: *const GUID,
    interface_id: *const GUID,
    output: *mut *mut c_void,
) -> HRESULT {
    if class_id.is_null() || interface_id.is_null() || output.is_null() {
        return E_POINTER;
    }
    unsafe { *output = ptr::null_mut() };
    if unsafe { *class_id } != THUMBNAIL_PROVIDER_CLSID {
        return CLASS_E_CLASSNOTAVAILABLE;
    }

    let factory = ComObject::new(ThumbnailClassFactory::new());
    let unknown = factory.to_interface::<IUnknown>();
    unsafe { unknown.query(interface_id, output) }
}

#[no_mangle]
extern "system" fn DllCanUnloadNow() -> HRESULT {
    if ACTIVE_OBJECTS.load(Ordering::Acquire) == 0 && SERVER_LOCKS.load(Ordering::Acquire) == 0 {
        S_OK
    } else {
        S_FALSE
    }
}

#[no_mangle]
extern "system" fn DllMain(module: HMODULE, reason: u32, _reserved: *mut c_void) -> BOOL {
    const DLL_PROCESS_ATTACH: u32 = 1;
    if reason == DLL_PROCESS_ATTACH {
        unsafe {
            let _ = DisableThreadLibraryCalls(module);
        }
    }
    BOOL(1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    use image::{Rgba, RgbaImage};
    use windows::Win32::{
        Graphics::Gdi::{DeleteObject, GetObjectW, BITMAP, HGDIOBJ},
        UI::Shell::SHCreateMemStream,
    };
    use zip::{write::SimpleFileOptions, ZipWriter};

    fn project_with_preview(color: [u8; 4]) -> Vec<u8> {
        let image = RgbaImage::from_pixel(8, 8, Rgba(color));
        let mut png = Cursor::new(Vec::new());
        DynamicImage::ImageRgba8(image)
            .write_to(&mut png, ImageFormat::Png)
            .unwrap();

        let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
        archive
            .start_file("preview.png", SimpleFileOptions::default())
            .unwrap();
        archive.write_all(png.get_ref()).unwrap();
        archive.finish().unwrap().into_inner()
    }

    fn thumbnail_hash(project: &[u8]) -> u64 {
        let object = ComObject::new(ThumbnailProvider::new());
        let initialize = object.to_interface::<IInitializeWithStream>();
        let provider = object.to_interface::<IThumbnailProvider>();
        let stream = unsafe { SHCreateMemStream(Some(project)) }.expect("memory stream");
        unsafe { initialize.Initialize(&stream, 0).unwrap() };

        let mut bitmap = HBITMAP::default();
        let mut alpha = WTS_ALPHATYPE::default();
        unsafe { provider.GetThumbnail(64, &mut bitmap, &mut alpha).unwrap() };
        assert_eq!(alpha, WTSAT_ARGB);

        let mut details = BITMAP::default();
        let copied = unsafe {
            GetObjectW(
                HGDIOBJ(bitmap.0),
                std::mem::size_of::<BITMAP>() as i32,
                Some((&mut details as *mut BITMAP).cast()),
            )
        };
        assert_ne!(copied, 0);
        assert_eq!((details.bmWidth, details.bmHeight), (64, 64));
        let bytes = unsafe {
            std::slice::from_raw_parts(
                details.bmBits.cast::<u8>(),
                details.bmWidthBytes as usize * details.bmHeight as usize,
            )
        };
        let hash = bytes.iter().fold(0xcbf29ce484222325u64, |value, byte| {
            (value ^ *byte as u64).wrapping_mul(0x100000001b3)
        });
        unsafe {
            let _ = DeleteObject(HGDIOBJ(bitmap.0));
        }
        hash
    }

    #[test]
    fn provider_clsid_is_stable() {
        assert_eq!(
            THUMBNAIL_PROVIDER_CLSID,
            GUID::from_u128(0x1a7c2847_2cd7_4d31_98f0_4d844840e2b7)
        );
    }

    #[test]
    fn embedded_previews_produce_project_specific_thumbnails() {
        let red = project_with_preview([255, 32, 32, 255]);
        let green = project_with_preview([32, 220, 96, 255]);
        assert_ne!(thumbnail_hash(&red), thumbnail_hash(&green));
    }
}
