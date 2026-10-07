import { beforeEach, describe, expect, it } from 'vitest'
import { createCompositePointSampler, createDocument, createLayer, getActiveLayer, readLayerColorAt, writeLayerColor, findOrAddPaletteColor } from './document'
import { loadEyedropperSource, renderEyedropperLayerRegion, sampleEyedropperColor, saveEyedropperSource } from './eyedropper-source'

beforeEach(() => localStorage.clear())

describe('eyedropper color source', () => {
  it('defaults to the canvas composite and remembers the selected source', () => {
    expect(loadEyedropperSource()).toBe('composite')
    saveEyedropperSource('current-layer')
    expect(loadEyedropperSource()).toBe('current-layer')
    saveEyedropperSource('composite')
    expect(loadEyedropperSource()).toBe('composite')
    localStorage.setItem('moonsprite.preference.eyedropper-source', 'invalid')
    expect(loadEyedropperSource()).toBe('composite')
  })

  it.each(['rgba', 'indexed'] as const)('reads raw %s pixels with offsets and alpha, independently of layer appearance', (format) => {
    const document = createDocument('eyedropper', 4, 4, format)
    const blue = { r: 0, g: 0, b: 255, a: 255 }
    const red = { r: 255, g: 0, b: 0, a: 128 }
    if (format === 'indexed') { findOrAddPaletteColor(document, blue, true); findOrAddPaletteColor(document, red, true) }
    const base = getActiveLayer(document)
    writeLayerColor(document, base, 5, blue)
    const top = createLayer('top', 2, 2, format)
    document.layers.push(top)
    top.width = 2; top.height = 2; top.offsetX = 1; top.offsetY = 1
    top.pixels = format === 'rgba' ? new Uint8ClampedArray(16) : new Uint32Array(4)
    document.activeLayerId = top.id
    top.opacity = 0.5
    top.blendMode = 'multiply'
    writeLayerColor(document, top, 0, red)
    const composite = createCompositePointSampler(document)
    const before = top.pixels.slice()
    expect(sampleEyedropperColor(document, 1, 1, composite)).toEqual(composite(1, 1))
    expect(sampleEyedropperColor(document, 1, 1, composite)).not.toEqual(red)
    saveEyedropperSource('current-layer')
    expect(sampleEyedropperColor(document, 1, 1, composite)).toEqual(red)
    top.visible = false
    expect(sampleEyedropperColor(document, 1, 1, composite)).toEqual(red)
    expect(sampleEyedropperColor(document, 0, 0, composite).a).toBe(0)
    expect(sampleEyedropperColor(document, -1, 1, composite).a).toBe(0)
    const region = renderEyedropperLayerRegion(document, 0, 0, 4, 4)
    expect(Array.from(region.slice(20, 24))).toEqual([red.r, red.g, red.b, red.a])
    expect(top.pixels).toEqual(before)
    document.activeLayerId = base.id
    expect(sampleEyedropperColor(document, 1, 1, composite)).toEqual(readLayerColorAt(document, base, 1, 1))
  })
})
