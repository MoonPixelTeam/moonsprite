import type { TimelineRowRef } from '@/core/animation-timeline-identity'
import { type ContentInvalidationHint } from '@/core/history'
import { findLayerMask } from '@/core/document-model'
import { syncActiveAnimationFrame } from '@/core/animation'
import { measureRuntimeDiagnostic } from '@/core/runtime-diagnostics'
import { documentDiagnosticDetail } from '@/core/document-diagnostics'
import { persistProjectLayerPanelState } from '@/core/layer-panel-state'
import { completeDocumentChange } from './workspace-document-change'
import type { DocumentSession } from './workspace-types'
import { timelineRowsEqual, normalizeAnimationSelection, ensureLayerSelection } from './workspace-animation-selection'
import { clearFreeTileInstanceSelection } from './workspace-free-tile-selection'
import type { WorkspaceRecording } from './workspace-recording'

const timelineRowExists = (session: DocumentSession, row: TimelineRowRef): boolean => {
  if (row.kind === 'layer') return session.document.layers.some((layer) => layer.id === row.ownerId)
  if (row.kind === 'group') return session.document.groups.some((group) => group.id === row.ownerId)
  const timeline = session.document.animation
  if (!timeline) return false
  return row.ownerKind === 'layer'
    ? session.document.layers.some((layer) => layer.id === row.ownerId)
      && (timeline.layerMasks ?? []).some((entry) => entry.layerId === row.ownerId)
    : session.document.groups.some((group) => group.id === row.ownerId)
      && (timeline.groupMasks ?? []).some((entry) => entry.groupId === row.ownerId)
}

const ensureTimelineActiveContext = (session: DocumentSession): void => {
  const timeline = session.document.animation
  const current = session.timelineActiveContext
  const currentRow = current?.row && timelineRowExists(session, current.row) ? current.row : null
  const fallbackLayerId = session.document.layers.some((layer) => layer.id === session.document.activeLayerId)
    ? session.document.activeLayerId
    : session.document.layers.at(-1)?.id ?? null
  const row = currentRow ?? (fallbackLayerId ? { kind: 'layer' as const, ownerKind: 'layer' as const, ownerId: fallbackLayerId } : null)
  const frameId = current?.frameId && timeline?.frames.some((frame) => frame.id === current.frameId)
    ? current.frameId
    : timeline?.activeFrameId ?? null
  const maskEditTargetId = row?.kind === 'mask' && session.activeLayerMaskId && findLayerMask(session.document, session.activeLayerMaskId)
    ? session.activeLayerMaskId
    : null
  if (timelineRowsEqual(current.row, row) && current.frameId === frameId && current.maskEditTargetId === maskEditTargetId) return
  session.timelineActiveContext = { row, frameId, maskEditTargetId }
}

export interface DocumentMutationOptions {
  change: 'ui' | 'metadata' | 'content' | 'content-and-animation'
  normalizeSelection?: boolean
  markSelectionNormalizationHistory?: boolean
  invalidation?: ContentInvalidationHint
}

/** Completes an in-place document command before the store publishes it.
 * UI changes advance only uiRevision; metadata never captures a frame. */
export function mutateDocumentSession(
  session: DocumentSession,
  mutator: (session: DocumentSession) => void,
  options: DocumentMutationOptions,
  recordDocumentOperation: WorkspaceRecording['recordDocumentOperation']
): void {
    const historyNormalization = session.history
    historyNormalization.setAnimationSelectionNormalizationRequested(options.markSelectionNormalizationHistory ?? options.normalizeSelection ?? false)
    try {
      measureRuntimeDiagnostic('workspace.mutate', () => mutator(session), () => ({ ...documentDiagnosticDetail(session.document), tool: session.tool }))
    } finally {
      historyNormalization.setAnimationSelectionNormalizationRequested(false)
    }
    const freeTileInstanceLayer = session.freeTileInstanceLayerId
      ? session.document.layers.find((layer) => layer.id === session.freeTileInstanceLayerId && layer.kind === 'free-tile')
      : null
    if (session.freeTileInstanceLayerId && (!freeTileInstanceLayer || session.document.activeLayerId !== freeTileInstanceLayer.id)) {
      session.freeTileInstanceLayerId = null
      clearFreeTileInstanceSelection(session)
    }
    if (session.activeLayerMaskId && !findLayerMask(session.document, session.activeLayerMaskId)) session.activeLayerMaskId = null
    if (options.change === 'content-and-animation') measureRuntimeDiagnostic('workspace.animation-sync', () => syncActiveAnimationFrame(session.document))
    ensureLayerSelection(session)
    if (options.normalizeSelection) normalizeAnimationSelection(session, { preserveEmptyCelSlots: options.change === 'ui' })
    ensureTimelineActiveContext(session)
    session.uiRevision += 1
    persistProjectLayerPanelState(session)
    completeDocumentChange(session, options.change === 'content-and-animation' ? 'content' : options.change, recordDocumentOperation, options.invalidation)

}
