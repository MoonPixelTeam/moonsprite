# Symmetry content translation / linked static Edit / fill preset library — 2026-10-25

Ordinary raster interior integer move/copy now follows actual legacy tools-selection-transform-apply.ts source/write order. Pressed rotational/mixed-center regions use first-write destination deduplication; representative-source mirrors retain ordered repeated writes. Move writes directly inside the original selection and uses source-over elsewhere; copy uses source-over throughout. Existing original source capture, dense/sparse transactions and deferred display are reused. Deferred preview leaves authoritative pixels untouched and uses the existing sparse commit conversion. Resize/rotation/shear/quad symmetry, clipboard, mask and tilemap content are outside this extension.

Static same-layer explicit linkedCelId Edit Delete/Cut now preflights every actual shared-tileset reference owner, then uses existing inverse cell-to-tile mapping and targeted cache updates. The selected canonical owner must be zero-origin/fullCanvas; shared reference owners must use supported full-grid zero-origin caches. These supported owners retain exact refs, cell transforms, chain topology, active leaf and source tile identity. Every supported reference sees source edits. Offset/padding/runtime/private aliases, Hybrid static pixels and linked floating stay gated. Legacy tools-fill.ts clearSelection has no pointer cell anchor; tilemap-document.ts applies all changed cells and rerenders shared references. New noinline fixtures run from lightweight entry points.

Random/Regular pattern drafts now include the complete legacy preset library workflow: builtins/users/custom groups, modified marker, mode-scoped names, save/new or stable-id update, delete confirmation, 64-entry limit, 80 UTF16-unit name limit and fail-visible invalid-library/write handling. Library persistence is independent of the parameter draft and survives parent Cancel. Existing PixelPresetControls/delete icon are reused. Optional PixelDropdown group headings and popup ownership are native adaptations of ThemedSelect; versioned JSON/atomic replacement reuse native tween_path_presets.h helpers instead of localStorage. Legacy source-available license sections 2(b)/2(c) permit internal modification/testing; no third-party implementation or new icon is introduced.

Source registration and actual execution acceptance are separate. Validation and original BAT launch results will be appended. Full legacy alignment remains incomplete; no screenshot/DPI acceptance is claimed.

## Validation

Final core executables symmetry-content-tests, tilemap-document-tests and tilemap-project-tests each exited 0. The real legacy TypeScript oracle exited 0 for 16 mirror/rotational/mixed-center/overlap move/copy fixtures at dense and deferred sizes. It covers exact pixels and masks, read-only deferred preview, cancellation, commit and Undo/Redo. Oracle adapter failures (fflate linking and fixture readLayerPacked arguments) were corrected only in the harness.

Final official build session 99827 exited 0. Actual专项 UI process 10620 exited 0 using `--workspace-check --named-workspace-only --symmetry-presets-edit-only`. It covered symmetry interior move/copy and existing Enter history semantics, linked static Edit Delete/Cut, and preset persistence/update/delete/future-version refusal. Earlier actual failures and every build exit remain recorded in `native/build/symmetry-presets-edit-final-20261025.json`.

Corrections during validation: an incorrect tooltip include was replaced with existing ui/tooltips.h; a UI assertion was corrected to the existing content-plus-deselect Enter history; new core fixture Documents moved to the heap; an old linked Paint fixture call moved from a giant baseline function to lightweight main; the new linked Edit UI block was extracted unchanged into a noinline method to avoid the old 911584-byte frame. No product Enter behavior or stack setting changed. Nonzero runs stopped dependent steps before repair/rebuild.

Provenance coverage passed (exit 0): 487 files, evidence snapshots verified. Strict mode exited 1 with known INCOMPLETE migration gaps, as required. Scoped git diff --check exited 0, with only CRLF normalization warnings. These source checks do not claim complete behavior parity. No source was changed after the successful final UI run.

Official executable SHA256: `49D05D087FABDC2371874931E3372BE72457B489AC69E4F05558DC4BA252F9B7`.

Original BAT launch confirmation will be appended below.

Original native/start-native.bat exit: 0. Formal PID: 5088. Responding: True. Official path: D:\Mine\Study&Work\学习工作\CodexWork\moonsprite\native\build\Release\MOONSPRITE-NATIVE.EXE. No further build or test run after launch.

