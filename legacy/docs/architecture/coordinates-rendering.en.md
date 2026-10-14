# Coordinates and Rendering Contract

[中文](coordinates-rendering.md) | English

## Coordinate Spaces

- Screen coordinates: CSS pixels from window pointer events.
- Viewport coordinates: CSS pixels inside the canvas workspace before application pan.
- Canvas coordinates: document pixel coordinates affected by zoom and view rotation.
- Layer coordinates: canvas coordinates minus layer offset, and may exist outside canvas bounds.

Conversion order is fixed:

```text
screen -> viewport -> inverse view rotation -> canvas -> layer
layer -> canvas -> view rotation -> viewport -> screen
```

## Invariants

- Every tool, selection, preview, color pick, and pointer hit test reuses the same conversion functions.
- View-rotation geometry uses either the “near pointer” or canvas-center mode. “Near pointer” fixes a target marker when rotation begins and uses it as the center. Canvas-center mode continues using the panned canvas center. The marker remains inside the viewport and does not drift with the pointer during rotation.
- Zoom occurs around an explicit anchor. Switching to the hand or rotation tool must not make the view snap back.
- Main-canvas pan uses one `50%` boundary at every zoom level. When the canvas is larger than the viewport, each edge may move at most to the viewport center. When it is smaller, each edge may move out by at most half of its own extent. Rotation and mirroring limits use the final displayed bounding box.
- View mirroring applies only to final rendering of the main canvas and selection overlay and must take effect immediately even at zero rotation. Input first inverts rotation and then mirroring, so drawing, selections, color picking, pan, and zoom still land where the user sees them without changing document pixels. Horizontal and vertical mirroring can be combined independently.
- Tiled preview first reuses the shared screen-to-canvas inverse transform, then applies positive modulo only on enabled horizontal or vertical axes. With preview off, coordinates remain identical. Visible duplicate offsets, the duplicate under the pointer, and input wrapping are calculated by shared geometry in `core/tilemap.ts`; components must not derive their own versions. Tool pixel, edge, and operation-line previews appear in every visible tiled copy; the pointer itself appears only once. During pointer capture, input continues wrapping beyond the outermost visible duplicate until release restores ordinary hit testing. Tilemap drag across a repeated boundary fills cells along the shortest cyclic grid path and must not draw a long line through the middle of the original canvas.
- The forward view-transform order is fixed as rotation around one pivot followed by horizontal and vertical mirroring. Zoom-anchor compensation reuses this order and must not swap matrix steps inside a component.
- Pixel writes use floored document coordinates. Selection handles, edges, and rotation-zone hit tests use continuous, unfloored document coordinates; they must not floor before checking screen distance. Input hit testing and preview share the same inverse view transform.
- Free-tile instance positions use integer pixel anchors local to the cel surface. Source integer offset and source pixel coordinates first rotate clockwise around that anchor in whole `90°` steps, then apply horizontal and vertical mirroring. Inverse hit testing applies the exact reverse order. Instance bounds, pixel compositing, hit testing, flash indication, and source editing all reuse the forward and inverse transforms in `core/free-tile.ts`. A non-square source swaps displayed width and height at `90°` or `270°`. Document hit testing first subtracts surface offset and then walks the instance array from back to front to select the topmost instance. Property transforms compensate the anchor so the visible bounding box's top-left corner does not jump.
- Free-tile placement origin is derived jointly from the pointer document pixel, source dynamic dimensions, source offset, and the same surface offset. It does not snap to a Tilemap grid and components do not maintain a second coordinate system. Instance-selection transforms keep the selection and controls in document coordinates. Only on entering shared-source editing does `core/free-tile-edit.ts` generate a temporary source raster for the current instance orientation, including transformed flip-axis coordinates. After source-result cropping, inverse transformation writes back into canonical source coordinates and source offset synchronizes every instance. Sibling instances do not create extra selection coordinates. Moving a layer or animation cel changes only surface offset. Cropping transparent source edges during source editing preserves existing visual anchors through source offset. Canvas or image resizing delegates source and instance remapping and derived-surface regeneration to the core free-tile module.
- Canvas rotation must not create internal pixel outlines, white lines, or tile seams.
- Adjacent document pixels in high-DPI tool previews share the same device-pixel boundary. Rectangle boundaries align to `devicePixelRatio` before converting back to CSS coordinates. When drawing a rotated offscreen canvas, use actual backing dimensions divided by DPR; do not squeeze rounded-up device pixels back into theoretical CSS dimensions.
- The main canvas logical viewport uses device-pixel units after compensating for interface scale. CSS viewport dimensions and pointer coordinates are multiplied by the interface scale, while Canvas backing ratio uses browser `devicePixelRatio / interface scale`. Interface scale therefore never enters document zoom semantics: canvas `100%` always maps one document pixel to one device pixel. Pan, rotation, zoom anchors, selection hit testing, and auto-pan share the same compensation.
- Selection borders and transform handles are drawn in screen pixels, remain crisp under zoom, and are not composited into pixel layers. Selection borders use a fixed `1 CSS px` width and alternating `6 CSS px` light/dark intervals. Short boundary segments offset animation phase by screen position so a large canvas at low zoom does not flash in sync or become thinner with canvas zoom.
- Canvas lower-left size and mirror indicators share one foreground color. Choose dark or light according to composited pixels, transparency checkerboard, or workspace background underneath the indicator. The indicator never changes document pixels.
- The Curves editor histogram is calculated only from the active-layer snapshot captured when adjustment begins. It is a translucent editing aid and does not enter the document or adjustment result.

## Rendering Layers

Recommended order: background, canvas boundary, composited pixels, grids, selection preview, transform preview, tool preview, pointer aids. Each layer controls its own update frequency. Pan and zoom do not recompute unchanged pixel data.

- `core/canvas-render-plan.ts` centrally calculates visible range after inverse rotation and horizontal or vertical mirroring, offscreen scene bounds, canvas origin, and visible document pixels. Components must not copy these calculations. When a mirror pivot is away from viewport center, the offscreen scene still covers the complete mirrored viewport.
- Canvas-size preview always draws in this order: checkerboard for the new area, layer content, black mask outside the old canvas, boundary line. Pixels that were outside the old canvas remain visible while the newly added canvas area is clearly identified.
- `CanvasStage` caches draw dimensions from `ResizeObserver`. A Canvas element's CSS display dimensions remain fixed to the CSS pixel dimensions used by the last real draw until the next draw updates them. During split-view or floating-window resize, an old backing bitmap must not be stretched non-uniformly. Pointer hit testing still reads live screen bounds so docking changes do not invalidate coordinates.
- `CanvasCompositeCache` always presents one continuous final surface. It must not scale separate 128 px tiles and submit them independently to the main canvas. Small and medium documents reuse a complete surface with dirty-rectangle updates. Documents beyond the complete-surface limit first composite the currently visible document region into one temporary surface and output it with one `drawImage`.
- Every visible tiled-preview duplicate reuses the same document composite cache and changes only canvas origin and visible document range. Checkerboard, onion skin, pixel grid, and custom grid use the same clipping bounds for each duplicate. Temporary compositing for selection transforms and layer moves produces document-width and document-height periodic offsets on enabled axes so out-of-bounds content appears in adjacent duplicates. Repeated display must not copy document pixels or create additional history state.
- Fractional zoom, continuous drawing, and translucent layers all use the same continuous-surface path. Internal cache tiling is allowed as a computation strategy but never becomes a final display boundary and never composites translucent pixels twice at tile adjacency.
- Free tiles composite source tiles onto a continuous cel surface in instance order, honoring each instance's rotation, mirroring, blend mode, and opacity. Transparent pixels do not cover lower instances. After a source changes, every cel referencing it is redrawn and existing composite caches display the result. Main canvas, preview, thumbnails, and export must not interpret instance metadata independently.
- Canvas performance probes are inactive by default. Main-draw and pointer-processing timings are recorded only when automated benchmarks inject `window.__moonSpriteCanvasProbe`.

Every coordinate bug fix should test five cases: unrotated, rotated, different zoom levels, layer offsets, and content outside the canvas.
