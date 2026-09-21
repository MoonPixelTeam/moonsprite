import { useAnimationFramePreview } from './useAnimationFramePreview'
import { useAnimationCopyCursor } from './useAnimationCopyCursor'
import type { AnimationPointerDrag, AnimationGestureSelection, AnimationGestureActiveTarget, AnimationLoopSectionResizeEdge } from './animation-gesture-types'
import { animationSlotRange } from '@/core/animation-slot-selection'
import { isLayerCellShortcut, runLayerCellShortcut, toggleLayerMaskIsolatedView } from './layer-cell-shortcuts'
import { useEffect, useRef, useState } from 'react'
import { animationMaskAt } from '@/core/document-model'
import { animationCelKey, createDefaultAnimationTimeline, ensureAnimationDocument, parseAnimationCelKey } from '@/core/animation'; import { buildLayerPanelTree } from '@/core/layer-panel-layout'
import { resolveAnimationLoopSectionRange } from '@/core/animation-loop-sections'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { type AnimationLoopSectionResizePreview } from './layer-timeline-layout'
import { animationFrameTargetFromElement, animationPointerTargetElement, loopSectionFrameIndexAtPointer, timelineAutoScrollDelta, timelineFrameRange, timelineSelectionOutlineHit } from './animation-gesture-helpers'
import { clampAnimationCelDropTarget, createAnimationCelDropClampContext, type AnimationCelDropClampContext } from './animation-cel-drop-target'

interface Options {
  session: Readonly<DocumentSession>
  listRef: React.RefObject<HTMLDivElement | null>
  showAnimationSelectionOutline(): void
  showAnimationCellSelectionOutline(): void
  setSelectionOutlineVisible(visible: boolean): void
  setAnimationCellSelectionOutlineVisible(visible: boolean): void
  preserveSelectionAfterEdit(): void
  cellRange(anchor: string, target: string): string[]
  maskCellRange(anchor: string, target: string): string[]
}

export function useAnimationGestures(options: Options) {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const store = useWorkspace.getState()
  const session = options.session
  const timeline = session.document.animation ?? createDefaultAnimationTimeline()
  const layerListRef = options.listRef
  const { showAnimationSelectionOutline, showAnimationCellSelectionOutline, setSelectionOutlineVisible, setAnimationCellSelectionOutlineVisible } = options
  const cellRange = (a: string, b: string) => optionsRef.current.cellRange(a, b)
  const maskCellRange = (a: string, b: string) => optionsRef.current.maskCellRange(a, b)
  const selectAnimationFrame = (id: string, mode: 'replace' | 'toggle' | 'range' = 'replace') => store.selectAnimationFrame(id, mode)
  const [loopSectionResizePreview, setLoopSectionResizePreview] = useState<AnimationLoopSectionResizePreview | null>(null)
  const animationPointerDragRef = useRef<AnimationPointerDrag | null>(null)
  const { animationCopyRef, hoverCopyCursorRef, syncCopyCursor } = useAnimationCopyCursor(animationPointerDragRef)
  const framePreview = useAnimationFramePreview(session.document.id)
  const [animationGestureSelection, setAnimationGestureSelection] = useState<AnimationGestureSelection | null>(null)
  const [animationGestureActiveTarget, setAnimationGestureActiveTarget] = useState<AnimationGestureActiveTarget | null>(null)
  const suppressNextContextMenuRef = useRef(false)
  const previewGestureTarget = (target: AnimationGestureActiveTarget): void => {
    setAnimationGestureActiveTarget(target)
    framePreview.preview(target.frameId)
  }
  // Group rows do not own AnimationCel records. Keep their empty timeline
  // slots as a presentation selection so they can still be hit, boxed and
  // repositioned without selecting or mutating descendant layers.
  const [selectedAnimationGroupCellKeys, setSelectedAnimationGroupCellKeys] = useState<string[]>([])
  const suppressAnimationClickRef = useRef(false)
  const clickTimerRef = useRef<number | null>(null)
  const suppressNextClick = (): void => {
    suppressAnimationClickRef.current = true
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current)
    clickTimerRef.current = window.setTimeout(() => { suppressAnimationClickRef.current = false; clickTimerRef.current = null }, 0)
  }
  const [draggingAnimationFrameIds, setDraggingAnimationFrameIds] = useState<string[]>([])
  const [draggingAnimationCellKeys, setDraggingAnimationCellKeys] = useState<string[]>([])
  const [draggingAnimationCellKind, setDraggingAnimationCellKind] = useState<'cel' | 'mask' | null>(null)
  const [animationCelDropTargetKey, setAnimationCelDropTargetKey] = useState<string | null>(null)
  const animationCelDropTargetKeyRef = useRef<string | null>(null)
  const animationCelEdgeCellsRef = useRef<{
    drag: Extract<AnimationPointerDrag, { kind: 'cel' | 'mask' | 'group-cel' }>
    scrollLeft: number
    scrollTop: number
    cells: Array<{ bounds: DOMRect; key: string }>
  } | null>(null)
  const [animationCelDragAnchorKey, setAnimationCelDragAnchorKey] = useState<string | null>(null)
  const animationFrameDropTargetRef = useRef<{ frameId: string; insertAfter: boolean } | null>(null)
  const [animationFrameDropTarget, setAnimationFrameDropTarget] = useState<{ frameId: string; insertAfter: boolean } | null>(null)
  const animationTimelineAutoScrollRef = useRef<{ frame: number | null; event: PointerEvent | null }>({ frame: null, event: null })
  const selectedAnimationGroupCellKeySet = new Set(selectedAnimationGroupCellKeys)
  const stopAnimationTimelineAutoScroll = (): void => {
    const autoScroll = animationTimelineAutoScrollRef.current
    if (autoScroll.frame !== null) window.cancelAnimationFrame(autoScroll.frame)
    autoScroll.frame = null
    autoScroll.event = null
  }
  const pointerHitsSelectionOutline = (event: React.PointerEvent<HTMLElement>, selector: string): boolean => timelineSelectionOutlineHit(layerListRef, event, selector)
  const frameRange = (anchorId: string, targetId: string): string[] => timelineFrameRange(timeline.frames, anchorId, targetId)
  useEffect(() => {
    // Group-slot visuals are transient timeline selection state; clear them
    // whenever another formal animation mode or a non-group row becomes
    // active.
    if (animationPointerDragRef.current?.kind === 'group-cel' && animationGestureSelection?.kind === 'cel') return
    const activeGroupIds = new Set(session.selectedGroupIds.length > 0 ? session.selectedGroupIds : session.selectedGroupId ? [session.selectedGroupId] : [])
    const hasForeignGroupSlot = selectedAnimationGroupCellKeys.some((key) => {
      const parsed = parseAnimationCelKey(key)
      return !parsed || !activeGroupIds.has(parsed.layerId)
    })
    if (hasForeignGroupSlot
    || session.selectedGroupIds.length === 0 && !session.selectedGroupId
    || session.selectedAnimationFrameIds.length > 0
    || session.selectedAnimationCellKeys.length > 0
    || session.selectedAnimationMaskCellKeys.length > 0) {
      setSelectedAnimationGroupCellKeys([])
    }
  }, [selectedAnimationGroupCellKeys.join('\u0000'), animationGestureSelection?.kind, session.document.id, session.selectedGroupId, session.selectedGroupIds.join('\u0000'), session.selectedAnimationFrameIds.length, session.selectedAnimationCellKeys.length, session.selectedAnimationMaskCellKeys.length, session.selectedAnimationMaskRowKeys.length])
  const cancelAnimationPointerDrag = (): void => {
    document.body.classList.remove('animation-copy-drag')
    stopAnimationTimelineAutoScroll()
    framePreview.cancel()
    const drag = animationPointerDragRef.current
    if (drag && 'longPressTimer' in drag && drag.longPressTimer !== null) window.clearTimeout(drag.longPressTimer)
    if (drag?.kind === 'group-cel') setSelectedAnimationGroupCellKeys([drag.sourceAnchorKey])
    animationPointerDragRef.current = null
    animationCelEdgeCellsRef.current = null
    setLoopSectionResizePreview(null)
    animationFrameDropTargetRef.current = null
    animationCelDropTargetKeyRef.current = null
    setAnimationFrameDropTarget(null)
    setAnimationCelDropTargetKey(null)
    setAnimationCelDragAnchorKey(null)
    setDraggingAnimationFrameIds([])
    setDraggingAnimationCellKeys([])
    setDraggingAnimationCellKind(null)
    setAnimationGestureSelection(null)
    setAnimationGestureActiveTarget(null)
  }
  const loopSectionFrameIndexAtPointerForTimeline = (clientX: number, edge: AnimationLoopSectionResizeEdge): number | null => loopSectionFrameIndexAtPointer(layerListRef, timeline.frames.length, clientX, edge)
  const beginAnimationLoopSectionResize = (event: React.PointerEvent<HTMLElement>, sectionId: string, edge: AnimationLoopSectionResizeEdge): void => {
    if (event.button !== 0) return
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const currentTimeline = ensureAnimationDocument(active.document)
    const section = (currentTimeline.loopSections ?? []).find((candidate) => candidate.id === sectionId)
    const range = section ? resolveAnimationLoopSectionRange(currentTimeline, section) : null
    if (!section || !range) return
    cancelAnimationPointerDrag()
    animationPointerDragRef.current = {
      kind: 'loop-section',
      sectionId,
      edge,
      startX: event.clientX,
      startY: event.clientY,
      startIndex: range.startIndex,
      endIndex: range.endIndex,
      previewStartIndex: range.startIndex,
      previewEndIndex: range.endIndex,
      moved: false
    }
    setLoopSectionResizePreview({ sectionId, startIndex: range.startIndex, endIndex: range.endIndex })
    event.preventDefault()
    event.stopPropagation()
  }
  const beginAnimationFrameDrag = (event: React.PointerEvent<HTMLElement>, frameId: string): void => {
    if (event.button !== 0 && event.button !== 2) return
    animationCopyRef.current = event.button === 0 && event.altKey
    const selected = session.selectedAnimationFrameIds.includes(frameId)
    // Drawing hides selection guides without clearing the formal selection.
    // Clicking an already-selected frame must make that selection visible
    // again; a new selection is revealed after the Store update commits.
    if (selected) showAnimationSelectionOutline()
    const preserveSelection = event.shiftKey || event.ctrlKey
    if (preserveSelection) {
      cancelAnimationPointerDrag()
      selectAnimationFrame(frameId, event.shiftKey ? 'range' : 'toggle')
      event.preventDefault()
      return
    }
    const rightButtonMove = event.button === 2 && selected && session.selectedAnimationFrameIds.length > 1
    const canMove = selected && (rightButtonMove || event.altKey || pointerHitsSelectionOutline(event, `[data-animation-frame-selection~="${frameId}"]`))
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    const drag: AnimationPointerDrag = {
      kind: 'frame',
      button: event.button as 0 | 2,
      sourceFrameId: frameId,
      frameIds: canMove ? [...(active?.selectedAnimationFrameIds ?? [frameId])] : [frameId],
      preserveSelection,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      canMove,
      pendingSelection: false,
      longPressed: false,
      longPressTimer: null,
      lastSelectionTarget: frameId
    }
    // Only a new range gesture masks the prior formal selection; moving an
    // existing selected frame keeps its selection visible.
    if (!canMove) showAnimationSelectionOutline()
    setAnimationGestureSelection(canMove ? null : { kind: 'frame', ids: [frameId] })
    setAnimationGestureActiveTarget(canMove ? null : { kind: 'frame', frameId })
    animationPointerDragRef.current = drag
    event.preventDefault()
  }
  const beginAnimationCelDrag = (event: React.PointerEvent<HTMLButtonElement>, layerId: string, frameId: string): void => {
    if (event.button !== 0 && event.button !== 2) return
    const key = animationCelKey(layerId, frameId)
    animationCopyRef.current = event.button === 0 && event.altKey
    const copySelection = event.altKey && session.selectedAnimationCellKeys.length > 1 && session.selectedAnimationCellKeys.includes(key)
    if (isLayerCellShortcut(event, 'cel') && !copySelection) {
      cancelAnimationPointerDrag()
      runLayerCellShortcut(event, session.document.id, layerId, frameId, 'cel')
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (session.activeLayerMaskId !== null || session.selectedAnimationMaskCellKeys.length > 0 || session.selectedAnimationMaskRowKeys.length > 0) {
      store.clearAnimationSelection()
    }
    const selected = session.selectedAnimationCellKeys.includes(key)
    if (selected) {
      showAnimationSelectionOutline()
      showAnimationCellSelectionOutline()
    }
    const preserveSelection = event.shiftKey || event.ctrlKey
    if (preserveSelection) {
      cancelAnimationPointerDrag()
      animationPointerDragRef.current = {
        kind: 'cel', sourceAnchorKey: key, cellKeys: [...session.selectedAnimationCellKeys, key],
        button: event.button as 0 | 2,
        preserveSelection: false, selectionMode: event.ctrlKey || selected ? 'toggle' : 'range',
        startX: event.clientX, startY: event.clientY, moved: false, canMove: false,
        pendingSelection: true, longPressed: false, longPressTimer: null, lastSelectionTarget: key
      }
      event.preventDefault()
      return
    }
    // Empty cels are real timeline slots (ensureAnimationDocument gives them
    // a blank surface), so they must remain draggable just like populated
    // cels.  Content presence only controls thumbnail rendering.
    const rightButtonMove = event.button === 2 && selected && session.selectedAnimationCellKeys.length > 1
    const canMove = selected && (rightButtonMove || copySelection || pointerHitsSelectionOutline(event, '[data-animation-cel-selection]'))
    if (!canMove) {
      showAnimationSelectionOutline()
      showAnimationCellSelectionOutline()
    }
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    const drag: AnimationPointerDrag = {
      kind: 'cel',
      button: event.button as 0 | 2,
      sourceAnchorKey: key,
      cellKeys: canMove ? [...(active?.selectedAnimationCellKeys ?? [key])] : [key],
      preserveSelection,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      canMove,
      pendingSelection: false,
      longPressed: false,
      longPressTimer: null,
      lastSelectionTarget: key
    }
    setAnimationGestureSelection(canMove ? null : { kind: 'cel', keys: [key] })
    setAnimationGestureActiveTarget(canMove ? null : { kind: 'cel', layerId, frameId })
    setAnimationCelDragAnchorKey(canMove ? key : null)
    animationPointerDragRef.current = drag
    event.preventDefault()
  }
  const beginAnimationGroupCelDrag = (event: React.PointerEvent<HTMLButtonElement>, groupId: string, frameId: string): void => {
    if (event.button !== 0) return
    const key = animationCelKey(groupId, frameId)
    const selected = selectedAnimationGroupCellKeySet.has(key)
    const preserveSelection = event.shiftKey || event.ctrlKey
    if (preserveSelection) {
      animationPointerDragRef.current = {
        kind: 'group-cel', sourceAnchorKey: key, preserveSelection: false,
        selectionMode: event.ctrlKey || selected ? 'toggle' : 'range',
        startX: event.clientX, startY: event.clientY, moved: false, canMove: false, lastSelectionTarget: key
      }
      setAnimationGestureSelection({ kind: 'cel', keys: [key] })
      setAnimationGestureActiveTarget({ kind: 'cel', layerId: groupId, frameId })
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const canMove = selected && pointerHitsSelectionOutline(event, '[data-animation-cel-selection], [data-animation-selected-row]')
    // Keep group focus/selection transient until pointer-up, matching layer
    // and mask cel gestures.
    setSelectionOutlineVisible(true)
    setAnimationCellSelectionOutlineVisible(true)
    animationPointerDragRef.current = {
      kind: 'group-cel',
      sourceAnchorKey: key,
      preserveSelection,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      canMove,
      lastSelectionTarget: key
    }
    setAnimationGestureSelection(canMove ? null : { kind: 'cel', keys: [key] })
    setAnimationGestureActiveTarget(canMove ? null : { kind: 'cel', layerId: groupId, frameId })
    setAnimationCelDragAnchorKey(canMove ? key : null)
    event.preventDefault()
    event.stopPropagation()
  }
  const toggleAnimationMaskIsolatedView = (layerId: string, frameId: string, additive = false): boolean => toggleLayerMaskIsolatedView(session.document.id, layerId, frameId, additive)
  const beginAnimationMaskDrag = (event: React.PointerEvent<HTMLButtonElement>, layerId: string, frameId: string): void => {
    if (event.button !== 0) return
    const key = animationCelKey(layerId, frameId)
    const mask = animationMaskAt(timeline, layerId, frameId)
    if (isLayerCellShortcut(event, 'mask')) {
      if (!mask) return
      cancelAnimationPointerDrag()
      runLayerCellShortcut(event, session.document.id, layerId, frameId, 'mask')
      suppressNextClick()
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const selected = session.selectedAnimationMaskCellKeys.includes(key)
    if (selected) {
      showAnimationSelectionOutline()
      showAnimationCellSelectionOutline()
    }
    const preserveSelection = event.shiftKey || event.ctrlKey
    if (!preserveSelection && !selected) store.selectAnimationMaskCell(key, 'replace')
    if (preserveSelection) {
      cancelAnimationPointerDrag()
      animationPointerDragRef.current = {
        kind: 'mask', sourceAnchorKey: key, cellKeys: [...session.selectedAnimationMaskCellKeys, key],
        preserveSelection: false, selectionMode: event.ctrlKey || selected ? 'toggle' : 'range',
        startX: event.clientX, startY: event.clientY, moved: false, canMove: false,
        pendingSelection: true, longPressed: false, longPressTimer: null, lastSelectionTarget: key
      }
      event.preventDefault()
      return
    }
    const canMove = selected && pointerHitsSelectionOutline(event, '[data-animation-cel-selection]')
    const drag: AnimationPointerDrag = {
      kind: 'mask',
      sourceAnchorKey: key,
      cellKeys: selected ? [...session.selectedAnimationMaskCellKeys] : [key],
      preserveSelection,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      canMove,
      pendingSelection: false,
      longPressed: false,
      longPressTimer: null,
      lastSelectionTarget: key
    }
    if (!canMove) {
      setSelectionOutlineVisible(false)
      setAnimationCellSelectionOutlineVisible(false)
      // Mask interaction is a distinct selection mode. Do not select the
      // owner row during pointer-down; that transient write leaks ordinary
      // owner-row/current-cel visuals before pointer-up commits mask state.
      showAnimationSelectionOutline()
      showAnimationCellSelectionOutline()
    }
    setAnimationGestureSelection(canMove ? null : { kind: 'mask', keys: [key] })
    setAnimationGestureActiveTarget(canMove ? null : { kind: 'mask', layerId, frameId })
    setAnimationCelDragAnchorKey(canMove ? key : null)
    animationPointerDragRef.current = drag
    event.preventDefault()
  }
  const pointerTargetElement = animationPointerTargetElement
  const animationFrameTarget = animationFrameTargetFromElement
  const updateAnimationItemCursor = (event: React.PointerEvent<HTMLElement>, frameId: string, cellKey?: string): void => {
    if (animationPointerDragRef.current) return
    const maskCell = event.currentTarget.matches('[data-animation-mask-cel-key]')
    const frameMove = !maskCell && session.selectedAnimationFrameIds.includes(frameId) && pointerHitsSelectionOutline(event, `[data-animation-frame-selection~="${frameId}"]`)
    const celMove = !maskCell && Boolean(cellKey && session.selectedAnimationCellKeys.includes(cellKey))
    && pointerHitsSelectionOutline(event, '[data-animation-cel-selection]')
    const maskMove = maskCell && Boolean(cellKey && session.selectedAnimationMaskCellKeys.includes(cellKey))
    && pointerHitsSelectionOutline(event, '[data-animation-cel-selection]')
    event.currentTarget.classList.toggle('mask-selection-move', maskMove)
    if (hoverCopyCursorRef.current && hoverCopyCursorRef.current !== event.currentTarget) hoverCopyCursorRef.current.style.cursor = ''
    hoverCopyCursorRef.current = frameMove || celMove ? event.currentTarget : null
    event.currentTarget.style.cursor = (frameMove || celMove) && event.altKey ? 'var(--cursor-copy)' : frameMove || celMove || maskMove ? 'var(--cursor-move)' : ''
  }
  const animationCelDropClampContextRef = useRef<AnimationCelDropClampContext | null>(null)
  const clampAnimationCelDropTargetForGesture = (drag: Extract<AnimationPointerDrag, { kind: 'cel' | 'mask' }>, candidateKey: string): string | null => {
    const context = animationCelDropClampContextRef.current?.drag === drag ? animationCelDropClampContextRef.current : createAnimationCelDropClampContext(drag, session, timeline)
    animationCelDropClampContextRef.current = context; return clampAnimationCelDropTarget(context, candidateKey)
  }
  const animationCelEdgeTarget = (drag: Extract<AnimationPointerDrag, { kind: 'cel' | 'mask' | 'group-cel' }>, clientX: number, clientY: number): string | null => {
    const selector = drag.kind === 'mask' ? '[data-animation-mask-cel-key]' : drag.kind === 'group-cel' ? '[data-animation-group-cel-key]' : '[data-animation-cel-key]'
    const datasetKey = drag.kind === 'mask' ? 'animationMaskCelKey' : drag.kind === 'group-cel' ? 'animationGroupCelKey' : 'animationCelKey'
    const list = layerListRef.current
    if (!list) return null
    const cached = animationCelEdgeCellsRef.current
    const scrollLeft = list.scrollLeft
    const scrollTop = list.scrollTop
    const cells = cached?.drag === drag && cached.scrollLeft === scrollLeft && cached.scrollTop === scrollTop
      ? cached.cells
      : [...list.querySelectorAll<HTMLElement>(selector)]
        .map((element) => ({ bounds: element.getBoundingClientRect(), key: element.dataset[datasetKey] }))
        .filter((entry): entry is { bounds: DOMRect; key: string } => Boolean(entry.key && entry.bounds.width > 0 && entry.bounds.height > 0))
    if (cached?.drag !== drag || cached.scrollLeft !== scrollLeft || cached.scrollTop !== scrollTop) animationCelEdgeCellsRef.current = { drag, scrollLeft, scrollTop, cells }
    if (cells.length === 0) return null
    const nearestRowCenter = cells.reduce((nearest, entry) => {
      const center = entry.bounds.top + entry.bounds.height / 2
      return Math.abs(center - clientY) < Math.abs(nearest - clientY) ? center : nearest
    }, cells[0].bounds.top + cells[0].bounds.height / 2)
    const rowCells = cells
    .filter((entry) => Math.abs(entry.bounds.top + entry.bounds.height / 2 - nearestRowCenter) < 1)
    .sort((left, right) => left.bounds.left - right.bounds.left)
    const first = rowCells[0]
    const last = rowCells.at(-1)
    if (!first || !last) return null
    if (clientX < first.bounds.left) return first.key
    if (clientX > last.bounds.right) return last.key
    return null
  }
  const animationTimelineAutoScrollDelta = (clientX: number): number => timelineAutoScrollDelta(layerListRef, clientX)
  const scrollAnimationTimelineAtPointer = (clientX: number): boolean => {
    const list = layerListRef.current
    const delta = animationTimelineAutoScrollDelta(clientX)
    if (!list || delta === 0) return false
    list.scrollLeft += delta
    return true
  }
  const scheduleAnimationTimelineAutoScroll = (event: PointerEvent): void => {
    const drag = animationPointerDragRef.current
    const autoScroll = animationTimelineAutoScrollRef.current
    autoScroll.event = event
    const extendingSelection = Boolean(drag && drag.kind !== 'loop-section' && !drag.canMove && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4)
    if (!drag || drag.kind === 'loop-section' || (!drag.canMove && !extendingSelection) || (drag.canMove && !drag.moved) || animationTimelineAutoScrollDelta(event.clientX) === 0) {
      stopAnimationTimelineAutoScroll()
      return
    }
    if (autoScroll.frame !== null) return
    autoScroll.frame = window.requestAnimationFrame(() => {
      autoScroll.frame = null
      const latestEvent = autoScroll.event
      if (!latestEvent || !scrollAnimationTimelineAtPointer(latestEvent.clientX)) {
        autoScroll.event = null
        return
      }
      moveAnimationPointerDrag(latestEvent)
    })
  }
  const moveAnimationPointerDrag = (event: PointerEvent): void => {
    const drag = animationPointerDragRef.current
    if (!drag) return
    if (drag.kind === 'frame' || drag.kind === 'cel') { animationCopyRef.current = event.altKey; syncCopyCursor() }
    if (drag.kind === 'loop-section') {
      const list = layerListRef.current
      if (list) {
        const bounds = list.getBoundingClientRect()
        if (event.clientX > bounds.right - 30) list.scrollLeft += 18
        else if (event.clientX < bounds.left + 30) list.scrollLeft -= 18
      }
      const nextIndex = loopSectionFrameIndexAtPointerForTimeline(event.clientX, drag.edge)
      if (nextIndex === null) return
      const nextStartIndex = drag.edge === 'start' ? Math.min(nextIndex, drag.endIndex) : drag.startIndex
      const nextEndIndex = drag.edge === 'end' ? Math.max(nextIndex, drag.startIndex) : drag.endIndex
      if (nextStartIndex === drag.previewStartIndex && nextEndIndex === drag.previewEndIndex) return
      drag.previewStartIndex = nextStartIndex
      drag.previewEndIndex = nextEndIndex
      drag.moved = true
      setLoopSectionResizePreview({ sectionId: drag.sectionId, startIndex: nextStartIndex, endIndex: nextEndIndex })
      return
    }
    if (!drag.canMove) {
      const target = pointerTargetElement(event)
      if (drag.kind === 'frame') {
        const frameId = animationFrameTarget(target)?.frameId
        if (frameId && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4 && frameId !== drag.lastSelectionTarget) {
          if (drag.longPressTimer !== null) window.clearTimeout(drag.longPressTimer)
          drag.longPressTimer = null
          drag.longPressed = true
          drag.pendingSelection = false
          drag.lastSelectionTarget = frameId
          showAnimationSelectionOutline()
          previewGestureTarget({ kind: 'frame', frameId })
          setAnimationGestureSelection({ kind: 'frame', ids: frameRange(drag.sourceFrameId, frameId) })
        }
      } else if (drag.kind === 'group-cel') {
        const key = target?.closest<HTMLElement>('[data-animation-group-cel-key]')?.dataset.animationGroupCelKey
        if (key && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4 && key !== drag.lastSelectionTarget) {
          drag.moved = true
          drag.lastSelectionTarget = key
          animationCelDropTargetKeyRef.current = key
          setAnimationCelDropTargetKey(key)
          const groups = buildLayerPanelTree({ layers: session.document.layers, groups: session.document.groups, collapsedGroupIds: [] }).filter((node) => node.kind === 'group')
          const keys = animationSlotRange(groups.map((node) => node.id), timeline.frames.map((frame) => frame.id), drag.sourceAnchorKey, key)
          setSelectedAnimationGroupCellKeys(keys)
          setAnimationGestureSelection({ kind: 'cel', keys })
          const parsedTarget = parseAnimationCelKey(key)
          if (parsedTarget) previewGestureTarget({ kind: 'frame', frameId: parsedTarget.frameId })
        }
      } else {
        const selector = drag.kind === 'mask' ? '[data-animation-mask-cel-key]' : '[data-animation-cel-key]'
        const key = target?.closest<HTMLElement>(selector)?.dataset[drag.kind === 'mask' ? 'animationMaskCelKey' : 'animationCelKey']
        if (key && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4 && key !== drag.lastSelectionTarget) {
          if (drag.longPressTimer !== null) window.clearTimeout(drag.longPressTimer)
          drag.longPressTimer = null
          drag.longPressed = true
          drag.pendingSelection = false
          drag.lastSelectionTarget = key
          showAnimationSelectionOutline()
          const parsedTarget = parseAnimationCelKey(key)
          if (parsedTarget) previewGestureTarget({ kind: drag.kind, layerId: parsedTarget.layerId, frameId: parsedTarget.frameId })
          setAnimationGestureSelection({ kind: drag.kind, keys: drag.kind === 'mask' ? maskCellRange(drag.sourceAnchorKey, key) : cellRange(drag.sourceAnchorKey, key) })
        }
      }
      // Extending a range may need to reveal frames beyond the current
      // viewport, even though it is not yet a content-move drag.
      scheduleAnimationTimelineAutoScroll(event)
      return
    }
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return
    if (!drag.moved) {
      drag.moved = true
      if (drag.kind === 'frame') setDraggingAnimationFrameIds(drag.frameIds)
      else if (drag.kind === 'group-cel') setSelectedAnimationGroupCellKeys([drag.sourceAnchorKey])
      else {
        setDraggingAnimationCellKeys(drag.cellKeys)
        setDraggingAnimationCellKind(drag.kind)
      }
    }
    syncCopyCursor()
    scheduleAnimationTimelineAutoScroll(event)
    const target = pointerTargetElement(event)
    if (drag.kind === 'frame') {
      if (target?.closest('.layer-animation-corner')) {
        animationFrameDropTargetRef.current = null
        setAnimationFrameDropTarget(null)
        return
      }
      const frameTarget = animationFrameTarget(target)
      if (!frameTarget) {
        animationFrameDropTargetRef.current = null
        setAnimationFrameDropTarget(null)
        return
      }
      const { frameId, element } = frameTarget
      const bounds = element.getBoundingClientRect()
      const next = { frameId, insertAfter: event.clientX >= bounds.left + bounds.width / 2 }
      const previous = animationFrameDropTargetRef.current
      if (previous?.frameId === next.frameId && previous.insertAfter === next.insertAfter) return
      animationFrameDropTargetRef.current = next
      setAnimationFrameDropTarget(next)
      return
    }
    const cell = target?.closest<HTMLElement>(drag.kind === 'mask' ? '[data-animation-mask-cel-key]' : drag.kind === 'group-cel' ? '[data-animation-group-cel-key]' : '[data-animation-cel-key]')
    const pointedKey = drag.kind === 'mask' ? cell?.dataset.animationMaskCelKey ?? null : drag.kind === 'group-cel' ? cell?.dataset.animationGroupCelKey ?? null : cell?.dataset.animationCelKey ?? null
    const candidateKey = pointedKey ?? animationCelEdgeTarget(drag, event.clientX, event.clientY)
    const key = candidateKey && (drag.kind === 'cel' || drag.kind === 'mask')
    ? clampAnimationCelDropTargetForGesture(drag, candidateKey)
    : candidateKey
    if (animationCelDropTargetKeyRef.current === key) return
    animationCelDropTargetKeyRef.current = key
    setAnimationCelDropTargetKey(key)
  }
  const finishAnimationPointerDrag = (cancelled = false): void => {
    document.body.classList.remove('animation-copy-drag')
    stopAnimationTimelineAutoScroll()
    const drag = animationPointerDragRef.current
    if (!drag) return
    if (cancelled || useWorkspace.getState().activeId !== optionsRef.current.session.document.id) {
      cancelAnimationPointerDrag()
      return
    }
    if (drag.kind !== 'loop-section' && drag.canMove) framePreview.cancel(); else framePreview.commit()
    if (drag.kind === 'loop-section') {
      if (drag.moved) {
        const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
        const currentTimeline = ensureAnimationDocument(active.document)
        const section = (currentTimeline.loopSections ?? []).find((candidate) => candidate.id === drag.sectionId)
        const startFrame = currentTimeline.frames[drag.previewStartIndex]
        const endFrame = currentTimeline.frames[drag.previewEndIndex]
        if (section && startFrame && endFrame) {
          store.updateAnimationLoopSection(drag.sectionId, {
            name: section.name,
            startFrameId: startFrame.id,
            endFrameId: endFrame.id,
            direction: section.direction,
            repeatCount: section.repeatCount
          })
        }
        suppressNextClick()
      }
      cancelAnimationPointerDrag()
      return
    }
    if ('longPressTimer' in drag && drag.longPressTimer !== null) window.clearTimeout(drag.longPressTimer)
    if (drag.moved) {
      if ((drag.kind === 'frame' || drag.kind === 'cel') && drag.button === 2) suppressNextContextMenuRef.current = true
      if (drag.kind === 'frame' && animationFrameDropTargetRef.current) {
        if (animationCopyRef.current) store.pasteAnimationFrames(animationFrameDropTargetRef.current)
        else store.moveSelectedAnimationFrames(animationFrameDropTargetRef.current.frameId, animationFrameDropTargetRef.current.insertAfter)
      } else if (drag.kind === 'cel' && animationCelDropTargetKeyRef.current) {
        const targetKey = animationCelDropTargetKeyRef.current
        const target = targetKey.lastIndexOf(':')
        if (target > 0) {
          // Moving cels mutates raster content and increments contentRevision;
          // preserve the destination selection guides through that revision
          // transition so the post-drop bbox does not flash away.
          optionsRef.current.preserveSelectionAfterEdit()
          store.moveSelectedAnimationCels(targetKey.slice(0, target), targetKey.slice(target + 1), drag.sourceAnchorKey, animationCopyRef.current)
          // Keep the formal destination selection visible after the Store
          // replaces the moved keys; this lets the new multi-cel bbox settle
          // instead of hiding the outline on pointerup.
          showAnimationSelectionOutline()
          showAnimationCellSelectionOutline()
        }
      } else if (drag.kind === 'group-cel' && animationCelDropTargetKeyRef.current) {
        const targetKey = animationCelDropTargetKeyRef.current
        if (drag.canMove) setSelectedAnimationGroupCellKeys([targetKey])
        const parsed = parseAnimationCelKey(targetKey)
        if (parsed) {
          store.selectGroup(parsed.layerId)
          store.setActiveAnimationFrame(parsed.frameId)
        }
        setSelectionOutlineVisible(true)
        setAnimationCellSelectionOutlineVisible(true)
      } else if (drag.kind === 'mask' && animationCelDropTargetKeyRef.current) {
        const targetKey = animationCelDropTargetKeyRef.current
        const target = targetKey.lastIndexOf(':')
        if (target > 0) {
          optionsRef.current.preserveSelectionAfterEdit()
          store.moveSelectedAnimationMasks(targetKey.slice(0, target), targetKey.slice(target + 1), drag.sourceAnchorKey)
        }
        showAnimationSelectionOutline()
        showAnimationCellSelectionOutline()
      }
      suppressNextClick()
    } else if (drag.kind === 'group-cel') {
      setSelectedAnimationGroupCellKeys((current) => drag.selectionMode === 'toggle'
      ? (current.includes(drag.lastSelectionTarget) ? current.filter((candidate) => candidate !== drag.lastSelectionTarget) : [...current, drag.lastSelectionTarget])
      : drag.selectionMode === 'range' ? [...new Set([...current, drag.lastSelectionTarget])] : [drag.lastSelectionTarget])
      const target = parseAnimationCelKey(drag.lastSelectionTarget)
      if (target) {
        store.selectGroup(target.layerId)
        store.setActiveAnimationFrame(target.frameId)
      }
    } else if ('longPressed' in drag && drag.longPressed) {
      if (drag.kind === 'frame') {
        const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
        if (!active?.selectedAnimationFrameIds.includes(drag.sourceFrameId)) store.selectAnimationFrame(drag.sourceFrameId, 'replace')
        if (drag.lastSelectionTarget !== drag.sourceFrameId) store.selectAnimationFrame(drag.lastSelectionTarget, 'range')
      } else if (drag.kind === 'mask') {
        const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
        if (!active?.selectedAnimationMaskCellKeys.includes(drag.sourceAnchorKey)) store.selectAnimationMaskCell(drag.sourceAnchorKey, 'replace')
        if (drag.lastSelectionTarget !== drag.sourceAnchorKey) store.selectAnimationMaskCell(drag.lastSelectionTarget, 'range')
      } else {
        const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
        if (!active?.selectedAnimationCellKeys.includes(drag.sourceAnchorKey)) store.selectAnimationCell(drag.sourceAnchorKey, 'replace')
        if (drag.lastSelectionTarget !== drag.sourceAnchorKey) store.selectAnimationCell(drag.lastSelectionTarget, 'range')
      }
    } else if (!drag.preserveSelection && !((drag.kind === 'frame' || drag.kind === 'cel') && drag.button === 2 && drag.canMove)) {
      if (drag.kind === 'frame') selectAnimationFrame(drag.sourceFrameId)
      else if (drag.kind === 'mask') store.selectAnimationMaskCell(drag.sourceAnchorKey, drag.selectionMode ?? 'replace')
      else if (drag.kind === 'cel') store.selectAnimationCell(drag.sourceAnchorKey, drag.selectionMode ?? 'replace')
    }
    // A selection made during playback is only an interaction aid. Keep it
    // visible while the pointer is held, then return the timeline to the
    // playback-only activity state on release. Existing selections from
    // before playback are left untouched until the user starts a new gesture.
    const liveSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (liveSession?.animationPlaying) {
      // Clear the local presentation in the same pointer-up turn as the
      // Store selection. Waiting for the selection-sync effect leaves the
      // released cell/frame highlight visible for one render.
      setSelectionOutlineVisible(false)
      setAnimationCellSelectionOutlineVisible(false)
      store.clearAnimationSelection()
      setSelectedAnimationGroupCellKeys([])
    }
    animationPointerDragRef.current = null
    animationCelEdgeCellsRef.current = null
    animationFrameDropTargetRef.current = null
    animationCelDropTargetKeyRef.current = null
    setAnimationCelDragAnchorKey(null)
    setAnimationFrameDropTarget(null)
    setAnimationCelDropTargetKey(null)
    setDraggingAnimationFrameIds([])
    setDraggingAnimationCellKeys([])
    setDraggingAnimationCellKind(null)
    setAnimationGestureSelection(null)
    setAnimationGestureActiveTarget(null)
  }
  const latestRef = useRef({ moveAnimationPointerDrag, finishAnimationPointerDrag, cancelAnimationPointerDrag })
  latestRef.current = { moveAnimationPointerDrag, finishAnimationPointerDrag, cancelAnimationPointerDrag }
  useEffect(() => () => {
    latestRef.current.cancelAnimationPointerDrag()
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current)
    clickTimerRef.current = null
    suppressAnimationClickRef.current = false
  }, [options.session.document.id])
  return {
    selectedAnimationGroupCellKeys, animationGestureSelection, animationGestureActiveTarget, draggingAnimationFrameIds, draggingAnimationCellKeys, draggingAnimationCellKind, animationCelDropTargetKey, animationCelDragAnchorKey, animationFrameDropTarget, loopSectionResizePreview, beginAnimationLoopSectionResize, beginAnimationFrameDrag, beginAnimationCelDrag, beginAnimationGroupCelDrag, beginAnimationMaskDrag, toggleAnimationMaskIsolatedView,
    updateAnimationItemCursor,
    hitsSelectionOutline: pointerHitsSelectionOutline,
    clearPreviewSelection: () => { setAnimationGestureSelection(null); setAnimationGestureActiveTarget(null) },
    clearFrameDropTarget: () => setAnimationFrameDropTarget(null),
    readGesture: () => animationPointerDragRef.current as Readonly<AnimationPointerDrag> | null,
    consumeContextMenu: (): boolean => {
      const suppressed = suppressNextContextMenuRef.current
      suppressNextContextMenuRef.current = false
      return suppressed
    },
    clickSuppressed: () => suppressAnimationClickRef.current,
    move: (event: PointerEvent) => latestRef.current.moveAnimationPointerDrag(event),
    finish: (cancelled = false) => latestRef.current.finishAnimationPointerDrag(cancelled),
    cancel: () => latestRef.current.cancelAnimationPointerDrag()
  }
}
