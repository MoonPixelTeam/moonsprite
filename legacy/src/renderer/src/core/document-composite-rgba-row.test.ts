import { expect, it } from 'vitest'
import { compositeRgbaRowWithOpaqueSpans } from './document-composite-rgba-row'

it('matches the original byte rounding for every source/destination alpha and RGB channel pair', () => {
  // All alpha pairs and all channel pairs, including values near rounding
  // boundaries. Alternate fast and general cases inside each row.
  const count = 256 * 256, source = new Uint8ClampedArray(count * 4)
  const output = new Uint8ClampedArray(count * 4), expected = new Uint8ClampedArray(count * 4)
  const verify = (alphaPairs: boolean) => {
    for (let top = 0; top < 256; top++) for (let bottom = 0; bottom < 256; bottom++) {
      const i = (top * 256 + bottom) * 4
      source.set(alphaPairs ? [top, 255 - bottom, 127, top] : [top, 255 - top, bottom, (top * 37 + bottom * 11) % 255 + 1], i)
      output.set(alphaPairs ? [bottom, 255 - top, 128, bottom] : [bottom, top, 255 - bottom, (top + bottom) % 2 ? 255 : 0], i)
    }
    expected.set(output)
    for (let i = 0; i < expected.length; i += 4) {
      if (!source[i + 3]) continue
      const topAlpha = source[i + 3] / 255, bottomAlpha = expected[i + 3] / 255
      const alpha = topAlpha + bottomAlpha * (1 - topAlpha)
      for (let channel = 0; channel < 3; channel++) expected[i + channel] = Math.round((source[i + channel] * topAlpha + expected[i + channel] * bottomAlpha * (1 - topAlpha)) / alpha)
      expected[i + 3] = Math.round(alpha * 255)
    }
    compositeRgbaRowWithOpaqueSpans(output, source, 0, 0, count)
    expect(output).toEqual(expected)
  }
  verify(true)
  verify(false)
})
