# ADR-0012: Non-Destructive Layer Styles

[中文](0012-non-destructive-layer-styles.zh-CN.md) | English

## Status

Accepted

## Context

Stroke, shadow, inner glow, color overlay, and gradient overlay must remain editable across animation frames without rewriting cel pixels. MoonSprite already treats layer opacity, blending, masks, clipping, and color modes as compositor concerns, while the project format stores cel surfaces separately from shared layer metadata.

## Decision

- Project schema v11 stores an optional normalized `layerStyles` object on raster layers and layer groups. A layer property is shared by every frame of that layer, while a group property is shared by the group's per-frame composite; individual cels do not own independent layer styles.
- The compositor evaluates styles after the owner's layer or group mask. Shadow and outside stroke form the backdrop, then color overlay, gradient overlay, inner glow, and any inside stroke modify visible source content before owner opacity, blend mode, and clipping are applied. Stroke position can be inside, outside, or both; stroke kernels and eight-direction filters reuse the same normalized outline geometry as the destructive Outline command. Smart Hue resolves each outside stroke pixel from the nearest visible source pixel and each inside stroke pixel from the current visible source, then uniformly darkens RGB channels so hue is preserved. Smart Shadow expresses the darkness coefficient as a black alpha overlay; normal compositing therefore scales every live background RGB channel uniformly and follows background changes without persisting a sampled color.
- Gradient overlays reuse the Gradient tool's pure color interpolation and dithering core, including the same smooth, Bayer, and directional modes. UI selectors and pixel previews are shared rather than maintaining a separate layer-style mode list.
- Indexed and grayscale documents resolve stored and dynamically generated style colors through the same document-color rules used by normal canvas writes. Style evaluation never adds indexed palette entries or mutates source raster data.
- Dialog changes use a reversible preview path that refreshes derived compositing without dirtying the document or adding history. Applying restores the original baseline and commits the final settings as one undoable content operation; canceling restores the baseline.
- Layer and group rows with enabled effects show a style indicator that reopens the dialog. Layer/group duplication, internal layer clipboard operations, animation previews, and project encoding deep-copy style settings. Schema v1-v10 projects migrate without styles and do not interpret unknown draft fields as v11 data.
- Interactive canvas invalidation expands edited source regions through the owner's effects and every styled ancestor group, so drawing previews update the complete affected output without forcing an unrelated full-canvas redraw.

## Consequences

One style edit updates every animation frame while cel pixels remain independently editable. Styled layers and groups leave the ordinary compositor fast path and require style-aware composition for affected output. Rasterizing a text-only layer drops editable text while retaining its existing raster surfaces and masks. Rasterizing a styled layer bakes each frame's current style and mask result into independent cel pixels, removes those editable properties, and remains a single undoable operation.

## Alternatives

Baking effects into every cel by default was rejected because it destroys editability, multiplies history and storage cost, and makes later parameter changes inconsistent across frames. Storing styles per cel was rejected because the user-facing feature belongs to the layer or group and should follow other shared owner properties. Representing each effect as hidden helper layers was rejected because it would complicate ordering, clipping, masks, and project structure.
