import { useEffect, useRef } from 'react'
import { loadEditorPreferences, type CursorScale } from '@/core/file-preferences'
import { PointerPressureAdapter } from '@/core/canvas-input'
import { isPressurePointerType } from '@/core/pressure'
import { setNativeCursorVisible } from '@/platform/cursor-theme'
import { hidePenCursor, refreshPenCursor, type CanvasPenCursorPorts, type CanvasPenCursorRefs } from './canvas-pen-cursor-state'
interface Ports extends CanvasPenCursorPorts {
  readonly pressureAdapterRef: import('react').RefObject<PointerPressureAdapter>
}

export function useCanvasPenCursor(ports: Ports) {
  const penCursorRef = useRef<HTMLImageElement>(null)
  const adaptiveCursorRef = useRef<HTMLSpanElement>(null)
  const penCursorStateRef = useRef({ active: false, pressure: false, x: 0, y: 0 })

  const cursorPreferencesRef = useRef<{ useLocalCursors: boolean; cursorScale: CursorScale } | null>(null)

  if (!cursorPreferencesRef.current) {
    const preferences = loadEditorPreferences()
    cursorPreferencesRef.current = { useLocalCursors: preferences.useLocalCursors, cursorScale: preferences.cursorScale }
  }

  const refs: CanvasPenCursorRefs = { penCursorRef, adaptiveCursorRef, penCursorStateRef, cursorPreferencesRef }
  const hideCursor = (): void => hidePenCursor(ports, refs)
  const refreshCursor = (): void => refreshPenCursor(ports, refs)

  const syncPenCursor = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const pressurePointer = isPressurePointerType(event.pointerType) || ports.pressureAdapterRef.current.isPressureCapable(event.pointerId)
    const bounds = ports.stageBounds()
    const wasPressure = penCursorStateRef.current.active && penCursorStateRef.current.pressure
    penCursorStateRef.current = {
      active: true,
      pressure: pressurePointer,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    }
    if (pressurePointer) document.documentElement.dataset.penInput = 'true'
    else delete document.documentElement.dataset.penInput
    if (wasPressure !== pressurePointer) void setNativeCursorVisible(!pressurePointer).catch(() => undefined)
    refreshCursor()
  }

  useEffect(() => {
    const leave = (event: PointerEvent) => { if (!event.relatedTarget) hideCursor() }
    window.addEventListener('blur', hideCursor)
    window.addEventListener('moonsprite:extension-pointer-enter', hideCursor)
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('blur', hideCursor)
      window.removeEventListener('moonsprite:extension-pointer-enter', hideCursor)
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
