# 0017: Share Project Tilesets Across Tilemap Layers

[中文](0017-shared-tilemap-tilesets.md) | English

## Status

Accepted

## Context

When creating a Tilemap layer, users need to reuse a Tileset already in the project without copying its tile resources. The existing implementation already uses a stable `tilesetId` reference, but the UI always created a new resource and name synchronization treated each Tileset as the property of one layer.

## Decision

- The New Tilemap Layer dialog selects a new Tileset by default and can instead select an existing Tilemap Tileset from the current project.
- When an existing Tileset is selected, the layer grid adopts its `tileWidth` and `tileHeight`. Creation adds only an empty Tilemap cel and does not copy the Tileset.
- Multiple Tilemap layers may share one Tileset. Existing Tileset domain commands redraw every reference when shared Tileset pixels, slots, or tile references change.
- The one-tile Tileset owned by a free-tile source remains exclusive and cannot be selected through the Tilemap creator.
- A shared Tileset does not follow the name of any individual layer. The old name-synchronization behavior remains only when there is exactly one Tilemap owner. Deleting a referencing layer removes the Tileset only when no other owner or cell reference remains.
- This relationship uses the existing `tilemapTilesetId` field and does not increase the project schema version. Older project formats continue to use the existing validation rules.

## Consequences

Tilemap layers can share one editable tile resource, reducing duplicated data while preserving existing undo, project save, tile preview, and reference-redraw paths. Free-tile source ownership boundaries remain unchanged.
