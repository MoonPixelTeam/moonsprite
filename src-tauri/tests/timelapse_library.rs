#[path = "../src/platform_paths.rs"]
mod platform_paths;
#[path = "../src/platform_timelapse.rs"]
mod platform_timelapse;

#[test]
fn library_is_next_to_executable() -> Result<(), Box<dyn std::error::Error>> {
    assert_eq!(
        platform_timelapse::root()?,
        platform_paths::executable_directory()?.join("timelapse-v1")
    );
    Ok(())
}

#[test]
fn legacy_recordings_remain_readable_without_hiding_new_library_corruption(
) -> Result<(), Box<dyn std::error::Error>> {
    let base = std::env::temp_dir().join(format!(
        "moonsprite-legacy-recording-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_nanos()
    ));
    let current = base.join("application").join("timelapse-v1");
    let legacy = base.join("appdata").join("timelapse-v1");
    let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
    bytes.extend([42; 32]);
    let old = platform_timelapse::append_frame(&legacy, "old-recording", &bytes)?;
    assert_eq!(
        platform_timelapse::read_frame_with_legacy(&current, &legacy, &old)?,
        bytes
    );
    assert!(!current.exists());
    let new = platform_timelapse::append_frame(&current, "new-recording", &bytes)?;
    assert_eq!(
        platform_timelapse::read_frame_with_legacy(&current, &legacy, &new)?,
        bytes
    );
    assert!(!legacy.join("new-recording").exists());
    std::fs::create_dir_all(current.join(&old.store))?;
    std::fs::write(
        current.join(&old.store).join(format!("{}.bin", old.chunk)),
        b"broken",
    )?;
    assert!(platform_timelapse::read_frame_with_legacy(&current, &legacy, &old).is_err());
    let mut malicious = new;
    malicious.store = "../escape".into();
    assert!(platform_timelapse::read_frame_with_legacy(&current, &legacy, &malicious).is_err());
    std::fs::remove_dir_all(base)?;
    Ok(())
}

#[test]
fn durable_ranges_survive_torn_tail_and_reject_corruption() -> Result<(), Box<dyn std::error::Error>>
{
    use std::io::{Seek, SeekFrom, Write};
    let directory = std::env::temp_dir().join(format!(
        "moonsprite-recording-test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_nanos()
    ));
    let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
    bytes.extend([42; 32]);
    let first = platform_timelapse::append_frame(&directory, "recording-one", &bytes)?;
    let second = platform_timelapse::append_frame(&directory, "recording-one", &bytes)?;
    assert_eq!(first.chunk, second.chunk);
    assert!(second.offset >= first.offset + first.length);
    let path = directory
        .join(&first.store)
        .join(format!("{}.bin", first.chunk));
    std::fs::OpenOptions::new()
        .append(true)
        .open(&path)?
        .write_all(b"incomplete-tail")?;
    assert_eq!(platform_timelapse::read_frame(&directory, &first)?, bytes);
    let mut malicious = first.clone();
    malicious.store = "../escape".into();
    assert!(platform_timelapse::read_frame(&directory, &malicious).is_err());
    let mut file = std::fs::OpenOptions::new().write(true).open(path)?;
    file.seek(SeekFrom::Start(first.offset + 12))?;
    file.write_all(&[99])?;
    drop(file);
    assert!(platform_timelapse::read_frame(&directory, &first).is_err());
    assert_eq!(platform_timelapse::read_frame(&directory, &second)?, bytes);
    std::fs::remove_dir_all(directory)?;
    Ok(())
}
