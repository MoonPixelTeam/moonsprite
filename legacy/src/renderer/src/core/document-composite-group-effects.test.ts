import { afterEach, describe, expect, it, vi } from 'vitest'
import { BLEND_MODES, type BlendMode } from '@shared/types-color'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { createDocument, createLayer, createLayerMask, markLayerContentChanged, writeLayerColor } from './document-model'
import { DocumentCompositeCache } from './document-composite-cache'
import { compositeRegion } from './document-composite-region'
import { groupEffectsPlan } from './document-composite-group-effects'
import * as sampling from './document-composite-sampling'
import * as buffers from './buffer-pool'
import { createDefaultLayerStyles } from './layer-styles'

const fixture = (mode: BlendMode = 'normal', opacity = 1, effect = 'both') => {
  const doc = createDocument('group effects pixels', 19, 13, 'rgba', false)
  doc.groups = [
    { id: 'outer', name: 'Outer', visible: true, locked: false, opacity, blendMode: mode },
    { id: 'inner', name: 'Inner', parentGroupId: 'outer', visible: true, locked: false, opacity: 0.73, blendMode: 'screen' },
  ]
  for (let index = 1; index <= 4; index++) {
    const layer = createLayer(`Layer ${index}`, 17, 11, 'rgba')
    layer.groupId = index === 2 || index === 3 ? 'inner' : 'outer'
    layer.offsetX = index - 3; layer.offsetY = index - 2
    layer.opacity = index === 4 ? 0.67 : 1
    layer.blendMode = index === 2 ? 'multiply' : 'normal'
    doc.layers.push(layer)
  }
  doc.layers.forEach((layer, index) => {
    for (let y = 0; y < layer.height; y++) for (let x = 0; x < layer.width; x++) writeLayerColor(doc, layer, y * layer.width + x, {
      r: (x * 31 + y * 7 + index * 53) % 256, g: (x * 3 + y * 41 + index * 19) % 256,
      b: (x * 17 + y * 11 + index * 29) % 256, a: [0, 1, 7, 64, 127, 180, 255][(x + y + index) % 7],
    })
  })
  const timeline = doc.animation!
  timeline.cels = doc.layers.map(layer => ({ id: `cel-${layer.id}`, layerId: layer.id, frameId: timeline.activeFrameId }))
  if (effect !== 'overlay') {
    const mask = createLayerMask('outer', 14, 9, 'group')
    mask.offsetX = -1; mask.offsetY = 2
    for (let i = 0; i < mask.width * mask.height; i++) writeLayerColor(doc, mask, i, { r: (i * 13) % 256, g: (i * 13) % 256, b: (i * 13) % 256, a: i % 5 ? 255 : 0 })
    timeline.groupMasks = [{ groupId: 'outer', frameId: timeline.activeFrameId, mask }]
    const layerMask = createLayerMask(doc.layers[4].id, 9, 7)
    layerMask.offsetX = 3; layerMask.offsetY = 1
    writeLayerColor(doc, layerMask, 12, { r: 64, g: 64, b: 64, a: 255 })
    timeline.layerMasks = [{ layerId: doc.layers[4].id, frameId: timeline.activeFrameId, mask: layerMask }]
  }
  if (effect !== 'mask') {
    const styles = createDefaultLayerStyles()
    styles.colorOverlay.enabled = true
    styles.colorOverlay.color = { r: 201, g: 43, b: 129, a: 128 }
    doc.groups[0].layerStyles = styles
    const innerStyles = createDefaultLayerStyles()
    innerStyles.colorOverlay.enabled = true
    innerStyles.colorOverlay.color = { r: 31, g: 223, b: 91, a: 83 }
    doc.groups[1].layerStyles = innerStyles
  }
  return doc
}

const reference = (doc: SpriteDocument, rect: SelectionRect): Uint8ClampedArray => {
  // Independent oracle: do not dispatch through compositeRegion's fast paths.
  const sample = sampling.compileCompositePointSampler(doc)
  const pixels = new Uint8ClampedArray(rect.width * rect.height * 4)
  for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
    const color = sample(rect.x + x, rect.y + y, undefined), offset = (y * rect.width + x) * 4
    pixels.set([color.r, color.g, color.b, color.a], offset)
  }
  return pixels
}
const rect = { x: -3, y: -2, width: 25, height: 18 }
afterEach(() => vi.restoreAllMocks())

describe('group effects block compositor', () => {
  it.each(BLEND_MODES)('matches nested masked/overlaid groups in %s mode without the point sampler', mode => {
    for (const opacity of [1, 0.8]) for (const effect of ['mask', 'overlay', 'both']) {
      const doc = fixture(mode, opacity, effect), expected = reference(doc, rect)
      expect(groupEffectsPlan(doc)).not.toBeNull()
      const compile = vi.spyOn(sampling, 'compileCompositePointSampler')
      const cache = new DocumentCompositeCache()
      expect(compositeRegion(doc, rect.x, rect.y, rect.width, rect.height, cache, 1)).toEqual(expected)
      expect(compile).not.toHaveBeenCalled()
      compile.mockRestore()
    }
  })

  it('does not flatten a fully opaque masked group over an outside backdrop', () => {
    const doc = fixture('normal', 1, 'mask')
    for (let i = 0; i < doc.width * doc.height; i++) writeLayerColor(doc, doc.layers[0], i, { r: 71, g: 183, b: 219, a: 255 })
    expect(compositeRegion(doc, 0, 0, 19, 13)).toEqual(reference(doc, { x: 0, y: 0, width: 19, height: 13 }))
  })

  it('keeps distinct region origins, frame masks and same-revision mask edits current', () => {
    const doc = fixture('normal', 1, 'both'), cache = new DocumentCompositeCache()
    const verify = (area: SelectionRect, dirty?: SelectionRect) => {
      expect(compositeRegion(doc, area.x, area.y, area.width, area.height, cache, 1, dirty, dirty)).toEqual(reference(doc, area))
    }
    verify({ x: 1, y: 2, width: 8, height: 6 })
    verify({ x: 7, y: 5, width: 8, height: 6 })
    const mask = doc.animation!.groupMasks![0].mask
    mask.pixels.fill(0); markLayerContentChanged(mask)
    const dirty = { x: 0, y: 2, width: 14, height: 9 }
    cache.invalidateLiveSourceCaches(); verify(rect, dirty)
    writeLayerColor(doc, mask, 1, { r: 0, g: 0, b: 0, a: 255 })
    cache.invalidateLiveSourceCaches(); verify(rect, dirty)
    mask.pixels.fill(0); markLayerContentChanged(mask)
    cache.invalidateLiveSourceCaches(); verify(rect, dirty)
    const timeline = doc.animation!
    timeline.frames.push({ id: 'frame-2', duration: 100 })
    timeline.activeFrameId = 'frame-2'
    const other = createLayerMask('outer', 19, 13, 'group')
    writeLayerColor(doc, other, 5 * 19 + 7, { r: 0, g: 0, b: 0, a: 255 })
    timeline.groupMasks!.push({ groupId: 'outer', frameId: 'frame-2', mask: other })
    verify(rect)
  })

  it('copies all tile edges and preserves returned buffers across subsequent calls', () => {
    const doc = fixture('normal', 0.8, 'both')
    const area = { x: -260, y: -5, width: 531, height: 263 }
    const first = compositeRegion(doc, area.x, area.y, area.width, area.height)
    const copy = first.slice()
    expect(first).toEqual(reference(doc, area))
    compositeRegion(doc, 2, 2, 8, 7)
    expect(first).toEqual(copy)
  })

  it.each(['clipping', 'adjustment', 'cumulative', 'spatial-group-style', 'layer-style', 'indexed'])(
    'keeps unsupported %s features on the reference path', feature => {
      const doc = fixture()
      if (feature === 'clipping') doc.layers[2].clippingMask = true
      if (feature === 'adjustment') doc.layers[2].kind = 'adjustment'
      if (feature === 'cumulative') doc.groups[0].cumulativeBlend = true
      if (feature === 'spatial-group-style') doc.groups[0].layerStyles!.shadow.enabled = true
      if (feature === 'layer-style') { doc.layers[2].layerStyles = createDefaultLayerStyles(); doc.layers[2].layerStyles!.stroke.enabled = true }
      if (feature === 'indexed') doc.colorMode = 'indexed'
      expect(groupEffectsPlan(doc)).toBeNull()
      const expected = reference(doc, rect)
      const compile = vi.spyOn(sampling, 'compileCompositePointSampler')
      expect(compositeRegion(doc, rect.x, rect.y, rect.width, rect.height)).toEqual(expected)
      expect(compile).toHaveBeenCalledOnce()
    },
  )

  it('uses one caller output for ordinary layers instead of acquiring a second buffer', () => {
    const doc = createDocument('allocation ownership', 16, 12, 'rgba', false)
    doc.layers.push(createLayer('top', 16, 12, 'rgba'))
    writeLayerColor(doc, doc.layers[0], 0, { r: 13, g: 91, b: 172, a: 180 })
    writeLayerColor(doc, doc.layers[1], 0, { r: 221, g: 37, b: 94, a: 128 })
    const acquire = vi.spyOn(buffers, 'acquireCompositeBuffer')
    const pixels = compositeRegion(doc, 0, 0, 16, 12)
    expect(pixels).toEqual(reference(doc, { x: 0, y: 0, width: 16, height: 12 }))
    expect(acquire).not.toHaveBeenCalled()
  })
})
