# 0015: Separate Tilemap Source Data from the Tiled View

[中文](0015-tilemap-source-and-tiled-view.md) | English

## Status

Accepted

## Context

MoonSprite must support two related workflows with different semantics. One repeats a normal canvas horizontally, vertically, or on both axes and allows editing through the copies. The other stores stable tile references in a Tilemap layer that can be painted cell by cell. The first must not change project content; the second must participate in animation, undo, copy/paste, and file persistence. Existing composition, thumbnail, and export pipelines understand only raster surfaces, so a new rendering branch cannot bypass them.

## Decision

- A project-level `Tileset` stores a stable ID, tile dimensions, stable IDs for each tile, one compact RGBA atlas, and an independent nullable `tileSlots` panel layout. Moving tiles in the panel does not rearrange pixels or change canvas references.
- Tilemap layers use `layer.kind = "tilemap"`. Each animation cel's `tilemap.cells` stores stable tile references and retains `surface` as a derived raster cache.
- Creating a Tilemap accepts only tile width and height. It starts empty with one transparent first tile. The session provides Variant Creation, Original Editing, and Mixed Editing modes: creation deduplicates exact final pixels before writing to the Tileset, painting replaces a complete cell reference, and editing updates an existing tile and redraws every reference.
- Tile editing changes the Tileset or cell source data first, then redraws the cache locally. One pointer stroke creates one custom history entry. A stroke that changes the Tileset stores before/after Tileset snapshots and cell differences in the same transaction, so undo and redo restore source data and cache together without triggering ordinary pixel-edit synchronization.
- `.moonsprite` v13 stores the Tileset atlas and a sparse list of non-empty cells. Reading strictly validates IDs, dimensions, resource lengths, and references, then regenerates Tilemap surfaces from source data.
- Cross-document layer paste copies the required Tileset and remaps its ID. Copies within the same document continue to share the existing Tileset. Rasterization removes only Tilemap source data and preserves the current surface.
- Tiled preview is stored in `ViewState.tileRepeatMode`. It only controls visible copies and input-coordinate wrapping; it is not written to the project, does not change dirty state, and does not enter undo history. Repeat offsets and wrapping are centralized in `core/tilemap.ts`.

## Consequences

- Existing composition, layer styles, thumbnails, and export can continue to treat a Tilemap as an ordinary raster surface.
- Tilemap source data remains editable across frames, undo, save, and clipboard operations without mixing view repetition into the document.
- Tilemap editing must keep source data and cache consistent. Any pixel operation that writes directly to a Tilemap surface must be rejected or explicitly rasterize it first.
- v13 files store a Tileset atlas and cell metadata in addition to pure raster data, but use a sparse manifest for non-empty cells, so blank Tilemaps do not inflate the manifest with complete cell arrays.

## Alternatives

- Only provide a repeated-canvas preview: this cannot save reusable tiles, support cell editing, or share Tilesets across projects.
- Expand Tilemaps only at render time: composition, thumbnails, layer styles, and export would need a second rendering path.
- Permanently rasterize after every stroke: implementation is simple, but stable tile references are lost and the layer can no longer be edited as a Tilemap.
