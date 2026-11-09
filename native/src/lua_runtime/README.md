# Native Lua runtime

Compiles the original MoonSprite Lua/MSE implementation directly from
`legacy/src-tauri/src/platform_scripts/lua_api.rs` and `mse_api.rs`, including
its existing tests. MoonSprite Source-Available License 1.0 applies; see
`legacy/LICENSE`. No Aseprite application implementation is copied.
`mlua` 0.10.5 and embedded Lua 5.4 are MIT licensed; dependencies are pinned
by Cargo.lock. This module does not link Tauri or create a WebView.

Build: `powershell -File native/scripts/build-lua-runtime.ps1 -Action Build`
Test: same with `-Action Test -Offline` (dependencies must already be cached).
CMake Release target: `lua-runtime-ffi-tests`; CTest: `lua-runtime`,
`lua-runtime-ffi`. Outputs stay in `native/build/lua-runtime`.

Create/use/destroy a handle on one dedicated worker thread, as in the old
runtime loop. A C caller owns valid pointer lifetimes, must serialize calls,
and frees returned UTF-8 JSON with moon_lua_free. Destroy on the wrong thread
returns false without consuming the handle. Result envelope is
`{ok:true,value:...}` or `{ok:false,error:...}`.

Requests:
- start: source, filePath, fileName, context (original camelCase context).
- dispatch: sessionId, action, context (rebase before callback).
- close: sessionId (idempotent).

The C++ Service resolves and validates local/extension sources before start.
The Rust runtime validates source size, context, and original Lua budgets.
It returns original transaction batches, created documents/layers and dialog
models. These are **not applied to an Editor document here**. Session storage
retains only invocations with open dialogs; failed execution/rebase removes
that session, matching the old runtime loop. Bad transport JSON is rejected
before touching session storage. No live UI, script menu execution or native
script dialog adapter is implemented by this library.


C++ source/executor adapter: `native/src/lua_script_runtime.h` combines Service
with a dedicated owner thread. Its start/dispatch/close return futures holding
result JSON or an exception. Poll readiness in the UI; do not call get() while
pending. shutdown/destruction drains accepted tasks and joins the worker, so
arrange application teardown after work has finished. Methods may enqueue from
multiple producers; shutdown/destruction itself belongs to one owner and must
not race object lifetime. CTest `lua-script-runtime` exercises real sources,
extension enable checks, dialog rebase/callbacks, error isolation and drain.
