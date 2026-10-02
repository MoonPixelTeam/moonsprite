import { useEffect, useLayoutEffect, useRef } from 'react'
import { CANVAS_VIEWPORT_EVENT } from './canvas-viewport-events'
import { loadEditorPreferences } from '@/core/file-preferences'
import { PointerPressureAdapter } from '@/core/canvas-input'
import { isPressurePointerType } from '@/core/pressure'
import { hidePenCursor, refreshPenCursor, type CanvasPenCursorClientPoint, type CanvasCursorPositionUpdater, type CanvasPenCursorPorts, type CanvasPenCursorRefs } from './canvas-pen-cursor-state'
import { useCanvasPenCursorRawInput } from './canvas-pen-cursor-raw-input'
interface Ports extends CanvasPenCursorPorts {
  readonly pressureAdapterRef: import('react').RefObject<PointerPressureAdapter>
}

export function useCanvasPenCursor(ports: Ports) {
  const penCursorRef = useRef<HTMLImageElement>(null)
  const adaptiveCursorRef = useRef<HTMLSpanElement>(null)
  const penCursorStateRef = useRef({ active: false, pressure: false, x: 0, y: 0 })

  const cursorPreferencesRef = useRef<CanvasPenCursorRefs['cursorPreferencesRef']['current']>(null)

  if (!cursorPreferencesRef.current) {
    const preferences = loadEditorPreferences()
    cursorPreferencesRef.current = preferences
  }

  const refs: CanvasPenCursorRefs = { penCursorRef, adaptiveCursorRef, penCursorStateRef, cursorPreferencesRef }
  const livePortsRef = useRef(ports)
  livePortsRef.current = ports
  const clientPointRef = useRef<CanvasPenCursorClientPoint | null>(null)
  const moveCursorRef = useRef<CanvasCursorPositionUpdater | undefined>(undefined)
  const appliedCanvasStyleRef = useRef<string | null>(null)
  const hideCursor = (): void => {
    moveCursorRef.current = undefined
    clientPointRef.current = null
    hidePenCursor(livePortsRef.current, refs)
  }
  const refreshCursor = (): void => {
    const current = livePortsRef.current
    const client = clientPointRef.current
    moveCursorRef.current = refreshPenCursor(current, refs, () => {
      if (!client) return
      const bounds = current.stageBounds()
      penCursorStateRef.current.x = client.x - bounds.left
      penCursorStateRef.current.y = client.y - bounds.top
    })
    appliedCanvasStyleRef.current = current.canvasRef.current?.style.cssText ?? null
  }

  const syncPenCursor = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const pressurePointer = isPressurePointerType(event.pointerType) || ports.pressureAdapterRef.current.isPressureCapable(event.pointerId)
    const previous = clientPointRef.current
    const staleMoveAfterRaw = previous?.source === 'raw' && previous.pointerId === event.pointerId && previous.pointerType === event.pointerType && event.timeStamp <= previous.timeStamp
    if (!staleMoveAfterRaw && (!previous || previous.pointerId !== event.pointerId || previous.pointerType !== event.pointerType || event.timeStamp >= previous.timeStamp)) {
      clientPointRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, pointerType: event.pointerType, buttons: event.buttons, timeStamp: event.timeStamp, source: 'move' }
    }
    penCursorStateRef.current = {
      active: true,
      pressure: pressurePointer,
      x: 0,
      y: 0
    }
    refreshCursor()
  }

  // Transform toolbars can move the stage without a pointer event. Keep the
  // screen hotspot fixed and use the latest pixel-alignment geometry.
  useLayoutEffect(refreshCursor)

  useCanvasPenCursorRawInput({ canvasRef: ports.canvasRef, clientPointRef, penCursorStateRef, moveCursorRef })

  useEffect(() => {
    const leave = (event: PointerEvent) => { if (!event.relatedTarget) hideCursor() }
    window.addEventListener('blur', hideCursor)
    window.addEventListener('moonsprite:extension-pointer-enter', hideCursor)
    window.addEventListener(CANVAS_VIEWPORT_EVENT, refreshCursor)
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('blur', hideCursor)
      window.removeEventListener('moonsprite:extension-pointer-enter', hideCursor)
      window.removeEventListener(CANVAS_VIEWPORT_EVENT, refreshCursor)
      document.documentElement.removeEventListener('pointerleave', leave)
    }
  }, [])

  useEffect(() => {
    const canvas = ports.canvasRef.current
    if (!canvas || typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(() => {
      // Input and layout effects already applied these styles. Re-reading
      // bounds in the observer would flush layout after their DOM writes.
      // Keep observing external cursor and size changes between input events.
      if (canvas.style.cssText !== appliedCanvasStyleRef.current) refreshCursor()
    })
    observer.observe(canvas, { attributes: true, attributeFilter: ['style'] })
    return () => {
      observer.disconnect()
      hideCursor()
    }
  }, [])
  return { penCursorRef, adaptiveCursorRef, cursorPreferencesRef, hidePenCursor: hideCursor, refreshPenCursor: refreshCursor, syncPenCursor }
}
