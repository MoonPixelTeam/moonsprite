# LCD integration — 2026-10-20

This batch extends the previous disabled text foundation with a native editable text dialog, live draft/confirm/cancel, UTF-16 range styles, font file/system imports and file-ID deletion, text layer/cel metadata in project/recovery IO, free/box canvas creation and direct editing, selected box movement and resize/reflow. Text box borders use the shared selection skin material and alpha hit testing. Existing text edits store one owner content snapshot; translations retain the raster allocation.

Shortcut input adds configurable held/temporary tools and pointer/wheel command routing. Layer movement restores visible pivot metadata, defers cold alpha scans and bitmap upload to paint, reuses completed click flash bitmaps, preserves legacy Shift selection and the independent 220ms content edge feedback.

Validation results are recorded separately in build/lcd-final-smokes.json and build/lcd-final-tests.json after the official executable is rebuilt. Provenance coverage: 375 files, verified source snapshots. This documentation does not establish runtime acceptance.

Known limits: browser versus Skia glyph pixels are not yet proven equivalent; full text property synchronization to the current rich text selection and local textarea undo are incomplete. The repository still has other registered migration gaps; strict provenance is expected to fail. No release/package/commit is part of this batch.

Runtime acceptance: text-document-tests, text-raster-tests, text-font-tests, shortcuts-tests, move-click-flash-tests passed. Actual opened --shortcuts-check, --shortcuts-input-check and --layer-move-check passed. Independent --text-tool-check passed after adding the missing 2x skin paint transform to production and fixture; it checks native dialog cancel, per-pixel rendered alpha against physical hit geometry, actual pointer resize, undo and redo. Text capture is rendered from the same dialog/widgets into a dedicated surface because native swap surface capture was black. This record supersedes the prior text-foundation-only status for the functionality listed here.

Final official executable: 2026-10-20T12:24:58.496174+00:00, 15901184 bytes, SHA256 `4655c4fcfc8dccf7896b60ebb148f441148a1e851c24d68b5566187d6bba7556`. Final --text-tool-check exit 0. Visual QA is offscreen native widget rendering, not a screen capture; labels/controls/spacing show no clipping or overlap. The app was closed after checks.
