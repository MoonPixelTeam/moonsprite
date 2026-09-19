# Lua compatibility API

[中文](compatibility-api.md) | English

This is the current subset implemented by [lua_api.rs](../../src-tauri/src/platform_scripts/lua_api.rs), not a promise of complete Aseprite compatibility. Read [execution and transactions](README.en.md) and the separate [MSE API](mse-api.en.md) first. Object fields below use dot notation; userdata methods are invoked with a colon (`image:getPixel(x, y)`).

## Globals and app

Constructors: `Point`, `Rectangle`, `Color`, `Image`, `Palette`, `Sprite`, `Dialog`. `Sprite(width, height)` stages a new document and changes the script active context; the host creates it when applying the result. `mse.document.create` is the dedicated queued alternative. `print(...)` writes bounded script output. `ColorMode` exposes RGB/GRAY/INDEXED/TILEMAP (0/1/2/3); constants do not guarantee writable tilemap images. `AniDir` exposes FORWARD/REVERSE/PING_PONG/PING_PONG_REVERSE (0/1/2/3), but Tag writes currently support only forward/reverse. `RangeType` exposes EMPTY/CELS/FRAMES/LAYERS (0/1/2/3); `MouseButton` exposes left/right/middle (1/2/3).

| API | Contract |
| --- | --- |
| `app.activeSprite, app.sprite, app.activeImage, app.activeLayer, app.activeCel, app.activeFrame, app.frame, app.range` | Current script context; frame numbers start at 1. |
| `app.fgColor, app.bgColor, app.params, app.isUIAvailable` | Foreground/background snapshots, empty parameter table, UI availability true. Assigning app table entries does not invoke host commands. |
| `app.transaction([label,] fn)` | Groups queued document edits into one transaction; returns callback results. |
| `app.alert(string \| { title?, text })` | Appends script result text, returns 1; not a blocking native choice dialog. |
| `app.useTool { tool, points, color? }` | Only line/eraser; points use document coordinates; other tool names reject. |
| `app.refresh(), app.command.Undo(), app.command.Redo()` | Compatibility no-ops; do not refresh or execute history. |
| `app.pixelColor.rgba(r,g,b,a?), rgbaR(pixel), rgbaG(pixel), rgbaB(pixel), rgbaA(pixel)` | RGBA packed integer, default alpha 255. |
| `app.pixelColor.graya(gray,a?), grayaV(pixel), grayaA(pixel), index(value)` | Grayscale/indexed packing and accessors; use the matching image color mode. |

## Complete userdata members

Writable means a Lua setter exists, not that every assignment persists to the host. Read the limitations below.

| Type | Readable fields | Setters | Methods |
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

## Common calls and semantic limits

- `Image:getPixel(x,y)`, `drawPixel(x,y,value)` / `putPixel(x,y,value)`, `clear(value?)`, `drawImage(source, point?)`, `clone()`: image-local coordinates; drawImage requires matching color modes.
- `Palette:getColor(index)`, `getColorIndex(color)`, `setColor(index,color)`: get/set first resolve an entry ID, then fall back to a zero-based array index; getColorIndex returns the nearest color entry ID, not its array offset.
- `Selection:contains(point)`: read-only selection query; use `mse.selection` for mutations.
- `Layer:cel(frame?)`, `Sprite:newLayer()`, `Sprite:newCel(layer,frame,image,position?)`: existing active-layer cels can be edited through their image/position; newCel requires a layer created by the script (including a new Sprite), not an existing host layer. Creating a cel in a blank frame of an existing layer is not supported.
- `Sprite:newTag(from?,to?)`, `deleteTag(tag)`: operate on existing frames. `Tag.repeats = 0` represents unlimited repeats; `aniDir` maps reverse to 1 and other values to forward.
- `Frame.duration` uses seconds and persists as milliseconds (1–60000). MSE frame `duration` uses milliseconds. `Frame.isDisabled` is read-only.
- `Layer.isContinuous`, `stackIndex`, and `parent` setters update the Lua wrapper only; they do not queue host property changes. `parent` is a group ID string or nil, not a Layer object.
- No public frame create/copy/delete API; no `require`, arbitrary file/network/process access, or complete Aseprite command registry.

## Dialog controls and callbacks

`Dialog { title?, onclose? }` / `mse.ui.dialog` support button/check/color/combobox/entry/label/number/radio/separator/slider. Common options include `id`, `label`, `text`, `enabled` (true), `visible` (true); callbacks are `onclick`, `onchange`, `onrelease`. Check/radio use `selected`; color uses `color`; combobox uses `options` and `option`; numeric fields use `value` (number also accepts numeric text), `min`, `max`, `step`, `decimals`. `dlg.data` contains current control values keyed by ID.

`dlg:show { wait = false }` keeps callbacks available after initial execution; omit wait for the blocking-dialog flow. `modify { id, ... }` changes an existing control, `close()` closes it. `newrow()` and `repaint()` are no-ops, and `bounds` is a zero rectangle, not actual host geometry. Persisted callbacks take a fresh host snapshot. This Dialog API differs from Runtime host forms and manifest settings.

## Budgets and maintenance

Current sandbox constants: script 1 MiB, image/changed pixels 4,194,304, Lua memory 64 MiB, output 64 KiB, 20,000,000 instructions, execution budget 2 seconds. These are safety budgets, not throughput promises. Review the [source](../../src-tauri/src/platform_scripts.rs) when changing them. Run [extension documentation checks](../extensions/api-index.en.md) when adding or removing registered members; matching names does not prove behavioral compatibility.
