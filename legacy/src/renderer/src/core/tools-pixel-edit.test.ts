import { describe, expect, it } from 'vitest'
import { createDocument, createLayerMask, getActiveLayer, getPaletteEntry, paletteColorIdForCanvas } from './document-model'
import { blendOver, packColor, unpackColor } from './raster'
import { compositeSelectionPixelOver } from './tools-pixel-edit'

describe('selection source-over fast paths', () => {
  it('matches color compositing for every source/destination alpha pair', () => {
    const document = createDocument('blend equivalence', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    let seed = 123456789
    const rgb = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed & 0xffffff }
    for (let sourceAlpha = 0; sourceAlpha < 256; sourceAlpha++) {
      for (let destinationAlpha = 0; destinationAlpha < 256; destinationAlpha++) {
        const source = ((sourceAlpha << 24) | rgb()) >>> 0
        const destination = ((destinationAlpha << 24) | rgb()) >>> 0
        const expected = sourceAlpha === 0 ? destination : packColor(blendOver(unpackColor(destination), unpackColor(source)))
        const actual = compositeSelectionPixelOver(document, layer, destination, source)
        if (actual !== expected) throw new Error(`blend mismatch at alpha ${sourceAlpha}/${destinationAlpha}: ${actual} != ${expected}`)
      }
    }
  })

  it('keeps mask values as direct writes, including transparent values', () => {
    const document = createDocument('mask', 1, 1, 'rgba')
    const mask = createLayerMask(document.activeLayerId, 1, 1)
    expect(compositeSelectionPixelOver(document, mask, 0xffffffff, 0)).toBe(0)
    expect(compositeSelectionPixelOver(document, mask, 0xffffffff, 0x80404040)).toBe(0x80404040)
  })

  it('keeps indexed compositing on palette colors rather than treating IDs as packed RGBA', () => {
    const document = createDocument('indexed', 1, 1, 'indexed')
    const layer = getActiveLayer(document)
    const destination = paletteColorIdForCanvas(document, { r: 40, g: 70, b: 90, a: 255 })
    for (const alpha of [0, 128, 255]) {
      const source = paletteColorIdForCanvas(document, { r: 220, g: 80, b: 30, a: alpha })
      const top = getPaletteEntry(document, source).color
      const expected = top.a === 0 ? destination : paletteColorIdForCanvas(document, blendOver(getPaletteEntry(document, destination).color, top))
      expect(compositeSelectionPixelOver(document, layer, destination, source)).toBe(expected)
    }
  })
})
