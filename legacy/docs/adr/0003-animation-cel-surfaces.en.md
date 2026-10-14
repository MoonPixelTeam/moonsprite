# 0003: Synchronize the Active Layer Surface with Animation Cel Pixels

[中文](0003-animation-cel-surfaces.md) | English

Status: Accepted

## Context

MoonSprite's canvas, pixel tools, and composition hot paths read and write `RasterLayer` directly. Requiring every access to query the timeline and cel after animation support would widen a high-frequency path, add branches, and force canvas components to understand the file model. Replacing layer pixels only when changing frames, however, would let older undo records modify the wrong active frame.

## Decision

Keep layer identity and cross-frame properties in `RasterLayer`. Each cel independently stores pixels, bitmap dimensions, and offsets; the active frame's `RasterLayer` editing surface references the matching cel pixel array. Centralize all frame switching, synchronization, and layer/cel reconciliation in `core/animation.ts`.

Pixel history records `frameId` when committed, so undo and redo can target the original cel surface directly. When that frame is visible, the active layer surface is synchronized as well. Playback and frame switching do not enter document history; frame structure and duration do.

## Consequences

- The canvas and pixel tools retain the existing direct layer-access performance.
- Frames own independent pixels, dimensions, and offsets without copying the entire document when switching frames.
- The left side of the layer panel continues to manage stable layer identity, while the right side integrates frame columns and cel slots. Both sides share row alignment, but `core/animation.ts` remains the owner of animation state.
- Every core operation that replaces layer pixels or geometry must synchronize the active cel when it finishes; components must not maintain private copies.

## Alternatives

Resolving each pixel access through `(layerId, frameId)` would pollute high-frequency drawing and composition APIs. Copying a complete `SpriteDocument` for every frame would break layer identity and structural operations. Both alternatives were rejected.
