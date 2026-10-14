import type { SelectionMask } from '@shared/types-selection'
import type { CanvasPoint, SelectionHit } from '@/core/canvas-input'
import { selectionContains } from '@/core/selection'
import { tabletBoxMove, tabletContentMove } from '@/core/tablet-interaction'
import { activePaintLayer } from '@/store/workspace-session'
import type { DocumentSession } from '@/store/workspace-types'

/** Cell movement and tablet movement take priority over pixel resize handles. */
export function selectionTranslationHit(session: DocumentSession, selection: SelectionMask, point: CanvasPoint): SelectionHit | null {
  const inside = selectionContains(selection, Math.floor(point.x), Math.floor(point.y))
  if (tabletBoxMove(session.document.id) && inside) return 'edge'
  if (!session.freeTransformActive && tabletContentMove(session.document.id) && inside) return 'inside'
  if (!session.freeTransformActive && session.tilemapMode === 'paint' && activePaintLayer(session).kind === 'tilemap')
    return inside ? 'inside' : 'outside'
  return null
}
