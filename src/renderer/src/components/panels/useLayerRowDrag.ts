import type { LayerGroup, RasterLayer } from '@shared/types-layer'
import { selectedRowsForDrag } from './layer-panel-selection'
import { useEffect, useRef, useState } from 'react'
import { getDescendantGroupIds } from '@/core/document-model'
import { resolveLayerPanelDropTarget, resolveLayerPanelEdgeDropTarget, type LayerPanelNode } from '@/core/layer-panel-layout'
import { useWorkspace, type LayerPropertyTarget } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'

type LayerFormTarget = LayerPropertyTarget
interface LayerDragState { ids: string[]; groupIds: string[]; groupId?: string; row: LayerFormTarget; preserveSelection: boolean; selectOnClick: boolean; selectedLayerIds: string[]; selectedGroupIds: string[]; wholeGroupSelection: boolean; startX: number; startY: number; moved: boolean; copy: boolean }

type DropTarget = { kind: 'layer'; id: string; insertAfter?: boolean; depth: number } | { kind: 'group'; id: string; depth: number } | { kind: 'above-group'; id: string; insertAfter?: boolean; depth: number } | { kind: 'edge'; edge: 'top' | 'bottom'; offset?: number }

interface LayerDragGhost { y: number; items?: Array<{ id: string; kind: 'layer' | 'group'; name: string }>; name?: string; count: number }
interface Options {
  documentId: string
  listRef: React.RefObject<HTMLDivElement | null>
  readRows(): Array<LayerPanelNode & ({kind: 'group'; group: LayerGroup} | {kind: 'layer'; layer: RasterLayer})>
  onClickSelectedRow(): void
}

/** Owns drag snapshots, ghost/drop state, coalesced input and automatic scrolling. */
export function useLayerRowDrag(options: Options) {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const {t} = useI18n()
  const store = useWorkspace.getState()
  const session = store.sessions.find(item => item.document.id === options.documentId)!
  const layerListRef = options.listRef
  const dragRef = useRef<LayerDragState | null>(null)

  const layerDragFrameRef = useRef<number | null>(null)

  const layerDragAutoScrollFrameRef = useRef<number | null>(null)

  const layerDragPointerRef = useRef<{ clientX: number; clientY: number; altKey: boolean } | null>(null)

  const pendingLayerDragRef = useRef<{ clientX: number; clientY: number; altKey: boolean } | null>(null)

  const [draggingIds, setDraggingIds] = useState<string[]>([])

  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null)

  const [draggingCopy, setDraggingCopy] = useState(false)

  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  const dropTargetRef = useRef<DropTarget | null>(null)

  const [dragGhost, setDragGhost] = useState<LayerDragGhost | null>(null)

  const clearTransientLayerDrag = (): void => {
    stopLayerDragAutoScroll()
    layerDragPointerRef.current = null
    pendingLayerDragRef.current = null
    if (layerDragFrameRef.current !== null) window.cancelAnimationFrame(layerDragFrameRef.current)
    layerDragFrameRef.current = null
    dragRef.current = null
    setDraggingIds([])
    setDraggingGroupId(null)
    setDraggingCopy(false)
    dropTargetRef.current = null
    setDropTarget(null)
    setDragGhost(null)
  }

  const resolveDropTarget = (clientX: number, clientY: number, draggedIds: string[], draggedGroupIds: string[], copying = false): DropTarget | null => {
    const nodes = optionsRef.current.readRows()
    const list = layerListRef.current
    const listBounds = list?.getBoundingClientRect()
    if (!list || !listBounds) return null
    if (clientX < listBounds.left || clientX > listBounds.right) return null
    const allRows = [...list.querySelectorAll<HTMLElement>('[data-layer-id], [data-group-id]')]
    const measuredRows = allRows.map((row) => ({ row, bounds: row.getBoundingClientRect() })).filter(({ bounds }) => bounds.height > 0).sort((left, right) => left.bounds.top - right.bounds.top)
    const firstVisibleBounds = measuredRows[0]?.bounds
    const lastVisibleBounds = measuredRows.at(-1)?.bounds
    if (firstVisibleBounds && clientY <= firstVisibleBounds.top) return { kind: 'edge', edge: 'top' }
    if (lastVisibleBounds && clientY >= lastVisibleBounds.bottom) return { kind: 'edge', edge: 'bottom' }
    const element = allRows
      .find((row) => {
        const bounds = row.getBoundingClientRect()
        return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom
      })
    const layerId = element?.dataset.layerId
    const groupId = element?.dataset.groupId
    if (element && (layerId || groupId)) {
      const elementBounds = element.getBoundingClientRect()
      if (groupId) {
        const group = session.document.groups.find((candidate) => candidate.id === groupId)
        const nodeIndex = nodes.findIndex((node) => node.kind === 'group' && node.id === groupId)
        const hasFollowingRootNode = nodes.slice(nodeIndex + 1).some((node) => node.depth === 0)
        const draggedFromTarget = draggedIds.some((id) => session.document.layers.find((layer) => layer.id === id)?.groupId === groupId)
          || draggedGroupIds.some((id) => {
            const draggedGroup = session.document.groups.find((candidate) => candidate.id === id)
            return id === groupId || draggedGroup?.parentGroupId === groupId
          })
        const lowerEdge = Math.min(8, (elementBounds.bottom - elementBounds.top) * 0.2)
        if (!group?.parentGroupId && !hasFollowingRootNode && !draggedFromTarget && clientY >= elementBounds.bottom - lowerEdge) return { kind: 'edge', edge: 'bottom' }
      }
      const hit = {
        kind: layerId ? 'layer' as const : 'group' as const,
        id: (layerId ?? groupId)!,
        top: elementBounds.top,
        bottom: elementBounds.bottom,
        pointerY: clientY
      }
      const draggedGroupId = draggedGroupIds.length === 1 && draggedIds.length === 0 ? draggedGroupIds[0] : undefined
      const target = resolveLayerPanelDropTarget({ layers: session.document.layers, groups: session.document.groups, nodes, hit, draggedLayerIds: draggedIds, draggedGroupId, copying })
      if (target) return target
    }
    const edgeTarget = resolveLayerPanelEdgeDropTarget(clientY, listBounds.top, listBounds.bottom)
    if (edgeTarget) return edgeTarget
    const rows = allRows.filter((row) => !draggedIds.includes(row.dataset.layerId ?? '') && !draggedGroupIds.includes(row.dataset.groupId ?? ''))
    if (rows.length === 0) return null
    const first = rows[0].getBoundingClientRect()
    const last = rows.at(-1)!.getBoundingClientRect()
    if (clientY <= first.top) {
      return { kind: 'edge', edge: 'top' }
    }
    if (clientY >= last.bottom) return { kind: 'edge', edge: 'bottom' }
    return null
  }

  const dropTargetBlockedByGroups = (target: DropTarget, groupIds: readonly string[]): boolean => {
    if (groupIds.length === 0 || target.kind === 'edge') return false
    const blockedTargets = new Set(groupIds.flatMap((id) => [id, ...getDescendantGroupIds(session.document, id)]))
    if (target.kind === 'group' || target.kind === 'above-group') return blockedTargets.has(target.id)
    const targetLayer = session.document.layers.find((layer) => layer.id === target.id)
    return Boolean(targetLayer?.groupId && blockedTargets.has(targetLayer.groupId))
  }

  const stopLayerDragAutoScroll = (): void => {
    if (layerDragAutoScrollFrameRef.current !== null) window.cancelAnimationFrame(layerDragAutoScrollFrameRef.current)
    layerDragAutoScrollFrameRef.current = null
  }

  const scheduleLayerDragAutoScroll = (): void => {
    if (layerDragAutoScrollFrameRef.current !== null) return
    const tick = (): void => {
      layerDragAutoScrollFrameRef.current = null
      const drag = dragRef.current
      const pointer = layerDragPointerRef.current
      const list = layerListRef.current
      const bounds = list?.getBoundingClientRect()
      if (!drag?.moved || !pointer || !list || !bounds) return
      const viewportHeight = list.clientHeight || bounds.height
      const maxScrollTop = Math.max(0, list.scrollHeight - viewportHeight)
      if (maxScrollTop <= 0 || pointer.clientX < bounds.left || pointer.clientX > bounds.right) return
      const edgeThreshold = Math.min(48, Math.max(24, viewportHeight * 0.15))
      const distanceFromTop = pointer.clientY - bounds.top
      const distanceFromBottom = bounds.bottom - pointer.clientY
      let delta = 0
      if (distanceFromTop >= 0 && distanceFromTop < edgeThreshold && list.scrollTop > 0) {
        delta = -Math.max(2, Math.round((edgeThreshold - distanceFromTop) * 0.5))
      } else if (distanceFromBottom >= 0 && distanceFromBottom < edgeThreshold && list.scrollTop < maxScrollTop) {
        delta = Math.max(2, Math.round((edgeThreshold - distanceFromBottom) * 0.5))
      }
      if (delta === 0) return
      const nextScrollTop = Math.max(0, Math.min(maxScrollTop, list.scrollTop + delta))
      if (nextScrollTop === list.scrollTop) return
      list.scrollTop = nextScrollTop
      // Recompute the ghost and drop target against the newly scrolled rows
      // even when the pointer itself is stationary at the edge.
      latestRef.current.pointerMoveNow(pointer.clientX, pointer.clientY, pointer.altKey)
      layerDragAutoScrollFrameRef.current = window.requestAnimationFrame(tick)
    }
    layerDragAutoScrollFrameRef.current = window.requestAnimationFrame(tick)
  }

  const moveLayerDrag = (clientX: number, clientY: number, altKey: boolean): void => {
    const nodes = optionsRef.current.readRows()
    const drag = dragRef.current
    if (!drag) return
    drag.copy = altKey
    if (!drag.moved && Math.hypot(clientX - drag.startX, clientY - drag.startY) < 4) return
    if (!drag.moved) { drag.moved = true; setDraggingIds(drag.ids); setDraggingGroupId(drag.groupId ?? null) }
    setDraggingCopy(drag.copy)
    const draggedLayerIds = new Set(drag.wholeGroupSelection ? [] : drag.selectedLayerIds)
    const draggedGroupIds = new Set(drag.selectedGroupIds)
    const items = nodes.flatMap((node): NonNullable<LayerDragGhost['items']> => {
      if (node.kind === 'group' && draggedGroupIds.has(node.id)) return [{ id: node.id, kind: 'group', name: node.group.name }]
      if (node.kind === 'layer' && draggedLayerIds.has(node.id)) return [{ id: node.id, kind: 'layer', name: node.layer.name }]
      return []
    })
    const list = layerListRef.current
    const listBounds = list?.getBoundingClientRect()
    const selectedCount = drag.wholeGroupSelection
      ? Math.max(1, drag.selectedGroupIds.length)
      : new Set([...drag.selectedLayerIds.map((id) => `layer:${id}`), ...drag.selectedGroupIds.map((id) => `group:${id}`)]).size
    const count = Math.max(items.length, selectedCount)
    const ghostHeight = Math.min(4, Math.max(1, items.length)) * 27 + (count > Math.min(4, items.length) ? 20 : 0)
    // The ghost is absolutely positioned in the scrollable layer list. Its
    // `top` therefore uses content coordinates, while pointer events report
    // viewport coordinates. Include the current scroll offset so the preview
    // stays under the pointer after the list has been scrolled.
    const y = listBounds
      ? Math.max(0, Math.min(Math.max(0, (list?.scrollHeight ?? listBounds.height) - ghostHeight), clientY - listBounds.top + (list?.scrollTop ?? 0) - ghostHeight / 2))
      : 0
    setDragGhost({ y, items: items.length > 0 ? items : [{ id: drag.row.id, kind: drag.row.kind, name: t('layers.fallbackName') }], count })
    let target = resolveDropTarget(clientX, clientY, drag.ids, drag.groupIds, drag.copy)
    if (target && dropTargetBlockedByGroups(target, drag.groupIds)) target = null
    dropTargetRef.current = target
    if (target?.kind === 'edge' && layerListRef.current) {
      const list = layerListRef.current
      const rows = [...list.querySelectorAll<HTMLElement>('[data-layer-id], [data-group-id]')]
      const measuredRows = rows.map((row) => ({ row, bounds: row.getBoundingClientRect() })).filter(({ bounds }) => bounds.height > 0).sort((left, right) => left.bounds.top - right.bounds.top)
      const measuredAnchor = target.edge === 'top' ? measuredRows[0] : measuredRows.at(-1)
      const listBounds = list.getBoundingClientRect()
      const rowBounds = measuredAnchor?.bounds
      setDropTarget({ ...target, offset: rowBounds ? (target.edge === 'top' ? rowBounds.top : rowBounds.bottom) - listBounds.top + list.scrollTop : 0 })
    } else setDropTarget(target)
  }

  const flushPendingLayerDrag = (): void => {
    const pending = pendingLayerDragRef.current
    pendingLayerDragRef.current = null
    if (pending) moveLayerDrag(pending.clientX, pending.clientY, pending.altKey)
  }

  const finishLayerDrag = (clientX: number, clientY: number): void => {
    if (useWorkspace.getState().activeId !== optionsRef.current.documentId) {
      clearTransientLayerDrag()
      return
    }
    stopLayerDragAutoScroll()
    layerDragPointerRef.current = null
    if (layerDragFrameRef.current !== null) window.cancelAnimationFrame(layerDragFrameRef.current)
    layerDragFrameRef.current = null
    flushPendingLayerDrag()
    const drag = dragRef.current
    let target = drag ? resolveDropTarget(clientX, clientY, drag.ids, drag.groupIds, drag.copy) : dropTargetRef.current
    if (drag && target && dropTargetBlockedByGroups(target, drag.groupIds)) target = null
    dragRef.current = null
    const compound = Boolean(drag?.moved && target && drag.copy)
    if (compound) store.beginLayerPanelTransaction(session.document.id)
    if (drag?.moved && target) {
      if (drag.copy) {
        const copies = store.duplicateSelectedLayerRows()
        drag.ids = copies.layerIds
        drag.groupIds = copies.groupIds
        drag.groupId = drag.groupIds.length === 1 && drag.ids.length === 0 ? drag.groupIds[0] : undefined
      }
      if (target.kind === 'edge') store.moveLayerRows(drag.ids, drag.groupIds, { kind: 'edge', edge: target.edge })
      else if (target.kind === 'group') store.moveLayerRows(drag.ids, drag.groupIds, { kind: 'group', id: target.id })
      else if (target.kind === 'above-group') store.moveLayerRows(drag.ids, drag.groupIds, { kind: 'row', rowKind: 'group', id: target.id, position: target.insertAfter === false ? 'below' : 'above' })
      else store.moveLayerRows(drag.ids, drag.groupIds, { kind: 'row', rowKind: 'layer', id: target.id, position: target.insertAfter ? 'above' : 'below' })
      if (!drag.copy) {
        if (drag.wholeGroupSelection && drag.selectedGroupIds.length === 1) store.selectGroup(drag.selectedGroupIds[0])
        else store.selectLayerRows(drag.selectedLayerIds, drag.selectedGroupIds)
      }
    }
    if (drag && !drag.moved && !drag.preserveSelection && drag.selectOnClick) {
      // Selecting the already-active row does not change the selection
      // signature, so restore the explicit outline directly as well.
      optionsRef.current.onClickSelectedRow()
      if (drag.row.kind === 'group') store.selectGroup(drag.row.id)
      else store.selectLayer(drag.row.id)
    }
    if (compound) store.commitLayerPanelTransaction(session.document.id, t('layers.copyMoveHistory'))
    setDraggingIds([])
    setDraggingGroupId(null)
    setDraggingCopy(false)
    dropTargetRef.current = null
    setDropTarget(null)
    setDragGhost(null)
  }
  const begin = (event: React.PointerEvent<HTMLButtonElement>, row: LayerFormTarget): void => {
    clearTransientLayerDrag()
    const active = useWorkspace.getState().sessions.find(item => item.document.id === optionsRef.current.documentId)
    if (!active) return
    const rows = selectedRowsForDrag(active)
    const selected = row.kind === 'layer' ? rows.ids.includes(row.id) : rows.groupIds.includes(row.id)
    const ids = selected ? rows.ids : row.kind === 'layer' ? [row.id] : []
    const groupIds = selected ? rows.groupIds : row.kind === 'group' ? [row.id] : []
    dragRef.current = {
      ids, groupIds,
      groupId: groupIds.length === 1 && ids.length === 0 ? groupIds[0] : undefined,
      row,
      preserveSelection: event.ctrlKey || event.shiftKey,
      selectOnClick: true,
      selectedLayerIds: [...active.selectedLayerIds],
      selectedGroupIds: [...active.selectedGroupIds],
      wholeGroupSelection: Boolean(active.selectedGroupId),
      startX: event.clientX, startY: event.clientY,
      moved: false, copy: event.altKey
    }
    event.preventDefault()
  }
  const pointerMove = (event: PointerEvent): void => {
      if (dragRef.current) {
        layerDragPointerRef.current = { clientX: event.clientX, clientY: event.clientY, altKey: event.altKey }
        if (!dragRef.current.moved) moveLayerDrag(event.clientX, event.clientY, event.altKey)
        else {
          pendingLayerDragRef.current = { clientX: event.clientX, clientY: event.clientY, altKey: event.altKey }
          if (layerDragFrameRef.current === null) layerDragFrameRef.current = window.requestAnimationFrame(() => {
            layerDragFrameRef.current = null
            flushPendingLayerDrag()
          })
        }
        scheduleLayerDragAutoScroll()
      }

  }
  const finish = (event: PointerEvent): void => {
    if (event.type === 'pointercancel') { clearTransientLayerDrag(); return }
    finishLayerDrag(event.clientX, event.clientY)
  }
  const latestRef = useRef({begin, pointerMove, pointerMoveNow: moveLayerDrag, finish, cancel: clearTransientLayerDrag})
  latestRef.current = {begin, pointerMove, pointerMoveNow: moveLayerDrag, finish, cancel: clearTransientLayerDrag}
  useEffect(() => () => latestRef.current.cancel(), [options.documentId])
  return {
    draggingIds, draggingGroupId, copying: draggingCopy, dropTarget, ghost: dragGhost,
    begin: (...args: Parameters<typeof begin>) => latestRef.current.begin(...args),
    pointerMove: (event: PointerEvent) => latestRef.current.pointerMove(event),
    finish: (event: PointerEvent) => latestRef.current.finish(event),
    cancel: () => latestRef.current.cancel()
  }
}
