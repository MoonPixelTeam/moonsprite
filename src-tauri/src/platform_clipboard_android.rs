// Document-internal clipboard remains in the Store. External image clipboard is
// deliberately unavailable until an Android image clipboard provider is added.
#[tauri::command]
pub fn write_clipboard_image() -> Result<(), String> { Err("Android system image clipboard is unavailable".into()) }
#[tauri::command]
pub fn read_clipboard_text() -> Option<String> { None }
#[tauri::command]
pub fn read_clipboard_image() -> tauri::ipc::Response { tauri::ipc::Response::new(Vec::<u8>::new()) }
#[tauri::command]
pub fn read_clipboard_image_size() -> Option<serde_json::Value> { None }
