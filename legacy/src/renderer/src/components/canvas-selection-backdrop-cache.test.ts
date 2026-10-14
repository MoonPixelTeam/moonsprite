import { describe, expect, it, vi } from 'vitest'
import { createDocument, createLayer, compositeRegion, DocumentCompositeCache, writeLayerColor } from '@/core/document'
import { captureSelectionTransform } from '@/core/tools-selection-transform'
import { CanvasSelectionBackdropCache } from './canvas-selection-backdrop-cache'

describe('selection backdrop tiles', () => {
  it('fills only newly exposed strips and shares lower pixels without aliasing them', () => {
    const document = createDocument('partial cache', 512, 512, 'rgba')
    const lower = document.layers[0], active = createLayer('active', 512, 512, 'rgba')
    document.layers.push(active)
    new Uint32Array(lower.pixels.buffer).fill(0xff503020)
    new Uint32Array(active.pixels.buffer).fill(0x806090c0)
    const source = captureSelectionTransform(document, { x: 100, y: 100, width: 200, height: 200 }, active)!
    const composite = new DocumentCompositeCache(), render = vi.spyOn(composite, 'normalLayerRegion')
    const lowerCache = new CanvasSelectionBackdropCache(composite, undefined, true)
    const cache = new CanvasSelectionBackdropCache(composite, undefined, false, lowerCache)
    for (const rect of [{ x: 100, y: 100, width: 200, height: 200 }, { x: 99, y: 98, width: 203, height: 205 }]) {
      const backdrop = cache.read(document, active, [lower], source, false, rect, 1)
      backdrop.fill(0)
      const actual = lowerCache.read(document, active, [lower], source, false, rect, 1)
      expect(new Uint32Array(actual.buffer).every(value => value === 0xff503020)).toBe(true)
      expect(render.mock.calls.reduce((sum, [, , , , w, h]) => sum + w * h, 0)).toBe(rect.width * rect.height)
    }
  })
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
