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

export function createImageFillSampler(brush: ImageBrush, brushSize: number, imageSettings: ImageBrushSettings | undefined, antialias: number, paintMode: BrushPaintMode, start: { x: number; y: number }, bounds: SelectionRect, mode: FillPatternMode, settings = DEFAULT_FILL_PATTERN_SETTINGS, foreground: RgbaColor, selectedBrushes?: readonly ImageBrush[]) {
  const origin = { x: paintMode === 'pattern-source' ? brush.sourceX ?? 0 : paintMode === 'pattern-target' ? start.x : 0, y: paintMode === 'pattern-source' ? brush.sourceY ?? 0 : paintMode === 'pattern-target' ? start.y : 0 }
  const brushes = selectedBrushes?.length ? selectedBrushes : [brush]
  const sources = brushes.map(brush => {
    const sourceColors = brush.paintColors ?? brush.colors
    const colors = sourceColors?.length === brush.width * brush.height ? sourceColors : undefined
    const size = brush.id.startsWith('procedural:') || paintMode !== 'paint' ? Math.max(brush.width, brush.height) : brushSize
    return (x: number, y: number): FillPatternSample => {
      if (brush.id.startsWith('procedural:')) return { coverage: imageBrushCoverage(proceduralBrushCoverageAt(brush.id, x, y, size, brush.proceduralSettings), x, y, imageSettings, antialias) }
      if (colors) {
        const color = unpackColor(colors[wrappedIndex(y, brush.height) * brush.width + wrappedIndex(x, brush.width)] ?? 0)
        return color.a ? { coverage: 255, color } : EMPTY
      }
      return { coverage: brush.intrinsicSize ? brush.coverage[wrappedIndex(y, brush.height) * brush.width + wrappedIndex(x, brush.width)] ?? 0 : imageBrushCoverageAt(brush, x, y, size, imageSettings) }
    }
  })
  const layoutMode = mode === 'default' && brushes.length > 1 ? 'regular' : mode
  const layout = layoutMode === 'default' ? null : createPatternLayout(brush, layoutMode, mode === 'default' ? DEFAULT_FILL_PATTERN_SETTINGS : settings, bounds, origin, brushes)
  let lastX = NaN, lastY = NaN, last: FillPatternSample = EMPTY
  const sample = (x: number, y: number): FillPatternSample => {
    if (x === lastX && y === lastY) return last
    lastX = x; lastY = y
    if (!layout) return last = sources[0](x - origin.x, y - origin.y)
    let alpha = 0, r = 0, g = 0, b = 0
    const candidates = layout.candidatesAt(x + 0.5, y + 0.5)
    // Front to back: transparent holes reveal earlier stamps; opaque pixels stop the scan.
    for (let i = candidates.length - 1; i >= 0; i--) {
      const stamp = layout.stamps[candidates[i]]
      const sourceBrush = brushes[stamp.brushIndex]
      const point = stampSourcePoint(stamp, x + 0.5, y + 0.5, sourceBrush.width, sourceBrush.height)
      if (!point) continue
      const source = sources[stamp.brushIndex](point.x, point.y)
      if (source.coverage <= 0) continue
      const color = source.color ?? foreground
      const weight = (1 - alpha) * color.a / 255 * source.coverage / 255
      r += color.r * weight
      g += color.g * weight
      b += color.b * weight
      alpha += weight
      if (alpha >= 1) break
    }
    return last = alpha > 0 ? { coverage: 255, color: { r: Math.round(r / alpha), g: Math.round(g / alpha), b: Math.round(b / alpha), a: Math.round(alpha * 255) } } : EMPTY
  }
  return { sample, layout }
}
