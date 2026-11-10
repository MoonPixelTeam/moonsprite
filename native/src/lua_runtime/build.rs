use std::{env, fs, path::PathBuf};
fn main() {
    let legacy = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("../../../legacy/src-tauri/src/platform_scripts.rs");
    println!("cargo:rerun-if-changed={}", legacy.display());
    let source = fs::read_to_string(&legacy).unwrap();
    // Keep the original serde contracts and execution limits, excluding Tauri
    // commands and filesystem service already migrated to native C++.
    let limits = &source[source.find("pub(super) const MAX_SCRIPT_BYTES").unwrap()
        ..source.find("const BUILTIN_SCRIPT_FILE_NAME").unwrap()];
    let types = &source[source.find("#[derive(Clone, Debug, Deserialize)]").unwrap()
        ..source.find("fn script_directory()").unwrap()];
    let output = PathBuf::from(env::var("OUT_DIR").unwrap()).join("legacy_contract.rs");
    let api = legacy.parent().unwrap().join("platform_scripts/lua_api.rs");
    println!("cargo:rerun-if-changed={}", api.display());
    let mse = api.parent().unwrap().join("mse_api.rs");
    println!("cargo:rerun-if-changed={}", mse.display());
    let mut adapted = fs::read_to_string(&api).unwrap().replace("\r\n", "\n");
    // A checkpoint reads every known Cel. Release the setter's borrow first.
    // Guard the exact legacy fragment so upstream changes cannot silently bypass this fix.
    let before = r#"                let mut state = state.borrow_mut();
                if state.offset_x == point.x && state.offset_y == point.y {
                    return Ok(());
                }
                cel.document.borrow_mut().ensure_pending();
                state.offset_x = point.x;
                state.offset_y = point.y;"#;
    let after = r#"                {
                    let state = state.borrow();
                    if state.offset_x == point.x && state.offset_y == point.y {
                        return Ok(());
                    }
                }
                cel.document.borrow_mut().ensure_pending();
                let mut state = state.borrow_mut();
                state.offset_x = point.x;
                state.offset_y = point.y;"#;
    assert_eq!(adapted.matches(before).count(), 1, "Legacy Cel setter changed; review native borrow adaptation");
    adapted = adapted.replacen(before, after, 1);
    // Retain the legacy namespace and callable API. Capability discovery must
    // describe the native executor rather than the legacy web workspace.
    let mut native_mse = fs::read_to_string(&mse).unwrap().replace("\r\n", "\n");
    let implemented = "entry.set(\"implemented\", true)?;";
    assert_eq!(native_mse.matches(implemented).count(), 1);
    native_mse = native_mse.replace(implemented,
        "entry.set(\"implemented\", native_supported_path(&format!(\"{}.{}\", module.name, method.name)))?;");
    let module_status = "capability.set(\"status\", \"stable\")?;";
    assert_eq!(native_mse.matches(module_status).count(), 1);
    native_mse = native_mse.replace(module_status,
        "capability.set(\"status\", if module.methods.iter().all(|method| native_supported_path(&format!(\"{}.{}\", module.name, method.name))) { \"stable\" } else { \"partial\" })?;");
    let discovery = "Ok(is_supported_path(&path))";
    assert_eq!(native_mse.matches(discovery).count(), 1);
    native_mse = native_mse.replace(discovery, "Ok(native_supported_path(&path))");
    native_mse.push_str(r#"
// Known native host gaps remain callable and fail through the existing result
// preflight; discovery lets scripts choose a supported route before queuing.
fn native_supported_path(path: &str) -> bool {
    let path = path.trim().strip_prefix("mse.").unwrap_or(path.trim());
    is_supported_path(path) && !matches!(path,
        "document.create" | "document.open" | "document.save" |
        "io.export" | "io.save" | "io.open")
}
"#);
    let generated_mse = PathBuf::from(env::var("OUT_DIR").unwrap()).join("mse_api_native.rs");
    fs::write(&generated_mse, native_mse).unwrap();
    let mse_module = "#[path = \"mse_api.rs\"]";
    assert_eq!(adapted.matches(mse_module).count(), 1);
    adapted = adapted.replace(mse_module, &format!("#[path = {generated_mse:?}]"));
    // The original discovery test expects the complete legacy document host.
    let discovery_test = "assert(mse.capabilities.document.status == \"stable\")";
    assert_eq!(adapted.matches(discovery_test).count(), 1);
    adapted = adapted.replace(discovery_test, "assert(mse.capabilities.document.status == \"partial\")");
    let example = legacy.parent().unwrap().join("../resources/scripts/moon-phase.lua");
    println!("cargo:rerun-if-changed={}", example.display());
    let example_include = "include_str!(\"../../resources/scripts/moon-phase.lua\")";
    assert_eq!(adapted.matches(example_include).count(), 1);
    adapted = adapted.replace(example_include, &format!("include_str!({example:?})"));
    let generated_api = PathBuf::from(env::var("OUT_DIR").unwrap()).join("lua_api_native.rs");
    fs::write(&generated_api, adapted).unwrap();
    fs::write(
        output,
        format!("{limits}\n{types}\n#[path = {generated_api:?}] mod lua_api;"),
    )
    .unwrap();
}
