# Architecture Overview

[中文](overview.md) | English

MoonSprite is a Tauri 2 application with a multi-document workstation in its main window. Project splits and floating project views live inside that workstation; extensions can also create owner-bound native auxiliary windows, host dialogs, or overlays. React renders the workstation, Zustand manages editing sessions, Canvas renders pixel views, and Rust exposes controlled Windows system capabilities.

## Dependency Direction

```text
React components
      |
      v
Zustand store ----> core algorithms
      |
      v
platform/tauri-api ----> Tauri commands ----> Windows/file system
```

- `core/` does not depend on React, components, store, or Tauri. Pure algorithms should have deterministic unit tests. A few browser adapters encapsulate storage, events, or Canvas APIs; they do not permit domain algorithms to depend on UI or native commands.
- `store/` orchestrates sessions, history, and core algorithms without drawing UI directly.
- `components/` reads state, collects input, and renders without duplicating core algorithms.
- `platform/` wraps all Renderer IPC. Components must not scatter direct Tauri calls.
- `src-tauri/` validates every path and argument from the frontend and returns displayable errors.
- `src-tauri/src/platform_paths.rs` centrally manages gallery, palette, brush, workspace, and script directories beside the application. User-data location migrations change only this boundary.
- `src-tauri/src/platform_clipboard.rs`, `platform_files.rs`, and `platform_resources.rs` own the system clipboard, binary files, and resource metadata. `lib.rs` only registers commands and coordinates the window lifecycle.
- `src-tauri/src/platform_scripts.rs` owns script discovery beside the executable, path validation, and Lua session threads. `platform_scripts/lua_api.rs` owns the restricted Lua 5.4 VM, Aseprite-compatible objects, and the generic dialog bridge. `platform_scripts/mse_api.rs` declares the MoonSprite namespace, capability table, structural snapshot queries, and serialization of typed operations. The platform receives only a script file name, active-target snapshot, and dialog events, and returns typed pixel, Cel-surface, new-layer, new-document, or `mse` operation batches. It never owns or directly modifies Renderer document state. Persistent dialog callbacks rebuild the VM baseline from current pixel and structural snapshots for the same target supplied by the Renderer. Blocking dialogs suspend a Lua coroutine and continue after the close event.
- `src-tauri/src/platform_extensions.rs` is the platform boundary for `.msext` manifest validation, resource reads, atomic installation, enabled state, and uninstall. Schema 1 supports restricted Lua commands; schema 2 also supports persistent runtimes, settings, and auxiliary windows. `core/extension-contributions.ts` maps menu and panel contributions, `core/extension-runtime.ts` defines permissions and methods, and `components/extensions/ExtensionRuntimeHost.tsx` coordinates isolated iframes and host calls; windows use `ExtensionWindow.tsx` and `ExtensionOverlay.tsx`. Commands can run Lua, dispatch Runtime events, or open settings. Document writes still use Lua snapshots and Store transactions. Extensions receive authorized opaque IDs and bridge APIs, never host DOM, Store, Tauri, or installation paths.

## Current Maintained Risk State

- Plan status: complete
- Unfinished high-risk splits: 0

These fields describe the registered boundary migration plan and the number of architecture debt categories with a nonzero budget. They do not mean that all maintainability work has ended.

- The nine existing boundary migrations are complete; work on concentration and workflow ownership continues.
- Previously registered high-risk migration items: 0. This does not mean that canvas interaction, the layer timeline, or every large command module is fully decoupled. See the [editor decoupling contract](../architecture-decoupling.md) for current boundaries and remaining areas of concentration.

The previous round extracted several high-risk entry points, but an audit confirmed that splitting files alone did not fully solve write ownership, history snapshots, main-thread persistence preparation, or root Store growth. This round closed those gaps by data flow and responsibility ownership:

- Document writes are owned by Store domain commands and document transactions; components only handle input and presentation.
- Undo history uses domain deltas instead of compressed complete `.moonsprite` projects.
- Save and recovery create plans from changed resources, and archive preparation and compression run off the UI thread.
- A project is decoded only once per open; first-frame compositing and caches reuse the decoded document.
- The root Store is split by sessions, document commands, history, tools, views, animation, Tilemap, project IO, and recovery.
- UI refresh uses domain revisions and precise selectors instead of serializing large objects into strings.
- The frontend runtime dependency graph remains acyclic, including paths across renderer/shared directories, and all Tauri access is consolidated under `platform/`.

Architecture debt is recorded by category in `scripts/architecture-debt-budget.json`. All nine permanent guard budgets are currently zero. These budgets are not file exemptions: new debt fails immediately, and budgets may not increase or be postponed. Rules are either `guard` (permanent regression protection, with `expiresAt: permanent`) or `migration` (migration debt, with an expiry version). A rule may declare an `anchor`; when that expression no longer matches production source, the gate requires retirement or replacement. The former `workspace-root-command` rule was retired this way, with its reason recorded in `retiredRules` in the same file. `pnpm check:architecture` is the machine-executable source of truth.

## Target Module Boundaries

- Session state: document list, active document, dirty state, and lifecycle.
- Document editing: pixels, layers, selections, and adjustments.
- Tool state: tools, brushes, colors, modifier keys, and pointer intent.
- View state: pan, zoom, rotation, grids, and previews.
- File services: open, save, import, export, recovery, and recent items.
- Workspace UI: panels, docking, floating windows, sizing, and layout persistence.

Every new feature must belong to one of these boundaries. If it cannot be classified, write an ADR before deciding its location.

### Animation Extension Boundary

`SpriteDocument` uses document-level layers and layer groups as tracks and stores frames, frame durations, and cel pixels in an independent animation timeline. Cels associate through stable `layerId` and `frameId` values; they cannot change layer-group relationships or layer-panel ordering semantics. `RasterLayer` is only the editable surface for the active frame. Frame switching is synchronized centrally by `core/animation.ts`; components must not replace pixel arrays themselves.

The tree region of the layer panel receives only layer and group identity, parent-child relationships, collapsed state, and display order. The animation region to its right reads frame and cel slots. Both regions share vertical row layout, but layer drag targets and insertion lines must not depend on frame data. Switching frames keeps the layer tree stable.

## Architecture Implemented in This Cycle

- `core/shortcuts.ts` centrally owns shortcut defaults, parsing, persistence, and keyboard-event formatting. UI code only displays and triggers shortcuts.
- `core/file-preferences.ts` centrally owns editor-preference defaults, validation, ranges, and persistence. New settings enter `EditorPreferences` before UI consumption.
- `locales/` separates resources by language. The Simplified Chinese catalog defines the complete translation-key set. `core/localization.ts` centrally owns available languages, catalog registration, typed translation keys, Simplified Chinese fallback, and interpolation. `components/I18nProvider.tsx` only connects the persisted language to React. A language cannot be registered as available until translation and layout acceptance are complete.
- `core/storage.ts` is the Renderer's unified safe local-storage boundary. `core/workspace-layout-preferences.ts` validates window and workspace layouts, migrates old configuration, and enforces size limits. `App.tsx` does not parse persisted data directly.
- `platform/app-window.ts` is the only Renderer boundary for window size, position, maximization, multi-display visibility, and native window events. `App.tsx` only persists layout and calls the platform adapter.
- `core/document-files.ts` centralizes file names, extensions, save paths, and project codec rules. `store/document-file-service.ts` orchestrates system dialogs and file IO. `store/recovery-service.ts` serializes recovery writes and deletion.
- `workers/document-decode.worker.ts` returns the document after one full decode, then prepares initial compositing from that same result. `workers/project-encode.worker.ts` owns previews, manifests, sparse pixels, incremental reuse plans, and ZIP compression. The main thread captures only lightweight revisions and storage-origin metadata.
- `core/history.ts` keeps undo-stack memory accounting synchronized with stack contents. Failed undo or redo retains the original entry. View state never enters this history stack.
- `store/clipboard-service.ts` wraps selection and layer clipboard snapshots, system-image conversion, and internal fallback. The clipboard is application-level temporary state, not document undo history. The service boundary copies pixel arrays so paste operations and callers cannot mutate the source accidentally.
- `core/canvas-input.ts` centralizes transient canvas input and reusable gesture rules, including active drags, pointer state, modifiers, zoom levels, axis constraints, selection scaling, and rotation handles. `CanvasStage.tsx` only orchestrates events and rendering; future gesture extraction must reuse these rules.
- `core/canvas-visuals.ts` centralizes canvas cursors, transparency checkerboards, selection-boundary previews, and preview-layer contrast rules. `CanvasStage.tsx` no longer decides these visual semantics independently.
- `core/animation.ts` centralizes single-frame compatibility, frame duration, independent cel surfaces, frame synchronization, layer-track reconciliation, and playback advancement. Pixel history locates the original cel through `frameId`; project-format migration occurs only at the `project-format.ts` boundary.
- `core/panel-layout.ts` is the only entry for panel order, default sizes, minimum sizes, old-layout compatibility, and reorder operations. `WorkspacePanels.tsx` only connects layout state to panel rendering and docking interaction.
- `core/panel-render-keys.ts` defines minimum refresh boundaries for color, palette, layer, and preview panels. The layer panel refreshes only when layer structure, active frame, frame parameters, or playback state changes. Ordinary pixel edits and view pan, zoom, or rotation do not rebuild the entire frame grid. Panels must not resubscribe to the whole Zustand store.
- `core/palette-layout.ts` centralizes palette swatch sizing, color comparison, marker contrast, and multi-selection ordering. `PalettePanel` owns only DOM hit testing, file operations, and Store orchestration.
- `core/layer-operations.ts` centralizes structural changes and undo history for layer moves, cross-group moves, group ordering, grouping, and ungrouping. `workspace.ts` only invokes commands, maintains sessions, and displays blocked-operation messages.
- `App.tsx` dynamically loads `CanvasStage`, `HomeWorkspace`, and `ComponentLibrary` only when entering those flows, so home startup does not pre-parse editor and component-library code. Dynamically loaded modules must retain explicit loading boundaries and must not own core document state.
- `core/project-format.ts` uses `PROJECT_SCHEMA_VERSION` and `migrateProjectManifest()` as the project-format entry. Unknown versions are rejected rather than guessed. Future migrations add independent migration branches.
- `components/app/useBrushLibrary.ts` orchestrates loading, saving, deleting, and session synchronization for procedural, project, and local brushes. `EditorToolOptions.tsx` consumes the normalized brush set and commands.
- `components/app/app-render-keys.ts` defines minimum refresh signatures for menus, tabs, the tool rail, tool options, the status bar, and the application coordinator. It is a UI selector boundary and does not contaminate `core/` in reverse. Signatures must not contain pixel arrays or whole documents.
- `components/app/DocumentTabs.tsx`, `EditorToolRail.tsx`, `EditorToolOptions.tsx`, and `EditorStatusBar.tsx` each subscribe to domain signatures and own their popup state. `EditorCanvasHost.tsx` is the high-frequency session update entry. `EditorWorkspaceShell.tsx` only orchestrates docking layout.
- `components/canvas-selection-renderer.ts` owns selection screen geometry, boundary-path caching, and handle drawing. `components/useCanvasViewPreview.ts` owns pan and zoom preview and commit. `components/canvas-composite-cache.ts` owns whole-image and tiled compositing caches and local invalidation.
- `store/workspace-state.ts` composes Workspace data and command contracts by domain. `workspace-session.ts` constructs sessions and persists tool settings. `workspace-layer-move.ts` owns layer-drag preview, cancellation, and single history commit. `workspace-palette.ts` owns palette selection, ordering, and history commands. Production history no longer uses whole-project snapshots.
- Rust platform commands are split by domain into `platform_palette.rs`, `platform_workspaces.rs`, `platform_brushes.rs`, `platform_gallery.rs`, `platform_recovery.rs`, and `platform_dialogs.rs`. New system commands must enter the matching domain module.
- Lua scripts use `store/lua-script-service.ts` to create pixel and `mse` structural snapshots, hold Renderer target tokens, and validate each session result. Initial execution strictly matches the original revision and surface. Persistent dialog callbacks first confirm that document, layer, and frame identity have not changed, then rebuild the target token and structural snapshot from the current baseline and strictly validate the result. Local results commit through `beginPixelEdit`, `recordPixel`, and Store `commitPixelEdit`; Cel image size and position replacements use minimal before-and-after surface history. `store/lua-script-operations.ts` dispatches typed `mse` operations to existing Store domain commands. A Lua transaction combines pixel and structural writes in composite history; if any operation fails, it aborts the composite history and restores applied document mutations in reverse order. New Sprites, open/save/export, resource imports, and panel layouts remain explicit operations outside the document transaction. `components/LuaScriptDialog.tsx` only renders the generic platform control model and dispatches events, without document writes. New script endpoints must add restricted operation types and corresponding Store domain commands; Lua must not return a whole mutable `SpriteDocument` or access the Store, DOM, or arbitrary Tauri commands.

When splitting large modules later, first extract pure rules into an acyclic `core/` module with tests, then orchestrate state in a domain Store, and finally connect React components. Do not scatter new persistence keys, format-version decisions, coordinate algorithms, or document writes into `App.tsx`, `CanvasStage.tsx`, or panel components.

Canvas preferences and the eyedropper magnifier, layer-row dragging and settings editing, and application text/export/script sessions each own their state and lifecycle. Parent components connect through values and commands. Global shortcuts use a state-owning router and six domain handlers; timeline gestures own preview and cancellation/commit; continuous strokes connect to the canvas through coordinate-reading and redraw interfaces. See the [editor decoupling contract](../architecture-decoupling.md) for the size comparison, validation records, and tool and timeline layouts that remain concentrated. This does not claim that giant components have been eliminated.

React performance probes are enabled only by `?moonsprite-perf=1`; normal application startup does not run Profiler measurements. The application coordinator does not respond to high-frequency pixel, pan, or rotation changes. The canvas host, artwork preview, and UI domains that actually change continue updating independently. Future optimization must follow hotspots confirmed by regional probes and must not skip required state updates to improve metrics.

## Tool Settings Boundary

`core/tool-preferences.ts` centrally manages pencil, paint-bucket, procedural-texture, magic-wand, and selection-tool settings, including defaults, old-version compatibility, ranges, and `localStorage` access. `workspace.ts` only applies these settings to the active session and no longer interprets persisted data.

### Overall Split of the Three UI Entry Points

CanvasStage composes the owners of geometry, input, previews, and rendering. Ordered down/move/up routes dispatch to tool modules. Each owner that creates asynchronous work cancels that work itself; the viewport lifecycle no longer manages stroke or selection resources. The main rendering coordinator retains frame ordering, while individual channels receive explicit inputs instead of the whole render context.

LayersPanel composes preferences, selection guides, visibility/lock gestures, row dragging, timeline gestures, shortcuts, and file drops. Layer and timeline menus own their state and dialogs. LayerTreeRows, LayerTimelineCells, and mask rows render their respective views; derived visuals and link geometry have dedicated modules. Shared vertical timeline layout remains an explicit dependency.

App composes workspace layout, document panes, preferences, command scope, shortcut settings, document IO, window lifecycle, and extensions. Information, document, and settings dialogs belong to their corresponding owners. TextToolHost, ExportDialogHost, script sessions, and shortcut routing retain independent lifecycles. See the [editor decoupling contract](../architecture-decoupling.md) for module boundaries, size measurements, validation, and remaining limitations.
