import { afterEach, describe, expect, it } from 'vitest'
import { acquireCompositeBuffer, globalBufferPool, releaseCompositeBuffer } from './buffer-pool'
import { createDocument, createLayer, writeLayerColor } from './document-model'
import { compositeRegion } from './document-composite-region'
import { DocumentCompositeCache } from './document-composite-cache'
import { createDefaultLayerStyles } from './layer-styles'

afterEach(() => globalBufferPool.clear())

describe('composite buffer ownership and dimensions', () => {
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
