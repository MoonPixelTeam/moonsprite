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
    fs::write(
        output,
        format!("{limits}\n{types}\n#[path = {api:?}] mod lua_api;"),
    )
    .unwrap();
}
