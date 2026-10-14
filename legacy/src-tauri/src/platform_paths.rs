use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn executable_directory() -> Result<PathBuf, String> {
    let executable = std::env::current_exe()
        .map_err(|error| format!("无法确定 MoonSprite 程序目录：{error}"))?;
    executable
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "无法确定 MoonSprite 程序目录。".to_string())
}

pub fn ensure_subdirectory(root: &Path, name: &str, label: &str) -> Result<PathBuf, String> {
    let directory = root.join(name);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("无法创建{label}文件夹 {}：{error}", directory.display()))?;
    Ok(directory)
}

pub fn ensure_executable_subdirectory(name: &str, label: &str) -> Result<PathBuf, String> {
    ensure_subdirectory(&executable_directory()?, name, label)
}

pub(crate) fn export_directory() -> Result<PathBuf, String> {
    ensure_executable_subdirectory("exports", "导出")
}

#[cfg(test)]
mod tests {
    use super::ensure_subdirectory;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn creates_a_named_subdirectory_under_the_selected_root() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("moonsprite-platform-paths-{stamp}"));
        let nested = ensure_subdirectory(&root, "content", "测试").unwrap();
        assert!(nested.is_dir());
        let _ = fs::remove_dir_all(root);
    }
}
