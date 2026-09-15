# Extension Runtime v1

[中文](runtime-api.md) | English

This page documents the Runtime API currently implemented by MoonSprite. See [MoonSprite Extension Development](README.en.md) for package layout and the complete manifest surface.

## Manifest

Resident extensions use `schemaVersion: 2` and `apiVersion: "1.0.0"`. `runtime.entry` is self-contained UTF-8 HTML, `runtime.permissions` declares permissions, and `runtime.resources` maps opaque resource IDs to package files. Permissions must include `runtime` and cannot be duplicated.

```json
{
  "schemaVersion": 2,
  "apiVersion": "1.0.0",
  "id": "com.example.extension",
  "name": "Example",
  "version": "1.0.0",
  "runtime": {
    "entry": "runtime/index.html",
    "permissions": ["runtime", "commands", "events", "storage", "resources", "windows"],
    "resources": { "overlay": "ui/overlay.html", "image": "assets/image.png" }
  }
}
```

## Security Boundary

Runtime, HTML settings pages, and extension-window content run in `sandbox="allow-scripts"` iframes without same-origin access. The default CSP blocks direct networking and external scripts. Runtime cannot access installation paths, Tauri, React, Store, or internal document objects. Network and package resources must go through the host bridge. Arbitrary pixel and document-structure writes should remain packaged Lua commands so transactions, undo, and target validation are preserved.

## Calling Convention

Runtime receives a read-only global `window.moonsprite` object. Every domain method accepts one optional parameter object and returns a `Promise`. The lower-level `moonsprite.call(method, params)` is also available. Failures reject with a host-provided error message.

```js
const capabilities = await moonsprite.runtime.getCapabilities()
const project = await moonsprite.workspace.getActiveProject()
await moonsprite.storage.set({ key: 'preferences', value: { enabled: true } })
```

Call `runtime.getCapabilities()` after startup. It returns `{ apiVersion, permissions, methods }`; `methods` contains only calls supported by both the current host and current grants.

## Permissions

| Permission | Current capability |
| --- | --- |
| `runtime` | `runtime.getCapabilities`; required. |
| `commands` | `commands.execute` and delivery of `command` events. |
| `ui` | `ui.notify`, `ui.openSettings`. |
| `windows` | `windows.open/close/postMessage` and `window-message` events. |
| `workspace.read` | `workspace.listProjects/getActiveProject` and `project` events. |
| `workspace.write` | `workspace.activateProject`. |
| `document.read` | `document.getSummary/getLayers/getFrames`, `colors.get`. |
| `document.write` | `document.undo/redo`, `colors.setPrimary/setSecondary`; no arbitrary pixel writes. |
| `events` | `interaction`, `clock`, `document-saved`, `export-complete`. |
| `storage` | `storage.get/set/remove/list` and `settings-changed` events. |
| `resources` | `resources.read`. |
| `tools` | `tools.getActive/setActive`. |
| `clipboard` | `clipboard.readText/writeText`. |
| `notifications` | `notifications.show`; v1 displays an in-app MoonSprite message, not a system notification. |
| `network` | `network.fetch`. |
| `diagnostics` | `diagnostics.log`. |
| `menus`, `io` | Reserved names with no callable v1 methods; capability discovery will not return methods for them. |

Declaring a permission does not create a capability by itself. Call only methods listed by `runtime.getCapabilities().methods`.

## Runtime API

### Runtime And Commands

- `runtime.getCapabilities()` -> `{ apiVersion, permissions, methods }`.
- `commands.execute({ commandId })` -> `boolean`. Executes a Lua, Runtime, or settings command from this extension. Avoid recursively triggering the same Runtime command.
- `ui.openSettings()` opens this extension's `settingsUi` or `settingsEntry`.
- `ui.notify({ message })` and `notifications.show({ message })` display an in-app message of at most 500 characters.

### Projects And Documents

- `workspace.listProjects()` -> `ProjectSnapshot[]`.
- `workspace.getActiveProject()` and `document.getSummary()` -> `ProjectSnapshot | null`.
- `workspace.activateProject({ projectId })` activates a project.
- `document.getLayers()` -> `{ id, name, visible, opacity, blendMode }[]`.
- `document.getFrames()` -> `{ id, index, duration }[]`; returns an empty array when no animation data exists.
- `document.undo()` and `document.redo()` operate on the active project history.

`ProjectSnapshot` contains `id`, `name`, `width`, `height`, `colorMode`, `layerCount`, `frameCount`, `dirty`, and `contentRevision`. It contains neither pixels nor mutable document references.

### Tools And Colors

- `tools.getActive()` -> active tool ID or `null`.
- `tools.setActive({ tool })` selects a host-supported tool ID and rejects unknown IDs.
- `colors.get()` -> `{ primary, secondary } | null`.
- `colors.setPrimary({ color })` and `colors.setSecondary({ color })`; `color` is `{ r, g, b, a }`, with channels rounded and clamped to `0..255`.

### Storage And Resources

- `storage.get({ key })` -> JSON value or `null`.
- `storage.set({ key, value })`, `storage.remove({ key })`, and `storage.list()`.
- `resources.read({ resourceId })` -> `number[]`; the resource ID must exist in `runtime.resources`.

Storage is isolated by extension ID: keys are at most 160 bytes, one JSON value is at most 256 KiB, and total storage is at most 1 MiB. Resource reads never expose package paths; one resource is limited to 16 MiB.

### Clipboard, Network, And Diagnostics

- `clipboard.readText()` -> text; `clipboard.writeText({ text })` writes text. The Promise rejects when the OS or WebView denies clipboard access.
- `network.fetch({ url, method?, body? })` accepts HTTP(S) only, defaults to `GET`, omits credentials, and times out after 15 seconds. It returns `{ status, ok, headers, bytes }`, where `bytes` is `number[]`; the response body is limited to 2 MiB. v1 does not support custom request headers.
- `diagnostics.log({ message, level? })` writes a prefixed extension log. `level` is `debug`, `info`, `warn`, or `error`; messages are limited to 2,000 characters.

## Events

Subscribe with `moonsprite.on(type, listener)`, which returns an unsubscribe function. The same event is also dispatched as a `moonsprite:<type>` DOM `CustomEvent`.

| Event | Permission | Payload |
| --- | --- | --- |
| `activate` | Always | `{ apiVersion, extensionId }`. |
| `deactivate` | Always | No additional fields. |
| `project` | `workspace.read` | `{ project: ProjectSnapshot \| null, homeOpen }`. |
| `command` | `commands` | `{ commandId, event }`. |
| `settings-changed` | `storage` | `{ key, value }`. |
| `window-message` | `windows` | `{ windowId, message }`. |
| `interaction` | `events` | `{ kind: "pointer" \| "keyboard" }`; input inside the MoonSprite main window only. |
| `clock` | `events` | `{ timestamp }`; currently approximately every 30 seconds and not a precision timer. |
| `document-saved` | `events` | `{ projectId }`. |
| `export-complete` | `events` | `{ projectId, format? }`. |

Treat events as hints rather than a durable queue. Events missed while Runtime is stopped or the extension is disabled are not replayed.

## Commands And Menus

Each command selects exactly one handler: restricted Lua through `entry`, a `command` event through `runtimeEvent`, or extension settings through `opensSettings: true`. A `runtimeEvent` command requires `commands`. A named `menuItems[]` contribution creates a submenu; an unnamed one inserts commands directly into a built-in menu. `topMenus[]` creates a standalone top-level menu. All menus and panels are host-rendered; extensions cannot inject menu DOM.

## Host Component Settings

Prefer schema 2 `settingsUi`. `storageKey` points to one extension-storage object. The host merges defaults, normalizes types, and emits `settings-changed` after every update.

- `checkbox`: boolean `defaultValue`.
- `number`: numeric `defaultValue`, with optional `min`, `max`, positive `step`, and `suffix`.
- `text`: string `defaultValue`, with optional `placeholder` and `maxLength`; the default limit is 1,024 and the maximum is 4,096 characters.
- `select`: string `defaultValue` and 1 to 64 `{ value, label, description? }` options; the default must match an option.
- `button`: `commandId` must reference this extension's `runtimeEvent` command. `variant` is `primary`, `secondary`, or `danger` and defaults to `secondary`; `closeOnRun` defaults to `false`.

`settingsUi` supports at most 64 controls. Every control may provide `description`. Reset restores manifest defaults and writes them to the same storage key.

## HTML Settings Page

Use `settingsEntry` only when host components cannot express the interface; it is mutually exclusive with `settingsUi`. The page receives a smaller positional-argument bridge:

```js
await moonsprite.storage.get(key)
await moonsprite.storage.set(key, value)
await moonsprite.storage.remove(key)
await moonsprite.storage.list()
await moonsprite.settings.close()
```

Storage writes emit `settings-changed` to a running Runtime. The settings page has no Runtime project, network, window, clipboard, or command APIs.

## Extension Windows

### Runtime Side

- `windows.open({ windowId, resourceId, options? })`. The resource must be in `runtime.resources`, and `windowId` follows extension ID character rules. Defaults are `x: 32`, `y: 72`, `width: 256`, `height: 256`, `transparent: true`, and `focusable: false`.
- `windows.close({ windowId? })`; omitting `windowId` closes every auxiliary window owned by this extension.
- `windows.postMessage({ windowId, message })` sends structured-clone-compatible data to one window.

The window is a borderless owner-bound auxiliary window of the MoonSprite main window, not a system-wide always-on-top window. Stopping Runtime closes every window owned by that extension.

### Window Side

Window HTML receives a positional-argument bridge distinct from Runtime:

```js
await moonsprite.storage.get(key)
await moonsprite.resources.read(resourceId)
await moonsprite.window.startDrag()
const bounds = await moonsprite.window.getBounds()
await moonsprite.window.setBounds({ x, y, width, height })
await moonsprite.window.setHitRegion(sourceWidth, sourceHeight, spans)
await moonsprite.window.postMessage(message)
await moonsprite.window.close()
const off = moonsprite.window.onMessage(listener)
await moonsprite.diagnostics.log(message, level)
```

`getBounds/setBounds` use logical pixels relative to the main window's top-left corner; width and height must be in `32..2048`. Each `setHitRegion` span is `{ x, y, width }` and declares an interactive opaque run on one row. At most 131,072 spans are accepted; input outside the region passes through to MoonSprite. Resubmit the region against the current viewport after resizing.

Windows also dispatch `moonsprite:window-moved` and `moonsprite:window-focus` DOM events. Persist positions with `getBounds()` rather than the platform-native coordinates in `window-moved`. The host supplies `--cursor-grab` and `--cursor-grabbing` CSS variables so drag interfaces can reuse MoonSprite cursors.

## Compatibility Checklist

1. Declare Runtime v1 and only the permissions needed.
2. On `activate`, call `runtime.getCapabilities()` and use only returned methods.
3. Handle Promise rejection, a `null` project, missing resources, and closed windows as normal states.
4. Use opaque IDs and extension storage; do not cache installation paths or internal objects.
5. Package bulk document edits as Lua commands and invoke them with `commands.execute()`.
