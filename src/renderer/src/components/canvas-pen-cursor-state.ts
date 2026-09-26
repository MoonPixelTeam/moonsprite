import pixelCrossSvg from '@/assets/pixel-cross-cursor.svg?raw'
const pixelCrossSource = `data:image/svg+xml,${encodeURIComponent(pixelCrossSvg)}`
import type { RefObject } from 'react'
import type { EditorPreferences } from '@/core/file-preferences'
import { cursorOverlayDescriptor, setNativeCursorVisible } from '@/platform/cursor-theme'
import { AUTO_CONTRAST_FILTER } from './canvas-adaptive-contrast'

// The native synchronizer shares a pending promise. Attach one failure handler
// per operation, rather than retaining one closure for every pointer packet.
const observedVisibilityOperations = new WeakSet<Promise<void>>()
const syncNativeVisibility = (visible: boolean): void => {
  const operation = setNativeCursorVisible(visible)
  if (observedVisibilityOperations.has(operation)) return
  observedVisibilityOperations.add(operation)
  void operation.catch(() => undefined)
}
const setCursorFlag = (element: HTMLElement, key: string, value?: string): void => {
  if (element.dataset[key] === value) return
  if (value === undefined) delete element.dataset[key]
  else element.dataset[key] = value
}
const setHidden = (element: HTMLElement, hidden: boolean): void => {
  if (element.hidden !== hidden) element.hidden = hidden
}
const setCursorStyle = (element: HTMLElement, key: 'backgroundImage' | 'maskImage' | 'backdropFilter' | 'backgroundColor' | 'width' | 'height' | 'transform', value: string): void => {
  if (element.style[key] !== value) element.style[key] = value
}

export interface CanvasPenCursorPorts {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>
  readonly interfaceScale: import('@/core/file-preferences').UiScale
  readonly zoom?: number
  readonly paintingPoint?: (point: { x: number; y: number }) => { x: number; y: number }
  readonly stageBounds: () => DOMRect
}

export interface CanvasPenCursorRefs {
  readonly penCursorRef: RefObject<HTMLImageElement | null>
  readonly adaptiveCursorRef: RefObject<HTMLSpanElement | null>
  readonly penCursorStateRef: RefObject<{ active: boolean; pressure: boolean; x: number; y: number }>
  readonly cursorPreferencesRef: RefObject<Pick<EditorPreferences, 'useLocalCursors' | 'cursorScale' | 'paintingCursorShape' | 'paintingCursorAlignToPixel' | 'cursorColorMode' | 'cursorColor' | 'selectionCrosshair'> | null>
}

export const hidePenCursor = (ports: CanvasPenCursorPorts, refs: CanvasPenCursorRefs): void => {
  const wasActive = refs.penCursorStateRef.current.active
  refs.penCursorStateRef.current.active = false
  if (refs.penCursorRef.current) setHidden(refs.penCursorRef.current, true)
  if (refs.adaptiveCursorRef.current) setHidden(refs.adaptiveCursorRef.current, true)
  if (ports.canvasRef.current) { setCursorFlag(ports.canvasRef.current, 'adaptiveCursor'); setCursorFlag(ports.canvasRef.current, 'paintingCursor') }
  if (!wasActive) return
  setCursorFlag(document.documentElement, 'penInput')
  syncNativeVisibility(true)
}

export const refreshPenCursor = (ports: CanvasPenCursorPorts, refs: CanvasPenCursorRefs): void => {
  const canvas = ports.canvasRef.current
  const image = refs.penCursorRef.current
  const pointer = refs.penCursorStateRef.current
  if (!canvas || !image || !pointer.active) return
  const adaptive = /^var\(--cursor-(?:pencil-(?:black|white)|selection-(?:black|white)|crosshair)\)$/.test(canvas.style.cursor)
  const preferences = refs.cursorPreferencesRef.current
  const alignToPixel = preferences?.paintingCursorAlignToPixel === true
  const selectionCursor = /^var\(--cursor-(?:selection-(?:black|white)|crosshair)\)$/.test(canvas.style.cursor)
  const selectionOverlay = selectionCursor && preferences?.selectionCrosshair === true
  const dot = adaptive && (!selectionCursor || selectionOverlay) && preferences?.paintingCursorShape === 'dot'
  const pixelCross = adaptive && (!selectionCursor || selectionOverlay) && preferences?.paintingCursorShape === 'pixel-cross'
  const systemCrosshair = !selectionOverlay && !dot && !pixelCross && (!alignToPixel || selectionCursor) && adaptive && preferences?.useLocalCursors
  setCursorFlag(canvas, 'paintingCursor', systemCrosshair ? 'system' : undefined)
  const paintingScale = preferences?.cursorScale ?? 1
  const pixelCrossScale = paintingScale / (Number.isFinite(ports.interfaceScale) && ports.interfaceScale > 0 ? ports.interfaceScale : 1)
  const dotSize = 3 * paintingScale
  const descriptor = pixelCross ? { source: pixelCrossSource, size: 32 * pixelCrossScale, hotspotX: 15 * pixelCrossScale, hotspotY: 15 * pixelCrossScale } : dot ? { source: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%223%22 height=%223%22%3E%3Ccircle fill=%22white%22 cx=%221.5%22 cy=%221.5%22 r=%221.5%22/%3E%3C/svg%3E', size: dotSize, hotspotX: dotSize / 2, hotspotY: dotSize / 2 } : systemCrosshair ? null : cursorOverlayDescriptor(selectionOverlay ? 'var(--cursor-pencil-black)' : canvas.style.cursor, preferences?.useLocalCursors ?? false, adaptive ? paintingScale : preferences?.cursorScale ?? 1, ports.interfaceScale)
  const penDescriptor = descriptor
  const softwarePen = pointer.pressure && Boolean(descriptor)
  setCursorFlag(document.documentElement, 'penInput', softwarePen ? 'true' : undefined)
  syncNativeVisibility(!softwarePen)
  const overlay = refs.adaptiveCursorRef.current
  if (overlay) setHidden(overlay, !adaptive || !descriptor)
  if (adaptive && descriptor && overlay) {
    setCursorFlag(canvas, 'adaptiveCursor', 'true')
    setCursorStyle(overlay, 'maskImage', pixelCross ? 'none' : `url("${descriptor.source}")`)
    setCursorStyle(overlay, 'backgroundImage', pixelCross ? `url("${descriptor.source}")` : 'none')
    const color = preferences?.cursorColor
    setCursorStyle(overlay, 'backdropFilter', pixelCross || preferences?.cursorColorMode === 'custom' ? 'none' : AUTO_CONTRAST_FILTER)
    setCursorStyle(overlay, 'backgroundColor', !pixelCross && preferences?.cursorColorMode === 'custom' && color ? `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})` : '')
    setCursorStyle(overlay, 'width', `${descriptor.size}px`)
    setCursorStyle(overlay, 'height', `${descriptor.size}px`)
    const point = alignToPixel && ports.paintingPoint ? ports.paintingPoint(pointer) : pointer
    setCursorStyle(overlay, 'transform', `translate3d(${point.x - descriptor.hotspotX}px, ${point.y - descriptor.hotspotY}px, 0)`)
    setHidden(image, true)
    return
  }
  setCursorFlag(canvas, 'adaptiveCursor')
  if (!pointer.pressure || !penDescriptor) {
    setHidden(image, true)
    return
  }
  if (image.dataset.source !== penDescriptor.source) {
    image.dataset.source = penDescriptor.source
    image.src = penDescriptor.source
  }
  setCursorStyle(image, 'width', `${penDescriptor.size}px`)
  setCursorStyle(image, 'height', `${penDescriptor.size}px`)
  setCursorStyle(image, 'transform', `translate3d(${pointer.x - penDescriptor.hotspotX}px, ${pointer.y - penDescriptor.hotspotY}px, 0)`)
  setHidden(image, false)
}
