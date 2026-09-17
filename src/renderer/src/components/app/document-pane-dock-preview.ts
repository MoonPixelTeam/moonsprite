import type { DocumentPaneDirection } from '@/core/document-pane-layout'

export const DOCUMENT_PANE_DOCK_PREVIEW_ATTRIBUTE = 'data-document-pane-dock-preview'

export interface DocumentPaneDockPreviewUpdate {
  surface: HTMLElement | null
  visible: boolean
}

export interface DocumentPaneDockPreviewGeometry {
  left: number
  top: number
  width: number
  height: number
}

export interface DocumentPaneDockPreviewRect {
  left: number
  top: number
  width: number
  height: number
}

export interface DocumentPaneDockPreviewBar extends DocumentPaneDockPreviewGeometry {
  direction: DocumentPaneDirection
}

const DOCK_PREVIEW_BAND_RATIO = 0.05
const DOCK_PREVIEW_MIN_BAND = 18
const DOCK_PREVIEW_MAX_BAND = 56

export const documentPaneDockPreviewBand = (span: number): number => {
  const scaled = Number.isFinite(span) ? span * DOCK_PREVIEW_BAND_RATIO : DOCK_PREVIEW_MIN_BAND
  return Math.max(DOCK_PREVIEW_MIN_BAND, Math.min(DOCK_PREVIEW_MAX_BAND, scaled))
}

// The pane keeps its own footprint and the preview band is drawn by a fixed overlay:
// a grid column grown past the pane edge is clipped by the surrounding work area and
// then painted over by the neighbouring dock, which hides the preview completely when
// the pane already touches the edge of the workspace.
export const documentPaneDockPreviewGeometry = (rect: DocumentPaneDockPreviewRect, direction: DocumentPaneDirection): DocumentPaneDockPreviewGeometry => {
  if (direction === 'left' || direction === 'right') {
    const band = documentPaneDockPreviewBand(rect.width)
    return {
      left: direction === 'left' ? rect.left : rect.left + rect.width - band,
      top: rect.top,
      width: band,
      height: rect.height
    }
  }
  const band = documentPaneDockPreviewBand(rect.height)
  return {
    left: rect.left,
    top: direction === 'top' ? rect.top : rect.top + rect.height - band,
    width: rect.width,
    height: band
  }
}

const documentPaneDockPreviewSurface = (pane: HTMLElement | null): HTMLElement | null => {
  if (!pane) return null
  if (pane.classList.contains('document-pane')) return pane.querySelector<HTMLElement>(':scope > .document-pane-canvas') ?? pane
  return pane
}

const elementRect = (element: HTMLElement): DocumentPaneDockPreviewRect | null => {
  if (typeof element.getBoundingClientRect !== 'function') return null
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null
}

let currentBar: DocumentPaneDockPreviewBar | null = null
const barListeners = new Set<() => void>()

const publishBar = (bar: DocumentPaneDockPreviewBar | null): void => {
  if (!bar && !currentBar) return
  if (bar && currentBar && bar.direction === currentBar.direction && bar.left === currentBar.left && bar.top === currentBar.top && bar.width === currentBar.width && bar.height === currentBar.height) return
  currentBar = bar
  for (const listener of barListeners) listener()
}

export const documentPaneDockPreviewBar = (): DocumentPaneDockPreviewBar | null => currentBar

export const subscribeDocumentPaneDockPreviewBar = (listener: () => void): (() => void) => {
  barListeners.add(listener)
  return () => {
    barListeners.delete(listener)
  }
}

export const clearDocumentPaneDockPreview = (surface: HTMLElement | null): void => {
  surface?.removeAttribute(DOCUMENT_PANE_DOCK_PREVIEW_ATTRIBUTE)
  publishBar(null)
}

export const updateDocumentPaneDockPreview = (currentSurface: HTMLElement | null, pane: HTMLElement | null, direction: DocumentPaneDirection | null): DocumentPaneDockPreviewUpdate => {
  const nextSurface = direction ? documentPaneDockPreviewSurface(pane) : null
  if (currentSurface !== nextSurface) clearDocumentPaneDockPreview(currentSurface)
  if (!nextSurface || !direction) return { surface: null, visible: false }
  const rect = elementRect(nextSurface)
  if (!rect) {
    publishBar(null)
    return { surface: null, visible: false }
  }
  nextSurface.setAttribute(DOCUMENT_PANE_DOCK_PREVIEW_ATTRIBUTE, direction)
  const visible = nextSurface.isConnected && nextSurface.getAttribute(DOCUMENT_PANE_DOCK_PREVIEW_ATTRIBUTE) === direction
  publishBar(visible ? { direction, ...documentPaneDockPreviewGeometry(rect, direction) } : null)
  return { surface: nextSurface, visible }
}
