import type { RefObject } from 'react'
import type { EditorPreferences } from '@/core/file-preferences'
import { cursorOverlayDescriptor, setNativeCursorVisible } from '@/platform/cursor-theme'
import { AUTO_CONTRAST_FILTER } from './canvas-adaptive-contrast'

export interface CanvasPenCursorPorts {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>
  readonly interfaceScale: import('@/core/file-preferences').UiScale
  readonly paintingPoint?: (point: { x: number; y: number }) => { x: number; y: number }
  readonly stageBounds: () => DOMRect
}

export interface CanvasPenCursorRefs {
  readonly penCursorRef: RefObject<HTMLImageElement | null>
  readonly adaptiveCursorRef: RefObject<HTMLSpanElement | null>
  readonly penCursorStateRef: RefObject<{ active: boolean; pressure: boolean; x: number; y: number }>
  readonly cursorPreferencesRef: RefObject<Pick<EditorPreferences, 'useLocalCursors' | 'cursorScale' | 'paintingCursorType' | 'cursorColorMode' | 'cursorColor'> | null>
}

export const hidePenCursor = (ports: CanvasPenCursorPorts, refs: CanvasPenCursorRefs): void => {
  const wasActive = refs.penCursorStateRef.current.active
  refs.penCursorStateRef.current.active = false
  if (refs.penCursorRef.current) refs.penCursorRef.current.hidden = true
  if (refs.adaptiveCursorRef.current) refs.adaptiveCursorRef.current.hidden = true
  if (ports.canvasRef.current) { delete ports.canvasRef.current.dataset.adaptiveCursor; delete ports.canvasRef.current.dataset.paintingCursor }
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
  const type = preferences?.paintingCursorType ?? 'sprite'
  const selectionCursor = /^var\(--cursor-(?:selection-(?:black|white)|crosshair)\)$/.test(canvas.style.cursor)
  const systemCrosshair = adaptive && (type === 'simple' || selectionCursor) && preferences?.useLocalCursors
  if (systemCrosshair) canvas.dataset.paintingCursor = 'system'
  else delete canvas.dataset.paintingCursor
  const paintingScale = type === 'simple' ? preferences?.cursorScale ?? 1 : type === 'sprite' ? ports.interfaceScale : 1
  const descriptor = systemCrosshair ? null : cursorOverlayDescriptor(canvas.style.cursor, preferences?.useLocalCursors ?? false, adaptive ? paintingScale : preferences?.cursorScale ?? 1, ports.interfaceScale)
  const softwarePen = pointer.pressure && Boolean(descriptor)
  if (softwarePen) document.documentElement.dataset.penInput = 'true'
  else delete document.documentElement.dataset.penInput
  void setNativeCursorVisible(!softwarePen).catch(() => undefined)
  const overlay = refs.adaptiveCursorRef.current
  if (overlay) overlay.hidden = !adaptive || !descriptor
  if (adaptive && descriptor && overlay) {
    canvas.dataset.adaptiveCursor = 'true'
    overlay.style.maskImage = `url("${descriptor.source}")`
    const color = preferences?.cursorColor
    overlay.style.backdropFilter = preferences?.cursorColorMode === 'custom' ? 'none' : AUTO_CONTRAST_FILTER
    overlay.style.backgroundColor = preferences?.cursorColorMode === 'custom' && color ? `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})` : ''
    overlay.style.width = `${descriptor.size}px`
    overlay.style.height = `${descriptor.size}px`
    const point = type !== 'simple' && ports.paintingPoint ? ports.paintingPoint(pointer) : pointer
    overlay.style.transform = `translate3d(${point.x - descriptor.hotspotX}px, ${point.y - descriptor.hotspotY}px, 0)`
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
