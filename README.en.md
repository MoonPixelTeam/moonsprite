# MoonSprite

[中文](README.md) | English

MoonSprite is an original, source-available pixel art workstation for Windows, built with Tauri 2, React, TypeScript, Zustand, and Canvas. It is not affiliated with Aseprite and does not use Aseprite source code, branding, or visual assets.

The current source version is `1.0.0-beta4` on the Beta channel, and the latest packaged version is [`1.0.0-beta4`](docs/changelog/1.0.0-beta4.md). The capabilities below describe the current source implementation; see the corresponding release record for changes included in the packaged version.

## Current Capabilities

### Drawing and Image Processing

- Drawing tools: pencil, airbrush, eraser, smoothing brush, straight lines and curves, shapes, gradients, paint bucket, magic wand, and color picker; pixel-perfect drawing, smart closure, symmetry, and texture fills.
- Brushes and colors: an image brush library, brushes created from selections, dithering templates, pressure and speed dynamics; RGBA, indexed, and grayscale modes, custom palettes, synchronized colors, and color replacement.
- Selections and transforms: rectangle, ellipse, lasso, polygon, and combined selections; move, copy, flip, scale, and rotate across multiple layers, frames, and cels. Rectangle and ellipse selections and shapes also support drawing from the center and an adjustable drawing anchor.
- Contours and color adjustments: liquify push, expand, shrink, and twist; outlines, automatic anti-aliasing, color balance, brightness/contrast, hue/saturation, and curves; CRT, VHS, vignette, glow, and LCD-style filters.
- Size tools: canvas margins and anchors, image resizing, pixel-scale detection, selection cropping, and transparent-edge trimming for the current frame or all frames.

### Layers and Animation

- Layer structure: raster layers, background presets, groups, blend modes, clipping masks, and per-frame layer/group masks. Linked layers share pixels while keeping independent positions and display properties.
- Editable text: auto-sized text and fixed-area text boxes with automatic wrapping, character colors, font sizes, letter and line spacing, and font import.
- Layer styles: outlines, shadows, inner glow, color overlays, and gradient overlays, with smart outlines, smart shadows, live previews, and style splitting.
- Timeline: frame and cel multi-selection, ordering, copying, and linking; onion skinning, independent preview playback, and animation loop sections with nesting, playback direction, and repeat counts.
- Automatic tweening: generate position, rotation, scale, and opacity transitions from a single frame or loop section, with easing and endpoint previews. This is geometric tweening; it does not redraw intermediate character poses.

### Tiles and Canvas Aids

- Tilemaps: tile layers and shared tilesets with tile editing, reuse, and organization.
- Free tiles: separate source tiles from overlapping instances, with source edits synchronized across references. Instances support independent positioning, rotation, mirroring, opacity, and blend modes, as well as multi-selection and batch management.
- Drawing aids: seamless tiling, pixel and custom grids, grid and smart alignment, relative brightness, ISO guides, and forced line alignment; view rotation, mirroring, and optional canvas scrollbars.

### Projects, Export, and Timelapse

- Projects and recovery: full `.moonsprite` projects, incremental saving, crash recovery drafts, and project rollback when backups are enabled; multiple project tabs, recent files, a gallery, and custom folder categories.
- Format exchange: import/export `.ase` and `.aseprite`; open PNG, JPEG, WebP, BMP, and animated GIF; export PNG, JPEG, WebP, BMP, GIF, SVG, ICO, and PSD. PSD export includes the current frame's layers, without an animation timeline. Keep a `.moonsprite` master for MoonSprite-specific structures.
- Asset output: slices and automatic slicing, region or layer export, batch frame export, sprite sheets, and export presets. GIF export follows animation loop-section playback order.
- Timelapse: full recording, smart sampling, optional undo-step recording, playback previews, and MP4/WebM video or PNG/JPG sequence export. Recordings normally live in a local library; enable “Include timelapse recording” in Save As to transfer them with a project. Video format availability depends on the environment's encoding support.
- Windows integration: system image clipboard, file drag-and-drop, file associations, and Explorer thumbnails.

### Workspace, Languages, and Extensions

- Workspace: split project views and floating windows, docked and floating panels, saved layouts, canvas-following previews, custom shortcuts, and a configurable quick-command bar.
- Interface: theme editing, UI scaling, and body font sizing; Simplified Chinese, English, Japanese, Korean, Spanish, French, German, Brazilian Portuguese, and Russian, with menus and dropdown options adapting to long labels.
- Automation and extensions: sandboxed Lua 5.4, an implemented subset of the Aseprite API, MoonSprite `mse.*` APIs, and `.msext` menus, settings, persistent runtimes, and auxiliary windows. The bundled Pet Companion extension can be disabled or uninstalled.
- Usage information: project information, usage statistics, and diagnostics.

For instructions, see the [MoonSprite user guide](docs/user-guide.md) (Chinese). See the [product behavior contract](docs/product/behavior.en.md) and [interaction contracts](docs/README.en.md#interaction-contracts) for the detailed rules.

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
- `timelapse-v1/`: local recording library referenced by ordinary project saves. Use Save As > Include timelapse recording to transfer recordings with a project.

These runtime directories are not committed. The source repository's own `scripts/` directory contains development and validation tools; it is not the distributed user-script directory. Built-in resources live in `src-tauri/resources/`, including the default background presets and example project.

## Licensing

- The source code uses the [MoonSprite Source-Available License 1.0](LICENSE). It permits inspection, modification, personal builds, and source-form redistribution, but compiled MoonSprite binaries may not be distributed without written permission.
- Official binaries distributed through Steam or another authorized channel use the [MoonSprite Official Binary EULA](EULA.md). Personal and commercial creative work is allowed, with licensing based on user seats.
- Historical versions already released under the MIT License retain those rights. See [LICENSE-MIT](LICENSE-MIT).
- Third-party fonts and dependencies remain under their respective licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Maintenance Entry Points

- [Documentation index](docs/README.en.md)
- [User guide](docs/user-guide.md) (Chinese)
- [Contributing guide](CONTRIBUTING.en.md)
- [Changelog](CHANGELOG.md) (canonical release record, Chinese)
- [Product behavior contract](docs/product/behavior.en.md)
- [File format](docs/file-format.en.md)
- [Release checklist](docs/release/release-checklist.md) (Chinese)
