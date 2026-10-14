# Extension Runtime v1

中文 | [English](runtime-api.en.md)

本文记录 MoonSprite 当前实际实现的 Runtime API。扩展包结构和完整清单字段见 [MoonSprite 扩展开发](README.md)。

按 2026-09-19 当前工作区实现核对。包清单、Runtime API 与 Lua MSE 的版本相互独立。配套参考：[完整清单](manifest.md)、[快速开始](quickstart.md)、[API 全量索引](api-index.md)、[宿主表单协议](ui-form.md)。

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

启动后应先调用 `runtime.getCapabilities()`。返回值为 `{ apiVersion, permissions, methods, windowPresentations, editorEvents }`，其中 `methods` 只列出当前宿主和当前授权共同允许的方法。

## 权限

| 权限 | 当前能力 |
| --- | --- |
| `runtime` | `runtime.getCapabilities`；必需。 |
| `commands` | `commands.execute`；同时允许接收 `command` 事件。 |
| `ui` | `ui.notify`、`ui.openSettings`。 |
| `windows` | `windows.open/close/postMessage/setVisible` 和 `window-message` 事件。 |
| `workspace.read` | `workspace.listProjects/getActiveProject` 和 `project` 事件。 |
| `workspace.write` | `workspace.activateProject`。 |
| `document.read` | `document.getSummary/getLayers/getFrames`、`colors.get`。 |
| `document.write` | `document.undo/redo`、`colors.setPrimary/setSecondary`。不提供任意像素写入。 |
| `events` | `interaction`、`clock`、`document-saved`、`export-complete`、`editor-event`。 |
| `storage` | `storage.get/set/remove/list` 和 `settings-changed` 事件。 |
| `resources` | `resources.read`。 |
| `tools` | `tools.getActive/setActive`。 |
| `clipboard` | `clipboard.readText/writeText`。 |
| `notifications` | `notifications.show`；v1 仅显示 MoonSprite 应用内消息，不发送系统通知。 |
| `network` | `network.fetch`。 |
| `diagnostics` | `diagnostics.log`。 |
| `menus` | `menus.setItems`；菜单点击还需要 `commands` 权限。 |
| `io` | 已保留名称，v1 暂无可调用方法。 |

只声明权限不会自动产生能力；扩展仍只能调用 `runtime.getCapabilities().methods` 中列出的方法。

`menus.setItems` 同时需要 `menus` 与 `commands`。打开资源窗口还需要 `resources`；方法出现在能力列表中，不代表参数有效或相关权限也已授权。

## Runtime API

### Runtime 与命令

- `runtime.getCapabilities()` -> `{ apiVersion, permissions, methods, windowPresentations, editorEvents }`。
- `runtime.getLocale()` -> `{ locale }`：当前软件界面语言（BCP 47），需要 `runtime` 权限。

- `commands.execute({ commandId })` -> `boolean`。执行本扩展清单中的 Lua、Runtime 或设置命令。调用 Runtime 命令时应避免递归触发自身。
- `menus.setItems({ menuId, items })` 替换本扩展已声明顶层菜单的动态选项（最多 64 项）。每项为 `{ id, name, event, checked }`，点击发送 `command` 事件，其中 `commandId` 为该项 ID。动态项位于清单命令之前，以横线分隔；空列表不显示占位项。停用扩展时清除。
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

### 返回值、校验与就绪

除已列明的查询和 `commands.execute` 外，Runtime 方法成功时返回 `null`。`storage.list()` 返回排序后的键数组。`commands.execute()` 的布尔值只表示派发是否接受，不表示 Lua 已运行结束或事务已成功提交，也不会返回文档修改结果。

无活动工程时 `document.getSummary()` 返回 `null`，但 `document.getLayers/getFrames/undo/redo` 会拒绝。Runtime 图层 `opacity` 为 `0..1`，帧 `index` 从 0 开始，`duration` 为毫秒；不同于 Lua 的帧序号和兼容层 `Frame.duration` 的秒。颜色输入必须提供四个有限数值 RGBA 通道。

工具 ID 全表：`pencil`、`airbrush`、`eraser`、`fill`、`eyedropper`、`selection`、`shape`、`line`、`text`、`move`、`hand`、`zoom`、`rotate`、`liquify`、`smooth`。动态菜单项的四个字段均必填，包括布尔 `checked`；项 ID/event 为 1–80 个 ASCII 字母/数字/点/短横线/下划线，name 非空且最多 80 个 JavaScript 字符串单位，项 ID 不得重复。

存储值必须能 JSON 序列化；`undefined` 和循环引用会失败。键非空、最多 160 UTF-8 字节，不能含 U+0000–001F 控制字符。单值与总量额度按序列化值的 UTF-8 字节计算，总量不计键名。不存在或 JSON 损坏返回 `null`。Runtime/窗口写入不会自动广播 `settings-changed`；宿主设置提交、HTML 设置的 `storage.set` 才会发送。设置页 `storage.remove` 不发送。

网络 body 必须为字符串，请求通过宿主 fetch，仍受 CORS、TLS 和网络错误约束；2 MiB 限制在读取响应体后检查，不是流式内存上限。error 级诊断还会更新应用状态。桥没有通用请求超时或持久消息队列；窗口打开/发送完成不是页面就绪或送达确认，应像快速开始示例那样使用 ready 握手。先同步注册监听，再等待初始化。

## 事件

使用 `moonsprite.on(type, listener)` 订阅，返回取消订阅函数；同一事件也会分发为 `moonsprite:<type>` DOM `CustomEvent`。

| 事件 | 权限 | 负载 |
| --- | --- | --- |
| `activate` | 始终 | `{ apiVersion, extensionId }`。 |
| `locale-changed` | `runtime` | `{ locale }`。在 `activate` 之前发送当前语言，软件语言改变时再次发送；其他首选项变化不重复发送。 |
| `deactivate` | 始终 | 无附加字段。 |
| `project` | `workspace.read` | `{ project: ProjectSnapshot \| null, homeOpen }`。 |
| `command` | `commands` | `{ commandId, event }`。 |
| `settings-changed` | `storage` | `{ key, value }`。 |
| `window-message` | `windows` | `{ windowId, message }`。 |
| `interaction` | `events` | `{ kind: "pointer" \| "keyboard" }`；仅统计 MoonSprite 主窗口内的输入。 |
| `clock` | `events` | `{ timestamp }`；当前约每 30 秒触发一次，不保证精确定时。 |
| `document-saved` | `events` | `{ projectId }`。 |
| `export-complete` | `events` | `{ projectId, format? }`。 |
| `editor-event` | `events` | `{ name, timestamp, projectId?, detail }`；名称来自 `editorEvents`，详见下文。 |

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

设置页调用 `storage.set` 会向正在运行的 Runtime 发送 `settings-changed`。设置页没有 Runtime 的工程、网络、窗口、剪贴板或命令 API。

## 扩展窗口

### Runtime 侧

- `windows.open({ windowId, resourceId, options? })`。资源必须列在 `runtime.resources`；原生 `windowId` 为 1–80 个 ASCII 字母/数字/点/短横线/下划线，嵌入视图建议沿用同一约定。默认 `x: 32`、`y: 72`、`width: 256`、`height: 256`、`transparent: true`、`focusable: false`。
- 窗口消息只发送给指定窗口；窗口内 `moonsprite.window.id` 为当前窗口 ID，可用于核对配置。
- `windows.setVisible({ windowId, visible })` 隐藏或重新显示已创建的原生窗口/覆盖层，保留窗口脚本和资源；宿主弹窗不支持此调用。
- `windows.close({ windowId? })`；省略 `windowId` 时关闭本扩展全部附属窗口。
- `windows.postMessage({ windowId, message })` 向指定窗口发送消息。为兼容原生窗口经过的 JSON 通道，使用 JSON 兼容的普通对象、数组和标量，不依赖 Map、BigInt、函数或 DOM 对象的传输。

窗口是 MoonSprite 主窗口的 owner-bound 无边框窗口，不使用全系统置顶。停用 Runtime 时宿主关闭该扩展的全部窗口。

### 展示方式支持矩阵

| 能力 | `native`（默认） | `dialog` | `overlay` |
| --- | --- | --- | --- |
| 窗口/宿主边界、指针、命中区域 | 支持；主窗口外框逻辑坐标 | 拒绝；由宿主管理几何 | 支持；客户区 CSS 坐标 `(0,0)` |
| `window.startDrag` | 原生拖动 | 无操作 | 指针按下后调用 |
| `windows.setVisible` | 支持 | 不支持，使用关闭/重新打开 | 支持 |
| `options.x/y/width/height` | 默认 32/72/256/256，取整，尺寸 32–2048 | 忽略 | 默认 32/72/256/256，有限尺寸 1–8192 |
| `options.transparent/focusable` | 默认 true/false | 宿主管理 | 不使用原生窗口选项 |
| `options.title/component` | 不使用 | 标题默认扩展名；`component: "form"` 使用宿主节点 | 不使用 |
| 数量 | 受原生宿主资源约束 | 每扩展一个可见宿主弹窗，新弹窗替换旧弹窗 | 每扩展最多 16 个 |

跨展示方式应使用不同 ID。窗口资源同时需要 `resources` 和 `windows` 权限。`window.id` 为字符串，`window.onMessage` 返回取消订阅函数，其他窗口桥函数返回 Promise。只有 Runtime 提供 `call`、`on`、`apiVersion` 和 Runtime 领域对象，窗口和设置页不会继承它们，完整清单见 [API 索引](api-index.md)。

### 窗口侧

窗口 HTML 获得与 Runtime 不同的参数位置式桥：

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

`getBounds/setBounds` 使用相对主窗口左上角的逻辑像素；宽高必须在 `32..2048`。`setHitRegion` 的每个 span 为 `{ x, y, width }`，用于声明每一行可命中的不透明区域；最多 131072 段，区域外输入穿透到底层 MoonSprite。尺寸变化后应按当前 viewport 重新提交命中区域。

`getPointerPosition()` 按需读取当前指针，返回与 `getBounds()` 一致坐标系的 `{ x, y }`；指针在主窗口客户区外时返回 `null`，不暴露应用外的位置。原生独立窗口和覆盖层可调用，不支持宿主表单弹窗；覆盖层使用客户区 CSS 坐标，见下文。旧版宿主没有此方法，扩展应检测后调用。

窗口还会产生 `moonsprite:window-moved` 和 `moonsprite:window-focus` DOM 事件。持久化位置应使用 `getBounds()`，不要直接保存 `window-moved` 中的平台原始坐标。宿主提供 `--cursor-grab` 和 `--cursor-grabbing` CSS 变量供拖动界面复用 MoonSprite 指针。

`window.setCommandState(commandId, { checked?, visible? })` 可回报本扩展已声明命令的勾选和可见状态，字段必须为布尔值；它与替换顶层菜单动态项的 `menus.setItems` 不同。窗口存储还支持位置参数形式的 `set(key, value)`、`remove(key)` 和 `list()`，与 Runtime、设置页共用扩展 ID 的隔离命名空间。

原生窗口、宿主弹窗与覆盖层的几何能力不同：`getPointerPosition()` 可用于原生窗口和覆盖层，不用于宿主弹窗；原生坐标以主窗口外框为基准，覆盖层使用客户区 CSS 坐标。创建前应检查 `windowPresentations`。

### 主题、宿主弹窗与表单

宿主注入当前 `--theme-*` 和 `--cursor-*` CSS 变量（含指针缩放），随首选项刷新。管理页可用 `<body data-ms-dialog>`、标题、section 和 `button.primary` 复用主题；透明场景不加该属性。`data-ms-drag` 拖动区域在支持的展示方式中调用窗口拖动。扩展不能访问宿主 React 或 DOM。

`options.presentation: "dialog"` 使用宿主 ModalShell 与 DialogHeader，标题默认扩展名。每扩展显示一个弹窗，新弹窗替换旧弹窗，几何和焦点由宿主管理。加上 `options.component: "form"` 后，资源运行隐藏逻辑，由宿主渲染节点。全部 17 种节点、修改值回传、请求确认和文件限制见[完整表单协议](ui-form.md)。清单设置使用另一套[设置 schema](manifest.md)。

原生窗口中，`window.getHostBounds()` 返回主窗口客户区相对外框的逻辑像素边界 `{ x, y, width, height }`。主窗口移动、缩放或 DPI 变化触发 `moonsprite:window-host-geometry`，此时重新读取边界。建议保存归一化位置，以实际可见内容而非透明留白限制移动范围。

### 主窗口覆盖层

`runtime.getCapabilities().windowPresentations` 列出当前授权支持的展示方式：`native`、`dialog`、`overlay`。没有 `windows` 权限时为空数组。旧宿主可能不返回此字段。

```js
await moonsprite.windows.open({
  windowId: 'helper', resourceId: 'helper-ui',
  options: { presentation: 'overlay', x: 40, y: 80, width: 240, height: 160 }
})
await moonsprite.windows.setVisible({ windowId: 'helper', visible: false })
await moonsprite.windows.postMessage({ windowId: 'helper', message: { type: 'update' } })
await moonsprite.windows.close({ windowId: 'helper' })
```

覆盖层是主窗口内的受限 iframe，不创建原生窗口，也不获得宿主 DOM、React、Store 或 Tauri 的访问权。沿用 `windows` 权限和清单资源校验，每个扩展最多 16 个覆盖层。重复打开同一 ID 更新位置并显示；资源变化则重新加载。关闭、禁用或卸载扩展会销毁相应覆盖层。显示隐藏保留页面状态；隐藏后的定时器由扩展自行暂停。

页面可使用 `window.getBounds/setBounds/getHostBounds/getPointerPosition/setHitRegion/startDrag/postMessage/close`，以及现有存储、资源、主题和命令状态接口。覆盖层坐标统一为主窗口客户区 CSS 像素，宿主左上角为 `(0,0)`，不要混用原生窗口坐标。`getPointerPosition` 返回同坐标系的位置，指针在软件外时返回 null。跨展示方式保存位置建议保存相对比例。

覆盖层的 `getHostBounds()` 还返回 `screenScale`（桌面逻辑像素 / CSS 像素）。自定义拖动使用 `screenX/screenY` 时，先将屏幕位移除以该比例，再更新覆盖层坐标；每次开始拖动重新读取，宿主几何变化时取消旧手势。

`setBounds({x,y,width,height})` 更新位置和尺寸，尺寸范围为 1–8192，位置绝对值不超过 32768。宿主裁剪超出客户区的部分；扩展负责将实际内容约束在边界内。`startDrag()` 必须在指针按下后调用，也可使用指针捕获和 `setBounds` 实现自定义拖动。宿主尺寸变化触发 `moonsprite:window-host-geometry`，位置更新触发 `moonsprite:window-moved`。

初始命中区域为空。页面调用 `setHitRegion(sourceWidth, sourceHeight, spans)` 声明可见及可交互区域，`spans` 是 `{x,y,width}` 的单像素高扫描行，最多 65536 条，源尺寸最多 8192。区域按当前覆盖层尺寸缩放，同时裁剪绘制和鼠标命中；区域外事件直接到下方软件，不进行合成事件转发。气泡、按钮等也需包含在区域内。覆盖层位于编辑内容之上、宿主菜单和弹窗之下，不能自行提升层级或修改全局指针策略。

这是面向悬浮工具、信息卡、辅助提示等扩展的通用接口；宠物动画、提醒、位置比例等业务由扩展实现。

## 窗口桥补充契约

`window.setCursorPolicy({ useLocalCursors: boolean })` 在原生窗口校验布尔参数，但无论传值如何都重新应用用户首选项；嵌入视图不执行操作。`setCommandState(commandId, { checked?, visible? })` 保留省略字段的原值。

窗口消息也产生 `moonsprite:message`，`event.detail` 为消息本身。原生几何 DOM 事件包含 `{ kind: "moved", position }`、`{ kind: "focus", focused }` 或 `{ kind: "host-geometry" }`；overlay 的 moved 使用客户区坐标，不提供原生 focus 事件。持久化位置应重新读取边界，不保存原生 moved 事件原始坐标。

## 编辑器事件细节

具有 `events` 权限的扩展可通过 `runtime.getCapabilities().editorEvents` 查询当前宿主支持的编辑事件名，并订阅：

```js
moonsprite.on('editor-event', event => {
  // { type, name, timestamp, projectId?, detail }
  if (event.name === 'tool.changed') console.log(event.detail.tool)
})
```

事件目录：`history.undo`、`history.redo`、`color.sampled`、`drawing.completed`、`fill.completed`、`document.saved`、`document.changed`、`project.created/opened/closed/activated`、`tool.changed`、`color.primary-changed/secondary-changed`、`selection.created/cleared`、`layer.created/deleted/activated`、`frame.changed`、`animation.started/stopped`、`view.changed`。保存、撤销、重做、吸色和绘制完成由实际操作路径发出；取消、无效操作不产生对应成功事件。工程打开/新建以新加入会话的文件来源区分，订阅前已存在的工程不补发打开事件。结构与状态事件描述实际变化，因此撤销恢复图层也会产生 `layer.created`。`selection.created` 包含选区变更。

`detail` 只提供标量元数据，例如 `tool`、`previous`、`layerId`、`frameId`、`revision`、`fullySaved`，不提供文件路径、像素或内部对象。状态观察不写撤销历史。原有 `export-complete`、`document-saved`、`project`、`interaction` 等事件保持兼容；精确的保存动画应订阅 `editor-event/document.saved`。`interaction` 现包含鼠标移动与滚轮，指针活动最多每 500ms 一次。扩展自行选择事件、限频和消费方式，宿主不包含动画或宠物规则。

完整表单节点字段、输入回传语义、请求确认和文件限制见[宿主表单协议](ui-form.md)。

## 兼容性检查

1. 清单声明 Runtime v1 和最小必要权限。
2. 收到 `activate` 后调用 `runtime.getCapabilities()`，只使用返回的方法。
3. 对 Promise 拒绝、工程为 `null`、资源缺失和窗口关闭做正常降级。
4. 使用不透明 ID 和扩展存储，不缓存安装路径或内部对象。
5. 把文档批量修改封装为 Lua 命令，通过 `commands.execute()` 调用。

Runtime iframe 加载后发送 `activate`，随后发送获授权的初始 `project` 快照。加载期间仅 `command` 和 `settings-changed` 在内存中暂存，不是持久队列，也不会在停用后重放。每个事件对象除表中字段外都带 `type`。`deactivate` 在销毁时尽力发送，不能依赖异步关闭回调保存重要数据，应在状态变化时保存。旧 `document-saved` 观察 dirty 到 clean 的转换；精确保存完成应使用 `editor-event` 的 `name: "document.saved"` 与 `detail.fullySaved`。

`menus.setItems` 可传可选的 `name`（1–80 字符）更新所属顶层菜单标题。动态项使用已声明命令的 ID 时，运行期间替代对应静态菜单行，避免重复显示；扩展停止后清除覆盖。

动态菜单项支持可选的 `dividerBefore: boolean`，在该项前插入宿主菜单分隔线。
