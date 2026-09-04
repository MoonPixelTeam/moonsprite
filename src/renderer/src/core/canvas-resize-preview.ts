export interface CanvasResizePreview {
  width: number
  height: number
  offsetX: number
  offsetY: number
}

export interface CanvasResizePreviewRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasResizePreviewHistoryController {
  undo: () => void
  redo: () => void
}

const historyControllers = new Map<string, CanvasResizePreviewHistoryController>()

export const CANVAS_RESIZE_PREVIEW_EVENT = 'moonsprite:canvas-resize-preview'

export const CANVAS_RESIZE_PREVIEW_LAYERS = ['checker', 'content', 'outside-mask', 'bounds'] as const
export type CanvasResizePreviewLayer = typeof CANVAS_RESIZE_PREVIEW_LAYERS[number]

/**
 * Return the part of the proposed canvas that is outside the committed canvas.
 * The renderer uses these strips for checkerboard and resize-mask decoration;
 * committed pixels remain owned by the normal composite cache.
 */
export function canvasResizePreviewExposedRects(preview: CanvasResizePreviewRect, committed: CanvasResizePreviewRect): CanvasResizePreviewRect[] {
  if (preview.width <= 0 || preview.height <= 0) return []

  const previewRight = preview.x + preview.width
  const previewBottom = preview.y + preview.height
  const overlapLeft = Math.max(preview.x, committed.x)
  const overlapTop = Math.max(preview.y, committed.y)
  const overlapRight = Math.min(previewRight, committed.x + committed.width)
  const overlapBottom = Math.min(previewBottom, committed.y + committed.height)
  if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) return [{ ...preview }]

  const exposed: CanvasResizePreviewRect[] = []
  const add = (x: number, y: number, width: number, height: number): void => {
    if (width > 0 && height > 0) exposed.push({ x, y, width, height })
  }
  add(preview.x, preview.y, preview.width, overlapTop - preview.y)
  add(preview.x, overlapBottom, preview.width, previewBottom - overlapBottom)
  add(preview.x, overlapTop, overlapLeft - preview.x, overlapBottom - overlapTop)
  add(overlapRight, overlapTop, previewRight - overlapRight, overlapBottom - overlapTop)
  return exposed
}

/** Return the part of the committed canvas that would be removed by the preview. */
export function canvasResizePreviewClippedRects(preview: CanvasResizePreviewRect, committed: CanvasResizePreviewRect): CanvasResizePreviewRect[] {
  if (committed.width <= 0 || committed.height <= 0) return []

  const committedRight = committed.x + committed.width
  const committedBottom = committed.y + committed.height
  const overlapLeft = Math.max(preview.x, committed.x)
  const overlapTop = Math.max(preview.y, committed.y)
  const overlapRight = Math.min(preview.x + preview.width, committedRight)
  const overlapBottom = Math.min(preview.y + preview.height, committedBottom)
  if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) return [{ ...committed }]

  const clipped: CanvasResizePreviewRect[] = []
  const add = (x: number, y: number, width: number, height: number): void => {
    if (width > 0 && height > 0) clipped.push({ x, y, width, height })
  }
  add(committed.x, committed.y, committed.width, overlapTop - committed.y)
  add(committed.x, overlapBottom, committed.width, committedBottom - overlapBottom)
  add(committed.x, overlapTop, overlapLeft - committed.x, overlapBottom - overlapTop)
  add(overlapRight, overlapTop, committedRight - overlapRight, overlapBottom - overlapTop)
  return clipped
}

export function drawCanvasResizePreviewLayers(draw: (layer: CanvasResizePreviewLayer) => void): void {
  for (const layer of CANVAS_RESIZE_PREVIEW_LAYERS) draw(layer)
}

export function publishCanvasResizePreview(documentId: string, preview: CanvasResizePreview | null): void {
  window.dispatchEvent(new CustomEvent(CANVAS_RESIZE_PREVIEW_EVENT, { detail: { documentId, preview } }))
}

export function registerCanvasResizePreviewHistory(documentId: string, controller: CanvasResizePreviewHistoryController): () => void {
  historyControllers.set(documentId, controller)
  return () => {
    if (historyControllers.get(documentId) === controller) historyControllers.delete(documentId)
  }
}

export function consumeCanvasResizePreviewHistory(documentId: string, direction: 'undo' | 'redo'): boolean {
  const controller = historyControllers.get(documentId)
  if (!controller) return false
  controller[direction]()
  return true
}
