# Extension Runtime v1

[中文](runtime-api.md) | English

This page documents the Runtime API currently implemented by MoonSprite. See [MoonSprite Extension Development](README.en.md) for package layout and the complete manifest surface.

Reviewed against the current workspace implementation on 2026-09-19. Package schema, Runtime API and Lua MSE versions are independent. Use the [manifest reference](manifest.en.md), [quickstart](quickstart.en.md), [complete API index](api-index.en.md), and [host form protocol](ui-form.en.md) for their respective contracts.

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

Call `runtime.getCapabilities()` after startup. It returns `{ apiVersion, permissions, methods, windowPresentations, editorEvents }`; `methods` contains only calls supported by both the current host and current grants.

## Permissions

| Permission | Current capability |
| --- | --- |
| `runtime` | `runtime.getCapabilities`; required. |
| `commands` | `commands.execute` and delivery of `command` events. |
| `ui` | `ui.notify`, `ui.openSettings`. |
| `windows` | `windows.open/close/postMessage/setVisible` and `window-message` events. |
| `workspace.read` | `workspace.listProjects/getActiveProject` and `project` events. |
| `workspace.write` | `workspace.activateProject`. |
| `document.read` | `document.getSummary/getLayers/getFrames`, `colors.get`. |
| `document.write` | `document.undo/redo`, `colors.setPrimary/setSecondary`; no arbitrary pixel writes. |
| `events` | `interaction`, `clock`, `document-saved`, `export-complete`, `editor-event`. |
| `storage` | `storage.get/set/remove/list` and `settings-changed` events. |
| `resources` | `resources.read`. |
| `tools` | `tools.getActive/setActive`. |
| `clipboard` | `clipboard.readText/writeText`. |
| `notifications` | `notifications.show`; v1 displays an in-app MoonSprite message, not a system notification. |
| `network` | `network.fetch`. |
| `diagnostics` | `diagnostics.log`. |
| `menus` | `menus.setItems`; menu actions also require `commands`. |
| `io` | Reserved with no callable v1 methods. |

Declaring a permission does not create a capability by itself. Call only methods listed by `runtime.getCapabilities().methods`.

`menus.setItems` requires both `menus` and `commands`. Opening a resource-backed window also needs `resources`; a method appearing in capabilities does not validate its arguments or grant dependent permissions.

## Runtime API

### Runtime And Commands

- `runtime.getCapabilities()` -> `{ apiVersion, permissions, methods, windowPresentations, editorEvents }`.
- `runtime.getLocale()` -> `{ locale }`: current application UI language (BCP 47). Requires `runtime`.

- `commands.execute({ commandId })` -> `boolean`. Executes a Lua, Runtime, or settings command from this extension. Avoid recursively triggering the same Runtime command.
- `menus.setItems({ menuId, items })` replaces the dynamic items of a top-level menu declared by this extension (up to 64 items). Each item is `{ id, name, event, checked }`. Clicking emits a `command` event with the item ID as `commandId`. Dynamic items precede manifest commands with a separator; empty lists render no placeholders. Disabling the extension clears them.
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

### Results, validation, and readiness

Except for the documented queries and `commands.execute`, successful Runtime methods resolve to `null`. `storage.list()` returns sorted keys. `commands.execute()` returns whether dispatch was accepted, not whether Lua finished or committed successfully; it does not return a transaction result.

`document.getSummary()` returns `null` without an active project; `document.getLayers/getFrames/undo/redo` reject in that case. Runtime layer opacity is `0..1`; frame `index` is zero-based and `duration` is milliseconds, unlike Lua frame numbering and compatibility `Frame.duration` seconds. Color input requires four finite numeric RGBA channels.

Tool IDs: `pencil`, `airbrush`, `eraser`, `fill`, `eyedropper`, `selection`, `shape`, `line`, `text`, `move`, `hand`, `zoom`, `rotate`, `liquify`, `smooth`. Dynamic menu items require all four fields including boolean `checked`; item IDs/events use 1–80 ASCII letters/digits/dot/hyphen/underscore, names must be nonblank and at most 80 JavaScript string units, and item IDs must be unique.

Storage requires JSON-serializable values; `undefined` and cyclic objects fail. Keys must be nonempty, at most 160 UTF-8 bytes and contain no U+0000–001F characters. Value/total quotas measure serialized UTF-8 value bytes; keys do not count toward the total. Missing or unreadable JSON returns `null`. Runtime/window writes do not automatically broadcast `settings-changed`; settings UI commits and HTML settings `storage.set` do. Settings `storage.remove` does not broadcast.

Network bodies must be strings. Requests run through host fetch and remain subject to CORS, TLS and network errors; the 2 MiB response check occurs after reading the body and is not a streaming memory bound. An error-level diagnostic also updates application status. Bridge requests have no general timeout or durable message queue. A successful open/send is not a page-ready or delivery acknowledgement: use an explicit ready message as in the quickstart. Subscribe synchronously before awaiting initialization.

## Events

Subscribe with `moonsprite.on(type, listener)`, which returns an unsubscribe function. The same event is also dispatched as a `moonsprite:<type>` DOM `CustomEvent`.

| Event | Permission | Payload |
| --- | --- | --- |
| `activate` | Always | `{ apiVersion, extensionId }`. |
| `locale-changed` | `runtime` | `{ locale }`. Sent before `activate` and whenever the application language changes; unchanged preferences do not emit it. |
| `deactivate` | Always | No additional fields. |
| `project` | `workspace.read` | `{ project: ProjectSnapshot \| null, homeOpen }`. |
| `command` | `commands` | `{ commandId, event }`. |
| `settings-changed` | `storage` | `{ key, value }`. |
| `window-message` | `windows` | `{ windowId, message }`. |
| `interaction` | `events` | `{ kind: "pointer" \| "keyboard" }`; input inside the MoonSprite main window only. |
| `clock` | `events` | `{ timestamp }`; currently approximately every 30 seconds and not a precision timer. |
| `document-saved` | `events` | `{ projectId }`. |
| `export-complete` | `events` | `{ projectId, format? }`. |
| `editor-event` | `events` | `{ name, timestamp, projectId?, detail }`; names are returned in `editorEvents`, as described below. |

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

- `windows.open({ windowId, resourceId, options? })`. The resource must be in `runtime.resources`, and For native windows, `windowId` is 1–80 ASCII letters/digits/dots/hyphens/underscores; use the same convention for embedded views. Defaults are `x: 32`, `y: 72`, `width: 256`, `height: 256`, `transparent: true`, and `focusable: false`.
- Window messages target only the specified window. `moonsprite.window.id` identifies the receiving window for configuration checks.
- `windows.setVisible({ windowId, visible })` hides or shows an existing native window/overlay while retaining scripts and resources. Host dialogs do not support this call.
- `windows.close({ windowId? })`; omitting `windowId` closes every auxiliary window owned by this extension.
- `windows.postMessage({ windowId, message })` sends a message to one window. Use JSON-compatible plain objects, arrays and scalars for the native window JSON transport; do not depend on transferring Map, BigInt, functions or DOM objects.

The window is a borderless owner-bound auxiliary window of the MoonSprite main window, not a system-wide always-on-top window. Stopping Runtime closes every window owned by that extension.

### Presentation support matrix

| Capability | `native` (default) | `dialog` | `overlay` |
| --- | --- | --- | --- |
| Bounds / host bounds / pointer / hit region | Supported; main outer-window logical origin | Rejected; host manages geometry | Supported; client CSS origin `(0,0)` |
| `window.startDrag` | Native drag | No-op | Call after pointer press |
| `windows.setVisible` | Supported | Unsupported; close/reopen instead | Supported |
| `options.x/y/width/height` | Defaults 32/72/256/256, integer rounding, size 32–2048 | Ignored | Defaults 32/72/256/256, finite size 1–8192 |
| `options.transparent/focusable` | Defaults true/false | Host-managed | Not native options |
| `options.title/component` | Not used | Title defaults to extension name; `component: "form"` selects host nodes | Not used |
| Capacity | Native host resources | One visible host dialog per extension; new dialog replaces it | 16 per extension |

Use distinct IDs across presentations. All window resources need `resources` as well as `windows`. `window.id` is a string, `window.onMessage` returns an unsubscribe function; other window-bridge functions return Promises. Only Runtime has `call`, `on`, `apiVersion`, and the Runtime domains; neither a window nor settings page inherits these. See the [complete bridge inventory](api-index.en.md).

### Window Side

Window HTML receives a positional-argument bridge distinct from Runtime:

```js
await moonsprite.storage.get(key)
await moonsprite.resources.read(resourceId)
await moonsprite.window.startDrag()
const bounds = await moonsprite.window.getBounds()
const pointer = await moonsprite.window.getPointerPosition()
await moonsprite.window.setBounds({ x, y, width, height })
await moonsprite.window.setHitRegion(sourceWidth, sourceHeight, spans)
await moonsprite.window.postMessage(message)
await moonsprite.window.close()
const off = moonsprite.window.onMessage(listener)
await moonsprite.diagnostics.log(message, level)
```

`getBounds/setBounds` use logical pixels relative to the main window's top-left corner; width and height must be in `32..2048`. Each `setHitRegion` span is `{ x, y, width }` and declares an interactive opaque run on one row. At most 131,072 spans are accepted; input outside the region passes through to MoonSprite. Resubmit the region against the current viewport after resizing.

Windows also dispatch `moonsprite:window-moved` and `moonsprite:window-focus` DOM events. Persist positions with `getBounds()` rather than the platform-native coordinates in `window-moved`. The host supplies `--cursor-grab` and `--cursor-grabbing` CSS variables so drag interfaces can reuse MoonSprite cursors.

`window.setCommandState(commandId, { checked?, visible? })` reports checked/visibility state for a command declared by this extension; values must be booleans. This is separate from `menus.setItems`, which replaces dynamic top-menu entries. Window storage also supports positional `set(key, value)`, `remove(key)`, and `list()` and shares the extension ID namespace with its Runtime and settings page.

Native windows, host dialogs, and overlays expose different geometry capabilities. `getPointerPosition()` is available to native windows and overlays, not host dialogs; native coordinates are relative to the main window frame, while overlay coordinates use the client-area CSS origin. Check `windowPresentations` before choosing a surface.

### Themes, host dialogs, and forms

The host injects current `--theme-*` and `--cursor-*` CSS variables, including cursor scaling, and refreshes them when preferences change. Use `<body data-ms-dialog>`, headings, sections and `button.primary` for themed management pages; omit it for a transparent scene. A `data-ms-drag` handle invokes window dragging where supported. The extension cannot access host React or DOM.

`options.presentation: "dialog"` uses the host ModalShell and DialogHeader; title defaults to the extension name. One dialog per extension is displayed; a new one replaces it. Geometry and focus belong to the host. With `options.component: "form"`, the resource runs hidden logic and the host renders nodes. See the [full form protocol](ui-form.en.md) for all 17 types, edited values, request acknowledgement and file limits. Manifest settings use a separate [settings schema](manifest.en.md).

In native windows, `window.getHostBounds()` returns the main client area relative to the main outer window as logical `{ x, y, width, height }`. Main-window move, resize or DPI changes emit `moonsprite:window-host-geometry`; re-read bounds. Store normalized positions and constrain actual visible content rather than transparent padding.

### Main-window overlays

`runtime.getCapabilities().windowPresentations` lists authorized presentations: `native`, `dialog`, and `overlay`; it is empty without the `windows` permission. Older hosts may omit it.

```js
await moonsprite.windows.open({
  windowId: 'helper', resourceId: 'helper-ui',
  options: { presentation: 'overlay', x: 40, y: 80, width: 240, height: 160 }
})
await moonsprite.windows.setVisible({ windowId: 'helper', visible: false })
await moonsprite.windows.postMessage({ windowId: 'helper', message: { type: 'update' } })
await moonsprite.windows.close({ windowId: 'helper' })
```

Overlays are sandboxed iframes in the main window, with no native window or access to host DOM, React, Store, or Tauri. They reuse the `windows` permission and manifest resource validation, with up to 16 per extension. Reopening an ID updates bounds and shows it; changing resources reloads it. Closing, disabling, or unloading destroys its overlays. Hiding preserves page state; extensions should pause their own timers.

Pages retain `window.getBounds/setBounds/getHostBounds/getPointerPosition/setHitRegion/startDrag/postMessage/close`, storage, resources, themes, and command state APIs. Coordinates are CSS pixels in the main client viewport, whose origin is `(0,0)`. Do not mix native-window coordinates. Pointer positions use the same coordinates and return null outside the app. Persist relative positions across presentation changes.

`setBounds({x,y,width,height})` accepts dimensions from 1 to 8192 and positions with absolute values up to 32768. The host clips overflow; extensions constrain their visible content. Call `startDrag()` after a pointer press, or implement custom dragging with pointer capture and `setBounds`. Host resizing emits `moonsprite:window-host-geometry`; position updates emit `moonsprite:window-moved`.

The initial hit region is empty. `setHitRegion(sourceWidth, sourceHeight, spans)` declares visible and interactive areas using one-pixel-high `{x,y,width}` scanlines, up to 65536 spans and source dimensions of 8192. Regions scale with bounds and clip both painting and hit testing; outside input reaches the underlying app without synthetic forwarding. Include bubbles and controls in the region. Overlays sit above editor content and below host menus and dialogs; they cannot raise their stacking priority or override global cursor preferences.

These APIs support floating tools, information cards, and contextual helpers. Animation, reminders, and relative position policies remain extension business logic.

## Window bridge details

`window.setCursorPolicy({ useLocalCursors: boolean })` validates the boolean in native windows but reapplies the user preference regardless of the supplied value; embedded views perform no operation. `setCommandState(commandId, { checked?, visible? })` preserves omitted fields.

Window messages also emit `moonsprite:message` with the payload as `event.detail`. Native geometry DOM events contain `{ kind: "moved", position }`, `{ kind: "focus", focused }`, or `{ kind: "host-geometry" }`; overlay movement uses its client-coordinate position and it does not provide a native focus event. Read current bounds instead of persisting a native moved-event position.

## Editor event details

Extensions with `events` permission discover supported names in `runtime.getCapabilities().editorEvents` and subscribe with `moonsprite.on('editor-event', handler)`. Payloads contain `{type, name, timestamp, projectId?, detail}`.

Names include `history.undo`, `history.redo`, `color.sampled`, `drawing.completed`, `fill.completed`, `document.saved`, `document.changed`, `project.created/opened/closed/activated`, `tool.changed`, `color.primary-changed/secondary-changed`, `selection.created/cleared`, `layer.created/deleted/activated`, `frame.changed`, `animation.started/stopped`, and `view.changed`. Operation events report successful operations; cancellation and no-ops do not report success. New sessions with file sources produce opened events, otherwise created; existing sessions are not replayed at subscription. State events describe changes: undo restoring a layer also produces `layer.created`. Selection changes are included in `selection.created`.

Details expose scalar metadata such as `tool`, `previous`, `layerId`, `frameId`, `revision`, and `fullySaved`, never paths, pixels, or internal objects. Observation does not write history. Existing export, saved, project, and interaction events remain compatible. Use `editor-event/document.saved` for precise save completion. Pointer movement and wheel activity now count as interactions, throttled to once per 500ms. Extensions implement their own filtering, cooldowns, and behavior; the host contains no pet or animation rules.

Full form node fields, edited-value semantics, request acknowledgements and file limits are in the [host form protocol](ui-form.en.md).

## Compatibility Checklist

1. Declare Runtime v1 and only the permissions needed.
2. On `activate`, call `runtime.getCapabilities()` and use only returned methods.
3. Handle Promise rejection, a `null` project, missing resources, and closed windows as normal states.
4. Use opaque IDs and extension storage; do not cache installation paths or internal objects.
5. Package bulk document edits as Lua commands and invoke them with `commands.execute()`.

`activate` is sent after the Runtime iframe loads, followed by the initial authorized `project` snapshot. During loading only `command` and `settings-changed` are buffered in memory; this is not persistence or replay after disable. Every event object includes `type` in addition to the table fields. `deactivate` is best effort during teardown: persist important state when it changes, not in an awaited shutdown handler. Legacy `document-saved` observes dirty-to-clean transitions; use `editor-event` with `name: "document.saved"` and `detail.fullySaved` for operation-based save completion.

`menus.setItems` accepts an optional `name` (1–80 characters) to update the owning top menu title. Dynamic items with a declared command ID replace that static row while the runtime is active; stopping the extension clears the override.

Dynamic menu items accept optional `dividerBefore: boolean` to insert the host menu divider before the item.
