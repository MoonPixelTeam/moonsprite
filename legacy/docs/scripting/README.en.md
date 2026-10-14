# Lua Scripting

[中文](README.md) | English

Ordinary MoonSprite scripts run in a restricted Lua 5.4 sandbox. Files live in the executable-root `scripts` directory and open from File > Scripts. `.msext` supports both the `schemaVersion: 1` Lua compatibility layer and `schemaVersion: 2` Extension Runtime v1; this page focuses on the Lua/MSE APIs. Ordinary Lua scripts cannot directly read or write files, start processes, access the network, or load arbitrary Lua packages. See [MoonSprite Extension Development](../extensions/README.en.md) for package layout and manifests, and [Extension Runtime v1](../extensions/runtime-api.en.md) for persistent sandboxed HTML/JavaScript, permissions, and window APIs.

## Lua Extension Compatibility Layer

An extension package is a ZIP container. A `schemaVersion: 1` manifest can declare multiple Lua commands and MoonSprite-rendered panels:

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

After installation, an extension contributes menu commands and panels only while enabled. `commands[]` declares runnable commands identified internally as `extension:<extensionId>:<commandId>`. `menuItems[]` chooses the start or end of a built-in menu. `topMenus[]` declares a new top-level menu and its relative position. `panels[]` declares a floating panel toggleable under Window > Panels. Every command ID reference is case-sensitive.

Clicking a menu item or panel button gives the command the same current-document, layer, frame, and selection snapshot as an ordinary Lua script. Pixel changes, transactions, dialogs, undo, and failure rollback follow the same script rules. Disabling or uninstalling an extension, or failing entry-file security validation, removes the command and panel. A path passed from the Renderer cannot force execution.

MoonSprite does not provide a fixed top-level Extensions menu. For early-extension compatibility, the root manifest may still provide one `entry`, identified as `extension:<id>` and shown under File > Scripts. Named commands not referenced by any menu or panel also fall back to that list. UI in the Lua compatibility layer is declarative: it cannot inject React, DOM, CSS, JavaScript, or native controls and cannot use `require` to load package or system files.

Use `schemaVersion: 2` with `apiVersion: "1.0.0"` for persistent logic, host-component settings, a custom extension-owned HTML settings page, or transparent auxiliary windows. Ordinary settings should prefer `settingsUi`, rendered by the MoonSprite component library with checkbox, number, text, select, and command-button controls. Use a `settingsEntry` sandbox HTML page only when the component schema is insufficient. Runtime code executes in a sandboxed iframe without same-origin privileges and may use only manifest-authorized `window.moonsprite` capabilities. Menu commands may select `runtimeEvent`, while settings commands may select `opensSettings`. A Runtime receives no installation directory, resource path, React, Store, Tauri, or internal document object. Complex document edits should still call a packaged Lua command through `commands.execute()` to retain transactions and undo. Runtime extensions cannot run on older MoonSprite versions that do not implement the v1 API.

Canvas-writing commands should use an explicit transaction so one command becomes one undo step:

```lua
app.transaction("Extension paint", function()
  app.activeImage:putPixel(0, 0, app.pixelColor.rgba(41, 121, 255, 255))
end)
```

## Two Namespaces

- `app.*` is the Aseprite-compatible API. It supports migration of existing scripts and currently implements only the subset explicitly documented by the project.
- `mse.*` is the MoonSprite-specific API. It does not pretend to be Aseprite and does not expose internal `SpriteDocument` or Renderer state.

The current Aseprite-compatible subset has two layers:

- Base pixels and layers: `Point`, `Rectangle`, `Color`, `Image`, `Palette`, active `Sprite/Layer/Cel`, layer type, parent and stack position, `Layer:cel(frame)`, `Sprite:newLayer()`, and `Sprite:newCel(layer, frame, image, position)`.
- Animation reading and editing: `Sprite.frames/tags`, frame number, duration and disabled state, tag range, direction and repeat count, `app.range`, and image or position access for existing multi-frame Cels on the active layer. Cross-frame and current-frame Cel writes share one script transaction and support undo and redo.

This is not the complete Aseprite API. Creating, copying, or deleting Frames and creating a Cel in an empty frame of an existing layer are not exposed as compatibility APIs. Scripts should work with existing frames and Cels within the supported subset or use the typed MoonSprite `mse.*` API. Compatibility scripts remain subject to Lua sandbox image, memory, instruction, and execution-time budgets; expensive per-pixel neighborhood scans may stop on larger canvases when their budget is exhausted.

See [mse-api.en.md](mse-api.en.md) for the complete MSE API shape, endpoint status, and error conventions. Editor type hints are in [mse-api.lua](mse-api.lua), which can be added to a VS Code LuaLS workspace library path.

The current `mse.animation` API exposes frame queries, active-frame switching, and loop-section operations. It does not provide a general frame create/duplicate/delete API; the MSE namespace is not a workaround for those missing compatibility methods. Check the documented method list and `mse.isSupported()` before use.

## Currently Available Interfaces

`mse` currently exposes documents, layers, animation loops, palettes, tilemaps, free tiles, pattern brushes, selections, slices, layer styles, workspace panels, file operations, and generic UI. Queries return the structural snapshot captured at script start. Writes join the current `app.transaction()` and are then committed in order through Renderer Store domain commands:

```lua
local document = mse.document.info()
local layers = mse.layers.list()

app.transaction("Create palette color", function()
  mse.palette.create { color = { r = 41, g = 121, b = 255, a = 255 } }
  mse.layers.update(layers[1].id, { name = "Lua Layer", opacity = 192 })
end)
```

Pixel edits and `mse` writes inside one Lua transaction form one undo step; if any operation fails validation, the entire batch rolls back. Creating or opening another project, saving, exporting, importing a local brush, and changing workspace panel visibility are application or file operations and do not enter the active project's undo history.

Scripts can use `mse.apiVersion`, `mse.status`, `mse.capabilities`, and `mse.isSupported("document.info")` for capability detection. Every method in the current `0.2.0` capability table is implemented; it contains no planning placeholders that only return errors.

Runnable examples are available in [examples/intro.lua](examples/intro.lua) and [examples/moon-phase.lua](examples/moon-phase.lua). The first time File > Scripts opens, `moon-phase.lua` is also copied to the executable-root `scripts` directory unless a file with that name already exists.

Complete compatibility members and no-op behavior: [Lua compatibility API](compatibility-api.en.md). The [API coverage index](../extensions/api-index.en.md) lists every registered MSE method and its typed signature.
