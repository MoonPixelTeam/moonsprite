import type { RotationIndicatorPosition } from './file-preferences'

export interface ViewGeometryState {
  zoom: number
  panX: number
  panY: number
  rotation: number
  mirrored?: boolean
  mirroredVertical?: boolean
}

export interface ViewportPoint { x: number; y: number }
export interface ViewportBounds { left: number; top: number; right: number; bottom: number }
export interface CanvasViewContentBounds { x: number; y: number; width: number; height: number }

export interface CanvasViewScrollbarAxis {
  visible: boolean
  position: number
  thumbRatio: number
}

export interface CanvasViewScrollbarMetrics {
  horizontal: CanvasViewScrollbarAxis
  vertical: CanvasViewScrollbarAxis
}

/** Snap a view rotation to one of the sixteen Shift-constrained directions. */
export const VIEW_ROTATION_SNAP_DEGREES = 22.5

export function snapViewRotation(rotation: number, increment = VIEW_ROTATION_SNAP_DEGREES): number {
  if (!Number.isFinite(rotation) || !Number.isFinite(increment) || increment <= 0) return rotation
  return Math.round(rotation / increment) * increment
}

const ROTATION_INDICATOR_MAX_FOOTPRINT = 204
const ROTATION_INDICATOR_CLEARANCE_RATIO = 4 / 3
const ROTATION_INDICATOR_HALF_WIDTH = 64
const ROTATION_INDICATOR_HALF_HEIGHT = 96
const ROTATION_INDICATOR_POINTER_LEFT_GAP = 96

export function rotationIndicatorPointBetweenPointerAndCanvasCenter(width: number, height: number, pointer: ViewportPoint, canvasCenter: ViewportPoint): ViewportPoint {
  const clampAxis = (value: number, size: number, halfSize: number): number => size <= halfSize * 2
    ? size / 2
    : Math.max(halfSize, Math.min(size - halfSize, value))
  return {
    x: clampAxis((pointer.x + canvasCenter.x) / 2, width, ROTATION_INDICATOR_HALF_WIDTH),
    y: clampAxis((pointer.y + canvasCenter.y) / 2, height, ROTATION_INDICATOR_HALF_HEIGHT)
  }
}

export function rotationIndicatorPointLeftOfPointer(width: number, height: number, pointer: ViewportPoint): ViewportPoint {
  const clampAxis = (value: number, size: number, halfSize: number): number => size <= halfSize * 2
    ? size / 2
    : Math.max(halfSize, Math.min(size - halfSize, value))
  return {
    x: clampAxis(pointer.x - ROTATION_INDICATOR_HALF_WIDTH - ROTATION_INDICATOR_POINTER_LEFT_GAP, width, ROTATION_INDICATOR_HALF_WIDTH),
    y: clampAxis(pointer.y, height, ROTATION_INDICATOR_HALF_HEIGHT)
  }
}

export function viewRotationPivot(width: number, height: number, panX: number, panY: number, position: RotationIndicatorPosition): { x: number; y: number } {
  return {
    x: width / 2 + (position === 'canvas' ? panX : 0),
    y: height / 2 + (position === 'canvas' ? panY : 0)
  }
}

export function displayedCanvasCenter(width: number, height: number, view: ViewGeometryState, position: RotationIndicatorPosition): ViewportPoint {
  const pivot = viewRotationPivot(width, height, view.panX, view.panY, position)
  const center = { x: width / 2 + view.panX, y: height / 2 + view.panY }
  const mirrored = mirrorViewportPoint(center, pivot, Boolean(view.mirrored), Boolean(view.mirroredVertical))
  return rotateViewportPoint(mirrored, pivot, view.rotation)
}

export function viewPanDeltaFromScreen(deltaX: number, deltaY: number, rotation: number, position: RotationIndicatorPosition, mirrored = false, mirroredVertical = false): { x: number; y: number } {
  if (position === 'canvas') return { x: deltaX, y: deltaY }
  const radians = -rotation * Math.PI / 180
  const unrotated = {
    x: deltaX * Math.cos(radians) - deltaY * Math.sin(radians),
    y: deltaX * Math.sin(radians) + deltaY * Math.cos(radians)
  }
  return {
    x: mirrored ? -unrotated.x : unrotated.x,
    y: mirroredVertical ? -unrotated.y : unrotated.y
  }
}

export function viewCanvasOrigin(viewportWidth: number, viewportHeight: number, documentWidth: number, documentHeight: number, view: Pick<ViewGeometryState, 'zoom' | 'panX' | 'panY'>): ViewportPoint {
  return {
    x: viewportWidth / 2 + view.panX - documentWidth * view.zoom / 2,
    y: viewportHeight / 2 + view.panY - documentHeight * view.zoom / 2
  }
}

export interface ViewportPlacement { left: number; top: number; width: number; height: number }

/** Change only the viewport's clipping area, keeping document pixels fixed in
 * the window. All placement values use logical canvas units, including left
 * and top. Reuse the pan transform so rotated/mirrored views keep the same map.
 */
export function preserveViewOnViewportChange<T extends ViewGeometryState>(
  view: T, previous: ViewportPlacement, next: ViewportPlacement, position: RotationIndicatorPosition
): T {
  const dx = previous.left - next.left + (previous.width - next.width) / 2
  const dy = previous.top - next.top + (previous.height - next.height) / 2
  if (dx === 0 && dy === 0) return view
  const delta = viewPanDeltaFromScreen(dx, dy, view.rotation, position, view.mirrored, view.mirroredVertical)
  return { ...view, panX: view.panX + delta.x, panY: view.panY + delta.y }
}

export function rotateViewportPoint(point: ViewportPoint, pivot: ViewportPoint, degrees: number): ViewportPoint {
  const radians = degrees * Math.PI / 180
  const dx = point.x - pivot.x
  const dy = point.y - pivot.y
  return {
    x: pivot.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: pivot.y + dx * Math.sin(radians) + dy * Math.cos(radians)
  }
}

export function unrotateViewportPoint(point: ViewportPoint, pivot: ViewportPoint, degrees: number): ViewportPoint {
  return rotateViewportPoint(point, pivot, -degrees)
}

export function mirrorViewportPoint(point: ViewportPoint, pivot: ViewportPoint, horizontal = true, vertical = false): ViewportPoint {
  return {
    x: horizontal ? pivot.x * 2 - point.x : point.x,
    y: vertical ? pivot.y * 2 - point.y : point.y
  }
}

export function unrotatedViewportBounds(width: number, height: number, view: ViewGeometryState, position: RotationIndicatorPosition): ViewportBounds {
  if (Math.abs(view.rotation) < 0.000001 && !view.mirrored && !view.mirroredVertical) return { left: 0, top: 0, right: width, bottom: height }
  const pivot = viewRotationPivot(width, height, view.panX, view.panY, position)
  const topLeft = inverseDisplayPoint({ x: 0, y: 0 }, pivot, view)
  const topRight = inverseDisplayPoint({ x: width, y: 0 }, pivot, view)
  const bottomLeft = inverseDisplayPoint({ x: 0, y: height }, pivot, view)
  const bottomRight = inverseDisplayPoint({ x: width, y: height }, pivot, view)
  return {
    left: Math.min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x),
    top: Math.min(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y),
    right: Math.max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x),
    bottom: Math.max(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y)
  }
}

const inverseDisplayPoint = (point: ViewportPoint, pivot: ViewportPoint, view: ViewGeometryState): ViewportPoint => {
  // CanvasRenderingContext2D applies the scale after rotate() in the transform
  // chain, so the inverse must undo rotation first and mirror second.
  const unrotated = unrotateViewportPoint(point, pivot, view.rotation)
  return mirrorViewportPoint(unrotated, pivot, Boolean(view.mirrored), Boolean(view.mirroredVertical))
}

/** Convert a displayed viewport point to the untransformed canvas viewport. */
export function unrotatedViewportPoint(
  point: ViewportPoint,
  viewportWidth: number,
  viewportHeight: number,
  view: ViewGeometryState,
  position: RotationIndicatorPosition
): ViewportPoint {
  return inverseDisplayPoint(point, viewRotationPivot(viewportWidth, viewportHeight, view.panX, view.panY, position), view)
}

export function rotateViewAroundViewportPoint(view: ViewGeometryState, nextRotation: number, point: ViewportPoint, viewportWidth: number, viewportHeight: number, position: RotationIndicatorPosition): ViewGeometryState {
  if (position === 'canvas') return { ...view, rotation: nextRotation }
  const pivot = viewRotationPivot(viewportWidth, viewportHeight, view.panX, view.panY, position)
  const currentUntransformedPoint = inverseDisplayPoint(point, pivot, view)
  const rotatedView = { ...view, rotation: nextRotation }
  const nextUntransformedPoint = inverseDisplayPoint(point, pivot, rotatedView)
  return {
    ...rotatedView,
    panX: view.panX + nextUntransformedPoint.x - currentUntransformedPoint.x,
    panY: view.panY + nextUntransformedPoint.y - currentUntransformedPoint.y
  }
}

const rotateRelative = (point: ViewportPoint, degrees: number): ViewportPoint => {
  const radians = degrees * Math.PI / 180
  return { x: point.x * Math.cos(radians) - point.y * Math.sin(radians), y: point.x * Math.sin(radians) + point.y * Math.cos(radians) }
}

const displayRelative = (point: ViewportPoint, view: Pick<ViewGeometryState, 'rotation' | 'mirrored' | 'mirroredVertical'>): ViewportPoint => {
  const mirrored = { x: view.mirrored ? -point.x : point.x, y: view.mirroredVertical ? -point.y : point.y }
  return rotateRelative(mirrored, view.rotation)
}

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value))

/** Screen-axis scrollbar state for the displayed document bounds. */
export function canvasViewScrollbarMetrics(viewportWidth: number, viewportHeight: number, documentWidth: number, documentHeight: number, view: ViewGeometryState, position: RotationIndicatorPosition): CanvasViewScrollbarMetrics {
  if (![viewportWidth, viewportHeight, documentWidth, documentHeight, view.zoom, view.panX, view.panY, view.rotation].every(Number.isFinite)
    || viewportWidth <= 0 || viewportHeight <= 0 || documentWidth <= 0 || documentHeight <= 0 || view.zoom <= 0) {
    const hidden = { visible: false, position: 0.5, thumbRatio: 1 }
    return { horizontal: hidden, vertical: { ...hidden } }
  }
  const radians = view.rotation * Math.PI / 180
  const cosine = Math.abs(Math.cos(radians))
  const sine = Math.abs(Math.sin(radians))
  const scaledWidth = documentWidth * view.zoom
  const scaledHeight = documentHeight * view.zoom
  const displayedWidth = scaledWidth * cosine + scaledHeight * sine
  const displayedHeight = scaledWidth * sine + scaledHeight * cosine
  const center = displayedCanvasCenter(viewportWidth, viewportHeight, view, position)
  const axis = (viewportSize: number, contentSize: number, centerOffset: number): CanvasViewScrollbarAxis => {
    const overflow = Math.max(0, contentSize - viewportSize)
    return {
      visible: overflow > 0.5,
      position: overflow > 0 ? clampUnit((overflow / 2 - centerOffset) / overflow) : 0.5,
      thumbRatio: clampUnit(viewportSize / contentSize)
    }
  }
  return {
    horizontal: axis(viewportWidth, displayedWidth, center.x - viewportWidth / 2),
    vertical: axis(viewportHeight, displayedHeight, center.y - viewportHeight / 2)
  }
}

/** Move the displayed document along one screen axis to a scrollbar position. */
export function panCanvasViewFromScrollbar<T extends ViewGeometryState>(viewportWidth: number, viewportHeight: number, documentWidth: number, documentHeight: number, view: T, position: RotationIndicatorPosition, axis: 'horizontal' | 'vertical', scrollbarPosition: number): T {
  const metrics = canvasViewScrollbarMetrics(viewportWidth, viewportHeight, documentWidth, documentHeight, view, position)
  const axisMetrics = axis === 'horizontal' ? metrics.horizontal : metrics.vertical
  if (!axisMetrics.visible) return view
  const radians = view.rotation * Math.PI / 180
  const cosine = Math.abs(Math.cos(radians))
  const sine = Math.abs(Math.sin(radians))
  const displayedSize = axis === 'horizontal'
    ? documentWidth * view.zoom * cosine + documentHeight * view.zoom * sine
    : documentWidth * view.zoom * sine + documentHeight * view.zoom * cosine
  const viewportSize = axis === 'horizontal' ? viewportWidth : viewportHeight
  const overflow = displayedSize - viewportSize
  const targetCenterOffset = overflow / 2 - clampUnit(scrollbarPosition) * overflow
  const center = displayedCanvasCenter(viewportWidth, viewportHeight, view, position)
  const currentCenterOffset = axis === 'horizontal' ? center.x - viewportWidth / 2 : center.y - viewportHeight / 2
  const delta = viewPanDeltaFromScreen(
    axis === 'horizontal' ? targetCenterOffset - currentCenterOffset : 0,
    axis === 'vertical' ? targetCenterOffset - currentCenterOffset : 0,
    view.rotation,
    position,
    Boolean(view.mirrored),
    Boolean(view.mirroredVertical)
  )
  return { ...view, panX: view.panX + delta.x, panY: view.panY + delta.y }
}

export function clampCanvasViewPan<T extends ViewGeometryState>(viewportWidth: number, viewportHeight: number, documentWidth: number, documentHeight: number, view: T, position: RotationIndicatorPosition, additionalBounds?: CanvasViewContentBounds | null): T {
  if (![viewportWidth, viewportHeight, documentWidth, documentHeight, view.zoom, view.panX, view.panY, view.rotation].every(Number.isFinite)) return view
  if (viewportWidth <= 0 || viewportHeight <= 0 || documentWidth <= 0 || documentHeight <= 0 || view.zoom <= 0) return view
  const validAdditionalBounds = additionalBounds
    && [additionalBounds.x, additionalBounds.y, additionalBounds.width, additionalBounds.height].every(Number.isFinite)
    && additionalBounds.width > 0
    && additionalBounds.height > 0
    ? additionalBounds
    : null
  const contentLeft = validAdditionalBounds ? Math.min(0, validAdditionalBounds.x) : 0
  const contentTop = validAdditionalBounds ? Math.min(0, validAdditionalBounds.y) : 0
  const contentRight = validAdditionalBounds ? Math.max(documentWidth, validAdditionalBounds.x + validAdditionalBounds.width) : documentWidth
  const contentBottom = validAdditionalBounds ? Math.max(documentHeight, validAdditionalBounds.y + validAdditionalBounds.height) : documentHeight
  const contentCenterOffset = {
    x: ((contentLeft + contentRight) / 2 - documentWidth / 2) * view.zoom,
    y: ((contentTop + contentBottom) / 2 - documentHeight / 2) * view.zoom
  }
  const radians = view.rotation * Math.PI / 180
  const cosine = Math.abs(Math.cos(radians))
  const sine = Math.abs(Math.sin(radians))
  const scaledWidth = (contentRight - contentLeft) * view.zoom
  const scaledHeight = (contentBottom - contentTop) * view.zoom
  const displayedWidth = scaledWidth * cosine + scaledHeight * sine
  const displayedHeight = scaledWidth * sine + scaledHeight * cosine
  const displayedContentCenter = position === 'canvas'
    ? (() => {
        const relativeCenter = displayRelative(contentCenterOffset, view)
        return { x: view.panX + relativeCenter.x, y: view.panY + relativeCenter.y }
      })()
    : displayRelative({ x: view.panX + contentCenterOffset.x, y: view.panY + contentCenterOffset.y }, view)
  const axisOverscroll = (viewportSize: number, displayedSize: number): number => Math.min(viewportSize, displayedSize) / 2
  const overscrollX = axisOverscroll(viewportWidth, displayedWidth)
  const overscrollY = axisOverscroll(viewportHeight, displayedHeight)
  const limitX = Math.abs(viewportWidth - displayedWidth) / 2 + overscrollX
  const limitY = Math.abs(viewportHeight - displayedHeight) / 2 + overscrollY
  const clampedContentCenter = {
    x: Math.min(limitX, Math.max(-limitX, displayedContentCenter.x)),
    y: Math.min(limitY, Math.max(-limitY, displayedContentCenter.y))
  }
  if (clampedContentCenter.x === displayedContentCenter.x && clampedContentCenter.y === displayedContentCenter.y) return view
  const delta = viewPanDeltaFromScreen(clampedContentCenter.x - displayedContentCenter.x, clampedContentCenter.y - displayedContentCenter.y, view.rotation, position, Boolean(view.mirrored), Boolean(view.mirroredVertical))
  return { ...view, panX: view.panX + delta.x, panY: view.panY + delta.y }
}

export function documentPointFromViewportPointContinuous(point: ViewportPoint, viewportWidth: number, viewportHeight: number, documentWidth: number, documentHeight: number, view: ViewGeometryState, position: RotationIndicatorPosition): ViewportPoint {
  const unrotated = unrotatedViewportPoint(point, viewportWidth, viewportHeight, view, position)
  const origin = viewCanvasOrigin(viewportWidth, viewportHeight, documentWidth, documentHeight, view)
  return { x: (unrotated.x - origin.x) / view.zoom, y: (unrotated.y - origin.y) / view.zoom }
}

/** Convert a document coordinate to its displayed viewport coordinate. */
export function viewportPointFromDocumentPointContinuous(point: ViewportPoint, viewportWidth: number, viewportHeight: number, documentWidth: number, documentHeight: number, view: ViewGeometryState, position: RotationIndicatorPosition): ViewportPoint {
  const origin = viewCanvasOrigin(viewportWidth, viewportHeight, documentWidth, documentHeight, view)
  const untransformed = { x: origin.x + point.x * view.zoom, y: origin.y + point.y * view.zoom }
  const pivot = viewRotationPivot(viewportWidth, viewportHeight, view.panX, view.panY, position)
  const mirrored = mirrorViewportPoint(untransformed, pivot, Boolean(view.mirrored), Boolean(view.mirroredVertical))
  return rotateViewportPoint(mirrored, pivot, view.rotation)
}

/** Whether a displayed line segment intersects the viewport rectangle. */
export function viewportSegmentVisible(start: ViewportPoint, end: ViewportPoint, width: number, height: number): boolean {
  if (![start.x, start.y, end.x, end.y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return false
  let from = 0
  let to = 1
  const dx = end.x - start.x
  const dy = end.y - start.y
  for (const [distance, delta] of [[start.x, dx], [width - start.x, -dx], [start.y, dy], [height - start.y, -dy]] as const) {
    if (delta === 0) {
      if (distance < 0) return false
      continue
    }
    const ratio = -distance / delta
    if (delta > 0) from = Math.max(from, ratio)
    else to = Math.min(to, ratio)
    if (from > to) return false
  }
  return true
}

export function documentPointFromViewportPoint(point: ViewportPoint, viewportWidth: number, viewportHeight: number, documentWidth: number, documentHeight: number, view: ViewGeometryState, position: RotationIndicatorPosition): ViewportPoint {
  const continuous = documentPointFromViewportPointContinuous(point, viewportWidth, viewportHeight, documentWidth, documentHeight, view, position)
  return { x: Math.floor(continuous.x), y: Math.floor(continuous.y) }
}

export function zoomViewAroundViewportPoint(view: ViewGeometryState, nextZoom: number, point: ViewportPoint, viewportWidth: number, viewportHeight: number, documentWidth: number, documentHeight: number, position: RotationIndicatorPosition): ViewGeometryState {
  const pivot = viewRotationPivot(viewportWidth, viewportHeight, view.panX, view.panY, position)
  const unrotated = inverseDisplayPoint(point, pivot, view)
  const origin = viewCanvasOrigin(viewportWidth, viewportHeight, documentWidth, documentHeight, view)
  const documentPoint = { x: (unrotated.x - origin.x) / view.zoom, y: (unrotated.y - origin.y) / view.zoom }
  const center = { x: viewportWidth / 2, y: viewportHeight / 2 }
  const documentRelative = { x: (documentPoint.x - documentWidth / 2) * nextZoom, y: (documentPoint.y - documentHeight / 2) * nextZoom }
  if (position === 'canvas') {
    const transformed = displayRelative(documentRelative, view)
    return { ...view, zoom: nextZoom, panX: point.x - center.x - transformed.x, panY: point.y - center.y - transformed.y }
  }
  return {
    ...view,
    zoom: nextZoom,
    panX: unrotated.x - documentPoint.x * nextZoom - viewportWidth / 2 + documentWidth * nextZoom / 2,
    panY: unrotated.y - documentPoint.y * nextZoom - viewportHeight / 2 + documentHeight * nextZoom / 2
  }
}

export function rotationIndicatorFitsCanvas(documentWidth: number, documentHeight: number, zoom: number): boolean {
  if (![documentWidth, documentHeight, zoom].every(Number.isFinite) || documentWidth <= 0 || documentHeight <= 0 || zoom <= 0) return false
  const minimumCanvasSize = ROTATION_INDICATOR_MAX_FOOTPRINT * ROTATION_INDICATOR_CLEARANCE_RATIO
  return documentWidth * zoom > minimumCanvasSize && documentHeight * zoom > minimumCanvasSize
}
