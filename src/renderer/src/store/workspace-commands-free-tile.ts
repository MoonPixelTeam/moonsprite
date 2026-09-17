import { unionFreeTileSourceRects } from '@/core/free-tile-source-refresh'
import { completeDocumentChange } from './workspace-document-change'
import type { FreeTileCelData, FreeTileSourceLayer } from '@shared/types-tiles'
import { type HistoryEntry } from '@/core/history'
import { createId } from '@/core/document-model'
import { ensureAnimationDocument } from '@/core/animation'
import { cloneTileset, createBlankTileset } from '@/core/tilemap'
import { cloneFreeTileCelData, freeTileCelDataEqual, freeTileInstanceBounds, freeTileSourceForInstance, type FreeTileDrawingMode } from '@/core/free-tile'
import { activeFreeTileCelTarget, applyFreeTilePlacementEdit, applyFreeTileReferences, applyFreeTileSourceLayerSnapshot, applyFreeTileSourceSnapshot, captureFreeTileSourceReferences, captureFreeTileSourceSnapshot, ensureFreeTileTilesetOwnership, freeTileLayerIdsForSource, freeTileLayersForSet, freeTileSetIdForLayer, freeTileSourceOwnerForId, replaceFreeTileSetSources, rerenderFreeTileSourceReferences, type FreeTilePlacementEdit } from '@/core/free-tile-document'
import { cloneSelectionMask, touch } from './workspace-session'
import { beginFreeTileInstancePropertiesTransaction as beginFreeTileInstancePropertiesTransactionCommand, beginFreeTileSourcePropertiesTransaction as beginFreeTileSourcePropertiesTransactionCommand, cancelFreeTileInstancePropertiesTransaction as cancelFreeTileInstancePropertiesTransactionCommand, cancelFreeTileSourcePropertiesTransaction as cancelFreeTileSourcePropertiesTransactionCommand, commitFreeTileInstancePropertiesTransaction as commitFreeTileInstancePropertiesTransactionCommand, commitFreeTileSourcePropertiesTransaction as commitFreeTileSourcePropertiesTransactionCommand, previewFreeTileInstancePropertiesTransaction as previewFreeTileInstancePropertiesTransactionCommand, previewFreeTileSourcePropertiesTransaction as previewFreeTileSourcePropertiesTransactionCommand } from './workspace-free-tile-properties'
import type { FreeTileInstancePropertyChanges } from './workspace-state'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceFreeTileCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { clearFreeTileInstanceSelection, setFreeTileInstanceSelectionState, ensureFreeTileInstanceSelection } from './workspace-free-tile-selection'
import { cloneFreeTileSourceLayer, defaultFreeTileSourceDisplayColor, tilemapTilesetBytes } from './workspace-layer-resources'
import { tr } from './workspace-translation'
import { requestTilesetPanelVisibility } from './workspace-tileset-panel'

import { commitFreeTileSourceEditInSession } from './workspace-free-tile-transaction'
import { activeSession } from './workspace-access'
import { ensureAnimationCelSlot } from './workspace-animation-mask-slots'
import { selectionMasksEqual } from './workspace-selection-geometry'

const syncFreeTileInstanceSourceSelection = (
  session: DocumentSession,
  instanceId: string,
  role: 'primary' | 'secondary' = 'primary'
): boolean => {
  const target = activeFreeTileCelTarget(session.document)
  const instance = target?.freeTiles.instances.find((candidate) => candidate.id === instanceId)
  const source = target && instance ? freeTileSourceForInstance(target.sources, instance) : null
  const tileId = source?.tileset.tileIds[0] ?? null
  if (!instance || !source || !tileId) return false
  session.selectedTilesetId = source.tileset.id
  if (role === 'secondary') session.secondaryTileId = tileId
  else session.selectedTileId = tileId
  session.selectedTileId = source.tileset.tileIds.includes(session.selectedTileId ?? '') ? session.selectedTileId : tileId
  session.secondaryTileId = source.tileset.tileIds.includes(session.secondaryTileId ?? '') ? session.secondaryTileId : tileId
  return true
}

const freeTileSourceLayerEqual = (left: FreeTileSourceLayer, right: FreeTileSourceLayer): boolean =>
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
  && JSON.stringify(left.displayColor ?? null) === JSON.stringify(right.displayColor ?? null)

export function createWorkspaceFreeTileCommands({ get, recording , services: { documentTransactions } }: WorkspaceCommandContext<'deleteFreeTileInstances' | 'mutateActive', 'documentTransactions'>): WorkspaceFreeTileCommands {
  const { recordDocumentOperation } = recording
  return {
    setFreeTileMode(mode) {
      get().mutateActive((session) => {
        if (mode === 'paint') {
          clearFreeTileInstanceSelection(session)
          session.freeTileMode = mode
          return
        }
        const target = activeFreeTileCelTarget(session.document)
        const editableInstances = target?.freeTiles.instances.filter((instance) => {
          if (instance.visible === false || instance.locked === true) return false
          const source = target.sources.find((candidate) => candidate.id === instance.sourceId || candidate.tileset.id === instance.sourceId)
          const sourceLayer = source ? target.layer.freeTileSources?.find((candidate) => candidate.id === source.id) : null
          return Boolean(source && sourceLayer?.visible !== false && sourceLayer?.locked !== true)
        }) ?? []
        const preferred = editableInstances.find((instance) => instance.id === session.selectedFreeTileInstanceId)
          ?? editableInstances.find((instance) => instance.sourceId === session.selectedTilesetId
            || target?.sources.find((source) => source.id === instance.sourceId)?.tileset.id === session.selectedTilesetId)
          ?? editableInstances[0]
        if (preferred && syncFreeTileInstanceSourceSelection(session, preferred.id)) setFreeTileInstanceSelectionState(session, [preferred.id], preferred.id)
        else clearFreeTileInstanceSelection(session)
        session.freeTileMode = mode
      }, false)
    },

    setFreeTileInstanceLayerView(layerId) {
      get().mutateActive((session) => {
        if (!layerId) {
          session.freeTileInstanceLayerId = null
          clearFreeTileInstanceSelection(session)
          return
        }
        const layer = session.document.layers.find((candidate) => candidate.id === layerId && candidate.kind === 'free-tile')
        session.freeTileInstanceLayerId = layer ? layer.id : null
        if (layer) {
          // Instance editing is scoped to its owning free-tile layer. Keep the
          // document activity in that layer so canvas move/edit hit testing does
          // not fall back to a previously active raster layer.
          session.document.activeLayerId = layer.id
          session.selectedLayerIds = [layer.id]
          session.selectedGroupId = null
          session.selectedGroupIds = []
        }
        if (!session.freeTileInstanceLayerId) clearFreeTileInstanceSelection(session)
      }, false)
    },

    setSelectedFreeTileInstance(instanceId, mode, role = 'primary') {
      get().mutateActive((session) => {
        if (!instanceId) {
          clearFreeTileInstanceSelection(session)
          return
        }
        if (session.freeTileMode === 'paint' && mode !== 'edit') {
          clearFreeTileInstanceSelection(session)
          return
        }
        if (!syncFreeTileInstanceSourceSelection(session, instanceId, role)) {
          clearFreeTileInstanceSelection(session)
          return
        }
        const target = activeFreeTileCelTarget(session.document)
        if (target) {
          session.document.activeLayerId = target.layer.id
          session.freeTileInstanceLayerId = target.layer.id
          session.selectedLayerIds = [target.layer.id]
          session.selectedGroupId = null
          session.selectedGroupIds = []
        }
        setFreeTileInstanceSelectionState(session, [instanceId], instanceId)
        if (mode) session.freeTileMode = mode
      }, false)
    },

    selectFreeTileInstanceRow(instanceId, mode = 'replace', orderedInstanceIds = []) {
      get().mutateActive((session) => {
        const target = activeFreeTileCelTarget(session.document)
        if (!target || !target.freeTiles.instances.some((instance) => instance.id === instanceId)) {
          clearFreeTileInstanceSelection(session)
          return
        }
        // Instance row selection is always scoped to its owning free-tile layer.
        // Keep the document/session activity aligned before applying replace,
        // toggle, or range semantics so a stale paint-layer selection cannot
        // steal the interaction context.
        session.document.activeLayerId = target.layer.id
        session.freeTileInstanceLayerId = target.layer.id
        session.selectedLayerIds = [target.layer.id]
        session.selectedGroupId = null
        session.selectedGroupIds = []
        ensureFreeTileInstanceSelection(session)
        const validIds = new Set(target.freeTiles.instances.map((instance) => instance.id))
        const displayOrder = [...new Set(orderedInstanceIds)].filter((id) => validIds.has(id))
        const orderedIds = displayOrder.length > 0
          ? displayOrder
          : target.freeTiles.instances.map((instance) => instance.id).reverse()
        const currentIds = session.selectedFreeTileInstanceIds.filter((id) => validIds.has(id))
        if (mode === 'range') {
          const anchorId = session.freeTileInstanceSelectionAnchorId && validIds.has(session.freeTileInstanceSelectionAnchorId)
            ? session.freeTileInstanceSelectionAnchorId
            : currentIds.find((id) => validIds.has(id)) ?? instanceId
          const anchorIndex = orderedIds.indexOf(anchorId)
          const targetIndex = orderedIds.indexOf(instanceId)
          const rangeIds = anchorIndex >= 0 && targetIndex >= 0
            ? orderedIds.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
            : [instanceId]
          setFreeTileInstanceSelectionState(session, rangeIds, instanceId, anchorId)
        } else if (mode === 'toggle') {
          const selectedIds = currentIds.includes(instanceId)
            ? currentIds.filter((id) => id !== instanceId)
            : [...currentIds, instanceId]
          const nextIds = selectedIds.length > 0 ? selectedIds : [instanceId]
          setFreeTileInstanceSelectionState(session, nextIds, nextIds.includes(instanceId) ? instanceId : nextIds.at(-1) ?? null, instanceId)
        } else {
          setFreeTileInstanceSelectionState(session, [instanceId], instanceId)
        }
        if (session.selectedFreeTileInstanceId && syncFreeTileInstanceSourceSelection(session, session.selectedFreeTileInstanceId)) {
          session.freeTileMode = 'edit'
        }
      }, false)
    },

    addFreeTileSource(layerId) {
      let addedSourceId: string | null = null
      get().mutateActive((session) => {
        const layer = session.document.layers.find((candidate) => candidate.id === (layerId ?? session.document.activeLayerId) && candidate.kind === 'free-tile')
        if (!layer) return
        ensureFreeTileTilesetOwnership(session.document)
        const beforeSources = (layer.freeTileSources ?? []).map(cloneFreeTileSourceLayer)
        const beforeSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId, mode: session.freeTileMode }
        const sourceId = createId('free-tile-source')
        const nextSourceIndex = (() => {
          let index = 1
          while (beforeSources.some((candidate) => candidate.name === tr('workspace.freeTile.sourceName', { index }))) index += 1
          return index
        })()
        const name = tr('workspace.freeTile.sourceName', { index: nextSourceIndex })
        const tileset = createBlankTileset(createId('tileset'), name, 1, 1, createId('tile'), 1)
        const source: FreeTileSourceLayer = { id: sourceId, name, tilesetId: tileset.id, displayColor: defaultFreeTileSourceDisplayColor(beforeSources.length), visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }
        const afterSources = [...beforeSources, source]
        const afterSelection = { tilesetId: tileset.id, tileId: tileset.tileIds[0] ?? null, secondaryTileId: tileset.tileIds[0] ?? null, mode: 'edit' as FreeTileDrawingMode }
        const apply = (sources: readonly FreeTileSourceLayer[], includeTileset: boolean, selection: typeof beforeSelection): void => {
          replaceFreeTileSetSources(session.document, layer, sources)
          if (includeTileset) {
            if (!session.document.tilesets?.some((candidate) => candidate.id === tileset.id)) session.document.tilesets = [...(session.document.tilesets ?? []), cloneTileset(tileset)]
          } else session.document.tilesets = (session.document.tilesets ?? []).filter((candidate) => candidate.id !== tileset.id)
          session.selectedTilesetId = selection.tilesetId
          session.selectedTileId = selection.tileId
          session.secondaryTileId = selection.secondaryTileId
          clearFreeTileInstanceSelection(session)
          session.freeTileMode = selection.mode
        }
        apply(afterSources, true, afterSelection)
        session.history.push({
          label: tr('workspace.history.addTilesetTile'),
          bytes: tilemapTilesetBytes(tileset) + (beforeSources.length + afterSources.length) * 96,
          undo: () => apply(beforeSources, false, beforeSelection),
          redo: () => apply(afterSources, true, afterSelection),
          invalidation: { kind: 'full' },
          affectedLayerIds: freeTileLayersForSet(session.document, freeTileSetIdForLayer(layer)).map((candidate) => candidate.id),
          contentChanged: true,
          requiresAnimationSync: false
        })
        completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
        addedSourceId = sourceId
      }, false)
      if (addedSourceId) requestTilesetPanelVisibility(true)
      return addedSourceId
    },

    deleteFreeTileSource(sourceId) {
      let deleted = false
      get().mutateActive((session) => {
        const owner = freeTileSourceOwnerForId(session.document, sourceId)
        if (!owner || (owner.layer.freeTileSources?.length ?? 0) <= 1) return
        const sourceIndex = owner.layer.freeTileSources!.findIndex((source) => source.id === owner.source.id)
        const tilesetIndex = (session.document.tilesets ?? []).findIndex((tileset) => tileset.id === owner.tileset.id)
        if (sourceIndex < 0 || tilesetIndex < 0) return
        const source = cloneFreeTileSourceLayer(owner.source)
        const tileset = cloneTileset(owner.tileset)
        const references = captureFreeTileSourceReferences(session.document, owner.source.id)
        const affectedLayerIds = freeTileLayerIdsForSource(session.document, owner.source.id)
        const beforeSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId }
        const remaining = owner.layer.freeTileSources!.filter((candidate) => candidate.id !== owner.source.id)
        const fallback = remaining[Math.min(sourceIndex, remaining.length - 1)]
        const fallbackTileset = fallback ? session.document.tilesets?.find((candidate) => candidate.id === fallback.tilesetId) : undefined
        const afterSelection = session.selectedTilesetId === owner.tileset.id
          ? { tilesetId: fallbackTileset?.id ?? null, tileId: fallbackTileset?.tileIds[0] ?? null, secondaryTileId: fallbackTileset?.tileIds[0] ?? null }
          : beforeSelection
        const applySelection = (selection: typeof beforeSelection): void => {
          session.selectedTilesetId = selection.tilesetId
          session.selectedTileId = selection.tileId
          session.secondaryTileId = selection.secondaryTileId
        }
        const remove = (): void => {
          replaceFreeTileSetSources(session.document, owner.layer, (owner.layer.freeTileSources ?? []).filter((candidate) => candidate.id !== source.id))
          session.document.tilesets = (session.document.tilesets ?? []).filter((candidate) => candidate.id !== tileset.id)
          applyFreeTileReferences(session.document, references, 'clear')
          clearFreeTileInstanceSelection(session)
          applySelection(afterSelection)
        }
        const restore = (): void => {
          const sources = [...(owner.layer.freeTileSources ?? [])]
          if (!sources.some((candidate) => candidate.id === source.id)) sources.splice(Math.min(sourceIndex, sources.length), 0, cloneFreeTileSourceLayer(source))
          replaceFreeTileSetSources(session.document, owner.layer, sources)
          const tilesets = [...(session.document.tilesets ?? [])]
          if (!tilesets.some((candidate) => candidate.id === tileset.id)) tilesets.splice(Math.min(tilesetIndex, tilesets.length), 0, cloneTileset(tileset))
          session.document.tilesets = tilesets
          applyFreeTileReferences(session.document, references, 'restore')
          rerenderFreeTileSourceReferences(session.document, source.id)
          applySelection(beforeSelection)
        }
        remove()
        session.history.push({
          label: tr('workspace.history.deleteTilesetTile'),
          bytes: tilemapTilesetBytes(tileset) + references.length * 72 + 128,
          undo: restore,
          redo: remove,
          invalidation: { kind: 'full' },
          affectedLayerIds,
          contentChanged: true,
          requiresAnimationSync: false
        })
        completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
        deleted = true
      }, false)
      return deleted
    },

    deleteFreeTileInstance(instanceId) {
      return get().deleteFreeTileInstances([instanceId])
    },

    deleteFreeTileInstances(instanceIds) {
      let deleted = false
      get().mutateActive((session) => {
        const target = activeFreeTileCelTarget(session.document)
        if (!target) return
        const requestedIds = new Set(instanceIds)
        const removed = target.freeTiles.instances.filter((instance) => requestedIds.has(instance.id))
        if (removed.length === 0 || removed.some((instance) => instance.locked === true)) return
        const removedIds = new Set(removed.map((instance) => instance.id))
        const before = cloneFreeTileCelData(target.freeTiles)
        const after = { instances: before.instances.filter((instance) => !removedIds.has(instance.id)) }
        const displayedBefore = [...before.instances].reverse()
        const primaryBefore = session.selectedFreeTileInstanceId && removedIds.has(session.selectedFreeTileInstanceId)
          ? session.selectedFreeTileInstanceId
          : removed[0]?.id ?? null
        const removedDisplayIndex = primaryBefore ? displayedBefore.findIndex((instance) => instance.id === primaryBefore) : -1
        const displayedAfter = [...after.instances].reverse()
        const fallbackInstance = displayedAfter.length > 0
          ? displayedAfter[Math.min(Math.max(removedDisplayIndex, 0), displayedAfter.length - 1)]
          : null
        const edit: FreeTilePlacementEdit = { layerId: target.layer.id, frameId: target.cel.frameId, before, after, dirtyRect: null }
        applyFreeTilePlacementEdit(session.document, edit, 'after')
        const remainingSelectedIds = session.selectedFreeTileInstanceIds.filter((id) => !removedIds.has(id))
        const retainedPrimaryId = session.selectedFreeTileInstanceId && !removedIds.has(session.selectedFreeTileInstanceId)
          ? session.selectedFreeTileInstanceId
          : null
        const nextPrimaryId = retainedPrimaryId ?? fallbackInstance?.id ?? null
        setFreeTileInstanceSelectionState(session, remainingSelectedIds.length > 0 ? remainingSelectedIds : nextPrimaryId ? [nextPrimaryId] : [], nextPrimaryId)
        if (nextPrimaryId) syncFreeTileInstanceSourceSelection(session, nextPrimaryId)
        else if (after.instances.length === 0) session.freeTileMode = 'paint'
        session.history.push({
          label: tr('canvas.history.eraseFreeTiles'),
          bytes: (before.instances.length + after.instances.length) * 72,
          undo: () => { applyFreeTilePlacementEdit(session.document, edit, 'before') },
          redo: () => { applyFreeTilePlacementEdit(session.document, edit, 'after') },
          invalidation: { kind: 'full' },
          affectedLayerIds: [target.layer.id],
          contentChanged: true,
          requiresAnimationSync: false
        })
        completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
        deleted = true
      }, false)
      return deleted
    },

    showOnlyFreeTileInstance(instanceId) {
      let changed = false
      get().mutateActive((session) => {
        const target = activeFreeTileCelTarget(session.document)
        if (!target || !target.freeTiles.instances.some((instance) => instance.id === instanceId)) return
        const before = cloneFreeTileCelData(target.freeTiles)
        const after: FreeTileCelData = {
          instances: before.instances.map((instance) => ({ ...instance, visible: instance.id === instanceId }))
        }
        if (freeTileCelDataEqual(before, after)) return
        const edit: FreeTilePlacementEdit = { layerId: target.layer.id, frameId: target.cel.frameId, before, after, dirtyRect: null }
        applyFreeTilePlacementEdit(session.document, edit, 'after')
        setFreeTileInstanceSelectionState(session, [instanceId], instanceId)
        session.history.push({
          label: tr('workspace.history.showOnlyFreeTileInstance'),
          bytes: (before.instances.length + after.instances.length) * 72,
          undo: () => { applyFreeTilePlacementEdit(session.document, edit, 'before') },
          redo: () => { applyFreeTilePlacementEdit(session.document, edit, 'after') },
          invalidation: { kind: 'full' },
          affectedLayerIds: [target.layer.id],
          contentChanged: true,
          requiresAnimationSync: false
        })
        completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
        changed = true
      }, false)
      return changed
    },

    setFreeTileInstanceProperties(instanceId, changes: FreeTileInstancePropertyChanges, selectInstance = true) {
      let changed = false
      get().mutateActive((session) => {
        const target = activeFreeTileCelTarget(session.document)
        if (!target) return
        const current = target.freeTiles.instances.find((instance) => instance.id === instanceId)
        if (!current) return
        const source = freeTileSourceForInstance(target.sources, current)
        if (!source) return
        const before = cloneFreeTileCelData(target.freeTiles)
        const after = cloneFreeTileCelData(target.freeTiles)
        const next = after.instances.find((instance) => instance.id === instanceId)
        if (!next) return
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
        if (changes.visible !== undefined) next.visible = changes.visible
        if (changes.locked !== undefined) next.locked = changes.locked
        if (changes.opacity !== undefined && Number.isFinite(changes.opacity)) next.opacity = Math.max(0, Math.min(1, changes.opacity))
        if (changes.blendMode !== undefined) next.blendMode = changes.blendMode
        if (freeTileCelDataEqual(before, after)) return
        const edit: FreeTilePlacementEdit = { layerId: target.layer.id, frameId: target.cel.frameId, before, after, dirtyRect: null }
        applyFreeTilePlacementEdit(session.document, edit, 'after')
        if (selectInstance) setFreeTileInstanceSelectionState(session, [instanceId], instanceId)
        session.history.push({
          label: tr('workspace.history.freeTileInstanceProperties'),
          bytes: (before.instances.length + after.instances.length) * 72,
          undo: () => { applyFreeTilePlacementEdit(session.document, edit, 'before') },
          redo: () => { applyFreeTilePlacementEdit(session.document, edit, 'after') },
          invalidation: { kind: 'full' },
          affectedLayerIds: [target.layer.id],
          contentChanged: true,
          requiresAnimationSync: false
        })
        completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
        changed = true
      }, false)
      return changed
    },

    beginFreeTileInstancePropertiesTransaction(instanceIds) {
      let id: string | null = null
      get().mutateActive((session) => {
        id = beginFreeTileInstancePropertiesTransactionCommand(documentTransactions, session, instanceIds)
      }, false)
      return id
    },

    previewFreeTileInstancePropertiesTransaction(id, changes) {
      let changed = false
      get().mutateActive((session) => {
        changed = previewFreeTileInstancePropertiesTransactionCommand(documentTransactions, session, id, changes)
      }, false)
      return changed
    },

    commitFreeTileInstancePropertiesTransaction(id, changes) {
      let changed = false
      get().mutateActive((session) => {
        changed = commitFreeTileInstancePropertiesTransactionCommand(documentTransactions, session, id, changes)
        if (!changed) return
        completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
      }, false)
      return changed
    },

    cancelFreeTileInstancePropertiesTransaction(id) {
      let canceled = false
      get().mutateActive((session) => {
        canceled = cancelFreeTileInstancePropertiesTransactionCommand(documentTransactions, session, id)
      }, false)
      return canceled
    },

    reorderFreeTileInstance(instanceId, targetInstanceId, position) {
      let changed = false
      get().mutateActive((session) => {
        const target = activeFreeTileCelTarget(session.document)
        if (!target || instanceId === targetInstanceId) return
        const before = cloneFreeTileCelData(target.freeTiles)
        const fromIndex = before.instances.findIndex((instance) => instance.id === instanceId)
        if (fromIndex < 0 || before.instances[fromIndex].locked === true || !before.instances.some((instance) => instance.id === targetInstanceId)) return
        const instances = before.instances.filter((instance) => instance.id !== instanceId)
        const targetIndex = instances.findIndex((instance) => instance.id === targetInstanceId)
        if (targetIndex < 0) return
        const insertIndex = position === 'before' ? targetIndex + 1 : targetIndex
        instances.splice(insertIndex, 0, before.instances[fromIndex])
        const after: FreeTileCelData = { instances }
        if (freeTileCelDataEqual(before, after)) return
        const edit: FreeTilePlacementEdit = { layerId: target.layer.id, frameId: target.cel.frameId, before, after, dirtyRect: null }
        applyFreeTilePlacementEdit(session.document, edit, 'after')
        const selectedIds = session.selectedFreeTileInstanceIds.includes(instanceId)
          ? session.selectedFreeTileInstanceIds
          : [instanceId]
        setFreeTileInstanceSelectionState(session, selectedIds, instanceId, session.freeTileInstanceSelectionAnchorId)
        session.history.push({
          label: tr('workspace.history.reorderFreeTileInstance'),
          bytes: (before.instances.length + after.instances.length) * 72,
          undo: () => { applyFreeTilePlacementEdit(session.document, edit, 'before') },
          redo: () => { applyFreeTilePlacementEdit(session.document, edit, 'after') },
          invalidation: { kind: 'full' },
          affectedLayerIds: [target.layer.id],
          contentChanged: true,
          requiresAnimationSync: false
        })
        completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
        changed = true
      }, false)
      return changed
    },

    setFreeTileSourceProperties(sourceId, changes) {
      let changed = false
      get().mutateActive((session) => {
        const owner = freeTileSourceOwnerForId(session.document, sourceId)
        if (!owner) return
        const before = cloneFreeTileSourceLayer(owner.source)
        const after = cloneFreeTileSourceLayer(owner.source)
        if (changes.name !== undefined) after.name = changes.name.trim() || before.name
        if (changes.description !== undefined) after.description = changes.description
        if ('displayColor' in changes) after.displayColor = changes.displayColor ? { ...changes.displayColor } : undefined
         if (changes.visible !== undefined) after.visible = changes.visible
         if (changes.locked !== undefined) after.locked = changes.locked
        if (changes.offsetX !== undefined) after.offsetX = Math.trunc(changes.offsetX)
        if (changes.offsetY !== undefined) after.offsetY = Math.trunc(changes.offsetY)
        if (freeTileSourceLayerEqual(before, after)) return
        const apply = (snapshot: FreeTileSourceLayer): void => {
          applyFreeTileSourceLayerSnapshot(session.document, snapshot)
        }
        apply(after)
        session.history.push({
          label: tr('workspace.history.layerProperties'),
          bytes: 256,
          undo: () => apply(before),
          redo: () => apply(after),
          invalidation: { kind: 'full' },
          affectedLayerIds: freeTileLayerIdsForSource(session.document, owner.source.id),
          contentChanged: true,
          requiresAnimationSync: false
        })
        completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
        changed = true
      }, false)
      return changed
    },

    beginFreeTileSourcePropertiesTransaction(sourceId) {
      let id: string | null = null
      get().mutateActive((session) => {
        id = beginFreeTileSourcePropertiesTransactionCommand(documentTransactions, session, sourceId)
      }, false)
      return id
    },

    previewFreeTileSourcePropertiesTransaction(id, changes) {
      let changed = false
      get().mutateActive((session) => {
        changed = previewFreeTileSourcePropertiesTransactionCommand(documentTransactions, session, id, changes)
      }, false)
      return changed
    },

    commitFreeTileSourcePropertiesTransaction(id, changes) {
      let changed = false
      get().mutateActive((session) => {
        changed = commitFreeTileSourcePropertiesTransactionCommand(documentTransactions, session, id, changes)
        if (!changed) return
        completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
      }, false)
      return changed
    },

    cancelFreeTileSourcePropertiesTransaction(id) {
      let canceled = false
      get().mutateActive((session) => {
        canceled = cancelFreeTileSourcePropertiesTransactionCommand(documentTransactions, session, id)
      }, false)
      return canceled
    },

    previewFreeTileSource(sourceId, width, height, pixels, offsetX, offsetY) {
      const current = activeSession(get())
      const target = current && freeTileSourceOwnerForId(current.document, sourceId)
      if (!target) return false
      // Source pages are single-tile sheets. Compare the owned pixels directly;
      // preview needs no undo snapshot and unchanged input needs no publication.
      if (target.tileset.columns === 1 && target.tileset.rows === 1
        && target.tileset.tileWidth === width && target.tileset.tileHeight === height
        && target.source.offsetX === offsetX && target.source.offsetY === offsetY
        && target.tileset.pixels.length === pixels.length
        && pixels.every((value, index) => value === target.tileset.pixels[index])) return false
      let changed = false
      get().mutateActive((session) => {
        const refreshed: { rect: import('@shared/types-selection').SelectionRect | null } = { rect: null }
        const owner = freeTileSourceOwnerForId(session.document, sourceId)
        if (!owner) return
        changed = applyFreeTileSourceSnapshot(session.document, {
          sourceId: owner.source.id,
          tilesetId: owner.tileset.id,
          width,
          height,
          pixels,
          offsetX,
          offsetY
        }, rect => { refreshed.rect = rect })
        if (changed) {
          const fromRevision = session.contentRevision
          session.revision += 1
          session.contentRevision += 1
          session.layersPanelRevision += 1
          const previous = session.contentInvalidation
          const dirty = refreshed.rect ?? { x: 0, y: 0, width: 0, height: 0 }
          const accumulated = previous?.kind === 'region' && previous.revision === fromRevision && !previous.frameId ? previous : null
          session.contentInvalidation = { kind: 'region', rect: accumulated ? unionFreeTileSourceRects(accumulated.rect, dirty) : dirty,
            fromRevision: accumulated?.fromRevision ?? fromRevision, revision: session.contentRevision }
        }
      }, false)
      return changed
    },

    commitFreeTileSourceEdit(sourceId, before, after, label, placementEdit, selectionEdit) {
      let committed: HistoryEntry | null = null
      get().mutateActive((session) => {
        committed = commitFreeTileSourceEditInSession(recordDocumentOperation, session, sourceId, before, after, label, placementEdit, selectionEdit)
      }, false)
      return committed
    },

    beginFreeTilePlacement() {
      const session = activeSession(get())
      let target = session ? activeFreeTileCelTarget(session.document) : null
      if (session && !target) {
        const timeline = ensureAnimationDocument(session.document)
        const layer = session.document.layers.find((candidate) => candidate.id === session.document.activeLayerId && candidate.kind === 'free-tile')
        const frameId = timeline.activeFrameId
        if (layer && timeline.frames.some((frame) => frame.id === frameId)) {
          ensureAnimationCelSlot(session.document, layer.id, frameId)
          target = activeFreeTileCelTarget(session.document)
        }
      }
      return target ? {
        layerId: target.layer.id,
        frameId: target.cel.frameId,
        before: cloneFreeTileCelData(target.freeTiles),
        after: cloneFreeTileCelData(target.freeTiles),
        dirtyRect: null
      } : null
    },

    previewFreeTilePlacement(edit) {
      let changed = false
      get().mutateActive((session) => {
        const target = activeFreeTileCelTarget(session.document)
        if (!target || target.layer.id !== edit.layerId || target.cel.frameId !== edit.frameId) return
        changed = applyFreeTilePlacementEdit(session.document, edit, 'after')
        if (changed) {
          const fromRevision = session.contentRevision
          session.revision += 1
          session.contentRevision += 1
          session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
        }
      }, false)
      return changed
    },

    commitFreeTilePlacement(edit, label, selectionEdit) {
      const placementChanged = !freeTileCelDataEqual(edit.before, edit.after)
      const beforeSelection = cloneSelectionMask(selectionEdit?.before ?? null)
      const afterSelection = cloneSelectionMask(selectionEdit?.after ?? null)
      const beforeSelectionPivot = selectionEdit?.beforePivot ? { ...selectionEdit.beforePivot } : null
      const afterSelectionPivot = selectionEdit?.afterPivot ? { ...selectionEdit.afterPivot } : null
      const selectionChanged = Boolean(selectionEdit && (
        !selectionMasksEqual(beforeSelection, afterSelection)
        || beforeSelectionPivot?.x !== afterSelectionPivot?.x
        || beforeSelectionPivot?.y !== afterSelectionPivot?.y
      ))
      if (!placementChanged && !selectionChanged) return null
      let committed: HistoryEntry | null = null
      get().mutateActive((session) => {
        const target = activeFreeTileCelTarget(session.document)
        if (!target || target.layer.id !== edit.layerId || target.cel.frameId !== edit.frameId) return
        const applyBefore = (): void => {
          if (placementChanged) applyFreeTilePlacementEdit(session.document, edit, 'before')
          if (selectionEdit) {
            session.selection = cloneSelectionMask(beforeSelection)
            session.selectionPivot = beforeSelectionPivot ? { ...beforeSelectionPivot } : null
          }
        }
        const applyAfter = (): void => {
          if (placementChanged) applyFreeTilePlacementEdit(session.document, edit, 'after')
          if (selectionEdit) {
            session.selection = cloneSelectionMask(afterSelection)
            session.selectionPivot = afterSelectionPivot ? { ...afterSelectionPivot } : null
          }
        }
        applyAfter()
        const entry: HistoryEntry = {
          label,
          bytes: (placementChanged ? (edit.before.instances.length + edit.after.instances.length) * 72 : 0)
            + (beforeSelection?.mask?.byteLength ?? 0)
            + (afterSelection?.mask?.byteLength ?? 0)
            + (selectionEdit ? 64 : 0),
          undo: applyBefore,
          redo: applyAfter,
          ...(placementChanged ? { invalidation: { kind: 'full' as const }, affectedLayerIds: [edit.layerId] } : {}),
          documentChanged: placementChanged,
          contentChanged: placementChanged,
          requiresAnimationSync: false
        }
        session.history.push(entry)
        if (placementChanged) {
          touch(session, true, { kind: 'full' })
          recordDocumentOperation(session, { stroke: true })
        }
        committed = entry
      }, false)
      return committed
    },

    cancelFreeTilePlacement(edit) {
      get().mutateActive((session) => {
        applyFreeTilePlacementEdit(session.document, edit, 'before')
      }, false)
    }
  }
}
