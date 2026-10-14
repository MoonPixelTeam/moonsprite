import { describe, expect, it } from 'vitest'
import { createGradientMapSampler, normalizeGradientMap } from './gradient-map'

const settings = normalizeGradientMap({ stops: [
  { position: 0, color: { r: 0, g: 0, b: 255, a: 255 } },
  { position: 1, color: { r: 255, g: 255, b: 0, a: 255 } }
] })

describe('gradient mapping', () => {
  it('maps luminance and preserves source transparency', () => {
    const map = createGradientMapSampler(settings)
    expect(map({ r: 0, g: 0, b: 0, a: 72 })).toEqual({ r: 0, g: 0, b: 255, a: 72 })
    expect(map({ r: 255, g: 255, b: 255, a: 255 })).toEqual({ r: 255, g: 255, b: 0, a: 255 })
    expect(map({ r: 128, g: 128, b: 128, a: 128 })).toEqual({ r: 128, g: 128, b: 127, a: 128 })
    expect(map({ r: 12, g: 34, b: 56, a: 0 })).toEqual({ r: 12, g: 34, b: 56, a: 0 })
  })
  it('uses finite settings and independent stop copies', () => {
    const source = { stops: [{ position: 0, color: { r: NaN, g: 900, b: -3 } }, { position: 1, color: {} }] }
    const normalized = normalizeGradientMap(source)
    expect(normalized.stops[0].color).toEqual({ r: 0, g: 255, b: 0, a: 255 })
    normalized.stops[0].position = 0.4
    expect(source.stops[0].position).toBe(0)
  })
  it('supports reversed and discrete ramps', () => {
    const reversed = createGradientMapSampler({ ...settings, reverse: true })
    expect(reversed({ r: 0, g: 0, b: 0, a: 255 }).r).toBe(255)
    const steps = createGradientMapSampler({ ...settings, mode: 'steps' })
    expect(steps({ r: 100, g: 100, b: 100, a: 255 })).toEqual(settings.stops[0].color)
    expect(steps({ r: 200, g: 200, b: 200, a: 255 })).toEqual(settings.stops[1].color)
  })
  it('keeps dither stable across independently rendered regions', () => {
    const map = createGradientMapSampler({ ...settings, dither: 'bayer-4' })
    const source = { r: 128, g: 128, b: 128, a: 123 }
    const whole = Array.from({ length: 16 }, (_, x) => map(source, x - 4, 3))
    const split = [0, 8].flatMap(start => Array.from({ length: 8 }, (_, x) => map(source, start + x - 4, 3)))
    expect(split).toEqual(whole)
    expect(new Set(whole.map(c => c.r)).size).toBe(2)
    expect(whole.every(c => c.a === 123)).toBe(true)
  })
})


it('matches direct gradient colors for every dither preset at negative and positive coordinates', async () => {
  const { GRADIENT_DITHER_PRESETS, gradientColorForAmount } = await import('./gradient-color')
  for (const dither of GRADIENT_DITHER_PRESETS) for (const reverse of [false, true]) {
    const map = createGradientMapSampler({ ...settings, dither, reverse })
    for (let y = -9; y < 9; y++) for (let x = -9; x < 9; x++) {
      const source = { r: (x + 9) * 13, g: (y + 9) * 13, b: 37, a: 123 }
      const luminance = Math.round(source.r * 0.2126 + source.g * 0.7152 + source.b * 0.0722)
      const amount = reverse ? 1 - luminance / 255 : luminance / 255
      const expected = gradientColorForAmount(settings.stops[0].color, settings.stops[1].color, amount, x, y, dither)
      expect(map(source, x, y)).toEqual({ ...expected, a: source.a })
    }
  }
})
