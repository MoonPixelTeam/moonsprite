# Lua 兼容 API

中文 | [English](compatibility-api.en.md)

本页列出 [lua_api.rs](../../src-tauri/src/platform_scripts/lua_api.rs) 当前实现的子集，不代表完整兼容 Aseprite。执行与事务见[脚本入口](README.md)，专属接口见 [MSE API](mse-api.md)。下表字段用点号；对象方法实际以冒号调用，如 `image:getPixel(x, y)`。

## 全局与 app

构造器包括 `Point`、`Rectangle`、`Color`、`Image`、`Palette`、`Sprite`、`Dialog`。`Sprite(width, height)` 暂存新文档并切换脚本活动上下文，宿主在应用结果时创建它；`mse.document.create` 是另一条专属排队入口。`print(...)` 写入有额度限制的脚本输出。`ColorMode` 提供 RGB/GRAY/INDEXED/TILEMAP（0/1/2/3），常量存在不代表可写瓦片图像；`AniDir` 提供 FORWARD/REVERSE/PING_PONG/PING_PONG_REVERSE（0/1/2/3），但 Tag 写入目前只处理正向/反向；`RangeType` 提供 EMPTY/CELS/FRAMES/LAYERS（0/1/2/3）；`MouseButton` 提供 left/right/middle（1/2/3）。

| API | 约定 |
| --- | --- |
| `app.activeSprite, app.sprite, app.activeImage, app.activeLayer, app.activeCel, app.activeFrame, app.frame, app.range` | 当前脚本上下文，帧序号从 1 开始。 |
| `app.fgColor, app.bgColor, app.params, app.isUIAvailable` | 前景/背景色快照、空参数表、UI 可用标志 true；给 app 普通表赋值不会调用宿主命令。 |
| `app.transaction([label,] fn)` | 将排队的文档编辑合为事务，返回回调结果。 |
| `app.alert(string \| { title?, text })` | 追加脚本结果文字，返回 1；不是阻塞的原生选项弹窗。 |
| `app.useTool { tool, points, color? }` | 仅 line/eraser，points 使用文档坐标；其他工具名拒绝。 |
| `app.refresh(), app.command.Undo(), app.command.Redo()` | 兼容占位，无实际刷新或历史操作。 |
| `app.pixelColor.rgba(r,g,b,a?), rgbaR(pixel), rgbaG(pixel), rgbaB(pixel), rgbaA(pixel)` | 打包 RGBA 整数，默认 alpha 255。 |
| `app.pixelColor.graya(gray,a?), grayaV(pixel), grayaA(pixel), index(value)` | 灰度/索引打包与分量读取，按图像颜色模式使用。 |

## 全部对象成员

“可写”表示存在 Lua setter，不代表每个赋值都提交宿主；限制见后文。

| 类型 | 可读字段 | 可写字段 | 方法 |
| --- | --- | --- | --- |
| Point | `Point.x`, `Point.y` | `Point.x`, `Point.y` | — |
| Rectangle | `Rectangle.x`, `Rectangle.y`, `Rectangle.width`, `Rectangle.height` | — | — |
| Color | `Color.red`, `Color.green`, `Color.blue`, `Color.alpha`, `Color.rgbaPixel`, `Color.hsvHue`, `Color.hsvSaturation`, `Color.hsvValue` | `Color.red`, `Color.green`, `Color.blue`, `Color.alpha`, `Color.hsvHue`, `Color.hsvSaturation`, `Color.hsvValue` | — |
| Palette | `Palette.size` | — | `Palette.getColor`, `Palette.getColorIndex`, `Palette.setColor` |
| Frame | `Frame.frameNumber`, `Frame.duration`, `Frame.isDisabled` | `Frame.duration` | — |
| Tag | `Tag.name`, `Tag.fromFrame`, `Tag.toFrame`, `Tag.repeats`, `Tag.aniDir` | `Tag.name`, `Tag.fromFrame`, `Tag.toFrame`, `Tag.repeats`, `Tag.aniDir` | — |
| Image | `Image.width`, `Image.height`, `Image.colorMode` | — | `Image.getPixel`, `Image.drawPixel`, `Image.putPixel`, `Image.clear`, `Image.drawImage`, `Image.clone` |
| Selection | `Selection.isEmpty`, `Selection.bounds` | — | `Selection.contains` |
| Layer | `Layer.id`, `Layer.name`, `Layer.opacity`, `Layer.isVisible`, `Layer.isEditable`, `Layer.isContinuous`, `Layer.isLocked`, `Layer.isImage`, `Layer.isGroup`, `Layer.isTilemap`, `Layer.stackIndex`, `Layer.parent`, `Layer.cels` | `Layer.name`, `Layer.opacity`, `Layer.isVisible`, `Layer.isEditable`, `Layer.isContinuous`, `Layer.isLocked`, `Layer.stackIndex`, `Layer.parent` | `Layer.cel` |
| Range | `Range.isEmpty`, `Range.type`, `Range.frames`, `Range.layers`, `Range.cels` | — | — |
| Cel | `Cel.image`, `Cel.position`, `Cel.bounds`, `Cel.id`, `Cel.frameNumber`, `Cel.frame`, `Cel.layer` | `Cel.image`, `Cel.position` | — |
| Sprite | `Sprite.width`, `Sprite.height`, `Sprite.filename`, `Sprite.name`, `Sprite.colorMode`, `Sprite.transparentColor`, `Sprite.palettes`, `Sprite.palette`, `Sprite.activeLayer`, `Sprite.activeCel`, `Sprite.activeFrame`, `Sprite.frames`, `Sprite.layers`, `Sprite.tags`, `Sprite.selection`, `Sprite.spec` | `Sprite.name` | `Sprite.newTag`, `Sprite.deleteTag`, `Sprite.newLayer`, `Sprite.newCel` |
| Dialog | `Dialog.id`, `Dialog.data`, `Dialog.bounds` | — | `Dialog.show`, `Dialog.close`, `Dialog.modify`, `Dialog.newrow`, `Dialog.repaint`, `Dialog.button`, `Dialog.check`, `Dialog.color`, `Dialog.combobox`, `Dialog.entry`, `Dialog.label`, `Dialog.number`, `Dialog.radio`, `Dialog.separator`, `Dialog.slider` |

## 常用调用与语义限制

- `Image:getPixel(x,y)`、`drawPixel(x,y,value)` / `putPixel(x,y,value)`、`clear(value?)`、`drawImage(source, point?)`、`clone()` 使用图像局部坐标；drawImage 要求颜色模式相同。
- `Palette:getColor(index)`、`getColorIndex(color)`、`setColor(index,color)` 优先按条目 ID 查找，再回退到从 0 开始的数组索引；getColorIndex 返回最近颜色的条目 ID，不是数组下标。
- `Selection:contains(point)` 只读查询，修改选区使用 `mse.selection`。
- `Layer:cel(frame?)`、`Sprite:newLayer()`、`Sprite:newCel(layer,frame,image,position?)` 中，活动图层已有 Cel 可通过 image/position 编辑；newCel 要求脚本创建的图层（含新 Sprite），不能传入现有宿主图层，也不能在其空帧新建 Cel。
- `Sprite:newTag(from?,to?)`、`deleteTag(tag)` 针对已有帧；`Tag.repeats = 0` 表示无限重复，`aniDir` 只把 1 作为反向，其余按正向处理。
- `Frame.duration` 为秒，提交时换算到 1–60000 毫秒；MSE frame duration 为毫秒。`Frame.isDisabled` 只读。
- `Layer.isContinuous`、`stackIndex`、`parent` 的 setter 只修改 Lua 包装对象，不排队写入宿主属性；parent 是组 ID 字符串或 nil，不是 Layer 对象。
- 未开放通用帧新建/复制/删除，也没有 require、任意文件/网络/进程访问或完整 Aseprite 命令注册表。

## Dialog 控件与回调

`Dialog { title?, onclose? }` / `mse.ui.dialog` 支持 button/check/color/combobox/entry/label/number/radio/separator/slider。通用选项有 `id`、`label`、`text`、`enabled`（默认 true）、`visible`（默认 true）；回调为 `onclick`、`onchange`、`onrelease`。check/radio 使用 selected，color 使用 color，combobox 使用 options 与 option，数字字段使用 value（number 也可解析数值 text）、min、max、step、decimals。`dlg.data` 按控件 ID 返回当前值。

`dlg:show { wait = false }` 在初次执行结束后保留回调；省略 wait 使用阻塞对话框流程。`modify { id, ... }` 修改已有控件，`close()` 关闭。`newrow()` / `repaint()` 为无操作，bounds 为零矩形而非真实宿主几何。持久回调执行前刷新宿主快照。它与 Runtime 宿主表单、清单设置不是同一种协议。

## 预算与维护

当前沙箱常量：脚本 1 MiB、图像/修改像素 4,194,304、Lua 内存 64 MiB、输出 64 KiB、20,000,000 条指令、执行预算 2 秒。这些是安全额度，不是性能承诺；变更时核对[预算实现](../../src-tauri/src/platform_scripts.rs)。增删对象注册成员时运行[扩展文档检查](../extensions/api-index.md)；名字齐全不代表完整行为兼容。
