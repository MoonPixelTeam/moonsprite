import type { LayerGroup } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import { getDescendantGroupIds, getGroup, getLayerIdsInGroup } from './document-model'
import type { HistoryEntry } from './history'
import { buildLayerPanelTree, type LayerPanelNode } from './layer-panel-layout'
import { translateCurrent as tr } from './localization'

export interface LayerOperationState {
  document: SpriteDocument
  selectedLayerIds: string[]
  selectedGroupId: string | null
  selectedGroupIds?: string[]
  collapsedGroupIds?: string[]
}

export interface LayerPanelRowMoveTarget {
  kind: 'edge' | 'group' | 'row'
  edge?: 'top' | 'bottom'
  id?: string
  rowKind?: 'layer' | 'group'
  position?: 'above' | 'below'
}

interface LayerPanelTreeItem {
  kind: 'layer' | 'group'
  id: string
  children: LayerPanelTreeItem[]
}

const uniqueLayerIds = (layerIds: readonly string[]): string[] => [...new Set(layerIds)]

const selectLayers = (state: LayerOperationState, layerIds: string[], groupId: string | null): void => {
  if (layerIds.length > 0) state.document.activeLayerId = layerIds.at(-1)!
  state.selectedLayerIds = layerIds
  state.selectedGroupId = groupId
  state.selectedGroupIds = groupId ? [groupId] : []
}

const applyLayerOrder = (document: SpriteDocument, layerById: Map<string, SpriteDocument['layers'][number]>, order: string[], activeLayerId: string): void => {
  document.layers = order.map((id) => layerById.get(id)).filter((layer): layer is SpriteDocument['layers'][number] => Boolean(layer))
  document.activeLayerId = activeLayerId
}

const applyLayerGroups = (layers: SpriteDocument['layers'], groupIds: Map<string, string | null>): void => {
  for (const layer of layers) if (groupIds.has(layer.id)) layer.groupId = groupIds.get(layer.id) ?? null
}

const applyGroupOrder = (document: SpriteDocument, groupById: Map<string, LayerGroup>, order: string[]): void => {
  document.groups = order.map((id) => groupById.get(id)).filter((group): group is LayerGroup => Boolean(group))
}

const applyGroupPanelOrders = (groups: readonly LayerGroup[], panelOrders: ReadonlyMap<string, number | undefined>): void => {
  for (const group of groups) if (panelOrders.has(group.id)) group.panelOrder = panelOrders.get(group.id)
}

const rootPanelNodes = (document: SpriteDocument): LayerPanelNode[] =>
  buildLayerPanelTree({ layers: document.layers, groups: document.groups }).filter((node) => node.depth === 0)

/** 根据完整的顶层可见顺序，把组锚点重新放到相邻根图层之间。 */
const rebaseRootGroupPanelOrders = (document: SpriteDocument, topToBottom: readonly LayerPanelNode[]): void => {
  const rootLayerOrder = new Map(document.layers.map((layer, index) => [layer.id, index]))
  let index = 0
  while (index < topToBottom.length) {
    if (topToBottom[index].kind === 'layer') { index += 1; continue }
    const start = index
    while (index < topToBottom.length && topToBottom[index].kind === 'group') index += 1
    const run = topToBottom.slice(start, index)
    const above = start > 0 && topToBottom[start - 1].kind === 'layer' ? rootLayerOrder.get(topToBottom[start - 1].id) : undefined
    const below = index < topToBottom.length && topToBottom[index].kind === 'layer' ? rootLayerOrder.get(topToBottom[index].id) : undefined
    for (let offset = 0; offset < run.length; offset += 1) {
      const group = document.groups.find((candidate) => candidate.id === run[offset].id)
      if (!group) continue
      if (above !== undefined && below !== undefined) group.panelOrder = above - ((above - below) * (offset + 1)) / (run.length + 1)
      else if (below !== undefined) group.panelOrder = below + run.length - offset
      else if (above !== undefined) group.panelOrder = above - offset - 1
      else group.panelOrder = run.length - offset - 1
    }
  }
}

const groupPanelAnchor = (document: SpriteDocument, groupId: string, visiting = new Set<string>()): number => {
  if (visiting.has(groupId)) return Number.NEGATIVE_INFINITY
  const nextVisiting = new Set(visiting).add(groupId)
  let anchor = Number.NEGATIVE_INFINITY
  document.layers.forEach((layer, index) => { if (layer.groupId === groupId) anchor = Math.max(anchor, index) })
  for (const child of document.groups) if ((child.parentGroupId ?? null) === groupId) anchor = Math.max(anchor, groupPanelAnchor(document, child.id, nextVisiting))
  if (anchor !== Number.NEGATIVE_INFINITY) return anchor
  const group = getGroup(document, groupId)
  return typeof group.panelOrder === 'number' && Number.isFinite(group.panelOrder)
    ? group.panelOrder
    : document.layers.length + document.groups.indexOf(group) + 1
}

const applyGroupPlacement = (group: LayerGroup, parentGroupId: string | null, panelOrder: number | undefined): void => {
  group.parentGroupId = parentGroupId
  group.panelOrder = panelOrder
}

const buildMutableLayerPanelTree = (document: SpriteDocument): LayerPanelTreeItem[] => {
  const root: LayerPanelTreeItem[] = []
  const stack: Array<{ depth: number; children: LayerPanelTreeItem[] }> = [{ depth: -1, children: root }]
  for (const node of buildLayerPanelTree({ layers: document.layers, groups: document.groups })) {
    while (stack.at(-1)!.depth >= node.depth) stack.pop()
    const item: LayerPanelTreeItem = { kind: node.kind, id: node.id, children: [] }
    stack.at(-1)!.children.push(item)
    if (node.kind === 'group') stack.push({ depth: node.depth, children: item.children })
  }
  return root
}

const findLayerPanelContainer = (items: LayerPanelTreeItem[], kind: LayerPanelTreeItem['kind'], id: string): { items: LayerPanelTreeItem[]; index: number } | null => {
  const index = items.findIndex((item) => item.kind === kind && item.id === id)
  if (index >= 0) return { items, index }
  for (const item of items) {
    if (item.kind !== 'group') continue
    const nested = findLayerPanelContainer(item.children, kind, id)
    if (nested) return nested
  }
  return null
}

const applyLayerPanelTree = (document: SpriteDocument, root: LayerPanelTreeItem[]): void => {
  const layerById = new Map(document.layers.map((layer) => [layer.id, layer]))
  const topToBottomLayers: string[] = []
  const visit = (items: LayerPanelTreeItem[], parentGroupId: string | null): void => {
    for (const item of items) {
      if (item.kind === 'layer') {
        const layer = layerById.get(item.id)
        if (layer) {
          layer.groupId = parentGroupId
          topToBottomLayers.push(item.id)
        }
      } else {
        const group = document.groups.find((candidate) => candidate.id === item.id)
        if (group) group.parentGroupId = parentGroupId
        visit(item.children, item.id)
      }
    }
  }
  visit(root, null)
  document.layers = [...topToBottomLayers].reverse().map((id) => layerById.get(id)).filter((layer): layer is SpriteDocument['layers'][number] => Boolean(layer))
  const layerOrder = new Map(document.layers.map((layer, index) => [layer.id, index]))
  const assignGroupOrders = (items: LayerPanelTreeItem[]): void => {
    let index = 0
    while (index < items.length) {
      if (items[index].kind === 'layer') { index += 1; continue }
      const start = index
      while (index < items.length && items[index].kind === 'group') index += 1
      const run = items.slice(start, index)
      const above = start > 0 && items[start - 1].kind === 'layer' ? layerOrder.get(items[start - 1].id) : undefined
      const below = index < items.length && items[index].kind === 'layer' ? layerOrder.get(items[index].id) : undefined
      for (let offset = 0; offset < run.length; offset += 1) {
        const group = document.groups.find((candidate) => candidate.id === run[offset].id)
        if (!group) continue
        if (above !== undefined && below !== undefined) group.panelOrder = above - ((above - below) * (offset + 1)) / (run.length + 1)
        else if (below !== undefined) group.panelOrder = below + run.length - offset
        else if (above !== undefined) group.panelOrder = above - offset - 1
        else group.panelOrder = run.length - offset - 1
      }
    }
    for (const item of items) if (item.kind === 'group') assignGroupOrders(item.children)
  }
  assignGroupOrders(root)
}

/** 一次移动混合选择中的图层与图层组，保持它们在图层栏中的相对顺序。 */
export const moveLayerPanelRows = (state: LayerOperationState, layerIds: readonly string[], groupIds: readonly string[], target: LayerPanelRowMoveTarget): HistoryEntry | null => {
  const selectedLayers = new Set(uniqueLayerIds(layerIds))
  const selectedGroups = new Set(uniqueLayerIds(groupIds))
  if (selectedLayers.size === 0 && selectedGroups.size === 0) return null
  const { document } = state
  const root = buildMutableLayerPanelTree(document)
  const moving: LayerPanelTreeItem[] = []
  const extract = (items: LayerPanelTreeItem[]): void => {
    for (let index = 0; index < items.length;) {
      const item = items[index]
      if ((item.kind === 'layer' ? selectedLayers : selectedGroups).has(item.id)) {
        moving.push(item)
        items.splice(index, 1)
        continue
      }
      if (item.kind === 'group') extract(item.children)
      index += 1
    }
  }
  extract(root)
  if (moving.length === 0) return null

  if (target.kind === 'edge') {
    if (target.edge === 'top') root.unshift(...moving)
    else if (target.edge === 'bottom') root.push(...moving)
    else return null
  } else if (target.kind === 'group' && target.id) {
    const destination = findLayerPanelContainer(root, 'group', target.id)
    if (!destination) return null
    destination.items[destination.index].children.unshift(...moving)
  } else if (target.kind === 'row' && target.id && target.rowKind && target.position) {
    const destination = findLayerPanelContainer(root, target.rowKind, target.id)
    if (!destination) return null
    destination.items.splice(destination.index + (target.position === 'below' ? 1 : 0), 0, ...moving)
  } else return null

  const beforeLayerOrder = document.layers.map((layer) => layer.id)
  const beforeLayerGroups = new Map(document.layers.map((layer) => [layer.id, layer.groupId ?? null]))
  const beforeGroupParents = new Map(document.groups.map((group) => [group.id, group.parentGroupId ?? null]))
  const beforeGroupOrders = new Map(document.groups.map((group) => [group.id, group.panelOrder]))
  const activeLayerId = document.activeLayerId
  const layerById = new Map(document.layers.map((layer) => [layer.id, layer]))
  applyLayerPanelTree(document, root)
  const afterLayerOrder = document.layers.map((layer) => layer.id)
  const afterLayerGroups = new Map(document.layers.map((layer) => [layer.id, layer.groupId ?? null]))
  const afterGroupParents = new Map(document.groups.map((group) => [group.id, group.parentGroupId ?? null]))
  const afterGroupOrders = new Map(document.groups.map((group) => [group.id, group.panelOrder]))
  const apply = (order: string[], layerGroups: ReadonlyMap<string, string | null>, groupParents: ReadonlyMap<string, string | null>, groupOrders: ReadonlyMap<string, number | undefined>): void => {
    applyLayerOrder(document, layerById, order, activeLayerId)
    applyLayerGroups(document.layers, new Map(layerGroups))
    for (const group of document.groups) {
      group.parentGroupId = groupParents.get(group.id) ?? null
      group.panelOrder = groupOrders.get(group.id)
    }
  }
  return {
    label: tr('core.layerOperations.moveLayer'),
    bytes: (beforeLayerOrder.length + afterLayerOrder.length) * 8 + document.layers.length * 16 + document.groups.length * 32,
    undo: () => apply(beforeLayerOrder, beforeLayerGroups, beforeGroupParents, beforeGroupOrders),
    redo: () => apply(afterLayerOrder, afterLayerGroups, afterGroupParents, afterGroupOrders)
  }
}

export const canMoveGroupInto = (document: SpriteDocument, groupId: string, parentGroupId: string): boolean =>
  groupId !== parentGroupId && !getDescendantGroupIds(document, groupId).includes(parentGroupId)

export const reorderLayers = (state: LayerOperationState, layerIds: readonly string[], targetLayerId: string, insertAfterTarget = true): HistoryEntry | null => {
  const ids = uniqueLayerIds(layerIds)
  if (ids.length === 0 || ids.includes(targetLayerId)) return null
  const { document } = state
  const dragged = document.layers.filter((layer) => ids.includes(layer.id))
  if (dragged.length === 0) return null
  const beforeOrder = document.layers.map((layer) => layer.id)
  const layerById = new Map(document.layers.map((layer) => [layer.id, layer]))
  document.layers = document.layers.filter((layer) => !ids.includes(layer.id))
  const targetIndex = document.layers.findIndex((layer) => layer.id === targetLayerId)
  if (targetIndex < 0) {
    document.layers = beforeOrder.map((id) => layerById.get(id)!).filter(Boolean)
    return null
  }
  document.layers.splice(targetIndex + (insertAfterTarget ? 1 : 0), 0, ...dragged)
  const selected = dragged.map((layer) => layer.id)
  const activeLayerId = selected.at(-1)!
  selectLayers(state, selected, null)
  const afterOrder = document.layers.map((layer) => layer.id)
  return {
    label: tr('core.layerOperations.reorderLayers'),
    bytes: (beforeOrder.length + afterOrder.length) * 8,
    undo: () => applyLayerOrder(document, layerById, beforeOrder, activeLayerId),
    redo: () => applyLayerOrder(document, layerById, afterOrder, activeLayerId)
  }
}

export const assignLayersToGroup = (state: LayerOperationState, layerIds: readonly string[], groupId: string, targetLayerId?: string, insertAfterTarget = true): HistoryEntry | null => {
  const ids = uniqueLayerIds(layerIds)
  const { document } = state
  const selectedLayers = document.layers.filter((layer) => ids.includes(layer.id))
  if (selectedLayers.length === 0) return null
  getGroup(document, groupId)
  const beforeOrder = document.layers.map((layer) => layer.id)
  const beforeGroupIds = new Map(selectedLayers.map((layer) => [layer.id, layer.groupId ?? null]))
  const layerById = new Map(document.layers.map((layer) => [layer.id, layer]))
  document.layers = document.layers.filter((layer) => !ids.includes(layer.id))
  const targetIndex = targetLayerId ? document.layers.findIndex((layer) => layer.id === targetLayerId && layer.groupId === groupId) : -1
  const lastMember = document.layers.reduce((last, layer, index) => layer.groupId === groupId ? index : last, -1)
  document.layers.splice(targetIndex >= 0 ? targetIndex + (insertAfterTarget ? 1 : 0) : lastMember + 1, 0, ...selectedLayers)
  const selected = selectedLayers.map((layer) => layer.id)
  for (const layer of selectedLayers) layer.groupId = groupId
  const activeLayerId = selected.at(-1)!
  selectLayers(state, selected, groupId)
  const afterOrder = document.layers.map((layer) => layer.id)
  const afterGroupIds = new Map(selectedLayers.map((layer) => [layer.id, groupId]))
  const apply = (order: string[], groupIds: Map<string, string | null>): void => {
    applyLayerOrder(document, layerById, order, activeLayerId)
    applyLayerGroups(selectedLayers, groupIds)
  }
  return { label: tr('core.layerOperations.assignGroup'), bytes: (beforeOrder.length + afterOrder.length) * 8, undo: () => apply(beforeOrder, beforeGroupIds), redo: () => apply(afterOrder, afterGroupIds) }
}

export const assignLayersToRoot = (state: LayerOperationState, layerIds: readonly string[], targetLayerId?: string, insertAfterTarget = true): HistoryEntry | null => {
  const ids = uniqueLayerIds(layerIds)
  const { document } = state
  const selectedLayers = document.layers.filter((layer) => ids.includes(layer.id))
  if (selectedLayers.length === 0) return null
  const beforeOrder = document.layers.map((layer) => layer.id)
  const beforeGroupIds = new Map(selectedLayers.map((layer) => [layer.id, layer.groupId ?? null]))
  const layerById = new Map(document.layers.map((layer) => [layer.id, layer]))
  document.layers = document.layers.filter((layer) => !ids.includes(layer.id))
  const targetIndex = targetLayerId ? document.layers.findIndex((layer) => layer.id === targetLayerId) : -1
  document.layers.splice(targetIndex >= 0 ? targetIndex + (insertAfterTarget ? 1 : 0) : 0, 0, ...selectedLayers)
  const selected = selectedLayers.map((layer) => layer.id)
  for (const layer of selectedLayers) layer.groupId = null
  const activeLayerId = selected.at(-1)!
  selectLayers(state, selected, null)
  const afterOrder = document.layers.map((layer) => layer.id)
  const rootGroupIds = new Map(selectedLayers.map((layer) => [layer.id, null]))
  const apply = (order: string[], groupIds: Map<string, string | null>): void => {
    applyLayerOrder(document, layerById, order, activeLayerId)
    applyLayerGroups(selectedLayers, groupIds)
  }
  return { label: tr('core.layerOperations.assignRoot'), bytes: (beforeOrder.length + afterOrder.length) * 8 + selectedLayers.length * 16, undo: () => apply(beforeOrder, beforeGroupIds), redo: () => apply(afterOrder, rootGroupIds) }
}

export const assignLayersAboveGroup = (state: LayerOperationState, layerIds: readonly string[], groupId: string): HistoryEntry | null => {
  const ids = uniqueLayerIds(layerIds)
  const { document } = state
  const selectedLayers = document.layers.filter((layer) => ids.includes(layer.id))
  if (selectedLayers.length === 0) return null
  const group = getGroup(document, groupId)
  const containerGroupIds = new Set([groupId, ...getDescendantGroupIds(document, groupId)])
  const beforeOrder = document.layers.map((layer) => layer.id)
  const beforeGroupIds = new Map(selectedLayers.map((layer) => [layer.id, layer.groupId ?? null]))
  const layerById = new Map(document.layers.map((layer) => [layer.id, layer]))
  const originalIndex = new Map(document.layers.map((layer, index) => [layer.id, index]))
  const groupTopIndex = document.layers.reduce((top, layer, index) => layer.groupId && containerGroupIds.has(layer.groupId) ? Math.max(top, index) : top, -1)
  document.layers = document.layers.filter((layer) => !ids.includes(layer.id))
  const insertionIndex = groupTopIndex < 0 ? 0 : document.layers.reduce((count, layer) => (originalIndex.get(layer.id) ?? Number.POSITIVE_INFINITY) <= groupTopIndex ? count + 1 : count, 0)
  document.layers.splice(insertionIndex, 0, ...selectedLayers)
  const selected = selectedLayers.map((layer) => layer.id)
  const parentGroupId = group.parentGroupId ?? null
  for (const layer of selectedLayers) layer.groupId = parentGroupId
  const activeLayerId = selected.at(-1)!
  selectLayers(state, selected, null)
  const afterOrder = document.layers.map((layer) => layer.id)
  const afterGroupIds = new Map(selectedLayers.map((layer) => [layer.id, parentGroupId]))
  const apply = (order: string[], groupIds: Map<string, string | null>): void => {
    applyLayerOrder(document, layerById, order, activeLayerId)
    applyLayerGroups(selectedLayers, groupIds)
  }
  return { label: tr('core.layerOperations.aboveGroup'), bytes: (beforeOrder.length + afterOrder.length) * 8 + selectedLayers.length * 16, undo: () => apply(beforeOrder, beforeGroupIds), redo: () => apply(afterOrder, afterGroupIds) }
}

export const reorderGroup = (state: LayerOperationState, groupId: string, targetGroupId: string, insertAfterTarget = true): HistoryEntry | null => {
  if (!canMoveGroupInto(state.document, groupId, targetGroupId)) return null
  const { document } = state
  const group = getGroup(document, groupId)
  const target = getGroup(document, targetGroupId)
  const movingGroupIds = new Set([groupId, ...getDescendantGroupIds(document, groupId)])
  const targetGroupIds = new Set([targetGroupId, ...getDescendantGroupIds(document, targetGroupId)])
  const movingLayers = document.layers.filter((layer) => layer.groupId && movingGroupIds.has(layer.groupId))
  const movingLayerIds = new Set(movingLayers.map((layer) => layer.id))
  const beforeLayerOrder = document.layers.map((layer) => layer.id)
  const beforeGroupOrder = document.groups.map((item) => item.id)
  const beforeParent = group.parentGroupId ?? null
  const beforePanelOrder = group.panelOrder
  const activeLayerId = document.activeLayerId
  const layerById = new Map(document.layers.map((layer) => [layer.id, layer]))
  const groupById = new Map(document.groups.map((item) => [item.id, item]))
  const remainingLayers = document.layers.filter((layer) => !movingLayerIds.has(layer.id))
  const targetLayerIndexes = remainingLayers.flatMap((layer, index) => layer.groupId && targetGroupIds.has(layer.groupId) ? [index] : [])
  if (movingLayers.length > 0 && targetLayerIndexes.length > 0) {
    remainingLayers.splice(insertAfterTarget ? Math.max(...targetLayerIndexes) + 1 : Math.min(...targetLayerIndexes), 0, ...movingLayers)
    document.layers = remainingLayers
  }
  const remainingGroups = document.groups.filter((item) => item.id !== groupId)
  const targetIndex = remainingGroups.findIndex((item) => item.id === targetGroupId)
  if (targetIndex < 0) return null
  remainingGroups.splice(targetIndex + (insertAfterTarget ? 1 : 0), 0, group)
  document.groups = remainingGroups
  group.parentGroupId = target.parentGroupId ?? null
  group.panelOrder = groupPanelAnchor(document, targetGroupId) + (insertAfterTarget ? 0.25 : -0.25)
  const selected = getLayerIdsInGroup(document, group.id)
  state.selectedGroupId = group.id
  state.selectedGroupIds = [group.id]
  state.selectedLayerIds = selected
  const afterLayerOrder = document.layers.map((layer) => layer.id)
  const afterGroupOrder = document.groups.map((item) => item.id)
  const afterParent = group.parentGroupId ?? null
  const afterPanelOrder = group.panelOrder
  const apply = (layerOrder: string[], groupOrder: string[], parentGroupId: string | null, panelOrder: number | undefined): void => {
    applyLayerOrder(document, layerById, layerOrder, activeLayerId)
    document.groups = groupOrder.map((id) => groupById.get(id)).filter((item): item is SpriteDocument['groups'][number] => Boolean(item))
    applyGroupPlacement(group, parentGroupId, panelOrder)
  }
  return { label: tr('core.layerOperations.moveGroup'), bytes: (beforeLayerOrder.length + afterLayerOrder.length + beforeGroupOrder.length + afterGroupOrder.length) * 8 + 56, undo: () => apply(beforeLayerOrder, beforeGroupOrder, beforeParent, beforePanelOrder), redo: () => apply(afterLayerOrder, afterGroupOrder, afterParent, afterPanelOrder) }
}

export const positionGroupNextToLayer = (state: LayerOperationState, groupId: string, targetLayerId: string, insertAfterTarget = true): HistoryEntry | null => {
  const { document } = state
  const group = getGroup(document, groupId)
  const target = document.layers.find((layer) => layer.id === targetLayerId)
  if (!target) return null
  const parentGroupId = target.groupId ?? null
  if (parentGroupId && !canMoveGroupInto(document, groupId, parentGroupId)) return null
  const beforeParent = group.parentGroupId ?? null
  const beforePanelOrder = group.panelOrder
  const targetIndex = document.layers.findIndex((layer) => layer.id === targetLayerId)
  const afterPanelOrder = targetIndex + (insertAfterTarget ? 0.25 : -0.25)
  if (beforeParent === parentGroupId && beforePanelOrder === afterPanelOrder) return null
  applyGroupPlacement(group, parentGroupId, afterPanelOrder)
  state.selectedGroupId = group.id
  state.selectedGroupIds = [group.id]
  state.selectedLayerIds = getLayerIdsInGroup(document, group.id)
  return {
    label: tr('core.layerOperations.moveGroup'),
    bytes: 56,
    undo: () => applyGroupPlacement(group, beforeParent, beforePanelOrder),
    redo: () => applyGroupPlacement(group, parentGroupId, afterPanelOrder)
  }
}

export const assignGroupToGroup = (state: LayerOperationState, groupId: string, parentGroupId: string): HistoryEntry | null => {
  if (!canMoveGroupInto(state.document, groupId, parentGroupId)) return null
  const group = getGroup(state.document, groupId)
  getGroup(state.document, parentGroupId)
  const before = group.parentGroupId ?? null
  if (before === parentGroupId) return null
  group.parentGroupId = parentGroupId
  state.selectedGroupId = group.id
  state.selectedGroupIds = [group.id]
  state.selectedLayerIds = getLayerIdsInGroup(state.document, group.id)
  return { label: tr('core.layerOperations.moveGroup'), bytes: 48, undo: () => { group.parentGroupId = before }, redo: () => { group.parentGroupId = parentGroupId } }
}

export const assignGroupToRoot = (state: LayerOperationState, groupId: string): HistoryEntry | null => {
  const group = getGroup(state.document, groupId)
  const before = group.parentGroupId ?? null
  if (!before) return null
  group.parentGroupId = null
  state.selectedGroupId = group.id
  state.selectedGroupIds = [group.id]
  state.selectedLayerIds = getLayerIdsInGroup(state.document, group.id)
  return { label: tr('core.layerOperations.assignRoot'), bytes: 48, undo: () => { group.parentGroupId = before }, redo: () => { group.parentGroupId = null } }
}

export const moveLayersToRootEdge = (state: LayerOperationState, layerIds: readonly string[], edge: 'top' | 'bottom'): HistoryEntry | null => {
  const ids = uniqueLayerIds(layerIds)
  const { document } = state
  const moving = document.layers.filter((layer) => ids.includes(layer.id))
  if (moving.length === 0) return null
  const beforeOrder = document.layers.map((layer) => layer.id)
  const beforeGroupIds = new Map(moving.map((layer) => [layer.id, layer.groupId ?? null]))
  const beforePanelOrders = new Map(document.groups.map((group) => [group.id, group.panelOrder]))
  const beforeRootOrder = rootPanelNodes(document)
  const layerById = new Map(document.layers.map((layer) => [layer.id, layer]))
  const remaining = document.layers.filter((layer) => !ids.includes(layer.id))
  document.layers = edge === 'top' ? [...remaining, ...moving] : [...moving, ...remaining]
  for (const layer of moving) layer.groupId = null
  const movedIds = new Set(moving.map((layer) => layer.id))
  const remainingRootOrder = beforeRootOrder.filter((node) => node.kind !== 'layer' || !movedIds.has(node.id))
  const movingRootOrder: LayerPanelNode[] = [...moving].reverse().map((layer) => ({ kind: 'layer', id: layer.id, depth: 0 }))
  rebaseRootGroupPanelOrders(document, edge === 'top' ? [...movingRootOrder, ...remainingRootOrder] : [...remainingRootOrder, ...movingRootOrder])
  const selected = moving.map((layer) => layer.id)
  const activeLayerId = selected.at(-1)!
  selectLayers(state, selected, null)
  const afterOrder = document.layers.map((layer) => layer.id)
  const rootIds = new Map(moving.map((layer) => [layer.id, null]))
  const afterPanelOrders = new Map(document.groups.map((group) => [group.id, group.panelOrder]))
  const apply = (order: string[], groupIds: Map<string, string | null>, panelOrders: ReadonlyMap<string, number | undefined>): void => {
    applyLayerOrder(document, layerById, order, activeLayerId)
    applyLayerGroups(moving, groupIds)
    applyGroupPanelOrders(document.groups, panelOrders)
  }
  return { label: tr('core.layerOperations.moveLayer'), bytes: (beforeOrder.length + afterOrder.length) * 8 + moving.length * 16 + document.groups.length * 16, undo: () => apply(beforeOrder, beforeGroupIds, beforePanelOrders), redo: () => apply(afterOrder, rootIds, afterPanelOrders) }
}

export const moveGroupToRootEdge = (state: LayerOperationState, groupId: string, edge: 'top' | 'bottom'): HistoryEntry | null => {
  const { document } = state
  const group = getGroup(document, groupId)
  const movingGroupIds = new Set([groupId, ...getDescendantGroupIds(document, groupId)])
  const movingLayerIds = new Set(document.layers.filter((layer) => layer.groupId && movingGroupIds.has(layer.groupId)).map((layer) => layer.id))
  const beforeLayerOrder = document.layers.map((layer) => layer.id)
  const beforeGroupOrder = document.groups.map((item) => item.id)
  const beforeParent = group.parentGroupId ?? null
  const beforePanelOrder = group.panelOrder
  const activeLayerId = document.activeLayerId
  const layerById = new Map(document.layers.map((layer) => [layer.id, layer]))
  const groupById = new Map(document.groups.map((item) => [item.id, item]))
  const movingLayers = document.layers.filter((layer) => movingLayerIds.has(layer.id))
  const remainingLayers = document.layers.filter((layer) => !movingLayerIds.has(layer.id))
  document.layers = edge === 'top' ? [...remainingLayers, ...movingLayers] : [...movingLayers, ...remainingLayers]
  const orderedGroups = document.groups.filter((item) => item.id !== groupId)
  if (edge === 'top') orderedGroups.push(group)
  else orderedGroups.unshift(group)
  document.groups = orderedGroups
  group.parentGroupId = null
  group.panelOrder = edge === 'top' ? document.layers.length + document.groups.length + 1 : -document.groups.length - 1
  state.selectedGroupId = group.id
  state.selectedGroupIds = [group.id]
  state.selectedLayerIds = getLayerIdsInGroup(document, group.id)
  const afterLayerOrder = document.layers.map((layer) => layer.id)
  const afterGroupOrder = document.groups.map((item) => item.id)
  const afterPanelOrder = group.panelOrder
  const apply = (layerOrder: string[], groupOrder: string[], parentGroupId: string | null, panelOrder: number | undefined): void => {
    applyLayerOrder(document, layerById, layerOrder, activeLayerId)
    applyGroupOrder(document, groupById, groupOrder)
    applyGroupPlacement(group, parentGroupId, panelOrder)
  }
  return { label: tr('core.layerOperations.moveGroup'), bytes: (beforeLayerOrder.length + afterLayerOrder.length + beforeGroupOrder.length + afterGroupOrder.length) * 8 + 56, undo: () => apply(beforeLayerOrder, beforeGroupOrder, beforeParent, beforePanelOrder), redo: () => apply(afterLayerOrder, afterGroupOrder, null, afterPanelOrder) }
}

export const createLayerGroup = (state: LayerOperationState, id: string, name: string): HistoryEntry | null => {
  const { document } = state
  if (document.groups.some((group) => group.id === id)) return null
  // Keep explicit layer multi-selection even if the UI still has an active
  // group context. Only the pure group-selection case should suppress layers.
  const selected = document.layers.filter((layer) => state.selectedLayerIds.includes(layer.id))
  const layers = selected
  const groupOnly = Boolean(state.selectedGroupId && layers.length === 0)
  const selectedGroupParent = groupOnly ? getGroup(document, state.selectedGroupId!).parentGroupId ?? null : null
  const commonParent = groupOnly ? selectedGroupParent : (layers.length > 0 && layers.every((layer) => (layer.groupId ?? null) === (layers[0].groupId ?? null)) ? layers[0].groupId ?? null : null)
  const highestSelectedIndex = layers.reduce((highest, layer) => Math.max(highest, document.layers.indexOf(layer)), -1)
  const group: LayerGroup = { id, name, description: '', parentGroupId: commonParent, panelOrder: document.layers.length + document.groups.length + 1, visible: true, locked: false, opacity: 1, blendMode: 'normal' }
  const beforeGroupIds = new Map(layers.map((layer) => [layer.id, layer.groupId ?? null]))
  const beforeLayerOrder = document.layers.map((layer) => layer.id)
  document.groups.push(group)
  for (const layer of layers) layer.groupId = group.id
  if (layers.length > 0) {
    const selectedIds = new Set(layers.map((layer) => layer.id))
    const remaining = document.layers.filter((layer) => !selectedIds.has(layer.id))
    const insertionIndex = document.layers.slice(0, highestSelectedIndex).filter((layer) => !selectedIds.has(layer.id)).length
    document.layers = [...remaining.slice(0, insertionIndex), ...layers, ...remaining.slice(insertionIndex)]
    group.panelOrder = insertionIndex + layers.length - 1
  }
  const afterLayerOrder = document.layers.map((layer) => layer.id)
  const layerById = new Map(document.layers.map((layer) => [layer.id, layer]))
  state.selectedGroupId = group.id
  state.selectedGroupIds = [group.id]
  state.selectedLayerIds = layers.map((layer) => layer.id)
  const applyCreate = (): void => {
    if (!document.groups.includes(group)) document.groups.push(group)
    for (const layer of layers) layer.groupId = group.id
    applyLayerOrder(document, layerById, afterLayerOrder, document.activeLayerId)
    state.selectedGroupId = group.id
    state.selectedGroupIds = [group.id]
  }
  return {
    label: tr('core.layerOperations.newGroup'),
    bytes: 96 + layers.length * 16,
    undo: () => {
      document.groups = document.groups.filter((item) => item.id !== group.id)
      applyLayerGroups(layers, beforeGroupIds)
      applyLayerOrder(document, layerById, beforeLayerOrder, document.activeLayerId)
      state.selectedGroupId = commonParent
      state.selectedGroupIds = commonParent ? [commonParent] : []
    },
    redo: applyCreate
  }
}

export const ungroupSelected = (state: LayerOperationState): HistoryEntry | null => {
  const { document } = state
  const groupIds = new Set<string>()
  if (state.selectedGroupId) groupIds.add(state.selectedGroupId)
  else for (const layer of document.layers) if (state.selectedLayerIds.includes(layer.id) && layer.groupId) groupIds.add(layer.groupId)
  if (groupIds.size === 0) return null
  const removedGroups = document.groups.filter((group) => groupIds.has(group.id))
  const removedById = new Map(removedGroups.map((group) => [group.id, group]))
  const beforeGroups = [...document.groups]
  const beforeLayerGroupIds = new Map(document.layers.map((layer) => [layer.id, layer.groupId ?? null]))
  const beforeParentGroupIds = new Map(document.groups.map((group) => [group.id, group.parentGroupId ?? null]))
  const survivingParent = (groupId: string): string | null => {
    let parentId = removedById.get(groupId)?.parentGroupId ?? null
    const visited = new Set<string>()
    while (parentId && groupIds.has(parentId) && !visited.has(parentId)) {
      visited.add(parentId)
      parentId = removedById.get(parentId)?.parentGroupId ?? null
    }
    return parentId
  }
  const applyUngroup = (): void => {
    for (const layer of document.layers) if (layer.groupId && groupIds.has(layer.groupId)) layer.groupId = survivingParent(layer.groupId)
    for (const group of document.groups) if (group.parentGroupId && groupIds.has(group.parentGroupId)) group.parentGroupId = survivingParent(group.parentGroupId)
    document.groups = document.groups.filter((group) => !groupIds.has(group.id))
  }
  applyUngroup()
  state.selectedGroupId = null
  state.selectedGroupIds = []
  state.selectedLayerIds = document.layers.filter((layer) => {
    const originalGroupId = beforeLayerGroupIds.get(layer.id)
    return Boolean(originalGroupId && groupIds.has(originalGroupId))
  }).map((layer) => layer.id)
  if (state.collapsedGroupIds) state.collapsedGroupIds = state.collapsedGroupIds.filter((id) => !groupIds.has(id))
  return {
    label: tr('core.layerOperations.ungroup'),
    bytes: 96 + document.layers.length * 20 + document.groups.length * 16,
    undo: () => {
      document.groups = [...beforeGroups]
      applyLayerGroups(document.layers, beforeLayerGroupIds)
      for (const group of document.groups) group.parentGroupId = beforeParentGroupIds.get(group.id) ?? null
    },
    redo: applyUngroup
  }
}
