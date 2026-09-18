import { describe, expect, it } from 'vitest'
import { PIXEL_FORMATS, quantizePixelColor } from './pixel-format'
import { parsePixelFormat, loadEditorPreferences, saveEditorPreferences, DEFAULT_EDITOR_PREFERENCES } from './file-preferences'
import { createDocument, normalizeDocumentColor, readLayerColor, writeLayerColor, writeLayerPacked, writeLayerPackedRun } from './document-model'
import { decodeProject, encodeProject } from './project-format'
import { packColor } from './raster'

describe('pixel format quantization', () => {
  it('keeps RGBA32 unchanged', () => {
    expect(quantizePixelColor({ r: 17, g: 33, b: 65, a: 127 }, 'rgba32')).toEqual({ r: 17, g: 33, b: 65, a: 127 })
  })

  it('removes alpha from RGB24 and RGB565', () => {
    expect(quantizePixelColor({ r: 17, g: 33, b: 65, a: 127 }, 'rgb24').a).toBe(255)
    expect(quantizePixelColor({ r: 17, g: 33, b: 65, a: 127 }, 'rgb565').a).toBe(255)
  })

  it('uses one bit of alpha for ARGB1555', () => {
    expect(quantizePixelColor({ r: 17, g: 33, b: 65, a: 128 }, 'argb1555').a).toBe(255)
    expect(quantizePixelColor({ r: 17, g: 33, b: 65, a: 127 }, 'argb1555').a).toBe(0)
  })

  it.each([
    ['rgb332', 8, 8, 4, 1],
    ['rgb555', 32, 32, 32, 1],
    ['rgba4444', 16, 16, 16, 16],
    ['rgba5551', 32, 32, 32, 2]
  ] as const)('%s produces exactly the specified channel levels', (format, r, g, b, a) => {
    const colors = Array.from({ length: 256 }, (_, value) => quantizePixelColor({ r: value, g: value, b: value, a: value }, format))
    for (const [channel, count] of [['r', r], ['g', g], ['b', b], ['a', a]] as const) {
      expect(new Set(colors.map((color) => color[channel])).size).toBe(count)
    }
    for (const color of colors) expect(quantizePixelColor(color, format)).toEqual(color)
  })

  it('quantizes RGBA4444 transparency and RGBA5551 alpha boundaries', () => {
    expect(quantizePixelColor({ r: 17, g: 33, b: 65, a: 127 }, 'rgba4444')).toEqual({ r: 17, g: 34, b: 68, a: 119 })
    expect(quantizePixelColor({ r: 17, g: 33, b: 65, a: 127 }, 'rgba5551').a).toBe(0)
    expect(quantizePixelColor({ r: 17, g: 33, b: 65, a: 128 }, 'rgba5551').a).toBe(255)
  })

  it.each(PIXEL_FORMATS)('persists %s preferences and project pixels', (format) => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } } as Storage
    saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, pixelFormat: format }, storage)
    expect(loadEditorPreferences(storage).pixelFormat).toBe(format)
    expect(parsePixelFormat(format)).toBe(format)
    const document = createDocument('pixel format', 2, 2, 'rgba', false, format)
    const color = { r: 79, g: 129, b: 191, a: 143 }
    const expected = quantizePixelColor(color, format)
    const layer = document.layers[0]
    writeLayerColor(document, layer, 0, color)
    writeLayerPacked(document, layer, 1, packColor(color))
    writeLayerPackedRun(document, layer, 2, 2, packColor(color))
    const reopened = decodeProject(encodeProject(document))
    expect(reopened.pixelFormat).toBe(format)
    for (let index = 0; index < 4; index += 1) expect(readLayerColor(reopened, reopened.layers[0], index)).toEqual(expected)
  })

  it('defaults unknown preferences to RGBA32', () => {
    expect(parsePixelFormat('yuv420')).toBe('rgba32')
    expect(parsePixelFormat(null)).toBe('rgba32')
  })

  it.each(['indexed', 'grayscale'] as const)('does not apply pixel formats to %s documents', (mode) => {
    const document = createDocument('other mode', 2, 2, mode, false, 'rgb332')
    expect(document.pixelFormat).toBeUndefined()
    const color = { r: 80, g: 120, b: 160, a: 127 }
    const expected = normalizeDocumentColor(document, color)
    document.pixelFormat = 'rgb332'
    expect(normalizeDocumentColor(document, color)).toEqual(expected)
    expect(decodeProject(encodeProject(document)).pixelFormat).toBeUndefined()
  })
})
