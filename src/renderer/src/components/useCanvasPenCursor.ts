import { useEffect, useRef } from 'react'
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
  const hideCursor = (): void => hidePenCursor(ports, refs)
  const refreshCursor = (): void => refreshPenCursor(ports, refs)

  const syncPenCursor = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const pressurePointer = isPressurePointerType(event.pointerType) || ports.pressureAdapterRef.current.isPressureCapable(event.pointerId)
    const bounds = ports.stageBounds()
    penCursorStateRef.current = {
      active: true,
      pressure: pressurePointer,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    }
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
