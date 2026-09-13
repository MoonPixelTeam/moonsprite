import { useEffect, useRef } from 'react'
import { loadEditorPreferences, type CursorScale } from '@/core/file-preferences'
import { PointerPressureAdapter } from '@/core/canvas-input'
import { isPressurePointerType } from '@/core/pressure'
import { cursorOverlayDescriptor, setNativeCursorVisible } from '@/platform/cursor-theme'
interface Ports {
  readonly canvasRef: import('react').RefObject<HTMLCanvasElement | null>
  readonly interfaceScale: 0.75 | 1 | 1.5 | 2
  readonly pressureAdapterRef: import('react').RefObject<PointerPressureAdapter>
  readonly stageBounds: () => DOMRect
}

export function useCanvasPenCursor(ports: Ports) {
  const penCursorRef = useRef<HTMLImageElement>(null)

  const penCursorStateRef = useRef({ active: false, x: 0, y: 0 })

  const cursorPreferencesRef = useRef<{ useLocalCursors: boolean; cursorScale: CursorScale } | null>(null)

  if (!cursorPreferencesRef.current) {
    const preferences = loadEditorPreferences()
    cursorPreferencesRef.current = { useLocalCursors: preferences.useLocalCursors, cursorScale: preferences.cursorScale }
  }

  const hidePenCursor = (): void => {
    const wasActive = penCursorStateRef.current.active
    penCursorStateRef.current.active = false
    if (penCursorRef.current) penCursorRef.current.hidden = true
    if (!wasActive) return
    delete document.documentElement.dataset.penInput
    void setNativeCursorVisible(true).catch(() => undefined)
  }

  const refreshPenCursor = (): void => {
    const canvas = ports.canvasRef.current
    const image = penCursorRef.current
    const pointer = penCursorStateRef.current
    if (!canvas || !image || !pointer.active) return
    const preferences = cursorPreferencesRef.current
    const descriptor = cursorOverlayDescriptor(canvas.style.cursor, preferences?.useLocalCursors ?? false, preferences?.cursorScale ?? 1, ports.interfaceScale)
    if (!descriptor) {
      image.hidden = true
      return
    }
    if (image.dataset.source !== descriptor.source) {
      image.dataset.source = descriptor.source
      image.src = descriptor.source
    }
    image.style.width = `${descriptor.size}px`
    image.style.height = `${descriptor.size}px`
    image.style.transform = `translate3d(${pointer.x - descriptor.hotspotX}px, ${pointer.y - descriptor.hotspotY}px, 0)`
    image.hidden = false
  }

  const syncPenCursor = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const pressurePointer = isPressurePointerType(event.pointerType) || ports.pressureAdapterRef.current.isPressureCapable(event.pointerId)
    if (!pressurePointer) {
      hidePenCursor()
      return
    }
    const bounds = ports.stageBounds()
    const wasActive = penCursorStateRef.current.active
    penCursorStateRef.current = {
      active: true,
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    }
    document.documentElement.dataset.penInput = 'true'
    if (!wasActive) void setNativeCursorVisible(false).catch(() => undefined)
    refreshPenCursor()
  }

  useEffect(() => {
    const canvas = ports.canvasRef.current
    if (!canvas || typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(refreshPenCursor)
    observer.observe(canvas, { attributes: true, attributeFilter: ['style'] })
    return () => {
      observer.disconnect()
      hidePenCursor()
    }
  }, [])
  return { penCursorRef, cursorPreferencesRef, hidePenCursor, refreshPenCursor, syncPenCursor }
}
