import { describe, expect, it } from 'vitest'
import { ensureAnimationDocument, refreshActiveAnimationFrame, resizeAnimationCelsAt } from './animation'
import { captureDocumentImageResizeSnapshot, createDocument, getActiveLayer, readLayerColorAt, resizeDocumentAt, resizeDocumentImage, restoreDocumentImageResizeSnapshot } from './document'
import { applyFreeTileSourceSnapshot, captureFreeTileImageResizeState, rasterSurfaceToFreeTileStamps, resizeFreeTileDocumentImage } from './free-tile-document'
import { createFreeTileSourceEditRaster, freeTileSelectionForInstanceEdit, freeTileSelectionToEditRaster, freeTileSourceSnapshotFromEditRaster, freeTileTransformTargetToEditRaster, selectionCoversRect } from './free-tile-edit'
import { revertPixelEdit } from './history'
import { createBlankTileset, createSolidTileset, readTilesetTilePixels, writeTilesetTilePixels } from './tilemap'
import { freeTileCelDataEqual, freeTileInstanceAtPoint, freeTileInstanceBounds, freeTileInstanceForSource, freeTileInstancesForSource, freeTileSourceEditTargetAtPoint, freeTileSourceHasVisiblePixels, freeTileSourcePointForInstance, freeTileSourceRefs, normalizeFreeTileCelData, renderFreeTileSurface } from './free-tile'
import { applySelectionTransform, applySelectionTranslationPreview, captureSelectionTransform } from './tools'

const createFreeTileDocument = (
  width: number,
  height: number,
  instances: Array<{ id: string; tileId: string; x: number; y: number }>
) => {
  const document = createDocument('Free Tile', width, height, 'rgba')
  const layer = getActiveLayer(document)
  const cel = ensureAnimationDocument(document).cels[0]
  const tileset = createSolidTileset('free-tileset', 'Free Tiles', 2, 2, { r: 255, g: 0, b: 0, a: 255 }, 'tile')
  const sourceId = 'source'
  document.tilesets = [tileset]
  layer.kind = 'free-tile'
  layer.freeTileSources = [{ id: sourceId, name: 'Free Tiles', tilesetId: tileset.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
  cel.freeTiles = { instances: instances.map((instance) => ({ id: instance.id, sourceId, x: instance.x, y: instance.y })) }
  cel.surface = renderFreeTileSurface(cel.freeTiles, freeTileSourceRefs(layer.freeTileSources, document.tilesets), document.colorMode, width, height)
  refreshActiveAnimationFrame(document)
  return { document, layer, cel, tileset }
}

describe('free tile core', () => {
  it('converts indexed raster content into trimmed source chunks with canvas coordinates', () => {
    const pixels = new Uint32Array(258)
    pixels[0] = 1
    pixels[257] = 2

    const stamps = rasterSurfaceToFreeTileStamps({
      format: 'indexed',
      width: 258,
      height: 1,
      offsetX: 5,
      offsetY: 7,
      pixels
    }, [
      { id: 1, name: 'Red', color: { r: 220, g: 40, b: 60, a: 255 } },
      { id: 2, name: 'Blue', color: { r: 20, g: 80, b: 230, a: 255 } }
    ])

    expect(stamps.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: 5, y: 7, width: 1, height: 1 },
      { x: 262, y: 7, width: 1, height: 1 }
    ])
    expect(stamps[0].pixels).toEqual(new Uint8ClampedArray([220, 40, 60, 255]))
    expect(stamps[1].pixels).toEqual(new Uint8ClampedArray([20, 80, 230, 255]))
  })

  it('renders overlapping reusable tile instances in array order', () => {
    const red = createSolidTileset('tileset', 'Free Tiles', 2, 2, { r: 255, g: 0, b: 0, a: 255 }, 'red')
    red.tileIds.push('blue')
    red.rows = 1
    red.columns = 2
    red.pixels = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255,
      255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255
    ])
    const freeTiles = { instances: [
      { id: 'a', tileId: 'red', x: 0, y: 0 },
      { id: 'b', tileId: 'blue', x: 1, y: 0 }
    ] }

    const surface = renderFreeTileSurface(freeTiles, red, 'rgba', 4, 2)

    expect(surface.format).toBe('rgba')
    expect(Array.from(surface.pixels.slice(0, 16))).toEqual([
      255, 0, 0, 255,
      0, 0, 255, 255,
      0, 0, 255, 255,
      0, 0, 0, 0
    ])
    expect(freeTileInstanceAtPoint(freeTiles, red, 1, 0)?.id).toBe('b')
  })

  it('renders, bounds, and hit-tests non-square instance rotation without changing the source', () => {
    const tileset = createBlankTileset('rotated-source', 'Rotated Source', 2, 3, 'tile', 1)
    writeTilesetTilePixels(tileset, 'tile', new Uint8ClampedArray([
      10, 0, 0, 255, 20, 0, 0, 255,
      30, 0, 0, 255, 40, 0, 0, 255,
      50, 0, 0, 255, 60, 0, 0, 255
    ]))
    const sources = freeTileSourceRefs([{ id: 'source', name: 'Source', tilesetId: tileset.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }], [tileset])
    const instance = { id: 'rotated', sourceId: 'source', x: 3, y: 0, rotation: 1 as const }
    const freeTiles = { instances: [instance] }

    const surface = renderFreeTileSurface(freeTiles, sources, 'rgba', 3, 2)

    expect(freeTileInstanceBounds(instance, sources)).toEqual({ x: 0, y: 0, width: 3, height: 2 })
    expect(Array.from(surface.pixels.filter((_, index) => index % 4 === 0))).toEqual([50, 30, 10, 60, 40, 20])
    expect(freeTileInstanceAtPoint(freeTiles, sources, 0, 0)?.id).toBe('rotated')
    expect(freeTileSourcePointForInstance(instance, sources[0], 0, 0)).toEqual({ x: 0, y: 2 })
    expect(Array.from(readTilesetTilePixels(tileset, 'tile')!)).toEqual([
      10, 0, 0, 255, 20, 0, 0, 255,
      30, 0, 0, 255, 40, 0, 0, 255,
      50, 0, 0, 255, 60, 0, 0, 255
    ])
  })

  it('leaves lower instances visible through transparent placement pixels', () => {
    const bottom = createSolidTileset('bottom', 'Bottom', 2, 1, { r: 220, g: 30, b: 40, a: 255 }, 'bottom-tile')
    const top = createSolidTileset('top', 'Top', 2, 1, { r: 30, g: 40, b: 220, a: 255 }, 'top-tile')
    top.pixels[3] = 0
    top.pixels[0] = 30
    top.pixels[1] = 40
    top.pixels[2] = 220
    const sources = freeTileSourceRefs([
      { id: 'bottom-source', name: 'Bottom', tilesetId: bottom.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 },
      { id: 'top-source', name: 'Top', tilesetId: top.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }
    ], [bottom, top])
    const surface = renderFreeTileSurface({ instances: [
      { id: 'bottom-instance', sourceId: 'bottom-source', x: 0, y: 0 },
      { id: 'top-instance', sourceId: 'top-source', x: 0, y: 0 }
    ] }, sources, 'rgba', 2, 1)

    expect(Array.from(surface.pixels)).toEqual([220, 30, 40, 255, 30, 40, 220, 255])
  })



  it('rejects duplicate IDs and unknown source tiles in strict mode', () => {
    const tileset = createSolidTileset('tileset', 'Free Tiles', 1, 1, { r: 0, g: 0, b: 0, a: 255 }, 'tile')
    expect(normalizeFreeTileCelData({ instances: [
      { id: 'same', tileId: 'tile', x: 0, y: 0 },
      { id: 'same', tileId: 'tile', x: 1, y: 0 }
    ] }, tileset, true)).toBeNull()
    expect(normalizeFreeTileCelData({ instances: [{ id: 'a', tileId: 'missing', x: 0, y: 0 }] }, tileset, true)).toBeNull()
  })

  it('preserves instance visibility and lock state while normalizing', () => {
    const tileset = createSolidTileset('tileset', 'Free Tiles', 1, 1, { r: 0, g: 0, b: 0, a: 255 }, 'tile')
    const normalized = normalizeFreeTileCelData({ instances: [
      { id: 'hidden-locked', tileId: 'tile', x: 2, y: 3, visible: false, locked: true },
      { id: 'visible-unlocked', tileId: 'tile', x: 4, y: 5 }
    ] }, tileset, true)

    expect(normalized?.instances).toEqual([
      { id: 'hidden-locked', tileId: 'tile', x: 2, y: 3, visible: false, locked: true },
      { id: 'visible-unlocked', tileId: 'tile', x: 4, y: 5, visible: true, locked: false }
    ])
  })



  it('keeps an empty source anchored to an existing instance for the next edit', () => {
    const tileset = createBlankTileset('empty-tileset', 'Empty', 1, 1, 'tile', 1)
    const sourceId = 'source'
    const sources = freeTileSourceRefs([{ id: sourceId, name: 'Empty', tilesetId: tileset.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }], [tileset])
    const freeTiles = { instances: [{ id: 'instance', sourceId, x: 4, y: 6 }] }
    const source = sources[0]

    expect(source).toBeDefined()
    expect(freeTileSourceHasVisiblePixels(source)).toBe(false)
    expect(freeTileInstanceForSource(freeTiles, sources, sourceId)?.id).toBe('instance')
  })



  it('maps a selected instance transform through the shared source raster', () => {
    const document = createDocument('source selection transform', 12, 3, 'rgba')
    const layer = getActiveLayer(document)
    const cel = ensureAnimationDocument(document).cels[0]
    const tileset = createBlankTileset('source-tileset', 'Source', 2, 1, 'tile', 1)
    writeTilesetTilePixels(tileset, 'tile', new Uint8ClampedArray([
      220, 40, 60, 255,
      0, 0, 0, 0
    ]))
    document.tilesets = [tileset]
    layer.kind = 'free-tile'
    layer.freeTileSources = [{ id: 'source', name: 'Source', tilesetId: tileset.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
    cel.freeTiles = { instances: [
      { id: 'selected', sourceId: 'source', x: 1, y: 1 },
      { id: 'sibling', sourceId: 'source', x: 6, y: 1 }
    ] }
    const sources = freeTileSourceRefs(layer.freeTileSources, document.tilesets)
    cel.surface = renderFreeTileSurface(cel.freeTiles, sources, document.colorMode, document.width, document.height)
    refreshActiveAnimationFrame(document)

    const bounds = freeTileInstanceBounds(cel.freeTiles.instances[0], sources)
    const edit = createFreeTileSourceEditRaster(document, sources[0], bounds)!
    const localSelection = freeTileSelectionToEditRaster(edit, { x: 1, y: 1, width: 1, height: 1 })!
    const transformSource = captureSelectionTransform(edit.document, localSelection, edit.layer)!
    applySelectionTransform(
      edit.document,
      transformSource,
      freeTileTransformTargetToEditRaster(edit, { x: 2, y: 1, width: 1, height: 1 }),
      0,
      false,
      undefined,
      undefined,
      undefined,
      edit.layer
    )
    applyFreeTileSourceSnapshot(document, freeTileSourceSnapshotFromEditRaster(edit))

    expect(readLayerColorAt(document, layer, 1, 1).a).toBe(0)
    expect(readLayerColorAt(document, layer, 2, 1)).toEqual({ r: 220, g: 40, b: 60, a: 255 })
    expect(readLayerColorAt(document, layer, 6, 1).a).toBe(0)
    expect(readLayerColorAt(document, layer, 7, 1)).toEqual({ r: 220, g: 40, b: 60, a: 255 })
  })

  it('preserves transparent selection padding while recropping a moved source', () => {
    const document = createDocument('padded source selection tracking', 24, 16, 'rgba')
    const layer = getActiveLayer(document)
    const cel = ensureAnimationDocument(document).cels[0]
    const tileset = createBlankTileset('padded-tracking-source', 'Source', 8, 8, 'tile', 1)
    const pixels = new Uint8ClampedArray(8 * 8 * 4)
    const write = (x: number, y: number, color: [number, number, number, number]): void => pixels.set(color, (y * 8 + x) * 4)
    write(2, 2, [220, 40, 60, 255])
    write(3, 4, [220, 40, 60, 255])
    write(6, 0, [20, 80, 230, 255])
    writeTilesetTilePixels(tileset, 'tile', pixels)
    document.tilesets = [tileset]
    layer.kind = 'free-tile'
    layer.freeTileSources = [{ id: 'source', name: 'Source', tilesetId: tileset.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
    cel.freeTiles = { instances: [{ id: 'selected', sourceId: 'source', x: 8, y: 3 }] }
    cel.surface = renderFreeTileSurface(cel.freeTiles, freeTileSourceRefs(layer.freeTileSources, document.tilesets), document.colorMode, document.width, document.height)
    refreshActiveAnimationFrame(document)

    let selection = { x: 9, y: 4, width: 4, height: 5 }
    let observedCroppedPadding = false
    for (const target of [{ x: 2, y: 7 }, { x: 14, y: 5 }, { x: 4, y: 2 }]) {
      const sources = freeTileSourceRefs(layer.freeTileSources, document.tilesets)
      const bounds = freeTileInstanceBounds(cel.freeTiles.instances[0], sources)
      if (selection.x < bounds.x || selection.y < bounds.y
        || selection.x + selection.width > bounds.x + bounds.width
        || selection.y + selection.height > bounds.y + bounds.height) observedCroppedPadding = true
      const scopedSelection = freeTileSelectionForInstanceEdit(selection, bounds)
      expect(scopedSelection).toBe(selection)
      const edit = createFreeTileSourceEditRaster(document, sources[0], bounds)!
      const localSelection = freeTileSelectionToEditRaster(edit, scopedSelection)!
      const transformSource = captureSelectionTransform(edit.document, localSelection, edit.layer)!
      applySelectionTranslationPreview(
        edit.document,
        transformSource,
        freeTileTransformTargetToEditRaster(edit, { ...selection, ...target }),
        false,
        null,
        edit.layer
      )
      applyFreeTileSourceSnapshot(document, freeTileSourceSnapshotFromEditRaster(edit))
      selection = { ...selection, ...target }

      expect(readLayerColorAt(document, layer, target.x + 1, target.y + 1)).toEqual({ r: 220, g: 40, b: 60, a: 255 })
      expect(readLayerColorAt(document, layer, target.x + 2, target.y + 3)).toEqual({ r: 220, g: 40, b: 60, a: 255 })
      expect(readLayerColorAt(document, layer, 14, 3)).toEqual({ r: 20, g: 80, b: 230, a: 255 })
    }
    expect(observedCroppedPadding).toBe(true)
    expect(freeTileSelectionForInstanceEdit(selection, { x: 20, y: 12, width: 2, height: 2 })).toBeNull()
  })

  it('keeps Free Tile move previews on the exact selection target during continuous updates', () => {
    const document = createDocument('continuous source selection tracking', 32, 32, 'rgba')
    const layer = getActiveLayer(document)
    const cel = ensureAnimationDocument(document).cels[0]
    const tileset = createBlankTileset('continuous-source', 'Source', 20, 20, 'tile', 1)
    const pixels = new Uint8ClampedArray(20 * 20 * 4)
    for (let y = 0; y < 20; y += 1) for (let x = 0; x < 20; x += 1) {
      const dx = x - 9.5
      const dy = y - 9.5
      if (dx * dx + dy * dy > 88) continue
      pixels.set([32, 121, 255, 255], (y * 20 + x) * 4)
    }
    writeTilesetTilePixels(tileset, 'tile', pixels)
    document.tilesets = [tileset]
    layer.kind = 'free-tile'
    layer.freeTileSources = [{ id: 'source', name: 'Source', tilesetId: tileset.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
    cel.freeTiles = { instances: [{ id: 'selected', sourceId: 'source', x: 6, y: 6 }] }
    cel.surface = renderFreeTileSurface(cel.freeTiles, freeTileSourceRefs(layer.freeTileSources, document.tilesets), document.colorMode, document.width, document.height)
    refreshActiveAnimationFrame(document)

    const sources = freeTileSourceRefs(layer.freeTileSources, document.tilesets)
    const instanceBounds = freeTileInstanceBounds(cel.freeTiles.instances[0], sources)
    const edit = createFreeTileSourceEditRaster(document, sources[0], instanceBounds, undefined, cel.freeTiles.instances[0])!
    const selection = { x: 10, y: 6, width: 12, height: 10 }
    const localSelection = freeTileSelectionToEditRaster(edit, selection)!
    const transformSource = captureSelectionTransform(edit.document, localSelection, edit.layer)!
    let previewEdit: ReturnType<typeof applySelectionTransform> = null

    for (const target of [{ x: 2, y: 12 }, { x: 17, y: 2 }, { x: 5, y: 18 }, { x: 14, y: 8 }]) {
      if (previewEdit) revertPixelEdit(edit.document, previewEdit)
      previewEdit = applySelectionTransform(
        edit.document,
        transformSource,
        freeTileTransformTargetToEditRaster(edit, { ...selection, ...target }),
        0,
        false,
        undefined,
        undefined,
        undefined,
        edit.layer
      )
      expect(previewEdit).not.toBeNull()
      expect(applyFreeTileSourceSnapshot(document, freeTileSourceSnapshotFromEditRaster(edit))).toBe(true)
      expect(readLayerColorAt(document, layer, target.x + 5, target.y + 5)).toEqual({ r: 32, g: 121, b: 255, a: 255 })
      expect(readLayerColorAt(document, layer, target.x + 10, target.y + 8)).toEqual({ r: 32, g: 121, b: 255, a: 255 })
      for (let y = 0; y < document.height; y += 1) for (let x = 0; x < document.width; x += 1) {
        expect(readLayerColorAt(document, layer, x, y)).toEqual(
          readLayerColorAt(edit.document, edit.layer, x - edit.origin.x, y - edit.origin.y)
        )
      }
    }
  })

  it('keeps continuous selection previews aligned for rotated and mirrored instances', () => {
    for (const transform of [
      { rotation: 1 as const },
      { rotation: 3 as const, flipHorizontal: true },
      { flipVertical: true }
    ]) {
      const document = createDocument('transformed source selection tracking', 28, 26, 'rgba')
      const layer = getActiveLayer(document)
      const cel = ensureAnimationDocument(document).cels[0]
      const tileset = createBlankTileset('transformed-source', 'Source', 7, 5, 'tile', 1)
      const pixels = new Uint8ClampedArray(7 * 5 * 4)
      for (const [x, y] of [[0, 0], [1, 0], [4, 1], [2, 3], [6, 4]] as const) {
        pixels.set([32, 121, 255, 255], (y * 7 + x) * 4)
      }
      writeTilesetTilePixels(tileset, 'tile', pixels)
      document.tilesets = [tileset]
      layer.kind = 'free-tile'
      layer.freeTileSources = [{ id: 'source', name: 'Source', tilesetId: tileset.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: -2, offsetY: 1 }]
      cel.freeTiles = { instances: [{ id: 'selected', sourceId: 'source', x: 11, y: 8, ...transform }] }
      cel.surface = renderFreeTileSurface(
        cel.freeTiles,
        freeTileSourceRefs(layer.freeTileSources, document.tilesets),
        document.colorMode,
        document.width,
        document.height,
        2,
        1
      )
      refreshActiveAnimationFrame(document)

      const sources = freeTileSourceRefs(layer.freeTileSources, document.tilesets)
      const instance = cel.freeTiles.instances[0]
      const selection = freeTileInstanceBounds(instance, sources, cel.surface.offsetX, cel.surface.offsetY)
      const edit = createFreeTileSourceEditRaster(document, sources[0], selection, undefined, instance)!
      const localSelection = freeTileSelectionToEditRaster(edit, selection)!
      const transformSource = captureSelectionTransform(edit.document, localSelection, edit.layer)!
      let preview = null

      for (const target of [{ x: 4, y: 15 }, { x: 17, y: 3 }, { x: 8, y: 11 }]) {
        preview = applySelectionTranslationPreview(
          edit.document,
          transformSource,
          freeTileTransformTargetToEditRaster(edit, { ...selection, ...target }),
          false,
          preview,
          edit.layer
        )
        expect(applyFreeTileSourceSnapshot(document, freeTileSourceSnapshotFromEditRaster(edit))).toBe(true)
        for (let y = 0; y < document.height; y += 1) for (let x = 0; x < document.width; x += 1) {
          expect(readLayerColorAt(document, layer, x, y)).toEqual(
            readLayerColorAt(edit.document, edit.layer, x - edit.origin.x, y - edit.origin.y)
          )
        }
      }
    }
  })









  it('keeps source edit raster coverage on both sides of an off-canvas instance', () => {
    const document = createDocument('source outside canvas', 16, 8, 'rgba')
    const layer = getActiveLayer(document)
    const tileset = createSolidTileset('source-tileset', 'Source', 1, 1, { r: 220, g: 40, b: 60, a: 255 }, 'tile')
    document.tilesets = [tileset]
    layer.kind = 'free-tile'
    layer.freeTileSources = [{ id: 'source', name: 'Source', tilesetId: tileset.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
    const source = freeTileSourceRefs(layer.freeTileSources, document.tilesets)[0]
    const edit = createFreeTileSourceEditRaster(document, source, { x: 100, y: 5, width: 1, height: 1 }, { x: 1, y: 5 })!

    expect(edit.origin.x).toBeLessThan(0)
    expect(edit.origin.x + edit.layer.width).toBeGreaterThan(100)
  })

  it('trimming removes only instances that are fully outside the canvas', () => {
    const { document, cel } = createFreeTileDocument(6, 4, [
      { id: 'outside-left', tileId: 'tile', x: -2, y: 1 },
      { id: 'partial-left', tileId: 'tile', x: -1, y: 1 },
      { id: 'partial-right', tileId: 'tile', x: 3, y: 1 },
      { id: 'outside-right', tileId: 'tile', x: 4, y: 1 }
    ])

    const resized = resizeDocumentAt(document, 4, 4, 0, 0, true)
    resizeAnimationCelsAt(document, resized.offsetX, resized.offsetY, true, 6, 4)

    expect(cel.freeTiles!.instances.map((instance) => instance.id)).toEqual(['partial-left', 'partial-right'])
  })

  it('scales source tiles and instance positions with image resizing', () => {
    const { document, cel, tileset } = createFreeTileDocument(4, 4, [{ id: 'placed', tileId: 'tile', x: 1, y: 1 }])
    const freeTileResize = captureFreeTileImageResizeState(document)

    resizeDocumentImage(document, 8, 6, 'nearest')
    resizeFreeTileDocumentImage(document, freeTileResize, 'nearest')

    expect(tileset).toMatchObject({ tileWidth: 4, tileHeight: 3 })
    expect(cel.freeTiles!.instances[0]).toMatchObject({ x: 2, y: 2 })
    expect(cel.surface).toMatchObject({ width: 8, height: 6, offsetX: 0, offsetY: 0 })
  })


})
