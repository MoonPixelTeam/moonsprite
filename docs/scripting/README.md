# Lua 脚本

中文 | [English](README.en.md)

MoonSprite 的普通脚本运行在受限的 Lua 5.4 沙箱中，文件放在程序根目录的 `scripts` 文件夹内，并从“文件 > 脚本”打开。`.msext` 同时支持 `schemaVersion: 1` 的 Lua 兼容层和 `schemaVersion: 2` 的 Extension Runtime v1；本页重点说明 Lua/MSE API。普通 Lua 脚本不能直接读写文件、启动进程、访问网络或加载任意 Lua 包。扩展包结构与清单见 [MoonSprite 扩展开发](../extensions/README.md)，Runtime 的常驻 sandbox HTML/JavaScript、权限和窗口 API 见 [Extension Runtime v1](../extensions/runtime-api.md)。

## Lua 扩展兼容层

扩展包是 ZIP 容器。`schemaVersion: 1` 清单可以声明多个 Lua 命令和由 MoonSprite 渲染的栏目：

```json
{
  "schemaVersion": 1,
  "id": "com.example.sample",
  "name": "Sample Extension",
  "version": "1.0.0",
  "description": "Example extension contributions.",
  "commands": [
    {
      "id": "paint-center",
      "name": "Paint Center Pixel",
      "description": "Writes one undoable test pixel.",
      "entry": "commands/paint-center.lua"
    }
  ],
  "panels": [
    {
      "id": "smoke-tools",
      "name": "Smoke Tools",
      "description": "Commands contributed by this extension.",
      "defaultVisible": true,
      "commands": ["paint-center"]
    }
  ],
  "menuItems": [
    {
      "id": "file-paint",
      "menu": "file",
      "position": "end",
      "commands": ["paint-center"]
    }
  ],
  "topMenus": [
    {
      "id": "sample-tools",
      "name": "Sample Tools",
      "position": "before:help",
      "commands": ["paint-center"]
    }
  ]
}
```

安装后，扩展必须处于启用状态才会贡献菜单命令和栏目。`commands[]` 只声明可运行命令，内部标识为 `extension:<extensionId>:<commandId>`；`menuItems[]` 决定命令插入哪个内置菜单的开头或末尾，`topMenus[]` 声明新的顶层菜单及其相对位置，`panels[]` 声明可从“窗口 > 栏目”切换的浮动栏目。所有命令 ID 引用区分大小写。

点击菜单项或栏目按钮时，命令会像普通 Lua 脚本一样获得当前文档、图层、帧和选区快照；像素修改、事务、对话框、撤销和失败回滚全部沿用现有脚本规则。停用、卸载或入口文件不再通过安全校验时，命令与栏目都会消失，也不能通过 Renderer 传入路径强行执行。

MoonSprite 不提供固定的顶层“扩展”菜单。为兼容早期扩展，根清单仍可提供单个 `entry`，它使用 `extension:<id>` 标识并显示在“文件 > 脚本”；没有被任何菜单或栏目引用的具名命令也会回退到该列表。Lua 兼容层的 UI 是声明式的，不能注入 React、DOM、CSS、JavaScript 或原生控件，也不能通过 `require` 加载包内或系统文件。

需要常驻逻辑、宿主组件设置、自定义 HTML 设置页或透明附属窗口时，使用 `schemaVersion: 2` 和 `apiVersion: "1.0.0"`。普通设置应优先声明 `settingsUi`，由 MoonSprite 组件库渲染复选、数值、文本、选择和命令按钮；组件清单无法表达时再使用 `settingsEntry` sandbox HTML。Runtime 在无同源权限的 sandbox iframe 中执行，只能使用清单授权的 `window.moonsprite` 能力；菜单命令可选择 `runtimeEvent`，设置入口可选择 `opensSettings`。Runtime 不获得安装目录、资源路径、React、Store、Tauri 或内部文档对象，复杂文档编辑仍应通过 `commands.execute()` 调用包内 Lua 命令以保留事务和撤销。Runtime 扩展不能在尚未实现 v1 API 的旧版 MoonSprite 中运行。

命令执行画布写入时应显式使用事务，以便一次命令形成一次撤销：

```lua
app.transaction("Extension paint", function()
  app.activeImage:putPixel(0, 0, app.pixelColor.rgba(41, 121, 255, 255))
end)
```

## 两套命名空间

- `app.*` 是 Aseprite 兼容 API。它用于迁移已有脚本，当前只实现项目明确列出的兼容子集。
- `mse.*` 是 MoonSprite 专属 API。它不会伪装成 Aseprite API，也不会暴露内部 `SpriteDocument` 或 Renderer 状态。

当前 Aseprite 兼容子集分为两层：

- 基础像素与图层：`Point`、`Rectangle`、`Color`、`Image`、`Palette`、活动 `Sprite/Layer/Cel`、图层类型/父级/堆叠位置、`Layer:cel(frame)`、`Sprite:newLayer()` 和 `Sprite:newCel(layer, frame, image, position)`。
- 动画读取与编辑：`Sprite.frames/tags`、`Frame` 的序号/时长/停用状态、`Tag` 的范围/方向/重复次数、`app.range`，以及活动图层中已有多帧 Cel 的图像和位置读写。跨帧 Cel 写入与当前帧写入进入同一个脚本事务，并支持撤销/重做。

该子集不等于完整 Aseprite API。脚本创建、复制或删除 Frame，以及在现有图层的空帧中创建 Cel，尚未作为兼容接口开放；脚本应先用能力范围内的已有帧/Cel，或改用 MoonSprite 的 `mse.*` 类型化接口。兼容脚本仍运行在 Lua 沙箱的图像、内存、指令数和执行时间预算内；逐像素邻域扫描等高计算量脚本在较大画布上可能因预算耗尽而停止，这不是 API 语法错误。

完整的 MSE API 外形、端点状态和错误约定见 [mse-api.md](mse-api.md)。编辑器类型提示见 [mse-api.lua](mse-api.lua)，可以将它加入 VS Code 的 LuaLS 工作区库路径。

## 当前可用接口

`mse` 当前开放文档、图层、动画循环节、调色板、瓦片、自由瓦片、图案笔刷、选区、切片、图层样式、工作区栏目、文件操作和通用 UI。查询立即返回脚本启动时的结构快照；写入会加入当前 `app.transaction()`，脚本调用成功后再由 Renderer 通过 Store 领域命令顺序提交：

```lua
local document = mse.document.info()
local layers = mse.layers.list()

app.transaction("Create palette color", function()
  mse.palette.create { color = { r = 41, g = 121, b = 255, a = 255 } }
  mse.layers.update(layers[1].id, { name = "Lua Layer", opacity = 192 })
end)
```

同一个 Lua 事务中的像素修改与 `mse` 写入只形成一个撤销步骤；任一操作校验失败时整批撤回。创建/打开其他工程、保存、导出、导入本地笔刷和工作区显隐属于应用或文件操作，不进入当前工程的撤销历史。

脚本可以用 `mse.apiVersion`、`mse.status`、`mse.capabilities` 和 `mse.isSupported("document.info")` 做能力探测。当前 `0.2.0` 能力表中的所有方法均为真实实现，不再包含只报错的规划占位端点。

可运行示例见 [examples/intro.lua](examples/intro.lua) 和 [examples/moon-phase.lua](examples/moon-phase.lua)。首次打开“文件 > 脚本”时，`moon-phase.lua` 也会自动放入程序根目录的 `scripts` 文件夹；如果用户已经存在同名文件则不会覆盖。
