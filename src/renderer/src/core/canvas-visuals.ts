import type { RgbaColor, SelectionMask, ToolId } from '@shared/types'
import type { SelectionHandle, SelectionRotationHandle, SelectionShearHandle } from './canvas-input'
import { DEFAULT_CHECKERBOARD_PREFERENCES, type CheckerboardPreferences } from './file-preferences'

export const canvasCursors = {
  default: 'var(--cursor-default)', unavailable: 'var(--cursor-unavailable)', crosshair: 'var(--cursor-crosshair)', pencilWhite: 'var(--cursor-pencil-white)', pencilBlack: 'var(--cursor-pencil-black)', grab: 'var(--cursor-grab)', grabbing: 'var(--cursor-grabbing)',
  selectionWhite: 'var(--cursor-selection-white)', selectionBlack: 'var(--cursor-selection-black)', eyedropper: 'var(--cursor-eyedropper)', zoom: 'var(--cursor-zoom)', rotate: 'var(--cursor-rotate)', move: 'var(--cursor-move)', ewResize: 'var(--cursor-ew-resize)', nsResize: 'var(--cursor-ns-resize)',
  nwseResize: 'var(--cursor-nwse-resize)', neswResize: 'var(--cursor-nesw-resize)', selectionMove: 'var(--cursor-selection-move)', copy: 'var(--cursor-copy)',
  rotateN: 'var(--cursor-selection-rotate-n)', rotateNe: 'var(--cursor-selection-rotate-ne)', rotateSe: 'var(--cursor-selection-rotate-se)', rotateS: 'var(--cursor-selection-rotate-s)', rotateSw: 'var(--cursor-selection-rotate-sw)', rotateNw: 'var(--cursor-selection-rotate-nw)', shearHorizontal: 'var(--cursor-selection-shear-horizontal)', shearVertical: 'var(--cursor-selection-shear-vertical)', shearNesw: 'var(--cursor-selection-shear-nesw)', shearNwse: 'var(--cursor-selection-shear-nwse)'
} as const

export const resizeCursors: Record<SelectionHandle, string> = { nw: canvasCursors.nwseResize, n: canvasCursors.nsResize, ne: canvasCursors.neswResize, w: canvasCursors.ewResize, e: canvasCursors.ewResize, sw: canvasCursors.neswResize, s: canvasCursors.nsResize, se: canvasCursors.nwseResize }
export type SelectionResizeCursor = 'horizontal' | 'vertical' | 'nesw' | 'nwse'
export const directionalResizeCursors: Record<SelectionResizeCursor, string> = { horizontal: canvasCursors.ewResize, vertical: canvasCursors.nsResize, nesw: canvasCursors.neswResize, nwse: canvasCursors.nwseResize }
export type SelectionRotationCursor = SelectionRotationHandle | 'rotate-n' | 'rotate-s'
export const rotationCursors: Record<SelectionRotationCursor, string> = { 'rotate-n': canvasCursors.rotateN, 'rotate-ne': canvasCursors.rotateNe, 'rotate-se': canvasCursors.rotateSe, 'rotate-s': canvasCursors.rotateS, 'rotate-sw': canvasCursors.rotateSw, 'rotate-nw': canvasCursors.rotateNw }
export const shearCursors: Record<SelectionShearHandle, string> = { 'shear-n': canvasCursors.shearHorizontal, 'shear-s': canvasCursors.shearHorizontal, 'shear-w': canvasCursors.shearVertical, 'shear-e': canvasCursors.shearVertical }
export type SelectionShearCursor = 'horizontal' | 'vertical' | 'nesw' | 'nwse'
export const directionalShearCursors: Record<SelectionShearCursor, string> = { horizontal: canvasCursors.shearHorizontal, vertical: canvasCursors.shearVertical, nesw: canvasCursors.shearNesw, nwse: canvasCursors.shearNwse }

export const selectionResizeCursorForDirection = (direction: { x: number; y: number }): SelectionResizeCursor => {
  const angle = ((Math.atan2(direction.y, direction.x) * 180 / Math.PI) % 180 + 180) % 180
  if (angle < 22.5 || angle >= 157.5) return 'horizontal'
  if (angle < 67.5) return 'nwse'
  if (angle < 112.5) return 'vertical'
  return 'nesw'
}

const selectionCornerDiagonalIndices: Partial<Record<SelectionHandle, readonly [number, number]>> = {
  nw: [0, 7], ne: [2, 5], sw: [5, 2], se: [7, 0]
}

export const selectionCornerResizeCursorForPoints = (
  handle: SelectionHandle,
  points: readonly { x: number; y: number }[]
): SelectionResizeCursor | null => {
  const diagonal = selectionCornerDiagonalIndices[handle]
  if (!diagonal) return null
  const first = points[diagonal[0]]
  const second = points[diagonal[1]]
  if (!first || !second) return null
  const direction = { x: first.x - second.x, y: first.y - second.y }
  return Math.hypot(direction.x, direction.y) < 1e-9 ? null : selectionResizeCursorForDirection(direction)
}

export const selectionShearCursorForDirection = (direction: { x: number; y: number }): SelectionShearCursor =>
  selectionResizeCursorForDirection(direction)

const selectionHandleDirections: Record<SelectionHandle, { x: number; y: number }> = {
  nw: { x: -1, y: -1 }, n: { x: 0, y: -1 }, ne: { x: 1, y: -1 },
  w: { x: -1, y: 0 }, e: { x: 1, y: 0 },
  sw: { x: -1, y: 1 }, s: { x: 0, y: 1 }, se: { x: 1, y: 1 }
}

const rotateDirection = (direction: { x: number; y: number }, angle: number): { x: number; y: number } => {
  const radians = angle * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return { x: direction.x * cosine - direction.y * sine, y: direction.x * sine + direction.y * cosine }
}

export const selectionResizeCursorForHandle = (
  handle: SelectionHandle,
  selectionRotation = 0,
  viewRotation = 0,
  mirrored = false,
  mirroredVertical = false
): SelectionResizeCursor => {
  const selectionDirection = rotateDirection(selectionHandleDirections[handle], selectionRotation)
  const displayedDirection = rotateDirection({
    x: mirrored ? -selectionDirection.x : selectionDirection.x,
    y: mirroredVertical ? -selectionDirection.y : selectionDirection.y
  }, viewRotation)
  return selectionResizeCursorForDirection(displayedDirection)
}

const VERTICAL_ROTATION_CURSOR_RATIO = Math.SQRT2 - 1

export const selectionRotationCursorForPosition = (
  point: { x: number; y: number },
  center: { x: number; y: number }
): SelectionRotationCursor => {
  const deltaX = point.x - center.x
  const deltaY = point.y - center.y
  if (Math.abs(deltaY) > 0 && Math.abs(deltaX) <= Math.abs(deltaY) * VERTICAL_ROTATION_CURSOR_RATIO) return deltaY < 0 ? 'rotate-n' : 'rotate-s'
  return deltaY < 0
    ? deltaX < 0 ? 'rotate-nw' : 'rotate-ne'
    : deltaX < 0 ? 'rotate-sw' : 'rotate-se'
}

export const selectionTransformDragCursor = (kind: string): string | null =>
  kind === 'transform-content' || kind === 'rotate-content' || kind === 'shear-content' ? canvasCursors.move : null

export const selectionCreationCursor = (showCrosshair: boolean, available = true, creating = false): string =>
  available ? creating ? 'none' : showCrosshair ? canvasCursors.crosshair : 'none' : canvasCursors.unavailable

export const colorLuminance = (color: RgbaColor): number => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722

export const canvasStatusTextColor = (backgrounds: RgbaColor[], darkColor: string, lightColor: string): string => {
  const luminance = backgrounds.length > 0
    ? backgrounds.reduce((total, color) => total + colorLuminance(color), 0) / backgrounds.length
    : 0
  return luminance > 145 ? darkColor : lightColor
}

export interface VisualRect { x: number; y: number; width: number; height: number }

export const selectionPathPreviewPixelVisible = (
  pixel: VisualRect,
  viewportWidth: number,
  viewportHeight: number,
  insideDocument: boolean
): boolean => insideDocument
  && pixel.x + pixel.width > 0
  && pixel.y + pixel.height > 0
  && pixel.x < viewportWidth
  && pixel.y < viewportHeight

export const selectionCursorCornerRects = (pixel: VisualRect, devicePixelRatio = 1): VisualRect[] => {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  const align = (value: number): number => Math.round(value * dpr) / dpr
  // The pointed cell belongs to the canvas preview. The cursor is only four
  // corners immediately outside that cell, so the preview remains the center
  // square shown between the marks instead of becoming part of the cursor.
  const cellSize = Math.max(1, Math.min(pixel.width, pixel.height))
  const arm = Math.max(2, Math.min(6, Math.round(cellSize / 4)))
  const left = align(pixel.x - arm)
  const top = align(pixel.y - arm)
  const right = align(pixel.x + pixel.width + arm)
  const bottom = align(pixel.y + pixel.height + arm)
  const stroke = 2
  return [
    // Each L has its bend facing the pointed cell.
    { x: left, y: pixel.y - stroke, width: arm, height: stroke },
    { x: pixel.x - stroke, y: top, width: stroke, height: arm },
    { x: pixel.x + pixel.width, y: pixel.y - stroke, width: arm, height: stroke },
    { x: pixel.x + pixel.width, y: top, width: stroke, height: arm },
    { x: left, y: pixel.y + pixel.height, width: arm, height: stroke },
    { x: pixel.x - stroke, y: pixel.y + pixel.height, width: stroke, height: arm },
    { x: pixel.x + pixel.width, y: pixel.y + pixel.height, width: arm, height: stroke },
    { x: pixel.x + pixel.width, y: pixel.y + pixel.height, width: stroke, height: arm }
  ]
}

export const transparencyColorAt = (pixelX: number, pixelY: number, checkerboard: CheckerboardPreferences = DEFAULT_CHECKERBOARD_PREFERENCES): RgbaColor =>
  (Math.floor(pixelX / checkerboard.size) + Math.floor(pixelY / checkerboard.size)) % 2 === 0
    ? checkerboard.lightColor
    : checkerboard.darkColor

const colorCursorTools = new Set<ToolId>(['pencil', 'airbrush', 'eraser', 'fill', 'selection', 'liquify'])
export const previewCursorTools = new Set<ToolId>(['pencil', 'airbrush', 'eraser', 'fill', 'shape', 'line', 'liquify'])

export const canvasToolCursor = (tool: ToolId, color: RgbaColor, available = true): string => {
  if (tool === 'rotate') return canvasCursors.rotate
  if (!available) return canvasCursors.unavailable
  if (tool === 'hand') return canvasCursors.grab
  if (tool === 'move') return canvasCursors.move
  if (tool === 'zoom') return canvasCursors.zoom
  if (tool === 'selection') return colorLuminance(color) < 145 ? canvasCursors.selectionWhite : canvasCursors.selectionBlack
  if (colorCursorTools.has(tool)) return colorLuminance(color) < 145 ? canvasCursors.pencilWhite : canvasCursors.pencilBlack
  return canvasCursors.crosshair
}

/** 返回选区边界像素，供预览层单独绘制，避免与文档像素合成耦合。 */
export const selectionPreviewPixels = (selection: SelectionMask): Set<string> => {
  const pixels = new Set<string>()
  if (!selection.mask) {
    for (let x = selection.x; x < selection.x + selection.width; x += 1) {
      pixels.add(`${x}:${selection.y}`)
      pixels.add(`${x}:${selection.y + selection.height - 1}`)
    }
    for (let y = selection.y + 1; y < selection.y + selection.height - 1; y += 1) {
      pixels.add(`${selection.x}:${y}`)
      pixels.add(`${selection.x + selection.width - 1}:${y}`)
    }
    return pixels
  }
  const selectedAt = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < selection.width && y < selection.height && selection.mask![y * selection.width + x] === 1
  for (let y = 0; y < selection.height; y += 1) for (let x = 0; x < selection.width; x += 1) {
    if (!selectedAt(x, y)) continue
    if (!selectedAt(x - 1, y) || !selectedAt(x + 1, y) || !selectedAt(x, y - 1) || !selectedAt(x, y + 1)) pixels.add(`${selection.x + x}:${selection.y + y}`)
  }
  return pixels
}
