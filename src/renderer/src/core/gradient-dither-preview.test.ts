import { describe, expect, it } from 'vitest'
import { createGradientColorSampler, GRADIENT_DITHER_PRESETS } from './gradient-color'
import { createLinearDitherPreviewSampler } from './gradient-dither-preview'
import type { GradientStop } from '@shared/types'
import { packColor } from './raster'

const first = { r: 255, g: 17, b: 90, a: 0 }, last = { r: 20, g: 150, b: 250, a: 255 }
const custom: GradientStop[] = Array.from({ length: 8 }, (_, i) => ({ position: i / 7,
  color: { r: i * 31, g: 255 - i * 29, b: i * 17, a: i * 36 } }))
const duplicates = [custom[0], { ...custom[2], position: 0 }, { ...custom[3], position: 0.5 },
  { ...custom[4], position: 0.5 }, { ...custom[5], position: 1 }, { ...custom[7], position: 1 }]

describe('linear dither preview exact box averages', () => {
  it('does not introduce color bands when fractional zoom crosses an integer row', () => {
    const black = { r: 0, g: 0, b: 0, a: 255 }, white = { r: 255, g: 255, b: 255, a: 255 }
    const sampler = createLinearDitherPreviewSampler(black, white, { x: 0, y: 0 }, { x: 4000, y: 4000 }, 'bayer-2', 1000, 1007)
    const columns = [{ fromX: 1000.25, toX: 1006.25 }]
    const pixels = new Uint32Array(1)
    for (const fromY of [999.99998, 1000, 1000.00002, 1000.99998, 1001.00002]) {
      sampler.writeRow(fromY, fromY + 6, columns, pixels, 0)
      expect(pixels[0]).toBe(packColor({ r: 64, g: 64, b: 64, a: 255 }))
    }
  })
  for (const dither of GRADIENT_DITHER_PRESETS) {
    if (dither === 'none') continue
    it(dither + ' writes original source pixels without averaging or touching adjacent storage', () => {
      const start = { x: 11.5, y: -4 }, end = { x: -9, y: 14.25 }
      for (const stops of [undefined, custom, duplicates]) {
        const sampler = createLinearDitherPreviewSampler(first, last, start, end, dither, -3, 29, stops)
        const reference = createGradientColorSampler(first, last, start, end, dither, 'linear', {}, stops)
        const target = new Uint32Array(38).fill(0x12345678)
        for (const y of [-4, 0, 8, 12, 0]) {
          sampler.writeSourceRow(y, target, 3)
          expect(Array.from(target.slice(3, 35))).toEqual(Array.from({ length: 32 }, (_, x) => packColor(reference(x - 3, y))))
          expect(Array.from(target.slice(0, 3))).toEqual([0x12345678, 0x12345678, 0x12345678])
          expect(Array.from(target.slice(35))).toEqual([0x12345678, 0x12345678, 0x12345678])
        }
      }
    })
    it(dither + ' weights fractional pixel coverage instead of adding entire edge rows', () => {
      const start = { x: -20, y: -15 }, end = { x: 35, y: 28 }
      const sampler = createLinearDitherPreviewSampler(first, last, start, end, dither, -3, 30, custom)
      const reference = createGradientColorSampler(first, last, start, end, dither, 'linear', {}, custom)
      for (const fromY of [0, 0.25, 0.75, 1, 1.25, 9.5]) {
        const toY = fromY + 6.25
        const columns = [{ fromX: -2.75, toX: 3.5 }, { fromX: 3.5, toX: 9.75 }, { fromX: 9.75, toX: 16 }]
        const actual = new Uint32Array(columns.length)
        sampler.writeRow(fromY, toY, columns, actual, 0)
        columns.forEach((column, index) => {
          let a = 0, r = 0, g = 0, b = 0
          for (let y = Math.floor(fromY); y < Math.ceil(toY); y++) for (let x = Math.floor(column.fromX); x < Math.ceil(column.toX); x++) {
            const weight = (Math.min(x + 1, column.toX) - Math.max(x, column.fromX)) * (Math.min(y + 1, toY) - Math.max(y, fromY))
            const color = reference(x, y)
            a += color.a * weight; r += color.r * color.a * weight
            g += color.g * color.a * weight; b += color.b * color.a * weight
          }
          const color = { r: a ? Math.round(r / a) : 0, g: a ? Math.round(g / a) : 0,
            b: a ? Math.round(b / a) : 0, a: Math.round(a / ((column.toX - column.fromX) * (toY - fromY))) }
          expect(actual[index]).toBe(packColor(color))
          expect(sampler({ ...column, fromY, toY })).toEqual(color)
        })
      }
    })
    it(dither + ' batch rows preserve exact colors, alpha, overlaps and output boundaries', () => {
      const columns = [{ fromX: -3, toX: 1 }, null, { fromX: 0, toX: 5 }, { fromX: 5, toX: 12 }]
      for (const stops of [custom, custom.map(stop => ({ ...stop, color: { ...stop.color, a: 255 } }))]) {
        const start = { x: 10, y: -4 }, end = { x: -7, y: 14 }
        const sampler = createLinearDitherPreviewSampler(first, last, start, end, dither, -3, 12, stops)
        const reference = createGradientColorSampler(first, last, start, end, dither, 'linear', {}, stops)
        const actual = new Uint32Array(8).fill(0x12345678)
        const expected = actual.slice()
        for (const [fromY, toY] of [[0, 4], [3, 8], [-2, 2]]) {
          columns.forEach((column, x) => {
            if (!column) return
            let a = 0, r = 0, g = 0, b = 0, count = 0
            for (let y = fromY; y < toY; y++) for (let px = column.fromX; px < column.toX; px++) {
              const color = reference(px, y)
              count++; a += color.a; r += color.r * color.a; g += color.g * color.a; b += color.b * color.a
            }
            expected[2 + x] = packColor({ r: a ? Math.round(r / a) : 0, g: a ? Math.round(g / a) : 0,
              b: a ? Math.round(b / a) : 0, a: Math.round(a / count) })
          })
          sampler.writeRow(fromY, toY, columns, actual, 2)
          expect(actual).toEqual(expected)
        }
      }
    })
    it(dither + ' matches every source pixel for all directions, alpha and duplicate stops', () => {
      for (const stops of [undefined, custom, custom.map(stop => ({ ...stop, color: { ...stop.color, a: 255 } })), duplicates, [{ ...custom[0], position: 0.5 }, { ...custom[7], position: 0.5 }]]) {
        for (const end of [{ x: 30, y: 22 }, { x: -30, y: 22 }, { x: 0, y: 20 }, { x: 0, y: 0 }, { x: 0.00001, y: -15 }, { x: 24, y: 0 }]) {
          const start = { x: 0, y: 0 }
          const sample = createGradientColorSampler(first, last, start, end, dither, 'linear', {}, stops)
          const average = createLinearDitherPreviewSampler(first, last, start, end, dither, -13, 39, stops)
          // Include overlapping display blocks, single pixels and reverse row requests.
          for (const size of [1, 4, 13]) for (let y = -5; y < 16; y += size) for (let x = -13; x < 39; x += size) {
            const block = { fromX: x, fromY: y, toX: Math.min(39, x + size), toY: y + size }
            let a = 0, r = 0, g = 0, b = 0, count = 0
            for (let py = block.fromY; py < block.toY; py++) for (let px = block.fromX; px < block.toX; px++) {
              const color = sample(px, py)
              count++; a += color.a; r += color.r * color.a; g += color.g * color.a; b += color.b * color.a
            }
            expect(average(block)).toEqual({ r: a ? Math.round(r / a) : 0, g: a ? Math.round(g / a) : 0,
              b: a ? Math.round(b / a) : 0, a: Math.round(a / count) })
          }
        }
      }
    })
  }
})
