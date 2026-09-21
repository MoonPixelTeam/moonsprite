import { completeDocumentChange } from './workspace-document-change'
import type { AnimationLayerMask, LayerGroup, RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { Tileset } from '@shared/types-tiles'
import { type ContentInvalidationHint, type HistoryEntry } from '@/core/history'
import { cachedLayerContentBounds, createId, duplicateLayer, getDescendantGroupIds, getLayerIdsInGroup, getLayer, isGroupEffectivelyLocked, isLayerEffectivelyLocked } from '@/core/document-model'
import { expandLayerStyleInvalidationRect, normalCompositeLayers } from '@/core/document-composite'
import { cloneAnimationCelsForLayer, cloneAnimationGroupMask, cloneAnimationLayerMask, ensureAnimationDocument, removeAnimationCelsForLayers, resolveAnimationCel, restoreAnimationCels, syncActiveAnimationFrame } from '@/core/animation'
import { mergeLayerDown, mergeLayerGroup, mergeRasterLayers, mergeVisibleLayers as mergeVisibleDocumentLayers, type LayerMergeSuccess } from '@/core/layer-merge'
import { assignGroupToGroup as assignGroupToGroupOperation, assignGroupToRoot as assignGroupToRootOperation, assignLayersAboveGroup as assignLayersAboveGroupOperation, assignLayersToGroup as assignLayersToGroupOperation, assignLayersToRoot as assignLayersToRootOperation, canMoveGroupInto, createLayerGroup as createLayerGroupOperation, moveGroupToRootEdge as moveGroupToRootEdgeOperation, moveLayerPanelRows as moveLayerPanelRowsOperation, moveLayersToRootEdge as moveLayersToRootEdgeOperation, positionGroupNextToLayer as positionGroupNextToLayerOperation, reorderGroup as reorderGroupOperation, reorderLayers as reorderLayersOperation, ungroupSelected as ungroupSelectedOperation } from '@/core/layer-operations'
import { translateTextCelData } from '@/core/text-raster'
import { cloneLayerStyles } from '@/core/layer-styles'
import { cloneTileset } from '@/core/tilemap'
import { captureLayerUi, commitLayerMerge } from './workspace-history'
import { captureDocumentStructureSnapshot, type DocumentStructureSnapshot } from './workspace-document-history'
import { beginLayerMoveDuplicatePreview as beginLayerMoveDuplicatePreviewCommand, cancelLayerMovePreview as cancelLayerMovePreviewCommand, createLayerMoveHistoryEntry, previewLayerMove as previewLayerMoveCommand, type LayerMoveDuplicateResult } from './workspace-layer-move'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceLayerCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { unionRects } from './workspace-selection-geometry'
import { cloneFreeTileSourceLayer, createLinkedLayerNameAllocator, tilemapTilesetBytes } from './workspace-layer-resources'
import { normalizeAnimationSelection, selectedGroupRows, selectedDirectLayerRows, applyLayerRowSelection, selectedRowInsertionTarget } from './workspace-animation-selection'
import { documentUsesTilesetPanel, requestTilesetPanelVisibility } from './workspace-tileset-panel'
import { activeSession } from './workspace-access'
import { tr } from './workspace-translation'
import { cloneAnimationCelsForLayerIds } from './workspace-animation-clone'
import { layerHistoryBytes, groupHistoryBytes } from './workspace-layer-style-history'
import { type IndexedTilesetSnapshot, removeTilesetSnapshots, removableOwnedTilesets } from './workspace-layer-owned-tilesets'
import { captureAnimationSelectionHistory, historyEntryWithAnimationSelection } from './workspace-animation-selection-history'

const cloneAnimationLayerMasksForLayerIds = (document: SpriteDocument, layerIds: ReadonlySet<string>): AnimationLayerMask[] =>
  (ensureAnimationDocument(document).layerMasks ?? [])
    .filter((entry) => layerIds.has(entry.layerId))
    .map((entry) => cloneAnimationLayerMask(entry))

const removeAnimationLayerMasksForLayerIds = (document: SpriteDocument, layerIds: ReadonlySet<string>): void => {
  const timeline = ensureAnimationDocument(document)
  timeline.layerMasks = (timeline.layerMasks ?? []).filter((entry) => !layerIds.has(entry.layerId))
}

const restoreAnimationLayerMasks = (document: SpriteDocument, masks: readonly AnimationLayerMask[]): void => {
  const timeline = ensureAnimationDocument(document)
  timeline.layerMasks ??= []
  for (const entry of masks) {
    if (timeline.layerMasks.some((candidate) => candidate.layerId === entry.layerId && candidate.frameId === entry.frameId)) continue
    timeline.layerMasks.push(cloneAnimationLayerMask(entry))
  }
}

const cloneOwnedLayerTilesets = (
  document: SpriteDocument,
  pairs: readonly { source: RasterLayer; target: RasterLayer }[]
): Tileset[] => {
  const timeline = ensureAnimationDocument(document)
  const created: Tileset[] = []
  for (const { source, target } of pairs) {
    if (source.kind !== target.kind || (target.kind !== 'tilemap' && target.kind !== 'free-tile')) continue
    if (source.kind === 'tilemap' && target.kind === 'tilemap') {
      const sourceTileset = document.tilesets?.find((tileset) => tileset.id === source.tilemapTilesetId)
      if (!sourceTileset) continue
      const tileset = { ...cloneTileset(sourceTileset), id: createId('tileset'), name: target.name }
      target.tilemapTilesetId = tileset.id
      for (const cel of timeline.cels) {
        if (cel.layerId !== target.id || !cel.tilemap) continue
        for (const cell of cel.tilemap.cells) if (cell?.tilesetId === sourceTileset.id) cell.tilesetId = tileset.id
      }
      created.push(tileset)
      continue
    }
    if (source.kind !== 'free-tile' || target.kind !== 'free-tile') continue
    const sourceIdMap = new Map<string, string>()
    target.freeTileSetId = createId('free-tile-set')
    target.freeTileSources = (source.freeTileSources ?? []).flatMap((sourceLayer) => {
      const sourceTileset = document.tilesets?.find((tileset) => tileset.id === sourceLayer.tilesetId)
      if (!sourceTileset) return []
      const nextSourceId = createId('free-tile-source')
      const tileset = { ...cloneTileset(sourceTileset), id: createId('tileset'), name: sourceLayer.name }
      sourceIdMap.set(sourceLayer.id, nextSourceId)
      created.push(tileset)
      return [{ ...cloneFreeTileSourceLayer(sourceLayer), id: nextSourceId, tilesetId: tileset.id }]
    })
    delete target.freeTileTilesetId
    for (const cel of timeline.cels) {
      if (cel.layerId !== target.id || !cel.freeTiles) continue
      cel.freeTiles.instances = cel.freeTiles.instances.flatMap((instance) => {
        const sourceId = instance.sourceId ? sourceIdMap.get(instance.sourceId) : undefined
        return sourceId ? [{ ...instance, sourceId, tileId: undefined }] : []
      })
    }
  }
  if (created.length > 0) document.tilesets = [...(document.tilesets ?? []), ...created]
  return created
}

const restoreTilesetSnapshots = (document: SpriteDocument, snapshots: readonly IndexedTilesetSnapshot[]): void => {
  document.tilesets ??= []
  for (const snapshot of [...snapshots].sort((left, right) => left.index - right.index)) {
    if (!document.tilesets.some((tileset) => tileset.id === snapshot.tileset.id)) document.tilesets.splice(Math.min(snapshot.index, document.tilesets.length), 0, snapshot.tileset)
  }
}

const commitLayerMergeWithOwnedTilesets = (
  session: DocumentSession,
  beforeDocument: DocumentStructureSnapshot,
  beforeUi: ReturnType<typeof captureLayerUi>,
  result: LayerMergeSuccess,
  label: string
): boolean => {
  const hadTilesetPanelContent = beforeDocument.layers.some((layer) => layer.kind === 'tilemap' || layer.kind === 'free-tile')
  const removedLayerIds = new Set(result.removedLayerIds)
  const removedFreeTileLayerIds = new Set(beforeDocument.layers
    .filter((layer) => removedLayerIds.has(layer.id) && layer.kind === 'free-tile')
    .map((layer) => layer.id))
  removeTilesetSnapshots(session.document, removableOwnedTilesets(session.document, removedFreeTileLayerIds, beforeDocument.layers))
  commitLayerMerge(session, beforeDocument, beforeUi, result, label)
  normalizeAnimationSelection(session)
  return hadTilesetPanelContent && !documentUsesTilesetPanel(session.document)
}

const layerReorderInvalidation = (
  document: SpriteDocument,
  beforeRenderOrder: readonly RasterLayer[] | null,
  afterRenderOrder: readonly RasterLayer[] | null
): ContentInvalidationHint => {
  if (!beforeRenderOrder || !afterRenderOrder || beforeRenderOrder.length !== afterRenderOrder.length) return { kind: 'full' }
  const beforePositions = new Map(beforeRenderOrder.map((layer, index) => [layer.id, index]))
  if (afterRenderOrder.some((layer) => !beforePositions.has(layer.id))) return { kind: 'full' }
  const changedLayers = afterRenderOrder.filter((layer, index) => beforePositions.get(layer.id) !== index)
  if (changedLayers.length === 0) return { kind: 'full' }
  let rect: SelectionRect | null = null
  for (const layer of changedLayers) {
    const bounds = cachedLayerContentBounds(document, layer)
    if (bounds === undefined) return { kind: 'full' }
    if (!bounds) continue
    const expanded = expandLayerStyleInvalidationRect(document, bounds, [layer.id])
    rect = rect ? unionRects(rect, expanded) : expanded
  }
  return rect ? { kind: 'region', rect } : { kind: 'full' }
}

const lockedGroupStructure = (document: SpriteDocument, groupId: string): boolean => {
  const groupIds = new Set([groupId, ...getDescendantGroupIds(document, groupId)])
  return document.groups.some((group) => groupIds.has(group.id) && isGroupEffectivelyLocked(document, group))
    || document.layers.some((layer) => Boolean(layer.groupId && groupIds.has(layer.groupId)) && isLayerEffectivelyLocked(document, layer))
}

export function createLayerStructureCommands({ get, set, recording }: WorkspaceCommandContext<'mutateActive' | 'deleteSelectedLayers' | 'commitFloatingPaste' | 'pushHistory' | 'activateLayerForCanvas' | 'reorderLayers' | 'assignLayersToGroup'>): Pick<WorkspaceLayerCommands, 'duplicateActiveLayer' | 'duplicateLayers' | 'duplicateSelectedLayerRows' | 'deleteActiveLayer' | 'deleteSelectedLayers' | 'mergeSelectedLayers' | 'mergeActiveLayerDown' | 'mergeSelectedGroup' | 'mergeVisibleLayers' | 'moveLayer' | 'moveLayerBy' | 'beginLayerMoveDuplicatePreview' | 'previewLayerMove' | 'cancelLayerMovePreview' | 'commitLayerMove' | 'reorderLayer' | 'reorderLayers' | 'assignLayerToGroup' | 'assignLayersToGroup' | 'assignLayersToRoot' | 'assignLayersAboveGroup' | 'reorderGroup' | 'positionGroupNextToLayer' | 'assignGroupToGroup' | 'assignGroupToRoot' | 'moveLayersToRootEdge' | 'moveGroupToRootEdge' | 'moveLayerRows' | 'createLayerGroup' | 'ungroupSelected'> {
  const { recordDocumentOperation } = recording
  return {
    duplicateActiveLayer() {
      get().mutateActive((session) => {
        const document = session.document
        const priorId = document.activeLayerId
        syncActiveAnimationFrame(document)
        const source = getLayer(document, priorId)
        const linkedCopyName = source.linkedContentId ? createLinkedLayerNameAllocator(document)(source.linkedContentId, source.name) : null
        const copy = duplicateLayer(document, priorId)
        if (linkedCopyName) copy.name = linkedCopyName
        cloneAnimationCelsForLayer(document, priorId, copy)
        const copiedTilesets = cloneOwnedLayerTilesets(document, [{ source, target: copy }])
        const animationCels = cloneAnimationCelsForLayerIds(document, [copy.id])
        session.selectedGroupId = null
        session.selectedGroupIds = []
        session.selectedLayerIds = [copy.id]
        const index = document.layers.findIndex((item) => item.id === copy.id)
        session.history.push({
          label: tr('workspace.history.copyLayer'), bytes: layerHistoryBytes(copy) + copiedTilesets.reduce((sum, tileset) => sum + tilemapTilesetBytes(tileset), 0),
          undo: () => { document.layers = document.layers.filter((item) => item.id !== copy.id); removeAnimationCelsForLayers(document, [copy.id]); document.tilesets = (document.tilesets ?? []).filter((tileset) => !copiedTilesets.some((copyTileset) => copyTileset.id === tileset.id)); document.activeLayerId = priorId },
          redo: () => { for (const tileset of copiedTilesets) if (!document.tilesets?.some((candidate) => candidate.id === tileset.id)) document.tilesets = [...(document.tilesets ?? []), tileset]; document.layers.splice(index, 0, copy); restoreAnimationCels(document, animationCels); document.activeLayerId = copy.id }
        })
      }, true, true)
    },
    duplicateLayers(layerIds) {
      const createdIds: string[] = []
      get().mutateActive((session) => {
        const document = session.document
        const priorActiveId = document.activeLayerId
        const priorSelection = [...session.selectedLayerIds]
        const orderedIds = [...new Set(layerIds)]
          .filter((id) => document.layers.some((layer) => layer.id === id))
          .sort((left, right) => document.layers.findIndex((layer) => layer.id === left) - document.layers.findIndex((layer) => layer.id === right))
        syncActiveAnimationFrame(document)
        const sourceLayers = orderedIds.map((id) => getLayer(document, id))
        const allocateLinkedLayerName = createLinkedLayerNameAllocator(document)
        const copies = sourceLayers.map((source) => {
          const linkedCopyName = source.linkedContentId ? allocateLinkedLayerName(source.linkedContentId, source.name) : null
          const copy = duplicateLayer(document, source.id)
          if (linkedCopyName) copy.name = linkedCopyName
          cloneAnimationCelsForLayer(document, source.id, copy)
          return copy
        })
        if (copies.length === 0) return
        const copiedTilesets = cloneOwnedLayerTilesets(document, copies.map((copy, index) => ({ source: sourceLayers[index], target: copy })))
        createdIds.push(...copies.map((copy) => copy.id))
        const placements = copies.map((copy) => ({ copy, index: document.layers.indexOf(copy) }))
        const animationCels = cloneAnimationCelsForLayerIds(document, createdIds)
        document.activeLayerId = copies.at(-1)!.id
        session.selectedGroupId = null
        session.selectedGroupIds = []
        session.selectedLayerIds = [...createdIds]
        session.history.push({
          label: tr('workspace.history.copyLayer'),
          bytes: copies.reduce((sum, copy) => sum + layerHistoryBytes(copy), 0) + copiedTilesets.reduce((sum, tileset) => sum + tilemapTilesetBytes(tileset), 0),
          undo: () => {
            const ids = new Set(createdIds)
            document.layers = document.layers.filter((layer) => !ids.has(layer.id))
            removeAnimationCelsForLayers(document, createdIds)
            document.tilesets = (document.tilesets ?? []).filter((tileset) => !copiedTilesets.some((copyTileset) => copyTileset.id === tileset.id))
            document.activeLayerId = priorActiveId
            session.selectedLayerIds = priorSelection
            session.selectedGroupId = null
            session.selectedGroupIds = []
          },
          redo: () => {
            for (const tileset of copiedTilesets) if (!document.tilesets?.some((candidate) => candidate.id === tileset.id)) document.tilesets = [...(document.tilesets ?? []), tileset]
            for (const { copy, index } of placements) if (!document.layers.some((layer) => layer.id === copy.id)) document.layers.splice(Math.min(index, document.layers.length), 0, copy)
            restoreAnimationCels(document, animationCels)
            document.activeLayerId = copies.at(-1)!.id
            session.selectedLayerIds = [...createdIds]
            session.selectedGroupId = null
            session.selectedGroupIds = []
          }
        })
      }, true, true)
      return createdIds
    },
    duplicateSelectedLayerRows() {
      const result = { layerIds: [] as string[], groupIds: [] as string[] }
      const current = activeSession(get())
      if (!current) return result
      const selectedGroups = new Set(selectedGroupRows(current))
      const rootGroupIds = [...selectedGroups].filter((groupId) => !current.document.groups.some((candidate) => selectedGroups.has(candidate.id) && getDescendantGroupIds(current.document, candidate.id).includes(groupId)))
      const copiedGroupIds = new Set<string>()
      for (const rootGroupId of rootGroupIds) {
        copiedGroupIds.add(rootGroupId)
        for (const descendantId of getDescendantGroupIds(current.document, rootGroupId)) copiedGroupIds.add(descendantId)
      }
      const directLayerIds = selectedDirectLayerRows(current).filter((layerId) => {
        const layer = current.document.layers.find((candidate) => candidate.id === layerId)
        return Boolean(layer && (!layer.groupId || !copiedGroupIds.has(layer.groupId)))
      })
      if (rootGroupIds.length === 0 && directLayerIds.length === 0) return result
      get().mutateActive((session) => {
        const document = session.document
        const placement = selectedRowInsertionTarget(session)
        const previousActiveId = document.activeLayerId
        const previousLayerIds = [...session.selectedLayerIds]
        const previousGroupId = session.selectedGroupId
        const previousGroupIds = [...session.selectedGroupIds]
        const previousCollapsedGroupIds = [...session.collapsedGroupIds]
        const groupIdMap = new Map([...copiedGroupIds].map((id) => [id, createId('group')]))
        const groups = document.groups.filter((group) => copiedGroupIds.has(group.id)).map((group): LayerGroup => ({
          ...group,
          id: groupIdMap.get(group.id)!,
          name: `${group.name} ${tr('canvas.history.copySuffix')}`,
          parentGroupId: group.parentGroupId && groupIdMap.has(group.parentGroupId) ? groupIdMap.get(group.parentGroupId)! : group.parentGroupId ?? null,
          panelOrder: typeof group.panelOrder === 'number' ? group.panelOrder + 0.01 : group.panelOrder,
          layerStyles: cloneLayerStyles(group.layerStyles),
          displayColor: group.displayColor ? { ...group.displayColor } : undefined
        }))
        const timeline = ensureAnimationDocument(document)
        const groupMasks = (timeline.groupMasks ?? [])
          .filter((entry) => copiedGroupIds.has(entry.groupId))
          .map((entry) => cloneAnimationGroupMask(entry, groupIdMap.get(entry.groupId)!, entry.frameId, createId('mask')))
        const copiedCollapsedGroupIds = [...copiedGroupIds]
          .filter((id) => previousCollapsedGroupIds.includes(id))
          .map((id) => groupIdMap.get(id)!)
        const allLayerIds = new Set(directLayerIds)
        for (const groupId of copiedGroupIds) for (const layerId of getLayerIdsInGroup(document, groupId)) allLayerIds.add(layerId)
        syncActiveAnimationFrame(document)
        const sourceLayers = document.layers.filter((layer) => allLayerIds.has(layer.id))
        const allocateLinkedLayerName = createLinkedLayerNameAllocator(document)
        const layers = sourceLayers.map((source): RasterLayer => {
          const id = createId('layer')
          const name = source.linkedContentId
            ? allocateLinkedLayerName(source.linkedContentId, source.name)
            : `${source.name} ${tr('canvas.history.copySuffix')}`
          const common = { ...source, id, name, groupId: source.groupId && groupIdMap.has(source.groupId) ? groupIdMap.get(source.groupId)! : source.groupId, layerStyles: cloneLayerStyles(source.layerStyles), background: source.background ? { ...source.background } : undefined, displayColor: source.displayColor ? { ...source.displayColor } : undefined }
          return source.format === 'rgba'
            ? { ...common, format: 'rgba', pixels: new Uint8ClampedArray(source.pixels) }
            : { ...common, format: 'indexed', pixels: new Uint32Array(source.pixels) }
        })
        const directSourceIds = new Set(directLayerIds)
        result.layerIds = layers.filter((_, index) => directSourceIds.has(sourceLayers[index].id)).map((layer) => layer.id)
        result.groupIds = rootGroupIds.map((id) => groupIdMap.get(id)!).filter(Boolean)
        const insertionIndex = Math.max(0, ...sourceLayers.map((layer) => document.layers.indexOf(layer))) + 1
        document.groups.push(...groups)
        timeline.groupMasks ??= []
        timeline.groupMasks.push(...groupMasks)
        document.layers.splice(insertionIndex, 0, ...layers)
        layers.forEach((layer, index) => cloneAnimationCelsForLayer(document, sourceLayers[index].id, layer))
        const copiedTilesets = cloneOwnedLayerTilesets(document, layers.map((layer, index) => ({ source: sourceLayers[index], target: layer })))
        const animationCels = cloneAnimationCelsForLayerIds(document, layers.map((layer) => layer.id))
        document.activeLayerId = layers.at(-1)?.id ?? previousActiveId
        session.collapsedGroupIds = [...new Set([...previousCollapsedGroupIds, ...copiedCollapsedGroupIds])]
        applyLayerRowSelection(session, layers.map((layer) => layer.id), result.groupIds, layers.length > 0 ? { kind: 'layer', id: layers.at(-1)!.id } : { kind: 'group', id: result.groupIds.at(-1)! })
        const createdLayerIds = new Set(layers.map((layer) => layer.id))
        const createdGroupIds = new Set(groups.map((group) => group.id))
        const creationHistory: HistoryEntry = {
          label: tr('workspace.history.copyLayer'),
          bytes: layers.reduce((sum, layer) => sum + layerHistoryBytes(layer), 0) + copiedTilesets.reduce((sum, tileset) => sum + tilemapTilesetBytes(tileset), 0) + groups.reduce((sum, group) => sum + groupHistoryBytes(group), 0) + groupMasks.reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0),
          undo: () => {
            document.layers = document.layers.filter((layer) => !createdLayerIds.has(layer.id))
            removeAnimationCelsForLayers(document, layers.map((layer) => layer.id))
            document.tilesets = (document.tilesets ?? []).filter((tileset) => !copiedTilesets.some((copyTileset) => copyTileset.id === tileset.id))
            document.groups = document.groups.filter((group) => !createdGroupIds.has(group.id))
            timeline.groupMasks = (timeline.groupMasks ?? []).filter((entry) => !createdGroupIds.has(entry.groupId))
            document.activeLayerId = previousActiveId
            session.selectedLayerIds = previousLayerIds
            session.selectedGroupId = previousGroupId
            session.selectedGroupIds = previousGroupIds
            session.collapsedGroupIds = previousCollapsedGroupIds
          },
          redo: () => {
            for (const group of groups) if (!document.groups.includes(group)) document.groups.push(group)
            timeline.groupMasks ??= []
            for (const entry of groupMasks) if (!timeline.groupMasks.some((candidate) => candidate.mask.id === entry.mask.id)) timeline.groupMasks.push(entry)
            for (const tileset of copiedTilesets) if (!document.tilesets?.some((candidate) => candidate.id === tileset.id)) document.tilesets = [...(document.tilesets ?? []), tileset]
            const missing = layers.filter((layer) => !document.layers.includes(layer))
            if (missing.length > 0) document.layers.splice(Math.min(insertionIndex, document.layers.length), 0, ...missing)
            restoreAnimationCels(document, animationCels)
            document.activeLayerId = layers.at(-1)?.id ?? previousActiveId
            session.collapsedGroupIds = [...new Set([...previousCollapsedGroupIds, ...copiedCollapsedGroupIds])]
            applyLayerRowSelection(session, layers.map((layer) => layer.id), result.groupIds, layers.length > 0 ? { kind: 'layer', id: layers.at(-1)!.id } : { kind: 'group', id: result.groupIds.at(-1)! })
          }
        }
        const placementHistory = moveLayerPanelRowsOperation(session, result.layerIds, result.groupIds, placement)
        session.history.push(placementHistory ? {
          label: creationHistory.label,
          bytes: creationHistory.bytes + placementHistory.bytes,
          undo: () => { placementHistory.undo(); creationHistory.undo() },
          redo: () => { creationHistory.redo(); placementHistory.redo() }
        } : creationHistory)
      }, true, true)
      return result
    },
    deleteActiveLayer() {
      if (activeSession(get())?.freeTileInstanceLayerId) return
      if ((activeSession(get())?.selectedLayerIds.length ?? 0) > 1) {
        get().deleteSelectedLayers()
        return
      }
      let shouldHideTilesetPanel = false
      get().mutateActive((session) => {
        const document = session.document
        if (document.layers.length === 1) { set({ message: tr('workspace.layer.minimum') }); return }
        const index = document.layers.findIndex((item) => item.id === document.activeLayerId)
        const removed = document.layers[index]
        if (!removed || isLayerEffectivelyLocked(document, removed)) { set({ message: tr('workspace.layer.lockedDelete') }); return }
        const removedTilesets = removableOwnedTilesets(document, new Set([removed.id]))
        const animationCels = cloneAnimationCelsForLayerIds(document, [removed.id])
        const removedLayerIds = new Set([removed.id])
        const animationLayerMasks = cloneAnimationLayerMasksForLayerIds(document, removedLayerIds)
        document.layers.splice(index, 1)
        removeAnimationCelsForLayers(document, [removed.id])
        removeAnimationLayerMasksForLayerIds(document, removedLayerIds)
        removeTilesetSnapshots(document, removedTilesets)
        const nextId = document.layers[Math.max(0, index - 1)].id
        document.activeLayerId = nextId
        session.selectedGroupId = null
        session.selectedGroupIds = []
        session.selectedLayerIds = [nextId]
        shouldHideTilesetPanel = (removed.kind === 'tilemap' || removed.kind === 'free-tile') && !documentUsesTilesetPanel(document)
        session.history.push({
          label: tr('workspace.history.deleteLayer'), bytes: layerHistoryBytes(removed) + animationLayerMasks.reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0) + removedTilesets.reduce((sum, snapshot) => sum + tilemapTilesetBytes(snapshot.tileset), 0),
          undo: () => { restoreTilesetSnapshots(document, removedTilesets); document.layers.splice(index, 0, removed); restoreAnimationCels(document, animationCels); restoreAnimationLayerMasks(document, animationLayerMasks); document.activeLayerId = removed.id },
          redo: () => { document.layers = document.layers.filter((item) => item.id !== removed.id); removeAnimationCelsForLayers(document, [removed.id]); removeAnimationLayerMasksForLayerIds(document, removedLayerIds); removeTilesetSnapshots(document, removedTilesets); document.activeLayerId = nextId }
        })
      }, true, true)
      if (shouldHideTilesetPanel) requestTilesetPanelVisibility(false)
    },
    deleteSelectedLayers() {
      const current = activeSession(get())
      if (!current) return
      if (current.freeTileInstanceLayerId) return
      const selectedGroupIdSet = new Set<string>()
      for (const groupId of selectedGroupRows(current)) {
        selectedGroupIdSet.add(groupId)
        for (const descendantId of getDescendantGroupIds(current.document, groupId)) selectedGroupIdSet.add(descendantId)
      }
      const selectedIds = new Set(selectedDirectLayerRows(current))
      for (const groupId of selectedGroupIdSet) for (const layerId of getLayerIdsInGroup(current.document, groupId)) selectedIds.add(layerId)
      const removedGroups = current.document.groups.map((group, index) => ({ group, index })).filter(({ group }) => selectedGroupIdSet.has(group.id))
      const removed = current.document.layers.map((layer, index) => ({ layer, index })).filter(({ layer }) => selectedIds.has(layer.id))
      if (removed.length === 0 && removedGroups.length === 0) return
      const locked = removed.some(({ layer }) => isLayerEffectivelyLocked(current.document, layer))
        || removedGroups.some(({ group }) => isGroupEffectivelyLocked(current.document, group))
      if (locked) { set({ message: tr('workspace.layer.structureLocked') }); return }
      if (removed.length >= current.document.layers.length) { set({ message: tr('workspace.layer.minimum') }); return }
      let shouldHideTilesetPanel = false
      get().mutateActive((session) => {
        const document = session.document
        const previousActiveId = document.activeLayerId
        const previousSelection = [...session.selectedLayerIds]
        const previousGroupId = session.selectedGroupId
        const previousGroupIds = [...session.selectedGroupIds]
        const removedTilesets = removableOwnedTilesets(document, selectedIds)
        const animationCels = cloneAnimationCelsForLayerIds(document, [...selectedIds])
        const timeline = ensureAnimationDocument(document)
        const removedLayerMasks = cloneAnimationLayerMasksForLayerIds(document, selectedIds)
        const removedGroupMasks = (timeline.groupMasks ?? []).filter((entry) => selectedGroupIdSet.has(entry.groupId)).map((entry) => cloneAnimationGroupMask(entry))
        document.layers = document.layers.filter((layer) => !selectedIds.has(layer.id))
        removeAnimationCelsForLayers(document, [...selectedIds])
        removeAnimationLayerMasksForLayerIds(document, selectedIds)
        timeline.groupMasks = (timeline.groupMasks ?? []).filter((entry) => !selectedGroupIdSet.has(entry.groupId))
        if (removedGroups.length > 0) document.groups = document.groups.filter((group) => !selectedGroupIdSet.has(group.id))
        removeTilesetSnapshots(document, removedTilesets)
        const nearestIndex = removed.length > 0 ? Math.max(0, Math.min(document.layers.length - 1, removed[0].index - 1)) : document.layers.findIndex((layer) => layer.id === previousActiveId)
        const nextId = document.layers[Math.max(0, nearestIndex)]?.id ?? previousActiveId
        document.activeLayerId = nextId
        session.selectedGroupId = null
        session.selectedGroupIds = []
        session.selectedLayerIds = [nextId]
        shouldHideTilesetPanel = removed.some(({ layer }) => layer.kind === 'tilemap' || layer.kind === 'free-tile') && !documentUsesTilesetPanel(document)
        session.history.push({
          label: removedGroups.length > 0 ? tr('workspace.history.deleteGroup') : removed.length === 1 ? tr('workspace.history.deleteLayer') : tr('workspace.history.deleteLayers'),
          bytes: removed.reduce((sum, item) => sum + layerHistoryBytes(item.layer), 0) + removedTilesets.reduce((sum, snapshot) => sum + tilemapTilesetBytes(snapshot.tileset), 0) + removedGroups.reduce((sum, item) => sum + groupHistoryBytes(item.group), 0) + [...removedLayerMasks, ...removedGroupMasks].reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0),
          undo: () => {
            restoreTilesetSnapshots(document, removedTilesets)
            for (const item of removedGroups) if (!document.groups.some((group) => group.id === item.group.id)) document.groups.splice(Math.min(item.index, document.groups.length), 0, item.group)
            for (const item of removed) if (!document.layers.some((layer) => layer.id === item.layer.id)) document.layers.splice(Math.min(item.index, document.layers.length), 0, item.layer)
            restoreAnimationCels(document, animationCels)
            restoreAnimationLayerMasks(document, removedLayerMasks)
            timeline.groupMasks ??= []
            for (const entry of removedGroupMasks) if (!timeline.groupMasks.some((candidate) => candidate.mask.id === entry.mask.id)) timeline.groupMasks.push(cloneAnimationGroupMask(entry))
            document.activeLayerId = previousActiveId
            session.selectedLayerIds = previousSelection
            session.selectedGroupId = previousGroupId
            session.selectedGroupIds = previousGroupIds
          },
          redo: () => {
            document.layers = document.layers.filter((layer) => !selectedIds.has(layer.id))
            removeAnimationCelsForLayers(document, [...selectedIds])
            removeAnimationLayerMasksForLayerIds(document, selectedIds)
            document.groups = document.groups.filter((group) => !selectedGroupIdSet.has(group.id))
            timeline.groupMasks = (timeline.groupMasks ?? []).filter((entry) => !selectedGroupIdSet.has(entry.groupId))
            removeTilesetSnapshots(document, removedTilesets)
            document.activeLayerId = nextId
            session.selectedLayerIds = [nextId]
            session.selectedGroupId = null
            session.selectedGroupIds = []
          }
        })
      }, true, true)
      if (shouldHideTilesetPanel) requestTilesetPanelVisibility(false)
    },
    mergeSelectedLayers() {
      get().commitFloatingPaste()
      const state = get()
      const session = activeSession(state)
      if (!session) return
      const beforeDocument = captureDocumentStructureSnapshot(session.document)
      const beforeUi = captureLayerUi(session)
      const result = mergeRasterLayers(session.document, session.selectedLayerIds)
      if (!result.ok) { set({ message: result.reason }); return }
      const shouldHideTilesetPanel = commitLayerMergeWithOwnedTilesets(session, beforeDocument, beforeUi, result, tr('workspace.history.mergeSelected'))
      set({ sessions: [...state.sessions], message: tr('workspace.layer.mergedSelected') })
      if (shouldHideTilesetPanel) requestTilesetPanelVisibility(false)
    },
    mergeActiveLayerDown() {
      get().commitFloatingPaste()
      const state = get()
      const session = activeSession(state)
      if (!session) return
      const beforeDocument = captureDocumentStructureSnapshot(session.document)
      const beforeUi = captureLayerUi(session)
      const result = mergeLayerDown(session.document, session.document.activeLayerId)
      if (!result.ok) { set({ message: result.reason }); return }
      const shouldHideTilesetPanel = commitLayerMergeWithOwnedTilesets(session, beforeDocument, beforeUi, result, tr('workspace.history.mergeDown'))
      set({ sessions: [...state.sessions], message: tr('workspace.layer.mergedDown') })
      if (shouldHideTilesetPanel) requestTilesetPanelVisibility(false)
    },
    mergeSelectedGroup() {
      get().commitFloatingPaste()
      const state = get()
      const session = activeSession(state)
      if (!session?.selectedGroupId) { set({ message: tr('workspace.group.selectFirst') }); return }
      const beforeDocument = captureDocumentStructureSnapshot(session.document)
      const beforeUi = captureLayerUi(session)
      const result = mergeLayerGroup(session.document, session.selectedGroupId)
      if (!result.ok) { set({ message: result.reason }); return }
      const shouldHideTilesetPanel = commitLayerMergeWithOwnedTilesets(session, beforeDocument, beforeUi, result, tr('workspace.history.mergeGroup'))
      set({ sessions: [...state.sessions], message: tr('workspace.group.merged') })
      if (shouldHideTilesetPanel) requestTilesetPanelVisibility(false)
    },
    mergeVisibleLayers() {
      get().commitFloatingPaste()
      const state = get()
      const session = activeSession(state)
      if (!session) return
      const beforeDocument = captureDocumentStructureSnapshot(session.document)
      const beforeUi = captureLayerUi(session)
      const result = mergeVisibleDocumentLayers(session.document)
      if (!result.ok) { set({ message: result.reason }); return }
      const shouldHideTilesetPanel = commitLayerMergeWithOwnedTilesets(session, beforeDocument, beforeUi, result, tr('workspace.history.mergeVisible'))
      set({ sessions: [...state.sessions], message: tr('workspace.layers.visibleMerged') })
      if (shouldHideTilesetPanel) requestTilesetPanelVisibility(false)
    },
    moveLayer(direction) {
      get().mutateActive((session) => {
        const beforeSelection = captureAnimationSelectionHistory(session)
        const document = session.document
        const index = document.layers.findIndex((layer) => layer.id === document.activeLayerId)
        const target = index + direction
        if (target < 0 || target >= document.layers.length) return
        ;[document.layers[index], document.layers[target]] = [document.layers[target], document.layers[index]]
        const entry = {
          label: tr('canvas.history.moveLayer'), bytes: 32,
          undo: () => { ;[document.layers[index], document.layers[target]] = [document.layers[target], document.layers[index]] },
          redo: () => { ;[document.layers[index], document.layers[target]] = [document.layers[target], document.layers[index]] },
          requiresAnimationSync: false
        }
        session.history.push(historyEntryWithAnimationSelection(session, entry, beforeSelection, captureAnimationSelectionHistory(session)))
      }, 'content')
    },
    moveLayerBy(layerId, deltaX, deltaY, label = tr('canvas.history.moveLayer')) {
      get().mutateActive((session) => {
        const beforeSelection = captureAnimationSelectionHistory(session)
        const layer = session.document.layers.find((candidate) => candidate.id === layerId)
        if (!layer || isLayerEffectivelyLocked(session.document, layer)) return
        const before = { x: layer.offsetX, y: layer.offsetY }
        const after = { x: before.x + Math.trunc(deltaX), y: before.y + Math.trunc(deltaY) }
        if (before.x === after.x && before.y === after.y) return
        layer.offsetX = after.x
        layer.offsetY = after.y
        const timeline = ensureAnimationDocument(session.document)
        const activeCel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId)
        const textSource = activeCel ? resolveAnimationCel(timeline, activeCel) ?? activeCel : null
        if (layer.kind === 'text' && textSource?.text) translateTextCelData(textSource.text, after.x - before.x, after.y - before.y)
        const entry = {
          label, bytes: 32,
          undo: () => { layer.offsetX = before.x; layer.offsetY = before.y; if (textSource?.text) translateTextCelData(textSource.text, before.x - after.x, before.y - after.y) },
          redo: () => { layer.offsetX = after.x; layer.offsetY = after.y; if (textSource?.text) translateTextCelData(textSource.text, after.x - before.x, after.y - before.y) }
        }
        session.history.push(historyEntryWithAnimationSelection(session, entry, beforeSelection, captureAnimationSelectionHistory(session)))
      })
    },
    beginLayerMoveDuplicatePreview(documentId, layerId, copySuffix) {
      let result: LayerMoveDuplicateResult | null = null
      get().mutateActive((session) => {
        if (session.document.id !== documentId) return
        const source = session.document.layers.find((candidate) => candidate.id === layerId)
        const linkedCopyName = source?.linkedContentId ? createLinkedLayerNameAllocator(session.document)(source.linkedContentId, source.name) : null
        result = beginLayerMoveDuplicatePreviewCommand(session, layerId, copySuffix)
        if (result) {
          if (linkedCopyName) result.layer.name = linkedCopyName
          // This is a transient preview, not a document operation, but the
          // compositor must see the new layer immediately rather than reuse the
          // pre-copy cache entry.
          const fromRevision = session.contentRevision
          session.revision += 1
          session.contentRevision += 1
          session.layersPanelRevision += 1
          session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
        }
      }, false)
      return result
    },
    previewLayerMove(documentId, move, distanceX, distanceY) {
      const session = activeSession(get())
      if (!session || session.document.id !== documentId) return false
      return previewLayerMoveCommand(session, move, distanceX, distanceY)
    },
    cancelLayerMovePreview(documentId, move) {
      get().mutateActive((session) => {
        if (session.document.id !== documentId) return
        if (cancelLayerMovePreviewCommand(session, move)) {
          const fromRevision = session.contentRevision
          session.revision += 1
          session.contentRevision += 1
          session.layersPanelRevision += 1
          session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
        }
      }, false)
    },
    commitLayerMove(documentId, move) {
      const session = activeSession(get())
      if (!session || session.document.id !== documentId) return
      const beforeSelection = captureAnimationSelectionHistory(session)
      const entry = createLayerMoveHistoryEntry(session, move, {
        single: tr('canvas.history.moveLayer'),
        multiple: tr('canvas.history.moveSelectedLayers')
      })
      if (!entry) return
      // The copy is inserted while dragging for a live preview.  Confirming
      // that drag must make the copy (rather than the source layer) the active
      // editing target, without retaining a blue explicit layer selection.
      if (move.duplicatedLayerId) get().activateLayerForCanvas(move.duplicatedLayerId)
      get().pushHistory(historyEntryWithAnimationSelection(session, entry, beforeSelection, captureAnimationSelectionHistory(session)))
    },
    reorderLayer(layerId, targetLayerId) {
      get().reorderLayers([layerId], targetLayerId)
    },
    reorderLayers(layerIds, targetLayerId, insertAfterTarget = true) {
      const current = activeSession(get())
      const beforeRenderOrder = current ? normalCompositeLayers(current.document) : null
      get().mutateActive((session) => {
        const beforeSelection = captureAnimationSelectionHistory(session)
        const history = reorderLayersOperation(session, layerIds, targetLayerId, insertAfterTarget)
        if (!history) return
        const invalidation = layerReorderInvalidation(session.document, beforeRenderOrder, normalCompositeLayers(session.document))
        let entry: HistoryEntry
        const applyWithCurrentFrameInvalidation = (apply: () => void): void => {
          const before = normalCompositeLayers(session.document)
          apply()
          entry.invalidation = layerReorderInvalidation(session.document, before, normalCompositeLayers(session.document))
          if (entry.invalidation.kind === 'region') session.layersPanelRevision += 1
        }
        entry = {
          ...history,
          invalidation,
          requiresAnimationSync: false,
          undo: () => { applyWithCurrentFrameInvalidation(history.undo) },
          redo: () => { applyWithCurrentFrameInvalidation(history.redo) }
        }
        if (invalidation.kind === 'region') {
          session.layersPanelRevision += 1
        }
        session.history.push(historyEntryWithAnimationSelection(session, entry, beforeSelection, captureAnimationSelectionHistory(session)))
        completeDocumentChange(session, 'content', recordDocumentOperation, invalidation)
      }, false)
    },
    assignLayerToGroup(layerId, groupId) {
      get().assignLayersToGroup([layerId], groupId)
    },
    assignLayersToGroup(layerIds, groupId, targetLayerId, insertAfterTarget = true) {
      get().mutateActive((session) => {
        const history = assignLayersToGroupOperation(session, layerIds, groupId, targetLayerId, insertAfterTarget)
        if (history) session.history.push({ ...history, requiresAnimationSync: false })
      }, 'content')
    },
    assignLayersToRoot(layerIds, targetLayerId, insertAfterTarget = true) {
      get().mutateActive((session) => {
        const history = assignLayersToRootOperation(session, layerIds, targetLayerId, insertAfterTarget)
        if (history) session.history.push({ ...history, requiresAnimationSync: false })
      }, 'content')
    },
    assignLayersAboveGroup(layerIds, groupId) {
      get().mutateActive((session) => {
        const history = assignLayersAboveGroupOperation(session, layerIds, groupId)
        if (history) session.history.push({ ...history, requiresAnimationSync: false })
      }, 'content')
    },
    reorderGroup(groupId, targetGroupId, insertAfterTarget = true) {
      if (groupId === targetGroupId) return
      get().mutateActive((session) => {
        if (!canMoveGroupInto(session.document, groupId, targetGroupId)) {
          set({ message: tr('workspace.group.moveNextToChild') })
          return
        }
        const history = reorderGroupOperation(session, groupId, targetGroupId, insertAfterTarget)
        if (history) session.history.push({ ...history, requiresAnimationSync: false })
      }, 'content')
    },
    positionGroupNextToLayer(groupId, targetLayerId, insertAfterTarget = true) {
      get().mutateActive((session) => {
        const history = positionGroupNextToLayerOperation(session, groupId, targetLayerId, insertAfterTarget)
        if (history) session.history.push({ ...history, requiresAnimationSync: false })
      }, 'content')
    },
    assignGroupToGroup(groupId, parentGroupId) {
      if (groupId === parentGroupId) return
      get().mutateActive((session) => {
        if (!canMoveGroupInto(session.document, groupId, parentGroupId)) { set({ message: tr('workspace.group.moveIntoChild') }); return }
        const history = assignGroupToGroupOperation(session, groupId, parentGroupId)
        if (history) session.history.push({ ...history, requiresAnimationSync: false })
      }, 'content')
    },
    assignGroupToRoot(groupId) {
      get().mutateActive((session) => {
        const history = assignGroupToRootOperation(session, groupId)
        if (history) session.history.push({ ...history, requiresAnimationSync: false })
      }, 'content')
    },
    moveLayersToRootEdge(layerIds, edge) {
      get().mutateActive((session) => {
        const beforeSelection = captureAnimationSelectionHistory(session)
        const history = moveLayersToRootEdgeOperation(session, layerIds, edge)
        if (history) {
          const entry = { ...history, requiresAnimationSync: false }
          session.history.push(historyEntryWithAnimationSelection(session, entry, beforeSelection, captureAnimationSelectionHistory(session)))
        }
      }, 'content')
    },
    moveGroupToRootEdge(groupId, edge) {
      get().mutateActive((session) => {
        const beforeSelection = captureAnimationSelectionHistory(session)
        const history = moveGroupToRootEdgeOperation(session, groupId, edge)
        if (history) {
          const entry = { ...history, requiresAnimationSync: false }
          session.history.push(historyEntryWithAnimationSelection(session, entry, beforeSelection, captureAnimationSelectionHistory(session)))
        }
      }, 'content')
    },
    moveLayerRows(layerIds, groupIds, target) {
      get().mutateActive((session) => {
        const beforeSelection = captureAnimationSelectionHistory(session)
        const history = moveLayerPanelRowsOperation(session, layerIds, groupIds, target)
        if (history) {
          const entry = { ...history, requiresAnimationSync: false }
          session.history.push(historyEntryWithAnimationSelection(session, entry, beforeSelection, captureAnimationSelectionHistory(session)))
        }
      }, 'content')
    },
    createLayerGroup() {
      get().mutateActive((session) => {
        const placement = selectedRowInsertionTarget(session)
        const placeRelativeToSelectedGroup = Boolean(session.selectedGroupId && selectedDirectLayerRows(session).length === 0)
        session.history.beginCompound()
        const history = createLayerGroupOperation(session, createId('group'), tr('workspace.group.defaultName', { index: session.document.groups.length + 1 }))
        if (history) session.history.push(history)
        if (history && placeRelativeToSelectedGroup && session.selectedGroupId) {
          const placementHistory = moveLayerPanelRowsOperation(session, [], [session.selectedGroupId], placement)
          if (placementHistory) session.history.push(placementHistory)
        }
        session.history.endCompound(history?.label ?? tr('workspace.history.newLayer'))
      }, true, true)
    },
    ungroupSelected() {
      const current = activeSession(get())
      const groupIds = current?.selectedGroupId ? [current.selectedGroupId] : current?.document.layers.filter((layer) => current.selectedLayerIds.includes(layer.id) && layer.groupId).map((layer) => layer.groupId!) ?? []
      if (current && groupIds.some((groupId) => lockedGroupStructure(current.document, groupId))) { set({ message: tr('workspace.group.lockedUngroup') }); return }
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const removedGroupMasks = (timeline.groupMasks ?? []).filter((entry) => groupIds.includes(entry.groupId)).map((entry) => cloneAnimationGroupMask(entry))
        const history = ungroupSelectedOperation(session)
        if (!history) return
        const maskIds = new Set(removedGroupMasks.map((entry) => entry.mask.id))
        const removeMasks = (): void => { timeline.groupMasks = (timeline.groupMasks ?? []).filter((entry) => !maskIds.has(entry.mask.id)) }
        const restoreMasks = (): void => { timeline.groupMasks ??= []; for (const entry of removedGroupMasks) if (!timeline.groupMasks.some((candidate) => candidate.mask.id === entry.mask.id)) timeline.groupMasks.push(cloneAnimationGroupMask(entry)) }
        removeMasks()
        session.history.push({ label: history.label, bytes: history.bytes + removedGroupMasks.reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0), undo: () => { history.undo(); restoreMasks() }, redo: () => { history.redo(); removeMasks() } })
      }, true, true)
    }
  }
}
