#[path = "../src/platform_timelapse.rs"]
mod platform_timelapse;

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
