# Extension API coverage index

[中文](api-index.md) | English

Audited against the current workspace on 2026-09-19. This is the public extension surface, not the internal Tauri/Store protocol. Tables list 32 Runtime methods, 68 MSE methods, 16 asynchronous window bridge methods plus its property/subscription, 5 settings methods, and 23 editor event names. Function-name coverage is machine-checked; behavior still needs source review and target-host acceptance.

## Runtime methods

All names are prefixed by `moonsprite.`; results below are Promise payloads. [Runtime reference](runtime-api.en.md) defines permissions, errors, units and limitations. `RGBA` is `{ r, g, b, a }`. Global `apiVersion: "1.0.0"`, `call(method, params?) -> Promise` and `on(type, listener) -> unsubscribe` are also available.

| Method | Parameters | Result | Permission |
| --- | --- | --- | --- |
| `runtime.getCapabilities` | `()` | `{ apiVersion, permissions, methods, windowPresentations, editorEvents }` | `runtime` |
| `commands.execute` | `({ commandId })` | `boolean` | `commands` |
| `menus.setItems` | `({ menuId, items: [{ id, name, event, checked }] })` | `null` | `menus` |
| `ui.notify` | `({ message })` | `null` | `ui` |
| `ui.openSettings` | `()` | `null` | `ui` |
| `windows.open` | `({ windowId, resourceId, options? })` | `null` | `windows` |
| `windows.close` | `({ windowId? })` | `null` | `windows` |
| `windows.setVisible` | `({ windowId, visible })` | `null` | `windows` |
| `windows.postMessage` | `({ windowId, message })` | `null` | `windows` |
| `workspace.listProjects` | `()` | `ProjectSnapshot[]` | `workspace.read` |
| `workspace.getActiveProject` | `()` | `ProjectSnapshot \| null` | `workspace.read` |
| `workspace.activateProject` | `({ projectId })` | `null` | `workspace.write` |
| `document.getSummary` | `()` | `ProjectSnapshot \| null` | `document.read` |
| `document.getLayers` | `()` | `{ id, name, visible, opacity, blendMode }[]` | `document.read` |
| `document.getFrames` | `()` | `{ id, index, duration }[]` | `document.read` |
| `document.undo` | `()` | `null` | `document.write` |
| `document.redo` | `()` | `null` | `document.write` |
| `tools.getActive` | `()` | `string \| null` | `tools` |
| `tools.setActive` | `({ tool })` | `null` | `tools` |
| `colors.get` | `()` | `{ primary: RGBA, secondary: RGBA } \| null` | `document.read` |
| `colors.setPrimary` | `({ color: RGBA })` | `null` | `document.write` |
| `colors.setSecondary` | `({ color: RGBA })` | `null` | `document.write` |
| `storage.get` | `({ key })` | `JSON \| null` | `storage` |
| `storage.set` | `({ key, value })` | `null` | `storage` |
| `storage.remove` | `({ key })` | `null` | `storage` |
| `storage.list` | `()` | `string[]` | `storage` |
| `resources.read` | `({ resourceId })` | `number[]` | `resources` |
| `clipboard.readText` | `()` | `string` | `clipboard` |
| `clipboard.writeText` | `({ text })` | `null` | `clipboard` |
| `notifications.show` | `({ message })` | `null` | `notifications` |
| `network.fetch` | `({ url, method?, body? })` | `{ status, ok, headers, bytes }` | `network` |
| `diagnostics.log` | `({ message, level? })` | `null` | `diagnostics` |

`menus.setItems` additionally requires `commands`; resource-backed windows additionally require `resources`. `io` is reserved with no callable Runtime method. Dispatch success is not script completion.

## Window and settings bridges

These are positional APIs in their respective HTML contexts, not Runtime domains. See the presentation matrix in the [window reference](runtime-api.en.md). Successful mutation payloads are not application data; some embedded operations resolve without a value.

| Window API | Parameters | Result |
| --- | --- | --- |
| `window.setBounds` | `({ x, y, width, height })` | `null` |
| `window.startDrag` | `()` | `null / void` |
| `window.getBounds` | `()` | `{ x, y, width, height }` |
| `storage.get` | `(key)` | `JSON \| null` |
| `storage.set` | `(key, value)` | `null` |
| `storage.remove` | `(key)` | `null` |
| `storage.list` | `()` | `string[]` |
| `resources.read` | `(resourceId)` | `number[]` |
| `window.getHostBounds` | `()` | `{ x, y, width, height }` |
| `window.getPointerPosition` | `()` | `{ x, y } \| null` |
| `window.setHitRegion` | `(sourceWidth, sourceHeight, [{ x, y, width }])` | `null` |
| `window.setCommandState` | `(commandId, { checked?, visible? })` | `null` |
| `window.setCursorPolicy` | `({ useLocalCursors: boolean })` | `null` |
| `window.postMessage` | `(message)` | `null` |
| `window.close` | `()` | `null` |
| `diagnostics.log` | `(message, level?)` | `null` |
| `window.id` | — | string |
| `window.onMessage` | `(listener)` | Unsubscribe function |

HTML settings expose only: `storage.get` `(key)`, `storage.set` `(key, value)`, `storage.remove` `(key)`, `storage.list` `()`, `settings.close` `()`.

## MSE methods

Prefix names with `mse.`. Signatures reference the checked [LuaLS declarations](../scripting/mse-api.lua); behavior and parameter guidance are in [MSE API](../scripting/mse-api.en.md). `boolean` write results only acknowledge queueing. `ui.alert` and `ui.dialog` delegate to the compatibility layer. `mse.isSupported(path)`, `mse.apiVersion`, `mse.status`, and `mse.capabilities` provide discovery. A read-only flag of false does not imply a document-history write.

| Method | Signature | Read only |
| --- | --- | --- |
| `document.info` | `fun(): MseDocumentInfo` | true |
| `document.activeLayer` | `fun(): MseLayerInfo\|nil` | true |
| `document.create` | `fun(spec: MseDocumentCreateSpec): boolean` | false |
| `document.open` | `fun(path?: string): boolean` | false |
| `document.save` | `fun(spec?: MseDocumentSaveSpec): boolean` | false |
| `layers.list` | `fun(): MseLayerInfo[]` | true |
| `layers.get` | `fun(id: string): MseLayerInfo\|nil` | true |
| `layers.create` | `fun(spec?: MseLayerCreateSpec): boolean` | false |
| `layers.duplicate` | `fun(id: string): boolean` | false |
| `layers.remove` | `fun(id: string): boolean` | false |
| `layers.update` | `fun(id: string, patch: MseLayerUpdateSpec): boolean` | false |
| `animation.frames` | `fun(): MseAnimationFrame[]` | true |
| `animation.setFrame` | `fun(frame: integer\|string): boolean` | false |
| `animation.loops` | `fun(): MseAnimationLoop[]` | true |
| `animation.createLoop` | `fun(spec: MseAnimationLoopSpec): boolean` | false |
| `animation.updateLoop` | `fun(id: string, patch: MseAnimationLoopSpec): boolean` | false |
| `animation.removeLoop` | `fun(id: string): boolean` | false |
| `animation.play` | `fun(loopId?: string): boolean` | false |
| `palette.list` | `fun(): MsePaletteEntry[]` | true |
| `palette.get` | `fun(id: integer): MsePaletteEntry\|nil` | true |
| `palette.create` | `fun(spec: MsePaletteCreateSpec\|MseColor): boolean` | false |
| `palette.update` | `fun(id: integer, patch: MsePaletteUpdateSpec\|MseColor): boolean` | false |
| `palette.remove` | `fun(id: integer): boolean` | false |
| `palette.extract` | `fun(spec?: MsePaletteExtractSpec): boolean` | false |
| `tiles.listSets` | `fun(): MseTilesetInfo[]` | true |
| `tiles.getSet` | `fun(id: string): MseTilesetInfo\|nil` | true |
| `tiles.createSet` | `fun(spec: MseTilesetCreateSpec): boolean` | false |
| `tiles.createLayer` | `fun(spec: MseTileLayerCreateSpec): boolean` | false |
| `tiles.place` | `fun(spec: MseTilePlaceSpec): boolean` | false |
| `tiles.edit` | `fun(spec: MseTileEditSpec): boolean` | false |
| `freeTiles.listSources` | `fun(): MseFreeTileSourceInfo[]` | true |
| `freeTiles.getSource` | `fun(id: string): MseFreeTileSourceInfo\|nil` | true |
| `freeTiles.createSource` | `fun(spec: MseFreeTileSourceCreateSpec): boolean` | false |
| `freeTiles.createLayer` | `fun(spec?: MseFreeTileLayerCreateSpec): boolean` | false |
| `freeTiles.place` | `fun(spec: MseFreeTilePlaceSpec): boolean` | false |
| `freeTiles.edit` | `fun(spec: MseFreeTileEditSpec): boolean` | false |
| `brushes.list` | `fun(): MseBrushInfo[]` | true |
| `brushes.get` | `fun(id: string): MseBrushInfo\|nil` | true |
| `brushes.importImage` | `fun(): boolean` | false |
| `brushes.createFromSelection` | `fun(): boolean` | false |
| `brushes.remove` | `fun(id: string): boolean` | false |
| `selection.info` | `fun(): MseSelectionInfo` | true |
| `selection.set` | `fun(spec: MseSelectionSetSpec): boolean` | false |
| `selection.clear` | `fun(): boolean` | false |
| `selection.invert` | `fun(): boolean` | false |
| `selection.transform` | `fun(spec: MseSelectionTransformSpec): boolean` | false |
| `slices.list` | `fun(): MseSliceInfo[]` | true |
| `slices.get` | `fun(id: string): MseSliceInfo\|nil` | true |
| `slices.create` | `fun(spec: MseSliceCreateSpec): boolean` | false |
| `slices.update` | `fun(id: string, patch: MseSliceUpdateSpec): boolean` | false |
| `slices.remove` | `fun(id: string): boolean` | false |
| `styles.get` | `fun(layerId?: string): MseLayerStyles\|nil` | true |
| `styles.apply` | `(fun(layerId: string, styles: MseLayerStyles): boolean)\|(fun(spec: MseStylesApplySpec): boolean)` | false |
| `styles.copy` | `fun(layerId: string): boolean` | false |
| `styles.paste` | `fun(layerId: string): boolean` | false |
| `styles.clear` | `fun(layerId: string): boolean` | false |
| `styles.setEnabled` | `fun(spec: MseStylesEnabledSpec): boolean` | false |
| `workspace.listPanels` | `fun(): MsePanelInfo[]` | true |
| `workspace.getPanel` | `fun(id: MsePanelId): MsePanelInfo\|nil` | true |
| `workspace.setPanel` | `fun(spec: MsePanelSetSpec): boolean` | false |
| `workspace.showPanel` | `fun(id: MsePanelId): boolean` | false |
| `workspace.hidePanel` | `fun(id: MsePanelId): boolean` | false |
| `io.export` | `fun(spec: MseExportSpec): boolean` | false |
| `io.save` | `fun(spec?: MseDocumentSaveSpec): boolean` | false |
| `io.open` | `fun(path?: string): boolean` | false |
| `ui.notify` | `fun(text: string): boolean` | false |
| `ui.alert` | `fun(value: string\|table): any` | false |
| `ui.dialog` | `fun(options?: table): MseDialog` | false |

## Editor event catalog

All names below arrive within `editor-event`, require `events`, and include `{ type, name, timestamp, projectId?, detail }`. Empty detail means no extra guaranteed metadata. [Runtime events](runtime-api.en.md) also document the 11 outer event types and delivery rules.

| Name | detail |
| --- | --- |
| `history.undo` | `{}` |
| `history.redo` | `{}` |
| `color.sampled` | `{}` |
| `drawing.completed` | `{}` |
| `fill.completed` | `{}` |
| `document.changed` | `{ revision }` |
| `document.saved` | `{ fullySaved }` |
| `project.created` | `{}` |
| `project.opened` | `{}` |
| `project.closed` | `{}` |
| `project.activated` | `{}` |
| `tool.changed` | `{ tool, previous }` |
| `color.primary-changed` | `{}` |
| `color.secondary-changed` | `{}` |
| `selection.created` | `{}` |
| `selection.cleared` | `{}` |
| `layer.created` | `{ layerId }` |
| `layer.deleted` | `{ layerId }` |
| `layer.activated` | `{ layerId }` |
| `frame.changed` | `{ frameId }` |
| `animation.started` | `{}` |
| `animation.stopped` | `{}` |
| `view.changed` | `{}` |

## Maintenance and coverage checking

Run from the repository root:

```powershell
node scripts/check-extension-docs.mjs
node scripts/check-doc-pairs.mjs
```

The checker compares manifest field names and all 18 permissions as well as source registration inventories with both language indexes, LuaLS methods, window/settings bridges, editor event names, 17 form nodes and 13 Lua userdata types; it also checks local links, heading parity and sample JavaScript syntax. It does not infer semantic correctness from a matching method name, perform native installation, or claim desktop acceptance. Adding fields or changing semantics requires updating the relevant reference and examples as well.

Source anchors: [Runtime permissions](../../src/renderer/src/core/extension-runtime.ts), [Runtime dispatch](../../src/renderer/src/components/extensions/ExtensionRuntimeHost.tsx), [MSE registration](../../src-tauri/src/platform_scripts/mse_api.rs), [Lua compatibility](../scripting/compatibility-api.en.md), [host form nodes](ui-form.en.md).
