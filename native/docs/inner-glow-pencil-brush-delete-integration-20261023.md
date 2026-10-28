# Inner glow, tilemap stroke history and brush batch deletion — 2026-10-23

One writer integrated this batch on dev, preserving prior workspace differences. Development remains native/; official output remains native/build/Release/moonsprite-native.exe with native/start-native.bat. No branch, worktree, preview, commit or publication was created.

## Behavior and evidence sources

Inner glow follows actual legacy layer-styles.ts and LayerStyleDialog: disabled by default, white RGBA255/255/255/192, size2 (range1..32). For increasing Chebyshev ring distances, compute the maximum fractional transparency on that ring, stop at the first nonzero ring, and scale it by (size-distance+1)/size. Apply the glow color alpha times this coverage to source RGB while preserving masked source alpha. Color/gradient overlays precede glow; inner stroke follows and uses glow-adjusted RGB for SmartHue. Existing source halo/group traversal/opacity/blend/clipping are reused; output bounds do not expand. Shared PixelDialog has an inner-glow page and color role with actual input Change/dropdown callbacks. Existing preview/off/cancel/no-op/history/menu copy-paste/duplicate/PNG and layer/group project IO are retained. Style gradient-map and split remain outside this effect migration.

Normal native tilemap pixel pencil/eraser gestures stage raster pending pixels and commit through the previous batch's common changed-cell plus unique affected tileset snapshot history, preserving edit-cell hints and legacy primary/secondary selection changes. Paint previews keep touched cells and original tile pixels; cancel restores only those cells and caches, and commit/undo/redo stores cells without sheet pixel snapshots. Existing line, selection and symmetry logic are reused. Preparation allocation/validation precedes authority writes. Exceptional imported/link cache layouts and structural management retain existing full-State fallback; this is not a claim that all tilemap paths use no full-State copying. No OOM injection test is claimed.

Brush library restores legacy plus-menu/delete/manage toolbar semantics. The plus menu uses current-folder selection capture, image import and new-folder commands. Selection capture calls the existing createFillBrushFromSelection to retain current-folder storage. Delete snapshots selected resources in displayed order, asks once through shared PixelDialog, then deletes local/project resources in sequence, stopping on the first failure. Successful removals clear their active selection; failed and later resources remain selected. Cancel, Escape and header close do not mutate. Existing PatternBrushLibrary.remove and Document.deleteProjectBrush are reused. The selectionOutline icon is an exact solid/translucent 11x11 legacy PixelUtilityIcon conversion and is added to the existing explicit icon allowlist. No conversion/export workflow was invented. Prior ordinary-path external-drop behavior and file-URI limitation remain as documented in the previous batch.

## Validation scope

Source/spec review and automated pixel/actual UI command checks are separate from manual screenshot acceptance. This batch uses only five necessary existing test targets and three existing official app entrances; no benchmark, broad suite, packaging or manual screenshot acceptance is claimed. Final results are recorded after each check completes.

## Completed targeted tests

- layer-group-compositor-tests: Release build0/run0. New32 actual legacy inner-glow oracle cases plus previous stroke/shadow oracles; negative coordinates, semitransparent source and neighboring rings, size32, zero-alpha glow, overlay and inner-stroke SmartHue order; leaf/group exact pixels and130row chunk/mask/opacity.
- tilemap-document-tests: Release build0/run0. Existing32x24 fixture expanded to eight tool paths; pixel/Paint preview/cancel, eraser/no-op, exact shared transformed hidden/disabled reference caches, unrelated raster storage, history/cell-write counters, invalid-image preparation atomicity and mixed incremental/full-State undo/redo.
- tilemap-project-tests: Release build0/run0. Inner-glow preview/off/cancel/source-alpha/no-op/history/duplicate/PNG and all leaf/group fields; Create/Hybrid/Edit pixel strokes and secondary Paint save/reopen before/after undo/redo.
- pattern-brush-library-tests: Release build0/run0, existing focused library regression retained.
- canvas-performance-tests --tilemap-preview: Release build0/run0, dedicated local upload and main/frame pixel oracle only; no benchmarks.
- Provenance:470 files, normal0/strict1 while known migration gaps remain. Source/build/test logs retained in native/build/integration-*-20261023.log.

## Official executable and actual command checks

- Serial official Release build completed successfully (exit 0); log: native/build/integration-glow-pencil-delete-app-build-20261023.log.
- --color-overlay-check: exit 0, including inner-glow actual controls and menu style copy/clear/paste.
- --tileset-management-check: exit 0.
- --brush-library-panel-check: exit 0, including confirmation cancel/Escape/header close, partial local failure, and successful mixed local/project batch deletion.
- Final provenance checker: normal 0 / strict 1. Strict remains intentionally unsuccessful while registered migration gaps remain; coverage does not assert behavior equivalence.
- Official executable: 18132480 bytes; SHA256 77B099C7FDA6508E72375CC8E065501C4C11A9D9ED0BE855A589EE80CD40D89E.

Original native/start-native.bat reopened the official executable; observed PID: 32568 (Responding=True). No further validation or source changes followed.
