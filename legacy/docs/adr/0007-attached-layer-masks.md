# ADR-0007: Per-Frame Editable Layer and Group Masks

[中文](0007-attached-layer-masks.zh-CN.md) | English

## Status

Accepted

## Context

MoonSprite stores animation pixels in frame-specific cels. A mask must follow the
same frame ownership, remain independently editable, preserve an initially empty
surface, and reuse the existing raster tools without becoming a normal layer in
the layer tree.

## Decision

- Attach an optional mask surface to each animation cel. Layer groups use a
  frame-specific `groupMasks` entry so their masks can vary without becoming
  ordinary layers. Cel and group context menus create or delete their masks.
- Reuse the RGBA raster pipeline, but normalize painted pixels to opaque
  grayscale. Transparent pixels mean "unpainted" and are neutral during
  compositing; white reveals, black hides, and gray scales source alpha.
- Persist the complete grayscale-plus-transparency surface under `masks/` in
  project schema v4. The reader also accepts the earlier one-byte gray draft as
  an opaque mask for development compatibility.
- Keep the active mask ID in document-session state. Pixel history records the
  owning cel frame ID, so invalidation and undo target only that frame.
- Frame and layer duplication clone each cel mask independently with a new mask
  ID. A mask may independently reference another mask through `linkedMaskId`;
  cel linking creates the corresponding mask links, while mask-only link,
  unlink, copy, paste, and move operations never change the image cel surface.

## Consequences

Paint, fill, shape, selection transform, and pixel history can edit masks through
the shared active-paint-surface resolver. Switching frames exits mask editing.
The timeline keeps the original cel or group row and inserts a dedicated mask
track directly above it. Mask-track cells use the same marker size and spacing
as normal cels. Project
readers reject missing, duplicate, or malformed mask assets.

## Alternatives

Static masks on layers or groups were rejected because they cannot vary by frame.
Representing masks as ordinary layers was rejected because it would expose them
to layer ordering, grouping, blending, and export semantics that do not apply.
