import type { FillPatternMode, FillPatternSettings, ImageBrush } from '@shared/types-brush'
import type { SelectionRect } from '@shared/types-selection'
import { MAX_PATTERN_STAMPS, normalizeFillPatternSettings } from './pattern-fill-settings'
export { DEFAULT_FILL_PATTERN_SETTINGS } from './pattern-fill-settings'

export interface PatternStamp {
  x: number; y: number; halfWidth: number; halfHeight: number; brushIndex: number
}

// Integer PRNG for random stamp positions.
function randomGenerator(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function createPatternLayout(brush: Pick<ImageBrush, 'width' | 'height'>, mode: Exclude<FillPatternMode, 'default'>, raw: FillPatternSettings, bounds: SelectionRect, origin = { x: 0, y: 0 }, selectedBrushes: readonly Pick<ImageBrush, 'width' | 'height'>[] = [brush]) {
  const settings = normalizeFillPatternSettings(raw)
  const brushes = selectedBrushes.length ? selectedBrushes : [brush]
  const maxWidth = Math.max(...brushes.map(item => item.width)), maxHeight = Math.max(...brushes.map(item => item.height))
  const nextStamp = (x: number, y: number): PatternStamp => {
    const brushIndex = stamps.length % brushes.length
    const source = brushes[brushIndex]
    return { x, y, halfWidth: source.width / 2, halfHeight: source.height / 2, brushIndex }
  }
  const stamps: PatternStamp[] = []
  const cellSize = Math.max(1, Math.hypot(maxWidth, maxHeight) + (mode === 'random' ? settings.randomSpacing : 0))
  const bins = new Map<string, number[]>()
  const bucketRange = (s: PatternStamp, gap = 0) => ({ left: Math.floor((s.x - s.halfWidth - gap) / cellSize), right: Math.floor((s.x + s.halfWidth + gap) / cellSize), top: Math.floor((s.y - s.halfHeight - gap) / cellSize), bottom: Math.floor((s.y + s.halfHeight + gap) / cellSize) })
  const add = (s: PatternStamp) => {
    const index = stamps.length; stamps.push(s)
    const range = bucketRange(s)
    for (let y = range.top; y <= range.bottom; y++) for (let x = range.left; x <= range.right; x++) {
      const key = x + ':' + y, bucket = bins.get(key)
      if (bucket) bucket.push(index); else bins.set(key, [index])
    }
  }
  const collides = (s: PatternStamp, gap: number) => {
    const range = bucketRange(s, gap)
    for (let y = range.top; y <= range.bottom; y++) for (let x = range.left; x <= range.right; x++) {
      for (const index of bins.get(x + ':' + y) ?? []) {
        const other = stamps[index]
        if (Math.abs(s.x - other.x) < s.halfWidth + other.halfWidth + gap && Math.abs(s.y - other.y) < s.halfHeight + other.halfHeight + gap) return true
      }
    }
    return false
  }
  let requested = 0, attempts = 0
  if (bounds.width > 0 && bounds.height > 0 && brush.width > 0 && brush.height > 0) {
    if (mode === 'random') {
      const random = randomGenerator(Math.floor(Math.random() * 0x100000000))
      const meanArea = brushes.reduce((sum, item) => sum + item.width * item.height, 0) / brushes.length
      requested = settings.randomCount || Math.round(bounds.width * bounds.height / meanArea * settings.randomDensity / 100)
      const target = Math.min(MAX_PATTERN_STAMPS, requested)
      const limit = Math.max(target, target * (settings.randomOverlap && settings.randomSpacing === 0 ? 1 : 12))
      while (stamps.length < target && attempts < limit) {
        attempts++
        // Raster brushes are sampled at pixel centers. Quantize random stamp
        // centers to the same half-pixel grid used by regular layout so an
        // unrotated 4×4 stamp stays a complete 4×4 stamp instead of being
        // truncated to a few edge pixels by a fractional center.
        const x = Math.floor(bounds.x + random() * bounds.width) + 0.5
        const y = Math.floor(bounds.y + random() * bounds.height) + 0.5
        const s = nextStamp(x, y)
        // Spacing is edge-to-edge bounding-box distance; overlap permits intersections only at zero spacing.
        if ((!settings.randomOverlap || settings.randomSpacing > 0) && collides(s, settings.randomSpacing)) continue
        add(s)
      }
    } else {
      const sample = { halfWidth: maxWidth / 2, halfHeight: maxHeight / 2 }
      const stepX = Math.max(1, sample.halfWidth * 2 + (settings.regularOverlap ? settings.regularSpacingX : Math.max(0, settings.regularSpacingX)))
      const stepY = Math.max(1, sample.halfHeight * 2 + (settings.regularOverlap ? settings.regularSpacingY : Math.max(0, settings.regularSpacingY)))
      const firstRow = Math.floor((bounds.y - origin.y) / stepY) - 1
      const lastRow = Math.ceil((bounds.y + bounds.height - origin.y) / stepY)
      const limit = settings.regularCount || MAX_PATTERN_STAMPS
      outer: for (let row = firstRow; row <= lastRow; row++) {
        const y = origin.y + sample.halfHeight + row * stepY
        if (y + sample.halfHeight <= bounds.y || y - sample.halfHeight >= bounds.y + bounds.height) continue
        const offset = (row % 2 !== 0 ? settings.regularRowOffset / 100 : 0) * stepX
        const firstColumn = Math.floor((bounds.x - origin.x - offset) / stepX) - 1
        const lastColumn = Math.ceil((bounds.x + bounds.width - origin.x - offset) / stepX)
        for (let column = firstColumn; column <= lastColumn; column++) {
          const x = origin.x + sample.halfWidth + column * stepX + offset
          if (x + sample.halfWidth <= bounds.x || x - sample.halfWidth >= bounds.x + bounds.width) continue
          requested++; attempts++
          if (stamps.length >= limit) break outer
          const candidate = nextStamp(x, y)
          if (candidate.x + candidate.halfWidth <= bounds.x || candidate.x - candidate.halfWidth >= bounds.x + bounds.width
            || candidate.y + candidate.halfHeight <= bounds.y || candidate.y - candidate.halfHeight >= bounds.y + bounds.height) continue
          add(candidate)
        }
      }
    }
  }
  return { stamps, requested, attempts, limited: requested > stamps.length, candidatesAt: (x: number, y: number): readonly number[] => bins.get(Math.floor(x / cellSize) + ':' + Math.floor(y / cellSize)) ?? [] }
}

export function stampSourcePoint(s: PatternStamp, x: number, y: number, width: number, height: number) {
  const sourceX = Math.floor(x - s.x + width / 2)
  const sourceY = Math.floor(y - s.y + height / 2)
  return sourceX >= 0 && sourceY >= 0 && sourceX < width && sourceY < height ? { x: sourceX, y: sourceY } : null
}
