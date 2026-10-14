use sysinfo::System;

#[tauri::command]
pub fn get_resource_info() -> (u64, u64) {
    let mut system = System::new();
    system.refresh_memory();
    (system.total_memory(), system.available_memory())
}
