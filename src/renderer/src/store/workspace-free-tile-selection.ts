import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import type { DocumentSession } from './workspace-types'

export const clearFreeTileInstanceSelection = (session: DocumentSession): void => {
  session.selectedFreeTileInstanceId = null
  session.selectedFreeTileInstanceIds = []
  session.freeTileInstanceSelectionAnchorId = null
}

export const setFreeTileInstanceSelectionState = (
  session: DocumentSession,
  instanceIds: readonly string[],
  primaryInstanceId: string | null,
  anchorInstanceId: string | null = primaryInstanceId
): void => {
  const target = activeFreeTileCelTarget(session.document)
  if (!target) {
    clearFreeTileInstanceSelection(session)
    return
  }
  const validIds = new Set(target.freeTiles.instances.map((instance) => instance.id))
  const selectedIds = [...new Set(instanceIds)].filter((id) => validIds.has(id))
  const primaryId = primaryInstanceId && validIds.has(primaryInstanceId)
    ? primaryInstanceId
    : selectedIds.at(-1) ?? null
  if (!primaryId) {
    clearFreeTileInstanceSelection(session)
    return
  }
  if (!selectedIds.includes(primaryId)) selectedIds.push(primaryId)
  session.selectedFreeTileInstanceId = primaryId
  session.selectedFreeTileInstanceIds = selectedIds
  session.freeTileInstanceSelectionAnchorId = anchorInstanceId && validIds.has(anchorInstanceId)
    ? anchorInstanceId
    : primaryId
}

export const ensureFreeTileInstanceSelection = (session: DocumentSession): void => {
  const primaryId = session.selectedFreeTileInstanceId
  if (!primaryId) {
    clearFreeTileInstanceSelection(session)
    return
  }
  setFreeTileInstanceSelectionState(
    session,
    session.selectedFreeTileInstanceIds ?? [],
    primaryId,
    session.freeTileInstanceSelectionAnchorId
  )
}
