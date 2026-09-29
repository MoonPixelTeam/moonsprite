import { afterEach, expect, it, vi } from 'vitest'
import { BLEND_MODES } from '@shared/types-color'
import { compositeRegion, createDocument, createLayer, createLayerMask, DocumentCompositeCache, writeLayerColor } from './document'
import { ensureAnimationDocument } from './animation'
import { createDefaultLayerStyles } from './layer-styles'
import * as rendering from './document-composite-style-render'
import * as sampling from './document-composite-sampling'

afterEach(() => vi.restoreAllMocks())

const fixture = () => {
  const doc = createDocument('styled stack', 192, 192, 'rgba', false)
  const target = createLayer('styled', 128, 128, 'rgba')
  target.offsetX = target.offsetY = 24
  target.groupId = 'inner'
  target.opacity = 0.7
  target.layerStyles = createDefaultLayerStyles()
  target.layerStyles.stroke.enabled = true
  target.layerStyles.shadow.enabled = true
  for (const y of [16, 80]) for (const x of [16, 80]) {
    writeLayerColor(doc, target, y * 128 + x, { r: 200, g: 80, b: 40, a: 128 })
  }
  doc.layers.push(target)
  doc.groups.push(
    { id: 'outer', name: 'Outer', visible: true, locked: false, opacity: 0.8, blendMode: 'multiply' },
    { id: 'inner', parentGroupId: 'outer', name: 'Inner', visible: true, locked: false, opacity: 0.6, blendMode: 'normal' }
  )
  return { doc, target }
}

it.each(BLEND_MODES)('keeps styled layers on the raster path inside %s groups', mode => {
  const { doc, target } = fixture()
  doc.groups[0].blendMode = mode
  // A separate blended layer must not force the styled layer onto point sampling.
  doc.layers[0].blendMode = mode
  writeLayerColor(doc, doc.layers[0], 40 * 192 + 40, { r: 60, g: 140, b: 210, a: 200 })
  const expected = compositeRegion(doc, 32, 32, 96, 96)
  const cache = new DocumentCompositeCache()
  const point = vi.spyOn(sampling, 'compileCompositePointSampler')
  expect(cache.renderLayersFor(doc, 0)).toBeNull()
  expect(cache.renderStackFor(doc, 0)).not.toBeNull()
  // GPU consumers must never receive a proxy with placeholder pixel storage.
  expect(cache.opacityGroupStackFor(doc, 0)).toBeNull()
  expect(compositeRegion(doc, 32, 32, 96, 96, cache, 0)).toEqual(expected)
  expect(point).not.toHaveBeenCalled()
  expect(target.layerStyles?.stroke.enabled).toBe(true)
})

it('reuses style blocks through paint, erase, unrelated edits and translation in a mixed stack', () => {
  const { doc, target } = fixture()
  const cache = new DocumentCompositeCache()
  compositeRegion(doc, 0, 0, 192, 192, cache, 0)
  const render = vi.spyOn(rendering, 'renderStyledLayerBlock')
  for (const alpha of [255, 0, 128]) {
    writeLayerColor(doc, target, 16 * 128 + 16, { r: 20, g: 180, b: 220, a: alpha })
    cache.invalidateLiveSourceCaches()
    cache.invalidateStyleSources(doc, { x: 40, y: 40, width: 1, height: 1 }, [target.id])
    render.mockClear()
    const actual = compositeRegion(doc, 0, 0, 192, 192, cache, 0)
    const pixels = render.mock.calls.reduce((sum, call) => sum + call[2].width * call[2].height, 0)
    expect(pixels).toBeGreaterThan(0)
    expect(pixels).toBeLessThan(64 * 64)
    expect(actual).toEqual(compositeRegion(doc, 0, 0, 192, 192))
  }
  render.mockClear()
  writeLayerColor(doc, doc.layers[0], 40 * 192 + 40, { r: 100, g: 160, b: 210, a: 255 })
  cache.invalidateLiveSourceCaches()
  cache.invalidateStyleSources(doc, { x: 40, y: 40, width: 1, height: 1 }, [doc.layers[0].id])
  expect(compositeRegion(doc, 0, 0, 192, 192, cache, 0)).toEqual(compositeRegion(doc, 0, 0, 192, 192))
  expect(render).not.toHaveBeenCalled()
  for (const x of [27, 31, 24]) {
    target.offsetX = x
    cache.invalidateLayerPlacementCaches()
    cache.invalidateLayerPlacementSources(doc, { x: 20, y: 20, width: 140, height: 140 }, [target.id])
    expect(compositeRegion(doc, 0, 0, 192, 192, cache, 0)).toEqual(compositeRegion(doc, 0, 0, 192, 192))
    expect(render).not.toHaveBeenCalled()
  }
}, 30000)

it('leaves masked styles and their pending edits to the exact fallback', () => {
  const { doc, target } = fixture()
  const timeline = ensureAnimationDocument(doc)
  const mask = createLayerMask(target.id, 192, 192, 'cel')
  writeLayerColor(doc, mask, 40 * 192 + 40, { r: 80, g: 80, b: 80, a: 255 })
  timeline.layerMasks = [{ layerId: target.id, frameId: timeline.activeFrameId, mask }]
  const cache = new DocumentCompositeCache()
  expect(cache.renderStackFor(doc, 0)).toBeNull()
  compositeRegion(doc, 32, 32, 32, 32, cache, 0)
  writeLayerColor(doc, target, 16 * 128 + 16, { r: 30, g: 160, b: 220, a: 255 })
  cache.invalidateStyleSources(doc, { x: 40, y: 40, width: 1, height: 1 }, [target.id])
  expect(compositeRegion(doc, 32, 32, 32, 32, cache, 0)).toEqual(compositeRegion(doc, 32, 32, 32, 32))
})

it('compares the former recursive path with cached raster composition on a populated 4K / 100-layer stack', () => {
  const doc = createDocument('4K mixed styled stack', 4096, 4096, 'rgba', false)
  doc.groups = Array.from({ length: 3 }, (_, i) => ({
    id: `g${i}`, name: `Group ${i}`, visible: true, locked: false, opacity: 0.8, blendMode: 'multiply' as const
  }))
  doc.layers = Array.from({ length: 100 }, (_, i) => {
    const layer = createLayer(`layer ${i}`, 128, 128, 'rgba')
    layer.offsetX = layer.offsetY = 2048
    layer.groupId = `g${i % 3}`
    new Uint32Array(layer.pixels.buffer).fill(0x80706050)
    return layer
  })
  const target = doc.layers[49]
  target.layerStyles = createDefaultLayerStyles()
  target.layerStyles.stroke.enabled = true
  target.layerStyles.shadow.enabled = true
  const previous = new DocumentCompositeCache(), optimized = new DocumentCompositeCache()
  // Reproduce the previous dispatch with the same caches and pixel fixture.
  vi.spyOn(previous, 'renderStackFor').mockReturnValue(null)
  const draw = (cache: DocumentCompositeCache) => compositeRegion(doc, 2032, 2032, 160, 160, cache, 0)
  expect(draw(optimized)).toEqual(draw(previous))
  const times = { previous: 0, optimized: 0 }
  for (const x of [2049, 2050, 2051]) {
    target.offsetX = x
    for (const cache of [previous, optimized]) {
      cache.invalidateLayerPlacementCaches()
      cache.invalidateLayerPlacementSources(doc, { x: 2032, y: 2032, width: 160, height: 160 }, [target.id])
    }
    let start = performance.now()
    const expected = draw(previous)
    times.previous += performance.now() - start
    start = performance.now()
    const actual = draw(optimized)
    times.optimized += performance.now() - start
    expect(actual).toEqual(expected)
  }
  process.stdout.write(`Styled 4K/100-layer move CPU average: previous=${(times.previous / 3).toFixed(1)}ms, optimized=${(times.optimized / 3).toFixed(1)}ms\n`)
}, 20000)
