import { useEffect, useRef } from 'react'
import type { RefObject, PointerEvent } from 'react'
import type { CanvasDragState, CanvasInputState, CanvasPoint } from '@/core/canvas-input'
import { gradientEditHandle, pendingGradientFor, setPendingGradient, type GradientEditHandle, type PendingGradient } from '@/core/canvas-gradient-confirmation'
import { canvasCursors } from '@/core/canvas-visuals'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activePaintLayer, cloneSelectionMask } from '@/store/workspace-session'
import { captureGradientContext, gradientContextMatches, refreshPendingGradientRegion } from '@/store/pending-gradient-session'
import { translateCurrent as tr } from '@/core/localization'
import type { createFillCanvasInput } from './canvas-input-fill'
interface Ports {
  session: DocumentSession
  canvasRef: RefObject<HTMLCanvasElement | null>
  inputRef: RefObject<CanvasInputState>
  gradientEditRef: RefObject<{ handle: GradientEditHandle; pointerId: number; origin: CanvasPoint; start: CanvasPoint; end: CanvasPoint; center?: CanvasPoint; bounds?: { x: number; y: number; width: number; height: number } } | null>
  fillInput: ReturnType<typeof createFillCanvasInput>
  mode: 'instant' | 'confirm'
  scheduleDraw: () => void
  localPoint: (event: PointerEvent<HTMLCanvasElement>) => CanvasPoint | null
  localContinuousPointAt: (x: number, y: number) => CanvasPoint | null
  updateCursor: (event: PointerEvent<HTMLCanvasElement>) => void
  syncPenCursor: (event: PointerEvent<HTMLCanvasElement>) => void
  updateGradientDragGeometry: (drag: CanvasDragState, point: CanvasPoint, modifiers: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>) => void
  gradientStopsForButton: (button: number) => import('@shared/types-brush').GradientStop[] | undefined
  paintSelectionForDrag: (drag: CanvasDragState) => import('@shared/types-selection').SelectionMask | null
}
export function useCanvasGradientConfirmation(ports: Ports) {
  const { session, canvasRef, inputRef, gradientEditRef, scheduleDraw, localPoint, localContinuousPointAt,
    updateCursor, syncPenCursor, updateGradientDragGeometry } = ports
  const gradientType = session.gradientType
  const live = useRef(ports)
  live.current = ports
  const context = useRef<ReturnType<typeof captureGradientContext> | null>(null)
  const applying = useRef(false)
  const pendingType = useRef(session.gradientType)
  const editSnapshot = useRef<Partial<CanvasDragState> | null>(null)
  const releaseHandle = () => {
    const pointerId = gradientEditRef.current?.pointerId
    gradientEditRef.current = null
    if (pointerId !== undefined && canvasRef.current?.hasPointerCapture(pointerId)) canvasRef.current.releasePointerCapture(pointerId)
  }
  const cancel = () => {
    releaseHandle()
    context.current = null
    setPendingGradient(session.document.id, null)
    live.current.scheduleDraw()
  }
  const valid = (current: DocumentSession | undefined) => Boolean(current && context.current && gradientContextMatches(context.current, current))
  const apply = (): boolean => {
    const state = useWorkspace.getState()
    const current = state.sessions.find(item => item.document.id === session.document.id)
    const pending = pendingGradientFor(session.document.id)
    if (!pending || !current || state.activeId !== session.document.id) return false
    if (!valid(current)) { cancel(); useWorkspace.setState({ message: tr('gradient.pending.invalidated') }); return false }
    applying.current = true
    pending.committing = true
    releaseHandle()
    try {
      refreshPendingGradientRegion(pending, current)
      live.current.fillInput.endGradient({ drag: pending.drag, session: current, state, targetLayer: pending.targetLayer, selection: pending.selection })
      cancel()
      return true
    } catch (error) {
      useWorkspace.setState({ message: error instanceof Error ? error.message : tr('gradient.pending.failed') })
      return false
    } finally { applying.current = false; pending.committing = false }
  }
  const defer = (drag: CanvasDragState, released: DocumentSession): boolean => {
    if (ports.mode !== 'confirm' || drag.freeTilePlacementEdit) return false
    // A click with no extent is not an editable gradient and must not lock tools.
    if (drag.start.x === drag.last.x && drag.start.y === drag.last.y) { scheduleDraw(); return true }
    drag.gradientRotationStart = undefined
    drag.marqueeResizeStart = undefined
    context.current = captureGradientContext(released)
    pendingType.current = released.gradientType
    const pending: PendingGradient = { drag, targetLayer: activePaintLayer(released),
      selection: cloneSelectionMask(ports.paintSelectionForDrag(drag)), regionOrigin: { ...drag.start }, apply, cancel }
    pending.regionKey = `${released.gradientTolerance}:${released.gradientContiguous}:${released.fillReference}:${released.fillConnectivity}`
    setPendingGradient(released.document.id, pending)
    scheduleDraw()
    return true
  }
  useEffect(() => {
    const unsubscribe = useWorkspace.subscribe(state => {
      if (applying.current || !pendingGradientFor(session.document.id)) return
      const current = state.sessions.find(item => item.document.id === session.document.id)
      if (valid(current)) return
      cancel()
      if (current) useWorkspace.setState({ message: tr('gradient.pending.invalidated') })
    })
    return () => { unsubscribe(); if (pendingGradientFor(session.document.id)) cancel() }
  }, [session.document.id])
  useEffect(() => {
    const pending = pendingGradientFor(session.document.id)
    if (!pending) return
    pending.apply = apply
    pending.cancel = cancel
    const button = pending.drag.gradientSourceButton ?? 0
    pending.drag.color = button === 2 ? session.secondaryColor : session.primaryColor
    pending.drag.gradientEndColor = button === 2 ? session.primaryColor : session.secondaryColor
    pending.drag.gradientStops = ports.gradientStopsForButton(button)
    if (pendingType.current !== session.gradientType) {
      pendingType.current = session.gradientType
      pending.drag.gradientRadialGeometry = undefined
      pending.drag.gradientRotationStart = undefined
      pending.drag.marqueeResizeStart = undefined
      ports.updateGradientDragGeometry(pending.drag, pending.drag.last, { altKey: false, ctrlKey: false, metaKey: false, shiftKey: Boolean(pending.drag.constrain) })
    }
    refreshPendingGradientRegion(pending, session)
    scheduleDraw()
  }, [session.document.id, session.primaryColor, session.secondaryColor, session.gradientStops, session.gradientFreeform,
    session.gradientTolerance, session.gradientContiguous, session.fillReference, session.fillConnectivity, session.gradientType, session.gradientDither])
  const gradientPending = (): PendingGradient | null => pendingGradientFor(session.document.id)
  const beginPendingGradientEdit = (event: PointerEvent<HTMLCanvasElement>): boolean => {
    const pending = gradientPending()
    if (event.pointerType === 'touch' || session.animationPlaying) return false
    if (!pending || session.tool !== 'fill' || session.fillKind !== 'gradient' || event.button !== 0 || event.ctrlKey || event.metaKey || inputRef.current.spaceHeld || inputRef.current.drag) return false
    const point = localPoint(event) ?? localContinuousPointAt(event.clientX, event.clientY)
    const drag = pending.drag
    const handle = point ? gradientEditHandle(drag, point, session.view.zoom, gradientType === 'radial') : null
    if (!handle || !point) return false
    gradientEditRef.current = {
      handle, pointerId: event.pointerId, origin: point, start: { ...drag.start }, end: { ...drag.last },
      center: drag.gradientRadialGeometry ? { ...drag.gradientRadialGeometry.center } : undefined,
      bounds: drag.marqueeBounds ? { ...drag.marqueeBounds } : undefined
    }
    editSnapshot.current = { start: { ...drag.start }, last: { ...drag.last }, rawLast: drag.rawLast && { ...drag.rawLast },
      gradientRadialGeometry: drag.gradientRadialGeometry && { ...drag.gradientRadialGeometry, center: { ...drag.gradientRadialGeometry.center } },
      gradientAngle: drag.gradientAngle, gradientFromCenter: drag.gradientFromCenter, constrain: drag.constrain,
      marqueeBounds: drag.marqueeBounds && { ...drag.marqueeBounds } }
    event.currentTarget.setPointerCapture(event.pointerId)
    updateCursor(event)
    event.currentTarget.style.cursor = canvasCursors.move
    syncPenCursor(event)
    event.preventDefault()
    return true
  }
  const movePendingGradientEdit = (event: PointerEvent<HTMLCanvasElement>): boolean => {
    const edit = gradientEditRef.current
    if (!edit || edit.pointerId !== event.pointerId) {
      if (session.tool !== 'fill' || session.fillKind !== 'gradient' || inputRef.current.drag || inputRef.current.spaceHeld || event.ctrlKey || event.metaKey) return false
      if (!gradientPending()) return false
      updateCursor(event)
      syncPenCursor(event)
      return true
    }
    const point = localPoint(event) ?? localContinuousPointAt(event.clientX, event.clientY)
    const drag = gradientPending()?.drag
    if (!point || drag?.kind !== 'gradient') return true
    const dx = point.x - edit.origin.x
    const dy = point.y - edit.origin.y
    if (edit.handle === 'move') {
      drag.start = { x: edit.start.x + dx, y: edit.start.y + dy }
      drag.last = { x: edit.end.x + dx, y: edit.end.y + dy }
      if (edit.center && drag.gradientRadialGeometry) drag.gradientRadialGeometry.center = { x: edit.center.x + dx, y: edit.center.y + dy }
      if (edit.bounds) drag.marqueeBounds = { ...edit.bounds, x: edit.bounds.x + dx, y: edit.bounds.y + dy }
    } else if (edit.handle === 'start') {
      drag.start = point
    } else {
      updateGradientDragGeometry(drag, point, event)
    }
    updateCursor(event)
    event.currentTarget.style.cursor = canvasCursors.move
    syncPenCursor(event)
    scheduleDraw()
    event.preventDefault()
    return true
  }
  const endPendingGradientEdit = (event: PointerEvent<HTMLCanvasElement>): boolean => {
    if (gradientEditRef.current?.pointerId !== event.pointerId) return false
    gradientEditRef.current = null
    const drag = gradientPending()?.drag
    if (drag?.kind === 'gradient') {
      drag.gradientRotationStart = undefined
      drag.marqueeResizeStart = undefined
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    updateCursor(event)
    syncPenCursor(event)
    scheduleDraw()
    event.preventDefault()
    return true
  }
  const cancelPendingGradientEdit = (event: PointerEvent<HTMLCanvasElement>): boolean => {
    if (gradientEditRef.current?.pointerId !== event.pointerId) return false
    const pending = gradientPending()
    if (pending && editSnapshot.current) Object.assign(pending.drag, editSnapshot.current)
    editSnapshot.current = null
    releaseHandle()
    const drag = gradientPending()?.drag
    if (drag?.kind === 'gradient') {
      drag.gradientRotationStart = undefined
      drag.marqueeResizeStart = undefined
    }
    scheduleDraw()
    return true
  }
  return { defer, gradientPending, beginPendingGradientEdit, movePendingGradientEdit, endPendingGradientEdit, cancelPendingGradientEdit }
}
