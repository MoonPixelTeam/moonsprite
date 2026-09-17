import type { SelectionMask, SelectionMode, SelectionRect } from '@shared/types-selection'
import {
  type SelectionTransformSource
} from './tools-selection-transform-types'
import { combineSelection, rasterLinePoints, rectSelection } from './selection'
import { balancedStairLinePoints } from './pixel-line'
import { type CanvasPoint, type CanvasDragState, type CanvasStrokePoint } from './canvas-input-contracts'

export const appendPolygonLassoVertex = (path: readonly CanvasPoint[], point: CanvasPoint): CanvasPoint[] => {
  const last = path.at(-1)
  return last?.x === point.x && last.y === point.y ? [...path] : [...path, { ...point }]
}

const PENDING_CANVAS_PATH_KINDS = new Set<CanvasDragState['kind']>(['freeform-shape', 'polygon-shape', 'lasso', 'polygon-lasso'])

export const isPendingCanvasPathGesture = (drag: CanvasDragState | null | undefined): drag is CanvasDragState => Boolean(drag && PENDING_CANVAS_PATH_KINDS.has(drag.kind))

export const appendCanvasPathStep = (drag: CanvasDragState, point: CanvasStrokePoint): boolean => {
  if (!isPendingCanvasPathGesture(drag)) return false
  const path = drag.path ?? []
  const last = path.at(-1)
  if (last?.x === point.x && last.y === point.y) return false
  if (drag.kind === 'polygon-lasso' || drag.kind === 'polygon-shape') {
    path.push({ ...point })
    drag.path = path
  } else drag.path = [...path, { ...point }]
  drag.pathRedo = undefined
  return true
}

export const undoCanvasPathStep = (drag: CanvasDragState | null | undefined): boolean => {
  if (!isPendingCanvasPathGesture(drag)) return false
  const path = drag.path ?? []
  const point = path.at(-1)
  if (!point) return false
  drag.path = path.slice(0, -1)
  drag.pathRedo = [...(drag.pathRedo ?? []), { ...point }]
  return true
}

export const redoCanvasPathStep = (drag: CanvasDragState | null | undefined): boolean => {
  if (!isPendingCanvasPathGesture(drag)) return false
  const redo = drag.pathRedo ?? []
  const point = redo.at(-1)
  if (!point) return false
  drag.path = [...(drag.path ?? []), { ...point }]
  drag.pathRedo = redo.length > 1 ? redo.slice(0, -1) : undefined
  return true
}

export interface PendingCanvasGestureHistoryController {
  undo(): boolean
  redo(): boolean
}

const pendingCanvasGestureHistory = new Map<string, PendingCanvasGestureHistoryController>()

export const registerPendingCanvasGestureHistory = (documentId: string, controller: PendingCanvasGestureHistoryController): (() => void) => {
  pendingCanvasGestureHistory.set(documentId, controller)
  return () => {
    if (pendingCanvasGestureHistory.get(documentId) === controller) pendingCanvasGestureHistory.delete(documentId)
  }
}

export const consumePendingCanvasGestureHistory = (documentId: string, direction: 'undo' | 'redo'): boolean => pendingCanvasGestureHistory.get(documentId)?.[direction]() ?? false

export const shouldClosePolygonLasso = (path: readonly CanvasPoint[], point: CanvasPoint, clickCount: number): boolean => path.length >= 3 && (clickCount >= 2 || (path[0].x === point.x && path[0].y === point.y))

export interface PolygonPathRasterCache {
  balanced: boolean
  sourcePath: readonly CanvasPoint[]
  sourcePathLength: number
  committedPoints: CanvasPoint[]
  previewPoints: CanvasPoint[]
}

export const createPolygonPathRasterCache = (): PolygonPathRasterCache => ({
  balanced: false,
  sourcePath: [],
  sourcePathLength: 0,
  committedPoints: [],
  previewPoints: []
})

const appendPolygonLinePoints = (output: CanvasPoint[], from: CanvasPoint, to: CanvasPoint, balanced: boolean): void => {
  output.push(...(balanced ? balancedStairLinePoints(from, to) : rasterLinePoints(from, to)))
}

const preparePolygonPathRasterCache = (path: readonly CanvasPoint[], balanced: boolean, cache: PolygonPathRasterCache): void => {
  if (cache.sourcePath === path && cache.sourcePathLength === path.length && cache.balanced === balanced) return
  const previousPath = cache.sourcePath
  const previousPathLength = cache.sourcePathLength
  const canAppend = cache.balanced === balanced && previousPathLength > 0 && path.length === previousPathLength + 1 && path[0] === previousPath[0] && path[previousPathLength - 1] === previousPath[previousPathLength - 1]
  if (canAppend) {
    const previousPointCount = cache.committedPoints.length
    appendPolygonLinePoints(cache.committedPoints, path[path.length - 2], path[path.length - 1], balanced)
    cache.previewPoints.length = previousPointCount
    for (let index = previousPointCount; index < cache.committedPoints.length; index += 1) cache.previewPoints.push(cache.committedPoints[index])
  } else {
    cache.committedPoints.length = 0
    for (let index = 1; index < path.length; index += 1) appendPolygonLinePoints(cache.committedPoints, path[index - 1], path[index], balanced)
    cache.previewPoints.length = 0
    for (const point of cache.committedPoints) cache.previewPoints.push(point)
  }
  cache.sourcePath = path
  cache.sourcePathLength = path.length
  cache.balanced = balanced
}

export const polygonLassoPreviewPoints = (path: readonly CanvasPoint[], pointer: CanvasPoint, closePreview: boolean, balanced = false, cache?: PolygonPathRasterCache): CanvasPoint[] => {
  if (path.length === 0) return []
  if (cache) {
    preparePolygonPathRasterCache(path, balanced, cache)
    const points = cache.previewPoints
    points.length = cache.committedPoints.length
    appendPolygonLinePoints(points, path.at(-1)!, pointer, balanced)
    if (closePreview && path.length > 1) appendPolygonLinePoints(points, pointer, path[0], balanced)
    return points
  }
  const linePoints = balanced ? balancedStairLinePoints : rasterLinePoints
  const points: CanvasPoint[] = []
  for (let index = 1; index < path.length; index += 1) points.push(...linePoints(path[index - 1], path[index]))
  points.push(...linePoints(path.at(-1)!, pointer))
  if (closePreview && path.length > 1) points.push(...linePoints(pointer, path[0]))
  return points
}

export const polygonLassoClosedPathPoints = (path: readonly CanvasPoint[], balanced = false, cache?: PolygonPathRasterCache): CanvasPoint[] => {
  if (path.length < 2) return path.map((point) => ({ ...point }))
  if (cache) {
    preparePolygonPathRasterCache(path, balanced, cache)
    const points = cache.previewPoints
    points.length = cache.committedPoints.length
    appendPolygonLinePoints(points, path.at(-1)!, path[0], balanced)
    return points
  }
  const linePoints = balanced ? balancedStairLinePoints : rasterLinePoints
  const points: CanvasPoint[] = []
  for (let index = 1; index < path.length; index += 1) points.push(...linePoints(path[index - 1], path[index]))
  points.push(...linePoints(path.at(-1)!, path[0]))
  return points
}

export const shouldRestartFloatingSelectionForCopy = (_floatingCopy: boolean, copyRequested: boolean): boolean => copyRequested

export const shouldReuseFloatingSelectionSourceForCopy = (sourceOrigin: SelectionTransformSource['origin'], copyRequested: boolean, selectionMatchesTarget: boolean, hasCompositeSource: boolean): boolean =>
  (sourceOrigin === 'clipboard' || sourceOrigin === 'selection') && copyRequested && selectionMatchesTarget && !hasCompositeSource

export const floatingSelectionCopyMode = (floatingCopy: boolean | null, copyRequested: boolean): boolean => floatingCopy ?? copyRequested

export const finalizeMarqueeSelection = (before: SelectionMask | null, preview: SelectionMask | null, moved: boolean, mode: SelectionMode): SelectionMask | null => (moved ? preview : mode === 'replace' ? null : before)

export const quickSelectCellSelection = (before: SelectionMask | null, cell: SelectionRect, mode: SelectionMode): SelectionMask | null => combineSelection(before, rectSelection(cell.x, cell.y, cell.width, cell.height), mode)

export const quickSelectCellDragBounds = (startCell: SelectionRect, currentCell: SelectionRect): SelectionRect => {
  const x = Math.min(startCell.x, currentCell.x)
  const y = Math.min(startCell.y, currentCell.y)
  const right = Math.max(startCell.x + startCell.width, currentCell.x + currentCell.width)
  const bottom = Math.max(startCell.y + startCell.height, currentCell.y + currentCell.height)
  return { x, y, width: right - x, height: bottom - y }
}

export interface QuickSelectionPress {
  clientX: number
  clientY: number
  pointerId: number
  timeStamp: number
}

export const isQuickSelectionSecondPress = (previous: QuickSelectionPress | null | undefined, current: QuickSelectionPress, eventDetail: number): boolean => {
  if (eventDetail >= 2) return true
  if (!previous || previous.pointerId !== current.pointerId) return false
  const elapsed = current.timeStamp - previous.timeStamp
  if (elapsed < 0 || elapsed > 500) return false
  const distanceX = current.clientX - previous.clientX
  const distanceY = current.clientY - previous.clientY
  return distanceX * distanceX + distanceY * distanceY <= 36
}

export const marqueeSelectionCommit = (
  drag: Pick<CanvasDragState, 'selectionStart' | 'selectionMode' | 'previewSelection' | 'quickSelectCell' | 'selectionCommitStart'>,
  currentSelection: SelectionMask | null,
  moved: boolean,
  fallbackMode: SelectionMode
): { before: SelectionMask | null; after: SelectionMask | null } => {
  if (drag.quickSelectCell) {
    return {
      before: drag.selectionCommitStart ?? null,
      after: drag.previewSelection ?? drag.selectionStart ?? null
    }
  }
  const before = drag.selectionStart ?? null
  return {
    before,
    after: finalizeMarqueeSelection(before, drag.previewSelection ?? currentSelection, moved, drag.selectionMode ?? fallbackMode)
  }
}
