import { useId } from 'react'
import { paletteSelectionBoundaryEdges } from '@/core/palette-layout'

/** Follow the occupied perimeter, retaining the original CSS border placement. */
export function PaletteSelectionOutline({ slots, columns, selectedIds, swatchSize }: {
  slots: readonly (number | null)[]
  columns: number
  selectedIds: readonly number[]
  swatchSize: number
}) {
  const id = useId()
  const edges = paletteSelectionBoundaryEdges(slots, columns, selectedIds)
  if (edges.length === 0) return null
  const step = swatchSize + 1
  const segments = edges.map(({ slot, side }) => {
    const x = slot % columns
    const y = Math.floor(slot / columns)
    // Clockwise edges keep selected cells on the right, including around holes.
    const direction = { top: 0, right: 1, bottom: 2, left: 3 }[side]
    const x1 = x + (side === 'right' || side === 'bottom' ? 1 : 0)
    const y1 = y + (side === 'bottom' || side === 'left' ? 1 : 0)
    const x2 = x + (side === 'top' || side === 'right' ? 1 : 0)
    const y2 = y + (side === 'right' || side === 'bottom' ? 1 : 0)
    return { slot, side, direction, x1, y1, x2, y2 }
  })
  const starts = new Map<string, typeof segments>()
  for (const segment of segments) {
    const key = `${segment.x1},${segment.y1}`
    starts.set(key, [...(starts.get(key) ?? []), segment])
  }
  const remaining = new Set(segments)
  const contours: string[] = []
  for (const first of segments) {
    if (!remaining.has(first)) continue
    const loop: typeof segments = []
    let current: typeof first | undefined = first
    while (current && remaining.delete(current)) {
      loop.push(current)
      if (current.x2 === first.x1 && current.y2 === first.y1) break
      const direction: number = current.direction
      // Prefer a right turn at diagonal contacts, keeping separate islands apart.
      const candidates: typeof segments = starts.get(`${current.x2},${current.y2}`) ?? []
      current = [1, 0, 3, 2].flatMap(turn => candidates.filter(candidate =>
        candidate.direction === (direction + turn) % 4 && remaining.has(candidate)))[0]
    }
    const corners = loop.flatMap((edge, index) => {
      const previous = loop[(index + loop.length - 1) % loop.length]
      if (previous.side === edge.side) return []
      // Right/bottom bounds exclude the trailing 1px grid gap, just like the
      // original border-box. Shared edges and internal gaps are not outlined.
      const x = edge.x1 * step - (edge.side === 'right' || previous.side === 'right' ? 1 : 0)
      const y = edge.y1 * step - (edge.side === 'bottom' || previous.side === 'bottom' ? 1 : 0)
      return [`${x},${y}`]
    })
    contours.push(`M${corners.join('L')}Z`)
  }
  const path = contours.join(' ')
  const width = columns * step
  const height = Math.ceil(slots.length / columns) * step
  return <svg className="palette-selection-outline" aria-hidden="true" width={width} height={height} fill="none" strokeLinejoin="miter">
    <defs>
      <clipPath id={`${id}-inside`}><path d={path} fill="white" fillRule="evenodd" clipRule="evenodd" /></clipPath>
      <mask id={`${id}-outside`} maskUnits="userSpaceOnUse" x={-4} y={-4} width={width + 8} height={height + 8}>
        <rect x={-4} y={-4} width={width + 8} height={height + 8} fill="white" />
        <path d={path} fill="black" fillRule="evenodd" />
      </mask>
    </defs>
    <g mask={`url(#${id}-outside)`}>
      <path d={path} stroke="var(--theme-selection-outline-dark)" strokeWidth={6} />
      <path d={path} stroke="var(--theme-selection-outline-light)" strokeWidth={4} />
    </g>
    <path d={path} stroke="var(--theme-selection-outline-dark)" strokeWidth={2} clipPath={`url(#${id}-inside)`} />
    {segments.map(({ slot, side, x1, y1, x2, y2 }) => <line key={`${slot}-${side}`} data-palette-selection-outline data-slot={slot} data-side={side}
      x1={Math.min(x1, x2) * step} y1={Math.min(y1, y2) * step} x2={Math.max(x1, x2) * step} y2={Math.max(y1, y2) * step} />)}
  </svg>
}
