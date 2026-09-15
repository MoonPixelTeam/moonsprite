# ADR 0020: Use a Restricted ZIP, Atomic Installation, and Runtime Security Boundary for Extension Packages

[中文](0020-extension-package-format.md) | English

Status: Accepted

## Context

MoonSprite needs an extension installation entry point similar to Aseprite's, including installation by double-clicking in Explorer or by drag and drop. Extension packages originate outside the application, so archive paths, arbitrary extraction paths, and extension code must not be handed directly to the Renderer.

## Decision

- Extension packages use the dedicated `.msext` suffix and contain a ZIP archive.
- The package root must contain `manifest.json`. `schemaVersion: 1` remains the declarative Lua format; `schemaVersion: 2` may declare Extension Runtime v1. Both require `id`, `name`, and `version`. A compatibility `entry`, when present, must be a relative package path to a `.lua` file.
- `menuItems[]` inserts a set of commands at the `start` or `end` of the built-in `file`, `edit`, `select`, `canvas`, `layer`, `window`, or `help` menu. `topMenus[]` adds a MoonSprite-rendered top-level menu at menu-bar `start` or `end`, or relative to a built-in menu with `before:<builtInMenu>` / `after:<builtInMenu>`. MoonSprite does not reserve a fixed top-level Extensions menu.
- `runtime` declares a UTF-8 HTML entry, permissions, and an opaque resource-ID map. The host runs it in a sandbox iframe without same-origin access and injects the versioned `window.moonsprite` bridge. Extensions never receive React, Store, Tauri commands, installation paths, or internal document objects.
- Runtime CSP blocks direct networking and external scripts. Resources are read only through declared opaque IDs, each limited to 16 MiB. Storage is isolated by extension ID, limited to 256 KiB per value and 1 MiB total.
- Every `commands[]` item declares exactly one of `entry`, `runtimeEvent`, or `opensSettings: true`. These respectively run restricted Lua, dispatch to the resident Runtime, or open extension settings. Settings prefer host-rendered `settingsUi` checkbox, number, text, select, and command-button controls. `settingsEntry` sandbox HTML is the fallback when the component schema is insufficient, and the two forms are mutually exclusive. A named `menuItems[]` contribution becomes an extension-owned submenu.
- The `windows` permission exposes generic owner-bound companion windows with open, close, drag, main-window-relative bounds queries and updates, messaging, and alpha hit regions. The host does not know the window's business purpose, animation states, or reminder semantics. Disabling the Runtime closes its windows.
- One extension may declare at most 64 commands, 16 panels, 32 built-in menu contributions, 16 top-level menus, and 16 tools. Each panel or menu contribution may reference at most 32 commands, all from the same manifest.
- Before extraction, the platform layer rejects absolute paths, `..`, backslash paths, duplicate paths, symbolic links, Windows reserved filenames, and invalid manifests. It limits archives to 50 MiB, 256 files, 256 MiB total extracted data, and a 256 KiB manifest.
- A package is first extracted into a unique staging directory under the extension directory, then replaces an older version with the same ID through directory rename. Enabled state is stored separately in `.state.json` and preserved across replacement. Any failure cleans up staging and attempts to restore the old directory.
- Tauri startup arguments, single-instance arguments, and drag-and-drop pass only file paths. The Renderer requests installation through the platform API and cannot read or write the extension directory directly.
- Named commands from enabled extensions use `extension:<id>:<commandId>`. Only after reparsing the installed manifest does the platform layer pass the corresponding Lua file to the existing restricted Lua 5.4 runtime. Compatibility `entry` uses `extension:<id>` and remains visible under File > Scripts. Named commands not referenced by any UI contribution also fall back to that script list so upgrading an older extension does not remove its entry point. Extension entries receive no file, network, process, package-loading, or debug-library permissions and cannot bypass script memory, pixel, instruction-count, or runtime limits.
- `panels[]` still describes MoonSprite-rendered floating panels and commands. Document writes must use host domain commands or a package Lua command through `commands.execute`, preserving Store transactions, undo, and target validation.

## Consequences

Extension installation retains a clear failure boundary. Existing Lua extensions continue to work, while Runtime extensions can own resident logic, settings, and windows without product-specific host code. Disabling, replacing, or uninstalling an extension destroys its Runtime, menus, and windows. Local extension state does not affect project dirty state or undo history.

## Alternatives

Copying extensions directly into the user directory or extracting beside the package cannot reliably prevent path traversal, old-version overwrites, or failed-install residue. An arbitrary archive format would not integrate as cleanly with Windows file associations and the existing ZIP toolchain, so it was rejected.
