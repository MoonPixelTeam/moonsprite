# MoonSprite

[中文](README.md) | English

MoonSprite is an original, source-available pixel art workstation for Windows, built with Tauri 2, React, TypeScript, Zustand, and Canvas. It is not affiliated with Aseprite and does not use Aseprite source code, branding, or visual assets.

The current Beta channel is `1.0.0-beta3`, and the latest packaged version is `1.0.0-beta3`.

## Current Capabilities

- Pixel drawing: pencil, eraser, pattern brushes, dithering templates, shapes, gradients, paint bucket, magic wand, color picker, smart closure, and symmetry drawing.
- Selections and transforms: rectangle, ellipse, lasso, and polygon selections, plus move, copy, flip, scale, rotate, multi-layer, and multi-frame editing.
- Colors and brushes: RGBA and indexed color, foreground and background colors, custom palettes, synchronized palette colors, a pattern brush library, and local brush folders.
- Layers and animation: raster layers, background layers, layer groups, text, masks, layer styles, a multi-frame timeline, onion skinning, and animation loop sections.
- Tile workflows: tilemap layers with shareable tilesets, plus free-tile layers with overlapping instances and synchronized source-tile editing.
- Workspace: multi-document tabs, docked and floating panels, saved workspaces, categorized home projects, crash recovery, and multiple themes.
- Files and export: `.moonsprite` projects, Aseprite project import and export, common image formats and GIF, PSD project export, slices, sprite sheets, and timelapse video.
- Windows integration: system clipboard support, file associations, Explorer thumbnails, and recovery drafts.
- Automation: sandboxed Lua 5.4 scripts, an implemented subset of the Aseprite API, the MoonSprite `mse.*` API, and runnable `.msext` extensions.

See the [product behavior contract](docs/product/behavior.en.md) and [interaction contracts](docs/README.en.md#interaction-contracts) for the detailed rules.

## Scripts and Extensions

Place ordinary Lua scripts in the `scripts/` directory beside the installed application. They appear under File > Scripts. Scripts run in a restricted Lua 5.4 sandbox, can inspect the active document, and can perform undoable canvas operations through transactions. They cannot directly access files, the network, processes, or arbitrary local modules.

`.msext` is the MoonSprite extension package format and supports two execution models. `schemaVersion: 1` uses restricted Lua/MSE snapshot transactions and declarative UI rendered by the host. `schemaVersion: 2` uses Extension Runtime v1, which may run persistent sandboxed HTML/JavaScript and contribute menus, host-component settings or a custom sandboxed settings page, and owner-bound auxiliary windows according to manifest permissions. A Runtime cannot access React, the Zustand Store, Tauri, installation paths, or internal document objects. Complex document writes still go through restricted Lua commands and Store transactions. Extensions can be installed, enabled, disabled, and uninstalled under Preferences > Extensions, and `.msext` files can also be installed by double-clicking or dragging them into MoonSprite.

- [Lua scripting and extension guide](docs/scripting/README.en.md)
- [MSE API reference](docs/scripting/mse-api.en.md)
- [LuaLS type definitions](docs/scripting/mse-api.lua)
- [.msext extension development overview](docs/extensions/README.en.md)
- [Extension Runtime v1 API](docs/extensions/runtime-api.en.md)
- [Extension package format and security boundary](docs/adr/0020-extension-package-format.en.md)

`app.*` exposes the implemented Aseprite-compatible subset. `mse.*` is the MoonSprite-specific API. Scripts should use capability detection before calling an endpoint and must not treat planned endpoints in the documentation as already implemented.

## Development Environment

- Node.js 22
- pnpm 11
- Rust stable
- Windows 10/11 with the WebView2 Runtime

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

During continuous development, validate only the files changed by the current task:

```powershell
pnpm check:dev -- <changed-files...>
```

Protected architecture boundaries, releases, and packaging use separate gates. See the Chinese-only `docs/agent-workflow.md`. `pnpm package` produces an NSIS installer and portable build under `release/`. That directory is not committed, and packaging is run only when a deliverable is explicitly requested.

## Runtime Directories

The distributed application creates or uses the following directories beside the MoonSprite executable:

- `gallery/`: home gallery and default project save location.
- `exports/`: default export location for images, animation, video, and palette images.
- `brushes/`: user pattern brushes and brush folders.
- `palettes/`: user palettes.
- `BackgroundPresets/`: background-layer presets.
- `workspaces/`: workspace layouts.
- `scripts/`: user Lua scripts.
- `extensions/`: installed extensions and their enabled state.
- `Font/`: user fonts.

These runtime directories are not committed. The source repository's own `scripts/` directory contains development and validation tools; it is not the distributed user-script directory. Built-in resources live in `src-tauri/resources/`, including the default background presets and example project.

## Licensing

- The source code uses the [MoonSprite Source-Available License 1.0](LICENSE). It permits inspection, modification, personal builds, and source-form redistribution, but compiled MoonSprite binaries may not be distributed without written permission.
- Official binaries distributed through Steam or another authorized channel use the [MoonSprite Official Binary EULA](EULA.md). Personal and commercial creative work is allowed, with licensing based on user seats.
- Historical versions already released under the MIT License retain those rights. See [LICENSE-MIT](LICENSE-MIT).
- Third-party fonts and dependencies remain under their respective licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Maintenance Entry Points

- [Documentation index](docs/README.en.md)
- [Contributing guide](CONTRIBUTING.en.md)
- [Changelog](CHANGELOG.md) (canonical release record, Chinese)
- [Product behavior contract](docs/product/behavior.en.md)
- [File format](docs/file-format.en.md)
