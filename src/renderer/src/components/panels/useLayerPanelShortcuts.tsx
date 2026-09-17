import { selectedRowsForProperties, hasUnsupportedPropertySelection } from './layer-panel-selection'
import { useEffect, useRef } from 'react'
import type { AnimationLoopSection } from '@shared/types-animation'
import type { LayerGroup, RasterLayer } from '@shared/types-layer'
import { animationMaskAt } from '@/core/document-model'
import { EDITOR_SHORTCUT_COMMAND_EVENT, type EditorShortcutCommandDetail } from '@/core/command-context'
import { animationGroupMaskAt, createAnimationCelLookup, ensureAnimationDocument, parseAnimationCelKey } from '@/core/animation'
import { animationLoopSectionAtFrame, resolveAnimationLoopSectionRange } from '@/core/animation-loop-sections'
import { type ShortcutId } from '@/core/shortcuts'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { type LayerQuickActionId } from '@/core/layer-panel-preferences'
import { hasConfiguredLayerStyles, hasEnabledLayerStyles } from '@/core/layer-styles'
import type { LayerFormTarget, LayerStyleDialogState } from './layer-panel-contracts'

interface Options {
  session: DocumentSession
  openTilemapLayerDialog: () => void
  openFreeTileLayerDialog: () => void
  openBackgroundLayerDialog: () => void
  setTilemapLayerDialog: import('react').Dispatch<
    import('react').SetStateAction<
      | {
          mode: 'create'
        }
      | {
          mode: 'convert'
          layerId: string
        }
      | null
    >
  >
  editSelectedRows: (frozenTargets?: readonly LayerFormTarget[]) => void
  editGroup: (group: LayerGroup) => void
  editLayer: (layer: RasterLayer) => void
  setLayerStyleDialog: import('react').Dispatch<import('react').SetStateAction<LayerStyleDialogState | null>>
  openLayerSettings: () => void
  updateAnimationFrameDisabled: (disabled: boolean | 'toggle') => void
  toggleOnionSkin: () => void
  openLoopSectionCreator: () => void
  openFramePropertiesFor: (frameId: string) => void
  openLoopSectionPropertiesFor: (sectionId: string) => void
  openCelProperties: (layerId: string, frameId: string) => void
}

export function useLayerPanelShortcuts({
  session,
  openTilemapLayerDialog,
  openFreeTileLayerDialog,
  openBackgroundLayerDialog,
  setTilemapLayerDialog,
  editSelectedRows,
  editGroup,
  editLayer,
  setLayerStyleDialog,
  openLayerSettings,
  updateAnimationFrameDisabled,
  toggleOnionSkin,
  openLoopSectionCreator,
  openFramePropertiesFor,
  openLoopSectionPropertiesFor,
  openCelProperties
}: Options) {
  const store = useWorkspace.getState()
  const shortcutCommandHandlerRef = useRef<(id: ShortcutId) => void>(() => {})

  useEffect(() => {
    const handleShortcutCommand = (event: Event): void => {
      const detail = (event as CustomEvent<EditorShortcutCommandDetail>).detail
      if (!detail || detail.documentId !== session.document.id) return
      shortcutCommandHandlerRef.current(detail.id)
    }
    window.addEventListener(EDITOR_SHORTCUT_COMMAND_EVENT, handleShortcutCommand)
    return () => window.removeEventListener(EDITOR_SHORTCUT_COMMAND_EVENT, handleShortcutCommand)
  }, [session.document.id])

  const shortcutLayerTargets = (): LayerFormTarget[] => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (!active) return []
    const selected = selectedRowsForProperties(active)
    if (selected.length > 0) return selected
    const activeLayer = active.document.layers.find((layer) => layer.id === active.document.activeLayerId)
    return activeLayer ? [{ kind: 'layer', id: activeLayer.id }] : []
  }

  const shortcutLoopSection = (): AnimationLoopSection | null => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (!active) return null
    const activeTimeline = ensureAnimationDocument(active.document)
    const selectedFrameIds = new Set(active.selectedAnimationFrameIds)
    if (selectedFrameIds.size > 0) {
      const exact = (activeTimeline.loopSections ?? []).find((section) => {
        const range = resolveAnimationLoopSectionRange(activeTimeline, section)
        if (!range || range.endIndex - range.startIndex + 1 !== selectedFrameIds.size) return false
        return activeTimeline.frames.slice(range.startIndex, range.endIndex + 1).every((frame) => selectedFrameIds.has(frame.id))
      })
      if (exact) return exact
    }
    return animationLoopSectionAtFrame(activeTimeline, activeTimeline.activeFrameId)
  }

  const toggleShortcutAnimationMask = (): void => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (!active) return
    const activeTimeline = ensureAnimationDocument(active.document)
    const selectedKey = active.selectedAnimationMaskCellKeys[0] ?? active.selectedAnimationCellKeys[0]
    const selectedTarget = selectedKey ? parseAnimationCelKey(selectedKey) : null
    const groupId = selectedTarget
      ? active.document.groups.some((group) => group.id === selectedTarget.layerId)
        ? selectedTarget.layerId
        : null
      : (active.selectedGroupIds[0] ?? active.selectedGroupId)
    const frameId = selectedTarget?.frameId ?? activeTimeline.activeFrameId
    if (groupId) {
      if (animationGroupMaskAt(activeTimeline, groupId, frameId)) store.deleteGroupMask(groupId, frameId)
      else store.createGroupMask(groupId, frameId)
      return
    }
    const layerId = selectedTarget?.layerId ?? active.document.activeLayerId
    const lookup = createAnimationCelLookup(activeTimeline)
    const cel = lookup.at(layerId, frameId)
    const mask = animationMaskAt(activeTimeline, layerId, frameId)
    if (mask && cel) store.deleteLayerMask(cel.id)
    else store.createLayerMask(cel?.id ?? layerId, frameId)
  }

  shortcutCommandHandlerRef.current = (id): void => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (!active) return
    const activeTimeline = ensureAnimationDocument(active.document)
    const activeLayer = active.document.layers.find((layer) => layer.id === active.document.activeLayerId) ?? null
    const activeGroupId = active.selectedGroupIds[0] ?? active.selectedGroupId
    const targets = shortcutLayerTargets()
    const primaryTarget = targets[0] ?? null
    switch (id) {
      case 'newLayer':
        void store.addLayer()
        break
      case 'createLayerGroup':
        store.createLayerGroup()
        break
      case 'newTilemapLayer':
        openTilemapLayerDialog()
        break
      case 'newFreeTileLayer':
        openFreeTileLayerDialog()
        break
      case 'newBackgroundLayer':
        openBackgroundLayerDialog()
        break
      case 'duplicateLayer':
        store.duplicateSelectedLayerRows()
        break
      case 'deleteLayer':
        store.deleteSelectedLayers()
        break
      case 'createLinkedLayer':
        if (activeLayer && !activeLayer.kind && !activeLayer.background) store.createLinkedLayer(activeLayer.id)
        break
      case 'convertLayerToBackground':
        if (activeLayer && !activeLayer.kind && !activeLayer.background) store.setLayerBackground(activeLayer.id, true)
        break
      case 'convertLayerToTilemap':
        if (activeLayer && !activeLayer.kind && !activeLayer.background && !hasConfiguredLayerStyles(activeLayer.layerStyles))
          setTilemapLayerDialog({ mode: 'convert', layerId: activeLayer.id })
        break
      case 'convertLayerToRaster':
        if (activeLayer && (activeLayer.background || activeLayer.kind || hasConfiguredLayerStyles(activeLayer.layerStyles)))
          store.rasterizeLayer(activeLayer.id)
        break
      case 'openLayerProperties': {
        if (hasUnsupportedPropertySelection(active)) break
        if (targets.length > 1) editSelectedRows()
        else if (primaryTarget?.kind === 'group') {
          const group = active.document.groups.find((candidate) => candidate.id === primaryTarget.id)
          if (group) editGroup(group)
        } else if (primaryTarget?.kind === 'layer') {
          const layer = active.document.layers.find((candidate) => candidate.id === primaryTarget.id)
          if (layer) editLayer(layer)
        }
        break
      }
      case 'toggleLayerMask':
        if (activeLayer) store.createLayerMasksForLayer(activeLayer.id)
        break
      case 'toggleGroupMask':
        if (activeGroupId) {
          if (animationGroupMaskAt(activeTimeline, activeGroupId, activeTimeline.activeFrameId))
            store.deleteGroupMask(activeGroupId, activeTimeline.activeFrameId)
          else store.createGroupMask(activeGroupId, activeTimeline.activeFrameId)
        }
        break
      case 'openLayerStyles':
        if (primaryTarget) setLayerStyleDialog({ source: primaryTarget, targets })
        break
      case 'toggleLayerStyles': {
        if (!primaryTarget) break
        const owner =
          primaryTarget.kind === 'layer'
            ? active.document.layers.find((layer) => layer.id === primaryTarget.id)
            : active.document.groups.find((group) => group.id === primaryTarget.id)
        if (hasConfiguredLayerStyles(owner?.layerStyles)) store.setLayerStylesEnabled(targets, !hasEnabledLayerStyles(owner?.layerStyles))
        break
      }
      case 'copyLayerStyles':
        if (primaryTarget) store.copyLayerStyles(primaryTarget.kind, primaryTarget.id)
        break
      case 'pasteLayerStyles':
        if (targets.length > 0) store.pasteLayerStyles(targets)
        break
      case 'clearLayerStyles':
        if (targets.length > 0) store.clearLayerStyles(targets)
        break
      case 'mergeLayerDown':
        store.mergeActiveLayerDown()
        break
      case 'mergeSelectedLayers':
        store.mergeSelectedLayers()
        break
      case 'mergeLayerGroup':
        store.mergeSelectedGroup()
        break
      case 'mergeVisibleLayers':
        store.mergeVisibleLayers()
        break
      case 'ungroupLayers':
        store.ungroupSelected()
        break
      case 'toggleClippingMask': {
        if (!primaryTarget) break
        const owner =
          primaryTarget.kind === 'layer'
            ? active.document.layers.find((layer) => layer.id === primaryTarget.id)
            : active.document.groups.find((group) => group.id === primaryTarget.id)
        store.setClippingMask(primaryTarget.kind, primaryTarget.id, owner?.clippingMask !== true)
        break
      }
      case 'openLayerSettings':
        openLayerSettings()
        break
      case 'enableAnimationFrames':
        updateAnimationFrameDisabled(false)
        break
      case 'disableAnimationFrames':
        updateAnimationFrameDisabled(true)
        break
      case 'toggleAnimationFramesDisabled':
        updateAnimationFrameDisabled('toggle')
        break
      case 'toggleOnionSkin':
        toggleOnionSkin()
        break
      case 'copyAnimationFrames':
        store.copySelectedAnimationFrames()
        break
      case 'pasteAnimationFrames':
        store.pasteAnimationFrames()
        break
      case 'pasteAnimationCels':
        store.pasteAnimationCels()
        break
      case 'copyAnimationMasks':
        store.copySelectedAnimationMasks()
        break
      case 'pasteAnimationMasks':
        store.pasteAnimationMasks()
        break
      case 'connectAnimationCels':
        store.connectSelectedAnimationCels()
        break
      case 'disconnectAnimationCels':
        store.disconnectSelectedAnimationCels()
        break
      case 'connectAnimationMasks':
        store.connectSelectedAnimationMasks()
        break
      case 'disconnectAnimationMasks':
        store.disconnectSelectedAnimationMasks()
        break
      case 'toggleAnimationMask':
        toggleShortcutAnimationMask()
        break
      case 'createAnimationLoopSection':
        openLoopSectionCreator()
        break
      case 'openAnimationFrameProperties':
        openFramePropertiesFor(activeTimeline.activeFrameId)
        break
      case 'playAnimationLoopSection': {
        const section = shortcutLoopSection()
        if (section) store.playAnimationLoopSection(section.id)
        break
      }
      case 'openAnimationLoopSectionProperties': {
        const section = shortcutLoopSection()
        if (section) openLoopSectionPropertiesFor(section.id)
        break
      }
      case 'deleteAnimationLoopSection': {
        const section = shortcutLoopSection()
        if (section) store.deleteAnimationLoopSection(section.id)
        break
      }
      case 'openAnimationCelProperties': {
        const selectedTarget = parseAnimationCelKey(active.selectedAnimationCellKeys[0] ?? '')
        openCelProperties(selectedTarget?.layerId ?? active.document.activeLayerId, selectedTarget?.frameId ?? activeTimeline.activeFrameId)
        break
      }
    }
  }

  const runLayerQuickAction = (id: LayerQuickActionId): void => shortcutCommandHandlerRef.current(id)
  return { runLayerQuickAction }
}
