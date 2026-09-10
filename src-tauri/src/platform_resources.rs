#[cfg(not(target_os = "android"))]
use sysinfo::System;

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn get_resource_info() -> (u64, u64) {
    let mut system = System::new();
    system.refresh_memory();
    (system.total_memory(), system.available_memory())
}

// Conservative application budget, not the tablet's physical RAM.
#[cfg(target_os = "android")]
#[tauri::command]
pub fn get_resource_info() -> (u64, u64) { (512 * 1024 * 1024, 256 * 1024 * 1024) }
