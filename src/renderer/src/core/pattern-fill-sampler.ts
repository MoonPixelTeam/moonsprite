import type { BrushPaintMode, FillPatternMode, ImageBrush, ImageBrushSettings } from '@shared/types-brush'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionRect } from '@shared/types-selection'
import { imageBrushCoverage, imageBrushCoverageAt, wrappedIndex } from './tools-pixel-edit'
import { proceduralBrushCoverageAt } from './brushes'
import { unpackColor } from './raster'
import { createPatternLayout, stampSourcePoint } from './pattern-fill'
import { DEFAULT_FILL_PATTERN_SETTINGS } from './pattern-fill-settings'

export interface FillPatternSample { coverage: number; color?: RgbaColor }
const EMPTY: FillPatternSample = { coverage: 0 }

export function createImageFillSampler(brush: ImageBrush, brushSize: number, imageSettings: ImageBrushSettings | undefined, antialias: number, paintMode: BrushPaintMode, start: { x: number; y: number }, bounds: SelectionRect, mode: FillPatternMode, settings = DEFAULT_FILL_PATTERN_SETTINGS, foreground: RgbaColor) {
  const origin = { x: paintMode === 'pattern-source' ? brush.sourceX ?? 0 : paintMode === 'pattern-target' ? start.x : 0, y: paintMode === 'pattern-source' ? brush.sourceY ?? 0 : paintMode === 'pattern-target' ? start.y : 0 }
  const sourceColors = brush.paintColors ?? brush.colors
  const colors = sourceColors?.length === brush.width * brush.height ? sourceColors : undefined
  const size = brush.id.startsWith('procedural:') || paintMode !== 'paint' ? Math.max(brush.width, brush.height) : brushSize
  const sampleSource = (x: number, y: number): FillPatternSample => {
    if (brush.id.startsWith('procedural:')) return { coverage: imageBrushCoverage(proceduralBrushCoverageAt(brush.id, x, y, size, brush.proceduralSettings), x, y, imageSettings, antialias) }
    if (colors) {
      const color = unpackColor(colors[wrappedIndex(y, brush.height) * brush.width + wrappedIndex(x, brush.width)] ?? 0)
      return color.a ? { coverage: 255, color } : EMPTY
    }
    return { coverage: brush.intrinsicSize ? brush.coverage[wrappedIndex(y, brush.height) * brush.width + wrappedIndex(x, brush.width)] ?? 0 : imageBrushCoverageAt(brush, x, y, size, imageSettings) }
  }
  const layout = mode === 'default' ? null : createPatternLayout(brush, mode, settings, bounds, origin)
  let lastX = NaN, lastY = NaN, last: FillPatternSample = EMPTY
  const sample = (x: number, y: number): FillPatternSample => {
    if (x === lastX && y === lastY) return last
    lastX = x; lastY = y
    if (!layout) return last = sampleSource(x - origin.x, y - origin.y)
    let alpha = 0, r = 0, g = 0, b = 0
    const candidates = layout.candidatesAt(x + 0.5, y + 0.5)
    // Front to back: transparent holes reveal earlier stamps; opaque pixels stop the scan.
    for (let i = candidates.length - 1; i >= 0; i--) {
      const stamp = layout.stamps[candidates[i]]
      const point = stampSourcePoint(stamp, x + 0.5, y + 0.5, brush.width, brush.height)
      if (!point) continue
      const source = sampleSource(point.x, point.y)
      if (source.coverage <= 0) continue
      const color = source.color ?? foreground
      const weight = (1 - alpha) * color.a / 255 * source.coverage / 255
      const channel = (value: number, tint: number) => Math.max(0, Math.min(255, value + tint + stamp.brightness))
      r += channel(color.r, stamp.tint[0]) * weight
      g += channel(color.g, stamp.tint[1]) * weight
      b += channel(color.b, stamp.tint[2]) * weight
      alpha += weight
      if (alpha >= 1) break
    }
    return last = alpha > 0 ? { coverage: 255, color: { r: Math.round(r / alpha), g: Math.round(g / alpha), b: Math.round(b / alpha), a: Math.round(alpha * 255) } } : EMPTY
  }
  return { sample, layout }
}
