import { expect, it } from 'vitest'
import { createPatternLayout, stampSourcePoint } from './pattern-fill'
import { DEFAULT_FILL_PATTERN_SETTINGS, normalizeFillPatternSettings } from './pattern-fill-settings'
import { createImageFillSampler } from './pattern-fill-sampler'
import { packColor } from './raster'

it('places original-size stamps without transform or color metadata', () => {
  const brush = { width: 3, height: 2 }
  for (const mode of ['random', 'regular'] as const) {
    const layout = createPatternLayout(brush, mode, { ...DEFAULT_FILL_PATTERN_SETTINGS, randomCount: 2 }, { x: 0, y: 0, width: 30, height: 20 })
    expect(layout.stamps.length).toBeGreaterThan(0)
    for (const stamp of layout.stamps) {
      expect(stamp).toEqual({ x: stamp.x, y: stamp.y, halfWidth: 1.5, halfHeight: 1, brushIndex: 0 })
      expect(stampSourcePoint(stamp, stamp.x - 1, stamp.y - 0.5, 3, 2)).toEqual({ x: 0, y: 0 })
      expect(stampSourcePoint(stamp, stamp.x + 1, stamp.y + 0.5, 3, 2)).toEqual({ x: 2, y: 1 })
    }
  }
})

it('samples original colors and alpha without tinting or rotating the pattern', () => {
  const colors = [{ r: 20, g: 100, b: 200, a: 255 }, { r: 240, g: 60, b: 10, a: 128 }]
  const brush = { id: 'source', name: 'Source', width: 2, height: 1, coverage: new Uint8Array([255, 255]), colors: new Uint32Array(colors.map(packColor)), intrinsicSize: true }
  const sampler = createImageFillSampler(brush, 1, undefined, 0, 'pattern-source', { x: 0, y: 0 }, { x: 0, y: 0, width: 4, height: 1 }, 'regular', DEFAULT_FILL_PATTERN_SETTINGS, { r: 0, g: 0, b: 0, a: 255 })
  expect([0, 1, 2, 3].map(x => sampler.sample(x, 0).color)).toEqual([...colors, ...colors])
})

it('drops retired fields when loading legacy settings', () => {
  const legacy = { ...DEFAULT_FILL_PATTERN_SETTINGS, randomCount: 12, randomScaleMin: 20, randomScaleMax: 300, randomRotate: true, randomAngle: 90, randomColor: 80, randomBrightness: 60, regularScale: 200, regularAngle: 45 }
  expect(normalizeFillPatternSettings(legacy)).toEqual({ ...DEFAULT_FILL_PATTERN_SETTINGS, randomCount: 12 })
})

it.each(['random', 'regular'] as const)('divides %s stamp counts evenly across differently sized patterns', mode => {
  const brushes = [{ width: 1, height: 2 }, { width: 3, height: 1 }, { width: 2, height: 3 }]
  const layout = createPatternLayout(brushes[0], mode, { ...DEFAULT_FILL_PATTERN_SETTINGS, randomCount: 11, regularCount: 11 }, { x: 0, y: 0, width: 60, height: 60 }, { x: 0, y: 0 }, brushes)
  expect(brushes.map((_, index) => layout.stamps.filter(stamp => stamp.brushIndex === index).length)).toEqual([4, 4, 3])
  for (const stamp of layout.stamps) {
    expect(stamp.halfWidth * 2).toBe(brushes[stamp.brushIndex].width)
    expect(stamp.halfHeight * 2).toBe(brushes[stamp.brushIndex].height)
  }
})

it('keeps accepted counts balanced when spacing rejects random positions', () => {
  const brushes = [{ width: 2, height: 2 }, { width: 4, height: 4 }]
  const layout = createPatternLayout(brushes[0], 'random', { ...DEFAULT_FILL_PATTERN_SETTINGS, randomCount: 100, randomOverlap: false, randomSpacing: 2 }, { x: 0, y: 0, width: 20, height: 20 }, { x: 0, y: 0 }, brushes)
  const counts = brushes.map((_, index) => layout.stamps.filter(stamp => stamp.brushIndex === index).length)
  expect(layout.stamps.length).toBeGreaterThan(0)
  expect(layout.attempts).toBeGreaterThan(layout.stamps.length)
  expect(Math.abs(counts[0] - counts[1])).toBeLessThanOrEqual(1)
})

it.each(['default', 'regular'] as const)('samples every selected pattern in %s mode', mode => {
  const colors = [{ r: 200, g: 20, b: 10, a: 255 }, { r: 10, g: 20, b: 200, a: 255 }]
  const brushes = colors.map((color, index) => ({ id: String(index), name: String(index), width: 1, height: 1, intrinsicSize: true, coverage: new Uint8Array([255]), colors: new Uint32Array([packColor(color)]) }))
  const sampler = createImageFillSampler(brushes[1], 1, undefined, 0, 'pattern-source', { x: 0, y: 0 }, { x: 0, y: 0, width: 5, height: 1 }, mode, DEFAULT_FILL_PATTERN_SETTINGS, colors[0], brushes)
  expect([0, 1, 2, 3, 4].map(x => sampler.sample(x, 0).color)).toEqual([colors[0], colors[1], colors[0], colors[1], colors[0]])
})
