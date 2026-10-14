import { getDescendantGroupIds, getGroup, getLayerIdsInGroup } from '@/core/document-model'
import { buildLayerPanelTree, getLayerPanelAncestorGroupIds } from '@/core/layer-panel-layout'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceLayerCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { setTimelineActiveContext, clearAnimationItemSelection, animationLayerPanelSelectionRows, AnimationLayerPanelSelectionRow, selectedGroupRows, selectedDirectLayerRows, applyLayerRowSelection } from './workspace-animation-selection'
import { requestTilesetPanelVisibility, requestTilesetPanelForLayer } from './workspace-tileset-panel'
import { activeSession } from './workspace-access'


type LayerRowSelectionMode = boolean | 'replace' | 'toggle' | 'range'

const applyLayerRowRange = (
  session: DocumentSession,
  target: { kind: 'layer' | 'group'; id: string },
  options: { preserveMaskRowSelection?: boolean } = {},
): void => {
  const nodes = buildLayerPanelTree({
    layers: session.document.layers,
    groups: session.document.groups,
    collapsedGroupIds: session.collapsedGroupIds
  })
  const preserveMaskRows = options.preserveMaskRowSelection === true
  const panelRows = preserveMaskRows ? animationLayerPanelSelectionRows(session) : null
  const rowKey = (row: AnimationLayerPanelSelectionRow): string => row.kind === 'mask'
    ? `mask:${row.ownerKind}:${row.id}`
    : `${row.kind}:${row.id}`
  const visibleIds = panelRows ? panelRows.map(rowKey) : nodes.map((node) => node.id)
  const targetKey = panelRows ? `${target.kind}:${target.id}` : target.id
  const currentRows = [...selectedGroupRows(session), ...selectedDirectLayerRows(session)]
  const selectedMaskKey = panelRows ? session.selectedAnimationMaskRowKeys.at(-1) : undefined
  const anchorNormalRow = session.layerSelectionAnchorId
    ? panelRows?.find((row) => row.kind !== 'mask' && row.id === session.layerSelectionAnchorId)
    : undefined
  const anchorKey = selectedMaskKey && panelRows?.some((row) => rowKey(row) === `mask:${selectedMaskKey}`)
    ? `mask:${selectedMaskKey}`
    : anchorNormalRow
      ? rowKey(anchorNormalRow)
      : session.layerSelectionAnchorId && visibleIds.includes(session.layerSelectionAnchorId)
        ? session.layerSelectionAnchorId
      : currentRows.find((id) => panelRows ? panelRows.some((row) => row.kind !== 'mask' && row.id === id) : visibleIds.includes(id)) ?? targetKey
  const anchorIndex = visibleIds.indexOf(anchorKey)
  const targetIndex = visibleIds.indexOf(targetKey)
  if (anchorIndex < 0 || targetIndex < 0) {
    applyLayerRowSelection(session, target.kind === 'layer' ? [target.id] : [], target.kind === 'group' ? [target.id] : [], target)
    return
  }
  const selectedPanelRows = panelRows
    ? panelRows.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
    : null
  const selectedNodes = selectedPanelRows
    ? selectedPanelRows.filter((row): row is Extract<AnimationLayerPanelSelectionRow, { kind: 'layer' | 'group' }> => row.kind !== 'mask')
    : nodes.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
  // A group row is a selectable row in its own right, but its visible range
  // also spans the group's descendants.  When Shift starts on a group and
  // lands on one of its children, include the complete subtree; otherwise a
  // collapsed row ordering (group followed by its topmost child) would leave
  // the remaining children out of the selection.
  const anchorRowId = session.layerSelectionAnchorId
  const anchorGroupId = anchorRowId
    && session.document.groups.some((group) => group.id === session.layerSelectionAnchorId)
    ? session.layerSelectionAnchorId
    : null
  const targetGroupId = target.kind === 'group' ? target.id : null
  const anchorGroupDescendants = anchorGroupId
    ? new Set([anchorGroupId, ...getDescendantGroupIds(session.document, anchorGroupId)])
    : null
  const anchorGroupLayerIds = anchorGroupId ? new Set(getLayerIdsInGroup(session.document, anchorGroupId)) : null
  const targetGroupLayerIds = targetGroupId ? new Set(getLayerIdsInGroup(session.document, targetGroupId)) : null
  const rangeGroupId = anchorGroupId && target.kind === 'layer' && anchorGroupLayerIds?.has(target.id)
    ? anchorGroupId
    : targetGroupId && anchorRowId && targetGroupLayerIds?.has(anchorRowId)
      ? targetGroupId
      : anchorGroupId && targetGroupId && anchorGroupDescendants?.has(targetGroupId)
        ? anchorGroupId
        : null
  const rangeGroupIds = rangeGroupId
    ? new Set([rangeGroupId, ...getDescendantGroupIds(session.document, rangeGroupId)])
    : null
  const rangeLayerIds = rangeGroupId ? new Set(getLayerIdsInGroup(session.document, rangeGroupId)) : null
  const expandedSelectedNodes = rangeGroupId
    ? nodes.filter((node) => (node.kind === 'group' && rangeGroupIds?.has(node.id) === true)
      || (node.kind === 'layer' && rangeLayerIds?.has(node.id) === true))
    : selectedNodes
  applyLayerRowSelection(
    session,
    expandedSelectedNodes.filter((node) => node.kind === 'layer').map((node) => node.id),
    expandedSelectedNodes.filter((node) => node.kind === 'group').map((node) => node.id),
    target,
    { preserveMaskRowSelection: options.preserveMaskRowSelection }
  )
  if (selectedPanelRows) session.selectedAnimationMaskRowKeys = selectedPanelRows
    .filter((row): row is Extract<AnimationLayerPanelSelectionRow, { kind: 'mask' }> => row.kind === 'mask')
    .map((row) => `${row.ownerKind}:${row.id}`)
}

export function createLayerSelectionCommands({ get, set }: WorkspaceCommandContext<'cancelTextBoxTransform' | 'commitFloatingPaste' | 'mutateActive'>): Pick<WorkspaceLayerCommands, 'selectLayer' | 'selectMoveToolLayer' | 'activateLayerForCanvas' | 'selectGroup' | 'selectLayerRows' | 'clearLayerSelection' | 'toggleGroupCollapsed' | 'revealLayerInPanel' | 'beginLayerPanelTransaction' | 'commitLayerPanelTransaction'> {
  return {
    selectLayer(layerId, mode = 'replace') {
      get().cancelTextBoxTransform()
      get().commitFloatingPaste()
      get().mutateActive((session) => {
        session.layerSelectionExplicit = true
        const selectionMode: Exclude<LayerRowSelectionMode, boolean> = mode === true ? 'toggle' : mode === false ? 'replace' : mode
        const preserveMaskRowSelection = selectionMode !== 'replace' && session.selectedAnimationMaskRowKeys.length > 0
        // Layer, frame, and cel selections are mutually exclusive modes. A
        // Ctrl-toggle is the exception for row selections: it may coexist with
        // selected mask rows so ordinary layers and masks can be multi-selected.
        clearAnimationItemSelection(session, preserveMaskRowSelection)
        if (selectionMode === 'range') {
          applyLayerRowRange(session, { kind: 'layer', id: layerId }, { preserveMaskRowSelection })
        } else if (selectionMode === 'toggle') {
          const layers = selectedDirectLayerRows(session)
          const wasSelected = layers.includes(layerId)
          const toggledLayers = wasSelected ? layers.filter((id) => id !== layerId) : [...layers, layerId]
          // A selected group is a valid row selection, not a reason to discard
          // a Ctrl-added layer.  Keep the first toggled layer when the group
          // was the only prior row, while still allowing the last layer to be
          // toggled off when it was already selected.
          const nextLayers = toggledLayers.length === 0 && !wasSelected ? [layerId] : toggledLayers
          applyLayerRowSelection(session, nextLayers, selectedGroupRows(session), { kind: 'layer', id: layerId }, { preserveMaskRowSelection })
          session.layerSelectionAnchorId = layerId
        } else {
          applyLayerRowSelection(session, [layerId], [], { kind: 'layer', id: layerId })
          session.layerSelectionAnchorId = layerId
        }
        setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: layerId }, session.document.animation?.activeFrameId ?? null, null)
        // applyLayerRowSelection owns the complete transition out of mask mode.
      }, false)
      const current = activeSession(get())
      if (current) requestTilesetPanelForLayer(current.document, layerId)
    },
    selectMoveToolLayer(layerId, additive = false) {
      get().commitFloatingPaste()
      get().mutateActive((session) => {
        session.layerSelectionExplicit = true
        if (!session.document.layers.some((layer) => layer.id === layerId)) return
        clearAnimationItemSelection(session)
        const currentLayerIds = selectedDirectLayerRows(session)
        const toggledLayerIds = additive
          ? currentLayerIds.includes(layerId)
            ? currentLayerIds.filter((candidate) => candidate !== layerId)
            : [...currentLayerIds, layerId]
          : [layerId]
        const selectedLayerIds = toggledLayerIds.length > 0 ? toggledLayerIds : [layerId]
        applyLayerRowSelection(session, selectedLayerIds, [], { kind: 'layer', id: layerId })
        setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: layerId }, session.document.animation?.activeFrameId ?? null, null)
      }, false)
      const current = activeSession(get())
      if (current) requestTilesetPanelForLayer(current.document, layerId)
    },
    activateLayerForCanvas(layerId) {
      get().commitFloatingPaste()
      get().mutateActive((session) => {
        if (!session.document.layers.some((layer) => layer.id === layerId)) return
        // Canvas hit-testing changes the editing context only. It is deliberately
        // not equivalent to a timeline row click, which creates an explicit
        // layer selection and its blue selection outline.
        session.document.activeLayerId = layerId
        session.selectedLayerIds = []
        session.selectedGroupId = null
        session.selectedGroupIds = []
        session.layerSelectionExplicit = false
        session.layerSelectionAnchorId = layerId
        clearAnimationItemSelection(session)
        session.activeLayerMaskId = null
        session.layerMaskIsolatedView = false
        setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: layerId }, session.document.animation?.activeFrameId ?? null, null)
      }, false)
      const current = activeSession(get())
      if (current) requestTilesetPanelForLayer(current.document, layerId)
    },
    selectGroup(groupId, mode = 'replace') {
      get().cancelTextBoxTransform()
      get().commitFloatingPaste()
      get().mutateActive((session) => {
        session.layerSelectionExplicit = true
        getGroup(session.document, groupId)
        const selectionMode: Exclude<LayerRowSelectionMode, boolean> = mode === true ? 'toggle' : mode === false ? 'replace' : mode
        const preserveMaskRowSelection = selectionMode !== 'replace' && session.selectedAnimationMaskRowKeys.length > 0
        clearAnimationItemSelection(session, preserveMaskRowSelection)
        if (selectionMode === 'range') applyLayerRowRange(session, { kind: 'group', id: groupId }, { preserveMaskRowSelection })
        else if (selectionMode === 'toggle') {
          const groups = selectedGroupRows(session)
          const nextGroups = groups.includes(groupId) ? groups.filter((id) => id !== groupId) : [...groups, groupId]
          applyLayerRowSelection(session, selectedDirectLayerRows(session), nextGroups, { kind: 'group', id: groupId }, { preserveMaskRowSelection })
          session.layerSelectionAnchorId = groupId
        } else {
          applyLayerRowSelection(session, [], [groupId], { kind: 'group', id: groupId })
          session.layerSelectionAnchorId = groupId
        }
        setTimelineActiveContext(session, { kind: 'group', ownerKind: 'group', ownerId: groupId }, session.document.animation?.activeFrameId ?? null, null)
      }, false)
    },
    selectLayerRows(layerIds, groupIds) {
      get().mutateActive((session) => {
        session.layerSelectionExplicit = layerIds.length > 0 || groupIds.length > 0
        clearAnimationItemSelection(session)
        const focus = layerIds.length > 0
          ? { kind: 'layer' as const, id: layerIds.at(-1)! }
          : groupIds.length > 0
            ? { kind: 'group' as const, id: groupIds.at(-1)! }
            : { kind: 'layer' as const, id: session.document.activeLayerId }
        applyLayerRowSelection(session, layerIds, groupIds, focus)
        setTimelineActiveContext(
          session,
          focus.kind === 'group'
            ? { kind: 'group', ownerKind: 'group', ownerId: focus.id }
            : { kind: 'layer', ownerKind: 'layer', ownerId: focus.id },
          session.document.animation?.activeFrameId ?? null,
          null
        )
      }, false)
      const current = activeSession(get())
      if (current && layerIds.some((layerId) => current.document.layers.some((layer) => layer.id === layerId && layer.kind === 'tilemap'))) requestTilesetPanelVisibility(true)
    },
    clearLayerSelection() {
      get().commitFloatingPaste()
      get().mutateActive((session) => {
        session.layerSelectionExplicit = false
        session.selectedGroupId = null
        session.selectedGroupIds = []
        session.selectedLayerIds = [session.document.activeLayerId]
        session.activeLayerMaskId = null
        session.layerMaskIsolatedView = false
        session.layerSelectionAnchorId = session.document.activeLayerId
        setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: session.document.activeLayerId }, session.document.animation?.activeFrameId ?? null, null)
      }, false)
    },
    toggleGroupCollapsed(groupId) {
      get().mutateActive((session) => {
        getGroup(session.document, groupId)
        session.collapsedGroupIds = session.collapsedGroupIds.includes(groupId)
          ? session.collapsedGroupIds.filter((id) => id !== groupId)
          : [...session.collapsedGroupIds, groupId]
      }, false)
    },
    revealLayerInPanel(documentId, layerId) {
      const state = get()
      const session = state.sessions.find((candidate) => candidate.document.id === documentId)
      const layer = session?.document.layers.find((candidate) => candidate.id === layerId)
      if (!session || !layer) return
      const ancestorIds = new Set(getLayerPanelAncestorGroupIds(session.document.groups, layer.groupId))
      if (!session.collapsedGroupIds.some((id) => ancestorIds.has(id))) return
      session.collapsedGroupIds = session.collapsedGroupIds.filter((id) => !ancestorIds.has(id))
      set({ sessions: [...state.sessions] })
    },
    beginLayerPanelTransaction(documentId) {
      const session = get().sessions.find((candidate) => candidate.document.id === documentId)
      session?.history.beginCompound()
    },
    commitLayerPanelTransaction(documentId, label) {
      const state = get()
      const session = state.sessions.find((candidate) => candidate.document.id === documentId)
      if (!session) return
      session.history.endCompound(label)
      set({ sessions: [...state.sessions] })
    }
  }
}
