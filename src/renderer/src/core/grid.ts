import type { GridSettings } from '@shared/types-view'
import type { SelectionRect } from '@shared/types-selection'

export const DEFAULT_GRID_SETTINGS: GridSettings = { x: 0, y: 0, width: 16, height: 16 }
export const PIXEL_GRID_MIN_ZOOM = 8

export const shouldRenderPixelGrid = (zoom: number): boolean => Number.isFinite(zoom) && zoom >= PIXEL_GRID_MIN_ZOOM

export const normalizeGridSettings = (value?: Partial<GridSettings> | null): GridSettings => ({
  x: Number.isFinite(value?.x) ? Math.trunc(value!.x!) : DEFAULT_GRID_SETTINGS.x,
  y: Number.isFinite(value?.y) ? Math.trunc(value!.y!) : DEFAULT_GRID_SETTINGS.y,
  width: Number.isFinite(value?.width) ? Math.max(1, Math.trunc(value!.width!)) : DEFAULT_GRID_SETTINGS.width,
  height: Number.isFinite(value?.height) ? Math.max(1, Math.trunc(value!.height!)) : DEFAULT_GRID_SETTINGS.height
})

export const gridCellBoundsAt = (point: { x: number; y: number }, grid: GridSettings, canvasWidth: number, canvasHeight: number): SelectionRect | null => {
  if (![point.x, point.y, grid.x, grid.y, grid.width, grid.height, canvasWidth, canvasHeight].every(Number.isFinite)) return null
  if (grid.width <= 0 || grid.height <= 0 || canvasWidth <= 0 || canvasHeight <= 0 || point.x < 0 || point.y < 0 || point.x >= canvasWidth || point.y >= canvasHeight) return null
  const cellX = grid.x + Math.floor((point.x - grid.x) / grid.width) * grid.width
  const cellY = grid.y + Math.floor((point.y - grid.y) / grid.height) * grid.height
  const left = Math.max(0, cellX)
  const top = Math.max(0, cellY)
  const right = Math.min(canvasWidth, cellX + grid.width)
  const bottom = Math.min(canvasHeight, cellY + grid.height)
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null
}

/**
 * Snap a document point to the closest grid vertex. This is the cartesian
 * equivalent of Aseprite's `PreferSnapTo::ClosestGridVertex` used by brush
 * input and previews. Invalid points/settings are returned unchanged so the
 * caller can keep the normal freehand path as a safe fallback.
 */
export const snapPointToGrid = (point: { x: number; y: number }, grid: GridSettings): { x: number; y: number } => {
  if (![point.x, point.y, grid.x, grid.y, grid.width, grid.height].every(Number.isFinite)
    || grid.width <= 0 || grid.height <= 0) return { x: point.x, y: point.y }
  // Mirror C++ std::div used by Aseprite (quotient truncates toward zero,
  // remainder keeps the dividend sign), including its strict half-cell tie.
  const truncDiv = (value: number, divisor: number): { quotient: number; remainder: number } => {
    const quotient = value < 0 ? Math.ceil(value / divisor) : Math.floor(value / divisor)
    return { quotient, remainder: value - quotient * divisor }
  }
  const nearest = (value: number, origin: number, size: number): number => {
    const originDiv = truncDiv(origin, size)
    const normalized = value - originDiv.remainder
    const pointDiv = truncDiv(normalized, size)
    return originDiv.remainder + pointDiv.quotient * size + (pointDiv.remainder > size / 2 ? size : 0)
  }
  return { x: nearest(point.x, grid.x, grid.width), y: nearest(point.y, grid.y, grid.height) }
}

/**
 * Snaps an axis-aligned marquee to complete grid cells, matching Aseprite's
 * BoxOrigin/BoxEnd behavior: the leading edge is floored to the grid and the
 * trailing edge is ceiled. This keeps the whole cell under the pointer inside
 * the selection instead of snapping both edges to the nearest vertex.
 */
export const snapSelectionBoundsToGrid = (bounds: SelectionRect, grid: GridSettings): SelectionRect => {
  if (![bounds.x, bounds.y, bounds.width, bounds.height, grid.x, grid.y, grid.width, grid.height].every(Number.isFinite)
    || bounds.width <= 0 || bounds.height <= 0 || grid.width <= 0 || grid.height <= 0) return { ...bounds }
  const floorToGrid = (value: number, origin: number, size: number): number => origin + Math.floor((value - origin) / size) * size
  const ceilToGrid = (value: number, origin: number, size: number): number => origin + Math.ceil((value - origin) / size) * size
  const left = floorToGrid(bounds.x, grid.x, grid.width)
  const top = floorToGrid(bounds.y, grid.y, grid.height)
  const right = ceilToGrid(bounds.x + bounds.width, grid.x, grid.width)
  const bottom = ceilToGrid(bounds.y + bounds.height, grid.y, grid.height)
  return { x: left, y: top, width: Math.max(grid.width, right - left), height: Math.max(grid.height, bottom - top) }
}

/**
 * Returns the translation that puts the union's top-left corner on the
 * nearest grid vertex. This mirrors Aseprite's PixelsMovement behavior: the
 * whole selected image moves by one shared offset, without a snap threshold.
 */
export const snapSelectionTranslationToGrid = (
  bounds: readonly SelectionRect[],
  delta: { x: number; y: number },
  grid: GridSettings
): { x: number; y: number } => {
  const valid = bounds.filter((candidate) => [candidate.x, candidate.y, candidate.width, candidate.height].every(Number.isFinite)
    && candidate.width > 0 && candidate.height > 0)
  if (valid.length === 0 || ![delta.x, delta.y, grid.x, grid.y, grid.width, grid.height].every(Number.isFinite)
    || grid.width <= 0 || grid.height <= 0) return { ...delta }
  const left = Math.min(...valid.map((candidate) => candidate.x)) + delta.x
  const top = Math.min(...valid.map((candidate) => candidate.y)) + delta.y
  // Keep the established selection-translation tie behaviour (Math.round
  // toward the next vertex); brush input uses snapPointToGrid's exact
  // Aseprite-compatible strict-half rule above.
  const nearest = (value: number, origin: number, size: number): number => origin + Math.round((value - origin) / size) * size
  return {
    x: delta.x + nearest(left, grid.x, grid.width) - left,
    y: delta.y + nearest(top, grid.y, grid.height) - top
  }
}

const lineStride = (cellSize: number, zoom: number, minimumScreenSpacing: number): number => {
  const screenSpacing = Math.abs(cellSize * zoom)
  if (screenSpacing <= 0) return 1
  return Math.max(1, Math.ceil(minimumScreenSpacing / screenSpacing))
}

/** Returns grid coordinates visible in [from, to], skipping dense lines at low zoom. */
export const gridLinePositions = (
  origin: number,
  cellSize: number,
  from: number,
  to: number,
  zoom: number,
  minimumScreenSpacing = 4
): number[] => {
  if (!Number.isFinite(origin) || !Number.isFinite(cellSize) || cellSize <= 0 || to < from) return []
  const stride = lineStride(cellSize, zoom, minimumScreenSpacing)
  const first = Math.ceil((from - origin) / cellSize)
  const last = Math.floor((to - origin) / cellSize)
  const firstAligned = Math.ceil(first / stride) * stride
  const positions: number[] = []
  for (let index = firstAligned; index <= last; index += stride) positions.push(origin + index * cellSize)
  return positions
}
