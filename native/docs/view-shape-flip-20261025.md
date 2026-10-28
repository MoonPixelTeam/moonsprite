# View-aligned shapes / padded Paint flip / hidden locked flip — 2026-10-25

Rectangle/ellipse geometric creation captures legacy viewAlignedShapeAngle including reflection parity, inverse-rotates pointer displacement then JS-rounds local distances, derives existing ratio/center bounds and rotates pixel centers back. Existing Alt rotation/resize, fixed drawing anchor and shape sampler/transaction reused. No selection/repeat migration claim.

Paint H/V selected-cell flip now admits origin-zero full-grid cache padding beyond document size, preserves complete invisible cell texels/cache dimensions and source sheet. Discrete flip uses actual legacy hidden/locked branch preceding raster permission checks; layer flags unchanged through cell Undo/Redo. Named discreteFlip policy is true only for flip availability/command; movement retains prior fullCanvas/visible/unlocked gates. Offset/link/multitarget/free-tile remain existing gaps. No changes to mirror candidate or mask history semantics.

Validation: core build 96355 exit 0. Actual moon-core, tilemap-document, tilemap-project and document-raster-history executable exits all 0. Project fixture target rebuild 91206 exit 0. Official serial build 63552 and final smoke-only increment 21224 exited 0. Final actual UI process 32964 exited 0 for --view-shape-flip-only, covering representative view reflection parity/four geometric tools, Ctrl/Shift, exact preview commit/Undo/Redo, drawing-anchor cancel, padded complete cells, hidden/locked menu/ShiftV and unchanged movement gates.

Fixture corrections: first project run exited 1 because synthetic imported document supplied an empty non-null source archive; changed only fixture to real seed ZIP and matching project identity. First UI 16404 exited 1 because preview was captured before scheduled tick; fixture now runs existing shapeTick before asserting exact commit. Production IO and input behavior were not altered for these failures.

Provenance coverage 483 files exit 0; strict exit 1 remains INCOMPLETE. Scoped diff check exit 0. No fresh screenshot/DPI acceptance. Source coverage is separate from actual runtime and screenshot acceptance; no full migration claim.

Final evidence: native/build/view-shape-flip-final-20261025.json. Formal executable SHA256 111498F45A30496AD1B48585F7EA8EC5EE3E29965111433BAB7F67A3EBBBD509.

Original BAT launch exited 0; formal PID 36960 Responding=True. No further checks or builds followed.
