use std::{env, ffi::c_void, mem::size_of};

use windows::{
    core::{Result, HSTRING},
    Win32::{
        Foundation::SIZE,
        Graphics::Gdi::{DeleteObject, GetObjectW, BITMAP, HGDIOBJ},
        System::Com::{CoInitializeEx, CoUninitialize, IBindCtx, COINIT_APARTMENTTHREADED},
        UI::Shell::{
            IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_SCALEUP,
            SIIGBF_THUMBNAILONLY,
        },
    },
};

fn run() -> Result<()> {
    let path = env::args()
        .nth(1)
        .expect("usage: shell-thumbnail-check <project.moonsprite> [size]");
    let size = env::args()
        .nth(2)
        .and_then(|value| value.parse::<i32>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(256);
    unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()? };

    let factory: IShellItemImageFactory =
        unsafe { SHCreateItemFromParsingName(&HSTRING::from(path), None::<&IBindCtx>)? };
    let bitmap = unsafe {
        factory.GetImage(
            SIZE { cx: size, cy: size },
            SIIGBF_THUMBNAILONLY | SIIGBF_SCALEUP,
        )?
    };

    let mut details = BITMAP::default();
    let copied = unsafe {
        GetObjectW(
            HGDIOBJ(bitmap.0),
            size_of::<BITMAP>() as i32,
            Some((&mut details as *mut BITMAP).cast::<c_void>()),
        )
    };
    if copied == 0 || details.bmBits.is_null() {
        panic!("shell returned an unreadable bitmap");
    }

    let byte_length =
        (details.bmWidthBytes.unsigned_abs() as usize) * (details.bmHeight.unsigned_abs() as usize);
    let bytes = unsafe { std::slice::from_raw_parts(details.bmBits.cast::<u8>(), byte_length) };
    let hash = bytes.iter().fold(0xcbf29ce484222325u64, |value, byte| {
        (value ^ *byte as u64).wrapping_mul(0x100000001b3)
    });
    println!(
        "{}x{} {}bpp hash={hash:016x}",
        details.bmWidth, details.bmHeight, details.bmBitsPixel
    );

    unsafe {
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        CoUninitialize();
    }
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("thumbnail check failed: {error}");
        std::process::exit(1);
    }
}
