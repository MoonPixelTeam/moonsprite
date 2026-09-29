import { expect, it } from 'vitest'
import { createDocument, createLayer, writeLayerColor } from '@/core/document-model'
import { compositeRegion } from '@/core/document-composite'
import { brushStackPreview } from './canvas-brush-stack-cache'

it('bounds 4K/100-layer stack preparation to the cursor region and reuses it during sizing', () => {
  const document = createDocument('4K brush preview', 4096, 4096, 'rgba', false)
  for (let i = 1; i < 100; i++) document.layers.push(createLayer(`Layer ${i}`, 256, 256, 'rgba'))
  const index = 50
  writeLayerColor(document, document.layers[0], 200 * 4096 + 200, { r: 90, g: 10, b: 20, a: 128 })
  writeLayerColor(document, document.layers[99], 200 * 256 + 200, { r: 0, g: 40, b: 220, a: 128 })
  const cache = brushStackPreview(document, 1, index, [{ sampleX: 200, sampleY: 200 }], null)!
  expect(cache.width * cache.height).toBe(128 * 128)
  expect(cache.lower.byteLength + cache.upper.byteLength).toBe(128 * 128 * 8)
  const points = [{ sampleX: 180, sampleY: 180 }, { sampleX: 220, sampleY: 220 }]
  expect(brushStackPreview(document, 1, index, points, cache)).toBe(cache)
  const lower = compositeRegion({ ...document, layers: document.layers.slice(0, index) }, 200, 200, 1, 1)
  const upper = compositeRegion({ ...document, layers: document.layers.slice(index + 1) }, 200, 200, 1, 1)
  const offset = ((200 - cache.y) * cache.width + 200 - cache.x) * 4
  expect(cache.lower.slice(offset, offset + 4)).toEqual(lower)
  expect(cache.upper.slice(offset, offset + 4)).toEqual(upper)
  writeLayerColor(document, document.layers[99], 200 * 256 + 200, { r: 20, g: 90, b: 60, a: 255 })
  const edited = brushStackPreview(document, 2, index, points, cache)!
  expect(edited).not.toBe(cache)
  expect([...edited.upper.slice(offset, offset + 4)]).toEqual([20, 90, 60, 255])
  const moved = brushStackPreview(document, 2, index, [{ sampleX: 255, sampleY: 255 }, { sampleX: 280, sampleY: 280 }], edited)!
  expect(moved.width * moved.height).toBe(256 * 256)
  expect(brushStackPreview(document, 2, index, [{ sampleX: -1, sampleY: -1 }], moved)).toBeNull()
})
