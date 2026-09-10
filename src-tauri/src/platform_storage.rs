use std::{
    fs, io,
    path::Path,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const LEGACY_PROJECT_BACKUP_SUFFIX: &str = ".moonsprite.bak";
const PROJECT_BACKUP_EXTENSION: &str = ".moonsprite";
pub const DEFAULT_PROJECT_BACKUPS_PER_PROJECT: usize = 10;
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

/// Writes and validates a file atomically while keeping recent committed
/// versions under the application's data directory instead of beside the file.
/// The backup name is derived from the complete path so projects with the same
/// file name cannot overwrite one another.
pub fn atomic_write_with_validation_and_backup(
    path: &Path,
    backup_directory: &Path,
    max_versions_per_project: usize,
    retention: Duration,
    write: impl FnOnce(&mut fs::File) -> Result<(), String>,
    validate: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
    atomic_write_with_validation(path, write, |temporary| {
        validate(temporary)?;
        if !path.is_file() {
            return Ok(());
        }
        let project_directory = backup_directory.join(project_backup_directory_name(path));
        fs::create_dir_all(&project_directory).map_err(|error| error.to_string())?;
        let backup = project_directory.join(format!("backup-{}{}", backup_timestamp(), PROJECT_BACKUP_EXTENSION));
        fs::hard_link(path, &backup)
            .or_else(|_| fs::copy(path, &backup).map(|_| ()))
            .map_err(|error| error.to_string())?;
        if let Err(error) = prune_project_backups(backup_directory, max_versions_per_project, retention) {
            eprintln!("无法清理工程备份：{error}");
        }
        Ok(())
    })
}

struct ProjectBackupEntry {
    path: std::path::PathBuf,
    size: u64,
    modified: SystemTime,
    project_key: String,
}

fn prune_project_backups(directory: &Path, max_versions_per_project: usize, retention: Duration) -> Result<(), String> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    let mut backups = Vec::new();
    for entry in entries {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_file() {
            let Some(project_key) = legacy_project_backup_key(&path) else { continue };
            let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
            backups.push(ProjectBackupEntry { path, size: metadata.len(), modified: metadata.modified().unwrap_or(UNIX_EPOCH), project_key });
            continue;
        }
        if !path.is_dir() { continue; }
        let project_key = path.file_name().and_then(|value| value.to_str()).unwrap_or_default().to_string();
        if project_key.is_empty() { continue; }
        for child in fs::read_dir(&path).map_err(|error| error.to_string())? {
            let child = child.map_err(|error| error.to_string())?.path();
            if !child.is_file() || child.extension().and_then(|value| value.to_str()) != Some("moonsprite") { continue; }
            let metadata = fs::metadata(&child).map_err(|error| error.to_string())?;
            backups.push(ProjectBackupEntry { path: child, size: metadata.len(), modified: metadata.modified().unwrap_or(UNIX_EPOCH), project_key: project_key.clone() });
        }
    }
    backups.sort_by(|left, right| right.modified.cmp(&left.modified));
    let now = SystemTime::now();
    let mut retained_bytes = 0u64;
    let mut retained_per_project = std::collections::HashMap::<String, usize>::new();
    for (index, backup) in backups.into_iter().enumerate() {
        let expired = now
            .duration_since(backup.modified)
            .map(|age| age > retention)
            .unwrap_or(false);
        let over_count = index >= MAX_PROJECT_BACKUPS;
        let project_count = retained_per_project.get(&backup.project_key).copied().unwrap_or(0);
        let over_project_count = project_count >= max_versions_per_project;
        let over_size = retained_bytes.saturating_add(backup.size) > MAX_PROJECT_BACKUP_BYTES;
        // Always retain the newest backup. It is the immediate rollback point
        // for the save that just completed, even if that project is unusually large.
        if index > 0 && (expired || over_count || over_project_count || over_size) {
            fs::remove_file(&backup.path).map_err(|error| error.to_string())?;
            continue;
        }
        retained_bytes = retained_bytes.saturating_add(backup.size);
        *retained_per_project.entry(backup.project_key).or_default() += 1;
    }
    Ok(())
}

/// Returns the stable per-project portion of the old flat backup format
/// (`hash-timestamp.moonsprite.bak`) and the old single-slot format
/// (`hash.moonsprite.bak`). Keeping the latter means existing backups follow
/// the same retention policy after an upgrade.
fn legacy_project_backup_key(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?;
    let stem = name.strip_suffix(LEGACY_PROJECT_BACKUP_SUFFIX)?;
    let key = stem.split_once('-').map_or(stem, |(key, _)| key);
    (!key.is_empty()).then(|| key.to_string())
}

fn backup_project_name(path: &Path) -> String {
    let source = path.file_stem().and_then(|value| value.to_str()).unwrap_or("project");
    let name = source.chars().filter(|value| value.is_alphanumeric() || matches!(value, '-' | '_')).take(64).collect::<String>();
    if name.is_empty() { "project".to_string() } else { name }
}

pub fn project_backup_directory_name(path: &Path) -> String {
    format!("{}-{:016x}", backup_project_name(path), stable_path_hash(path))
}

pub fn project_backup_legacy_key(path: &Path) -> String {
    format!("{:016x}", stable_path_hash(path))
}

fn backup_timestamp() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default()
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
        atomic_write_with_validation_and_backup, prune_project_backups, DEFAULT_PROJECT_BACKUPS_PER_PROJECT,
        LEGACY_PROJECT_BACKUP_SUFFIX, MAX_PROJECT_BACKUPS, PROJECT_BACKUP_RETENTION,
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
            DEFAULT_PROJECT_BACKUPS_PER_PROJECT,
            PROJECT_BACKUP_RETENTION,
            |file| {
                std::io::Write::write_all(file, b"replacement").map_err(|error| error.to_string())
            },
            |_| Ok(()),
        )
        .unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"replacement");
        assert!(!path.with_file_name("project.moonsprite.bak").exists());
        let project_directories = fs::read_dir(&backup_directory)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(project_directories.len(), 1);
        let backups = fs::read_dir(project_directories[0].path())
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(backups.len(), 1);
        assert_eq!(backups[0].path().extension().and_then(|value| value.to_str()), Some("moonsprite"));
        assert_eq!(fs::read(backups[0].path()).unwrap(), b"original");
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn retains_multiple_previous_versions_for_the_same_project() {
        let directory = test_path("versioned-backups");
        let path = directory.join("project.moonsprite");
        let backup_directory = directory.join("app-data").join("project-backups");
        atomic_write(&path, b"first").unwrap();

        for replacement in [&b"second"[..], &b"third"[..]] {
            atomic_write_with_validation_and_backup(
                &path,
                &backup_directory,
                DEFAULT_PROJECT_BACKUPS_PER_PROJECT,
                PROJECT_BACKUP_RETENTION,
                |file| {
                    std::io::Write::write_all(file, replacement)
                        .map_err(|error| error.to_string())
                },
                |_| Ok(()),
            )
            .unwrap();
        }

        let project_directory = fs::read_dir(&backup_directory)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap().pop().unwrap().path();
        let mut contents = fs::read_dir(project_directory)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
            .into_iter()
            .map(|entry| fs::read(entry.path()).unwrap())
            .collect::<Vec<_>>();
        contents.sort();
        assert_eq!(contents, vec![b"first".to_vec(), b"second".to_vec()]);
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn bounds_the_number_of_versions_per_project() {
        let directory = test_path("per-project-backup-limit");
        let project_directory = directory.join("project-0000000000000001");
        fs::create_dir_all(&project_directory).unwrap();
        for index in 0..(DEFAULT_PROJECT_BACKUPS_PER_PROJECT + 2) {
            fs::write(
                project_directory.join(format!("backup-{index}.moonsprite")),
                [index as u8],
            )
            .unwrap();
        }
        prune_project_backups(&directory, DEFAULT_PROJECT_BACKUPS_PER_PROJECT, PROJECT_BACKUP_RETENTION).unwrap();
        let backups = fs::read_dir(&project_directory)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(backups.len(), DEFAULT_PROJECT_BACKUPS_PER_PROJECT);
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn bounds_the_number_of_project_backups() {
        let directory = test_path("backup-limit");
        fs::create_dir_all(&directory).unwrap();
        for index in 0..(MAX_PROJECT_BACKUPS + 2) {
            fs::write(
                directory.join(format!("{index:016x}{LEGACY_PROJECT_BACKUP_SUFFIX}")),
                [index as u8],
            )
            .unwrap();
        }
        prune_project_backups(&directory, DEFAULT_PROJECT_BACKUPS_PER_PROJECT, PROJECT_BACKUP_RETENTION).unwrap();
        let backups = fs::read_dir(&directory)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(backups.len(), MAX_PROJECT_BACKUPS);
        let _ = fs::remove_dir_all(directory);
    }
}
