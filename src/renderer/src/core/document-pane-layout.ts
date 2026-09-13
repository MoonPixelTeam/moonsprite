export type DocumentPaneDirection = 'left' | 'right' | 'top' | 'bottom'
export type DocumentPaneOrientation = 'horizontal' | 'vertical'

export interface DocumentPanePlacement {
  documentId: string
  targetPaneId: string
  direction: DocumentPaneDirection
  previewPaneId?: string
}

export interface DocumentPaneLeaf {
  kind: 'leaf'
  id: string
  documentId: string
}

export interface DocumentPaneSplit {
  kind: 'split'
  id: string
  orientation: DocumentPaneOrientation
  ratio: number
  first: DocumentPaneNode
  second: DocumentPaneNode
}

export type DocumentPaneNode = DocumentPaneLeaf | DocumentPaneSplit
export interface DetachedDocumentPaneWorkspace {
  layout: DocumentPaneNode | null
  paneOnlyDocumentIds: string[]
  workspaceDocumentId: string | null
}
export interface DocumentPaneRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}
export interface DocumentPanePointerPoint {
  x: number
  y: number
}

const MIN_RATIO = 0.1
const MAX_RATIO = 0.9
const DOCKED_PANE_SHARE = 1 / 3

export const clampDocumentPaneRatio = (ratio: number): number => Math.max(MIN_RATIO, Math.min(MAX_RATIO, Number.isFinite(ratio) ? ratio : 0.5))

export const createDocumentPaneLayout = (documentId: string): DocumentPaneLeaf => ({ kind: 'leaf', id: documentId, documentId })

export const documentPaneContains = (node: DocumentPaneNode, documentId: string): boolean =>
  node.kind === 'leaf' ? node.documentId === documentId : documentPaneContains(node.first, documentId) || documentPaneContains(node.second, documentId)

export const documentPaneLeafIds = (node: DocumentPaneNode): string[] =>
  node.kind === 'leaf' ? [node.id] : [...documentPaneLeafIds(node.first), ...documentPaneLeafIds(node.second)]

export const documentPaneDropDirection = (rect: DocumentPaneRect, clientX: number, clientY: number): DocumentPaneDirection => {
  const relativeX = (clientX - rect.left) / Math.max(1, rect.width)
  const relativeY = (clientY - rect.top) / Math.max(1, rect.height)
  if (relativeX <= 0.25) return 'left'
  if (relativeX >= 0.75) return 'right'
  if (relativeY <= 0.25) return 'top'
  if (relativeY >= 0.75) return 'bottom'
  const halfWidth = Math.max(1, rect.width / 2)
  const halfHeight = Math.max(1, rect.height / 2)
  const horizontal = (clientX - (rect.left + halfWidth)) / halfWidth
  const vertical = (clientY - (rect.top + halfHeight)) / halfHeight
  if (Math.abs(horizontal) >= Math.abs(vertical)) return horizontal < 0 ? 'left' : 'right'
  return vertical < 0 ? 'top' : 'bottom'
}

const pointInsideRect = (point: DocumentPanePointerPoint, rect: DocumentPaneRect): boolean =>
  point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom

export const documentPaneDockDirection = (rect: DocumentPaneRect, clientX: number, clientY: number): DocumentPaneDirection | null => {
  if (!pointInsideRect({ x: clientX, y: clientY }, rect)) return null
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const normalizedX = (clientX - centerX) / Math.max(1, rect.width / 2)
  const normalizedY = (clientY - centerY) / Math.max(1, rect.height / 2)
  if (Math.abs(normalizedX) > Math.abs(normalizedY)) return normalizedX < 0 ? 'left' : 'right'
  return normalizedY <= 0 ? 'top' : 'bottom'
}

const segmentEntryTime = (from: DocumentPanePointerPoint, to: DocumentPanePointerPoint, rect: DocumentPaneRect): number | null => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  let entry = 0
  let exit = 1
  const axes = [[-dx, from.x - rect.left], [dx, rect.right - from.x], [-dy, from.y - rect.top], [dy, rect.bottom - from.y]] as const
  for (const [coefficient, distance] of axes) {
    if (coefficient === 0) {
      if (distance < 0) return null
      continue
    }
    const time = distance / coefficient
    if (coefficient > 0) exit = Math.min(exit, time)
    else entry = Math.max(entry, time)
    if (entry > exit) return null
  }
  return entry >= 0 && entry <= 1 ? entry : null
}

export const documentPaneDockDirectionAlongPath = (rect: DocumentPaneRect, from: DocumentPanePointerPoint, to: DocumentPanePointerPoint): DocumentPaneDirection | null => {
  const endpointDirection = documentPaneDockDirection(rect, to.x, to.y)
  if (endpointDirection) return endpointDirection
  const entryTime = segmentEntryTime(from, to, rect)
  if (entryTime === null) return null
  const sampleTime = Math.min(1, entryTime + 0.000001)
  return documentPaneDockDirection(
    rect,
    from.x + (to.x - from.x) * sampleTime,
    from.y + (to.y - from.y) * sampleTime
  )
}

export const documentPaneDockDirectionAlongInnerPath = documentPaneDockDirectionAlongPath

export const documentPaneDropRect = (rect: DocumentPaneRect, direction: DocumentPaneDirection): DocumentPaneRect => {
  if (direction === 'left') return { ...rect, right: rect.left + rect.width / 2, width: rect.width / 2 }
  if (direction === 'right') return { ...rect, left: rect.left + rect.width / 2, width: rect.width / 2 }
  if (direction === 'top') return { ...rect, bottom: rect.top + rect.height / 2, height: rect.height / 2 }
  return { ...rect, top: rect.top + rect.height / 2, height: rect.height / 2 }
}

export const insertDocumentPane = (node: DocumentPaneNode, targetPaneId: string, documentId: string, direction: DocumentPaneDirection): DocumentPaneNode => {
  if (documentPaneContains(node, documentId)) return node
  if (node.kind === 'leaf') {
    if (node.id !== targetPaneId) return node
    const newPane = createDocumentPaneLayout(documentId)
    const horizontal = direction === 'left' || direction === 'right'
    const newFirst = direction === 'left' || direction === 'top'
    return {
      kind: 'split',
      id: `split:${node.id}:${documentId}:${direction}`,
      orientation: horizontal ? 'horizontal' : 'vertical',
      ratio: newFirst ? DOCKED_PANE_SHARE : 1 - DOCKED_PANE_SHARE,
      first: newFirst ? newPane : node,
      second: newFirst ? node : newPane
    }
  }
  const first = insertDocumentPane(node.first, targetPaneId, documentId, direction)
  if (first !== node.first) return { ...node, first }
  const second = insertDocumentPane(node.second, targetPaneId, documentId, direction)
  if (second !== node.second) return { ...node, second }
  return node
}

export const resizeDocumentPane = (node: DocumentPaneNode, splitId: string, ratio: number): DocumentPaneNode => {
  if (node.kind === 'leaf') return node
  if (node.id === splitId) return { ...node, ratio: clampDocumentPaneRatio(ratio) }
  const first = resizeDocumentPane(node.first, splitId, ratio)
  const second = resizeDocumentPane(node.second, splitId, ratio)
  if (first === node.first && second === node.second) return node
  return { ...node, first, second }
}

export const removeDocumentPane = (node: DocumentPaneNode, documentId: string): DocumentPaneNode | null => {
  if (node.kind === 'leaf') return node.documentId === documentId ? null : node
  const first = removeDocumentPane(node.first, documentId)
  const second = removeDocumentPane(node.second, documentId)
  if (!first) return second
  if (!second) return first
  if (first === node.first && second === node.second) return node
  return { ...node, first, second }
}

export const detachDocumentPaneWorkspace = (
  layout: DocumentPaneNode | null,
  documentId: string,
  workspaceDocumentId: string | null,
  paneOnlyDocumentIds: readonly string[],
  availableDocumentIds: readonly string[]
): DetachedDocumentPaneWorkspace => {
  const available = new Set(availableDocumentIds)
  const wasInLayout = Boolean(layout && documentPaneContains(layout, documentId))
  const remaining = wasInLayout && layout ? removeDocumentPane(layout, documentId) : layout
  const nextLayout = remaining?.kind === 'split' ? remaining : null
  let nextPaneOnlyDocumentIds = paneOnlyDocumentIds.filter((id) => id !== documentId && available.has(id))

  if (wasInLayout && remaining?.kind === 'leaf') {
    nextPaneOnlyDocumentIds = nextPaneOnlyDocumentIds.filter((id) => id !== remaining.documentId)
  }

  let nextWorkspaceDocumentId = workspaceDocumentId && available.has(workspaceDocumentId)
    ? workspaceDocumentId
    : null
  if (!nextWorkspaceDocumentId && wasInLayout && remaining) {
    const promotedId = remaining.kind === 'leaf'
      ? remaining.documentId
      : documentPaneLeafIds(remaining).find((id) => available.has(id)) ?? null
    if (promotedId) {
      nextWorkspaceDocumentId = promotedId
      nextPaneOnlyDocumentIds = nextPaneOnlyDocumentIds.filter((id) => id !== promotedId)
    }
  }
  if (!nextWorkspaceDocumentId) {
    nextWorkspaceDocumentId = availableDocumentIds.find((id) => !nextPaneOnlyDocumentIds.includes(id)) ?? null
  }

  return {
    layout: nextLayout,
    paneOnlyDocumentIds: nextPaneOnlyDocumentIds,
    workspaceDocumentId: nextWorkspaceDocumentId
  }
}

export const moveDocumentPane = (node: DocumentPaneNode, documentId: string, targetPaneId: string, direction: DocumentPaneDirection): DocumentPaneNode => {
  if (documentId === targetPaneId || !documentPaneContains(node, documentId) || !documentPaneContains(node, targetPaneId)) return node
  const remaining = removeDocumentPane(node, documentId)
  if (!remaining) return node
  return insertDocumentPane(remaining, targetPaneId, documentId, direction)
}

const replaceDocumentPane = (node: DocumentPaneNode, paneId: string, documentId: string): DocumentPaneNode => {
  if (node.kind === 'leaf') return node.id === paneId ? createDocumentPaneLayout(documentId) : node
  const first = replaceDocumentPane(node.first, paneId, documentId)
  const second = replaceDocumentPane(node.second, paneId, documentId)
  if (first === node.first && second === node.second) return node
  return { ...node, first, second }
}

export const replaceDocumentPaneDocument = (node: DocumentPaneNode, documentId: string, replacementDocumentId: string): DocumentPaneNode => {
  if (node.kind === 'leaf') return node.documentId === documentId ? createDocumentPaneLayout(replacementDocumentId) : node
  const first = replaceDocumentPaneDocument(node.first, documentId, replacementDocumentId)
  const second = replaceDocumentPaneDocument(node.second, documentId, replacementDocumentId)
  if (first === node.first && second === node.second) return node
  return { ...node, first, second }
}

export const splitDocumentPaneFromTab = (node: DocumentPaneNode | null, activeDocumentId: string, placement: DocumentPanePlacement): DocumentPaneNode => {
  const committed = node?.kind === 'split' && documentPaneContains(node, activeDocumentId) ? node : null
  const base = committed ?? createDocumentPaneLayout(activeDocumentId)
  if (!documentPaneContains(base, placement.documentId)) {
    return insertDocumentPane(base, placement.targetPaneId, placement.documentId, placement.direction)
  }
  if (documentPaneContains(base, placement.targetPaneId)) {
    return moveDocumentPane(base, placement.documentId, placement.targetPaneId, placement.direction)
  }
  if (!placement.previewPaneId || !documentPaneContains(base, placement.previewPaneId)) return base
  const replacement = replaceDocumentPane(base, placement.previewPaneId, placement.targetPaneId)
  return insertDocumentPane(replacement, placement.targetPaneId, placement.documentId, placement.direction)
}

export const resolveDocumentPanePreviewLayout = (node: DocumentPaneNode | null, activeDocumentId: string, placement: DocumentPanePlacement | null): DocumentPaneNode | null => {
  const committed = node?.kind === 'split' && documentPaneContains(node, activeDocumentId) ? node : null
  if (!placement) return committed
  return splitDocumentPaneFromTab(node, activeDocumentId, placement)
}
