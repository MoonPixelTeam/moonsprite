# Symmetry scaling / linked Hybrid static Delete-Cut / intrinsic image paint modes — 2026-10-25

Ordinary raster symmetry handle scaling now follows the legacy inverse sampling, destination row order, source-index representative filtering and repeated symmetry-orbit writes. Move assigns directly inside the original selected mask and composites elsewhere; copy composites everywhere. Existing resize flips/modifiers, dense/sparse transactions and history are reused. Masks keep off-canvas orbit geometry, including empty results. Deferred display remains read-only and streams inverse-orbit rectangles of each requested tile; commit uses existing sparse conversion. Integer movement is retained. Symmetry rotation/shear/quad, clipboard, attached masks and tilemap transforms are outside this extension.

Same-layer explicit linkedCelId static Hybrid Delete/Cut supports a zero-origin/fullCanvas selected canonical owner and preflights every supported full-grid zero-origin shared owned-source reference owner. Existing Hybrid logic edits owned source tiles, creates replacements for changed foreign cells and leaves null cells empty. It preserves explicit chains, active leaf, tile IDs/references/transforms and authoritative cache/thumbnail propagation. Linked floating, runtime/private aliases and unsupported offset/padded topologies stay gated. Core tests include atomic refusal; project tests include save/reopen; actual UI covers Delete, CtrlX and menu Cut.

Intrinsic image brushes expose Paint, Source-aligned and Target-aligned modes through the existing native dropdown and scrollable property row. Pencil and eraser retain independent profiles. Sampling preserves original source coordinates, first unrotated stamp origin, negative-coordinate wrapping, coverage/colors and the four-phase FIFO mask cache across ordinary static/dynamic strokes, pixel preview and hover outline. Versioned image-brush-modes.txt adapts legacy preferences without changing the existing format; internal scaled images retain existing paint behavior. Existing controls/icons are reused. Legacy source-available license sections 2(b)/2(c) permit internal modification/testing; no new third-party implementation is introduced.

## Actual validation

The unmodified real legacy TypeScript oracle exited 0 for 12 representative fixtures: mirror enlargement/overlap, rotational-symmetry shrink, mixed half-pixel center flip/off-canvas, each move/copy at dense and deferred sizes. Exact expected pixels and masks are preserved. symmetry-scale-tests passed preview repeat/cancel/commit/UndoRedo, no authoritative deferred mutations and whole/individual tile overlay reads. tilemap-document-tests, tilemap-project-tests and image-brush-tests each exited 0 using the final core library. The complete build/execution history is recorded separately in native/build/symmetry-scale-hybrid-brush-final-20261025.json.

During validation, a fixture incorrectly required a true pixel-change return for a copy shrink that changed only the selection; its return expectation was corrected while retaining the selection history assertion. A real flipped texel discrepancy was diagnosed at destination (5,0): the generic native matrix inverse added a floating rounding step at 7.5/9, flipped and multiplied by six. Scaling now follows legacy arithmetic order directly; the original oracle expectations were unchanged. The trace and failed runs remain recorded. No product Enter behavior or stack settings were changed.

First formal build 69564 exited 1 because configureDialogBackground could not deduce its template from a base PixelDropdown pointer. Keeping the concrete allocation type through configuration fixed this without another header change. Formal build 5729 then exited 0. Actual UI process 42504 exited 1 because the new mode control was outside the scrollable row viewport. The independent fixture now uses existing scroll state/clamping to reveal that control before the unchanged visible/enabled/profile/persistence assertions. Formal incremental build 69612 exited 0; actual unified UI process 6472 completed and exited 0 with --workspace-check --named-workspace-only --symmetry-scale-hybrid-brush-only. All new UI fixtures are independent lightweight noinline functions.

Source registration and actual execution are separate evidence. Full legacy alignment remains incomplete. No full-suite, screenshot or DPI acceptance is claimed. No source changes were made after the successful actual UI run.

Source checks, official SHA256 and original BAT launch results follow below.

Provenance coverage exited 0: 490 files, evidence snapshots verified. Strict mode exited 1 with known INCOMPLETE migration gaps, as required. Scoped git diff --check exited 0 with CRLF normalization warnings only. These checks are separate from the actual execution results above.

Official executable SHA256: `D39F2F8AD5427DA31E98B49DF6B3BC8705EFDDBE54E44CFC8BF37BF6E4F820BE`.

Original native/start-native.bat exit: 0. Formal PID: 39452. Responding: True. Official path: D:\Mine\Study&Work\学习工作\CodexWork\moonsprite\native\build\Release\MOONSPRITE-NATIVE.EXE. No further build or test run after launch.

