import { afterEach, expect, it, vi } from 'vitest'
import { DocumentCompositeCache } from './document-composite-cache'
import { createDocument, createLayer, markLayerContentChanged, writeLayerColor } from './document-model'
import { globalCacheManager } from './global-cache-manager'
import { compositeOpacityGroupStack } from './document-composite-raster'
import { globalBufferPool } from './buffer-pool'
import type { CompositeStackItem } from './document-composite-plan'
import { compositeRegion } from './document-composite-region'
import { compileCompositePointSampler } from './document-composite-sampling'

afterEach(() => { globalBufferPool.clear(); vi.restoreAllMocks() })

it('releases property backdrops and all derived plans on direct disposal, then can reactivate', () => {
  const doc = createDocument('dispose', 128, 128, 'rgba', false)
  doc.layers.push(createLayer('top', 128, 128, 'rgba'))
  doc.layers.forEach(layer => writeLayerColor(doc, layer, 0, { r: 100, g: 20, b: 5, a: 255 }))
  const cache = new DocumentCompositeCache()
  const rect = { x: 0, y: 0, width: 128, height: 128 }
  const baseline = globalCacheManager.totalBytes()
  const render = () => cache.propertyRegion(doc, rect, 1, { compositeOnly: true, propertyOwnerIds: [doc.layers[1].id], fromRevision: 0, revision: 1 })
  expect(render()).not.toBeNull()
  expect(globalCacheManager.totalBytes() - baseline).toBe(128 * 128 * 4)
  cache.dispose(); cache.dispose()
  expect(globalCacheManager.totalBytes()).toBe(baseline)
  expect(render()).not.toBeNull()
  cache.dispose()
  expect(globalCacheManager.totalBytes()).toBe(baseline)
})

it('reuses group scratch pixels without mutating previously returned pixels', () => {
  const doc = createDocument('group ownership', 32, 32, 'rgba', false)
  writeLayerColor(doc, doc.layers[0], 0, { r: 100, g: 20, b: 5, a: 255 })
  const items: CompositeStackItem[] = [{ kind: 'group', group: { id: 'g', name: '', visible: true, locked: false, opacity: 0.5, blendMode: 'normal' }, children: [{ kind: 'layer', layer: doc.layers[0] }] }]
  const first = compositeOpacityGroupStack(doc, items, 0, 0, 32, 32)
  const copy = first.slice()
  expect(globalBufferPool.getStats().totalBuffers).toBe(1)
  doc.layers[0].pixels.fill(0)
  const second = compositeOpacityGroupStack(doc, items, 0, 0, 32, 32)
  expect(first).toEqual(copy)
  expect(first[3]).toBe(128)
  expect(second.some(value => value !== 0)).toBe(false)
  expect(first.buffer).not.toBe(second.buffer)
})

it('returns an acquired scratch buffer if child composition throws', () => {
  const doc = createDocument('failure ownership', 8, 8, 'rgba', false)
  const layer = doc.layers[0]
  Object.defineProperty(layer, 'offsetX', { get: () => { throw new Error('source failed') } })
  const items: CompositeStackItem[] = [{ kind: 'group', group: { id: 'g', name: '', visible: true, locked: false, opacity: 0.5, blendMode: 'normal' }, children: [{ kind: 'layer', layer }] }]
  expect(() => compositeOpacityGroupStack(doc, items, 0, 0, 8, 8)).toThrow('source failed')
  expect(globalBufferPool.getStats().totalBuffers).toBe(1)
})

it('preserves complex nested group pixels over 24 layers and 40 successive frames', () => {
  const doc = createDocument('large document frame ownership', 4096, 4096, 'rgba', false)
  doc.groups = [
    { id: 'outer', name: '', visible: true, locked: false, opacity: 0.63, blendMode: 'normal' },
    { id: 'inner', name: '', visible: true, locked: false, opacity: 0.71, blendMode: 'multiply', parentGroupId: 'outer' }
  ]
  doc.layers = Array.from({ length: 24 }, (_, index) => {
    const layer = createLayer(String(index), 31, 23, 'rgba')
    layer.groupId = index % 2 ? 'inner' : 'outer'
    layer.offsetX = index % 5 - 2; layer.offsetY = index % 7 - 3
    layer.blendMode = index % 3 ? 'normal' : 'screen'
    for (let pixel = 0; pixel < 31 * 23; pixel++) writeLayerColor(doc, layer, pixel, {
      r: (pixel * 13 + index * 17) % 256, g: pixel % 256, b: 97, a: [0, 63, 127, 255][(pixel + index) % 4]
    })
    return layer
  })
  const previous: Uint8ClampedArray[] = [], saved: Uint8ClampedArray[] = []
  const rect = { x: -3, y: -2, width: 39, height: 32 }
  for (let frame = 0; frame < 40; frame++) {
    const layer = doc.layers[frame % doc.layers.length]
    layer.offsetX = frame % 7 - 3
    layer.opacity = 0.3 + (frame % 8) / 12
    writeLayerColor(doc, layer, frame % (31 * 23), { r: frame, g: 200, b: 11, a: 97 })
    markLayerContentChanged(layer)
    const sample = compileCompositePointSampler(doc)
    const expected = new Uint8ClampedArray(rect.width * rect.height * 4)
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
      const color = sample(rect.x + x, rect.y + y, undefined)
      expected.set([color.r, color.g, color.b, color.a], (y * rect.width + x) * 4)
    }
    const pixels = compositeRegion(doc, rect.x, rect.y, rect.width, rect.height)
    expect(pixels).toEqual(expected)
    previous.push(pixels); saved.push(pixels.slice())
    expect(globalBufferPool.getStats().totalBytes).toBeLessThanOrEqual(64 * 1024 * 1024)
    if (frame % 9 === 0) globalBufferPool.clear()
  }
  previous.forEach((pixels, index) => expect(pixels).toEqual(saved[index]))
})
