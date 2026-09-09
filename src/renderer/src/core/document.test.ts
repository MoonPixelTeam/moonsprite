import { describe, expect, it } from 'vitest'
import { BLEND_MODES } from '@shared/types'
import { blendWithMode, blendWithModeInto, packColor, writeRgbaPixel } from './raster'
import { createDefaultLayerStyles } from './layer-styles'
import { activateAnimationFrame, duplicateAnimationFrame, ensureAnimationDocument } from './animation'
import { cachedLayerContentBounds, captureDocumentImageResizeSnapshot, compositePixelWithLayerColor, compositeRegion, compositeRegionAsync, createCompositePointReplacementSampler, createCompositePointSampler, createCompositeSampler, createDocument, createLayer, createLayerMask, createNormalCompositePointReplacementSampler, createNormalCompositePointSampler, DocumentCompositeCache, getPaletteEntry, layerContentBounds, markLayerContentChanged, normalCompositeLayers, paletteColorIdForCanvas, readLayerColor, readLayerColorAt, readLayerMaskDisplayColorAt, renderLayerMaskRegion, resizeDocumentAt, resizeDocumentImage, resolveLayerCanvasColor, restoreDocumentImageResizeSnapshot, writeLayerColor, writeLayerPackedRun } from './document'
import { assignRasterStorage, installRuntimeRaster, surfacePixelsMaterialized } from './runtime-raster'

const red = { r: 255, g: 0, b: 0, a: 255 }
const blue = { r: 0, g: 0, b: 255, a: 128 }

describe('document compositing', () => {
  it('keeps row bounds exact through holes, edge erasure, empty rows and regrowth', () => {
    const document = createDocument('row edge refresh', 32, 4, 'rgba')
    const layer = document.layers[0]
    const cache = new DocumentCompositeCache()
    let revision = 1
    const verify = (x: number, width: number): void => {
      const dirty = { x, y: 1, width, height: 1 }
      const actual = compositeRegion(document, 0, 0, 32, 4, cache, ++revision, dirty)
      expect(actual).toEqual(compositeRegion(document, 0, 0, 32, 4))
    }
    for (const x of [2, 12, 20, 30]) writeLayerColor(document, layer, 32 + x, red)
    verify(0, 32)
    writeLayerColor(document, layer, 32 + 2, { r: 0, g: 0, b: 0, a: 0 })
    verify(2, 1)
    writeLayerColor(document, layer, 32 + 30, { r: 0, g: 0, b: 0, a: 0 })
    verify(30, 1)
    for (const x of [12, 20]) writeLayerColor(document, layer, 32 + x, { r: 0, g: 0, b: 0, a: 0 })
    verify(12, 9)
    writeLayerColor(document, layer, 32 + 8, red)
    verify(8, 1)
  })

  it('distinguishes unknown content bounds from cached empty or populated bounds', () => {
    const document = createDocument('known bounds', 8, 6, 'rgba')
    const layer = document.layers[0]
    writeLayerColor(document, layer, 3 * layer.width + 4, red)

    expect(cachedLayerContentBounds(document, layer)).toBeUndefined()
    expect(layerContentBounds(document, layer)).toEqual({ x: 4, y: 3, width: 1, height: 1 })
    expect(cachedLayerContentBounds(document, layer)).toEqual({ x: 4, y: 3, width: 1, height: 1 })
  })

  it('preserves normal alpha compositing across flat layers', () => {
    const document = createDocument('flat layers', 1, 1, 'rgba')
    const bottom = document.layers[0]
    const top = createLayer('top', 1, 1, 'rgba')
    document.layers.push(top)
    writeLayerColor(document, bottom, 0, red)
    writeLayerColor(document, top, 0, blue)

    expect(Array.from(compositeRegion(document, 0, 0, 1, 1))).toEqual(Object.values(blendWithMode(red, blue, 1, 'normal')))
  })

  it('composites asynchronously in batches without changing pixel output', async () => {
    const document = createDocument('async composite', 2, 2, 'rgba')
    const layer = document.layers[0]
    writeLayerColor(document, layer, 0, red)
    const progress: number[] = []
    const asyncPixels = await compositeRegionAsync(document, 0, 0, 2, 2, (value) => progress.push(value), undefined, 1)
    expect(Array.from(asyncPixels)).toEqual(Array.from(compositeRegion(document, 0, 0, 2, 2)))
    expect(progress.at(-1)).toBe(100)
  })

  it('applies a frame-specific mask to the composited result of a layer group', () => {
    const document = createDocument('group mask alpha', 1, 1, 'rgba')
    const layer = document.layers[0]
    const group = { id: 'group-1', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal' as const }
    document.groups.push(group)
    layer.groupId = group.id
    writeLayerColor(document, layer, 0, red)
    const timeline = ensureAnimationDocument(document)
    const mask = createLayerMask(group.id, 1, 1, 'group')
    writeLayerColor(document, mask, 0, { r: 0, g: 0, b: 0, a: 255 })
    timeline.groupMasks = [{ groupId: group.id, frameId: timeline.activeFrameId, mask }]

    expect(Array.from(compositeRegion(document, 0, 0, 1, 1))).toEqual([0, 0, 0, 0])
    mask.visible = false
    expect(Array.from(compositeRegion(document, 0, 0, 1, 1))).toEqual([255, 0, 0, 255])
  })



  it('preserves nested group order and opacity', () => {
    const document = createDocument('nested groups', 1, 1, 'rgba')
    const bottom = document.layers[0]
    const grouped = createLayer('grouped', 1, 1, 'rgba')
    grouped.groupId = 'child'
    document.layers.push(grouped)
    document.groups.push(
      { id: 'parent', name: 'parent', parentGroupId: null, visible: true, locked: false, opacity: 0.5, blendMode: 'normal' },
      { id: 'child', name: 'child', parentGroupId: 'parent', visible: true, locked: false, opacity: 1, blendMode: 'normal' }
    )
    writeLayerColor(document, bottom, 0, red)
    writeLayerColor(document, grouped, 0, { ...blue, a: 255 })

    const expected = blendWithMode(red, { ...blue, a: 255 }, 0.5, 'normal')
    expect(Array.from(compositeRegion(document, 0, 0, 1, 1))).toEqual(Object.values(expected))
  })

  it('applies child-layer and group blend modes at their own compositing levels', () => {
    const document = createDocument('nested blend modes', 1, 1, 'rgba')
    const outsideBottom = document.layers[0]
    const groupBottom = createLayer('group bottom', 1, 1, 'rgba')
    const groupTop = createLayer('group top', 1, 1, 'rgba')
    groupBottom.groupId = 'group'
    groupTop.groupId = 'group'
    groupTop.blendMode = 'screen'
    document.layers.push(groupBottom, groupTop)
    document.groups.push({ id: 'group', name: 'group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'multiply' })
    const outsideColor = { r: 76, g: 132, b: 218, a: 255 }
    const groupBottomColor = { r: 214, g: 92, b: 48, a: 255 }
    const groupTopColor = { r: 42, g: 188, b: 124, a: 255 }
    writeLayerColor(document, outsideBottom, 0, outsideColor)
    writeLayerColor(document, groupBottom, 0, groupBottomColor)
    writeLayerColor(document, groupTop, 0, groupTopColor)

    const groupColor = blendWithMode(groupBottomColor, groupTopColor, 1, 'screen')
    const expected = blendWithMode(outsideColor, groupColor, 1, 'multiply')
    expect(Array.from(compositeRegion(document, 0, 0, 1, 1))).toEqual(Object.values(expected))
    expect(Array.from(compositeRegion(document, 0, 0, 1, 1, new DocumentCompositeCache(), 1))).toEqual(Object.values(expected))
    expect(new DocumentCompositeCache().movePreviewLayersFor(document, 1)).toBeNull()
  })

  it('exposes a blended top layer stack for the layer move preview', () => {
    const document = createDocument('move preview blend stack', 1, 1, 'rgba')
    const bottom = document.layers[0]
    const groupLayer = createLayer('group layer', 1, 1, 'rgba')
    const moving = createLayer('moving screen layer', 1, 1, 'rgba')
    groupLayer.groupId = 'simple-group'
    moving.groupId = 'simple-group'
    moving.blendMode = 'screen'
    document.layers.push(groupLayer, moving)
    document.groups.push({ id: 'simple-group', name: 'simple group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    writeLayerColor(document, bottom, 0, { r: 20, g: 40, b: 80, a: 255 })
    writeLayerColor(document, groupLayer, 0, { r: 30, g: 60, b: 90, a: 255 })
    writeLayerColor(document, moving, 0, { r: 100, g: 120, b: 140, a: 255 })

    const cache = new DocumentCompositeCache()
    const layers = cache.movePreviewLayersFor(document, 1)
    expect(layers?.map((layer) => layer.id)).toEqual([bottom.id, groupLayer.id, moving.id])
    const base = blendWithMode({ r: 20, g: 40, b: 80, a: 255 }, { r: 30, g: 60, b: 90, a: 255 }, 1, 'normal')
    expect(Array.from(cache.movePreviewLayerRegion(document, layers!.slice(0, -1), 0, 0, 1, 1, 1))).toEqual(Object.values(base))
    expect(Array.from(cache.movePreviewLayerRegion(document, layers!, 0, 0, 1, 1, 1))).toEqual(Array.from(compositeRegion(document, 0, 0, 1, 1, new DocumentCompositeCache(), 1)))
  })

  it('keeps an empty non-normal layer on the fast normal compositor path', () => {
    const document = createDocument('empty blend layer', 2, 2, 'rgba')
    const background = document.layers[0]
    const emptyBlendLayer = createLayer('empty blend', 2, 2, 'rgba')
    emptyBlendLayer.blendMode = 'multiply'
    document.layers.push(emptyBlendLayer)
    writeLayerColor(document, background, 0, red)

    expect(normalCompositeLayers(document)).not.toBeNull()
    expect(Array.from(compositeRegion(document, 0, 0, 1, 1))).toEqual([255, 0, 0, 255])
  })

  it('keeps direct blend writes identical to the canonical blend function', () => {
    const bottom = { r: 31, g: 148, b: 219, a: 173 }
    const top = { r: 224, g: 72, b: 19, a: 201 }
    for (const mode of BLEND_MODES) {
      const output = new Uint8ClampedArray(4)
      blendWithModeInto(output, 0, bottom.r, bottom.g, bottom.b, bottom.a, top.r, top.g, top.b, top.a, 0.63, mode)
      expect(Array.from(output), mode).toEqual(Object.values(blendWithMode(bottom, top, 0.63, mode)))
    }
  })

  it('applies a blended group to the fully composited Photoshop-style backdrop', () => {
    const document = createDocument('Photoshop blend chain', 1, 1, 'rgba')
    const background = document.layers[0]
    const screenLayer = createLayer('screen', 1, 1, 'rgba')
    const groupMember = createLayer('group member', 1, 1, 'rgba')
    screenLayer.blendMode = 'screen'
    groupMember.groupId = 'multiply-group'
    document.layers.push(screenLayer, groupMember)
    document.groups.push({ id: 'multiply-group', name: 'multiply group', parentGroupId: null, panelOrder: 2, visible: true, locked: false, opacity: 1, blendMode: 'multiply' })
    writeLayerColor(document, background, 0, { r: 0x91, g: 0x80, b: 0x4d, a: 255 })
    writeLayerColor(document, screenLayer, 0, { r: 0x91, g: 0x15, b: 0x22, a: 255 })
    writeLayerColor(document, groupMember, 0, { r: 0x91, g: 0x15, b: 0x22, a: 255 })

    expect(createCompositePointSampler(document)(0, 0)).toEqual({ r: 0x76, g: 0x0b, b: 0x0d, a: 255 })
  })



  it('keeps a moved layer bitmap intact outside the canvas and composites it after moving back', () => {
    const document = createDocument('offset layer', 2, 1, 'rgba')
    const layer = document.layers[0]
    writeLayerColor(document, layer, 0, red)
    layer.offsetX = 3
    expect(Array.from(compositeRegion(document, 0, 0, 2, 1))).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual(red)
    layer.offsetX = 1
    expect(Array.from(compositeRegion(document, 0, 0, 2, 1))).toEqual([0, 0, 0, 0, 255, 0, 0, 255])
  })

  it('finds sparse layer content in canvas coordinates', () => {
    const document = createDocument('content bounds', 6, 5, 'rgba')
    const layer = document.layers[0]
    layer.offsetX = -2
    layer.offsetY = 3
    writeLayerColor(document, layer, 1 + layer.width, red)
    writeLayerColor(document, layer, 4 + layer.width * 3, blue)

    expect(layerContentBounds(document, layer)).toEqual({ x: -1, y: 4, width: 4, height: 3 })
  })





  it('permanently crops layer pixels outside the resized canvas when requested', () => {
    const document = createDocument('trim canvas', 4, 2, 'rgba')
    const layer = document.layers[0]
    writeLayerColor(document, layer, 0, red)
    writeLayerColor(document, layer, 3, blue)

    resizeDocumentAt(document, 2, 2, 0, 0, true)

    expect(layer).toMatchObject({ offsetX: 0, offsetY: 0, width: 2, height: 2 })
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 3, 0).a).toBe(0)
    expect(layerContentBounds(document, layer)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })



  it('resizes layer pixels, offsets, and the document together', () => {
    const document = createDocument('image resize', 2, 1, 'rgba')
    const layer = document.layers[0]
    layer.offsetX = 1
    writeLayerColor(document, layer, 0, red)

    resizeDocumentImage(document, 4, 2, 'nearest')

    expect(document.width).toBe(4)
    expect(document.height).toBe(2)
    expect(layer.width).toBe(4)
    expect(layer.height).toBe(2)
    expect(layer.offsetX).toBe(2)
    expect(layer.offsetY).toBe(0)
    expect(readLayerColor(document, layer, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(red)
  })




})
