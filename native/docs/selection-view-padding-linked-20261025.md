# Selection view alignment / padded Paint move / independent flip — 2026-10-25

Rectangle/ellipse selection creation reuses view-aligned local rounding and existing geometry, preserving Alt/Space/anchor and final selection mask history. Paint zero-origin full-grid padded move clips selection to document but carries complete cell refs/cache; move/copy preview/cancel/history and seed-archive save/reopen checked. Discrete H/V cell flip permits independent selected owner despite unrelated linked groups, preserves their storage identity/metadata and applies target-only cell history; selected linked/inbound/runtime/layer-linked owners remain refused. Actual legacy target resolver and flip/applyTilemapDocumentEdit reused semantically; no linked owner propagation or free-transform claim.

Validation: serial core build 29537 exited 0. Final actual moon-core, tilemap-document, tilemap-project and document-raster-history executables each exited 0. Padded move fixtures cover complete hidden cell texels, repeated previews, move/copy/cancel, clipped selection, keyboard clamp/rounding, Undo/Redo and save/reopen.

Official first build 47800 exited 1 due to the smoke fixture using unavailable kKeyLAlt; changed only fixture to existing kKeyAlt. Final official serial build 94649 exited 0. Actual UI --workspace-check --named-workspace-only --selection-view-move-only PID 300 exited 0. It covers rectangle/ellipse representative view poses, Shift/Ctrl, Space/Alt/anchor, exact preview/commit and Undo/Redo, padded pointer move/copy/cancel, actual H flip menu and ShiftV in linked document plus linked storage identity/cache preservation.

LC core fixture corrections: the initial combined assertion exited 1. Diagnostic rebuild 53337 isolated target admission: creating linked layer left its timeline row selected while selectLayer changed only active layer. Fixture now clears timeline selection to model one target; production gate unchanged. Next run passed all flip/link/UndoRedo checks but rejected a malformed extra-frame fixture missing other layer cels. Fixture completed the frame rectangle; final target build 9523 and executable exited 0. No production behavior was changed to accommodate these fixture failures.

Provenance coverage 483 files exited 0; strict exited 1 and remains INCOMPLETE for known migration gaps. Scoped diff check exited 0. Source coverage does not establish full behavior equivalence. No fresh screenshot/DPI acceptance or full migration claim.

Evidence: native/build/selection-view-padding-linked-final-20261025.json. Formal executable SHA256 178AB583655FFF0895EC088D10B8BF65BB738FD9B997947A1139595EEAD3EA91.


Original native/start-native.bat exited 0; formal PID 21092 Responding=True. No checks or builds followed the launch.
