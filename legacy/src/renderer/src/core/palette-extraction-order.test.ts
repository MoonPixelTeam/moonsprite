import { describe, expect, it } from 'vitest'
import { extractPaletteColorsInScanlineOrderFromRgbaSurfaces } from './palette'

describe('palette extraction scanline order', () => {
  it('keeps the first opaque occurrence of every color from left to right, row by row', () => {
    const colors = extractPaletteColorsInScanlineOrderFromRgbaSurfaces([
      new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 255,
        0, 0, 255, 255, 255, 0, 0, 255,
        255, 255, 255, 0, 255, 255, 0, 255
      ])
    ], 16)

    expect(colors).toEqual([
      { r: 255, g: 0, b: 0, a: 255 },
      { r: 0, g: 255, b: 0, a: 255 },
      { r: 0, g: 0, b: 255, a: 255 },
      { r: 255, g: 255, b: 0, a: 255 }
    ])
  })

  it('uses the requested limit as an ordered cutoff instead of quantizing or sorting', () => {
    const colors = extractPaletteColorsInScanlineOrderFromRgbaSurfaces([
      new Uint8ClampedArray([
        12, 0, 0, 255, 0, 34, 0, 255,
        0, 0, 56, 255
      ])
    ], 2)

    expect(colors).toEqual([
      { r: 12, g: 0, b: 0, a: 255 },
      { r: 0, g: 34, b: 0, a: 255 }
    ])
  })
})
