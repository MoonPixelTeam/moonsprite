import { describe, expect, it, vi } from 'vitest'
import { createDocument, createLayer, compositeRegion, DocumentCompositeCache, writeLayerColor } from '@/core/document'
import { captureSelectionTransform } from '@/core/tools-selection-transform'
import { CanvasSelectionBackdropCache } from './canvas-selection-backdrop-cache'

describe('selection backdrop tiles', () => {
  it.each(['rgba', 'indexed'] as const)('matches the unchanged stack with a masked hole and copy toggle (%s)', format => {
    const document = createDocument('background', 300, 128, format)
    const lower = document.layers[0]
    const active = createLayer('active', 300, 128, format)
    document.layers.push(active)
    active.opacity = 0.63
    for (let i = 0; i < 300 * 128; i++) {
      writeLayerColor(document, lower, i, { r: 70, g: 90, b: 120, a: 190 })
      writeLayerColor(document, active, i, { r: 210, g: 40, b: 80, a: 128 })
    }
    const selection = { x: 240, y: 20, width: 36, height: 40, mask: Uint8Array.from({ length: 36 * 40 }, (_, i) => Number(i % 3 !== 0)) }
    const source = captureSelectionTransform(document, selection, active)!
    const pixels = active.pixels.slice()
    const composite = new DocumentCompositeCache()
    const cache = new CanvasSelectionBackdropCache(composite)
    const rect = { x: 25, y: 3, width: 274, height: 110 }
    for (const copy of [false, true, false]) {
      active.pixels.set(pixels)
      const actual = cache.read(document, active, [lower], source, copy, rect, 1)
      if (!copy) for (let y = 0; y < selection.height; y++) for (let x = 0; x < selection.width; x++) {
        if (selection.mask[y * selection.width + x]) writeLayerColor(document, active, (selection.y + y) * 300 + selection.x + x, { r: 0, g: 0, b: 0, a: 0 })
      }
      expect(actual).toEqual(compositeRegion(document, rect.x, rect.y, rect.width, rect.height, new DocumentCompositeCache(), 1))
    }
  })

  it('reuses immutable tiles, refreshes revisions and sources, and bounds retained memory', () => {
    const document = createDocument('large', 1024, 256, 'rgba')
    const layer = document.layers[0]
    const source = captureSelectionTransform(document, { x: 1, y: 1, width: 1, height: 1 }, layer)!
    const composite = new DocumentCompositeCache()
    const render = vi.spyOn(composite, 'normalLayerRegion')
    const cache = new CanvasSelectionBackdropCache(composite, 256 * 256 * 4)
    const rect = { x: 0, y: 0, width: 256, height: 256 }
    const first = cache.read(document, layer, [], source, false, rect, 1)
    first.fill(255) // Consumers must not corrupt the immutable cache tile.
    expect(cache.read(document, layer, [], source, false, rect, 1).every(value => value === 0)).toBe(true)
    expect(render).toHaveBeenCalledTimes(1)
    writeLayerColor(document, layer, 0, { r: 1, g: 2, b: 3, a: 255 })
    expect([...cache.read(document, layer, [], source, false, rect, 2).slice(0, 4)]).toEqual([1, 2, 3, 255])
    expect(render).toHaveBeenCalledTimes(2)
    cache.read(document, layer, [], { ...source }, false, rect, 2)
    expect(render).toHaveBeenCalledTimes(3)
    for (let x = 256; x < 1024; x += 256) cache.read(document, layer, [], source, false, { ...rect, x }, 2)
    expect(cache.retainedBytes).toBe(256 * 256 * 4)
    cache.read(document, layer, [], source, false, rect, 2)
    expect(render).toHaveBeenCalledTimes(7)
  })
})
