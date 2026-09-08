use std::{
    fs, io,
    path::Path,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const PROJECT_BACKUP_SUFFIX: &str = ".moonsprite.bak";
const MAX_PROJECT_BACKUPS: usize = 50;
const MAX_PROJECT_BACKUP_BYTES: u64 = 512 * 1024 * 1024;
const PROJECT_BACKUP_RETENTION: Duration = Duration::from_secs(30 * 24 * 60 * 60);

pub fn atomic_write_with(
    path: &Path,
    write: impl FnOnce(&mut fs::File) -> Result<(), String>,
) -> Result<(), String> {
    atomic_write_with_validation(path, write, |_| Ok(()))
}

/// Writes to a sibling temporary file, validates it while the original is untouched,
/// then replaces the target in one operation.
pub fn atomic_write_with_validation(
    path: &Path,
    write: impl FnOnce(&mut fs::File) -> Result<(), String>,
    validate: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let temporary = path.with_extension(format!("{}.tmp", temporary_suffix()));
    let result = (|| {
        let mut file = fs::File::create(&temporary).map_err(|error| error.to_string())?;
        write(&mut file)?;
        file.sync_all().map_err(|error| error.to_string())?;
        drop(file);
        validate(&temporary)?;
        replace_file(&temporary, path).map_err(|error| error.to_string())
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    Ok(())
}

/// Writes and validates a file atomically while keeping the previous committed
/// version under the application's data directory instead of beside the file.
/// The backup name is derived from the complete path so projects with the same
/// file name cannot overwrite one another.
pub fn atomic_write_with_validation_and_backup(
    path: &Path,
    backup_directory: &Path,
    write: impl FnOnce(&mut fs::File) -> Result<(), String>,
    validate: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
    atomic_write_with_validation(path, write, |temporary| {
        validate(temporary)?;
        if !path.is_file() {
            return Ok(());
        }
        fs::create_dir_all(backup_directory).map_err(|error| error.to_string())?;
        let backup =
            backup_directory.join(format!("{:016x}.moonsprite.bak", stable_path_hash(path)));
        match fs::remove_file(&backup) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        fs::hard_link(path, &backup)
            .or_else(|_| fs::copy(path, &backup).map(|_| ()))
            .map_err(|error| error.to_string())?;
        if let Err(error) = prune_project_backups(backup_directory) {
            eprintln!("无法清理工程备份：{error}");
        }
        Ok(())
    })
}

struct ProjectBackupEntry {
    path: std::path::PathBuf,
    size: u64,
    modified: SystemTime,
}

fn prune_project_backups(directory: &Path) -> Result<(), String> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    let mut backups = Vec::new();
    for entry in entries {
        let path = entry.map_err(|error| error.to_string())?.path();
        if !path.is_file()
            || !path
                .file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|name| name.ends_with(PROJECT_BACKUP_SUFFIX))
        {
            continue;
        }
        let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
        backups.push(ProjectBackupEntry {
            path,
            size: metadata.len(),
            modified: metadata.modified().unwrap_or(UNIX_EPOCH),
        });
    }
    backups.sort_by(|left, right| right.modified.cmp(&left.modified));
    let now = SystemTime::now();
    let mut retained_bytes = 0u64;
    for (index, backup) in backups.into_iter().enumerate() {
        let expired = now
            .duration_since(backup.modified)
            .map(|age| age > PROJECT_BACKUP_RETENTION)
            .unwrap_or(false);
        let over_count = index >= MAX_PROJECT_BACKUPS;
        let over_size = retained_bytes.saturating_add(backup.size) > MAX_PROJECT_BACKUP_BYTES;
        // Always retain the newest backup. It is the immediate rollback point
        // for the save that just completed, even if that project is unusually large.
        if index > 0 && (expired || over_count || over_size) {
            fs::remove_file(&backup.path).map_err(|error| error.to_string())?;
            continue;
        }
        retained_bytes = retained_bytes.saturating_add(backup.size);
    }
    Ok(())
}

fn stable_path_hash(path: &Path) -> u64 {
    // FNV-1a is deliberately used here instead of a randomized hasher so the
    // same project keeps the same backup slot between application launches.
    path.to_string_lossy()
        .bytes()
        .fold(0xcbf29ce484222325, |hash, byte| {
            (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3)
        })
}

fn temporary_suffix() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    format!("{}-{}", std::process::id(), timestamp)
}

#[cfg(windows)]
fn replace_file(source: &Path, target: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;

    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(
            existing_file_name: *const u16,
            new_file_name: *const u16,
            flags: u32,
        ) -> i32;
    }

    let source_name = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let target_name = target
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let replaced = unsafe {
        MoveFileExW(
            source_name.as_ptr(),
            target_name.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if replaced == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(source: &Path, target: &Path) -> io::Result<()> {
    fs::rename(source, target)
}

/// Writes a file through a sibling temporary file and replaces the target in one operation.
pub fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    atomic_write_with(path, |file| {
        std::io::Write::write_all(file, data).map_err(|error| error.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::{
        atomic_write, atomic_write_with, atomic_write_with_validation,
        atomic_write_with_validation_and_backup, prune_project_backups, MAX_PROJECT_BACKUPS,
        PROJECT_BACKUP_SUFFIX,
    };
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn test_path(name: &str) -> std::path::PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("moonsprite-platform-storage-{stamp}-{name}"))
    }

    #[test]
    fn writes_and_replaces_without_removing_the_target_first() {
        let path = test_path("replace.bin");
        atomic_write(&path, b"first").unwrap();
        atomic_write(&path, b"second").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"second");
        let _ = fs::remove_file(path);
    }

    #[test]
    fn creates_missing_parent_directories() {
        let path = test_path("nested").join("file.bin");
        atomic_write(&path, b"content").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"content");
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn failed_streaming_write_preserves_the_existing_target() {
        let path = test_path("stream-failure.bin");
        atomic_write(&path, b"original").unwrap();
        let result = atomic_write_with(&path, |file| {
            std::io::Write::write_all(file, b"partial").map_err(|error| error.to_string())?;
            Err("write failed".to_string())
        });
        assert!(result.is_err());
        assert_eq!(fs::read(&path).unwrap(), b"original");
        let _ = fs::remove_file(path);
    }

    #[test]
    fn failed_validation_preserves_the_existing_target() {
        let path = test_path("validation-failure.bin");
        atomic_write(&path, b"original").unwrap();
        let result = atomic_write_with_validation(
            &path,
            |file| {
                std::io::Write::write_all(file, b"replacement").map_err(|error| error.to_string())
            },
            |_| Err("invalid output".to_string()),
        );
        assert!(result.is_err());
        assert_eq!(fs::read(&path).unwrap(), b"original");
        let _ = fs::remove_file(path);
    }

    #[test]
    fn stores_the_previous_target_outside_the_project_directory() {
        let directory = test_path("external-backup");
        let path = directory.join("project.moonsprite");
        let backup_directory = directory.join("app-data").join("project-backups");
        atomic_write(&path, b"original").unwrap();
        atomic_write_with_validation_and_backup(
            &path,
            &backup_directory,
            |file| {
                std::io::Write::write_all(file, b"replacement").map_err(|error| error.to_string())
            },
            |_| Ok(()),
        )
        .unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"replacement");
        assert!(!path.with_file_name("project.moonsprite.bak").exists());
        let backups = fs::read_dir(&backup_directory)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(backups.len(), 1);
        assert_eq!(fs::read(backups[0].path()).unwrap(), b"original");
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn bounds_the_number_of_project_backups() {
        let directory = test_path("backup-limit");
        fs::create_dir_all(&directory).unwrap();
        for index in 0..(MAX_PROJECT_BACKUPS + 2) {
            fs::write(
                directory.join(format!("{index:016x}{PROJECT_BACKUP_SUFFIX}")),
                [index as u8],
            )
            .unwrap();
        }
        prune_project_backups(&directory).unwrap();
        let backups = fs::read_dir(&directory)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(backups.len(), MAX_PROJECT_BACKUPS);
        let _ = fs::remove_dir_all(directory);
    }
}
