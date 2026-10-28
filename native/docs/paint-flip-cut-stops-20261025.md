# Paint flip / static Cut / gradient stop activation — 2026-10-25

GradientStopsEditor.tsx:183 actual stop left double click selects stop and activates existing ColorValueControl. Native GradientStopsTrack exact drawn stop bounds and activateColor callback reuse owned ColorEditorPopup, existing sampling and pending transaction lifecycle. Blank ramp/right double click leave state unchanged; no new stop, pixels or history.

Paint selected-cell H/V flip uses actual candidate object-spread mapping, touched cells and only mirrored selected destinations. Existing cell-only history/cache apply; tileset unchanged; mask flips but remains through cell Undo/Redo exactly as legacy. Native single canonical fullCanvas visible unlocked target admission retained as explicit migration gap; no-selection/multi-target/abnormal layouts remain gaps. 90/180 legacy denies tilemap.

Static Paint Cut copies RGBA first, clears selection/UI/other clipboard payloads but retains cells/tileset/pixels/history because Paint pixel edits refuse. Cut and Delete show the original rasterization message on the same unlocked content-intersecting edit path; Delete retains selection. Locked/empty cases produce no rasterization message. Existing canonical single-target Cut gate retained; unsupported layouts/multitarget not newly migrated.

Core build 76556 exit 0; tilemap-document, tilemap-project and document-raster-history actual executable exits all 0. Official serial build 39403 and targeted rebuilds 86795/51427/81909 exited 0. Final actual UI process 8736 exited 0 for --paint-flip-cut-stops-only. It covers actual menu/ShiftV, clipboard shortcuts/menu and original messages, exact mirror pixels/cache/resources, selection UI cleanup, left double-click/stop switch/right and blank-track behavior, ordinary and pending-gradient lifecycle.

Two UI fixture corrections followed failed actual processes 17780 and 11980: equivalent orientation uses legacy candidate preference rather than requiring one raw flip flag; no-selection UI gate checks actual menu item availability rather than command binding default. Production candidate mapping remains unchanged. Paint Cut message was completed after checking clipboard -> deleteSelection -> commitPixelEdit actual source.

Provenance coverage 483 files exit 0, strict exit 1 remains INCOMPLETE; scoped diff check exit 0. No manual screenshot acceptance in this batch. Source coverage, programmatic UI acceptance and screenshot review remain separate; no full migration claim.

Final evidence: native/build/paint-flip-cut-stops-final-20261025.json. Formal executable SHA256 725305F63A4E8DDA0628716FEA2280B2141E6635F5EFD17E71EB58CE63E7B753.

Original BAT restart exited 0; formal process 33248 Responding=True. No further builds or checks followed.
