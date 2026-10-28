# Symmetry selection-box translation / linked-document Paint move / offset flip — 2026-10-25

Ordinary non-tilemap selection-box integer translation ports legacy symmetrySelectionDragDelta and transformSymmetrySelection translation semantics: matrix-associated first-seen orbit representative, rotational/mixed-center pressed region, complete unique clipped closure. Reuses native constrained/grid delta, selection-only preview/history and cancellation; content/resize/rotate/repeat not claimed. Independent Paint cell move/copy in documents containing unrelated linked groups now uses existing per-owner validator and target-only history for preview/cancel/commit/UndoRedo, preserving unrelated storage and existing hidden/locked/selected-link gates. Discrete H/V flip alone admits integer offset full-grid cache, maps world mask to local cell refs, keeps complete hidden texels/cache offsets/source sheet, history flag explicitly opts into offset validator; offset move/floating stays gated. Native event/owner-history validation adapters only, no new architecture or icons.

Validation: serial core build 4380 exited 0. Actual symmetry-model, tilemap-document and document-raster-history executables exited 0. Exact legacy rotational side translation fixture preserves its 16 expected pixels; mirror drag maps the pressed side into the canonical representative. Selection-only preview, commit, Undo/Redo and Escape run through actual native pointer input.

Initial tilemap-project run exited 1 in the new offset flip save/reopen assertion. Diagnostic build 18487 exited 0; executable exited 1, isolating origin reset to 0,0 while complete cache pixels, refs and source sheet remained exact. Fixed the actual migration defect in tilemap_project_json.h validateAndRender by copying parsed offsetX/Y before rebuilding complete grid cache. Legacy project-format-decode.ts lines 637-642 passes the existing offsets to tilemap.ts renderTilemapSurface lines 1067-1084. Existing encode/import already serialized/parsed those fields. Strong assertion was retained. Affected project target rebuild 61190 and actual executable both exited 0; all four relevant core executables finally passed.

Official serial build 62636 exited 0. Actual --workspace-check --named-workspace-only --symmetry-linked-offset-only UI process 38304 exited 0. It covers ordinary pressed rotational outline translation with unchanged raster pixels/history during preview, selection commit/Undo/Redo/Escape; real linked-raster-document Paint pointer move/copy/cancel and unrelated storage/metadata; actual offset H menu and ShiftV with full local-cache and world-position assertions.

Provenance coverage 483 files exited 0, strict exited 1 and remains INCOMPLETE for known migration gaps. Scoped diff check exited 0. Source coverage is distinct from behavior equivalence. No fresh screenshot/DPI acceptance or full migration claim.

Evidence: native/build/symmetry-linked-offset-final-20261025.json. Formal executable SHA256 D8641F80DAC635EB6EE8BF2BD89514B44D90A2E5321FC86B48E6D53B133C0E20.


Original native/start-native.bat exited 0; formal PID 31920 Responding=True. No further checks or builds followed launch.
