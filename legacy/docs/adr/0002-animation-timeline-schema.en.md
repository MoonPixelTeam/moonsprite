# 0002: Separate the Animation Timeline from Static Layer Data

[中文](0002-animation-timeline-schema.md) | English

Status: Accepted

## Context

MoonSprite currently centers on single pixel-art images, but must eventually support frame animation comparable to Aseprite. Existing layer pixels are stored directly under `layers/`. Adding frames and cel pixels directly to layer objects would tightly couple layer-tree ordering, the timeline, file format, and rendering cache.

## Decision

Upgrade `.moonsprite` to schema v2. Add independent animation-timeline metadata to the document: frames, frame durations, the active frame, loop state, and stable cel associations to layers and frames.

Existing `layers/` resources continue to represent only static layer bitmaps. When animation editing is implemented, actual cel bitmaps will be written to separate files; static layer files must not be overwritten or reused as multi-frame data containers. Migrate v1 projects to v2 projects with one default frame, and continue to reject future versions strictly.

## Consequences

- The layer panel, layer order, and layer groups do not depend on timeline state.
- The timeline can be implemented as an independent panel, with separate playback and onion-skin caches.
- Animation UI is not exposed at this stage, so users do not see a partially editable feature.
- Adding cel pixel files later requires another ADR, migration, and format regression tests.

## Alternatives

Copying each frame into an independent `SpriteDocument` would destabilize layer identity, inflate file size, and duplicate layer operations, undo, and import logic, so it was rejected.
