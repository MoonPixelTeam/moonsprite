import type { RotationIndicatorPosition } from './file-preferences'
import { documentPointFromViewportPointContinuous } from './view-geometry'

interface Point { x: number; y: number }
interface Size { width: number; height: number }

interface FollowPreviewPositionOptions {
  documentSize: Size
  sourceViewportSize: Size
  previewViewportSize: Size
  previewScale: number
  rotationIndicatorPosition: RotationIndicatorPosition
  sourceView: {
    zoom: number
    panX: number
    panY: number
    rotation: number
    mirrored: boolean
    mirroredVertical: boolean
  }
}

export const previewCheckerCellSize = (checkerSize: number, displayScale: number): number => checkerSize * displayScale

const clampFollowAxis = (pan: number, viewportSize: number, contentSize: number): number => {
  const centeredOrigin = (viewportSize - contentSize) / 2
  const minimumOrigin = Math.min(0, viewportSize - contentSize)
  const maximumOrigin = Math.max(0, viewportSize - contentSize)
  return Math.min(maximumOrigin - centeredOrigin, Math.max(minimumOrigin - centeredOrigin, pan))
}

export const followPreviewPosition = ({ documentSize, sourceViewportSize, previewViewportSize, previewScale, sourceView, rotationIndicatorPosition }: FollowPreviewPositionOptions): Point => {
  if (![documentSize.width, documentSize.height, sourceViewportSize.width, sourceViewportSize.height, previewViewportSize.width, previewViewportSize.height, previewScale, sourceView.zoom, sourceView.panX, sourceView.panY, sourceView.rotation].every(Number.isFinite)) return { x: 0, y: 0 }
  if (documentSize.width <= 0 || documentSize.height <= 0 || sourceViewportSize.width <= 0 || sourceViewportSize.height <= 0 || previewViewportSize.width <= 0 || previewViewportSize.height <= 0 || previewScale <= 0 || sourceView.zoom <= 0) return { x: 0, y: 0 }
  const sourceCenter = documentPointFromViewportPointContinuous(
    { x: sourceViewportSize.width / 2, y: sourceViewportSize.height / 2 },
    sourceViewportSize.width,
    sourceViewportSize.height,
    documentSize.width,
    documentSize.height,
    sourceView,
    rotationIndicatorPosition
  )
  if (!Number.isFinite(sourceCenter.x) || !Number.isFinite(sourceCenter.y)) return { x: 0, y: 0 }
  const pan = {
    x: (documentSize.width / 2 - sourceCenter.x) * previewScale,
    y: (documentSize.height / 2 - sourceCenter.y) * previewScale
  }
  return {
    x: clampFollowAxis(pan.x, previewViewportSize.width, documentSize.width * previewScale),
    y: clampFollowAxis(pan.y, previewViewportSize.height, documentSize.height * previewScale)
  }
}

interface AnchoredPreviewPanOptions {
  documentSize: Size
  viewportSize: Size
  pointer: Point
  pan: Point
  /** Absolute document-pixel scale. 1 means one document pixel per CSS pixel. */
  zoom: number
  nextZoom: number
}

export const anchoredPreviewPan = ({ documentSize, viewportSize, pointer, pan, zoom, nextZoom }: AnchoredPreviewPanOptions): Point => {
  const currentScale = zoom
  const targetScale = nextZoom
  if (![documentSize.width, documentSize.height, viewportSize.width, viewportSize.height, pointer.x, pointer.y, pan.x, pan.y, currentScale, targetScale].every(Number.isFinite)) return pan
  if (documentSize.width <= 0 || documentSize.height <= 0 || viewportSize.width <= 0 || viewportSize.height <= 0 || currentScale <= 0 || targetScale <= 0) return pan
  const currentOriginX = (viewportSize.width - documentSize.width * currentScale) / 2 + pan.x
  const currentOriginY = (viewportSize.height - documentSize.height * currentScale) / 2 + pan.y
  const documentX = (pointer.x - currentOriginX) / currentScale
  const documentY = (pointer.y - currentOriginY) / currentScale
  return {
    x: pointer.x - (viewportSize.width - documentSize.width * targetScale) / 2 - documentX * targetScale,
    y: pointer.y - (viewportSize.height - documentSize.height * targetScale) / 2 - documentY * targetScale
  }
}
