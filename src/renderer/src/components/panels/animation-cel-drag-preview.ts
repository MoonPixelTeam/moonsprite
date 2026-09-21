import { parseAnimationCelKey } from '@/core/animation'
import type { AnimationFrame } from '@shared/types-animation'
import type { AnimationPointerDrag } from './animation-gesture-types'
import type { LayerDisplayRow } from './layer-panel-contracts'

/** Prepare source geometry once; moving the pointer only translates its bounds. */
export function createCelDragPreview(displayRows: LayerDisplayRow[], frames: readonly AnimationFrame[],
  gesture: Readonly<AnimationPointerDrag> | null, anchorKey: string | null) {
  const rows = new Map<string, number>()
  const kind = gesture?.kind
  for (const [row, item] of displayRows.entries()) {
    if (kind === 'mask' && item.kind === 'mask') rows.set(item.owner.id, row)
    if (kind === 'cel' && item.kind === 'node' && item.node.kind === 'layer') rows.set(item.node.id, row)
  }
  const columns = new Map(frames.map((frame, column) => [frame.id, column]))
  const position = (key: string | null) => {
    const parsed = key ? parseAnimationCelKey(key) : null
    const row = parsed ? rows.get(parsed.layerId) : undefined
    const column = parsed ? columns.get(parsed.frameId) : undefined
    return row === undefined || column === undefined ? null : { row, column }
  }
  const anchor = position(anchorKey)
  let top = Infinity, left = Infinity, bottom = -Infinity, right = -Infinity
  if (gesture?.kind === 'cel' || gesture?.kind === 'mask') for (const key of gesture.cellKeys) {
    const source = position(key)
    if (!source) continue
    top = Math.min(top, source.row); bottom = Math.max(bottom, source.row)
    left = Math.min(left, source.column); right = Math.max(right, source.column)
  }
  return (targetKey: string | null) => {
    const target = position(targetKey)
    if (!anchor || !target || !Number.isFinite(top)) return null
    return { row: top + target.row - anchor.row, column: left + target.column - anchor.column,
      rowSpan: bottom - top + 1, columnSpan: right - left + 1 }
  }
}
