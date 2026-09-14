# ADR 0020: Use a Restricted ZIP Format and Atomic Installation Boundary for Extension Packages

[中文](0020-extension-package-format.md) | English

Status: Accepted

## Context

MoonSprite needs an extension installation entry point similar to Aseprite's, including installation by double-clicking in Explorer or by drag and drop. Extension packages originate outside the application, so archive paths, arbitrary extraction paths, and extension code must not be handed directly to the Renderer.

## Decision

- Extension packages use the dedicated `.msext` suffix and contain a ZIP archive.
- The package root must contain `manifest.json`. The current manifest uses `schemaVersion: 1` and requires `id`, `name`, and `version`. The compatibility `entry`, when present, must be a relative path to a `.lua` file inside the package. Extensions may also declare `commands[]`, `panels[]`, `menuItems[]`, and `topMenus[]`. Commands have stable IDs, display names, optional descriptions, and independent Lua entry points. Panels, built-in menu contributions, and new top-level menus may reference only commands declared in the same manifest, with exact case.
- `menuItems[]` inserts a set of commands at the `start` or `end` of the built-in `file`, `edit`, `select`, `canvas`, `layer`, `window`, or `help` menu. `topMenus[]` adds a MoonSprite-rendered top-level menu at menu-bar `start` or `end`, or relative to a built-in menu with `before:<builtInMenu>` / `after:<builtInMenu>`. MoonSprite does not reserve a fixed top-level Extensions menu.
- `pets[]` is a companion-pet contribution rendered exclusively by the host. Each entry declares a transparent PNG sprite sheet, frame dimensions, and named animations. States are limited to `show`, `idle`, `drag`, `inspect`, `save`, `export-complete`, `unsaved-reminder`, `break-reminder`, and `sleep`. Installation validates PNG data, frame dimensions, frame indices, and package-relative paths. The Renderer requests a sheet only by extension and pet ID and never receives an extension directory. The pet is a transparent window owned by the main window rather than a globally topmost window; position, visibility, scale, and reminder preferences are local only and never enter project data or undo history.
- One extension may declare at most 64 commands, 16 panels, 32 built-in menu contributions, 16 new top-level menus, 16 tools, and 8 pets. Each panel or menu contribution may reference at most 32 commands. Contribution IDs in each namespace must not differ only by case. Command entries must exist inside the package, and every contribution may reference only commands declared by the same manifest.
- Before extraction, the platform layer rejects absolute paths, `..`, backslash paths, duplicate paths, symbolic links, Windows reserved filenames, and invalid manifests. It limits archives to 50 MiB, 256 files, 256 MiB total extracted data, and a 256 KiB manifest.
- A package is first extracted into a unique staging directory under the extension directory, then replaces an older version with the same ID through directory rename. Enabled state is stored separately in `.state.json` and preserved across replacement. Any failure cleans up staging and attempts to restore the old directory.
- Tauri startup arguments, single-instance arguments, and drag-and-drop pass only file paths. The Renderer requests installation through the platform API and cannot read or write the extension directory directly.
- Named commands from enabled extensions use `extension:<id>:<commandId>`. Only after reparsing the installed manifest does the platform layer pass the corresponding Lua file to the existing restricted Lua 5.4 runtime. Compatibility `entry` uses `extension:<id>` and remains visible under File > Scripts. Named commands not referenced by any UI contribution also fall back to that script list so upgrading an older extension does not remove its entry point. Extension entries receive no file, network, process, package-loading, or debug-library permissions and cannot bypass script memory, pixel, instruction-count, or runtime limits.
- `panels[]` describes only MoonSprite-rendered floating panels and command buttons, with visibility entries under Window > Panels. Extensions cannot inject React, DOM, CSS, JavaScript, native code, or arbitrary UI. Built-in menu contributions, new top-level menus, and panel buttons can trigger only validated Lua commands from the same manifest. Every canvas write still passes through script snapshots, Store transactions, undo, and target validation. Panel visibility and position are local application state and do not enter project dirty state or document undo history.

## Consequences

Extension installation has a clear file format and failure boundary. Enabled state and panel layout do not pollute project dirty state or undo history. Windows file association can send `.msext` files back to MoonSprite, while Preferences and drag-and-drop share the same installer implementation. Extension commands share transactions, undo, and target-snapshot validation with ordinary scripts. Enabling, disabling, replacing, or uninstalling an extension refreshes its built-in menu contributions, new top-level menus, and panels so disabled entries are not exposed on later runs.

## Alternatives

Copying extensions directly into the user directory or extracting beside the package cannot reliably prevent path traversal, old-version overwrites, or failed-install residue. An arbitrary archive format would not integrate as cleanly with Windows file associations and the existing ZIP toolchain, so it was rejected.
