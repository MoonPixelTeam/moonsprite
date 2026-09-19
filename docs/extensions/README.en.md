# MoonSprite Extension Development

[中文](README.md) | English

MoonSprite extensions use the `.msext` suffix and are ZIP containers. The package root must contain `manifest.json`, and every entry point and resource must remain inside the package. Extensions cannot depend on absolute installation paths or directly import MoonSprite React, Store, or Tauri modules.

## Choose An Extension Model

- `schemaVersion: 1`: declarative Lua extensions for undoable document commands, menus, and command panels. See [Lua Scripts and the MSE API](../scripting/README.en.md).
- `schemaVersion: 2`: retains Lua command compatibility and adds Extension Runtime v1, host-rendered settings, and extension-owned auxiliary windows. A manifest with `runtime` must also declare `apiVersion: "1.0.0"`.

Both versions may use `commands[]`, `panels[]`, `menuItems[]`, and `topMenus[]`. Only schema 2 supports `settingsUi` and `runtime`. Both versions may use a restricted HTML `settingsEntry`.

## Package Layout

```text
example.msext
├─ manifest.json
├─ runtime/index.html
├─ settings/index.html
├─ commands/apply.lua
├─ ui/overlay.html
└─ assets/overlay.png
```

HTML entries must be self-contained. The default CSP blocks direct package-relative scripts, external scripts, and external images. Declare binary files in `runtime.resources` and read them through opaque resource IDs. Package paths use `/` and cannot contain absolute paths, `..`, backslashes, symbolic links, or Windows reserved names.

## Manifest Fields

### Base Fields

| Field | Required | Description |
| --- | --- | --- |
| `schemaVersion` | Yes | Currently `1` or `2`. |
| `id` | Yes | At most 80 bytes; letters, digits, dots, hyphens, and underscores only. Keep it stable after release. |
| `name` | Yes | User-visible name. |
| `version` | Yes | Extension version string. |
| `description`, `author` | No | Metadata shown during installation and management. |
| `apiVersion` | With Runtime | Currently must be `"1.0.0"`. |
| `entry` | No | Legacy single Lua entry. |
| `settingsEntry` | No | Self-contained sandboxed HTML settings page; mutually exclusive with `settingsUi`. |
| `settingsUi` | No | Schema 2 host-rendered settings. |
| `runtime` | No | Schema 2 resident Runtime, permissions, and resource map. |

### Contributions

- `commands[]`: every command must select exactly one of `entry`, `runtimeEvent`, or `opensSettings: true`.
- `panels[]`: host-rendered command panels toggled under Window > Panels; `defaultVisible` defaults to `false`.
- `menuItems[]`: inserts into `file`, `edit`, `select`, `canvas`, `layer`, `window`, or `help`; `position` is `start` or `end`. Supplying `name` creates a submenu; omitting it inserts commands directly.
- `topMenus[]`: adds a host-rendered top-level menu; `position` accepts `start`, `end`, `before:<builtInMenu>`, or `after:<builtInMenu>`.

Contribution IDs are case-insensitively unique within their own namespaces. Command references must match the manifest command ID casing exactly.

## Host UI And Custom HTML

Menus, panels, and `settingsUi` are rendered by the MoonSprite component library and follow its theme and interaction rules. Extensions declare supported controls but never receive React component instances. Use Runtime-owned extension-window HTML for custom canvases, media, or transparent animation. Use `settingsEntry` only when the component schema cannot express the settings page.

## Limits And Compatibility

- Archives are limited to 50 MiB, 256 files, 256 MiB unpacked, and a 256 KiB `manifest.json`.
- Runtime entries are limited to 1 MiB and settings entries to 512 KiB. A Runtime may expose at most 64 resources, each at most 16 MiB.
- A package may contain at most 64 commands, 16 panels, 32 built-in-menu contributions, 16 top-level menus, and 64 settings controls. A panel or menu may reference at most 32 commands.
- A schema 2 Runtime cannot run in older MoonSprite builds without Runtime v1. Call `runtime.getCapabilities()` after startup instead of assuming every declared API is present.
- Arbitrary document pixel or structure writes should still use packaged Lua commands to retain transactions, undo, target validation, and rollback.

## Installation And Lifecycle

MoonSprite validates and extracts into a staging directory before atomically replacing an installed extension with the same ID. Updates preserve enabled state. Only enabled extensions contribute runtimes, menus, and panels. Disabling, replacing, or uninstalling destroys the Runtime and closes its auxiliary windows. Extension storage is isolated by extension ID and does not modify project files, dirty state, or undo history.

## Further Reading

- [Extension Runtime v1](runtime-api.en.md): permissions, calls, events, settings pages, and the window bridge.
- [Lua Scripts and the MSE API](../scripting/README.en.md): Lua commands, transactions, and scripting capabilities.
- [Extension Package Format ADR](../adr/0020-extension-package-format.en.md): installation, security, and architecture decisions.

## Developer reference map

1. [Quickstart](quickstart.en.md): packageable three-file example, readiness and troubleshooting.
2. [Manifest reference](manifest.en.md): every root/contribution/settings field and default.
3. [Runtime API](runtime-api.en.md): permissions, results, events and window presentations.
4. [Host forms](ui-form.en.md): complete node catalog and action/file protocol.
5. [API coverage index](api-index.en.md): Runtime, bridges, MSE methods and source-based coverage checking.
6. [Lua compatibility](../scripting/compatibility-api.en.md): implemented app/userdata subset and no-op limits.
