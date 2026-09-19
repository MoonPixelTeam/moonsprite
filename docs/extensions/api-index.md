# 扩展 API 覆盖索引

中文 | [English](api-index.en.md)

按 2026-09-19 当前工作区核对。这里列出对扩展开放的接口，不包含内部 Tauri/Store 协议：32 个 Runtime 方法、68 个 MSE 方法、16 个异步窗口桥方法及属性/订阅、5 个设置桥方法、23 个编辑器事件。方法名覆盖由脚本检查；具体行为仍需源码复核和目标宿主验收。

## Runtime 方法

以下名称加前缀 `moonsprite.`；返回列为 Promise 的结果。[Runtime 参考](runtime-api.md)规定权限、错误、单位与限制。`RGBA` 为 `{ r, g, b, a }`。另有全局 `apiVersion: "1.0.0"`、`call(method, params?) -> Promise` 和 `on(type, listener) -> 取消订阅函数`。

| 方法 | 参数 | 返回 | 权限 |
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

`menus.setItems` 另需 `commands`；资源窗口另需 `resources`。`io` 权限保留但没有 Runtime 方法。派发成功不是脚本执行完成。

## 窗口与设置桥

这些是各自 HTML 上下文中的位置参数 API，不是 Runtime 领域对象。能力差异见[窗口支持矩阵](runtime-api.md)。成功写入的返回值不是业务数据；部分嵌入视图操作返回空值。

| 窗口 API | 参数 | 返回 |
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
| `window.onMessage` | `(listener)` | 取消订阅函数 |

HTML 设置页仅暴露：`storage.get` `(key)`, `storage.set` `(key, value)`, `storage.remove` `(key)`, `storage.list` `()`, `settings.close` `()`.

## MSE 方法

名称加前缀 `mse.`。签名类型见同步维护的 [LuaLS 声明](../scripting/mse-api.lua)，参数和行为见 [MSE API](../scripting/mse-api.md)。写入的 boolean 仅表示排队，`ui.alert`、`ui.dialog` 调用兼容层。另有 `mse.isSupported(path)`、`mse.apiVersion`、`mse.status`、`mse.capabilities` 用于能力发现。非只读不等于一定写文档撤销历史。

| 方法 | 签名 | 只读 |
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

## 编辑器事件目录

下面名称均包在 `editor-event` 中，需要 `events`，负载为 `{ type, name, timestamp, projectId?, detail }`。空 detail 表示没有额外保证的元数据；[Runtime 事件](runtime-api.md)还列明 11 种外层事件和投递规则。

| 名称 | detail |
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

## 维护与覆盖检查

在仓库根目录运行：

```powershell
node scripts/check-extension-docs.mjs
node scripts/check-doc-pairs.mjs
```

检查器对照清单字段名、全部 18 项权限、源码注册表与双语索引、LuaLS 方法、窗口/设置桥、编辑器事件、17 种表单节点及 13 种 Lua 对象；同时检查本地链接、标题配对和示例 JavaScript 语法。方法名匹配不代表语义正确，也不执行原生安装或宣称桌面验收。新增字段或改变语义时，还要同步对应参考和示例。

源码依据：[Runtime permissions](../../src/renderer/src/core/extension-runtime.ts), [Runtime dispatch](../../src/renderer/src/components/extensions/ExtensionRuntimeHost.tsx), [MSE registration](../../src-tauri/src/platform_scripts/mse_api.rs), [Lua compatibility](../scripting/compatibility-api.md), [host form nodes](ui-form.md).
