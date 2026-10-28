# Offcanvas symmetry selection / Create linked static pixels / pattern parameter drafts — 2026-10-25

Ordinary symmetry selection-box integer movement now retains the complete offcanvas selection mask, matching useCanvasSelectionTransform.ts with clipToCanvas=false. The existing clipped helper default remains available. Real legacy TypeScript modules were executed without modifying their implementation to produce exact mirror, rotational and mixed half-pixel center masks. Actual input checks move out, Escape, commit/Undo/Redo, and press an outside selection to drag it back. Content transforms, resize and rotation are outside this batch.

Static Create Delete/Cut now admits zero-origin/fullCanvas same-layer explicit linkedCelId chains through a narrowly marked canonical-owner history. Existing Create conversion finds/reuses or appends source tiles, without modifying original shared tile bytes. Exact owner/middle/leaf links, active leaf, every resolved cache and independent repeated-tile frame remain intact. Global delta support and linked floating stay gated; Edit/Hybrid, padded/offset and runtime aliases remain unported. Save/reopen verifies the new source refs and appended tileset.

Random/Regular fill pattern parameters use a native draft window: Apply/Enter exports current-mode fields, Cancel/Escape/header/outside close discards, and reset affects current mode only. Count/density, overlap and signed regular-spacing rules follow FillPatternControl and its tests. The focused number field opens its owned range popup; Escape closes the range before the parameter window. Existing PatternSettings algorithms are reused. Mode, sampling and accepted fields persist in a versioned native fill-pattern-options.txt beside existing preferences. Tests retain their isolated artifacts inside native/build. FillPatternPresets remains explicitly unported. The source-available legacy license sections 2(b)/2(c) permit modification and internal development/testing; no third-party implementation or new icon is added.

Source registration and actual execution acceptance are reported separately. Full legacy alignment remains incomplete.

## Validation

Final actual EXE exits: symmetry-model-tests 0, tilemap-document-tests 0, tilemap-project-tests 0. The real legacy TypeScript oracle also exited 0. The final formal application build (87353) exited 0, and the actual three-module UI route `--workspace-check --named-workspace-only --offcanvas-pattern-create-only` completed as PID 37856 with exit 0. No code changed after this UI pass. This is execution acceptance for the stated scope, not screenshot or DPI acceptance.

Earlier failures are retained in `native/build/offcanvas-pattern-create-final-20261025.json`: the document fixture initially overflowed the cumulative test stack, compared identity-dependent tile IDs across separate documents, and retained a superseded Create refusal assertion. Test-only corrections resolved these without changing production stack settings. The first formal build exposed a closeRange constructor-parameter shadowing compile error, corrected with explicit member calls. Two UI fixture failures were caused by an existing transform handle and quick-selection double-click detection; independent simulated gestures were corrected without changing those product behaviors. The orchestration error that initially started a formal build before acting on the failed core EXE is also recorded. All final core EXEs passed before the next formal build.

Provenance coverage: 484 files, exit 0; strict check: exit 1 / INCOMPLETE, as required while known migration gaps remain. Scoped `git diff --check` exited 0. Source registration does not establish behavior equivalence for unported features.

Official executable: `native/build/Release/moonsprite-native.exe`.
SHA256: `83A752D1F93CAE51FF7DAEA4D4A92AAC45DB79DBC377A2AF33004013B5D9E643`.

Consolidated evidence: `native/build/offcanvas-pattern-create-final-20261025.json`. Original BAT launch metadata is appended below after launch.

Original `native/start-native.bat` launch: exit 0; formal PID 13264; Responding=True. No builds or additional checks followed launch.
