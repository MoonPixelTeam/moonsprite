import type { BrushShape } from '@shared/types-brush'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask } from '@shared/types-selection'
import { selectionContains } from '@/core/selection'
import { brushStampAnchor, solidBrushPreviewRowSpans } from '@/core/tools-brush'

interface Span { y: number; left: number; right: number }

/** Merge exact solid stamp footprints before visiting/compositing pixels. */
export function solidBrushPathSpans(centers: readonly { x: number; y: number }[], size: number, shape: BrushShape,
  angle: number, optimizedRotation: boolean, width: number, height: number): Span[] {
  const footprint = solidBrushPreviewRowSpans(size, shape, angle, optimizedRotation)
  const anchor = brushStampAnchor(size, null, angle, shape)
  const rows = new Map<number, Array<{ left: number; right: number }>>()
  for (const center of centers) for (const span of footprint) {
    const y = center.y - anchor.y + span.y
    if (y < 0 || y >= height) continue
    const left = Math.max(0, center.x - anchor.x + span.left)
    const right = Math.min(width - 1, center.x - anchor.x + span.right)
    if (left > right) continue
    const row = rows.get(y)
    if (row) row.push({ left, right })
    else rows.set(y, [{ left, right }])
  }
  const merged: Span[] = []
  for (const [y, intervals] of rows) {
    intervals.sort((a, b) => a.left - b.left)
    let left = intervals[0].left, right = intervals[0].right
    for (let i = 1; i < intervals.length; i += 1) {
      const next = intervals[i]
      if (next.left <= right + 1) right = Math.max(right, next.right)
      else { merged.push({ y, left, right }); left = next.left; right = next.right }
    }
    merged.push({ y, left, right })
  }
  return merged
}

/** Same-color runs keep long, wide previews from allocating a path per pixel. */
export function visitSolidBrushPathColors(spans: readonly Span[], selection: SelectionMask | null,
  colorAt: (x: number, y: number) => RgbaColor,
  emit: (left: number, right: number, y: number, color: RgbaColor) => void): void {
  for (const span of spans) {
    let start = span.left
    let color: RgbaColor | null = null
    for (let x = span.left; x <= span.right; x += 1) {
      const next = selection && !selectionContains(selection, x, span.y) ? null : colorAt(x, span.y)
      // Translucent pixels still sample the checkerboard at each position.
      if (color?.a === 255 && next?.a === 255 && color.r === next.r && color.g === next.g && color.b === next.b) continue
      if (color) emit(start, x - 1, span.y, color)
      start = x
      color = next
    }
    if (color) emit(start, span.right, span.y, color)
  }
}
