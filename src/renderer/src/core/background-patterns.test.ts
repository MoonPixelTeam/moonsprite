import { describe, expect, it } from 'vitest'
import { backgroundPatternColorAt, renderBackgroundTileRgba } from './background-patterns'

const luminance = (pattern: Parameters<typeof backgroundPatternColorAt>[0], x: number, y: number): number =>
  backgroundPatternColorAt(pattern, x, y).r

describe('backgroundPatternColorAt', () => {
  it('matches the shipped background preset palette and tiles', () => {
    expect(luminance('grid', 0, 0)).toBe(214)
    expect(luminance('grid', 16, 0)).toBe(228)
    expect(luminance('stripes', 0, 0)).toBe(202)
    expect(luminance('stripes', 16, 0)).toBe(214)
    expect(luminance('stripes', 16, 16)).toBe(228)
    expect(luminance('diamond', 0, 0)).toBe(214)
    expect(luminance('diamond', 8, 8)).toBe(228)
    expect(luminance('diamond', 24, 8)).toBe(202)
    expect(luminance('diamond-nested', 0, 0)).toBe(228)
    expect(luminance('diamond-nested', 1, 0)).toBe(214)
    expect(luminance('circles', 0, 0)).toBe(214)
    expect(luminance('circles', 1, 0)).toBe(228)
  })

  it('repeats the supplied nested-diamond tile without substituting a generated pattern', () => {
    const pixels = new Uint8ClampedArray([
      228, 228, 228, 255, 214, 214, 214, 255,
      214, 214, 214, 255, 228, 228, 228, 255
    ])
    expect(Array.from(renderBackgroundTileRgba(4, 2, { id: 'diamond-nested.png', name: 'Diamond 2', width: 2, height: 2, pixels }))).toEqual([
      228, 228, 228, 255, 214, 214, 214, 255, 228, 228, 228, 255, 214, 214, 214, 255,
      214, 214, 214, 255, 228, 228, 228, 255, 214, 214, 214, 255, 228, 228, 228, 255
    ])
  })
})
