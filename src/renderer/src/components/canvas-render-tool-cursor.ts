import type { RgbaColor } from '@shared/types-color'
import { isLayerEffectivelyLocked } from '@/core/document-model'
import { activePaintLayer } from '@/store/workspace-session'
import { selectionContains } from '@/core/selection'
import { type CanvasDragState as DragState } from '@/core/canvas-input'
import { transparencyColorAt } from '@/core/canvas-visuals'
import { symmetryPoints } from '@/core/symmetry'
import { sliceAtPoint } from '@/core/slices'
import type * as React from 'react'
import type { DocumentSession } from '@/store/workspace-types'
export function renderCanvasToolCursor({
  inputRef,
  sliceTool,
  currentSession,
  sliceHandleAt,
  document,
  sampleCompositeForPreview,
  checkerboard,
  drawSelectionCursorCorners,
  selectionPreviewColorForBackground,
  canRenderToolPreview,
  session,
  fillKind,
  tilemapEditSelectionAtPoint,
  symmetryCenter,
  drawPreviewPixel,
  previewColorAt,
  drag
}: {
  inputRef: React.RefObject<import('@/core/canvas-input').CanvasInputState>
  sliceTool: boolean
  currentSession: DocumentSession
  sliceHandleAt: (
    clientX: number,
    clientY: number,
    slice: import('@shared/types-selection').SelectionRect
  ) => import('@/core/canvas-input').SelectionHandle | null
  document: import('@shared/types-document').SpriteDocument
  sampleCompositeForPreview: (x: number, y: number) => RgbaColor
  checkerboard: import('@/core/file-preferences').CheckerboardPreferences
  drawSelectionCursorCorners: (pixelX: number, pixelY: number, color: string) => void
  selectionPreviewColorForBackground: (background: RgbaColor) => string
  canRenderToolPreview: boolean
  session: DocumentSession
  fillKind: import('@shared/types-brush').FillKind
  tilemapEditSelectionAtPoint: (
    point: import('@/core/canvas-input').CanvasPoint,
    current?: import('@/store/workspace-types').DocumentSession,
    armOutsideTiles?: boolean
  ) => import('@shared/types-selection').SelectionMask | null | undefined
  symmetryCenter: import('@/core/symmetry').SymmetryCenter
  drawPreviewPixel: (
    pixelX: number,
    pixelY: number,
    color: RgbaColor
  ) => Array<{
    x: number
    y: number
    width: number
    height: number
  }>
  previewColorAt: (
    pixelX: number,
    pixelY: number,
    erase?: boolean,
    coverage?: number,
    paintColor?: RgbaColor,
    baseColor?: RgbaColor,
    overwrite?: boolean
  ) => RgbaColor
  drag: DragState | null
}) {
  const activeSliceCreation = inputRef.current.drag?.kind === 'create-slice'
  if (
    sliceTool &&
    (!inputRef.current.drag || activeSliceCreation) &&
    !inputRef.current.spaceHeld &&
    !inputRef.current.sampling &&
    inputRef.current.pointer.visible
  ) {
    const pointer = inputRef.current.pointer
    const point = pointer.point
    const selectedIds = currentSession.selectedSliceIds?.length
      ? currentSession.selectedSliceIds
      : currentSession.selectedSliceId
        ? [currentSession.selectedSliceId]
        : []
    const selectedSlice = selectedIds.length === 1 ? (currentSession.document.slices?.find((slice) => slice.id === selectedIds[0]) ?? null) : null
    const handle = selectedSlice ? sliceHandleAt(pointer.clientX, pointer.clientY, selectedSlice) : null
    const hit = sliceAtPoint(currentSession.document.slices ?? [], point.x, point.y)
    const insideDocument = point.x >= 0 && point.y >= 0 && point.x < document.width && point.y < document.height
    if (insideDocument && !handle && !hit) {
      const sampled = sampleCompositeForPreview(point.x, point.y)
      const background = sampled.a > 0 ? sampled : transparencyColorAt(point.x, point.y, checkerboard)
      drawSelectionCursorCorners(point.x, point.y, selectionPreviewColorForBackground(background))
    }
  }
  if (
    canRenderToolPreview &&
    !inputRef.current.spaceHeld &&
    inputRef.current.pointer.visible &&
    !inputRef.current.sampling &&
    session.tool === 'fill' &&
    fillKind === 'bucket'
  ) {
    const point = inputRef.current.pointer.point
    const tilemapEditSelection = tilemapEditSelectionAtPoint(point, currentSession)
    const previewSelection = tilemapEditSelection === undefined ? session.selection : tilemapEditSelection
    if (
      tilemapEditSelection !== null &&
      point.x >= 0 &&
      point.y >= 0 &&
      point.x < document.width &&
      point.y < document.height &&
      (!previewSelection || selectionContains(previewSelection, point.x, point.y))
    ) {
      for (const target of symmetryPoints(point, document.width, document.height, session.symmetryAxes, symmetryCenter))
        drawPreviewPixel(target.x, target.y, previewColorAt(target.x, target.y))
    }
  }
  if (
    canRenderToolPreview &&
    !inputRef.current.spaceHeld &&
    inputRef.current.pointer.visible &&
    !inputRef.current.sampling &&
    (session.tool === 'shape' || session.tool === 'line') &&
    !drag
  ) {
    const point = inputRef.current.pointer.point
    const layer = activePaintLayer(currentSession)
    const tilemapEditSelection = tilemapEditSelectionAtPoint(point, currentSession)
    const previewSelection = tilemapEditSelection === undefined ? session.selection : tilemapEditSelection
    if (
      tilemapEditSelection !== null &&
      point.x >= 0 &&
      point.y >= 0 &&
      point.x < document.width &&
      point.y < document.height &&
      !isLayerEffectivelyLocked(document, layer) &&
      (!previewSelection || selectionContains(previewSelection, point.x, point.y))
    ) {
      for (const target of symmetryPoints(point, document.width, document.height, session.symmetryAxes, symmetryCenter))
        drawPreviewPixel(target.x, target.y, previewColorAt(target.x, target.y))
    }
  }
}
