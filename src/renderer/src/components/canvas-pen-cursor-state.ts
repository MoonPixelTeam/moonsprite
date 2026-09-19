import type { RefObject } from 'react'
import type { CursorScale } from '@/core/file-preferences'
import { cursorOverlayDescriptor, setNativeCursorVisible } from '@/platform/cursor-theme'
import { AUTO_CONTRAST_FILTER } from './canvas-adaptive-contrast'

export interface CanvasPenCursorPorts {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>
  readonly interfaceScale: import('@/core/file-preferences').UiScale
  readonly stageBounds: () => DOMRect
}

export interface CanvasPenCursorRefs {
  readonly penCursorRef: RefObject<HTMLImageElement | null>
  readonly adaptiveCursorRef: RefObject<HTMLSpanElement | null>
  readonly penCursorStateRef: RefObject<{ active: boolean; pressure: boolean; x: number; y: number }>
  readonly cursorPreferencesRef: RefObject<{ useLocalCursors: boolean; cursorScale: CursorScale } | null>
}

export const hidePenCursor = (ports: CanvasPenCursorPorts, refs: CanvasPenCursorRefs): void => {
  const wasActive = refs.penCursorStateRef.current.active
  refs.penCursorStateRef.current.active = false
  if (refs.penCursorRef.current) refs.penCursorRef.current.hidden = true
  if (refs.adaptiveCursorRef.current) refs.adaptiveCursorRef.current.hidden = true
  if (ports.canvasRef.current) delete ports.canvasRef.current.dataset.adaptiveCursor
  if (!wasActive) return
  delete document.documentElement.dataset.penInput
  void setNativeCursorVisible(true).catch(() => undefined)
}

export const refreshPenCursor = (ports: CanvasPenCursorPorts, refs: CanvasPenCursorRefs): void => {
  const canvas = ports.canvasRef.current
  const image = refs.penCursorRef.current
  const pointer = refs.penCursorStateRef.current
  if (!canvas || !image || !pointer.active) return
  const adaptive = /^var\(--cursor-(?:pencil-(?:black|white)|selection-(?:black|white)|crosshair)\)$/.test(canvas.style.cursor)
  const preferences = refs.cursorPreferencesRef.current
  const descriptor = cursorOverlayDescriptor(canvas.style.cursor, preferences?.useLocalCursors ?? false, preferences?.cursorScale ?? 1, ports.interfaceScale)
  const overlay = refs.adaptiveCursorRef.current
  if (overlay) overlay.hidden = !adaptive || !descriptor
  if (adaptive && descriptor && overlay) {
    canvas.dataset.adaptiveCursor = 'true'
    overlay.style.maskImage = `url("${descriptor.source}")`
    overlay.style.backdropFilter = AUTO_CONTRAST_FILTER
    overlay.style.width = `${descriptor.size}px`
    overlay.style.height = `${descriptor.size}px`
    overlay.style.transform = `translate3d(${pointer.x - descriptor.hotspotX}px, ${pointer.y - descriptor.hotspotY}px, 0)`
    image.hidden = true
    return
  }
  delete canvas.dataset.adaptiveCursor
  if (!pointer.pressure || !descriptor) {
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
