# Shadow, tilemap commit history and ordinary brush drop — 2026-10-23

One writer integrated this batch on dev, retaining existing workspace changes. Official output remains native/build/Release/moonsprite-native.exe and native/start-native.bat. No branch, worktree, preview, commit or publish was created.

## Behavior and limits

Shadow ports actual legacy layer-styles.ts defaults and algorithms: black alpha160, offsets2/2, blur0, offset range -64..64, blur0..32, SmartShadow black at darkness45 by default. Coverage is maximum masked source alpha with Chebyshev linear falloff. Only source-transparent pixels receive shadow; outer stroke composites above it. Owner opacity/blend/clipping follow the effect. Existing halo traversal is reused with a necessary symmetric source-read expansion; output geometry keeps the exact translated shadow/stroke union. Shared PixelDialog has a right-column stroke/shadow selector, full controls and RGBA color role. Existing preview, cancel, single history, no-op, undo/redo and project/export paths are retained. Inner glow and style gradient-map remain migration gaps.

Shape, gradient, ordinary fill and pattern fill now share tilemap pixel commits storing changed cells and before/after snapshots of the unique affected tileset, following actual legacy history. Undo/redo stages cache patches and repairs transformed/shared/hidden/disabled cel references while retaining unrelated raster storage and summaries. This is not per-tile-only history: grid/raster staging and tileset snapshots remain. Pencil, Paint mode and structural management remain outside this batch; noncanonical imported/link cache layouts keep the old full-State fallback.

Ordinary native OLE Paths dropped over the brush library are claimed before document opening, imported through the existing image importer at library root, deduplicated for one second using invariant Unicode case folding, and select the last successful brush for pencil/fill. Hover/leave does not write. Partial failures remain visible and document pixels/history stay unchanged. File URI inputs, including quoted/whitespace forms, are explicitly rejected with status; complete legacy URL drop compatibility is not claimed. The former Space-pan gap was incorrect: no brush-panel-specific legacy hookup was found, so no new pan behavior was added. This corrects the earlier batch document's panning statement.

## Checks performed

- layer-group-compositor-tests: Release build exit0, run exit0. 48 actual legacy shadow oracle cases plus the existing864 stroke cases compare leaf/group pixels. Negative coordinates, blur32, smart depths0/45/100, stroke order, 130row chunk consistency, mask, opacity and clipping included.
- tilemap-document-tests: Release build exit0, run exit0. Small32x24 four-tool fixture checks exact shared cache output, actual cell writes, bounded history bytes, roles/activity/selection restoration and unrelated raster storage identity/revision.
- Provenance:469 files, normal exit0; strict exit1 while known migration gaps remain. Logs retained in native/build/integration-*-20261023.log.

Source/spec review and automatic checks are distinct from manual screenshot acceptance; no manual image acceptance is claimed.

## Completed remaining checks

- tilemap-project-tests: Release build0/run0, including shadow preview/off/cancel/no-op/history, PNG, all leaf/group fields and reopen, plus existing tilemap tool persistence.
- pattern-brush-library-tests: Release build0/run0, including Unicode path case folding/dedup. MSVC emits C4129 in CHECK macro stringification of the quoted raw-path expression; the actual normalization comparison passes. No production compiler errors.
- canvas-performance-tests --tilemap-preview: Release build0/run0, dedicated local upload and actual main/frame pixel oracle only; no benchmarks.
- Unique official app: Release build0, focused fixture diagnostic and repair builds0.
- Official --color-overlay-check: exit0, includes actual shadow controls.
- Official --brush-library-panel-check: exit0, includes actual native OLE ordinary paths, hover/leave, partial failure/dedup, persisted RGBA, root import, shared active resource, visible quoted file URI rejection and unchanged document/history.
- Official --tileset-management-check: final exit0. Initial failure retained in native/native-tileset-management-error.txt: stale canvas origin after custom docking prevented pointer ownership (dragging0/committed0/history1->1). Only fixture geometry repaired using existing fitCanvas after new-document refresh, with explicit unobstructed canvas ownership assertion; real mouse input, capture, history, secondary color, Escape and shape/gradient assertions retained. No production commit behavior was changed for the fixture failure.

All five targeted test executables and all three actual app entrances passed. No broader suite, benchmark, manual screenshot acceptance, packaging, commit or publication was performed.

Final executable: 18090496 bytes, SHA256 AE59123A2AF3937113692641F4B3D5D0EA697E2A4918D9A473B8F66B73636B05. Final provenance normal0/strict1 (known incomplete alignment). Reopened using native/start-native.bat. Process inspection: PID=2636 path=D:\Mine\Study&Work\学习工作\CodexWork\moonsprite\native\build\Release\moonsprite-native.exe responding=True.

