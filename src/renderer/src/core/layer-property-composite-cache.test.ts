import { expect, it, vi } from 'vitest'
import { BLEND_MODES } from '@shared/types-color'
import { compositeRegion, createDocument, createLayer, createLayerMask, writeLayerColor } from './document'
import { ensureAnimationDocument } from './animation'
import { DocumentCompositeCache } from './document-composite-cache'
import { LayerPropertyCompositeCache } from './layer-property-composite-cache'
import { createDefaultLayerStyles } from './layer-styles'
import * as storage from './runtime-raster'

const setup = () => {
  const document = createDocument('property dependency graph', 9, 7, 'rgba', false)
  document.layers.push(...Array.from({ length: 4 }, (_, i) => createLayer(`layer ${i}`, 9, 7, 'rgba')))
  document.layers.forEach((layer, i) => {
    for (let p = 0; p < 63; p++) writeLayerColor(document, layer, p, { r: (p * 17 + i * 31) % 256, g: (p * 43 + i * 11) % 256, b: 170, a: [0, 80, 190, 255][(p + i) % 4] })
  })
  return document
}

it.each(['plain', 'group', 'clipping', 'styles', 'masks', 'cumulative'] as const)('matches exact composition throughout property edits: %s', scenario => {
  const document = setup()
  const layer = document.layers[3]
  document.groups.push({ id: 'g', name: 'Group', visible: true, locked: false, opacity: 0.75, blendMode: 'multiply' })
  if (scenario !== 'plain') { layer.groupId = 'g'; document.layers[2].groupId = 'g' }
  if (scenario === 'clipping') { layer.clippingMask = true; document.layers[4].clippingMask = true }
  if (scenario === 'cumulative') document.groups[0].cumulativeBlend = true
  if (scenario === 'styles') {
    layer.layerStyles = createDefaultLayerStyles(); layer.layerStyles.stroke.enabled = true
    document.groups[0].layerStyles = createDefaultLayerStyles(); document.groups[0].layerStyles!.stroke.enabled = true
  }
  if (scenario === 'masks') {
    const timeline = ensureAnimationDocument(document)
    const mask = createLayerMask(layer.id, 9, 7, 'cel')
    writeLayerColor(document, mask, 20, { r: 60, g: 60, b: 60, a: 255 })
    timeline.layerMasks = [{ layerId: layer.id, frameId: timeline.activeFrameId, mask }]
  }
  const cache = new LayerPropertyCompositeCache(), styles = new DocumentCompositeCache()
  let revision = 0
  const rect = { x: 1, y: 1, width: 7, height: 5 }
  for (const target of [layer, document.groups[0]]) for (const blendMode of BLEND_MODES) for (const opacity of [0, 0.4, 1]) {
    target.blendMode = blendMode; target.opacity = opacity
    const change = { compositeOnly: true as const, propertyOwnerIds: [target.id], fromRevision: revision, revision: ++revision }
    styles.retainLayerStyleSources(document, change.fromRevision, revision)
    expect(cache.render(document, rect, revision, change, styles) ?? compositeRegion(document, rect.x, rect.y, rect.width, rect.height, styles, revision))
      .toEqual(compositeRegion(document, rect.x, rect.y, rect.width, rect.height))
  }
})

it('skips unchanged lower sources after warming and rejects gaps and non-property edits', () => {
  const document = setup(), layer = document.layers[4]
  layer.clippingMask = true
  const cache = new LayerPropertyCompositeCache(), styles = new DocumentCompositeCache()
  const rect = { x: 0, y: 0, width: 9, height: 7 }
  const change = (fromRevision: number, revision: number) => ({ compositeOnly: true as const, propertyOwnerIds: [layer.id], fromRevision, revision })
  cache.render(document, rect, 1, change(0, 1), styles)
  const read = vi.spyOn(storage, 'readSurfacePackedLocal')
  try {
    layer.opacity = 0.4
    cache.render(document, rect, 2, change(1, 2), styles)
    expect(read).not.toHaveBeenCalled()
    writeLayerColor(document, document.layers[0], 0, { r: 9, g: 200, b: 0, a: 255 })
    expect(cache.render(document, rect, 4, change(3, 4), styles)).toEqual(compositeRegion(document, 0, 0, 9, 7))
    expect(read).toHaveBeenCalled()
    expect(cache.render(document, rect, 5, undefined, styles)).toBeNull()
    expect(new LayerPropertyCompositeCache(1).render(document, rect, 5, change(4, 5), styles)).toBeNull()
  } finally { read.mockRestore() }
})

it('reuses a flat backdrop and discards it after a source edit or a different target', () => {
  const document = setup(), layer = document.layers[4]
  const cache = new LayerPropertyCompositeCache(), styles = new DocumentCompositeCache()
  const rect = { x: 0, y: 0, width: 9, height: 7 }
  let revision = 0
  const render = (ownerId: string) => cache.render(document, rect, revision + 1,
    { compositeOnly: true, propertyOwnerIds: [ownerId], fromRevision: revision, revision: ++revision }, styles)
  for (const opacity of [0.4, 0, 1, 0.7]) {
    layer.opacity = opacity
    expect(render(layer.id) ?? compositeRegion(document, 0, 0, 9, 7, styles, revision)).toEqual(compositeRegion(document, 0, 0, 9, 7))
  }
  document.layers[0].opacity = 0.2
  expect(render(document.layers[0].id)).toEqual(compositeRegion(document, 0, 0, 9, 7))
  writeLayerColor(document, document.layers[0], 0, { r: 10, g: 200, b: 0, a: 255 })
  cache.clear()
  expect(render(layer.id)).toEqual(compositeRegion(document, 0, 0, 9, 7))
})

it('keeps the scanline fast path for ordinary opacity groups', () => {
  const document = setup(), layer = document.layers[0]
  document.groups.push({ id: 'group', name: 'Group', visible: true, locked: false, opacity: 0.8, blendMode: 'normal' })
  document.layers.forEach(item => { item.groupId = 'group' })
  const cache = new LayerPropertyCompositeCache(), sources = new DocumentCompositeCache()
  expect(cache.render(document, { x: 0, y: 0, width: 9, height: 7 }, 1,
    { compositeOnly: true, propertyOwnerIds: [layer.id], fromRevision: 0, revision: 1 }, sources)).toBeNull()
})

it('fits the complete 4K backdrop for a top-layer adjustment into the default budget', () => {
  const document = createDocument('4K 100 layers', 4096, 4096, 'rgba', false)
  document.layers = Array.from({ length: 100 }, (_, i) => {
    const layer = createLayer(`layer ${i}`, 1, 1, 'rgba')
    layer.offsetX = i; layer.pixels.set([200, 100, 50, 255])
    return layer
  })
  const target = document.layers[99], cache = new LayerPropertyCompositeCache(), sources = new DocumentCompositeCache()
  const rect = { x: 0, y: 0, width: 4096, height: 4096 }
  for (const revision of [1, 2]) {
    target.opacity = revision / 4
    const pixels = cache.render(document, rect, revision,
      { compositeOnly: true, propertyOwnerIds: [target.id], fromRevision: revision - 1, revision }, sources)
    expect(pixels).toBeInstanceOf(Uint8ClampedArray)
    expect(pixels?.slice(99 * 4, 100 * 4)).toEqual(new Uint8ClampedArray([200, 100, 50, Math.round(255 * target.opacity)]))
    expect(pixels?.slice(0, 4)).toEqual(new Uint8ClampedArray([200, 100, 50, 255]))
  }
})
