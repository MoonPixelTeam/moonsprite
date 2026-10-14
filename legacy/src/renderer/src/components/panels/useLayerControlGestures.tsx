import { animationMaskAt, getGroupLockingAncestor, getLayerLockingGroup } from '@/core/document-model'
import { getLayerPanelAncestorGroupIds } from '@/core/layer-panel-layout'
import { animationGroupMaskAt, ensureAnimationDocument } from '@/core/animation'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import { useLayerRowToggleGesture } from '@/components/panels/useLayerRowToggleGesture'
import type { LayerPanelToggleTarget, LayerAutoLinkToggleTarget, LayerDisplayRow } from './layer-panel-contracts'

interface Options {
  session: DocumentSession
  displayRows: LayerDisplayRow[]
  celLookup: import('@/core/animation').AnimationCelLookup
  timeline: import('@shared/types-animation').AnimationTimeline
}

export function useLayerControlGestures({ session, displayRows, celLookup, timeline }: Options) {
  const { t } = useI18n()
  const store = useWorkspace.getState()
  const layerToggleHistoryLabel = (control: 'visibility' | 'lock' | 'auto-link' | 'group-expand'): string =>
    t(control === 'visibility' ? 'workspace.history.showLayer' : 'workspace.history.layerProperties')

  const layerToggleTargetKey = (target: LayerPanelToggleTarget): string =>
    `${target.control}:${target.ownerKind}:${target.id}:${'frameId' in target ? target.frameId : ''}`

  const layerPanelToggleValue = (target: LayerPanelToggleTarget): boolean | null => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (!active) return null
    if (target.ownerKind === 'layer') {
      const layer = active.document.layers.find((candidate) => candidate.id === target.id)
      if (!layer) return null
      if (target.control === 'visibility') return layer.visible
      return layer.locked
    }
    if (target.ownerKind === 'group') {
      if (target.control === 'group-expand') return !active.collapsedGroupIds.includes(target.id)
      const group = active.document.groups.find((candidate) => candidate.id === target.id)
      if (!group) return null
      if (target.control === 'visibility') return group.visible
      return group.locked
    }
    const timeline = ensureAnimationDocument(active.document)
    if (target.ownerKind === 'layer-mask') {
      const cel = timeline.cels.find((candidate) => candidate.id === target.id)
      return cel ? (animationMaskAt(timeline, cel.layerId, cel.frameId)?.visible ?? null) : null
    }
    return animationGroupMaskAt(timeline, target.id, target.frameId)?.visible ?? null
  }

  const applyLayerPanelToggle = (target: LayerPanelToggleTarget, value: boolean): void => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (!active) return
    if (target.ownerKind === 'layer') {
      const layer = active.document.layers.find((candidate) => candidate.id === target.id)
      if (!layer) return
      if (target.control === 'visibility') {
        if (layer.visible !== value) store.toggleLayerVisibility(layer.id)
        return
      }
      const lockingGroup = getLayerLockingGroup(active.document, layer)
      if (value === false && lockingGroup) {
        const lockingGroups = getLayerPanelAncestorGroupIds(active.document.groups, layer.groupId)
          .map((groupId) => active.document.groups.find((candidate) => candidate.id === groupId))
          .filter((group): group is NonNullable<typeof group> => Boolean(group?.locked))
          .reverse()
        for (const group of lockingGroups) {
          store.setGroupProperties(group.id, group.name, group.opacity, group.blendMode, false, group.displayColor, group.description, group.cumulativeBlend)
        }
        store.setLayerLocked(layer.id, false)
        return
      }
      if (layer.locked === value) return
      store.setLayerLocked(layer.id, value)
      return
    }
    if (target.ownerKind === 'group') {
      const group = active.document.groups.find((candidate) => candidate.id === target.id)
      if (!group) return
      if (target.control === 'group-expand') {
        if (active.collapsedGroupIds.includes(group.id) === value) store.toggleGroupCollapsed(group.id)
        return
      }
      if (target.control === 'visibility') {
        if (group.visible !== value) store.toggleGroupVisibility(group.id)
        return
      }
      const lockingAncestor = getGroupLockingAncestor(active.document, group)
      if (value === false && lockingAncestor) {
        const lockingGroups = getLayerPanelAncestorGroupIds(active.document.groups, group.parentGroupId)
          .map((groupId) => active.document.groups.find((candidate) => candidate.id === groupId))
          .filter((ancestor): ancestor is NonNullable<typeof ancestor> => Boolean(ancestor?.locked))
          .reverse()
        for (const ancestor of lockingGroups) {
          store.setGroupProperties(
            ancestor.id,
            ancestor.name,
            ancestor.opacity,
            ancestor.blendMode,
            false,
            ancestor.displayColor,
            ancestor.description,
            ancestor.cumulativeBlend
          )
        }
        store.setGroupLocked(group.id, false)
        return
      }
      if (group.locked === value) return
      store.setGroupLocked(group.id, value)
      return
    }
    const timeline = ensureAnimationDocument(active.document)
    if (target.ownerKind === 'layer-mask') {
      const cel = timeline.cels.find((candidate) => candidate.id === target.id)
      const mask = cel ? animationMaskAt(timeline, cel.layerId, cel.frameId) : null
      if (cel && mask && mask.visible !== value) store.toggleLayerMaskVisibility(cel.id)
      return
    }
    const mask = animationGroupMaskAt(timeline, target.id, target.frameId)
    if (mask && mask.visible !== value) store.toggleGroupMaskVisibility(target.id, target.frameId)
  }

  const visibleLayerPanelToggleTargets = (control: 'visibility' | 'lock' | 'group-expand'): LayerPanelToggleTarget[] => {
    return displayRows.flatMap((row): LayerPanelToggleTarget[] => {
      if (row.kind === 'node') {
        if (control === 'group-expand') return row.node.kind === 'group' ? [{ control, ownerKind: 'group', id: row.node.group.id }] : []
        return row.node.kind === 'layer'
          ? [{ control, ownerKind: 'layer', id: row.node.layer.id } as LayerPanelToggleTarget]
          : [{ control, ownerKind: 'group', id: row.node.group.id } as LayerPanelToggleTarget]
      }
      if (control === 'lock' || control === 'group-expand') return []
      if (row.ownerKind === 'layer') {
        const cel = celLookup.at(row.owner.id, timeline.activeFrameId)
        return cel && animationMaskAt(timeline, row.owner.id, timeline.activeFrameId)
          ? [{ control: 'visibility' as const, ownerKind: 'layer-mask' as const, id: cel.id }]
          : []
      }
      return animationGroupMaskAt(timeline, row.owner.id, timeline.activeFrameId)
        ? [{ control: 'visibility' as const, ownerKind: 'group-mask' as const, id: row.owner.id, frameId: timeline.activeFrameId }]
        : []
    })
  }

  const layerPanelModifierTargets = (target: LayerPanelToggleTarget, allTargets: readonly LayerPanelToggleTarget[]): LayerPanelToggleTarget[] | null => {
    if (target.ownerKind !== 'layer' && target.ownerKind !== 'group') return null
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (!active) return [...allTargets]
    const selectedGroups = active.selectedGroupIds.length > 0 ? active.selectedGroupIds : active.selectedGroupId ? [active.selectedGroupId] : []
    const selectedLayers =
      active.selectedGroupId && selectedGroups.length === 1
        ? []
        : active.selectedLayerIds.filter((id) => active.document.layers.some((layer) => layer.id === id))
    const selectedCount = new Set([...selectedGroups.map((id) => `group:${id}`), ...selectedLayers.map((id) => `layer:${id}`)]).size
    if (selectedCount <= 1) return [...allTargets]
    const selectedKeys = new Set([...selectedGroups.map((id) => `group:${id}`), ...selectedLayers.map((id) => `layer:${id}`)])
    return allTargets.filter((candidate) => selectedKeys.has(`${candidate.ownerKind}:${candidate.id}`))
  }

  const layerToggleGesture = useLayerRowToggleGesture<LayerPanelToggleTarget>({
    targetKey: layerToggleTargetKey,
    readValue: layerPanelToggleValue,
    applyValue: applyLayerPanelToggle,
    visibleTargets: visibleLayerPanelToggleTargets,
    soloTargets: (target) => layerPanelModifierTargets(target, visibleLayerPanelToggleTargets(target.control)),
    ctrlTargets: (target) => layerPanelModifierTargets(target, visibleLayerPanelToggleTargets(target.control)),
    beginTransaction: () => store.beginLayerPanelTransaction(session.document.id),
    commitTransaction: (control) => store.commitLayerPanelTransaction(session.document.id, layerToggleHistoryLabel(control)),
    blocked: (message) => store.setMessage(message)
  })

  const beginLayerPanelToggle = layerToggleGesture.begin

  const continueLayerPanelToggle = layerToggleGesture.enter

  const endLayerPanelToggle = layerToggleGesture.end

  const finishLayerPanelToggleClick = layerToggleGesture.click

  const finishLayerPanelToggle = layerToggleGesture.finish

  const layerAutoLinkTargetKey = (target: LayerAutoLinkToggleTarget): string => `${target.control}:${target.id}`

  const layerAutoLinkValue = (target: LayerAutoLinkToggleTarget): boolean | null => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    return active?.document.layers.find((layer) => layer.id === target.id)?.autoLinkAnimationCels === true
      ? true
      : active?.document.layers.some((layer) => layer.id === target.id)
        ? false
        : null
  }

  const selectedAutoLinkTargets = (_target: LayerAutoLinkToggleTarget): LayerAutoLinkToggleTarget[] => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    const selectedIds = active?.selectedLayerIds.filter((id) => active.document.layers.some((layer) => layer.id === id)) ?? []
    const ids = selectedIds.length > 1 ? selectedIds : visibleLayerAutoLinkTargets().map((candidate) => candidate.id)
    return [...new Set(ids)].map((id) => ({ control: 'auto-link' as const, ownerKind: 'layer' as const, id }))
  }

  const applyLayerAutoLinkValue = (target: LayerAutoLinkToggleTarget, value: boolean): void => {
    store.setLayerAutoLinkAnimationCels(target.id, value)
  }

  const visibleLayerAutoLinkTargets = (): LayerAutoLinkToggleTarget[] =>
    displayRows.flatMap((row): LayerAutoLinkToggleTarget[] =>
      row.kind === 'node' && row.node.kind === 'layer' ? [{ control: 'auto-link', ownerKind: 'layer', id: row.node.layer.id }] : []
    )

  const layerAutoLinkGesture = useLayerRowToggleGesture<LayerAutoLinkToggleTarget>({
    targetKey: layerAutoLinkTargetKey,
    readValue: layerAutoLinkValue,
    applyValue: applyLayerAutoLinkValue,
    visibleTargets: visibleLayerAutoLinkTargets,
    ctrlTargets: selectedAutoLinkTargets,
    soloTargets: (_target) => {
      const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
      const selectedIds = active?.selectedLayerIds.filter((id) => active.document.layers.some((layer) => layer.id === id)) ?? []
      const ids = selectedIds.length > 1 ? selectedIds : visibleLayerAutoLinkTargets().map((candidate) => candidate.id)
      return ids.map((id) => ({ control: 'auto-link' as const, ownerKind: 'layer' as const, id }))
    },
    beginTransaction: () => store.beginLayerPanelTransaction(session.document.id),
    commitTransaction: () => store.commitLayerPanelTransaction(session.document.id, t('workspace.history.layerProperties'))
  })

  const beginLayerAutoLinkToggle = layerAutoLinkGesture.begin

  const continueLayerAutoLinkToggle = layerAutoLinkGesture.enter

  const endLayerAutoLinkToggle = layerAutoLinkGesture.end

  const finishLayerAutoLinkClick = layerAutoLinkGesture.click

  const isLayerRowControlTarget = (event: React.PointerEvent<HTMLElement>): boolean => {
    const target = event.target instanceof Element ? event.target : null
    return Boolean(
      target?.closest(
        '.layer-visibility, .layer-lock-toggle, .layer-auto-link-toggle, .group-folder, .layer-status-icon-tooltip, .layer-style-indicator, .layer-instance-properties, .layer-tilemap-indicator'
      )
    )
  }

  const toggleLayerAutoLink = (layerId: string): void => {
    const liveLayer = useWorkspace
      .getState()
      .sessions.find((item) => item.document.id === session.document.id)
      ?.document.layers.find((layer) => layer.id === layerId)
    store.setLayerAutoLinkAnimationCels(layerId, !(liveLayer?.autoLinkAnimationCels === true))
  }

  const handleLayerAutoLinkPointerDown = (event: React.PointerEvent<HTMLElement>, layerId: string): void => {
    const target = { control: 'auto-link' as const, ownerKind: 'layer' as const, id: layerId }
    beginLayerAutoLinkToggle(event, target, layerAutoLinkValue(target) === true)
  }

  const handleLayerAutoLinkKeyDown = (event: React.KeyboardEvent<HTMLElement>, layerId: string): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    toggleLayerAutoLink(layerId)
  }

  const toggleLayerMaskLocked = (celId: string, locked: boolean): void => {
    store.setLayerMaskLocked(celId, !locked)
  }

  const toggleLayerMaskAutoLink = (celId: string, enabled: boolean): void => {
    store.setLayerMaskAutoLinkAnimationCels(celId, !enabled)
  }

  const handleLayerMaskControlPointerDown = (event: React.PointerEvent<HTMLElement>, action: () => void, disabled = false): void => {
    if (event.button !== 0 || disabled) return
    event.preventDefault()
    event.stopPropagation()
    action()
  }

  const handleLayerMaskControlKeyDown = (event: React.KeyboardEvent<HTMLElement>, action: () => void, disabled = false): void => {
    if (disabled || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    event.stopPropagation()
    action()
  }
  return {
    beginLayerPanelToggle,
    continueLayerPanelToggle,
    endLayerPanelToggle,
    finishLayerPanelToggleClick,
    finishLayerPanelToggle,
    continueLayerAutoLinkToggle,
    endLayerAutoLinkToggle,
    finishLayerAutoLinkClick,
    isLayerRowControlTarget,
    handleLayerAutoLinkPointerDown,
    handleLayerAutoLinkKeyDown,
    toggleLayerMaskLocked,
    toggleLayerMaskAutoLink,
    handleLayerMaskControlPointerDown,
    handleLayerMaskControlKeyDown
  }
}
