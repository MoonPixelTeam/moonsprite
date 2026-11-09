mod platform_scripts {
    // Original MoonSprite Lua/MSE implementation is compiled directly from legacy.
    // Only the platform transport is adapted; there is no Tauri or WebView dependency.
    use serde::{Deserialize, Serialize};
    use serde_json::{json, Value as JsonValue};
    use std::{
        collections::HashMap,
        ffi::c_char,
        panic::{catch_unwind, AssertUnwindSafe},
    };
    include!(concat!(env!("OUT_DIR"), "/legacy_contract.rs"));
    use lua_api::{LuaInvocation, LuaSession};
    struct Stored {
        path: String,
        name: String,
        session: LuaSession,
    }
    #[derive(Default)]
    pub struct Runtime {
        sessions: HashMap<String, Stored>,
        next: u64,
    }
    impl Runtime {
        fn result(
            id: String,
            path: String,
            name: String,
            invocation: LuaInvocation,
        ) -> LuaScriptRunResult {
            let finished = invocation.dialogs.is_empty();
            LuaScriptRunResult {
                session_id: if finished { None } else { Some(id) },
                file_path: path,
                file_name: name,
                output: invocation.output,
                batches: invocation.batches,
                created_layers: invocation.created_layers,
                created_documents: invocation.created_documents,
                dialogs: invocation.dialogs,
                active_layer_id: invocation.active_layer_id,
                active_frame_number: invocation.active_frame_number,
                finished,
                elapsed_ms: invocation.elapsed_ms,
            }
        }
        fn request(&mut self, request: JsonValue) -> Result<JsonValue, String> {
            let string = |key| {
                request
                    .get(key)
                    .and_then(JsonValue::as_str)
                    .map(str::to_owned)
                    .ok_or_else(|| format!("Missing string {key}"))
            };
            match string("type")?.as_str() {
                "start" => {
                    let source = string("source")?;
                    if source.len() > MAX_SCRIPT_BYTES {
                        return Err("Lua source exceeds 1 MiB".into());
                    }
                    let path = string("filePath")?;
                    let name = string("fileName")?;
                    let context = serde_json::from_value(request["context"].clone())
                        .map_err(|e| e.to_string())?;
                    let mut session = LuaSession::new(context, &name)?;
                    let invocation = session.execute_source(&source)?;
                    self.next = self.next.saturating_add(1);
                    let id = format!("lua-{}", self.next);
                    let result = Self::result(id.clone(), path.clone(), name.clone(), invocation);
                    if !result.finished {
                        self.sessions.insert(
                            id,
                            Stored {
                                path,
                                name,
                                session,
                            },
                        );
                    }
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "dispatch" => {
                    let id = string("sessionId")?;
                    // Invalid action/context must not remove a live session.
                    let action = serde_json::from_value(request["action"].clone())
                        .map_err(|e| e.to_string())?;
                    let context = serde_json::from_value(request["context"].clone())
                        .map_err(|e| e.to_string())?;
                    let mut stored = self
                        .sessions
                        .remove(&id)
                        .ok_or("The Lua script session is no longer available.")?;
                    stored.session.rebase(context)?;
                    let invocation = stored.session.dispatch(action)?;
                    let result = Self::result(
                        id.clone(),
                        stored.path.clone(),
                        stored.name.clone(),
                        invocation,
                    );
                    if !result.finished {
                        self.sessions.insert(id, stored);
                    }
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                "close" => {
                    self.sessions.remove(&string("sessionId")?);
                    Ok(JsonValue::Null)
                }
                _ => Err("Unknown Lua runtime request".into()),
            }
        }
    }
    // Thread-affine handle: create, request and destroy on the same worker thread.
    pub struct Handle {
        runtime: Runtime,
        owner: std::thread::ThreadId,
    }
    #[no_mangle]
    pub extern "C" fn moon_lua_create() -> *mut Handle {
        Box::into_raw(Box::new(Handle {
            runtime: Runtime::default(),
            owner: std::thread::current().id(),
        }))
    }
    #[no_mangle]
    pub unsafe extern "C" fn moon_lua_destroy(handle: *mut Handle) -> bool {
        if handle.is_null() {
            return true;
        }
        if (*handle).owner != std::thread::current().id() {
            return false;
        }
        drop(Box::from_raw(handle));
        true
    }
    #[no_mangle]
    pub unsafe extern "C" fn moon_lua_request(
        handle: *mut Handle,
        bytes: *const u8,
        length: usize,
    ) -> *mut c_char {
        let result = catch_unwind(AssertUnwindSafe(|| -> Result<JsonValue, String> {
            if handle.is_null() || bytes.is_null() {
                return Err("Invalid Lua runtime handle or request".into());
            }
            if (*handle).owner != std::thread::current().id() {
                return Err("Lua runtime used from a different thread".into());
            }
            let request = serde_json::from_slice(std::slice::from_raw_parts(bytes, length))
                .map_err(|e| e.to_string())?;
            (*handle).runtime.request(request)
        }));
        let response = match result {
            Ok(Ok(value)) => json!({"ok":true,"value":value}),
            Ok(Err(error)) => json!({"ok":false,"error":error}),
            Err(_) => json!({"ok":false,"error":"Lua host panic"}),
        };
        std::ffi::CString::new(response.to_string())
            .unwrap()
            .into_raw()
    }
    #[no_mangle]
    pub unsafe extern "C" fn moon_lua_free(text: *mut c_char) {
        if !text.is_null() {
            drop(std::ffi::CString::from_raw(text));
        }
    }

    #[cfg(test)]
    mod transport_tests {
        use super::*;
        fn call(handle: *mut Handle, request: &str) -> JsonValue {
            unsafe {
                let text = moon_lua_request(handle, request.as_ptr(), request.len());
                let result =
                    serde_json::from_slice(std::ffi::CStr::from_ptr(text).to_bytes()).unwrap();
                moon_lua_free(text);
                result
            }
        }
        #[test]
        fn ffi_errors_and_ownership_are_explicit() {
            unsafe {
                let handle = moon_lua_create();
                assert_eq!(call(handle, "{")["ok"], false);
                assert_eq!(
                    call(handle, r#"{"type":"unknown"}"#)["error"],
                    "Unknown Lua runtime request"
                );
                assert_eq!(
                    call(
                        handle,
                        r#"{"type":"dispatch","sessionId":"gone","context":{},"action":{}}"#
                    )["ok"],
                    false
                );
                assert_eq!(
                    call(handle, r#"{"type":"close","sessionId":"gone"}"#)["value"],
                    JsonValue::Null
                );
                let address = handle as usize;
                std::thread::spawn(move || {
                    let foreign = address as *mut Handle;
                    assert_eq!(
                        call(foreign, r#"{"type":"close","sessionId":"gone"}"#)["error"],
                        "Lua runtime used from a different thread"
                    );
                    assert!(!moon_lua_destroy(foreign));
                })
                .join()
                .unwrap();
                assert!(moon_lua_destroy(handle));
                assert!(moon_lua_destroy(std::ptr::null_mut()));
                moon_lua_free(std::ptr::null_mut());
                assert_eq!(call(std::ptr::null_mut(), "{}")["ok"], false);
            }
        }
        #[test]
        fn ffi_executes_transaction_and_preserves_result_contract() {
            let context = serde_json::json!({"documentId":"doc","documentName":"Test","documentWidth":2,"documentHeight":2,"documentFilePath":"","colorMode":"rgba","layerId":"layer","layerName":"Layer","layerWidth":2,"layerHeight":2,"layerOffsetX":0,"layerOffsetY":0,"layerOpacity":255,"layerVisible":true,"layerLocked":false,"layerFormat":"rgba","layerGroupId":null,"layerStackIndex":1,"frameNumber":1,"pixels":[0,0,0,0],"selection":null,"transparentColor":0,"foreground":4294967295u32,"background":4278190080u32});
            unsafe {
                let handle = moon_lua_create();
                let request = json!({"type":"start","source":"app.transaction('draw', function() app.activeImage:drawPixel(0,0,app.pixelColor.rgba(10,20,30,255)) end)","filePath":"memory.lua","fileName":"memory.lua","context":context});
                let response = call(handle, &request.to_string());
                assert_eq!(response["ok"], true, "{response}");
                let value = &response["value"];
                assert_eq!(value["finished"], true);
                assert_eq!(value["sessionId"], JsonValue::Null);
                assert_eq!(value["fileName"], "memory.lua");
                assert_eq!(value["batches"][0]["label"], "draw");
                assert_eq!(
                    value["batches"][0]["changes"][0]["after"],
                    4278190080u32 + 30 * 65536 + 20 * 256 + 10
                );
                assert!(moon_lua_destroy(handle));
            }
        }
    }
}
