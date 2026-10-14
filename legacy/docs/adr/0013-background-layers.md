# ADR-0013: Editable Background Layers

[中文](0013-background-layers.zh-CN.md) | English

## Status

Accepted

## Context

Background artwork must remain editable while behaving differently from ordinary raster layers in two places: color sampling from foreground work must treat it as transparent, and canvas enlargement must repeat its previous visible canvas instead of exposing empty space. The same behavior has to survive animation frame changes, undo, and project reopen without introducing a second compositor or a procedural-only layer type.

## Decision

- Project schema v12 stores optional normalized `background` metadata on raster layers. `mode: "preset"` also records one of the built-in pattern identifiers; `mode: "canvas"` marks a converted layer. The raster and animation cel surfaces remain the editable source of truth.
- Built-in solid and patterned presets are generated as integer-pixel RGBA or indexed tiles and materialized to the current canvas. In indexed documents, their gray colors are added to the visible palette so the pattern cannot collapse to one nearest color. New preset layers are inserted at the root bottom and their existing animation cels are linked to one shared preset surface.
- Expanding either canvas dimension repeats the old visible canvas at the resize anchor phase into the new canvas for every background cel, including inactive frames. This is a one-time raster operation for each resize; later edits modify ordinary pixels. Reducing a canvas keeps the existing independent-layer behavior until a later expansion samples the then-visible old canvas.
- Composite color sampling receives the active layer ID. When an ordinary layer is active, all background layers are omitted from the sampling document, preserving foreground alpha; when a background layer is active, normal full-document sampling applies. Rendering and export always include background layers normally.
- Conversion only changes shared layer metadata and leaves pixels, offsets, animation cels, masks, styles, and ordering intact. Text layers cannot convert directly because their source remains non-raster-editable. New, convert, and resize operations are undoable document edits.
- Schema v1-v11 projects migrate without background metadata. Unknown same-named fields in older versions and invalid v12 settings are discarded. Internal layer clipboard operations preserve a deep copy of valid background metadata.

## Consequences

Background layers use the existing raster compositor and editing tools, so they need no separate rendering path. Canvas enlargement allocates a target-sized raster for each unique background cel surface and can therefore be expensive on very large animated documents; linked preset cels avoid multiplying that cost. Foreground eyedropper results no longer depend on decorative background colors, including when foreground pixels are translucent.

## Alternatives

A procedural infinite pattern layer was rejected because converted artwork and later pixel edits would not have one consistent source of truth. Hiding backgrounds in the main compositor was rejected because they must remain visible in editing and export. Applying the sampling rule only to fully opaque foreground pixels was rejected because it would still contaminate translucent sampled colors.
