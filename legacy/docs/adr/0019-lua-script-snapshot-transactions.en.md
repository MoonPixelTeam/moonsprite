# 0019: Use Snapshots and Typed Transaction Boundaries for Lua Scripts

[中文](0019-lua-script-snapshot-transactions.md) | English

- Status: Accepted
- Date: 2026-08-22

## Context

MoonSprite's document and undo state is owned by the Renderer Store, while the Lua 5.4 VM lives in the Rust platform layer. Allowing Lua to access Renderer objects directly, return an entire mutable project, or maintain a second document model in Rust would bypass existing dirty-state, animation synchronization, cache invalidation, and minimal-history contracts. It would also expand uncontrolled file and system permissions.

## Decision

The Lua VM receives only independent snapshots of the active normal pixel layer, active selection, and necessary document metadata. Aseprite-compatible objects inside the VM modify that snapshot and emit ordered typed transactions: localized drawing returns pixel deltas; changes to `Cel.image` or `Cel.position` return complete before/after surface snapshots; `Sprite:newLayer()` / `newCel()` and `Sprite(width, height)` return restricted new-layer or new-document structures. While target identity, revision, active layer, active frame, and current surface still match, the Renderer submits each result through Store pixel, surface, or structural domain commands. Lua never receives or returns an entire mutable `SpriteDocument`.

If the first script execution leaves a dialog opened by `Dialog:show()`, a dedicated Rust runtime thread continues to own the Lua VM. The Renderer only renders a serialized control model and sends control values plus click, change, release, and close events back to the same VM. `show { wait = false }` preserves modeless callbacks; blocking `show()` suspends the main script through a Lua coroutine and resumes it after the close event. Before each event callback, the Renderer verifies that the original document, layer, and frame are still active, then sends the current Cel surface, revision, selection, and colors back to Rust to rebuild the VM's active baseline. This allows committed edits, undo, and redo on the same target while continuing to reject writes across documents, layers, or frames. Each callback receives independent time and instruction budgets again and returns its transaction atomically; the result must still match the baseline that was just rebuilt. The session is destroyed immediately when every dialog closes, the target becomes invalid, a callback fails, or the Renderer explicitly cleans it up.

Script sources are restricted to ordinary `.lua` files in the first level of the application-root `scripts` folder. The Renderer submits only the filename identifier returned by the listing API. Rust revalidates a single path component, extension, and regular-file type on every execution, rejecting path traversal, subdirectories, and symbolic links.

Lua standard libraries use an explicit allowlist. File, process, network, package-loading, and debugging capabilities are unavailable by default. Runtime limits cover source size, per-image and cumulative session image allocation, modification count, output, Lua memory, instruction count, and execution time. The first general compatibility layer provides `Point`, `Rectangle`, RGB/HSV-aware `Color`, `Image`, read-only `Selection`, active `Layer/Cel/Sprite`, common `Dialog` controls such as color and radio inputs, `app.pixelColor`, `app.transaction`, `app.alert`, `app.refresh`, restricted `app.useTool`, and typed structural APIs for creating normal layers and new Sprites. Future frame, palette, or other structural APIs must add typed results and Store domain commands for each operation rather than expanding into arbitrary document serialization and writeback.

## Consequences

- Lua execution remains isolated from the UI thread, document ownership, and project format.
- Every script transaction maps to a predictable MoonSprite undo step.
- Modeless and blocking script dialogs continue running in the same Lua global environment without script-specific bridge exceptions.
- Committed edits, undo, and redo on the same Cel become the next baseline for persistent callbacks. Edits or target changes during a callback still invalidate its result instead of overwriting newer state.
- Normal layers created by scripts enter the current document's undo history. New Sprites created by scripts open as independent document sessions. Both pass structural and pixel-limit validation.
- The current implementation must copy active-layer pixels and surface-replacement snapshots and therefore limits processable layer size. Chunked or shared-memory transfer can be added later without changing this boundary.

## Alternatives

- Run JavaScript or WASM Lua in the Renderer: this would make Store access easier, but an infinite loop could block the UI and the same permission and transaction boundaries would still be required.
- Hold a complete `SpriteDocument` directly in Rust: this would create a second state and history model, so it was rejected.
- Allow scripts to call arbitrary Tauri commands: this cannot provide least privilege or stable undo semantics, so it was rejected.
