import { useEffect, useLayoutEffect, useRef } from 'react'
import { CANVAS_VIEWPORT_EVENT } from './canvas-viewport-events'
import { loadEditorPreferences } from '@/core/file-preferences'
import { PointerPressureAdapter } from '@/core/canvas-input'
import { isPressurePointerType } from '@/core/pressure'
import { hidePenCursor, refreshPenCursor, type CanvasPenCursorPorts, type CanvasPenCursorRefs } from './canvas-pen-cursor-state'
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
  const clientPointRef = useRef<{ x: number; y: number } | null>(null)
  const hideCursor = (): void => hidePenCursor(livePortsRef.current, refs)
  const refreshCursor = (): void => {
    const current = livePortsRef.current
    const client = clientPointRef.current
    if (client && penCursorStateRef.current.active) {
      const bounds = current.stageBounds()
      penCursorStateRef.current.x = client.x - bounds.left
      penCursorStateRef.current.y = client.y - bounds.top
    }
    refreshPenCursor(current, refs)
  }

  const syncPenCursor = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const pressurePointer = isPressurePointerType(event.pointerType) || ports.pressureAdapterRef.current.isPressureCapable(event.pointerId)
    clientPointRef.current = { x: event.clientX, y: event.clientY }
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
    const observer = new MutationObserver(refreshCursor)
    observer.observe(canvas, { attributes: true, attributeFilter: ['style'] })
    return () => {
      observer.disconnect()
      hideCursor()
    }
  }, [])
  return { penCursorRef, adaptiveCursorRef, cursorPreferencesRef, hidePenCursor: hideCursor, refreshPenCursor: refreshCursor, syncPenCursor }
}
