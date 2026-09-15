# Extension Runtime v1

中文 | [English](runtime-api.en.md)

本文记录 MoonSprite 当前实际实现的 Runtime API。扩展包结构和完整清单字段见 [MoonSprite 扩展开发](README.md)。

## 清单

常驻扩展使用 `schemaVersion: 2` 和 `apiVersion: "1.0.0"`。`runtime.entry` 是自包含 UTF-8 HTML；`runtime.permissions` 声明权限；`runtime.resources` 把不透明资源 ID 映射到包内文件。权限必须包含 `runtime`，不能重复。

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

## 安全边界

Runtime、HTML 设置页和扩展窗口内容均在 `sandbox="allow-scripts"` iframe 中执行，没有同源权限。默认 CSP 禁止直接联网和加载外部脚本；Runtime 也不能访问扩展安装路径、Tauri、React、Store 或内部文档对象。网络和包内资源必须通过宿主桥访问。任意像素或文档结构写入仍应通过包内 Lua 命令，以保留事务、撤销和目标校验。

## 调用约定

Runtime 注入全局只读对象 `window.moonsprite`。所有领域方法接收一个可选参数对象并返回 `Promise`；也可以使用底层 `moonsprite.call(method, params)`。失败时 Promise 以宿主提供的错误信息拒绝。

```js
const capabilities = await moonsprite.runtime.getCapabilities()
const project = await moonsprite.workspace.getActiveProject()
await moonsprite.storage.set({ key: 'preferences', value: { enabled: true } })
```

启动后应先调用 `runtime.getCapabilities()`。返回值为 `{ apiVersion, permissions, methods }`，其中 `methods` 只列出当前宿主和当前授权共同允许的方法。

## 权限

| 权限 | 当前能力 |
| --- | --- |
| `runtime` | `runtime.getCapabilities`；必需。 |
| `commands` | `commands.execute`；同时允许接收 `command` 事件。 |
| `ui` | `ui.notify`、`ui.openSettings`。 |
| `windows` | `windows.open/close/postMessage` 和 `window-message` 事件。 |
| `workspace.read` | `workspace.listProjects/getActiveProject` 和 `project` 事件。 |
| `workspace.write` | `workspace.activateProject`。 |
| `document.read` | `document.getSummary/getLayers/getFrames`、`colors.get`。 |
| `document.write` | `document.undo/redo`、`colors.setPrimary/setSecondary`。不提供任意像素写入。 |
| `events` | `interaction`、`clock`、`document-saved`、`export-complete`。 |
| `storage` | `storage.get/set/remove/list` 和 `settings-changed` 事件。 |
| `resources` | `resources.read`。 |
| `tools` | `tools.getActive/setActive`。 |
| `clipboard` | `clipboard.readText/writeText`。 |
| `notifications` | `notifications.show`；v1 仅显示 MoonSprite 应用内消息，不发送系统通知。 |
| `network` | `network.fetch`。 |
| `diagnostics` | `diagnostics.log`。 |
| `menus`、`io` | 已保留名称，v1 暂无可调用方法；能力探测不会返回对应方法。 |

只声明权限不会自动产生能力；扩展仍只能调用 `runtime.getCapabilities().methods` 中列出的方法。

## Runtime API

### Runtime 与命令

- `runtime.getCapabilities()` -> `{ apiVersion, permissions, methods }`。
- `commands.execute({ commandId })` -> `boolean`。执行本扩展清单中的 Lua、Runtime 或设置命令。调用 Runtime 命令时应避免递归触发自身。
- `ui.openSettings()` 打开本扩展的 `settingsUi` 或 `settingsEntry`。
- `ui.notify({ message })` 与 `notifications.show({ message })` 显示最多 500 字符的应用内消息。

### 工程与文档

- `workspace.listProjects()` -> `ProjectSnapshot[]`。
- `workspace.getActiveProject()`、`document.getSummary()` -> `ProjectSnapshot | null`。
- `workspace.activateProject({ projectId })` 切换当前工程。
- `document.getLayers()` -> `{ id, name, visible, opacity, blendMode }[]`。
- `document.getFrames()` -> `{ id, index, duration }[]`；无动画数据时返回空数组。
- `document.undo()`、`document.redo()` 操作当前工程历史。

`ProjectSnapshot` 包含 `id`、`name`、`width`、`height`、`colorMode`、`layerCount`、`frameCount`、`dirty` 和 `contentRevision`。快照不包含像素数据或可变文档引用。

### 工具与颜色

- `tools.getActive()` -> 当前工具 ID 或 `null`。
- `tools.setActive({ tool })` 切换到宿主支持的工具 ID；未知 ID 会拒绝。
- `colors.get()` -> `{ primary, secondary } | null`。
- `colors.setPrimary({ color })`、`colors.setSecondary({ color })`；`color` 为 `{ r, g, b, a }`，通道会取整并夹紧到 `0..255`。

### 存储与资源

- `storage.get({ key })` -> JSON 值或 `null`。
- `storage.set({ key, value })`、`storage.remove({ key })`、`storage.list()`。
- `resources.read({ resourceId })` -> `number[]`，资源 ID 必须存在于 `runtime.resources`。

存储按扩展 ID 隔离：键最多 160 字节，单值 JSON 最多 256 KiB，总量最多 1 MiB。资源读取不暴露包内路径；单项资源最多 16 MiB。

### 剪贴板、网络与诊断

- `clipboard.readText()` -> 文本；`clipboard.writeText({ text })` 写入文本。系统或 WebView 拒绝剪贴板访问时 Promise 会失败。
- `network.fetch({ url, method?, body? })` 只接受 HTTP(S)，默认 `GET`，不携带凭据，15 秒超时。返回 `{ status, ok, headers, bytes }`，其中 `bytes` 为 `number[]`，响应体最多 2 MiB。v1 不支持自定义请求头。
- `diagnostics.log({ message, level? })` 写入扩展前缀日志；`level` 可为 `debug`、`info`、`warn`、`error`，消息最多 2000 字符。

## 事件

使用 `moonsprite.on(type, listener)` 订阅，返回取消订阅函数；同一事件也会分发为 `moonsprite:<type>` DOM `CustomEvent`。

| 事件 | 权限 | 负载 |
| --- | --- | --- |
| `activate` | 始终 | `{ apiVersion, extensionId }`。 |
| `deactivate` | 始终 | 无附加字段。 |
| `project` | `workspace.read` | `{ project: ProjectSnapshot \| null, homeOpen }`。 |
| `command` | `commands` | `{ commandId, event }`。 |
| `settings-changed` | `storage` | `{ key, value }`。 |
| `window-message` | `windows` | `{ windowId, message }`。 |
| `interaction` | `events` | `{ kind: "pointer" \| "keyboard" }`；仅统计 MoonSprite 主窗口内的输入。 |
| `clock` | `events` | `{ timestamp }`；当前约每 30 秒触发一次，不保证精确定时。 |
| `document-saved` | `events` | `{ projectId }`。 |
| `export-complete` | `events` | `{ projectId, format? }`。 |

扩展必须把事件视为提示而非可靠队列；Runtime 未运行或扩展被停用时不会补发错过的事件。

## 命令与菜单

命令必须且只能选择一种处理方式：`entry` 运行受限 Lua，`runtimeEvent` 发送 `command` 事件，`opensSettings: true` 打开扩展设置。`runtimeEvent` 命令要求 `commands` 权限。`menuItems[]` 可提供 `name` 形成子菜单；不提供名称时命令直接插入目标内置菜单。`topMenus[]` 创建独立顶层菜单。所有菜单和栏目都由宿主组件渲染，扩展不能注入菜单 DOM。

## 宿主组件设置

优先使用 schema 2 的 `settingsUi`。`storageKey` 指向一个扩展存储对象；宿主合并默认值、校验类型并在每次修改后发送 `settings-changed`。

- `checkbox`：布尔 `defaultValue`。
- `number`：数值 `defaultValue`，可选 `min`、`max`、正数 `step` 和 `suffix`。
- `text`：字符串 `defaultValue`，可选 `placeholder` 和 `maxLength`；默认上限 1024，最大 4096 个字符。
- `select`：字符串 `defaultValue` 和 1 至 64 个 `{ value, label, description? }`；默认值必须匹配选项。
- `button`：`commandId` 必须引用本扩展的 `runtimeEvent` 命令；`variant` 为 `primary`、`secondary` 或 `danger`，默认 `secondary`；`closeOnRun` 默认 `false`。

`settingsUi` 最多 64 个控件。所有控件可提供 `description`。重置按钮会把字段恢复为清单默认值并写回同一存储键。

## HTML 设置页

只有宿主组件无法表达界面时才使用 `settingsEntry`；它不能与 `settingsUi` 同时声明。页面获得精简的参数位置式桥：

```js
await moonsprite.storage.get(key)
await moonsprite.storage.set(key, value)
await moonsprite.storage.remove(key)
await moonsprite.storage.list()
await moonsprite.settings.close()
```

写入存储会向正在运行的 Runtime 发送 `settings-changed`。设置页没有 Runtime 的工程、网络、窗口、剪贴板或命令 API。

## 扩展窗口

### Runtime 侧

- `windows.open({ windowId, resourceId, options? })`。资源必须列在 `runtime.resources`；`windowId` 遵循扩展 ID 字符规则。默认 `x: 32`、`y: 72`、`width: 256`、`height: 256`、`transparent: true`、`focusable: false`。
- `windows.close({ windowId? })`；省略 `windowId` 时关闭本扩展全部附属窗口。
- `windows.postMessage({ windowId, message })` 向指定窗口发送任意可结构化克隆的数据。

窗口是 MoonSprite 主窗口的 owner-bound 无边框窗口，不使用全系统置顶。停用 Runtime 时宿主关闭该扩展的全部窗口。

### 窗口侧

窗口 HTML 获得与 Runtime 不同的参数位置式桥：

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

`getBounds/setBounds` 使用相对主窗口左上角的逻辑像素；宽高必须在 `32..2048`。`setHitRegion` 的每个 span 为 `{ x, y, width }`，用于声明每一行可命中的不透明区域；最多 131072 段，区域外输入穿透到底层 MoonSprite。尺寸变化后应按当前 viewport 重新提交命中区域。

窗口还会产生 `moonsprite:window-moved` 和 `moonsprite:window-focus` DOM 事件。持久化位置应使用 `getBounds()`，不要直接保存 `window-moved` 中的平台原始坐标。宿主提供 `--cursor-grab` 和 `--cursor-grabbing` CSS 变量供拖动界面复用 MoonSprite 指针。

## 兼容性检查

1. 清单声明 Runtime v1 和最小必要权限。
2. 收到 `activate` 后调用 `runtime.getCapabilities()`，只使用返回的方法。
3. 对 Promise 拒绝、工程为 `null`、资源缺失和窗口关闭做正常降级。
4. 使用不透明 ID 和扩展存储，不缓存安装路径或内部对象。
5. 把文档批量修改封装为 Lua 命令，通过 `commands.execute()` 调用。
