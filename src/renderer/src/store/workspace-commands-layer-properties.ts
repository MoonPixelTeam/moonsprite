import { completeDocumentChange } from './workspace-document-change'
import { type WorkspaceRecording } from './workspace-recording'
import type { LayerGroup, RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { type ContentInvalidationHint, type HistoryEntry } from '@/core/history'
import { cachedLayerContentBounds, createId, duplicateLayer, getGroup, getGroupLockingAncestor, getLayerIdsInGroup, getLayer, getLayerLockingGroup, isGroupEffectivelyLocked, isLayerEffectivelyLocked, layerContentBounds } from '@/core/document-model'
import { expandLayerStyleInvalidationRect, normalCompositeLayers } from '@/core/document-composite'
import { cloneAnimationCel, cloneAnimationCelsForLayer, detachLinkedLayerContent, ensureAnimationDocument, refreshActiveAnimationFrame, removeAnimationCelsForLayers, restoreAnimationCels, syncActiveAnimationFrame, syncActiveAnimationLayer, synchronizeLinkedLayerGroupContents } from '@/core/animation'
import { colorEquals } from '@/core/raster'
import { moveLayersToRootEdge as moveLayersToRootEdgeOperation } from '@/core/layer-operations'
import { cloneLayerStyles, hasConfiguredLayerStyles, layerStylesEqual, layerStylesHistoryBytes } from '@/core/layer-styles'
import { isLinkableRasterLayer, linkedLayerDefaultNameSequence, linkedLayerMembers, setLinkedLayerGroupDisplayColor } from '@/core/linked-layers'
import { touchMetadata } from './workspace-session'
import { beginLayerPropertiesTransaction as beginLayerPropertiesTransactionCommand, cancelLayerPropertiesTransaction as cancelLayerPropertiesTransactionCommand, commitLayerPropertiesTransaction as commitLayerPropertiesTransactionCommand, previewLayerPropertiesTransaction as previewLayerPropertiesTransactionCommand, type LayerPropertyTarget } from './workspace-layer-properties'
import { splitLayerStyles as splitLayerStylesCommand } from './workspace-layer-style-split'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceLayerCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { unionRects } from './workspace-selection-geometry'
import { createLinkedLayerNameAllocator } from './workspace-layer-resources'
import { activeSession } from './workspace-access'
import { tr } from './workspace-translation'
import { captureAnimationSelectionHistory, historyEntryWithAnimationSelection } from './workspace-animation-selection-history'
import { layerHistoryBytes, assignLayerStyles } from './workspace-layer-style-history'
import { nextAvailableLayerDisplayColor } from './workspace-layer-creation-context'

const applyLayerName = (document: SpriteDocument, layer: RasterLayer, name: string): void => {
  layer.name = name
  const tilesetId = layer.kind === 'tilemap' ? layer.tilemapTilesetId : undefined
  if (!tilesetId) return
  const tilemapOwners = document.layers.filter((candidate) => candidate.kind === 'tilemap' && candidate.tilemapTilesetId === tilesetId)
  if (tilemapOwners.length > 1) return
  const tileset = document.tilesets?.find((candidate) => candidate.id === tilesetId)
  if (tileset) tileset.name = name
}

const layerStyleOwnerForTarget = (document: SpriteDocument, target: LayerPropertyTarget): RasterLayer | LayerGroup | null =>
  target.kind === 'layer'
    ? document.layers.find((layer) => layer.id === target.id) ?? null
    : document.groups.find((group) => group.id === target.id) ?? null

const uniqueLayerStyleTargets = (document: SpriteDocument, targets: readonly LayerPropertyTarget[]): LayerPropertyTarget[] => {
  const seen = new Set<string>()
  return targets.filter((target) => {
    const key = `${target.kind}:${target.id}`
    if (seen.has(key) || !layerStyleOwnerForTarget(document, target)) return false
    seen.add(key)
    return true
  })
}

const layerStylePreviewInvalidationRect = (
  document: SpriteDocument,
  targets: readonly LayerPropertyTarget[]
): SelectionRect | null => {
  let rect: SelectionRect | null = null
  for (const target of targets) {
    if (target.kind !== 'layer') return null
    const layer = document.layers.find((candidate) => candidate.id === target.id)
    if (!layer) return null
    const bounds = layerContentBounds(document, layer)
    if (!bounds) continue
    const expanded = expandLayerStyleInvalidationRect(document, bounds, [layer.id])
    rect = rect ? unionRects(rect, expanded) : expanded
  }
  return rect
}

const layerVisibilityInvalidation = (document: SpriteDocument, layer: RasterLayer): ContentInvalidationHint => {
  const bounds = cachedLayerContentBounds(document, layer)
  return bounds
    ? { kind: 'region', rect: expandLayerStyleInvalidationRect(document, bounds, [layer.id]) }
    : { kind: 'full' }
}

const groupVisibilityInvalidation = (document: SpriteDocument, groupId: string): ContentInvalidationHint => {
  if (!normalCompositeLayers(document)) return { kind: 'full' }
  const layerIds = new Set(getLayerIdsInGroup(document, groupId))
  let rect: SelectionRect | null = null
  for (const layer of document.layers) {
    if (!layerIds.has(layer.id)) continue
    const bounds = cachedLayerContentBounds(document, layer)
    if (bounds === undefined) return { kind: 'full' }
    if (!bounds) continue
    const expanded = expandLayerStyleInvalidationRect(document, bounds, [layer.id])
    rect = rect ? unionRects(rect, expanded) : expanded
  }
  return rect ? { kind: 'region', rect } : { kind: 'full' }
}

const layerBlendModeInvalidation = (document: SpriteDocument, layer: RasterLayer): ContentInvalidationHint => {
  const bounds = cachedLayerContentBounds(document, layer)
  return bounds
    ? { kind: 'region', frameId: document.animation?.activeFrameId, rect: expandLayerStyleInvalidationRect(document, bounds, [layer.id]) }
    : { kind: 'full' }
}

const groupBlendModeInvalidation = (document: SpriteDocument, groupId: string): ContentInvalidationHint => {
  const layerIds = new Set(getLayerIdsInGroup(document, groupId))
  let rect: SelectionRect | null = null
  for (const layer of document.layers) {
    if (!layerIds.has(layer.id)) continue
    const bounds = cachedLayerContentBounds(document, layer)
    if (bounds === undefined) return { kind: 'full' }
    if (!bounds) continue
    const expanded = expandLayerStyleInvalidationRect(document, bounds, [layer.id])
    rect = rect ? unionRects(rect, expanded) : expanded
  }
  return rect
    ? { kind: 'region', frameId: document.animation?.activeFrameId, rect }
    : { kind: 'full' }
}

const commitVisibilityChange = (recordDocumentOperation: WorkspaceRecording['recordDocumentOperation'],
  session: DocumentSession,
  target: { visible: boolean },
  label: string,
  invalidationForCurrentFrame: () => ContentInvalidationHint,
  affectedLayerIds?: readonly string[],
  refreshPanelForRegion = false
): void => {
  const before = target.visible
  target.visible = !before
  const invalidation = invalidationForCurrentFrame()
  let entry: HistoryEntry
  const apply = (visible: boolean): void => {
    target.visible = visible
    entry.invalidation = invalidationForCurrentFrame()
    if (refreshPanelForRegion && entry.invalidation.kind === 'region') session.layersPanelRevision += 1
  }
  entry = {
    label,
    bytes: 8,
    undo: () => { apply(before) },
    redo: () => { apply(!before) },
    invalidation,
    affectedLayerIds: affectedLayerIds ? [...affectedLayerIds] : undefined,
    requiresAnimationSync: false
  }
  if (refreshPanelForRegion && invalidation.kind === 'region') session.layersPanelRevision += 1
  session.history.push(entry)
  completeDocumentChange(session, 'content', recordDocumentOperation, invalidation)
}

const hiddenAncestorGroupsForLayer = (document: SpriteDocument, layer: RasterLayer): LayerGroup[] => {
  const groups: LayerGroup[] = []
  const visited = new Set<string>()
  let groupId = layer.groupId ?? null
  while (groupId && !visited.has(groupId)) {
    visited.add(groupId)
    const group = document.groups.find((candidate) => candidate.id === groupId)
    if (!group) break
    if (group.visible === false) groups.push(group)
    groupId = group.parentGroupId ?? null
  }
  return groups
}

const hiddenAncestorGroupsForGroup = (document: SpriteDocument, group: LayerGroup): LayerGroup[] => {
  const groups: LayerGroup[] = []
  const visited = new Set<string>()
  let groupId = group.parentGroupId ?? null
  while (groupId && !visited.has(groupId)) {
    visited.add(groupId)
    const ancestor = document.groups.find((candidate) => candidate.id === groupId)
    if (!ancestor) break
    if (ancestor.visible === false) groups.push(ancestor)
    groupId = ancestor.parentGroupId ?? null
  }
  return groups
}

const optionalColorEquals = (left: RgbaColor | null | undefined, right: RgbaColor | null | undefined): boolean =>
  left === right || Boolean(left && right && colorEquals(left, right))

export function createLayerPropertiesCommands({ get, set, recording, services: { documentTransactions } }: WorkspaceCommandContext<'commitFloatingPaste' | 'mutateActive' | 'setClippingMask' | 'previewLayerStyleEntries' | 'setLayerStylesForTargets', 'documentTransactions'>): Pick<WorkspaceLayerCommands, 'setLayerBackground' | 'setLayerAutoLinkAnimationCels' | 'createLinkedLayer' | 'toggleLayerVisibility' | 'toggleGroupVisibility' | 'toggleActiveClippingMask' | 'setClippingMask' | 'setGroupLocked' | 'setGroupProperties' | 'renameLayer' | 'setLayerOpacity' | 'setLayerProperties' | 'setLayerLocked' | 'setLayerPropertiesWithBlend' | 'beginLayerPropertiesTransaction' | 'previewLayerPropertiesTransaction' | 'commitLayerPropertiesTransaction' | 'cancelLayerPropertiesTransaction' | 'previewLayerStyles' | 'previewLayerStyleEntries' | 'setLayerStyles' | 'setLayerStylesForTargets' | 'setLayerStylesEnabled' | 'copyLayerStyles' | 'pasteLayerStyles' | 'clearLayerStyles' | 'splitLayerStyles'> {
  const { recordDocumentOperation } = recording
  return {
    setLayerBackground(layerId, enabled) {
      get().commitFloatingPaste()
      get().mutateActive((session) => {
        const document = session.document
        const layer = document.layers.find((candidate) => candidate.id === layerId)
        if (!layer || layer.kind || Boolean(layer.background) === enabled) return
        const before = layer.background ? { ...layer.background } : undefined
        const beforeLinkedContentId = layer.linkedContentId
        const after = enabled ? { mode: 'canvas' as const } : undefined
        const preservedSelection = {
          activeLayerId: document.activeLayerId,
          selectedLayerIds: [...session.selectedLayerIds],
          selectedGroupId: session.selectedGroupId,
          selectedGroupIds: [...session.selectedGroupIds]
        }
        const moveHistory = enabled ? moveLayersToRootEdgeOperation(session, [layer.id], 'bottom') : null
        document.activeLayerId = preservedSelection.activeLayerId
        session.selectedLayerIds = preservedSelection.selectedLayerIds
        session.selectedGroupId = preservedSelection.selectedGroupId
        session.selectedGroupIds = preservedSelection.selectedGroupIds
        const apply = (value: typeof before, linkedContentId?: string): void => {
          if (value) {
            detachLinkedLayerContent(document, layer.id)
            layer.background = { ...value }
            return
          }
          delete layer.background
          if (!linkedContentId) {
            delete layer.linkedContentId
            return
          }
          layer.linkedContentId = linkedContentId
          const authority = linkedLayerMembers(document, linkedContentId).find((candidate) => candidate.id !== layer.id) ?? layer
          synchronizeLinkedLayerGroupContents(document, linkedContentId, authority.id)
        }
        const applyMovePreservingActiveLayer = (operation: (() => void) | undefined): void => {
          if (!operation) return
          const activeLayerId = document.activeLayerId
          operation()
          document.activeLayerId = activeLayerId
        }
        apply(after)
        session.history.push({
          label: tr(enabled ? 'workspace.history.convertToBackgroundLayer' : 'workspace.history.convertToRasterLayer'),
          bytes: 24 + (moveHistory?.bytes ?? 0),
          undo: () => {
            apply(before, beforeLinkedContentId)
            applyMovePreservingActiveLayer(moveHistory?.undo)
          },
          redo: () => {
            apply(after)
            applyMovePreservingActiveLayer(moveHistory?.redo)
          },
          affectedLayerIds: [layer.id],
          requiresAnimationSync: false,
          invalidation: { kind: 'full' }
        })
      })
    },
    setLayerAutoLinkAnimationCels(layerId, enabled) {
      const current = activeSession(get())
      if (!current) return
      const layer = current.document.layers.find((candidate) => candidate.id === layerId)
      const next = Boolean(enabled)
      if (!layer || Boolean(layer.autoLinkAnimationCels) === next) return
      get().mutateActive((session) => {
        const target = session.document.layers.find((candidate) => candidate.id === layerId)
        if (!target) return
        const before = target.autoLinkAnimationCels === true
        const apply = (value: boolean): void => {
          if (value) target.autoLinkAnimationCels = true
          else delete target.autoLinkAnimationCels
        }
        apply(next)
        session.history.push({
          label: tr('workspace.history.layerProperties'),
          bytes: 8,
          undo: () => apply(before),
          redo: () => apply(next),
          contentChanged: false,
          requiresAnimationSync: false
        })
      }, 'metadata')
    },
    createLinkedLayer(layerId) {
      let createdId: string | null = null
      get().mutateActive((session) => {
        const document = session.document
        const source = document.layers.find((candidate) => candidate.id === layerId)
        if (!isLinkableRasterLayer(source)) return
        syncActiveAnimationFrame(document)
        const previousActiveId = document.activeLayerId
        const previousSelection = [...session.selectedLayerIds]
        const previousGroupId = session.selectedGroupId
        const previousGroupIds = [...session.selectedGroupIds]
        const previousLinkedContentId = source.linkedContentId
        const linkedContentId = previousLinkedContentId ?? createId('layer-link')
        const allocateLinkedLayerName = createLinkedLayerNameAllocator(document)
        const initialNameSequence = previousLinkedContentId
          ? null
          : linkedLayerDefaultNameSequence(document, linkedContentId, tr('layers.linkedCopySuffix'), source.name)
        const copyLinkedName = initialNameSequence
          ? tr('layers.linkedDefaultName', { name: initialNameSequence.baseName, index: 1 })
          : allocateLinkedLayerName(linkedContentId, source.name)
        const previousMembers = previousLinkedContentId ? linkedLayerMembers(document, linkedContentId) : [source]
        const previousDisplayColors = previousMembers.map((layer) => ({ layer, displayColor: layer.displayColor ? { ...layer.displayColor } : undefined }))
        const displayColor = previousLinkedContentId
          ? previousMembers.find((layer) => layer.displayColor)?.displayColor ?? nextAvailableLayerDisplayColor(document)
          : nextAvailableLayerDisplayColor(document)
        source.linkedContentId = linkedContentId
        const copy = duplicateLayer(document, source.id)
        copy.name = copyLinkedName
        setLinkedLayerGroupDisplayColor(document, linkedContentId, displayColor)
        cloneAnimationCelsForLayer(document, source.id, copy)
        synchronizeLinkedLayerGroupContents(document, linkedContentId, source.id)
        const index = document.layers.indexOf(copy)
        const animationCels = ensureAnimationDocument(document).cels
          .filter((cel) => cel.layerId === copy.id)
          .map(cloneAnimationCel)
        createdId = copy.id
        document.activeLayerId = copy.id
        session.selectedLayerIds = [copy.id]
        session.selectedGroupId = null
        session.selectedGroupIds = []
        const restorePreviousSelection = (): void => {
          document.activeLayerId = previousActiveId
          session.selectedLayerIds = previousSelection
          session.selectedGroupId = previousGroupId
          session.selectedGroupIds = previousGroupIds
        }
        session.history.push({
          label: tr('workspace.history.createLinkedLayer'),
          bytes: layerHistoryBytes(copy) + animationCels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + 64,
          undo: () => {
            document.layers = document.layers.filter((candidate) => candidate.id !== copy.id)
            removeAnimationCelsForLayers(document, [copy.id])
            if (previousLinkedContentId) source.linkedContentId = previousLinkedContentId
            else delete source.linkedContentId
            for (const snapshot of previousDisplayColors) {
              if (snapshot.displayColor) snapshot.layer.displayColor = { ...snapshot.displayColor }
              else delete snapshot.layer.displayColor
            }
            restorePreviousSelection()
            refreshActiveAnimationFrame(document)
          },
          redo: () => {
            source.linkedContentId = linkedContentId
            copy.linkedContentId = linkedContentId
            copy.name = copyLinkedName
            if (!document.layers.some((candidate) => candidate.id === copy.id)) document.layers.splice(Math.min(index, document.layers.length), 0, copy)
            restoreAnimationCels(document, animationCels)
            setLinkedLayerGroupDisplayColor(document, linkedContentId, displayColor)
            synchronizeLinkedLayerGroupContents(document, linkedContentId, source.id)
            document.activeLayerId = copy.id
            session.selectedLayerIds = [copy.id]
            session.selectedGroupId = null
            session.selectedGroupIds = []
          },
          invalidation: { kind: 'full' },
          affectedLayerIds: [...new Set([...previousMembers.map((layer) => layer.id), copy.id])],
          requiresAnimationSync: false
        })
      }, true, true)
      return createdId
    },
    toggleLayerVisibility(layerId) {
      get().mutateActive((session) => {
        const layer = getLayer(session.document, layerId)
        const hiddenAncestors = layer.visible === false ? hiddenAncestorGroupsForLayer(session.document, layer) : []
        if (hiddenAncestors.length > 0) {
          const beforeLayerVisible = layer.visible
          const beforeGroupVisible = hiddenAncestors.map((group) => ({ group, visible: group.visible }))
          layer.visible = true
          for (const { group } of beforeGroupVisible) group.visible = true
          const invalidation = groupVisibilityInvalidation(session.document, hiddenAncestors[0].id)
          const apply = (visible: boolean): void => {
            layer.visible = visible
            for (const { group } of beforeGroupVisible) group.visible = visible
          }
          session.history.push({
            label: tr('workspace.history.showLayer'),
            bytes: 8 * (beforeGroupVisible.length + 1),
            undo: () => apply(beforeLayerVisible),
            redo: () => apply(true),
            invalidation,
            affectedLayerIds: [layer.id],
            requiresAnimationSync: false
          })
          completeDocumentChange(session, 'content', recordDocumentOperation, invalidation)
          return
        }
        commitVisibilityChange(recordDocumentOperation,
          session,
          layer,
          tr('workspace.history.showLayer'),
          () => layerVisibilityInvalidation(session.document, layer),
          [layer.id]
        )
      }, false)
    },
    toggleGroupVisibility(groupId) {
      get().mutateActive((session) => {
        const group = getGroup(session.document, groupId)
        const hiddenAncestors = group.visible === false ? hiddenAncestorGroupsForGroup(session.document, group) : []
        if (hiddenAncestors.length > 0) {
          const beforeGroupVisible = group.visible
          const beforeAncestorVisibility = hiddenAncestors.map((ancestor) => ({ group: ancestor, visible: ancestor.visible }))
          group.visible = true
          for (const { group: ancestor } of beforeAncestorVisibility) ancestor.visible = true
          const invalidation = groupVisibilityInvalidation(session.document, hiddenAncestors[0].id)
          const apply = (visible: boolean): void => {
            group.visible = visible
            for (const { group: ancestor } of beforeAncestorVisibility) ancestor.visible = visible
          }
          session.history.push({
            label: tr('workspace.history.showGroup'),
            bytes: 8 * (beforeAncestorVisibility.length + 1),
            undo: () => apply(beforeGroupVisible),
            redo: () => apply(true),
            invalidation,
            requiresAnimationSync: false
          })
          completeDocumentChange(session, 'content', recordDocumentOperation, invalidation)
          return
        }
        commitVisibilityChange(recordDocumentOperation,
          session,
          group,
          tr('workspace.history.showGroup'),
          () => groupVisibilityInvalidation(session.document, group.id),
          undefined,
          true
        )
      }, false)
    },
    toggleActiveClippingMask() {
      const current = activeSession(get())
      if (!current) return
      if (current.selectedGroupId) {
        const group = current.document.groups.find((candidate) => candidate.id === current.selectedGroupId)
        if (group) get().setClippingMask('group', group.id, group.clippingMask !== true)
        return
      }
      const layer = current.document.layers.find((candidate) => candidate.id === current.document.activeLayerId)
      if (layer) get().setClippingMask('layer', layer.id, layer.clippingMask !== true)
    },
    setClippingMask(kind, id, enabled) {
      const current = activeSession(get())
      if (!current) return
      const currentTarget = kind === 'layer'
        ? current.document.layers.find((layer) => layer.id === id)
        : current.document.groups.find((group) => group.id === id)
      if (!currentTarget) return
      const locked = kind === 'layer'
        ? isLayerEffectivelyLocked(current.document, currentTarget as RasterLayer)
        : isGroupEffectivelyLocked(current.document, currentTarget as LayerGroup)
      if (locked) {
        set({ message: tr('workspace.clippingMask.locked') })
        return
      }
      const before = currentTarget.clippingMask === true
      if (before === enabled) return
      get().mutateActive((session) => {
        const target = kind === 'layer' ? getLayer(session.document, id) : getGroup(session.document, id)
        const apply = (value: boolean): void => {
          if (value) target.clippingMask = true
          else delete target.clippingMask
        }
        apply(enabled)
        session.history.push({
          label: tr('workspace.history.clippingMask'),
          bytes: 8,
          undo: () => apply(before),
          redo: () => apply(enabled)
        })
      })
    },
    setGroupLocked(groupId, enabled) {
      get().mutateActive((session) => {
        const group = getGroup(session.document, groupId)
        const before = group.locked
        const after = Boolean(enabled)
        if (before === after) return
        group.locked = after
        session.history.push({
          label: tr('workspace.history.layerProperties'),
          bytes: 8,
          undo: () => { group.locked = before },
          redo: () => { group.locked = after },
          contentChanged: false,
          requiresAnimationSync: false
        })
      }, 'metadata')
    },
    setGroupProperties(groupId, name, opacity, blendMode, locked, displayColor, description, cumulativeBlend) {
      const trimmed = name.trim()
      if (!trimmed) return
      const current = activeSession(get())
      if (!current) return
      const currentGroup = getGroup(current.document, groupId)
      const currentLockingAncestor = getGroupLockingAncestor(current.document, currentGroup)
      const currentVisualLocked = currentGroup.locked || Boolean(currentLockingAncestor)
      const nextOpacity = currentVisualLocked ? currentGroup.opacity : Math.max(0, Math.min(1, opacity))
      const nextBlendMode = currentVisualLocked ? currentGroup.blendMode : blendMode
      const nextCumulativeBlend = currentVisualLocked || cumulativeBlend === undefined ? currentGroup.cumulativeBlend === true : cumulativeBlend
      const nextLocked = currentLockingAncestor ? currentGroup.locked : locked
      const nextDisplayColor = displayColor === undefined ? currentGroup.displayColor : displayColor ?? undefined
      const nextDescription = description ?? currentGroup.description ?? ''
      if (!locked && currentLockingAncestor) { set({ message: tr('workspace.group.lockedUnlock') }); return }
      if (currentGroup.name === trimmed && currentGroup.opacity === nextOpacity && currentGroup.blendMode === nextBlendMode && currentGroup.locked === nextLocked && (currentGroup.description ?? '') === nextDescription && (currentGroup.cumulativeBlend === true) === nextCumulativeBlend && optionalColorEquals(currentGroup.displayColor, nextDisplayColor)) return
      const contentChanged = currentGroup.opacity !== nextOpacity || currentGroup.blendMode !== nextBlendMode || (currentGroup.cumulativeBlend === true) !== nextCumulativeBlend
      get().mutateActive((session) => {
        const group = getGroup(session.document, groupId)
        const lockingAncestor = getGroupLockingAncestor(session.document, group)
        if (!locked && lockingAncestor) {
          set({ message: tr('workspace.group.lockedUnlock') })
          return
        }
        const before = { name: group.name, opacity: group.opacity, blendMode: group.blendMode, locked: group.locked, displayColor: group.displayColor, description: group.description ?? '', cumulativeBlend: group.cumulativeBlend === true }
        const visualLocked = group.locked || Boolean(lockingAncestor)
        const after = { name: trimmed, opacity: visualLocked ? group.opacity : Math.max(0, Math.min(1, opacity)), blendMode: visualLocked ? group.blendMode : blendMode, locked: lockingAncestor ? group.locked : locked, displayColor: displayColor === undefined ? group.displayColor : displayColor ?? undefined, description: description ?? group.description ?? '', cumulativeBlend: visualLocked || cumulativeBlend === undefined ? group.cumulativeBlend === true : cumulativeBlend }
        if (before.name === after.name && before.opacity === after.opacity && before.blendMode === after.blendMode && before.locked === after.locked && before.description === after.description && before.cumulativeBlend === after.cumulativeBlend && optionalColorEquals(before.displayColor, after.displayColor)) return
        Object.assign(group, after)
        const invalidation = contentChanged ? groupBlendModeInvalidation(session.document, group.id) : undefined
        session.history.push({ label: tr('workspace.history.groupProperties'), bytes: 48 + before.name.length + after.name.length, undo: () => Object.assign(group, before), redo: () => Object.assign(group, after), invalidation, contentChanged, requiresAnimationSync: false })
      }, contentChanged ? 'content' : 'metadata', false, false, contentChanged ? groupBlendModeInvalidation(current.document, currentGroup.id) : undefined)
    },
    renameLayer(layerId, name) {
      const trimmed = name.trim()
      if (!trimmed) return
      const current = activeSession(get())
      if (!current || getLayer(current.document, layerId).name === trimmed) return
      get().mutateActive((session) => {
        const layer = getLayer(session.document, layerId)
        const before = layer.name
        applyLayerName(session.document, layer, trimmed)
        session.history.push({ label: tr('workspace.history.renameLayer'), bytes: before.length + trimmed.length, undo: () => { applyLayerName(session.document, layer, before) }, redo: () => { applyLayerName(session.document, layer, trimmed) }, contentChanged: false, requiresAnimationSync: false })
      }, 'metadata')
    },
    setLayerOpacity(layerId, opacity) {
      const current = activeSession(get())
      if (!current) return
      const currentLayer = getLayer(current.document, layerId)
      if (isLayerEffectivelyLocked(current.document, currentLayer)) return
      const after = Math.max(0, Math.min(1, opacity))
      if (currentLayer.opacity === after) return
      get().mutateActive((session) => {
        const layer = getLayer(session.document, layerId)
        const before = layer.opacity
        layer.opacity = after
        syncActiveAnimationLayer(session.document, layer.id)
        session.history.push({ label: tr('workspace.history.layerOpacity'), bytes: 16, undo: () => { layer.opacity = before }, redo: () => { layer.opacity = after }, affectedLayerIds: [layer.id] })
      }, 'content')
    },
    setLayerProperties(layerId, name, opacity) {
      const trimmed = name.trim()
      if (!trimmed) return
      const current = activeSession(get())
      if (!current) return
      const currentLayer = getLayer(current.document, layerId)
      const nextOpacity = isLayerEffectivelyLocked(current.document, currentLayer) ? currentLayer.opacity : Math.max(0, Math.min(1, opacity))
      if (currentLayer.name === trimmed && currentLayer.opacity === nextOpacity) return
      const contentChanged = currentLayer.opacity !== nextOpacity
      get().mutateActive((session) => {
        const layer = getLayer(session.document, layerId)
        const before = { name: layer.name, opacity: layer.opacity }
        const after = { name: trimmed, opacity: nextOpacity }
        applyLayerName(session.document, layer, after.name)
        layer.opacity = after.opacity
        if (contentChanged) syncActiveAnimationLayer(session.document, layer.id)
        session.history.push({ label: tr('workspace.history.layerProperties'), bytes: 32 + before.name.length + after.name.length, undo: () => { applyLayerName(session.document, layer, before.name); layer.opacity = before.opacity }, redo: () => { applyLayerName(session.document, layer, after.name); layer.opacity = after.opacity }, contentChanged, affectedLayerIds: contentChanged ? [layer.id] : undefined, requiresAnimationSync: contentChanged })
      }, contentChanged ? 'content' : 'metadata')
    },
    setLayerLocked(layerId, enabled) {
      get().mutateActive((session) => {
        const layer = getLayer(session.document, layerId)
        const before = layer.locked
        const after = Boolean(enabled)
        if (before === after) return
        layer.locked = after
        session.history.push({
          label: tr('workspace.history.layerProperties'),
          bytes: 8,
          undo: () => { layer.locked = before },
          redo: () => { layer.locked = after },
          contentChanged: false,
          requiresAnimationSync: false
        })
      }, 'metadata')
    },
    setLayerPropertiesWithBlend(layerId, name, opacity, blendMode, locked, displayColor, description) {
      const trimmed = name.trim()
      if (!trimmed) return
      const current = activeSession(get())
      if (!current) return
      const currentLayer = getLayer(current.document, layerId)
      const currentLockingGroup = getLayerLockingGroup(current.document, currentLayer)
      const currentVisualLocked = currentLayer.locked || Boolean(currentLockingGroup)
      const nextOpacity = currentVisualLocked ? currentLayer.opacity : Math.max(0, Math.min(1, opacity))
      const nextBlendMode = currentVisualLocked ? currentLayer.blendMode : blendMode
      const nextLocked = currentLockingGroup ? currentLayer.locked : locked ?? currentLayer.locked
      const nextDisplayColor = displayColor === undefined ? currentLayer.displayColor : displayColor ?? undefined
      const nextDescription = description ?? currentLayer.description ?? ''
      if (locked === false && currentLockingGroup) { set({ message: tr('workspace.group.lockedUnlock') }); return }
      if (currentLayer.name === trimmed && currentLayer.opacity === nextOpacity && currentLayer.blendMode === nextBlendMode && currentLayer.locked === nextLocked && (currentLayer.description ?? '') === nextDescription && optionalColorEquals(currentLayer.displayColor, nextDisplayColor)) return
      const contentChanged = currentLayer.opacity !== nextOpacity || currentLayer.blendMode !== nextBlendMode
      get().mutateActive((session) => {
        const layer = getLayer(session.document, layerId)
        const lockingGroup = getLayerLockingGroup(session.document, layer)
        if (locked === false && lockingGroup) {
          set({ message: tr('workspace.group.lockedUnlock') })
          return
        }
        const before = { name: layer.name, opacity: layer.opacity, blendMode: layer.blendMode, locked: layer.locked, displayColor: layer.displayColor, description: layer.description ?? '' }
        const visualLocked = layer.locked || Boolean(lockingGroup)
        const after = { name: trimmed, opacity: visualLocked ? layer.opacity : Math.max(0, Math.min(1, opacity)), blendMode: visualLocked ? layer.blendMode : blendMode, locked: lockingGroup ? layer.locked : locked ?? layer.locked, displayColor: displayColor === undefined ? layer.displayColor : displayColor ?? undefined, description: description ?? layer.description ?? '' }
        if (before.name === after.name && before.opacity === after.opacity && before.blendMode === after.blendMode && before.locked === after.locked && before.description === after.description && optionalColorEquals(before.displayColor, after.displayColor)) return
        const apply = (value: typeof before): void => {
          Object.assign(layer, value)
          applyLayerName(session.document, layer, value.name)
          if (layer.linkedContentId) setLinkedLayerGroupDisplayColor(session.document, layer.linkedContentId, value.displayColor)
        }
        apply(after)
        if (contentChanged) syncActiveAnimationLayer(session.document, layer.id)
        const invalidation = contentChanged ? layerBlendModeInvalidation(session.document, layer) : undefined
        session.history.push({ label: tr('workspace.history.layerProperties'), bytes: 40 + before.name.length + after.name.length, undo: () => apply(before), redo: () => apply(after), invalidation, contentChanged, affectedLayerIds: contentChanged ? [layer.id] : undefined, requiresAnimationSync: contentChanged })
      }, contentChanged ? 'content' : 'metadata', false, false, contentChanged ? layerBlendModeInvalidation(current.document, currentLayer) : undefined)
    },
    beginLayerPropertiesTransaction(targets) {
      let id: string | null = null
      get().mutateActive((session) => {
        id = beginLayerPropertiesTransactionCommand(documentTransactions, session, targets)
      }, false)
      return id
    },
    previewLayerPropertiesTransaction(id, values, changedFields) {
      get().mutateActive((session) => {
        const beforeContentRevision = session.contentRevision
        previewLayerPropertiesTransactionCommand(documentTransactions, session, id, values, changedFields)
        // Previewing opacity/blend mode invalidates the canvas immediately. It
        // is still a property-dialog interaction, so don't let that preview
        // revision hide the explicit layer/frame/cel selection guides.
        if (session.contentRevision !== beforeContentRevision) {
          session.selectionGuidesPreservedAtContentRevision = session.contentRevision
        }
      }, false)
    },
    commitLayerPropertiesTransaction(id, values, changedFields) {
      get().mutateActive((session) => {
        const result = commitLayerPropertiesTransactionCommand(documentTransactions, session, id, values, changedFields)
        if (result.kind === 'content') {
          syncActiveAnimationFrame(session.document)
          // Layer properties are a panel operation, not a canvas edit. Keep
          // the explicit layer/frame/cel selection visible after committing a
          // content-affecting property such as opacity or blend mode.
          session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
          completeDocumentChange(session, 'content', recordDocumentOperation, result.invalidation)
        } else if (result.kind === 'metadata') {
          touchMetadata(session)
          recordDocumentOperation(session, undefined, false)
        }
      }, false)
    },
    cancelLayerPropertiesTransaction(id) {
      get().mutateActive((session) => {
        cancelLayerPropertiesTransactionCommand(documentTransactions, session, id)
      }, false)
    },
    previewLayerStyles(ownerKind, ownerId, styles) {
      get().previewLayerStyleEntries([{ target: { kind: ownerKind, id: ownerId }, styles }])
    },
    previewLayerStyleEntries(entries) {
      const current = activeSession(get())
      if (!current) return
      const seen = new Set<string>()
      const changes = entries.flatMap((entry) => {
        const key = `${entry.target.kind}:${entry.target.id}`
        if (seen.has(key)) return []
        seen.add(key)
        const owner = layerStyleOwnerForTarget(current.document, entry.target)
        return owner && !layerStylesEqual(owner.layerStyles, entry.styles) ? [{ target: entry.target, styles: entry.styles }] : []
      })
      if (changes.length === 0) return
      const operationProbe = window.__moonSpriteCanvasProbe
      const previewStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
      get().mutateActive((session) => {
        const targets = changes.map((change) => change.target)
        const beforeBounds = layerStylePreviewInvalidationRect(session.document, targets)
        let changed = false
        for (const change of changes) {
          const owner = layerStyleOwnerForTarget(session.document, change.target)
          if (!owner || layerStylesEqual(owner.layerStyles, change.styles)) continue
          assignLayerStyles(owner, change.styles)
          changed = true
        }
        if (!changed) return
        const afterBounds = layerStylePreviewInvalidationRect(session.document, targets)
        const fromRevision = session.contentRevision
        session.revision += 1
        session.contentRevision += 1
        session.layersPanelRevision += 1
        session.contentInvalidation = beforeBounds && afterBounds
          ? { kind: 'region', rect: unionRects(beforeBounds, afterBounds), fromRevision, revision: session.contentRevision }
          : { kind: 'full', fromRevision, revision: session.contentRevision }
      }, false)
      operationProbe?.recordOperationStage?.('layer-style.preview-mutation', performance.now() - previewStartedAt, { targets: changes.length })
    },
    setLayerStyles(ownerKind, ownerId, styles) {
      get().setLayerStylesForTargets([{ kind: ownerKind, id: ownerId }], styles)
    },
    setLayerStylesForTargets(targets, styles, action = 'edit') {
      const current = activeSession(get())
      if (!current) return false
      const uniqueTargets = uniqueLayerStyleTargets(current.document, targets)
      if (!uniqueTargets.some((target) => {
        const owner = layerStyleOwnerForTarget(current.document, target)
        return Boolean(owner && !layerStylesEqual(owner.layerStyles, styles))
      })) return false
      let committed = false
      get().mutateActive((session) => {
        const changes = uniqueTargets.flatMap((target) => {
          const owner = layerStyleOwnerForTarget(session.document, target)
          if (!owner || layerStylesEqual(owner.layerStyles, styles)) return []
          return [{ owner, before: cloneLayerStyles(owner.layerStyles), after: cloneLayerStyles(styles) }]
        })
        if (changes.length === 0) return
        for (const change of changes) assignLayerStyles(change.owner, change.after)
        const label = action === 'paste'
          ? tr('workspace.history.pasteLayerStyles')
          : action === 'clear'
            ? tr('workspace.history.clearLayerStyles')
            : tr('workspace.history.layerStyles')
        session.history.push({
          label,
          bytes: changes.reduce((bytes, change) => bytes + layerStylesHistoryBytes(change.before) + layerStylesHistoryBytes(change.after), 0),
          undo: () => { for (const change of changes) assignLayerStyles(change.owner, change.before) },
          redo: () => { for (const change of changes) assignLayerStyles(change.owner, change.after) },
          contentChanged: true,
          requiresAnimationSync: false,
          invalidation: { kind: 'full' }
        })
        committed = true
      }, 'content')
      return committed
    },
    setLayerStylesEnabled(targets, enabled) {
      const current = activeSession(get())
      if (!current) return false
      const uniqueTargets = uniqueLayerStyleTargets(current.document, targets)
      const hasChanges = uniqueTargets.some((target) => {
        const owner = layerStyleOwnerForTarget(current.document, target)
        const styles = cloneLayerStyles(owner?.layerStyles)
        return Boolean(styles && hasConfiguredLayerStyles(styles) && styles.enabled !== enabled)
      })
      if (!hasChanges) return false
      let committed = false
      get().mutateActive((session) => {
        const changes = uniqueTargets.flatMap((target) => {
          const owner = layerStyleOwnerForTarget(session.document, target)
          const before = cloneLayerStyles(owner?.layerStyles)
          if (!owner || !before || !hasConfiguredLayerStyles(before) || before.enabled === enabled) return []
          return [{ owner, before, after: { ...before, enabled } }]
        })
        if (changes.length === 0) return
        for (const change of changes) assignLayerStyles(change.owner, change.after)
        session.history.push({
          label: tr('workspace.history.layerStyles'),
          bytes: changes.reduce((bytes, change) => bytes + layerStylesHistoryBytes(change.before) + layerStylesHistoryBytes(change.after), 0),
          undo: () => { for (const change of changes) assignLayerStyles(change.owner, change.before) },
          redo: () => { for (const change of changes) assignLayerStyles(change.owner, change.after) },
          contentChanged: true,
          requiresAnimationSync: false,
          invalidation: { kind: 'full' }
        })
        committed = true
      }, 'content')
      return committed
    },
    copyLayerStyles(ownerKind, ownerId) {
      const session = activeSession(get())
      if (!session) return false
      const owner = layerStyleOwnerForTarget(session.document, { kind: ownerKind, id: ownerId })
      const styles = cloneLayerStyles(owner?.layerStyles)
      if (!styles) return false
      set({ layerStyleClipboard: styles })
      return true
    },
    pasteLayerStyles(targets) {
      const styles = cloneLayerStyles(get().layerStyleClipboard ?? undefined)
      return styles ? get().setLayerStylesForTargets(targets, styles, 'paste') : false
    },
    clearLayerStyles(targets) {
      return get().setLayerStylesForTargets(targets, undefined, 'clear')
    },
    splitLayerStyles(layerId) {
      get().commitFloatingPaste()
      get().mutateActive((session) => {
        const beforeSelection = captureAnimationSelectionHistory(session)
        const entry = splitLayerStylesCommand(session.document, layerId)
        if (entry) session.history.push(historyEntryWithAnimationSelection(session, entry, beforeSelection, captureAnimationSelectionHistory(session)))
      }, true, true)
    }
  }
}
