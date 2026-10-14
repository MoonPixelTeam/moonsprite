# 0016: Separate the Free-Tile Source Library from Arbitrarily Positioned Instances

[中文](0016-free-tile-source-and-instances.md) | English

> This records the v15 design. Source ownership was later extended to shared sets in [ADR 0022](0022-shared-free-tile-sets.md). The current instance UI can be a separate panel or an in-layer-panel view; see the [workspace contract](../interactions/workspace-docking.en.md).

## Status

Accepted

## Context

Tilemaps store tile references in fixed cells and cannot represent reusable objects that overlap or sit at arbitrary pixel positions. Free tiles still need every reference to update when the source changes, while continuing to support existing layer properties, animation, composition, thumbnails, export, undo, and project persistence.

## Decision

- Free-tile layers use `layer.kind = "free-tile"` and store multiple stable sources in `freeTileSources`. Each source exclusively owns a one-tile Tileset. Source size follows actual drawn content and is not preset when the layer is created. A source also stores layer-like name, description, display color, visibility, lock state, opacity, blend mode, and integer offset.
- Every non-linked source cel uses `FreeTileCelData.instances` to store stable instance IDs ordered back to front, a `sourceId`, an integer pixel anchor in cel-surface coordinates, and optional whole-`90°` rotation, horizontal/vertical mirroring, visibility, lock state, opacity, and blend mode. Instances have no grid, do not store arbitrary-angle rotation or scaling, may overlap, and may extend outside the canvas. Instance transforms do not rewrite shared source pixels.
- The cel `surface` is a raster cache generated from source tiles and the instance list. Ordinary composition, layer styles, preview, thumbnails, and export read only this cache and do not interpret instances directly.
- Place and erase gestures use minimal before/after snapshots of the instance list and commit only one history entry. Source editing reuses ordinary brush algorithms inside an isolated temporary raster with transparent expansion space. During preview, the source is cropped to non-transparent content and every reference is redrawn. Confirmation commits one history entry with before/after snapshots of source dimensions, pixels, and offset; cancellation restores the baseline. The first stroke on an unplaced source also creates one instance, and both changes must be merged into one history entry.
- Ordinary Tilemaps and free tiles share the Tileset panel, which switches source pages according to the active layer. Creating a free-tile layer automatically creates a transparent source and enters source editing; other sources are added explicitly through a panel button. The icon on the right of a free-tile layer opens that layer's dedicated "instance layers" subview. Instance rows live in the Layers panel and reuse ordinary layer selection, visibility, lock, properties, sorting, and deletion interactions. Eye and lock controls further reuse the same `Alt` batch behavior and press-and-drag gesture across rows. Instance selection belongs to session state, while deletion, movement, and transformation still commit through Store domain commands.
- `.moonsprite` v15 stores `freeTileSources` and the instance list for each non-linked source cel. Reading validates unique source and instance IDs, valid `sourceId` values, bounded coordinates, legal rotation and mirror fields, and unique ownership of each Tileset, then regenerates surfaces from source data and instance transforms. The v14 multi-tile source library under one `freeTileTilesetId` is split into independent v15 sources and its instances are remapped during migration.
- Canvas-size changes remap instances and surface offsets; cropping removes only instances entirely outside the new canvas. Image-size changes scale every source tile, source offset, instance document coordinate, and derived surface, with one history snapshot restoring all of them.

## Consequences

- Users can move and configure a free-tile layer like an ordinary layer while reusing and overlapping the same source tile at arbitrary pixel positions.
- Editing one source tile reliably updates every reference across every frame of the current layer without duplicating pixels into each instance.
- Every path that changes free-tile content must update source data before rebuilding the cache. Treating a free-tile surface as an ordinary writable raster breaks editability and must be rejected or explicitly converted to a normal layer.
- Copying or pasting a free-tile layer across documents must copy every source Tileset, generate new source IDs, and remap all instances. Two layers must never share one source or Tileset.

## Alternatives

- Reuse Tilemap cells: arbitrary overlap is impossible and every position is forced onto a fixed grid.
- Store complete pixels in every instance: source editing cannot synchronize naturally, and project/history size grows linearly with instance count.
- Traverse instances at render time without retaining a surface: composition, layer styles, thumbnails, and export would need a second rendering path.
