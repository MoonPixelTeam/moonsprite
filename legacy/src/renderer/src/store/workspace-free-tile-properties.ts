import type { FreeTileCelData, FreeTileSourceLayer } from '@shared/types-tiles'
import type { RgbaColor } from '@shared/types-color'
import { cloneFreeTileCelData, freeTileCelDataEqual, freeTileInstanceBounds, freeTileSourceForInstance } from '@/core/free-tile'
import { activeFreeTileCelTarget, applyFreeTilePlacementEdit, applyFreeTileSourceLayerSnapshot, freeTileCelTargetAt, freeTileLayerIdsForSource, freeTileSourceOwnerForId, type FreeTileCelTarget, type FreeTilePlacementEdit } from '@/core/free-tile-document'
import type { HistoryEntry } from '@/core/history'
import { translateCurrent as tr } from '@/core/localization'
import type { DocumentTransactionRegistry } from './document-transactions'
import type { FreeTileInstancePropertyChanges, FreeTileSourcePropertyChanges } from './workspace-state'
import type { DocumentSession } from './workspace-types'

interface FreeTileInstancePropertiesTransactionData {
  layerId: string
  frameId: string
  instanceIds: string[]
  before: FreeTileCelData
  previewChanged: boolean
}

interface FreeTileSourcePropertySnapshot {
  source: FreeTileSourceLayer
  tilesetName: string
}

interface FreeTileSourcePropertiesTransactionData {
  layerId: string
  sourceId: string
  before: FreeTileSourcePropertySnapshot
  previewChanged: boolean
}

const INSTANCE_TRANSACTION_KIND = 'free-tile-instance-properties'
const SOURCE_TRANSACTION_KIND = 'free-tile-source-properties'

const cloneColor = (color: RgbaColor | undefined): RgbaColor | undefined => color ? { ...color } : undefined

const sameColor = (left: RgbaColor | undefined, right: RgbaColor | undefined): boolean =>
  left === right || Boolean(left && right && left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a)

const cloneSource = (source: FreeTileSourceLayer): FreeTileSourceLayer => ({
  ...source,
  displayColor: cloneColor(source.displayColor)
})

const sourceEqual = (left: FreeTileSourceLayer, right: FreeTileSourceLayer): boolean =>
  left.id === right.id
  && left.name === right.name
  && left.tilesetId === right.tilesetId
  && left.description === right.description
  && left.visible === right.visible
  && left.locked === right.locked
  && left.opacity === right.opacity
  && left.blendMode === right.blendMode
  && left.offsetX === right.offsetX
  && left.offsetY === right.offsetY
  && sameColor(left.displayColor, right.displayColor)

const sourceSnapshotEqual = (left: FreeTileSourcePropertySnapshot, right: FreeTileSourcePropertySnapshot): boolean =>
  left.tilesetName === right.tilesetName && sourceEqual(left.source, right.source)

const notifyPreviewChange = (session: DocumentSession): void => {
  const fromRevision = session.contentRevision
  session.revision += 1
  session.contentRevision += 1
  session.layersPanelRevision += 1
  session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
}

const instanceAfterChanges = (
  target: FreeTileCelTarget,
  before: FreeTileCelData,
  instanceIds: readonly string[],
  changes: FreeTileInstancePropertyChanges
): FreeTileCelData | null => {
  const targetIds = new Set(instanceIds)
  if (targetIds.size === 0) return null
  const after = cloneFreeTileCelData(before)
  const afterById = new Map(after.instances.map((instance) => [instance.id, instance]))
  let found = false
  for (const current of before.instances) {
    if (!targetIds.has(current.id)) continue
    const source = freeTileSourceForInstance(target.sources, current)
    const next = afterById.get(current.id)
    if (!source || !next) continue
    found = true

    if (current.locked !== true) {
      const currentBounds = freeTileInstanceBounds(current, target.sources, target.surface.offsetX, target.surface.offsetY)
      if (changes.rotation !== undefined && (changes.rotation === 0 || changes.rotation === 1 || changes.rotation === 2 || changes.rotation === 3)) {
        if (changes.rotation === 0) delete next.rotation
        else next.rotation = changes.rotation
      }
      if (changes.flipHorizontal !== undefined) {
        if (changes.flipHorizontal) next.flipHorizontal = true
        else delete next.flipHorizontal
      }
      if (changes.flipVertical !== undefined) {
        if (changes.flipVertical) next.flipVertical = true
        else delete next.flipVertical
      }
      const transformedBounds = freeTileInstanceBounds(next, target.sources, target.surface.offsetX, target.surface.offsetY)
      const desiredX = changes.x !== undefined && Number.isFinite(changes.x) ? Math.trunc(changes.x) : currentBounds.x
      const desiredY = changes.y !== undefined && Number.isFinite(changes.y) ? Math.trunc(changes.y) : currentBounds.y
      next.x += desiredX - transformedBounds.x
      next.y += desiredY - transformedBounds.y
    }
    if (changes.visible !== undefined) {
      if (current.visible === undefined && changes.visible) delete next.visible
      else next.visible = changes.visible
    }
    if (changes.locked !== undefined) {
      if (current.locked === undefined && !changes.locked) delete next.locked
      else next.locked = changes.locked
    }
    if (changes.opacity !== undefined && Number.isFinite(changes.opacity)) {
      const opacity = Math.max(0, Math.min(1, changes.opacity))
      if (current.opacity === undefined && opacity === source.opacity) delete next.opacity
      else next.opacity = opacity
    }
    if (changes.blendMode !== undefined) {
      if (current.blendMode === undefined && changes.blendMode === source.blendMode) delete next.blendMode
      else next.blendMode = changes.blendMode
    }
  }
  return found ? after : null
}

const applyInstanceSnapshot = (
  session: DocumentSession,
  data: FreeTileInstancePropertiesTransactionData,
  snapshot: FreeTileCelData
): boolean => applyFreeTilePlacementEdit(session.document, {
  layerId: data.layerId,
  frameId: data.frameId,
  before: data.before,
  after: snapshot,
  dirtyRect: null
}, 'after')

const restoreInstancePreview = (session: DocumentSession, data: FreeTileInstancePropertiesTransactionData, notify = true): void => {
  if (!data.previewChanged) return
  applyInstanceSnapshot(session, data, data.before)
  data.previewChanged = false
  if (notify) notifyPreviewChange(session)
}

const instanceHistoryEntry = (
  session: DocumentSession,
  data: FreeTileInstancePropertiesTransactionData,
  after: FreeTileCelData
): HistoryEntry => {
  const edit: FreeTilePlacementEdit = {
    layerId: data.layerId,
    frameId: data.frameId,
    before: data.before,
    after,
    dirtyRect: null
  }
  return {
    label: tr('workspace.history.freeTileInstanceProperties'),
    bytes: (data.before.instances.length + after.instances.length) * 72,
    undo: () => { applyFreeTilePlacementEdit(session.document, edit, 'before') },
    redo: () => { applyFreeTilePlacementEdit(session.document, edit, 'after') },
    invalidation: { kind: 'full' },
    affectedLayerIds: [data.layerId],
    contentChanged: true,
    requiresAnimationSync: false
  }
}

const sourceSnapshot = (session: DocumentSession, sourceId: string): { layerId: string; snapshot: FreeTileSourcePropertySnapshot } | null => {
  const owner = freeTileSourceOwnerForId(session.document, sourceId)
  if (!owner) return null
  return {
    layerId: owner.layer.id,
    snapshot: {
      source: cloneSource(owner.source),
      tilesetName: owner.tileset.name
    }
  }
}

const sourceAfterChanges = (
  before: FreeTileSourcePropertySnapshot,
  changes: FreeTileSourcePropertyChanges,
  commit: boolean
): FreeTileSourcePropertySnapshot => {
  const source = cloneSource(before.source)
  if (changes.name !== undefined) source.name = commit ? changes.name.trim() || before.source.name : changes.name
  if (changes.description !== undefined) source.description = changes.description
  if ('displayColor' in changes) source.displayColor = changes.displayColor ? { ...changes.displayColor } : undefined
  if (changes.visible !== undefined) source.visible = changes.visible
  if (changes.locked !== undefined) source.locked = changes.locked
  if (changes.offsetX !== undefined && Number.isFinite(changes.offsetX)) source.offsetX = Math.trunc(changes.offsetX)
  if (changes.offsetY !== undefined && Number.isFinite(changes.offsetY)) source.offsetY = Math.trunc(changes.offsetY)
  return { source, tilesetName: source.name }
}

const applySourceSnapshot = (session: DocumentSession, snapshot: FreeTileSourcePropertySnapshot): boolean => {
  return applyFreeTileSourceLayerSnapshot(session.document, { ...snapshot.source, name: snapshot.tilesetName })
}

const restoreSourcePreview = (session: DocumentSession, data: FreeTileSourcePropertiesTransactionData, notify = true): void => {
  if (!data.previewChanged) return
  applySourceSnapshot(session, data.before)
  data.previewChanged = false
  if (notify) notifyPreviewChange(session)
}

const sourceHistoryEntry = (
  session: DocumentSession,
  data: FreeTileSourcePropertiesTransactionData,
  after: FreeTileSourcePropertySnapshot
): HistoryEntry => ({
  label: tr('workspace.history.layerProperties'),
  bytes: 256 + data.before.source.name.length + after.source.name.length,
  undo: () => { applySourceSnapshot(session, data.before) },
  redo: () => { applySourceSnapshot(session, after) },
  invalidation: { kind: 'full' },
  affectedLayerIds: freeTileLayerIdsForSource(session.document, data.sourceId),
  contentChanged: true,
  requiresAnimationSync: false
})

export const beginFreeTileInstancePropertiesTransaction = (
  registry: DocumentTransactionRegistry<DocumentSession>,
  session: DocumentSession,
  instanceIds: string | readonly string[]
): string | null => {
  registry.cancelKind(session.document.id, INSTANCE_TRANSACTION_KIND, session)
  const target = activeFreeTileCelTarget(session.document)
  if (!target) return null
  const requestedIds = typeof instanceIds === 'string' ? [instanceIds] : instanceIds
  const validIds = new Set(target.freeTiles.instances.map((instance) => instance.id))
  const targetIds = [...new Set(requestedIds)].filter((id) => validIds.has(id))
  if (targetIds.length === 0) return null
  const data: FreeTileInstancePropertiesTransactionData = {
    layerId: target.layer.id,
    frameId: target.cel.frameId,
    instanceIds: targetIds,
    before: cloneFreeTileCelData(target.freeTiles),
    previewChanged: false
  }
  return registry.begin(session.document.id, INSTANCE_TRANSACTION_KIND, data, restoreInstancePreview)
}

export const previewFreeTileInstancePropertiesTransaction = (
  registry: DocumentTransactionRegistry<DocumentSession>,
  session: DocumentSession,
  id: string,
  changes: FreeTileInstancePropertyChanges
): boolean => {
  const transaction = registry.get<FreeTileInstancePropertiesTransactionData>(id, session.document.id, INSTANCE_TRANSACTION_KIND)
  if (!transaction) return false
  const hadPreview = transaction.data.previewChanged
  restoreInstancePreview(session, transaction.data, false)
  const target = freeTileCelTargetAt(session.document, transaction.data.layerId, transaction.data.frameId)
  const after = target ? instanceAfterChanges(target, transaction.data.before, transaction.data.instanceIds, changes) : null
  const changed = Boolean(after && !freeTileCelDataEqual(transaction.data.before, after))
  if (changed && after) applyInstanceSnapshot(session, transaction.data, after)
  transaction.data.previewChanged = changed
  if (hadPreview || changed) notifyPreviewChange(session)
  return changed
}

export const commitFreeTileInstancePropertiesTransaction = (
  registry: DocumentTransactionRegistry<DocumentSession>,
  session: DocumentSession,
  id: string,
  changes: FreeTileInstancePropertyChanges
): boolean => {
  const transaction = registry.finish<FreeTileInstancePropertiesTransactionData>(id, session.document.id, INSTANCE_TRANSACTION_KIND)
  if (!transaction) return false
  const hadPreview = transaction.data.previewChanged
  restoreInstancePreview(session, transaction.data, false)
  const target = freeTileCelTargetAt(session.document, transaction.data.layerId, transaction.data.frameId)
  const after = target ? instanceAfterChanges(target, transaction.data.before, transaction.data.instanceIds, changes) : null
  if (!after || freeTileCelDataEqual(transaction.data.before, after)) {
    if (hadPreview) notifyPreviewChange(session)
    return false
  }
  applyInstanceSnapshot(session, transaction.data, after)
  session.history.push(instanceHistoryEntry(session, transaction.data, after))
  return true
}

export const cancelFreeTileInstancePropertiesTransaction = (
  registry: DocumentTransactionRegistry<DocumentSession>,
  session: DocumentSession,
  id: string
): boolean => registry.cancel(id, session)

export const beginFreeTileSourcePropertiesTransaction = (
  registry: DocumentTransactionRegistry<DocumentSession>,
  session: DocumentSession,
  sourceId: string
): string | null => {
  registry.cancelKind(session.document.id, SOURCE_TRANSACTION_KIND, session)
  const captured = sourceSnapshot(session, sourceId)
  if (!captured) return null
  const data: FreeTileSourcePropertiesTransactionData = {
    layerId: captured.layerId,
    sourceId,
    before: captured.snapshot,
    previewChanged: false
  }
  return registry.begin(session.document.id, SOURCE_TRANSACTION_KIND, data, restoreSourcePreview)
}

export const previewFreeTileSourcePropertiesTransaction = (
  registry: DocumentTransactionRegistry<DocumentSession>,
  session: DocumentSession,
  id: string,
  changes: FreeTileSourcePropertyChanges
): boolean => {
  const transaction = registry.get<FreeTileSourcePropertiesTransactionData>(id, session.document.id, SOURCE_TRANSACTION_KIND)
  if (!transaction) return false
  const hadPreview = transaction.data.previewChanged
  restoreSourcePreview(session, transaction.data, false)
  const after = sourceAfterChanges(transaction.data.before, changes, false)
  const changed = !sourceSnapshotEqual(transaction.data.before, after)
  if (changed) applySourceSnapshot(session, after)
  transaction.data.previewChanged = changed
  if (hadPreview || changed) notifyPreviewChange(session)
  return changed
}

export const commitFreeTileSourcePropertiesTransaction = (
  registry: DocumentTransactionRegistry<DocumentSession>,
  session: DocumentSession,
  id: string,
  changes: FreeTileSourcePropertyChanges
): boolean => {
  const transaction = registry.finish<FreeTileSourcePropertiesTransactionData>(id, session.document.id, SOURCE_TRANSACTION_KIND)
  if (!transaction) return false
  const hadPreview = transaction.data.previewChanged
  restoreSourcePreview(session, transaction.data, false)
  const after = sourceAfterChanges(transaction.data.before, changes, true)
  if (sourceSnapshotEqual(transaction.data.before, after)) {
    if (hadPreview) notifyPreviewChange(session)
    return false
  }
  applySourceSnapshot(session, after)
  session.history.push(sourceHistoryEntry(session, transaction.data, after))
  return true
}

export const cancelFreeTileSourcePropertiesTransaction = (
  registry: DocumentTransactionRegistry<DocumentSession>,
  session: DocumentSession,
  id: string
): boolean => registry.cancel(id, session)
