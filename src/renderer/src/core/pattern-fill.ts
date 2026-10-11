import type { FillPatternMode, FillPatternSettings, ImageBrush } from '@shared/types-brush'
import type { SelectionRect } from '@shared/types-selection'
import { MAX_PATTERN_STAMPS, normalizeFillPatternSettings } from './pattern-fill-settings'
export { DEFAULT_FILL_PATTERN_SETTINGS } from './pattern-fill-settings'

export interface PatternStamp {
  x: number; y: number; scale: number; angle: number; cos: number; sin: number
  halfWidth: number; halfHeight: number; tint: [number, number, number]; brightness: number
}

// Integer PRNG: positions, rotation, scale and tint consume independent draws.
function randomGenerator(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function stamp(x: number, y: number, scale: number, angle: number, width: number, height: number, tint: [number, number, number], brightness: number): PatternStamp {
  const radians = angle * Math.PI / 180
  const cos = Math.cos(radians), sin = Math.sin(radians)
  return { x, y, scale, angle, cos, sin, halfWidth: (Math.abs(cos) * width + Math.abs(sin) * height) * scale / 2,
    halfHeight: (Math.abs(sin) * width + Math.abs(cos) * height) * scale / 2, tint, brightness }
}

export function createPatternLayout(brush: Pick<ImageBrush, 'width' | 'height'>, mode: Exclude<FillPatternMode, 'default'>, raw: FillPatternSettings, bounds: SelectionRect, origin = { x: 0, y: 0 }) {
  const settings = normalizeFillPatternSettings(raw)
  const stamps: PatternStamp[] = []
  const maxScale = (mode === 'random' ? settings.randomScaleMax : settings.regularScale) / 100
  const cellSize = Math.max(1, Math.hypot(brush.width, brush.height) * maxScale + (mode === 'random' ? settings.randomSpacing : 0))
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
      const min = settings.randomScaleMin / 100, max = settings.randomScaleMax / 100
      const meanArea = brush.width * brush.height * (min * min + min * max + max * max) / 3
      requested = settings.randomCount || Math.round(bounds.width * bounds.height / meanArea * settings.randomDensity / 100)
      const target = Math.min(MAX_PATTERN_STAMPS, requested)
      const limit = Math.max(target, target * (settings.randomOverlap && settings.randomSpacing === 0 ? 1 : 12))
      while (stamps.length < target && attempts < limit) {
        attempts++
        const x = bounds.x + random() * bounds.width, y = bounds.y + random() * bounds.height
        const scale = min + random() * (max - min)
        const angle = settings.randomRotate ? (random() * 2 - 1) * settings.randomAngle : 0
        const tint: [number, number, number] = [(random() * 2 - 1) * settings.randomColor * 2.55, (random() * 2 - 1) * settings.randomColor * 2.55, (random() * 2 - 1) * settings.randomColor * 2.55]
        const s = stamp(x, y, scale, angle, brush.width, brush.height, tint, (random() * 2 - 1) * settings.randomBrightness * 2.55)
        // Spacing is edge-to-edge bounding-box distance; overlap permits intersections only at zero spacing.
        if ((!settings.randomOverlap || settings.randomSpacing > 0) && collides(s, settings.randomSpacing)) continue
        add(s)
      }
    } else {
      const scale = settings.regularScale / 100
      const sample = stamp(0, 0, scale, settings.regularAngle, brush.width, brush.height, [0, 0, 0], 0)
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
          add({ ...sample, x, y })
        }
      }
    }
  }
  return { stamps, requested, attempts, limited: requested > stamps.length, candidatesAt: (x: number, y: number): readonly number[] => bins.get(Math.floor(x / cellSize) + ':' + Math.floor(y / cellSize)) ?? [] }
}

export function stampSourcePoint(s: PatternStamp, x: number, y: number, width: number, height: number) {
  const dx = (x - s.x) / s.scale, dy = (y - s.y) / s.scale
  const sourceX = Math.floor(dx * s.cos + dy * s.sin + width / 2)
  const sourceY = Math.floor(-dx * s.sin + dy * s.cos + height / 2)
  return sourceX >= 0 && sourceY >= 0 && sourceX < width && sourceY < height ? { x: sourceX, y: sourceY } : null
}
