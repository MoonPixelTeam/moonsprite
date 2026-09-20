import { isScrollbarPointer } from '../scrollbar-pointer'
import { useAnimationGestures } from './useAnimationGestures'
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { observeLayerPanelReveal } from './layer-panel-reveal-scroll'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import {
  CANVAS_SELECTION_PRESERVE_EVENT,
  CANVAS_SELECTION_STARTED_EVENT,
  LAYER_PANEL_REVEAL_EVENT,
  type CanvasSelectionPreserveDetail,
  type CanvasSelectionStartedDetail,
  type LayerPanelRevealDetail
} from '@/components/layer-panel-reveal'

interface Options {
  session: DocumentSession
  animationGestureSelection: import('@/components/panels/animation-gesture-types').AnimationGestureSelection | null
  animationGestures: ReturnType<typeof useAnimationGestures>
  layerListRef: import('react').RefObject<HTMLDivElement | null>
  clearSelectionFromBlankRef: import('react').RefObject<() => void>
  shortcuts: import('@/core/shortcuts').ShortcutBindings
}

export function useLayerSelectionGuides({
  session,
  animationGestureSelection,
  animationGestures,
  layerListRef,
  clearSelectionFromBlankRef,
  shortcuts
}: Options) {
  const store = useWorkspace.getState()
  const revealSequenceRef = useRef(0)
  const cancelLayerRevealRef = useRef<(() => void) | null>(null)

  const [layerRevealRequest, setLayerRevealRequest] = useState<{ layerId: string; sequence: number } | null>(null)

  const [animationCellSelectionOutlineVisible, setAnimationCellSelectionOutlineVisible] = useState(
    () => session.selectedAnimationCellKeys.length > 0 || session.selectedAnimationMaskCellKeys.length > 0
  )

  const hiddenAnimationCellSelectionSignatureRef = useRef<string | null>(null)

  const animationCellSelectionSignature = `${session.selectedAnimationCellKeys.join('\u0000')}|${session.selectedAnimationMaskCellKeys.join('\u0000')}|${session.selectedAnimationMaskRowKeys.join('\u0000')}`

  const selectionStateSignature = `${session.document.id}|${session.selectedLayerIds.join('\u0000')}|${session.selectedGroupIds.join('\u0000')}|${session.selectedGroupId ?? ''}|${session.selectedAnimationFrameIds.join('\u0000')}|${animationCellSelectionSignature}`

  // Restore explicit selection when the panel mounts; an active editing
  // target alone must not show selection or linked-group guides.
  const [selectionOutlineVisible, setSelectionOutlineVisible] = useState(() =>
    session.layerSelectionExplicit || session.selectedAnimationFrameIds.length > 0 ||
    session.selectedAnimationCellKeys.length > 0 || session.selectedAnimationMaskCellKeys.length > 0 ||
    session.selectedAnimationMaskRowKeys.length > 0
  )

  const previousSelectionStateSignatureRef = useRef(selectionStateSignature)

  const previousAnimationSelectionActiveRef = useRef(
    session.selectedAnimationFrameIds.length > 0 ||
      session.selectedAnimationCellKeys.length > 0 ||
      session.selectedAnimationMaskCellKeys.length > 0 ||
      session.selectedAnimationMaskRowKeys.length > 0
  )

  const suppressSelectionOutlineOnNextSignatureRef = useRef(false)

  const preserveSelectionOnNextContentRevisionRef = useRef(false)

  const previousContentRevisionRef = useRef(session.contentRevision)

  const previousHistoryPositionRef = useRef(session.history.position)

  const restoreSelectionGuidesOnUndoRef = useRef(false)

  const showAnimationCellSelectionOutline = (): void => {
    hiddenAnimationCellSelectionSignatureRef.current = null
    setAnimationCellSelectionOutlineVisible(true)
  }

  const showAnimationSelectionOutline = (): void => {
    hiddenAnimationCellSelectionSignatureRef.current = null
    setSelectionOutlineVisible(true)
  }

  const showLayerSelectionOutline = (): void => {
    setSelectionOutlineVisible(true)
  }

  useEffect(() => {
    if (animationGestureSelection?.kind === 'cel' || animationGestureSelection?.kind === 'mask') {
      setAnimationCellSelectionOutlineVisible(true)
      return
    }
    if (hiddenAnimationCellSelectionSignatureRef.current === animationCellSelectionSignature) {
      setAnimationCellSelectionOutlineVisible(false)
      return
    }
    hiddenAnimationCellSelectionSignatureRef.current = null
    setAnimationCellSelectionOutlineVisible(session.selectedAnimationCellKeys.length > 0 || session.selectedAnimationMaskCellKeys.length > 0)
  }, [
    animationCellSelectionSignature,
    animationGestureSelection?.kind,
    session.document.id,
    session.selectedAnimationCellKeys.length,
    session.selectedAnimationMaskCellKeys.length,
    session.selectedAnimationMaskRowKeys.length
  ])

  useEffect(() => {
    if (previousSelectionStateSignatureRef.current === selectionStateSignature) {
      suppressSelectionOutlineOnNextSignatureRef.current = false
      return
    }
    previousSelectionStateSignatureRef.current = selectionStateSignature
    if (suppressSelectionOutlineOnNextSignatureRef.current) {
      suppressSelectionOutlineOnNextSignatureRef.current = false
      previousAnimationSelectionActiveRef.current =
        session.selectedAnimationFrameIds.length > 0 ||
        session.selectedAnimationCellKeys.length > 0 ||
        session.selectedAnimationMaskCellKeys.length > 0 ||
        session.selectedAnimationMaskRowKeys.length > 0
      setSelectionOutlineVisible(false)
      return
    }
    const animationSelectionActive =
      session.selectedAnimationFrameIds.length > 0 ||
      session.selectedAnimationCellKeys.length > 0 ||
      session.selectedAnimationMaskCellKeys.length > 0 ||
      session.selectedAnimationMaskRowKeys.length > 0
    const animationSelectionCleared = previousAnimationSelectionActiveRef.current && !animationSelectionActive
    previousAnimationSelectionActiveRef.current = animationSelectionActive
    if (animationSelectionCleared && !animationGestureSelection) {
      setSelectionOutlineVisible(false)
      return
    }
    setSelectionOutlineVisible(true)
  }, [
    animationGestureSelection,
    selectionStateSignature,
    session.selectedAnimationFrameIds.length,
    session.selectedAnimationCellKeys.length,
    session.selectedAnimationMaskCellKeys.length,
    session.selectedAnimationMaskRowKeys.length
  ])

  useEffect(() => {
    // Pixel commits can leave the memoized panel untouched. Track guide
    // transitions independently; only a visible presentation change renders rows.
    const syncContentGuides = (): void => {
      const current = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
      if (previousContentRevisionRef.current === current.contentRevision) return
      const previousHistoryPosition = previousHistoryPositionRef.current
      const historyMovedBack = current.history.position < previousHistoryPosition
      previousHistoryPositionRef.current = current.history.position
      previousContentRevisionRef.current = current.contentRevision
      if (current.selectionGuidesPreservedAtContentRevision === current.contentRevision) {
        setSelectionOutlineVisible(true)
        setAnimationCellSelectionOutlineVisible(current.selectedAnimationCellKeys.length > 0 || current.selectedAnimationMaskCellKeys.length > 0)
        return
      }
      if (historyMovedBack && restoreSelectionGuidesOnUndoRef.current) {
        // A preserve event belongs to the edit being undone; do not let it leak
        // into the next content revision and mask the undo transition.
        preserveSelectionOnNextContentRevisionRef.current = false
        setSelectionOutlineVisible(true)
        setAnimationCellSelectionOutlineVisible(current.selectedAnimationCellKeys.length > 0 || current.selectedAnimationMaskCellKeys.length > 0)
        return
      }
      // Capture the guide state before handling the preserve flag. Selection
      // transforms can explicitly preserve guides, and undo must restore that
      // same pre-edit state.
      if (!historyMovedBack) restoreSelectionGuidesOnUndoRef.current = selectionOutlineVisible
      if (preserveSelectionOnNextContentRevisionRef.current) {
        preserveSelectionOnNextContentRevisionRef.current = false
        return
      }
      // Clearing panel guides is cosmetic; let the committed canvas paint and
      // subsequent input take priority over rendering a large layer tree.
      if (selectionOutlineVisible) startTransition(() => setSelectionOutlineVisible(false))
    }
    syncContentGuides()
    return useWorkspace.subscribe(syncContentGuides)
  }, [
    session.document.id,
    session.contentRevision,
    session.history.position,
    session.selectedAnimationCellKeys.length,
    session.selectedAnimationMaskCellKeys.length,
    selectionOutlineVisible
  ])

  useEffect(() => {
    const preserveSelection = (event: Event): void => {
      const detail = (event as CustomEvent<CanvasSelectionPreserveDetail>).detail
      if (detail.documentId === session.document.id) {
        preserveSelectionOnNextContentRevisionRef.current = true
        setSelectionOutlineVisible(true)
      }
    }
    window.addEventListener(CANVAS_SELECTION_PRESERVE_EVENT, preserveSelection)
    return () => window.removeEventListener(CANVAS_SELECTION_PRESERVE_EVENT, preserveSelection)
  }, [session.document.id])

  useEffect(() => {
    const startCanvasSelection = (event: Event): void => {
      const detail = (event as CustomEvent<CanvasSelectionStartedDetail>).detail
      if (detail.documentId !== session.document.id) return
      animationGestures.clearPreviewSelection()
      setAnimationCellSelectionOutlineVisible(false)
      setSelectionOutlineVisible(false)
    }
    window.addEventListener(CANVAS_SELECTION_STARTED_EVENT, startCanvasSelection)
    return () => window.removeEventListener(CANVAS_SELECTION_STARTED_EVENT, startCanvasSelection)
  }, [session.document.id, store])

  const revealMountedLayer = useCallback((layerId: string): boolean => {
    cancelLayerRevealRef.current?.()
    cancelLayerRevealRef.current = null
    const list = layerListRef.current
    const row = list && Array.from(list.querySelectorAll<HTMLElement>('[data-layer-id]')).find((candidate) => candidate.dataset.layerId === layerId)
    if (!list || !row) return false
    cancelLayerRevealRef.current = observeLayerPanelReveal(list, row)
    return true
  }, [layerListRef])

  useEffect(() => {
    const revealLayer = (event: Event): void => {
      const detail = (event as CustomEvent<LayerPanelRevealDetail>).detail
      if (detail.documentId !== session.document.id) return
      const liveSession = useWorkspace.getState().sessions.find((item) => item.document.id === detail.documentId)
      const layer = liveSession?.document.layers.find((candidate) => candidate.id === detail.layerId)
      if (!liveSession || !layer) return
      useWorkspace.getState().revealLayerInPanel(detail.documentId, detail.layerId)
      revealSequenceRef.current += 1
      // Repeated canvas clicks need scrolling feedback, not new panel state.
      if (revealMountedLayer(detail.layerId)) return
      setLayerRevealRequest({ layerId: detail.layerId, sequence: revealSequenceRef.current })
    }
    window.addEventListener(LAYER_PANEL_REVEAL_EVENT, revealLayer)
    return () => {
      window.removeEventListener(LAYER_PANEL_REVEAL_EVENT, revealLayer)
      cancelLayerRevealRef.current?.()
    }
  }, [session.document.id, revealMountedLayer])

  useLayoutEffect(() => {
    if (!layerRevealRequest || layerRevealRequest.sequence !== revealSequenceRef.current) return
    revealMountedLayer(layerRevealRequest.layerId)
  }, [layerRevealRequest, revealMountedLayer])

  useEffect(() => {
    const clearOutsideSelection = (event: PointerEvent): void => {
      const target = event.target instanceof Element ? event.target : null
      const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
      const list = layerListRef.current
      if (!target || isScrollbarPointer(event)) return
      // This listener runs before control handlers (including portalled ones).
      // Parameter editing must retain the batch it is about to operate on.
      if (target.closest('input[type="range"], [role="slider"], .range-field, .pressure-range-stack, .color-editor-field')) return
      const rangeLabel = target.closest('label')
      if (rangeLabel?.control instanceof HTMLInputElement && rangeLabel.control.type === 'range') return
      const insideList = Boolean(list?.contains(target))
      if (
        insideList &&
        target.closest(
          '.layer-animation-toolbar, .layer-animation-edit, .panel-actions, .layer-style-indicator, .layer-status-icon-tooltip, .layer-visibility, .layer-lock-toggle, .group-folder, .layer-tilemap-indicator, .layer-instance-properties'
        )
      )
        return
      // Property forms are portalled outside the timeline.  They edit the
      // existing explicit selection, so interacting with any form control
      // must not be treated as a click on empty canvas/UI and clear it.
      if (
        target?.closest(
          '[data-animation-frame-id], [data-animation-cel-key], [data-animation-mask-cel-key], [data-preserve-animation-selection], .context-menu, .layer-context-menu, .layer-modal, .frame-properties-modal, .cel-properties-modal'
        )
      )
        return
      if (insideList && target.closest('[data-layer-id], [data-group-id], [data-layer-mask-row-owner]')) return
      const canvasTarget = target?.closest('.stage-canvas, .stage-surface')
      // Canvas interactions (drawing, panning, zooming, and selection edits)
      // keep the current frame/cel context. Only another timeline item changes
      // the active animation selection.
      if (canvasTarget) return
      if (
        active &&
        (active.selectedAnimationFrameIds.length > 0 ||
          active.selectedAnimationCellKeys.length > 0 ||
          active.selectedAnimationMaskCellKeys.length > 0 ||
          active.selectedLayerIds.length > 0 ||
          active.selectedGroupIds.length > 0 ||
          active.selectedGroupId !== null)
      ) {
        suppressSelectionOutlineOnNextSignatureRef.current = true
        animationGestures.clearPreviewSelection()
        setSelectionOutlineVisible(false)
        setAnimationCellSelectionOutlineVisible(false)
        clearSelectionFromBlankRef.current()
      }
    }
    window.addEventListener('pointerdown', clearOutsideSelection, true)
    return () => window.removeEventListener('pointerdown', clearOutsideSelection, true)
  }, [session.document.id, shortcuts, store])

  const clearSelectionFromBlank = useCallback((): void => {
    store.clearAnimationSelection(true)
  }, [store])

  clearSelectionFromBlankRef.current = clearSelectionFromBlank
  return {
    animationCellSelectionOutlineVisible,
    setAnimationCellSelectionOutlineVisible,
    selectionOutlineVisible,
    setSelectionOutlineVisible,
    suppressSelectionOutlineOnNextSignatureRef,
    preserveSelectionOnNextContentRevisionRef,
    showAnimationCellSelectionOutline,
    showAnimationSelectionOutline,
    showLayerSelectionOutline,
    clearSelectionFromBlank
  }
}
