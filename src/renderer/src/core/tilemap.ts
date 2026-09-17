import type { AnimationCelSurface } from '@shared/types-animation'
import type { ColorMode, TileRepeatMode } from '@shared/types-raster'
import type { PaletteEntry, RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import type { TilemapCelData, TilemapCell, Tileset } from '@shared/types-tiles'
import { packColor, relativeLuminanceColor, unpackColor } from './raster'
import { balancedStairLinePoints } from './pixel-line'
import { readSurfacePackedLocal } from './runtime-raster'
import { combineSelection, rasterLinePoints, selectionContains } from './selection'

export const MAX_TILE_SIZE = 256
export const MAX_TILESET_PIXELS = 16 * 1024 * 1024
export const MAX_TILESET_LAYOUT_SLOTS = 64 * 1024
export const MAX_TILEMAP_CELLS = 16 * 1024 * 1024
export const MAX_TILEMAP_SURFACE_PIXELS = 64 * 1024 * 1024

export interface TilemapEdit {
  layerId: string
  frameId: string
  before: Map<number, TilemapCell | null>
  after: Map<number, TilemapCell | null>
  dirtyRect: SelectionRect | null
}

export type TilemapDrawingMode = 'create' | 'hybrid' | 'paint' | 'edit'

export interface TilemapTilesetEdit {
  tilemapEdit: TilemapEdit
  tilesetId: string
  beforeTileset: Tileset
  afterTileset: Tileset
  changedTileIds: string[]
}

export interface TilemapSelectionMoveSource {
  layerId: string
  frameId: string
  tileWidth: number
  tileHeight: number
  columns: number
  rows: number
  cells: Array<{ index: number; cell: TilemapCell | null }>
}

export interface TileRepeatViewport {
  left: number
  top: number
  right: number
  bottom: number
}

export interface TileRepeatOffset {
  x: number
  y: number
}

export interface TileRepeatLineSegment {
  from: { x: number; y: number }
  to: { x: number; y: number }
  fromProgress: number
  toProgress: number
}

export interface TileRepeatMappedPoint<T extends { x: number; y: number }> {
  local: T
  offset: TileRepeatOffset
}

const positiveModulo = (value: number, modulus: number): number => ((value % modulus) + modulus) % modulus

const validDimension = (value: number, maximum = Number.MAX_SAFE_INTEGER): boolean =>
  Number.isSafeInteger(value) && value >= 1 && value <= maximum

export const normalizeTilesetTileSlots = (tileIds: readonly string[], source?: readonly (string | null)[]): Array<string | null> => {
  const validIds = new Set(tileIds)
  const slots = new Array<string | null>(Math.max(1, source?.length ?? 0)).fill(null)
  const placed = new Set<string>()
  if (source) for (let index = 0; index < source.length; index += 1) {
    const tileId = source[index]
    if (tileId === null || !validIds.has(tileId) || placed.has(tileId)) continue
    slots[index] = tileId
    placed.add(tileId)
  }
  for (const tileId of tileIds) {
    if (placed.has(tileId)) continue
    const emptyIndex = slots.indexOf(null)
    if (emptyIndex >= 0) slots[emptyIndex] = tileId
    else slots.push(tileId)
    placed.add(tileId)
  }
  return slots
}

export const compactTilesetTileSlots = (tileIds: readonly string[], source?: readonly (string | null)[]): Array<string | null> => {
  const slots = normalizeTilesetTileSlots(tileIds, source)
  let lastOccupied = slots.length - 1
  while (lastOccupied > 0 && slots[lastOccupied] === null) lastOccupied -= 1
  return slots.slice(0, Math.max(1, lastOccupied + 1))
}

export const tilesetTileSlots = (tileset: Tileset): Array<string | null> => normalizeTilesetTileSlots(tileset.tileIds, tileset.tileSlots)

export const normalizeTileRepeatMode = (value: unknown): TileRepeatMode =>
  value === 'x' || value === 'y' || value === 'both' ? value : 'off'

export const tileRepeatIncludesX = (mode: TileRepeatMode): boolean => mode === 'x' || mode === 'both'
export const tileRepeatIncludesY = (mode: TileRepeatMode): boolean => mode === 'y' || mode === 'both'

const tileRepeatAxisOffsets = (enabled: boolean): number[] => enabled ? [-1, 0, 1] : [0]

export const tileRepeatDocumentOffsets = (
  width: number,
  height: number,
  mode: TileRepeatMode
): TileRepeatOffset[] => {
  const xs = tileRepeatAxisOffsets(tileRepeatIncludesX(mode))
  const ys = tileRepeatAxisOffsets(tileRepeatIncludesY(mode))
  const offsets: TileRepeatOffset[] = []
  for (const y of ys) for (const x of xs) offsets.push({ x: x * width, y: y * height })
  return offsets
}

export const wrapDocumentPointForTileRepeat = <T extends { x: number; y: number }>(
  point: T,
  width: number,
  height: number,
  mode: TileRepeatMode
): T => ({
  ...point,
  x: tileRepeatIncludesX(mode) && width > 0 ? positiveModulo(point.x, width) : point.x,
  y: tileRepeatIncludesY(mode) && height > 0 ? positiveModulo(point.y, height) : point.y
})

const tileRepeatSelectionAxisSegments = (
  start: number,
  length: number,
  size: number,
  repeated: boolean
): Array<{ start: number; length: number }> => {
  if (length <= 0 || size <= 0) return []
  if (!repeated) {
    const clippedStart = Math.max(0, start)
    const clippedEnd = Math.min(size, start + length)
    return clippedEnd > clippedStart ? [{ start: clippedStart, length: clippedEnd - clippedStart }] : []
  }
  if (length >= size) return [{ start: 0, length: size }]
  const wrappedStart = positiveModulo(start, size)
  const firstLength = Math.min(length, size - wrappedStart)
  return firstLength === length
    ? [{ start: wrappedStart, length }]
    : [{ start: wrappedStart, length: firstLength }, { start: 0, length: length - firstLength }]
}

/** Splits a repeated-space rectangle into the document-local rectangles it covers. */
export const tileRepeatRectSegments = (
  rect: SelectionRect,
  width: number,
  height: number,
  mode: TileRepeatMode
): SelectionRect[] => {
  const xSegments = tileRepeatSelectionAxisSegments(rect.x, rect.width, width, tileRepeatIncludesX(mode))
  const ySegments = tileRepeatSelectionAxisSegments(rect.y, rect.height, height, tileRepeatIncludesY(mode))
  const segments: SelectionRect[] = []
  for (const y of ySegments) for (const x of xSegments) {
    segments.push({ x: x.start, y: y.start, width: x.length, height: y.length })
  }
  return segments
}

/** Folds a selection drawn in repeated document space back into the original canvas. */
export const wrapSelectionMaskForTileRepeat = (
  selection: SelectionMask | null,
  width: number,
  height: number,
  mode: TileRepeatMode
): SelectionMask | null => {
  if (!selection || width <= 0 || height <= 0) return null
  const repeatX = tileRepeatIncludesX(mode)
  const repeatY = tileRepeatIncludesY(mode)
  const endX = selection.x + selection.width - 1
  const endY = selection.y + selection.height - 1
  const xPeriod = repeatX ? Math.floor(selection.x / width) : 0
  const yPeriod = repeatY ? Math.floor(selection.y / height) : 0
  const shiftsWithoutWrapping = (!repeatX || Math.floor(endX / width) === xPeriod)
    && (!repeatY || Math.floor(endY / height) === yPeriod)
    && (repeatX || (selection.x >= 0 && endX < width))
    && (repeatY || (selection.y >= 0 && endY < height))
  if (shiftsWithoutWrapping) {
    return {
      ...selection,
      x: selection.x - xPeriod * width,
      y: selection.y - yPeriod * height,
      mask: selection.mask?.slice()
    }
  }

  if (!selection.mask) {
    const xSegments = tileRepeatSelectionAxisSegments(selection.x, selection.width, width, repeatX)
    const ySegments = tileRepeatSelectionAxisSegments(selection.y, selection.height, height, repeatY)
    if (xSegments.length === 0 || ySegments.length === 0) return null
    const left = Math.min(...xSegments.map((segment) => segment.start))
    const top = Math.min(...ySegments.map((segment) => segment.start))
    const right = Math.max(...xSegments.map((segment) => segment.start + segment.length))
    const bottom = Math.max(...ySegments.map((segment) => segment.start + segment.length))
    const resultWidth = right - left
    const resultHeight = bottom - top
    const selectedPixels = xSegments.reduce((sum, segment) => sum + segment.length, 0)
      * ySegments.reduce((sum, segment) => sum + segment.length, 0)
    if (selectedPixels === resultWidth * resultHeight) return { x: left, y: top, width: resultWidth, height: resultHeight }
    const mask = new Uint8Array(resultWidth * resultHeight)
    for (const ySegment of ySegments) for (const xSegment of xSegments) {
      for (let y = ySegment.start; y < ySegment.start + ySegment.length; y += 1) {
        mask.fill(1, (y - top) * resultWidth + xSegment.start - left, (y - top) * resultWidth + xSegment.start - left + xSegment.length)
      }
    }
    return { x: left, y: top, width: resultWidth, height: resultHeight, mask }
  }

  const canvasMask = new Uint8Array(width * height)
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  let selectedPixels = 0
  for (let sourceY = 0; sourceY < selection.height; sourceY += 1) for (let sourceX = 0; sourceX < selection.width; sourceX += 1) {
    if (selection.mask[sourceY * selection.width + sourceX] !== 1) continue
    let targetX: number = selection.x + sourceX
    let targetY: number = selection.y + sourceY
    if (repeatX) targetX = positiveModulo(targetX, width)
    else if (targetX < 0 || targetX >= width) continue
    if (repeatY) targetY = positiveModulo(targetY, height)
    else if (targetY < 0 || targetY >= height) continue
    const index = targetY * width + targetX
    if (canvasMask[index] === 1) continue
    canvasMask[index] = 1
    selectedPixels += 1
    left = Math.min(left, targetX)
    top = Math.min(top, targetY)
    right = Math.max(right, targetX)
    bottom = Math.max(bottom, targetY)
  }
  if (selectedPixels === 0) return null
  const resultWidth = right - left + 1
  const resultHeight = bottom - top + 1
  if (selectedPixels === resultWidth * resultHeight) return { x: left, y: top, width: resultWidth, height: resultHeight }
  const mask = new Uint8Array(resultWidth * resultHeight)
  for (let y = top; y <= bottom; y += 1) {
    mask.set(canvasMask.subarray(y * width + left, y * width + right + 1), (y - top) * resultWidth)
  }
  return { x: left, y: top, width: resultWidth, height: resultHeight, mask }
}

/** Keeps a repeated-space selection continuous while placing one equivalent near the original canvas. */
export const normalizeSelectionForTileRepeatPreview = (
  selection: SelectionMask | null,
  width: number,
  height: number,
  mode: TileRepeatMode
): SelectionMask | null => {
  if (!selection || width <= 0 || height <= 0) return selection
  const centerX = selection.x + selection.width / 2
  const centerY = selection.y + selection.height / 2
  return {
    ...selection,
    x: tileRepeatIncludesX(mode) ? selection.x - Math.floor(centerX / width) * width : selection.x,
    y: tileRepeatIncludesY(mode) ? selection.y - Math.floor(centerY / height) * height : selection.y,
    mask: selection.mask?.slice()
  }
}

export const tileRepeatOffsetsForViewport = (
  _viewport: TileRepeatViewport,
  _originX: number,
  _originY: number,
  _displayWidth: number,
  _displayHeight: number,
  mode: TileRepeatMode,
  _maximumCopies = 512
): TileRepeatOffset[] => {
  if (mode === 'off') return [{ x: 0, y: 0 }]
  const xs = tileRepeatAxisOffsets(tileRepeatIncludesX(mode))
  const ys = tileRepeatAxisOffsets(tileRepeatIncludesY(mode))
  const offsets: TileRepeatOffset[] = []
  for (const y of ys) for (const x of xs) offsets.push({ x, y })
  return offsets
}

export const documentPointForTileRepeatCopies = <T extends { x: number; y: number }>(
  point: T,
  width: number,
  height: number,
  mode: TileRepeatMode,
  allowOutsideCopies = false
): T | null => tileRepeatMappedPointForCopies(point, width, height, mode, allowOutsideCopies)?.local ?? null

export const tileRepeatMappedPointForCopies = <T extends { x: number; y: number }>(
  point: T,
  width: number,
  height: number,
  mode: TileRepeatMode,
  allowOutsideCopies = false
): TileRepeatMappedPoint<T> | null => {
  if (mode === 'off') return { local: point, offset: { x: 0, y: 0 } }
  if (width <= 0 || height <= 0) return null
  const xEnabled = tileRepeatIncludesX(mode)
  const yEnabled = tileRepeatIncludesY(mode)
  if ((!xEnabled && (point.x < 0 || point.x >= width)) || (!yEnabled && (point.y < 0 || point.y >= height))) return null
  const offset = {
    x: xEnabled ? Math.floor(point.x / width) : 0,
    y: yEnabled ? Math.floor(point.y / height) : 0
  }
  if (!allowOutsideCopies && (offset.x < -1 || offset.x > 1 || offset.y < -1 || offset.y > 1)) return null
  return { local: wrapDocumentPointForTileRepeat(point, width, height, mode), offset }
}

export const tileRepeatPreviewPlacements = <T extends TileRepeatOffset & { fromX: number; fromY: number; toX: number; toY: number }>(
  point: { x: number; y: number },
  width: number,
  height: number,
  mode: TileRepeatMode,
  copies: readonly T[]
): Array<{ point: { x: number; y: number }; copy: T }> => {
  const mapped = tileRepeatMappedPointForCopies(point, width, height, mode, true)
  if (!mapped) return []
  return copies
    .filter((copy) => mapped.local.x >= copy.fromX && mapped.local.y >= copy.fromY && mapped.local.x < copy.toX && mapped.local.y < copy.toY)
    .map((copy) => ({ point: mapped.local, copy }))
}

export const tileRepeatContinuousPreviewPlacements = <T extends TileRepeatOffset>(
  point: { x: number; y: number },
  width: number,
  height: number,
  mode: TileRepeatMode,
  copies: readonly T[]
): Array<{ point: { x: number; y: number }; samplePoint: { x: number; y: number }; copy: T }> => {
  if (width <= 0 || height <= 0 || copies.length === 0) return []
  if ((!tileRepeatIncludesX(mode) && (point.x < 0 || point.x >= width)) || (!tileRepeatIncludesY(mode) && (point.y < 0 || point.y >= height))) return []
  const samplePoint = wrapDocumentPointForTileRepeat(point, width, height, mode)
  const left = Math.min(...copies.map((copy) => copy.x)) * width
  const top = Math.min(...copies.map((copy) => copy.y)) * height
  const right = (Math.max(...copies.map((copy) => copy.x)) + 1) * width
  const bottom = (Math.max(...copies.map((copy) => copy.y)) + 1) * height
  return copies
    .map((copy) => ({ point: { x: point.x + copy.x * width, y: point.y + copy.y * height }, samplePoint, copy }))
    .filter((placement) => placement.point.x >= left && placement.point.y >= top && placement.point.x < right && placement.point.y < bottom)
}

export const nearestTileRepeatEquivalent = <T extends { x: number; y: number }>(
  point: T,
  reference: { x: number; y: number },
  width: number,
  height: number,
  mode: TileRepeatMode
): T => ({
  ...point,
  x: tileRepeatIncludesX(mode) && width > 0 ? point.x + Math.round((reference.x - point.x) / width) * width : point.x,
  y: tileRepeatIncludesY(mode) && height > 0 ? point.y + Math.round((reference.y - point.y) / height) * height : point.y
})

export const tileRepeatLineSegments = (
  from: { x: number; y: number },
  to: { x: number; y: number },
  width: number,
  height: number,
  mode: TileRepeatMode,
  algorithm: 'raster' | 'balanced' = 'raster'
): TileRepeatLineSegment[] => {
  const points = algorithm === 'balanced' ? balancedStairLinePoints(from, to) : rasterLinePoints(from, to)
  if (points.length === 0) return []
  const wrapped = points.map((point) => wrapDocumentPointForTileRepeat(point, width, height, mode))
  const progressAt = (index: number): number => points.length <= 1 ? 1 : index / (points.length - 1)
  const segments: TileRepeatLineSegment[] = []
  let start = 0
  const append = (end: number): void => {
    segments.push({
      from: wrapped[start],
      to: wrapped[end],
      fromProgress: progressAt(start),
      toProgress: progressAt(end)
    })
  }
  for (let index = 1; index < wrapped.length; index += 1) {
    const previous = wrapped[index - 1]
    const current = wrapped[index]
    if (Math.abs(current.x - previous.x) <= 1 && Math.abs(current.y - previous.y) <= 1) continue
    append(index - 1)
    start = index
  }
  append(wrapped.length - 1)
  return segments
}

export const tileRepeatLinePoints = (
  from: { x: number; y: number },
  to: { x: number; y: number },
  width: number,
  height: number,
  mode: TileRepeatMode,
  algorithm: 'raster' | 'balanced' = 'raster'
): Array<{ x: number; y: number }> => {
  const points = algorithm === 'balanced' ? balancedStairLinePoints(from, to) : rasterLinePoints(from, to)
  return points.map((point) => wrapDocumentPointForTileRepeat(point, width, height, mode))
}

export const tileRepeatFitZoom = (
  viewportWidth: number,
  viewportHeight: number,
  documentWidth: number,
  documentHeight: number,
  mode: TileRepeatMode,
  rotation = 0
): number => {
  const repeatWidth = documentWidth * (tileRepeatIncludesX(mode) ? 3 : 1)
  const repeatHeight = documentHeight * (tileRepeatIncludesY(mode) ? 3 : 1)
  const radians = rotation * Math.PI / 180
  const cosine = Math.abs(Math.cos(radians))
  const sine = Math.abs(Math.sin(radians))
  const displayedWidth = repeatWidth * cosine + repeatHeight * sine
  const displayedHeight = repeatWidth * sine + repeatHeight * cosine
  if (viewportWidth <= 0 || viewportHeight <= 0 || displayedWidth <= 0 || displayedHeight <= 0) return 1
  return Math.max(0.0625, Math.min(64, Math.min(viewportWidth / displayedWidth, viewportHeight / displayedHeight)))
}

export const cloneTilemapCell = (cell: TilemapCell | null): TilemapCell | null => cell ? { ...cell } : null

export const tilemapCellsEqual = (left: TilemapCell | null, right: TilemapCell | null): boolean =>
  left === right || Boolean(left && right
    && left.tilesetId === right.tilesetId
    && left.tileId === right.tileId
    && Boolean(left.flipHorizontal) === Boolean(right.flipHorizontal)
    && Boolean(left.flipVertical) === Boolean(right.flipVertical)
    && (left.rotation ?? 0) === (right.rotation ?? 0))

export const cloneTilemapCelData = (tilemap: TilemapCelData): TilemapCelData => ({
  ...tilemap,
  cells: tilemap.cells.map(cloneTilemapCell)
})

export const cloneTileset = (tileset: Tileset): Tileset => ({
  ...tileset,
  tileIds: [...tileset.tileIds],
  tileSlots: tileset.tileSlots ? [...tileset.tileSlots] : undefined,
  pixels: tileset.pixels.slice()
})

export const replaceTilesetContents = (target: Tileset, snapshot: Tileset): void => {
  target.name = snapshot.name
  target.tileWidth = snapshot.tileWidth
  target.tileHeight = snapshot.tileHeight
  target.columns = snapshot.columns
  target.rows = snapshot.rows
  target.tileIds = [...snapshot.tileIds]
  target.tileSlots = snapshot.tileSlots ? [...snapshot.tileSlots] : undefined
  target.pixels = snapshot.pixels.slice()
}

export const tilesetsEqual = (left: Tileset, right: Tileset): boolean => {
  const leftSlots = tilesetTileSlots(left)
  const rightSlots = tilesetTileSlots(right)
  return left.id === right.id
    && left.name === right.name
    && left.tileWidth === right.tileWidth
    && left.tileHeight === right.tileHeight
    && left.columns === right.columns
    && left.rows === right.rows
    && left.tileIds.length === right.tileIds.length
    && left.tileIds.every((tileId, index) => tileId === right.tileIds[index])
    && leftSlots.length === rightSlots.length
    && leftSlots.every((tileId, index) => tileId === rightSlots[index])
    && left.pixels.length === right.pixels.length
    && left.pixels.every((value, index) => value === right.pixels[index])
}

export const createTilemapCelData = (
  canvasWidth: number,
  canvasHeight: number,
  tileWidth: number,
  tileHeight: number
): TilemapCelData => {
  if (!validDimension(tileWidth, MAX_TILE_SIZE) || !validDimension(tileHeight, MAX_TILE_SIZE)) throw new Error('Invalid tile size')
  const columns = Math.max(1, Math.ceil(canvasWidth / tileWidth))
  const rows = Math.max(1, Math.ceil(canvasHeight / tileHeight))
  const count = columns * rows
  const surfacePixels = columns * tileWidth * rows * tileHeight
  if (!Number.isSafeInteger(count) || count > MAX_TILEMAP_CELLS
    || !Number.isSafeInteger(surfacePixels) || surfacePixels > MAX_TILEMAP_SURFACE_PIXELS) throw new Error('Tilemap is too large')
  return { tileWidth, tileHeight, columns, rows, cells: Array.from({ length: count }, () => null) }
}

export interface ResizedTilemapCelData {
  tilemap: TilemapCelData
  offsetX: number
  offsetY: number
}

/** Resizes a Tilemap by complete cells while preserving its existing grid phase. */
export const resizeTilemapCelDataToCanvas = (
  tilemap: TilemapCelData,
  offsetX: number,
  offsetY: number,
  canvasWidth: number,
  canvasHeight: number,
  trimOutside = false
): ResizedTilemapCelData => {
  if (!validDimension(canvasWidth) || !validDimension(canvasHeight)) throw new Error('Invalid canvas size')
  const originX = Math.trunc(offsetX)
  const originY = Math.trunc(offsetY)
  const coverFromColumn = Math.floor(-originX / tilemap.tileWidth)
  const coverFromRow = Math.floor(-originY / tilemap.tileHeight)
  const coverToColumn = Math.ceil((canvasWidth - originX) / tilemap.tileWidth)
  const coverToRow = Math.ceil((canvasHeight - originY) / tilemap.tileHeight)
  const fromColumn = trimOutside ? coverFromColumn : Math.min(0, coverFromColumn)
  const fromRow = trimOutside ? coverFromRow : Math.min(0, coverFromRow)
  const toColumn = trimOutside ? coverToColumn : Math.max(tilemap.columns, coverToColumn)
  const toRow = trimOutside ? coverToRow : Math.max(tilemap.rows, coverToRow)
  const columns = Math.max(1, toColumn - fromColumn)
  const rows = Math.max(1, toRow - fromRow)
  const count = columns * rows
  const surfacePixels = columns * tilemap.tileWidth * rows * tilemap.tileHeight
  if (!Number.isSafeInteger(count) || count > MAX_TILEMAP_CELLS
    || !Number.isSafeInteger(surfacePixels) || surfacePixels > MAX_TILEMAP_SURFACE_PIXELS) throw new Error('Tilemap is too large')

  const resizedOffsetX = originX + fromColumn * tilemap.tileWidth
  const resizedOffsetY = originY + fromRow * tilemap.tileHeight
  if (fromColumn === 0 && fromRow === 0 && columns === tilemap.columns && rows === tilemap.rows) {
    return { tilemap, offsetX: resizedOffsetX, offsetY: resizedOffsetY }
  }

  const cells = new Array<TilemapCell | null>(count).fill(null)
  for (let sourceRow = 0; sourceRow < tilemap.rows; sourceRow += 1) {
    const targetRow = sourceRow - fromRow
    if (targetRow < 0 || targetRow >= rows) continue
    for (let sourceColumn = 0; sourceColumn < tilemap.columns; sourceColumn += 1) {
      const targetColumn = sourceColumn - fromColumn
      if (targetColumn < 0 || targetColumn >= columns) continue
      cells[targetRow * columns + targetColumn] = cloneTilemapCell(tilemap.cells[sourceRow * tilemap.columns + sourceColumn])
    }
  }
  return {
    tilemap: { ...tilemap, columns, rows, cells },
    offsetX: resizedOffsetX,
    offsetY: resizedOffsetY
  }
}

export const normalizeTilemapCell = (value: unknown, tilesets?: ReadonlyMap<string, Tileset>): TilemapCell | null => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<TilemapCell>
  if (typeof candidate.tilesetId !== 'string' || !candidate.tilesetId || typeof candidate.tileId !== 'string' || !candidate.tileId) return null
  const tileset = tilesets?.get(candidate.tilesetId)
  if (tilesets && (!tileset || !tileset.tileIds.includes(candidate.tileId))) return null
  const rotation = candidate.rotation === 1 || candidate.rotation === 2 || candidate.rotation === 3 ? candidate.rotation : 0
  return {
    tilesetId: candidate.tilesetId,
    tileId: candidate.tileId,
    ...(candidate.flipHorizontal === true ? { flipHorizontal: true } : {}),
    ...(candidate.flipVertical === true ? { flipVertical: true } : {}),
    ...(rotation ? { rotation } : {})
  }
}

export const normalizeTilemapCelData = (
  value: unknown,
  tilesets?: ReadonlyMap<string, Tileset>,
  strictCells = false
): TilemapCelData | null => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<TilemapCelData>
  const tileWidth = Number(candidate.tileWidth)
  const tileHeight = Number(candidate.tileHeight)
  const columns = Number(candidate.columns)
  const rows = Number(candidate.rows)
  const count = columns * rows
  if (!validDimension(tileWidth, MAX_TILE_SIZE)
    || !validDimension(tileHeight, MAX_TILE_SIZE)
    || !validDimension(columns, MAX_TILEMAP_CELLS)
    || !validDimension(rows, MAX_TILEMAP_CELLS)
    || !Number.isSafeInteger(count)
    || count > MAX_TILEMAP_CELLS
    || !Array.isArray(candidate.cells)
    || candidate.cells.length !== count) return null
  const cells: Array<TilemapCell | null> = []
  for (const cell of candidate.cells) {
    if (cell === null) {
      cells.push(null)
      continue
    }
    const normalized = normalizeTilemapCell(cell, tilesets)
    if (!normalized && strictCells) return null
    cells.push(normalized)
  }
  return { tileWidth, tileHeight, columns, rows, cells }
}

export const createTilesetFromRgba = (
  id: string,
  name: string,
  sourceWidth: number,
  sourceHeight: number,
  sourcePixels: Uint8ClampedArray,
  tileWidth: number,
  tileHeight: number,
  createTileId: (index: number) => string
): Tileset => {
  if (!id || !validDimension(tileWidth, MAX_TILE_SIZE) || !validDimension(tileHeight, MAX_TILE_SIZE)) throw new Error('Invalid tileset')
  if (!validDimension(sourceWidth) || !validDimension(sourceHeight) || sourcePixels.length !== sourceWidth * sourceHeight * 4) throw new Error('Invalid tileset source')
  const columns = Math.max(1, Math.ceil(sourceWidth / tileWidth))
  const rows = Math.max(1, Math.ceil(sourceHeight / tileHeight))
  const sheetWidth = columns * tileWidth
  const sheetHeight = rows * tileHeight
  if (!Number.isSafeInteger(sheetWidth * sheetHeight) || sheetWidth * sheetHeight > MAX_TILESET_PIXELS) throw new Error('Tileset is too large')
  const pixels = new Uint8ClampedArray(sheetWidth * sheetHeight * 4)
  for (let y = 0; y < sourceHeight; y += 1) {
    const sourceOffset = y * sourceWidth * 4
    pixels.set(sourcePixels.subarray(sourceOffset, sourceOffset + sourceWidth * 4), y * sheetWidth * 4)
  }
  const tileCount = columns * rows
  const tileIds = Array.from({ length: tileCount }, (_, index) => createTileId(index))
  if (tileIds.some((tileId) => !tileId) || new Set(tileIds).size !== tileIds.length) throw new Error('Invalid tile IDs')
  return {
    id,
    name: name.trim() || 'Tileset',
    tileWidth,
    tileHeight,
    columns,
    rows,
    tileIds,
    tileSlots: [...tileIds],
    pixels
  }
}

export const createSolidTileset = (
  id: string,
  name: string,
  tileWidth: number,
  tileHeight: number,
  color: RgbaColor,
  tileId: string
): Tileset => {
  const pixels = new Uint8ClampedArray(tileWidth * tileHeight * 4)
  for (let index = 0; index < tileWidth * tileHeight; index += 1) {
    const offset = index * 4
    pixels[offset] = color.r
    pixels[offset + 1] = color.g
    pixels[offset + 2] = color.b
    pixels[offset + 3] = color.a
  }
  return createTilesetFromRgba(id, name, tileWidth, tileHeight, pixels, tileWidth, tileHeight, () => tileId)
}

export const createBlankTileset = (
  id: string,
  name: string,
  tileWidth: number,
  tileHeight: number,
  tileId: string,
  columns = 8
): Tileset => {
  if (!id || !tileId || !validDimension(tileWidth, MAX_TILE_SIZE) || !validDimension(tileHeight, MAX_TILE_SIZE) || !validDimension(columns)) throw new Error('Invalid tileset')
  const pixelCount = columns * tileWidth * tileHeight
  if (!Number.isSafeInteger(pixelCount) || pixelCount > MAX_TILESET_PIXELS) throw new Error('Tileset is too large')
  return {
    id,
    name: name.trim() || 'Tileset',
    tileWidth,
    tileHeight,
    columns,
    rows: 1,
    tileIds: [tileId],
    tileSlots: [tileId],
    pixels: new Uint8ClampedArray(pixelCount * 4)
  }
}

export const tilesetTileIndex = (tileset: Tileset, tileId: string): number => tileset.tileIds.indexOf(tileId)

const tilesetSheetWidth = (tileset: Tileset): number => tileset.columns * tileset.tileWidth

const copyTilesetTile = (
  source: Tileset,
  sourceIndex: number,
  targetPixels: Uint8ClampedArray,
  targetIndex: number,
  targetColumns = source.columns
): void => {
  const sourceColumn = sourceIndex % source.columns
  const sourceRow = Math.floor(sourceIndex / source.columns)
  const targetColumn = targetIndex % targetColumns
  const targetRow = Math.floor(targetIndex / targetColumns)
  const sourceWidth = tilesetSheetWidth(source)
  const targetWidth = targetColumns * source.tileWidth
  for (let y = 0; y < source.tileHeight; y += 1) {
    const sourceOffset = ((sourceRow * source.tileHeight + y) * sourceWidth + sourceColumn * source.tileWidth) * 4
    const targetOffset = ((targetRow * source.tileHeight + y) * targetWidth + targetColumn * source.tileWidth) * 4
    targetPixels.set(source.pixels.subarray(sourceOffset, sourceOffset + source.tileWidth * 4), targetOffset)
  }
}

export const readTilesetTilePixels = (tileset: Tileset, tileId: string): Uint8ClampedArray | null => {
  const index = tilesetTileIndex(tileset, tileId)
  if (index < 0) return null
  const pixels = new Uint8ClampedArray(tileset.tileWidth * tileset.tileHeight * 4)
  copyTilesetTile(tileset, index, pixels, 0, 1)
  return pixels
}

export const tilesetHasOnlyTransparentTile = (tileset: Tileset): boolean => {
  if (tileset.tileIds.length !== 1) return false
  const pixels = readTilesetTilePixels(tileset, tileset.tileIds[0])
  if (!pixels) return false
  for (let offset = 3; offset < pixels.length; offset += 4) if (pixels[offset] !== 0) return false
  return true
}

export const repositionTilesetTileSlots = (
  slots: readonly (string | null)[],
  selectedTileIds: readonly string[],
  targetSlot: number,
  anchorTileId: string,
  requestedColumns: number
): Array<string | null> => {
  const columns = Math.max(1, Math.trunc(requestedColumns))
  const selected = new Set(selectedTileIds)
  const moving = slots.flatMap((tileId, index) => tileId !== null && selected.has(tileId)
    ? [{ tileId, index, x: index % columns, y: Math.floor(index / columns) }]
    : [])
  const anchor = moving.find((entry) => entry.tileId === anchorTileId) ?? moving[0]
  if (!anchor) return [...slots]

  const normalizedTarget = Math.max(0, Math.trunc(targetSlot))
  const targetX = normalizedTarget % columns
  const targetY = Math.floor(normalizedTarget / columns)
  const minimumX = Math.min(...moving.map((entry) => entry.x))
  const maximumX = Math.max(...moving.map((entry) => entry.x))
  const minimumY = Math.min(...moving.map((entry) => entry.y))
  const deltaX = Math.max(-minimumX, Math.min(columns - 1 - maximumX, targetX - anchor.x))
  const deltaY = Math.max(-minimumY, targetY - anchor.y)
  const destinations = moving.map((entry) => (entry.y + deltaY) * columns + entry.x + deltaX)
  const requiredLength = Math.max(...destinations) + 1
  const targetLength = Math.max(slots.length, Math.ceil(requiredLength / columns) * columns)
  const next: Array<string | null> = [...slots, ...new Array<string | null>(Math.max(0, targetLength - slots.length)).fill(null)]
  const sourceSlots: number[] = []
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] !== null && selected.has(next[index]!)) {
      sourceSlots.push(index)
      next[index] = null
    }
  }
  const displaced: string[] = []
  for (let offset = 0; offset < moving.length; offset += 1) {
    const destination = destinations[offset]
    const occupant = next[destination]
    if (occupant !== null) displaced.push(occupant)
    next[destination] = moving[offset].tileId
  }

  const destinationSet = new Set(destinations)
  for (const tileId of displaced) {
    let destination = sourceSlots.find((index) => !destinationSet.has(index) && next[index] === null)
    if (destination === undefined) destination = next.findIndex((entry, index) => entry === null && !destinationSet.has(index))
    if (destination < 0) {
      destination = next.length
      next.push(...new Array<string | null>(columns).fill(null))
    }
    next[destination] = tileId
  }
  return next
}

export const setTilesetTileSlots = (tileset: Tileset, requestedSlots: readonly (string | null)[]): Tileset | null => {
  if (requestedSlots.length < 1 || requestedSlots.length > MAX_TILESET_LAYOUT_SLOTS) return null
  const requestedIds = requestedSlots.filter((tileId): tileId is string => tileId !== null)
  if (requestedSlots.some((tileId) => tileId !== null && (typeof tileId !== 'string' || !tileId))
    || requestedIds.length !== tileset.tileIds.length
    || new Set(requestedIds).size !== requestedIds.length
    || requestedIds.some((tileId) => !tileset.tileIds.includes(tileId))) return null
  const tileSlots = compactTilesetTileSlots(tileset.tileIds, requestedSlots)
  const current = compactTilesetTileSlots(tileset.tileIds, tileset.tileSlots)
  if (tileSlots.length === current.length && tileSlots.every((tileId, index) => tileId === current[index])) return null
  return { ...tileset, tileSlots }
}

export const reorderTilesetTiles = (tileset: Tileset, orderedTileIds: readonly string[]): Tileset | null => {
  if (orderedTileIds.length !== tileset.tileIds.length || new Set(orderedTileIds).size !== orderedTileIds.length) return null
  const sourceIndexById = new Map(tileset.tileIds.map((tileId, index) => [tileId, index]))
  if (orderedTileIds.some((tileId) => !sourceIndexById.has(tileId))) return null
  if (orderedTileIds.every((tileId, index) => tileId === tileset.tileIds[index])) return null

  const pixels = new Uint8ClampedArray(tileset.pixels.length)
  for (let targetIndex = 0; targetIndex < orderedTileIds.length; targetIndex += 1) {
    copyTilesetTile(tileset, sourceIndexById.get(orderedTileIds[targetIndex])!, pixels, targetIndex)
  }
  return { ...tileset, tileIds: [...orderedTileIds], tileSlots: tileset.tileSlots ? [...tileset.tileSlots] : undefined, pixels }
}

export const writeTilesetTilePixels = (tileset: Tileset, tileId: string, pixels: Uint8ClampedArray): boolean => {
  const index = tilesetTileIndex(tileset, tileId)
  if (index < 0 || pixels.length !== tileset.tileWidth * tileset.tileHeight * 4) return false
  const column = index % tileset.columns
  const row = Math.floor(index / tileset.columns)
  const sheetWidth = tilesetSheetWidth(tileset)
  for (let y = 0; y < tileset.tileHeight; y += 1) {
    const sourceOffset = y * tileset.tileWidth * 4
    const targetOffset = ((row * tileset.tileHeight + y) * sheetWidth + column * tileset.tileWidth) * 4
    tileset.pixels.set(pixels.subarray(sourceOffset, sourceOffset + tileset.tileWidth * 4), targetOffset)
  }
  return true
}

export const appendBlankTilesetTile = (tileset: Tileset, tileId: string): Tileset => {
  if (!tileId || tileset.tileIds.includes(tileId)) throw new Error('Invalid tile ID')
  const appendLayoutSlot = (target: Tileset): void => {
    const slots = normalizeTilesetTileSlots(tileset.tileIds, tileset.tileSlots)
    const emptyIndex = slots.indexOf(null)
    if (emptyIndex >= 0) slots[emptyIndex] = tileId
    else slots.push(tileId)
    target.tileSlots = compactTilesetTileSlots([...tileset.tileIds, tileId], slots)
  }
  const nextIndex = tileset.tileIds.length
  const currentCapacity = tileset.columns * tileset.rows
  if (nextIndex < currentCapacity) {
    const next = cloneTileset(tileset)
    next.tileIds.push(tileId)
    appendLayoutSlot(next)
    const blank = new Uint8ClampedArray(tileset.tileWidth * tileset.tileHeight * 4)
    writeTilesetTilePixels(next, tileId, blank)
    return next
  }
  const rows = tileset.rows + 1
  const pixelCount = tileset.columns * tileset.tileWidth * rows * tileset.tileHeight
  if (!Number.isSafeInteger(pixelCount) || pixelCount > MAX_TILESET_PIXELS) throw new Error('Tileset is too large')
  const pixels = new Uint8ClampedArray(pixelCount * 4)
  pixels.set(tileset.pixels)
  const next = { ...tileset, rows, tileIds: [...tileset.tileIds, tileId], pixels }
  appendLayoutSlot(next)
  return next
}

export const appendTilesetTile = (tileset: Tileset, tileId: string, pixels: Uint8ClampedArray): Tileset => {
  if (pixels.length !== tileset.tileWidth * tileset.tileHeight * 4) throw new Error('Invalid tile pixels')
  const next = appendBlankTilesetTile(tileset, tileId)
  if (!writeTilesetTilePixels(next, tileId, pixels)) throw new Error('Unable to append tile')
  return next
}

export const appendTilesetTileInPlace = (tileset: Tileset, tileId: string, pixels: Uint8ClampedArray): void => {
  if (!tileId || tileset.tileIds.includes(tileId) || pixels.length !== tileset.tileWidth * tileset.tileHeight * 4) throw new Error('Invalid tile')
  const nextIndex = tileset.tileIds.length
  if (nextIndex >= tileset.columns * tileset.rows) {
    const rows = tileset.rows + 1
    const pixelCount = tileset.columns * tileset.tileWidth * rows * tileset.tileHeight
    if (!Number.isSafeInteger(pixelCount) || pixelCount > MAX_TILESET_PIXELS) throw new Error('Tileset is too large')
    const expanded = new Uint8ClampedArray(pixelCount * 4)
    expanded.set(tileset.pixels)
    tileset.rows = rows
    tileset.pixels = expanded
  }
  tileset.tileIds.push(tileId)
  const slots = normalizeTilesetTileSlots(tileset.tileIds.slice(0, -1), tileset.tileSlots)
  const emptyIndex = slots.indexOf(null)
  if (emptyIndex >= 0) slots[emptyIndex] = tileId
  else slots.push(tileId)
  tileset.tileSlots = compactTilesetTileSlots(tileset.tileIds, slots)
  if (!writeTilesetTilePixels(tileset, tileId, pixels)) throw new Error('Unable to append tile')
}

export const findTilesetTileByPixels = (tileset: Tileset, pixels: Uint8ClampedArray): string | null => {
  if (pixels.length !== tileset.tileWidth * tileset.tileHeight * 4) return null
  const sheetWidth = tileset.columns * tileset.tileWidth
  for (let tileIndex = 0; tileIndex < tileset.tileIds.length; tileIndex += 1) {
    const column = tileIndex % tileset.columns
    const row = Math.floor(tileIndex / tileset.columns)
    let equal = true
    for (let y = 0; y < tileset.tileHeight && equal; y += 1) {
      const sourceOffset = y * tileset.tileWidth * 4
      const targetOffset = ((row * tileset.tileHeight + y) * sheetWidth + column * tileset.tileWidth) * 4
      for (let index = 0; index < tileset.tileWidth * 4; index += 1) {
        if (pixels[sourceOffset + index] === tileset.pixels[targetOffset + index]) continue
        equal = false
        break
      }
    }
    if (equal) return tileset.tileIds[tileIndex]
  }
  return null
}

export interface RasterSurfaceTilemapSlice {
  tilemap: TilemapCelData
  tileset: Tileset
}

/** Crops one raster cel to the canvas grid and reuses identical RGBA tiles. */
export const sliceRasterSurfaceToTilemap = (
  surface: AnimationCelSurface | undefined,
  palette: readonly PaletteEntry[],
  canvasWidth: number,
  canvasHeight: number,
  tileset: Tileset,
  createTileId: () => string
): RasterSurfaceTilemapSlice => {
  const tilemap = createTilemapCelData(canvasWidth, canvasHeight, tileset.tileWidth, tileset.tileHeight)
  if (!surface) return { tilemap, tileset }
  const paletteById = surface.format === 'indexed'
    ? new Map(palette.map((entry) => [entry.id, entry.color]))
    : null
  let nextTileset = tileset

  for (let row = 0; row < tilemap.rows; row += 1) for (let column = 0; column < tilemap.columns; column += 1) {
    const pixels = new Uint8ClampedArray(tilemap.tileWidth * tilemap.tileHeight * 4)
    let visible = false
    for (let y = 0; y < tilemap.tileHeight; y += 1) for (let x = 0; x < tilemap.tileWidth; x += 1) {
      const canvasX = column * tilemap.tileWidth + x
      const canvasY = row * tilemap.tileHeight + y
      if (canvasX >= canvasWidth || canvasY >= canvasHeight) continue
      const localX = canvasX - surface.offsetX
      const localY = canvasY - surface.offsetY
      if (localX < 0 || localY < 0 || localX >= surface.width || localY >= surface.height) continue
      const packed = readSurfacePackedLocal(surface, localX, localY)
      const color = surface.format === 'rgba' ? unpackColor(packed) : paletteById?.get(packed)
      if (!color || color.a === 0) continue
      const offset = (y * tilemap.tileWidth + x) * 4
      pixels[offset] = color.r
      pixels[offset + 1] = color.g
      pixels[offset + 2] = color.b
      pixels[offset + 3] = color.a
      visible = true
    }
    if (!visible) continue
    let tileId = findTilesetTileByPixels(nextTileset, pixels)
    if (!tileId) {
      tileId = createTileId()
      nextTileset = appendTilesetTile(nextTileset, tileId, pixels)
    }
    tilemap.cells[row * tilemap.columns + column] = { tilesetId: nextTileset.id, tileId }
  }
  return { tilemap, tileset: nextTileset }
}

export const deleteTilesetTiles = (tileset: Tileset, requestedTileIds: readonly string[]): Tileset | null => {
  if (tileset.tileIds.length <= 1) return null
  const requested = new Set(requestedTileIds.filter((tileId) => tileset.tileIds.includes(tileId)))
  if (requested.size === 0) return null
  if (requested.size >= tileset.tileIds.length) requested.delete(tileset.tileIds[0])
  if (requested.size === 0) return null
  const tileIds = tileset.tileIds.filter((id) => !requested.has(id))
  const rows = Math.max(1, Math.ceil(tileIds.length / tileset.columns))
  const pixelCount = tileset.columns * tileset.tileWidth * rows * tileset.tileHeight
  const pixels = new Uint8ClampedArray(pixelCount * 4)
  let targetIndex = 0
  for (let sourceIndex = 0; sourceIndex < tileset.tileIds.length; sourceIndex += 1) {
    if (requested.has(tileset.tileIds[sourceIndex])) continue
    copyTilesetTile(tileset, sourceIndex, pixels, targetIndex)
    targetIndex += 1
  }
  const tileSlots = compactTilesetTileSlots(tileIds, tilesetTileSlots(tileset).map((candidate) => candidate !== null && requested.has(candidate) ? null : candidate))
  return { ...tileset, rows, tileIds, tileSlots, pixels }
}

export const deleteTilesetTile = (tileset: Tileset, tileId: string): Tileset | null => deleteTilesetTiles(tileset, [tileId])

export const tilemapSourcePointForCell = (x: number, y: number, width: number, height: number, cell: TilemapCell): { x: number; y: number } => {
  let sourceX = cell.flipHorizontal ? width - 1 - x : x
  let sourceY = cell.flipVertical ? height - 1 - y : y
  const rotation = width === height ? cell.rotation ?? 0 : 0
  if (rotation === 1) [sourceX, sourceY] = [sourceY, width - 1 - sourceX]
  else if (rotation === 2) [sourceX, sourceY] = [width - 1 - sourceX, height - 1 - sourceY]
  else if (rotation === 3) [sourceX, sourceY] = [height - 1 - sourceY, sourceX]
  return { x: sourceX, y: sourceY }
}

const tileColorAt = (tileset: Tileset, tileIndex: number, x: number, y: number, cell: TilemapCell): RgbaColor => {
  const point = tilemapSourcePointForCell(x, y, tileset.tileWidth, tileset.tileHeight, cell)
  const tileColumn = tileIndex % tileset.columns
  const tileRow = Math.floor(tileIndex / tileset.columns)
  const sheetWidth = tileset.columns * tileset.tileWidth
  const offset = ((tileRow * tileset.tileHeight + point.y) * sheetWidth + tileColumn * tileset.tileWidth + point.x) * 4
  return { r: tileset.pixels[offset], g: tileset.pixels[offset + 1], b: tileset.pixels[offset + 2], a: tileset.pixels[offset + 3] }
}

export const readTilemapCellPixels = (
  cell: TilemapCell | null,
  tilesets: ReadonlyMap<string, Tileset>,
  tileWidth: number,
  tileHeight: number
): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(tileWidth * tileHeight * 4)
  if (!cell) return pixels
  const tileset = tilesets.get(cell.tilesetId)
  if (!tileset || tileset.tileWidth !== tileWidth || tileset.tileHeight !== tileHeight) return pixels
  const tileIndex = tilesetTileIndex(tileset, cell.tileId)
  if (tileIndex < 0) return pixels
  for (let y = 0; y < tileHeight; y += 1) for (let x = 0; x < tileWidth; x += 1) {
    const color = tileColorAt(tileset, tileIndex, x, y, cell)
    const offset = (y * tileWidth + x) * 4
    pixels[offset] = color.r
    pixels[offset + 1] = color.g
    pixels[offset + 2] = color.b
    pixels[offset + 3] = color.a
  }
  return pixels
}

const clearSurfaceCell = (surface: AnimationCelSurface, tilemap: TilemapCelData, cellIndex: number): void => {
  const column = cellIndex % tilemap.columns
  const row = Math.floor(cellIndex / tilemap.columns)
  const startX = column * tilemap.tileWidth
  const startY = row * tilemap.tileHeight
  for (let y = 0; y < tilemap.tileHeight; y += 1) {
    if (surface.format === 'rgba') surface.pixels.fill(0, ((startY + y) * surface.width + startX) * 4, ((startY + y) * surface.width + startX + tilemap.tileWidth) * 4)
    else surface.pixels.fill(0, (startY + y) * surface.width + startX, (startY + y) * surface.width + startX + tilemap.tileWidth)
  }
}

export const renderTilemapCellIntoSurface = (
  surface: AnimationCelSurface,
  tilemap: TilemapCelData,
  tilesets: ReadonlyMap<string, Tileset>,
  cellIndex: number,
  mode: ColorMode,
  colorToPaletteId?: (color: RgbaColor) => number
): void => {
  if (cellIndex < 0 || cellIndex >= tilemap.cells.length) return
  if (surface.width !== tilemap.columns * tilemap.tileWidth || surface.height !== tilemap.rows * tilemap.tileHeight) return
  clearSurfaceCell(surface, tilemap, cellIndex)
  const cell = tilemap.cells[cellIndex]
  if (!cell) return
  const tileset = tilesets.get(cell.tilesetId)
  if (!tileset || tileset.tileWidth !== tilemap.tileWidth || tileset.tileHeight !== tilemap.tileHeight) return
  const tileIndex = tilesetTileIndex(tileset, cell.tileId)
  if (tileIndex < 0) return
  const column = cellIndex % tilemap.columns
  const row = Math.floor(cellIndex / tilemap.columns)
  const startX = column * tilemap.tileWidth
  const startY = row * tilemap.tileHeight
  for (let y = 0; y < tilemap.tileHeight; y += 1) for (let x = 0; x < tilemap.tileWidth; x += 1) {
    let color = tileColorAt(tileset, tileIndex, x, y, cell)
    if (mode === 'grayscale') color = relativeLuminanceColor(color)
    const targetIndex = (startY + y) * surface.width + startX + x
    if (surface.format === 'rgba') {
      const offset = targetIndex * 4
      surface.pixels[offset] = color.r
      surface.pixels[offset + 1] = color.g
      surface.pixels[offset + 2] = color.b
      surface.pixels[offset + 3] = color.a
    } else if (color.a > 0) surface.pixels[targetIndex] = colorToPaletteId?.(color) ?? 0
  }
}

export const renderTilemapSurface = (
  tilemap: TilemapCelData,
  tilesets: readonly Tileset[],
  mode: ColorMode,
  offsetX = 0,
  offsetY = 0,
  colorToPaletteId?: (color: RgbaColor) => number
): AnimationCelSurface => {
  const width = tilemap.columns * tilemap.tileWidth
  const height = tilemap.rows * tilemap.tileHeight
  const pixelCount = width * height
  if (!Number.isSafeInteger(pixelCount) || pixelCount < 1 || pixelCount > MAX_TILEMAP_SURFACE_PIXELS) throw new Error('Tilemap surface is too large')
  const surface: AnimationCelSurface = mode === 'indexed'
    ? { format: 'indexed', width, height, offsetX, offsetY, pixels: new Uint32Array(width * height) }
    : { format: 'rgba', width, height, offsetX, offsetY, pixels: new Uint8ClampedArray(width * height * 4) }
  const byId = new Map(tilesets.map((tileset) => [tileset.id, tileset]))
  for (let index = 0; index < tilemap.cells.length; index += 1) renderTilemapCellIntoSurface(surface, tilemap, byId, index, mode, colorToPaletteId)
  return surface
}

export const tilemapCellIndexAtPoint = (
  tilemap: TilemapCelData,
  offsetX: number,
  offsetY: number,
  x: number,
  y: number
): number | null => {
  const localX = Math.floor(x) - offsetX
  const localY = Math.floor(y) - offsetY
  if (localX < 0 || localY < 0) return null
  const column = Math.floor(localX / tilemap.tileWidth)
  const row = Math.floor(localY / tilemap.tileHeight)
  if (column < 0 || row < 0 || column >= tilemap.columns || row >= tilemap.rows) return null
  return row * tilemap.columns + column
}

export const tilemapCellBounds = (tilemap: TilemapCelData, offsetX: number, offsetY: number, index: number): SelectionRect => ({
  x: offsetX + index % tilemap.columns * tilemap.tileWidth,
  y: offsetY + Math.floor(index / tilemap.columns) * tilemap.tileHeight,
  width: tilemap.tileWidth,
  height: tilemap.tileHeight
})

export const tilemapCellIndexesForSelection = (
  selection: SelectionMask,
  tilemap: TilemapCelData,
  offsetX: number,
  offsetY: number
): number[] => {
  const surfaceRight = offsetX + tilemap.columns * tilemap.tileWidth
  const surfaceBottom = offsetY + tilemap.rows * tilemap.tileHeight
  const selectionLeft = Math.max(selection.x, offsetX)
  const selectionTop = Math.max(selection.y, offsetY)
  const selectionRight = Math.min(selection.x + selection.width, surfaceRight)
  const selectionBottom = Math.min(selection.y + selection.height, surfaceBottom)
  if (selectionRight <= selectionLeft || selectionBottom <= selectionTop) return []

  const firstColumn = Math.max(0, Math.floor((selectionLeft - offsetX) / tilemap.tileWidth))
  const firstRow = Math.max(0, Math.floor((selectionTop - offsetY) / tilemap.tileHeight))
  const lastColumn = Math.min(tilemap.columns - 1, Math.floor((selectionRight - 1 - offsetX) / tilemap.tileWidth))
  const lastRow = Math.min(tilemap.rows - 1, Math.floor((selectionBottom - 1 - offsetY) / tilemap.tileHeight))
  const indexes: number[] = []
  for (let row = firstRow; row <= lastRow; row += 1) for (let column = firstColumn; column <= lastColumn; column += 1) {
    const index = row * tilemap.columns + column
    const bounds = tilemapCellBounds(tilemap, offsetX, offsetY, index)
    const left = Math.max(bounds.x, selectionLeft)
    const top = Math.max(bounds.y, selectionTop)
    const right = Math.min(bounds.x + bounds.width, selectionRight)
    const bottom = Math.min(bounds.y + bounds.height, selectionBottom)
    let touched = !selection.mask && right > left && bottom > top
    for (let y = top; !touched && y < bottom; y += 1) for (let x = left; x < right; x += 1) {
      if (!selectionContains(selection, x, y)) continue
      touched = true
      break
    }
    if (touched) indexes.push(index)
  }
  return indexes
}

export const tilemapSelectionForCellIndexes = (
  tilemap: TilemapCelData,
  offsetX: number,
  offsetY: number,
  indexes: readonly number[],
  clip?: SelectionRect
): SelectionMask | null => {
  const validIndexes = [...new Set(indexes)].filter((index) => index >= 0 && index < tilemap.cells.length)
  if (validIndexes.length === 0) return null
  const clipLeft = clip?.x ?? Number.NEGATIVE_INFINITY
  const clipTop = clip?.y ?? Number.NEGATIVE_INFINITY
  const clipRight = clip ? clip.x + clip.width : Number.POSITIVE_INFINITY
  const clipBottom = clip ? clip.y + clip.height : Number.POSITIVE_INFINITY
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  for (const index of validIndexes) {
    const bounds = tilemapCellBounds(tilemap, offsetX, offsetY, index)
    left = Math.min(left, Math.max(bounds.x, clipLeft))
    top = Math.min(top, Math.max(bounds.y, clipTop))
    right = Math.max(right, Math.min(bounds.x + bounds.width, clipRight))
    bottom = Math.max(bottom, Math.min(bounds.y + bounds.height, clipBottom))
  }
  const width = right - left
  const height = bottom - top
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  const mask = new Uint8Array(width * height)
  let selectedPixels = 0
  for (const index of validIndexes) {
    const bounds = tilemapCellBounds(tilemap, offsetX, offsetY, index)
    const fromX = Math.max(bounds.x, left)
    const fromY = Math.max(bounds.y, top)
    const toX = Math.min(bounds.x + bounds.width, right)
    const toY = Math.min(bounds.y + bounds.height, bottom)
    for (let y = fromY; y < toY; y += 1) {
      const start = (y - top) * width + fromX - left
      mask.fill(1, start, start + toX - fromX)
      selectedPixels += toX - fromX
    }
  }
  return selectedPixels === width * height ? { x: left, y: top, width, height } : { x: left, y: top, width, height, mask }
}

export const tilemapEditableSelectionAtPoint = (
  tilemap: TilemapCelData,
  offsetX: number,
  offsetY: number,
  point: { x: number; y: number },
  documentBounds: SelectionRect,
  selection: SelectionMask | null,
  armOutsideTiles = false,
  includeEmptyCells = false
): SelectionMask | null => {
  const index = tilemapCellIndexAtPoint(tilemap, offsetX, offsetY, point.x, point.y)
  if (!armOutsideTiles && (index === null || (!tilemap.cells[index] && !includeEmptyCells))) return null
  if (!armOutsideTiles && selection && !selectionContains(selection, point.x, point.y)) return null
  const editableIndexes = includeEmptyCells
    ? tilemap.cells.map((_, cellIndex) => cellIndex)
    : tilemap.cells.flatMap((cell, cellIndex) => cell ? [cellIndex] : [])
  const editableSelection = tilemapSelectionForCellIndexes(
    tilemap,
    offsetX,
    offsetY,
    editableIndexes,
    documentBounds
  )
  return selection ? combineSelection(editableSelection, selection, 'intersect') : editableSelection
}

export const tilemapCellTranslationForSelection = (
  tilemap: TilemapCelData,
  offsetX: number,
  offsetY: number,
  selection: SelectionMask,
  target: SelectionRect
): { columns: number; rows: number } | null => {
  if (selection.mask || target.flipHorizontal || target.flipVertical) return null
  if (selection.width !== target.width || selection.height !== target.height) return null
  const aligned = (value: number, origin: number, size: number): boolean => (value - origin) % size === 0
  if (!aligned(selection.x, offsetX, tilemap.tileWidth)
    || !aligned(selection.y, offsetY, tilemap.tileHeight)
    || selection.width % tilemap.tileWidth !== 0
    || selection.height % tilemap.tileHeight !== 0
    || !aligned(target.x, offsetX, tilemap.tileWidth)
    || !aligned(target.y, offsetY, tilemap.tileHeight)) return null
  return {
    columns: (target.x - selection.x) / tilemap.tileWidth,
    rows: (target.y - selection.y) / tilemap.tileHeight
  }
}

/** Expands every touched pixel to its complete Tilemap cell, optionally clipped to a document rectangle. */
export const expandSelectionToTilemapCells = (
  selection: SelectionMask | null,
  tilemap: TilemapCelData,
  offsetX: number,
  offsetY: number,
  clip?: SelectionRect
): SelectionMask | null => {
  if (!selection || selection.width <= 0 || selection.height <= 0) return null
  const surfaceRight = offsetX + tilemap.columns * tilemap.tileWidth
  const surfaceBottom = offsetY + tilemap.rows * tilemap.tileHeight
  const clipLeft = Math.max(offsetX, clip?.x ?? offsetX)
  const clipTop = Math.max(offsetY, clip?.y ?? offsetY)
  const clipRight = Math.min(surfaceRight, clip ? clip.x + clip.width : surfaceRight)
  const clipBottom = Math.min(surfaceBottom, clip ? clip.y + clip.height : surfaceBottom)
  const selectionLeft = Math.max(selection.x, clipLeft)
  const selectionTop = Math.max(selection.y, clipTop)
  const selectionRight = Math.min(selection.x + selection.width, clipRight)
  const selectionBottom = Math.min(selection.y + selection.height, clipBottom)
  if (selectionRight <= selectionLeft || selectionBottom <= selectionTop) return null

  const firstColumn = Math.max(0, Math.floor((selectionLeft - offsetX) / tilemap.tileWidth))
  const firstRow = Math.max(0, Math.floor((selectionTop - offsetY) / tilemap.tileHeight))
  const lastColumn = Math.min(tilemap.columns - 1, Math.floor((selectionRight - 1 - offsetX) / tilemap.tileWidth))
  const lastRow = Math.min(tilemap.rows - 1, Math.floor((selectionBottom - 1 - offsetY) / tilemap.tileHeight))
  const selectedCells: number[] = []

  for (let row = firstRow; row <= lastRow; row += 1) for (let column = firstColumn; column <= lastColumn; column += 1) {
    const index = row * tilemap.columns + column
    const bounds = tilemapCellBounds(tilemap, offsetX, offsetY, index)
    const left = Math.max(bounds.x, selectionLeft)
    const top = Math.max(bounds.y, selectionTop)
    const right = Math.min(bounds.x + bounds.width, selectionRight)
    const bottom = Math.min(bounds.y + bounds.height, selectionBottom)
    let touched = !selection.mask && right > left && bottom > top
    for (let y = top; !touched && y < bottom; y += 1) for (let x = left; x < right; x += 1) {
      if (!selectionContains(selection, x, y)) continue
      touched = true
      break
    }
    if (touched) selectedCells.push(index)
  }
  if (selectedCells.length === 0) return null

  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  for (const index of selectedCells) {
    const bounds = tilemapCellBounds(tilemap, offsetX, offsetY, index)
    left = Math.min(left, Math.max(bounds.x, clipLeft))
    top = Math.min(top, Math.max(bounds.y, clipTop))
    right = Math.max(right, Math.min(bounds.x + bounds.width, clipRight))
    bottom = Math.max(bottom, Math.min(bounds.y + bounds.height, clipBottom))
  }
  const width = right - left
  const height = bottom - top
  if (width <= 0 || height <= 0) return null
  const mask = new Uint8Array(width * height)
  let selectedPixels = 0
  for (const index of selectedCells) {
    const bounds = tilemapCellBounds(tilemap, offsetX, offsetY, index)
    const fromX = Math.max(bounds.x, left)
    const fromY = Math.max(bounds.y, top)
    const toX = Math.min(bounds.x + bounds.width, right)
    const toY = Math.min(bounds.y + bounds.height, bottom)
    for (let y = fromY; y < toY; y += 1) {
      const start = (y - top) * width + fromX - left
      mask.fill(1, start, start + toX - fromX)
      selectedPixels += toX - fromX
    }
  }
  return selectedPixels === width * height ? { x: left, y: top, width, height } : { x: left, y: top, width, height, mask }
}

export const tilemapCellLineIndices = (
  tilemap: TilemapCelData,
  fromIndex: number,
  toIndex: number,
  repeatMode: TileRepeatMode = 'off'
): number[] => {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= tilemap.cells.length || toIndex >= tilemap.cells.length) return []
  let x = fromIndex % tilemap.columns
  let y = Math.floor(fromIndex / tilemap.columns)
  let targetX = toIndex % tilemap.columns
  let targetY = Math.floor(toIndex / tilemap.columns)
  if (tileRepeatIncludesX(repeatMode) && Math.abs(targetX - x) > tilemap.columns / 2) targetX += targetX > x ? -tilemap.columns : tilemap.columns
  if (tileRepeatIncludesY(repeatMode) && Math.abs(targetY - y) > tilemap.rows / 2) targetY += targetY > y ? -tilemap.rows : tilemap.rows
  const deltaX = Math.abs(targetX - x)
  const deltaY = Math.abs(targetY - y)
  const stepX = x < targetX ? 1 : -1
  const stepY = y < targetY ? 1 : -1
  let error = deltaX - deltaY
  const indices: number[] = []
  while (true) {
    const column = tileRepeatIncludesX(repeatMode) ? positiveModulo(x, tilemap.columns) : x
    const row = tileRepeatIncludesY(repeatMode) ? positiveModulo(y, tilemap.rows) : y
    if (column >= 0 && row >= 0 && column < tilemap.columns && row < tilemap.rows) {
      const index = row * tilemap.columns + column
      if (indices.at(-1) !== index) indices.push(index)
    }
    if (x === targetX && y === targetY) break
    const doubled = error * 2
    if (doubled > -deltaY) { error -= deltaY; x += stepX }
    if (doubled < deltaX) { error += deltaX; y += stepY }
  }
  return indices
}

export const beginTilemapEdit = (layerId: string, frameId: string): TilemapEdit => ({
  layerId,
  frameId,
  before: new Map(),
  after: new Map(),
  dirtyRect: null
})

export const recordTilemapCell = (
  tilemap: TilemapCelData,
  edit: TilemapEdit,
  index: number,
  next: TilemapCell | null,
  offsetX: number,
  offsetY: number
): boolean => {
  if (index < 0 || index >= tilemap.cells.length) return false
  const current = tilemap.cells[index]
  if (tilemapCellsEqual(current, next)) return false
  if (!edit.before.has(index)) edit.before.set(index, cloneTilemapCell(current))
  tilemap.cells[index] = cloneTilemapCell(next)
  if (tilemapCellsEqual(edit.before.get(index) ?? null, next)) {
    edit.before.delete(index)
    edit.after.delete(index)
  } else edit.after.set(index, cloneTilemapCell(next))
  const bounds = tilemapCellBounds(tilemap, offsetX, offsetY, index)
  if (!edit.dirtyRect) edit.dirtyRect = bounds
  else {
    const left = Math.min(edit.dirtyRect.x, bounds.x)
    const top = Math.min(edit.dirtyRect.y, bounds.y)
    const right = Math.max(edit.dirtyRect.x + edit.dirtyRect.width, bounds.x + bounds.width)
    const bottom = Math.max(edit.dirtyRect.y + edit.dirtyRect.height, bounds.y + bounds.height)
    edit.dirtyRect = { x: left, y: top, width: right - left, height: bottom - top }
  }
  return true
}

export const applyTilemapEdit = (tilemap: TilemapCelData, edit: TilemapEdit, side: 'before' | 'after'): number[] => {
  const values = edit[side]
  const changed: number[] = []
  for (const [index, cell] of values) {
    tilemap.cells[index] = cloneTilemapCell(cell)
    changed.push(index)
  }
  return changed
}

export const tilemapEditBytes = (edit: TilemapEdit): number => (edit.before.size + edit.after.size) * 96

export const tilemapTilesetEditHasChanges = (edit: TilemapTilesetEdit): boolean =>
  edit.tilemapEdit.before.size > 0 || !tilesetsEqual(edit.beforeTileset, edit.afterTileset)

export const tilemapTilesetEditBytes = (edit: TilemapTilesetEdit): number =>
  tilemapEditBytes(edit.tilemapEdit)
  + edit.beforeTileset.pixels.byteLength
  + edit.afterTileset.pixels.byteLength
  + (edit.beforeTileset.tileIds.length + edit.afterTileset.tileIds.length) * 32
  + (tilesetTileSlots(edit.beforeTileset).length + tilesetTileSlots(edit.afterTileset).length) * 8
