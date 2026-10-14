import { afterEach, describe, expect, it } from 'vitest'
import { BufferPool, acquireCompositeBuffer, globalBufferPool, releaseCompositeBuffer } from './buffer-pool'
import { createDocument, createLayer, writeLayerColor } from './document-model'
import { compositeRegion } from './document-composite-region'
import { DocumentCompositeCache } from './document-composite-cache'
import { createDefaultLayerStyles } from './layer-styles'

afterEach(() => globalBufferPool.clear())

describe('composite buffer ownership and dimensions', () => {
  it('reuses nonstandard sizes with exact lengths and transparent pixels', () => {
    const pool = new BufferPool()
    const first = pool.acquire(800 * 600 * 4)
    first.fill(255); pool.release(first)
    const second = pool.acquire(800 * 600 * 4)
    expect(second.buffer).toBe(first.buffer)
    expect(second.byteLength).toBe(800 * 600 * 4)
    expect(second.some(value => value !== 0)).toBe(false)
    pool.clear()
  })

  it('caps all size classes together and refuses foreign/double releases', () => {
    const pool = new BufferPool(1024)
    pool.release(new Uint8ClampedArray(100))
    expect(pool.getStats().totalBytes).toBe(0)
    for (let index = 1; index <= 100; index++) {
      const pixels = pool.acquire(200 + index)
      pool.release(pixels); pool.release(pixels)
      expect(pool.getStats().totalBytes).toBeLessThanOrEqual(1024)
    }
    const before = pool.getStats().totalBytes
    expect(pool.trim(before)).toBe(before)
    expect(pool.getStats().totalBuffers).toBe(0)
  })
  it.each([[42, 39], [96, 96], [513, 257]])('returns exactly %s × %s RGBA bytes on cold and warm acquisition', (width, height) => {
    expect(acquireCompositeBuffer(width, height).byteLength).toBe(width * height * 4)
    const pooled = acquireCompositeBuffer(256, 256)
    releaseCompositeBuffer(pooled)
    expect(acquireCompositeBuffer(width, height).byteLength).toBe(width * height * 4)
  })

  it('clears released pixels before reusing them for a transparent composite', () => {
    const pixels = acquireCompositeBuffer(256, 256)
    pixels.fill(255)
    releaseCompositeBuffer(pixels)
    const next = acquireCompositeBuffer(42, 39)
    expect(next.some(value => value !== 0)).toBe(false)
  })

  it.each(['styled', 'layers', 'group'] as const)('keeps exact image dimensions and independent results for %s composites', mode => {
    const document = createDocument('old project dimensions', 42, 39, 'rgba', false)
    const layer = document.layers[0]
    writeLayerColor(document, layer, 10 * 42 + 12, { r: 255, g: 70, b: 20, a: 255 })
    if (mode === 'styled') {
      layer.layerStyles = createDefaultLayerStyles()
      layer.layerStyles.stroke.enabled = true
    } else document.layers.push(createLayer('second', 42, 39, 'rgba'))
    if (mode === 'group') {
      document.groups.push({ id: 'g', name: 'group', visible: true, locked: false, opacity: 0.6, blendMode: 'normal' })
      layer.groupId = 'g'
    }
    const cache = new DocumentCompositeCache()
    const first = compositeRegion(document, 0, 0, 42, 39, cache, 1)
    expect(first.byteLength).toBe(42 * 39 * 4)
    const saved = first.slice()
    const patch = compositeRegion(document, 10, 8, 7, 5, cache, 1)
    expect(patch.byteLength).toBe(7 * 5 * 4)
    expect(first).toEqual(saved)
    expect(first[ (10 * 42 + 12) * 4 + 3 ]).toBeGreaterThan(0)
  })
})
