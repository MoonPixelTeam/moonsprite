# Stroke, local tile preview and brush drag integration — 2026-10-22

This batch was integrated by one writer on dev, preserving existing workspace differences. All executable patches were retained in native/build. No branch, worktree, preview executable, commit or publish was created.

## Delivered behavior

Stroke is now a complete individual layer-style effect: default black/1px/outside/round/cardinal directions, size1–64, inside/outside/both, four kernels, eight independent directions, SmartHue with default darkness45, follow-opacity, RGBA and global effect visibility. The sampler ports actual row-major legacy kernels, nearest reference and lower-alpha tie resolution, fixed exterior occupancy and explicit source-opacity following, and the legacy whole-source inside behavior when follow-opacity is enabled. Mutation-sensitive compiled kernels are retained in a bounded worker-local cache.

The existing clipping stack now carries explicit request regions. Group children are rendered with the stroke neighborhood halo, then owner mask/effects are applied and the requested output is cropped. Child effect output bounds contribute to parent geometry. Leaves use masked world-source readers so outside strokes can appear beyond sparse cel bounds. Ordinary non-stroke fast paths remain. Onion and static PNG/project preview paths honor styles. Canvas export retains the existing canvas/selection/slice extent; it includes stroke pixels outside source bounds inside that extent.

Shared native style dialog adds stroke controls and color role, using existing PixelDialog/Picker/widgets. Metadata preview, off/cancel, single commit, no-op, undo/redo, copy/paste/duplicate signature, layer/group project JSON are reused. Other missing effects, including shadow/inner glow/style gradient-map/split, are still unavailable.

Tilemap shared-source shape/gradient preview now caches tileId references for the immutable gesture topology, visits changed source cells and old/new Hybrid raw cells without scanning the gap, and updates only affected references. Main and other-frame renderer caches repair the previously displayed plus latest footprint. Masks/groups/any visible style use full fallback. At most256 regions are retained before bounds merging. Initial Timeline display copy and commit all-state rebuilding remain existing gaps; this is a native cache adaptation, not a claim that legacy already had this index.

Brush library adds 4 logical pixel capture drag, selected resource group order from base library, before/after/blank-end reorder, child/parent folder targets, persistence via existing library functions, and shared TooltipManager titles. Escape, focus/capture loss, disable/hide/resize cancel. Native moveGroup preflights all destination PNG/metadata paths and uses reverse rollback after runtime move failure. Failed Editor move preserves source files, selection and active pencil/fill brush. Project resources are not draggable. Spatial panning and external file drop remain missing.

## Validation

- Serial Release build and focused repair build: exit0; official executable path native/build/Release/moonsprite-native.exe.
- layer-group-compositor-tests: exit0. The oracle directly executes actual legacy layer-styles.ts/outline-settings.ts using Node type stripping; 864 combinations of kernels, positions, eight directions/presets and smart/opacity settings compare both leaf and group output. Negative world positions and alpha ties included. Independent130-row fixture checks full versus per-row rendering across128-row tiles, mask, opacity and clipping.
- tilemap-project-tests: exit0, including stroke preview/cancel/history/no-op, complete fields including64px saved/reopened, group codec and actual PNG pixels beyond the source rectangle.
- tilemap-document-tests: exit0 after the Hybrid loop correction.
- pattern-brush-library-tests: exit0, including group order/reopen and metadata conflict preserving both source files.
- canvas-performance-tests --tilemap-preview: exit0. Only the dedicated small path was run, not benchmarks. Actual main and other-frame surface pixels match complete composites after move/shrink/cancel/skipped updates; changed uploads are <=32 pixels per step in the fixture. Preview preserves authority/history.
- Official app --color-overlay-check: final exit0, now includes actual stroke input Change/dropdown callbacks and apply.
- Official app --tileset-management-check: final exit0.
- Official app --brush-library-panel-check: exit0, includes real panel threshold/cancellation/multi-drag and failed Editor folder move preserving selection/source.
- Provenance coverage469 files: normal exit0; strict exit1 while known migration gaps remain.

Initial failures were repaired and retained in logs: fixture loading used a Windows narrow Chinese path (corrected to u8path); a raw-cell lambda-to-loop conversion needed continue; new UI smoke text assignment needed its actual Change callback. Production pixel oracle passed after fixture loading was corrected. Build and test logs use native/build/integration-stroke-local-drag-*20261022.log. Old failed smoke error files are retained as evidence; they are not current status.

Source/spec review, automated pixel and actual UI command checks were performed. No manual screenshot acceptance or full legacy migration equivalence is claimed. Official program is reopened through native/start-native.bat after validation.
Final executable: 18021376 bytes; SHA256 8C3F3A488A5041C227192678ADD62E21875AD645277B9066B1AE198E50950808.
