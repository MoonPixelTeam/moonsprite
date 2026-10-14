import { describe, expect, it } from 'vitest'
import { createDocument, getActiveLayer, readLayerColorAt } from './document'
import { beginPixelEdit, commitPixelEdit } from './history'
import { paintBrush } from './tools-brush'
import { ensureLayerCoversEditRect } from './tools-pixel-edit'

const color = { r: 41, g: 121, b: 255, a: 128 }

describe('cropped layer stroke expansion', () => {
  for (const format of ['rgba', 'indexed'] as const) {
    it(`amortizes continuous ${format} painting without changing pixels or history`, () => {
      const document = createDocument('cropped stroke', 1024, 256, format)
      const paintColor = format === 'indexed' ? { ...color, a: 255 } : color
      const layer = getActiveLayer(document)
      layer.width = 32
      layer.height = 32
      layer.offsetX = 64
      layer.offsetY = 64
      layer.pixels = format === 'rgba' ? new Uint8ClampedArray(32 * 32 * 4) : new Uint32Array(32 * 32)
      const edit = beginPixelEdit(layer.id)
      let allocations = 0
      const start = performance.now()
      for (let x = 80; x < 480; x += 1) {
        const previous = layer.pixels
        paintBrush(document, layer, edit, x, 80, 17, paintColor, 'square')
        if (previous !== layer.pixels) allocations += 1
      }
      console.info(`cropped ${format}: ${allocations} allocations, ${(performance.now() - start).toFixed(1)}ms`)
      expect(allocations).toBeLessThanOrEqual(8)
      for (let x = 72; x < 488; x += 1) expect(readLayerColorAt(document, layer, x, 80)).toEqual(paintColor)
      const entry = commitPixelEdit(document, edit, 'stroke')!
      entry.undo()
      for (let x = 72; x < 488; x += 1) expect(readLayerColorAt(document, layer, x, 80).a).toBe(0)
      entry.redo()
      for (let x = 72; x < 488; x += 1) expect(readLayerColorAt(document, layer, x, 80)).toEqual(paintColor)
    })
  }

  it('keeps existing storage when only the optional padding crosses its edge', () => {
    const document = createDocument('edge', 512, 512, 'rgba')
    const layer = getActiveLayer(document)
    layer.width = 100
    layer.height = 100
    layer.offsetX = 100
    layer.offsetY = 100
    layer.pixels = new Uint8ClampedArray(100 * 100 * 4)
    const pixels = layer.pixels
    expect(ensureLayerCoversEditRect(document, layer, beginPixelEdit(layer.id), { x: 100, y: 100, width: 1, height: 1 })).toBe(true)
    expect(layer.pixels === pixels).toBe(true)
    expect(ensureLayerCoversEditRect(document, layer, beginPixelEdit(layer.id), { x: -100, y: -100, width: 1, height: 1 })).toBe(false)
    expect(layer.pixels === pixels).toBe(true)
  })
})
