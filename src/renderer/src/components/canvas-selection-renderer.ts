import type { SelectionMask, SelectionRect, ViewState } from '@shared/types'
import type { RotationIndicatorPosition } from '@/core/file-preferences'
import type { SelectionHandle } from '@/core/canvas-input'
import { selectionBoundarySegments } from '@/core/selection'
import { unrotatedViewportBounds, viewCanvasOrigin } from '@/core/view-geometry'

export type RasterContext2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const SELECTION_OUTLINE_WIDTH_CSS = 1
const SELECTION_SOLID_OUTLINE_WIDTH_CSS = 1
const SELECTION_DASH_LENGTH_CSS = 6
const SELECTION_DASH_CYCLE_CSS = SELECTION_DASH_LENGTH_CSS * 2
const SELECTION_DASH_STEP_MS = 160

export interface SelectionScreenBox {
  x: number
  y: number
  width: number
  height: number
}

export interface SelectionBoundaryCache {
  width: number
  height: number
  mask?: Uint8Array
  segments: Int32Array
  screenPaths: Map<string, {
    outline: Path2D
    dashGroups: Array<{ offset: number; path: Path2D }>
  }>
}

export interface SelectionSizeLabelLayout {
  lines: readonly [string, string]
  left: number
  top: number
  width: number
  height: number
}

interface DrawSelectionSizeLabelOptions {
  context: RasterContext2D
  points: ReadonlyArray<{ x: number; y: number }>
  selectionX: number
  selectionY: number
  selectionWidth: number
  selectionHeight: number
  viewportWidth: number
  viewportHeight: number
  startLabel: string
  endLabel: string
  sizeLabel: string
  background: string
  foreground: string
  sizeWidth?: number
  sizeHeight?: number
  /** Optional viewport-space anchor for the label's upper-left edge. */
  anchor?: { x: number; y: number }
}

const SELECTION_SIZE_LABEL_LINE_HEIGHT_CSS = 14
const SELECTION_SIZE_LABEL_HORIZONTAL_PADDING_CSS = 7
const SELECTION_SIZE_LABEL_VERTICAL_PADDING_CSS = 4
const SELECTION_SIZE_LABEL_GAP_CSS = 6
const SELECTION_SIZE_LABEL_VIEWPORT_MARGIN_CSS = 4

export function drawSelectionSizeLabel({
  context,
  points,
  selectionX,
  selectionY,
  selectionWidth,
  selectionHeight,
  viewportWidth,
  viewportHeight,
  startLabel,
  endLabel,
  sizeLabel,
  background,
  foreground,
  sizeWidth,
  sizeHeight,
  anchor
}: DrawSelectionSizeLabelOptions): SelectionSizeLabelLayout | null {
  if (points.length === 0) return null
  const startX = Math.round(selectionX)
  const startY = Math.round(selectionY)
  const widthValue = Math.max(1, Math.round(selectionWidth))
  const heightValue = Math.max(1, Math.round(selectionHeight))
  const readoutWidth = Math.max(1, Math.round(sizeWidth ?? widthValue))
  const readoutHeight = Math.max(1, Math.round(sizeHeight ?? heightValue))
  const endX = startX + widthValue - 1
  const endY = startY + heightValue - 1
  const lines = [
    `${startLabel} ${startX}, ${startY}    ${endLabel} ${endX}, ${endY}`,
    `${sizeLabel} ${readoutWidth} × ${readoutHeight}`
  ] as const
  const minX = anchor?.x ?? Math.min(...points.map((point) => point.x))
  const minY = anchor?.y ?? Math.min(...points.map((point) => point.y))

  context.save()
  context.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace'
  const naturalWidth = Math.ceil(Math.max(...lines.map((line) => context.measureText(line).width))) + SELECTION_SIZE_LABEL_HORIZONTAL_PADDING_CSS * 2
  const width = Math.min(naturalWidth, Math.max(1, viewportWidth - SELECTION_SIZE_LABEL_VIEWPORT_MARGIN_CSS * 2))
  const height = SELECTION_SIZE_LABEL_VERTICAL_PADDING_CSS * 2 + SELECTION_SIZE_LABEL_LINE_HEIGHT_CSS * lines.length
  const maxLeft = Math.max(SELECTION_SIZE_LABEL_VIEWPORT_MARGIN_CSS, viewportWidth - width - SELECTION_SIZE_LABEL_VIEWPORT_MARGIN_CSS)
  const maxTop = Math.max(SELECTION_SIZE_LABEL_VIEWPORT_MARGIN_CSS, viewportHeight - height - SELECTION_SIZE_LABEL_VIEWPORT_MARGIN_CSS)
  const left = Math.min(maxLeft, Math.max(SELECTION_SIZE_LABEL_VIEWPORT_MARGIN_CSS, Math.round(minX)))
  const top = Math.min(maxTop, Math.max(SELECTION_SIZE_LABEL_VIEWPORT_MARGIN_CSS, Math.round(minY) - height - SELECTION_SIZE_LABEL_GAP_CSS))

  context.fillStyle = background
  context.fillRect(left, top, width, height)
  context.fillStyle = foreground
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  lines.forEach((line, index) => context.fillText(
    line,
    left + SELECTION_SIZE_LABEL_HORIZONTAL_PADDING_CSS,
    top + SELECTION_SIZE_LABEL_VERTICAL_PADDING_CSS + SELECTION_SIZE_LABEL_LINE_HEIGHT_CSS * (index + 0.5) + 0.5
  ))
  context.restore()
  return { lines, left, top, width, height }
}

export function selectionScreenBox(
  stageWidth: number,
  stageHeight: number,
  documentWidth: number,
  documentHeight: number,
  view: ViewState,
  selection: SelectionRect
): SelectionScreenBox {
  const origin = viewCanvasOrigin(stageWidth, stageHeight, documentWidth, documentHeight, view)
  return {
    x: origin.x + selection.x * view.zoom,
    y: origin.y + selection.y * view.zoom,
    width: selection.width * view.zoom,
    height: selection.height * view.zoom
  }
}

export function selectionScreenPoint(
  stageWidth: number,
  stageHeight: number,
  documentWidth: number,
  documentHeight: number,
  view: ViewState,
  point: { x: number; y: number }
): { x: number; y: number } {
  const origin = viewCanvasOrigin(stageWidth, stageHeight, documentWidth, documentHeight, view)
  return { x: origin.x + point.x * view.zoom, y: origin.y + point.y * view.zoom }
}

interface DrawSelectionOptions {
  context: RasterContext2D
  selection: SelectionMask
  box: SelectionScreenBox
  view: ViewState
  viewportWidth: number
  viewportHeight: number
  rotationIndicatorPosition: RotationIndicatorPosition
  cache: SelectionBoundaryCache | null
  outlineDark: string
  outlineLight: string
  showOutline?: boolean
  showHandles?: boolean
  handlePoints?: Array<{ x: number; y: number }>
  /** Optional exact transform frame, in the same viewport coordinates as the context. */
  framePoints?: Array<{ x: number; y: number }>
}

export function drawSelectionOutline({
  context,
  selection,
  box,
  view,
  viewportWidth,
  viewportHeight,
  rotationIndicatorPosition,
  cache,
  outlineDark,
  outlineLight,
  showOutline = true,
  showHandles = true,
  handlePoints,
  framePoints
}: DrawSelectionOptions): SelectionBoundaryCache {
  const phase = Math.floor(performance.now() / SELECTION_DASH_STEP_MS) % SELECTION_DASH_CYCLE_CSS
  let nextCache = cache
  if (!nextCache || nextCache.width !== selection.width || nextCache.height !== selection.height || nextCache.mask !== selection.mask) {
    const segments = selectionBoundarySegments(selection)
    nextCache = { width: selection.width, height: selection.height, mask: selection.mask, segments, screenPaths: new Map() }
  }

  const zoom = Math.max(0.0001, box.width / Math.max(1, selection.width))
  const viewport = unrotatedViewportBounds(viewportWidth, viewportHeight, view, rotationIndicatorPosition)
  const visibleLeft = Math.max(0, Math.floor((viewport.left - box.x) / zoom) - 1)
  const visibleTop = Math.max(0, Math.floor((viewport.top - box.y) / zoom) - 1)
  const visibleRight = Math.min(selection.width, Math.ceil((viewport.right - box.x) / zoom) + 1)
  const visibleBottom = Math.min(selection.height, Math.ceil((viewport.bottom - box.y) / zoom) + 1)
  const zoomKey = zoom.toFixed(6)
  const pathKey = `${zoomKey}:${visibleLeft}:${visibleTop}:${visibleRight}:${visibleBottom}`
  let screenPaths = nextCache.screenPaths.get(pathKey)
  if (!screenPaths) {
    const outline = new Path2D()
    const dashGroups = new Map<number, Path2D>()
    for (let index = 0; index < nextCache.segments.length; index += 4) {
      const x1 = nextCache.segments[index]
      const y1 = nextCache.segments[index + 1]
      const x2 = nextCache.segments[index + 2]
      const y2 = nextCache.segments[index + 3]
      if (Math.max(x1, x2) < visibleLeft || Math.min(x1, x2) > visibleRight || Math.max(y1, y2) < visibleTop || Math.min(y1, y2) > visibleBottom) continue
      const clippedX1 = Math.max(visibleLeft, Math.min(visibleRight, x1))
      const clippedY1 = Math.max(visibleTop, Math.min(visibleBottom, y1))
      const clippedX2 = Math.max(visibleLeft, Math.min(visibleRight, x2))
      const clippedY2 = Math.max(visibleTop, Math.min(visibleBottom, y2))
      const screenX1 = Math.round(clippedX1 * zoom)
      const screenY1 = Math.round(clippedY1 * zoom)
      const screenX2 = Math.round(clippedX2 * zoom)
      const screenY2 = Math.round(clippedY2 * zoom)
      if (screenX1 === screenX2 && screenY1 === screenY2) continue
      outline.moveTo(screenX1, screenY1)
      outline.lineTo(screenX2, screenY2)
      const axisStart = screenY1 === screenY2 ? Math.min(screenX1, screenX2) : Math.min(screenY1, screenY2)
      const dashOffset = ((axisStart % SELECTION_DASH_CYCLE_CSS) + SELECTION_DASH_CYCLE_CSS) % SELECTION_DASH_CYCLE_CSS
      let dashPath = dashGroups.get(dashOffset)
      if (!dashPath) {
        dashPath = new Path2D()
        dashGroups.set(dashOffset, dashPath)
      }
      dashPath.moveTo(screenX1, screenY1)
      dashPath.lineTo(screenX2, screenY2)
    }
    screenPaths = {
      outline,
      dashGroups: [...dashGroups.entries()].map(([offset, path]) => ({ offset, path }))
    }
    nextCache.screenPaths.set(pathKey, screenPaths)
    if (nextCache.screenPaths.size > 16) nextCache.screenPaths.delete(nextCache.screenPaths.keys().next().value!)
  }

  if (showOutline) {
    context.save()
    context.lineCap = 'butt'
    context.lineJoin = 'miter'
    if (framePoints && framePoints.length === 4) {
      context.beginPath()
      context.moveTo(framePoints[0].x, framePoints[0].y)
      context.lineTo(framePoints[1].x, framePoints[1].y)
      context.lineTo(framePoints[2].x, framePoints[2].y)
      context.lineTo(framePoints[3].x, framePoints[3].y)
      context.closePath()
      context.lineWidth = outlineDark === outlineLight ? SELECTION_SOLID_OUTLINE_WIDTH_CSS : SELECTION_OUTLINE_WIDTH_CSS
      context.setLineDash([])
      context.lineDashOffset = 0
      context.strokeStyle = outlineLight
      context.stroke()
      if (outlineDark !== outlineLight) {
        context.setLineDash([SELECTION_DASH_LENGTH_CSS, SELECTION_DASH_LENGTH_CSS])
        context.strokeStyle = outlineDark
        context.lineDashOffset = -phase
        context.stroke()
      }
    } else if (outlineDark === outlineLight) {
      context.translate(Math.round(box.x) + 0.5, Math.round(box.y) + 0.5)
      context.lineWidth = SELECTION_SOLID_OUTLINE_WIDTH_CSS
      context.setLineDash([])
      context.lineDashOffset = 0
      context.strokeStyle = outlineLight
      context.stroke(screenPaths.outline)
    } else {
      context.translate(Math.round(box.x) + 0.5, Math.round(box.y) + 0.5)
      context.lineWidth = SELECTION_OUTLINE_WIDTH_CSS
      context.setLineDash([])
      context.lineDashOffset = 0
      context.strokeStyle = outlineLight
      context.stroke(screenPaths.outline)
      context.setLineDash([SELECTION_DASH_LENGTH_CSS, SELECTION_DASH_LENGTH_CSS])
      context.strokeStyle = outlineDark
      for (const group of screenPaths.dashGroups) {
        context.lineDashOffset = -(phase + group.offset)
        context.stroke(group.path)
      }
    }
    context.restore()
  }
  if (!showHandles) return nextCache

  const handles: Array<[SelectionHandle, number, number]> = [
    ['nw', box.x, box.y], ['n', box.x + box.width / 2, box.y], ['ne', box.x + box.width, box.y],
    ['w', box.x, box.y + box.height / 2], ['e', box.x + box.width, box.y + box.height / 2],
    ['sw', box.x, box.y + box.height], ['s', box.x + box.width / 2, box.y + box.height], ['se', box.x + box.width, box.y + box.height]
  ]
  const renderedHandles = handlePoints ?? handles.map(([, x, y]) => ({ x, y }))
  for (const { x, y } of renderedHandles) {
    const centerX = Math.round(x)
    const centerY = Math.round(y)
    context.fillStyle = outlineDark
    context.fillRect(centerX - 5, centerY - 5, 10, 10)
    context.fillStyle = outlineLight
    context.fillRect(centerX - 3, centerY - 3, 6, 6)
  }
  return nextCache
}
