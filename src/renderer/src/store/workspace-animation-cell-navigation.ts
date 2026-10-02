import type { TimelineRowRef } from '@/core/animation-timeline-identity'
import type { DocumentSession } from './workspace-types'
import { animationLayerPanelSelectionRows } from './workspace-animation-selection'

/** Use panel selection order and canonical focus, including empty mask slots. */
export function animationCellNavigationRow(session: DocumentSession, axis: 'layer' | 'frame', delta: number): TimelineRowRef | null {
  const direction = Math.sign(delta)
  if (!direction) return null
  const row = session.timelineActiveContext.row ?? {
    kind: 'layer' as const, ownerKind: 'layer' as const, ownerId: session.document.activeLayerId
  }
  if (axis === 'frame') return row
  const rows = animationLayerPanelSelectionRows(session)
  let index = rows.findIndex(candidate => candidate.kind === row.kind && candidate.id === row.ownerId
    && (candidate.kind !== 'mask' || candidate.ownerKind === row.ownerKind))
  if (index < 0) index = rows.findIndex(candidate => candidate.kind === 'layer' && candidate.id === session.document.activeLayerId)
  if (index < 0) index = direction > 0 ? -1 : rows.length
  for (let next = index + direction; next >= 0 && next < rows.length; next += direction) {
    const target = rows[next]
    // Group summaries have no editable cel; their mask rows do.
    if (target.kind === 'group') continue
    return target.kind === 'mask'
      ? { kind: 'mask', ownerKind: target.ownerKind, ownerId: target.id }
      : { kind: 'layer', ownerKind: 'layer', ownerId: target.id }
  }
  return null
}
