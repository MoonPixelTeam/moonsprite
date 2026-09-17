import type { AnimationCel, AnimationCelSurface } from '@shared/types-animation'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionMask } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { TilemapCelData, TilemapCell, Tileset } from '@shared/types-tiles'
import { ensureAnimationDocument, refreshActiveAnimationFrame, resolveAnimationCel } from './animation'
import { getLayerStorageOrigin, markRasterStorageContentChanged, markRasterSurfaceContentChanged, paletteColorIdForCanvas, readLayerColorAt } from './document-model'
import { revertPixelEdit, type PixelEdit } from './history'
import { appendTilesetTileInPlace, applyTilemapEdit, beginTilemapEdit, cloneTilemapCell, cloneTileset, findTilesetTileByPixels, readTilesetTilePixels, recordTilemapCell, renderTilemapCellIntoSurface, replaceTilesetContents, tilemapCellIndexAtPoint, tilemapCellIndexesForSelection, tilemapSourcePointForCell, tilesetHasOnlyTransparentTile, writeTilesetTilePixels, type TilemapDrawingMode, type TilemapEdit, type TilemapSelectionMoveSource, type TilemapTilesetEdit } from './tilemap'

export interface TilemapCelTarget {
  layer: RasterLayer
  cel: AnimationCel
  source: AnimationCel
  tilemap: TilemapCelData
  surface: AnimationCelSurface
  tilesets: ReadonlyMap<string, Tileset>
}

export interface TilesetTileReference {
  celId: string
  index: number
  cell: TilemapCell
}

export interface TilemapLayerTileset {
  layer: RasterLayer
  tileset: Tileset
}

export const ensureTilemapTilesetOwnership = (document: SpriteDocument): void => {
  // Ownership repair is metadata-only; reading a sparse animation timeline
  // must not materialize every layer×frame cel. Mutation boundaries ensure a
  // complete timeline before invoking tilemap commands that need it.
  const timeline = document.animation
  if (!timeline) return
  const tilesets = document.tilesets ?? []
  const tilesetsById = new Map(tilesets.map((tileset) => [tileset.id, tileset]))
  const claimed = new Set<string>()
  const explicitIds = new Set(document.layers.flatMap((layer) => layer.kind === 'tilemap' && layer.tilemapTilesetId ? [layer.tilemapTilesetId] : []))
  for (const layer of document.layers) {
    if (layer.kind !== 'tilemap') continue
    let tileset = layer.tilemapTilesetId ? tilesetsById.get(layer.tilemapTilesetId) : undefined
    if (!tileset) {
      const referencedIds = timeline.cels
        .filter((cel) => cel.layerId === layer.id && cel.tilemap)
        .flatMap((cel) => cel.tilemap!.cells.flatMap((cell) => cell ? [cell.tilesetId] : []))
      tileset = referencedIds.map((id) => tilesetsById.get(id)).find((candidate): candidate is Tileset => Boolean(candidate && !claimed.has(candidate.id)))
      if (!tileset) {
        const tilemap = timeline.cels.find((cel) => cel.layerId === layer.id && cel.tilemap)?.tilemap
        tileset = tilemap
          ? tilesets.find((candidate) => !claimed.has(candidate.id) && !explicitIds.has(candidate.id) && candidate.tileWidth === tilemap.tileWidth && candidate.tileHeight === tilemap.tileHeight)
          : undefined
      }
      if (tileset) layer.tilemapTilesetId = tileset.id
    }
    if (!tileset) continue
    if (!explicitIds.has(tileset.id)) claimed.add(tileset.id)
  }
  const ownersByTileset = new Map<string, RasterLayer[]>()
  for (const layer of document.layers) {
    if (layer.kind !== 'tilemap' || !layer.tilemapTilesetId) continue
    const owners = ownersByTileset.get(layer.tilemapTilesetId) ?? []
    owners.push(layer)
    ownersByTileset.set(layer.tilemapTilesetId, owners)
  }
  for (const [tilesetId, owners] of ownersByTileset) {
    if (owners.length !== 1) continue
    const tileset = tilesetsById.get(tilesetId)
    if (tileset) tileset.name = owners[0].name
  }
}

export const tilemapLayerTilesets = (
  document: SpriteDocument,
  tileWidth?: number,
  tileHeight?: number
): TilemapLayerTileset[] => {
  ensureTilemapTilesetOwnership(document)
  const tilesetsById = new Map((document.tilesets ?? []).map((tileset) => [tileset.id, tileset]))
  const seen = new Set<string>()
  return document.layers.flatMap((layer) => {
    if (layer.kind !== 'tilemap' || !layer.tilemapTilesetId || seen.has(layer.tilemapTilesetId)) return []
    const tileset = tilesetsById.get(layer.tilemapTilesetId)
    if (!tileset || (tileWidth !== undefined && tileset.tileWidth !== tileWidth) || (tileHeight !== undefined && tileset.tileHeight !== tileHeight)) return []
    seen.add(tileset.id)
    return [{ layer, tileset }]
  })
}

export const tilemapCelTargetAt = (document: SpriteDocument, layerId: string, frameId: string): TilemapCelTarget | null => {
  const layer = document.layers.find((candidate) => candidate.id === layerId && candidate.kind === 'tilemap')
  if (!layer) return null
  const timeline = ensureAnimationDocument(document)
  const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
  const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
  if (!cel || !source?.tilemap || !source.surface) return null
  const tilemap = source.tilemap
  const surface = source.surface
  if (surface.width !== tilemap.columns * tilemap.tileWidth || surface.height !== tilemap.rows * tilemap.tileHeight) return null
  return {
    layer,
    cel,
    source,
    tilemap,
    surface,
    tilesets: new Map((document.tilesets ?? []).map((tileset) => [tileset.id, tileset]))
  }
}

export const activeTilemapCelTarget = (document: SpriteDocument): TilemapCelTarget | null => {
  const timeline = ensureAnimationDocument(document)
  return tilemapCelTargetAt(document, document.activeLayerId, timeline.activeFrameId)
}

export const rerenderTilemapCells = (document: SpriteDocument, target: TilemapCelTarget, indexes: readonly number[]): void => {
  for (const index of indexes) {
    renderTilemapCellIntoSurface(
      target.surface,
      target.tilemap,
      target.tilesets,
      index,
      document.colorMode,
      document.colorMode === 'indexed' ? (color) => paletteColorIdForCanvas(document, color) : undefined
    )
  }
  if (indexes.length > 0) markRasterSurfaceContentChanged(target.surface)
}

const directTilemapTargetForCel = (document: SpriteDocument, cel: AnimationCel): Omit<TilemapCelTarget, 'cel' | 'source'> | null => {
  const layer = document.layers.find((candidate) => candidate.id === cel.layerId && candidate.kind === 'tilemap')
  if (!layer || !cel.tilemap || !cel.surface) return null
  if (cel.surface.width !== cel.tilemap.columns * cel.tilemap.tileWidth || cel.surface.height !== cel.tilemap.rows * cel.tilemap.tileHeight) return null
  return {
    layer,
    tilemap: cel.tilemap,
    surface: cel.surface,
    tilesets: new Map((document.tilesets ?? []).map((tileset) => [tileset.id, tileset]))
  }
}

const renderDirectCelIndexes = (document: SpriteDocument, cel: AnimationCel, indexes: readonly number[]): boolean => {
  const direct = directTilemapTargetForCel(document, cel)
  if (!direct || indexes.length === 0) return false
  rerenderTilemapCells(document, { ...direct, cel, source: cel }, indexes)
  return true
}

export const rerenderTilesetReferences = (document: SpriteDocument, tilesetId: string): number => {
  const timeline = ensureAnimationDocument(document)
  let changed = 0
  for (const cel of timeline.cels) {
    if (!cel.tilemap) continue
    const indexes = cel.tilemap.cells.flatMap((cell, index) => cell?.tilesetId === tilesetId ? [index] : [])
    if (!renderDirectCelIndexes(document, cel, indexes)) continue
    changed += indexes.length
  }
  if (changed > 0) refreshActiveAnimationFrame(document)
  return changed
}

export const rerenderTilesetTileReferences = (document: SpriteDocument, tilesetId: string, tileId: string): number => {
  const timeline = ensureAnimationDocument(document)
  let changed = 0
  for (const cel of timeline.cels) {
    if (!cel.tilemap) continue
    const indexes = cel.tilemap.cells.flatMap((cell, index) => cell?.tilesetId === tilesetId && cell.tileId === tileId ? [index] : [])
    if (!renderDirectCelIndexes(document, cel, indexes)) continue
    changed += indexes.length
  }
  if (changed > 0) refreshActiveAnimationFrame(document)
  return changed
}

export const captureTilesetTileReferences = (document: SpriteDocument, tilesetId: string, tileId: string): TilesetTileReference[] => {
  const references: TilesetTileReference[] = []
  for (const cel of ensureAnimationDocument(document).cels) {
    if (!cel.tilemap) continue
    for (let index = 0; index < cel.tilemap.cells.length; index += 1) {
      const cell = cel.tilemap.cells[index]
      if (cell?.tilesetId === tilesetId && cell.tileId === tileId) references.push({ celId: cel.id, index, cell: cloneTilemapCell(cell)! })
    }
  }
  return references
}

export const applyTilesetTileReferences = (
  document: SpriteDocument,
  references: readonly TilesetTileReference[],
  side: 'clear' | 'restore'
): number => {
  const timeline = ensureAnimationDocument(document)
  const byCel = new Map<string, TilesetTileReference[]>()
  for (const reference of references) {
    const entries = byCel.get(reference.celId) ?? []
    entries.push(reference)
    byCel.set(reference.celId, entries)
  }
  let changed = 0
  for (const [celId, entries] of byCel) {
    const cel = timeline.cels.find((candidate) => candidate.id === celId)
    if (!cel?.tilemap) continue
    const indexes: number[] = []
    for (const reference of entries) {
      if (reference.index < 0 || reference.index >= cel.tilemap.cells.length) continue
      cel.tilemap.cells[reference.index] = side === 'restore' ? cloneTilemapCell(reference.cell) : null
      indexes.push(reference.index)
    }
    if (!renderDirectCelIndexes(document, cel, indexes)) continue
    changed += indexes.length
  }
  if (changed > 0) refreshActiveAnimationFrame(document)
  return changed
}

export const writeTilemapCell = (
  document: SpriteDocument,
  target: TilemapCelTarget,
  edit: TilemapEdit,
  index: number,
  cell: TilemapCell | null
): boolean => {
  if (!recordTilemapCell(target.tilemap, edit, index, cell, target.surface.offsetX, target.surface.offsetY)) return false
  rerenderTilemapCells(document, target, [index])
  return true
}

export const captureTilemapSelectionMove = (
  target: TilemapCelTarget,
  selection: SelectionMask
): TilemapSelectionMoveSource | null => {
  const indexes = tilemapCellIndexesForSelection(selection, target.tilemap, target.surface.offsetX, target.surface.offsetY)
  if (indexes.length === 0) return null
  return {
    layerId: target.layer.id,
    frameId: target.cel.frameId,
    tileWidth: target.tilemap.tileWidth,
    tileHeight: target.tilemap.tileHeight,
    columns: target.tilemap.columns,
    rows: target.tilemap.rows,
    cells: indexes.map((index) => ({ index, cell: cloneTilemapCell(target.tilemap.cells[index]) }))
  }
}

export const previewTilemapSelectionMove = (
  document: SpriteDocument,
  source: TilemapSelectionMoveSource,
  deltaColumns: number,
  deltaRows: number,
  copy: boolean
): TilemapEdit | null => {
  const target = tilemapCelTargetAt(document, source.layerId, source.frameId)
  if (!target
    || target.tilemap.tileWidth !== source.tileWidth
    || target.tilemap.tileHeight !== source.tileHeight
    || target.tilemap.columns !== source.columns
    || target.tilemap.rows !== source.rows) return null
  const updates = new Map<number, TilemapCell | null>()
  if (!copy) for (const entry of source.cells) updates.set(entry.index, null)
  for (const entry of source.cells) {
    const sourceColumn = entry.index % source.columns
    const sourceRow = Math.floor(entry.index / source.columns)
    const column = sourceColumn + deltaColumns
    const row = sourceRow + deltaRows
    if (column < 0 || row < 0 || column >= source.columns || row >= source.rows) continue
    updates.set(row * source.columns + column, cloneTilemapCell(entry.cell))
  }
  const edit = beginTilemapEdit(source.layerId, source.frameId)
  for (const [index, cell] of [...updates].sort(([left], [right]) => left - right)) {
    recordTilemapCell(target.tilemap, edit, index, cell, target.surface.offsetX, target.surface.offsetY)
  }
  if (edit.after.size === 0) return null
  rerenderTilemapCells(document, target, [...edit.after.keys()])
  refreshActiveAnimationFrame(document)
  return edit
}

const mirroredTilemapCell = (cell: TilemapCell | null, axis: 'horizontal' | 'vertical', width: number, height: number): TilemapCell | null => {
  if (!cell) return null
  const candidates: Array<{ flipHorizontal?: boolean; flipVertical?: boolean; rotation?: 0 | 1 | 2 | 3 }> = []
  for (const flipHorizontal of [false, true]) for (const flipVertical of [false, true]) {
    const rotations: Array<0 | 1 | 2 | 3> = width === height ? [0, 1, 2, 3] : [0]
    for (const rotation of rotations) candidates.push({
      ...(flipHorizontal ? { flipHorizontal: true } : {}),
      ...(flipVertical ? { flipVertical: true } : {}),
      ...(rotation !== 0 ? { rotation } : {})
    })
  }
  const sourcePoint = (x: number, y: number): { x: number; y: number } => tilemapSourcePointForCell(
    axis === 'horizontal' ? width - 1 - x : x,
    axis === 'vertical' ? height - 1 - y : y,
    width,
    height,
    cell
  )
  const sameMapping = (candidate: TilemapCell): boolean => {
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const expected = sourcePoint(x, y)
      const actual = tilemapSourcePointForCell(x, y, width, height, candidate)
      if (expected.x !== actual.x || expected.y !== actual.y) return false
    }
    return true
  }
  const transform = candidates.find((candidate) => sameMapping({ ...cell, ...candidate }))
  return transform ? { ...cell, ...transform } : { ...cell }
}

export const flipTilemapSelection = (
  document: SpriteDocument,
  layerId: string,
  frameId: string,
  selection: SelectionMask,
  axis: 'horizontal' | 'vertical'
): TilemapEdit | null => {
  const target = tilemapCelTargetAt(document, layerId, frameId)
  if (!target) return null
  const indexes = tilemapCellIndexesForSelection(selection, target.tilemap, target.surface.offsetX, target.surface.offsetY)
  if (indexes.length === 0) return null
  const selected = new Set(indexes)
  const columns = indexes.map((index) => index % target.tilemap.columns)
  const rows = indexes.map((index) => Math.floor(index / target.tilemap.columns))
  const left = Math.min(...columns)
  const right = Math.max(...columns)
  const top = Math.min(...rows)
  const bottom = Math.max(...rows)
  const before = new Map(indexes.map((index) => [index, cloneTilemapCell(target.tilemap.cells[index])]))
  const edit = beginTilemapEdit(layerId, frameId)
  for (const index of indexes) {
    const column = index % target.tilemap.columns
    const row = Math.floor(index / target.tilemap.columns)
    const mirroredColumn = axis === 'horizontal' ? left + right - column : column
    const mirroredRow = axis === 'vertical' ? top + bottom - row : row
    const mirroredIndex = mirroredRow * target.tilemap.columns + mirroredColumn
    if (!selected.has(mirroredIndex)) continue
    recordTilemapCell(
      target.tilemap,
      edit,
      mirroredIndex,
      mirroredTilemapCell(before.get(index) ?? null, axis, target.tilemap.tileWidth, target.tilemap.tileHeight),
      target.surface.offsetX,
      target.surface.offsetY
    )
  }
  if (edit.after.size === 0) return null
  rerenderTilemapCells(document, target, [...edit.after.keys()])
  refreshActiveAnimationFrame(document)
  return edit
}

export const applyTilemapSelectionCellMove = (
  document: SpriteDocument,
  layerId: string,
  frameId: string,
  selection: SelectionMask,
  deltaColumns: number,
  deltaRows: number,
  copy: boolean
): TilemapTilesetEdit | null => {
  const target = tilemapCelTargetAt(document, layerId, frameId)
  const tilesetId = target?.layer.tilemapTilesetId
  const tileset = tilesetId ? document.tilesets?.find((candidate) => candidate.id === tilesetId) : null
  if (!target || !tileset) return null
  const source = captureTilemapSelectionMove(target, selection)
  if (!source) return null
  const tilemapEdit = previewTilemapSelectionMove(document, source, deltaColumns, deltaRows, copy)
  if (!tilemapEdit) return null
  const tilesetSnapshot = cloneTileset(tileset)
  return {
    tilemapEdit,
    tilesetId: tileset.id,
    beforeTileset: tilesetSnapshot,
    afterTileset: cloneTileset(tilesetSnapshot),
    changedTileIds: []
  }
}

const rgbaCellPixelsFromSurface = (
  document: SpriteDocument,
  surface: AnimationCelSurface,
  tilemap: TilemapCelData,
  cellIndex: number
): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(tilemap.tileWidth * tilemap.tileHeight * 4)
  const column = cellIndex % tilemap.columns
  const row = Math.floor(cellIndex / tilemap.columns)
  const startX = column * tilemap.tileWidth
  const startY = row * tilemap.tileHeight
  const palette = surface.format === 'indexed' ? new Map(document.palette.map((entry) => [entry.id, entry.color])) : null
  for (let y = 0; y < tilemap.tileHeight; y += 1) for (let x = 0; x < tilemap.tileWidth; x += 1) {
    const sourceIndex = (startY + y) * surface.width + startX + x
    const targetOffset = (y * tilemap.tileWidth + x) * 4
    if (surface.format === 'rgba') {
      const sourceOffset = sourceIndex * 4
      pixels[targetOffset] = surface.pixels[sourceOffset]
      pixels[targetOffset + 1] = surface.pixels[sourceOffset + 1]
      pixels[targetOffset + 2] = surface.pixels[sourceOffset + 2]
      pixels[targetOffset + 3] = surface.pixels[sourceOffset + 3]
    } else {
      const color = palette?.get(surface.pixels[sourceIndex]) ?? { r: 0, g: 0, b: 0, a: 0 }
      pixels[targetOffset] = color.r
      pixels[targetOffset + 1] = color.g
      pixels[targetOffset + 2] = color.b
      pixels[targetOffset + 3] = color.a
    }
  }
  return pixels
}

const tilemapCellIndexesForEdit = (target: TilemapCelTarget, edit: PixelEdit): number[] => {
  const dirty = edit.dirtyRect
  if (!dirty || dirty.width <= 0 || dirty.height <= 0) return []
  const left = Math.max(0, Math.floor((dirty.x - target.surface.offsetX) / target.tilemap.tileWidth))
  const top = Math.max(0, Math.floor((dirty.y - target.surface.offsetY) / target.tilemap.tileHeight))
  const right = Math.min(target.tilemap.columns - 1, Math.floor((dirty.x + dirty.width - 1 - target.surface.offsetX) / target.tilemap.tileWidth))
  const bottom = Math.min(target.tilemap.rows - 1, Math.floor((dirty.y + dirty.height - 1 - target.surface.offsetY) / target.tilemap.tileHeight))
  if (right < left || bottom < top) return []
  const indexes: number[] = []
  for (let row = top; row <= bottom; row += 1) for (let column = left; column <= right; column += 1) indexes.push(row * target.tilemap.columns + column)
  return indexes
}

const rgbaPixelsEqual = (left: Uint8ClampedArray, right: Uint8ClampedArray): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const tilemapCellIndexesChangedByPixelEdit = (target: TilemapCelTarget, edit: PixelEdit): number[] => {
  const indexes = new Set<number>()
  const storageOrigin = getLayerStorageOrigin(target.layer)
  const addStoragePoint = (x: number, y: number): void => {
    const index = tilemapCellIndexAtPoint(target.tilemap, target.surface.offsetX, target.surface.offsetY, x, y)
    if (index !== null) indexes.add(index)
  }
  const addLayerIndex = (index: number): void => {
    addStoragePoint(index % target.layer.width + storageOrigin.x, Math.floor(index / target.layer.width) + storageOrigin.y)
  }

  for (const [index, before] of edit.before) if ((edit.after.get(index) ?? before) !== before) addLayerIndex(index)
  if (edit.points) for (let offset = 0; offset < edit.points.count; offset += 1) {
    if (edit.points.before[offset] !== edit.points.after[offset]) addLayerIndex(edit.points.indices[offset])
  }
  for (const run of edit.runs ?? []) {
    if (run.before === run.after) continue
    for (let offset = 0; offset < run.length; offset += 1) addLayerIndex(run.index + offset)
  }
  const dense = edit.denseRegion
  if (dense?.count) for (let offset = 0; offset < dense.changed.length; offset += 1) {
    if (dense.changed[offset] === 0 || dense.before[offset] === dense.after[offset]) continue
    addStoragePoint(dense.x + offset % dense.width, dense.y + Math.floor(offset / dense.width))
  }
  return [...indexes].sort((left, right) => left - right)
}

/** Builds the transient source tiles needed to preview an edit across every reference before commit. */
export const tilemapEditPreviewTilePixels = (document: SpriteDocument, edit: PixelEdit, editCellIndex?: number): Map<string, Uint8ClampedArray> => {
  const frameId = edit.frameId ?? ensureAnimationDocument(document).activeFrameId
  const target = tilemapCelTargetAt(document, edit.layerId, frameId)
  const tilesetId = target?.layer.tilemapTilesetId
  const tileset = tilesetId ? document.tilesets?.find((candidate) => candidate.id === tilesetId) : null
  if (!target || !tileset || tileset.tileWidth !== target.tilemap.tileWidth || tileset.tileHeight !== target.tilemap.tileHeight) return new Map()

  const originals = new Map<string, Uint8ClampedArray>()
  const modified = new Map<string, Uint8ClampedArray>()
  const cellIndexes = editCellIndex === undefined ? tilemapCellIndexesChangedByPixelEdit(target, edit) : [editCellIndex]
  for (const cellIndex of cellIndexes) {
    const cell = target.tilemap.cells[cellIndex]
    if (!cell || cell.tilesetId !== tileset.id) continue
    let original = originals.get(cell.tileId)
    if (!original) {
      original = readTilesetTilePixels(tileset, cell.tileId) ?? undefined
      if (!original) continue
      originals.set(cell.tileId, original)
    }
    let tilePixels = modified.get(cell.tileId)
    const column = cellIndex % target.tilemap.columns
    const row = Math.floor(cellIndex / target.tilemap.columns)
    const startX = target.surface.offsetX + column * target.tilemap.tileWidth
    const startY = target.surface.offsetY + row * target.tilemap.tileHeight
    for (let y = 0; y < target.tilemap.tileHeight; y += 1) for (let x = 0; x < target.tilemap.tileWidth; x += 1) {
      const source = tilemapSourcePointForCell(x, y, target.tilemap.tileWidth, target.tilemap.tileHeight, cell)
      const sourceOffset = (source.y * target.tilemap.tileWidth + source.x) * 4
      const color = readLayerColorAt(document, target.layer, startX + x, startY + y)
      if (original[sourceOffset] === color.r
        && original[sourceOffset + 1] === color.g
        && original[sourceOffset + 2] === color.b
        && original[sourceOffset + 3] === color.a) continue
      if (!tilePixels) {
        tilePixels = new Uint8ClampedArray(original)
        modified.set(cell.tileId, tilePixels)
      }
      tilePixels[sourceOffset] = color.r
      tilePixels[sourceOffset + 1] = color.g
      tilePixels[sourceOffset + 2] = color.b
      tilePixels[sourceOffset + 3] = color.a
    }
  }
  return modified
}

export const convertTilemapPixelEdit = (
  document: SpriteDocument,
  edit: PixelEdit,
  mode: Exclude<TilemapDrawingMode, 'paint'>,
  tilesetId: string,
  createTileId: () => string,
  editCellIndex?: number
): TilemapTilesetEdit | null => {
  const frameId = edit.frameId ?? ensureAnimationDocument(document).activeFrameId
  const target = tilemapCelTargetAt(document, edit.layerId, frameId)
  const tileset = document.tilesets?.find((candidate) => candidate.id === tilesetId)
  if (!target || !tileset || tileset.tileWidth !== target.tilemap.tileWidth || tileset.tileHeight !== target.tilemap.tileHeight) {
    revertPixelEdit(document, edit)
    return null
  }
  const effectiveMode = mode === 'edit' && tilesetHasOnlyTransparentTile(tileset) ? 'create' : mode
  const indexes = effectiveMode === 'edit' && editCellIndex !== undefined
    ? (editCellIndex >= 0 && editCellIndex < target.tilemap.cells.length ? [editCellIndex] : [])
    : tilemapCellIndexesForEdit(target, edit)
  const afterByCell = new Map(indexes.map((index) => [index, rgbaCellPixelsFromSurface(document, target.layer, target.tilemap, index)]))
  revertPixelEdit(document, edit)
  const beforeByCell = new Map(indexes.map((index) => [index, rgbaCellPixelsFromSurface(document, target.layer, target.tilemap, index)]))
  const beforeTileset = cloneTileset(tileset)
  const afterTileset = cloneTileset(tileset)
  const tilemapEdit = beginTilemapEdit(target.layer.id, frameId)
  const changedTileIds = new Set<string>()

  if (effectiveMode === 'create') {
    for (const index of indexes) {
      const beforePixels = beforeByCell.get(index)
      const afterPixels = afterByCell.get(index)
      if (!beforePixels || !afterPixels || rgbaPixelsEqual(beforePixels, afterPixels)) continue
      let tileId = findTilesetTileByPixels(afterTileset, afterPixels)
      if (!tileId) {
        tileId = createTileId()
        appendTilesetTileInPlace(afterTileset, tileId, afterPixels)
        changedTileIds.add(tileId)
      }
      recordTilemapCell(target.tilemap, tilemapEdit, index, { tilesetId: afterTileset.id, tileId }, target.surface.offsetX, target.surface.offsetY)
    }
  } else if (effectiveMode === 'hybrid') {
    const editedTiles = new Map<string, Uint8ClampedArray>()
    for (const index of indexes) {
      const beforePixels = beforeByCell.get(index)
      const afterPixels = afterByCell.get(index)
      if (!beforePixels || !afterPixels || rgbaPixelsEqual(beforePixels, afterPixels)) continue
      const cell = target.tilemap.cells[index]
      if (cell?.tilesetId === afterTileset.id) {
        const tilePixels = editedTiles.get(cell.tileId) ?? readTilesetTilePixels(afterTileset, cell.tileId)
        if (tilePixels) {
          editedTiles.set(cell.tileId, tilePixels)
          for (let y = 0; y < target.tilemap.tileHeight; y += 1) for (let x = 0; x < target.tilemap.tileWidth; x += 1) {
            const offset = (y * target.tilemap.tileWidth + x) * 4
            if (beforePixels[offset] === afterPixels[offset]
              && beforePixels[offset + 1] === afterPixels[offset + 1]
              && beforePixels[offset + 2] === afterPixels[offset + 2]
              && beforePixels[offset + 3] === afterPixels[offset + 3]) continue
            const source = tilemapSourcePointForCell(x, y, target.tilemap.tileWidth, target.tilemap.tileHeight, cell)
            const sourceOffset = (source.y * target.tilemap.tileWidth + source.x) * 4
            tilePixels[sourceOffset] = afterPixels[offset]
            tilePixels[sourceOffset + 1] = afterPixels[offset + 1]
            tilePixels[sourceOffset + 2] = afterPixels[offset + 2]
            tilePixels[sourceOffset + 3] = afterPixels[offset + 3]
            changedTileIds.add(cell.tileId)
          }
          writeTilesetTilePixels(afterTileset, cell.tileId, tilePixels)
          continue
        }
      }
      let tileId = findTilesetTileByPixels(afterTileset, afterPixels)
      if (!tileId) {
        tileId = createTileId()
        appendTilesetTileInPlace(afterTileset, tileId, afterPixels)
        changedTileIds.add(tileId)
      }
      recordTilemapCell(target.tilemap, tilemapEdit, index, { tilesetId: afterTileset.id, tileId }, target.surface.offsetX, target.surface.offsetY)
    }
    for (const [tileId, pixels] of editedTiles) writeTilesetTilePixels(afterTileset, tileId, pixels)
  } else {
    const editedTiles = new Map<string, Uint8ClampedArray>()
    for (const index of indexes) {
      const cell = target.tilemap.cells[index]
      const beforePixels = beforeByCell.get(index)
      const afterPixels = afterByCell.get(index)
      if (!cell || cell.tilesetId !== afterTileset.id || !beforePixels || !afterPixels || rgbaPixelsEqual(beforePixels, afterPixels)) continue
      const tilePixels = editedTiles.get(cell.tileId) ?? readTilesetTilePixels(afterTileset, cell.tileId)
      if (!tilePixels) continue
      editedTiles.set(cell.tileId, tilePixels)
      for (let y = 0; y < target.tilemap.tileHeight; y += 1) for (let x = 0; x < target.tilemap.tileWidth; x += 1) {
        const offset = (y * target.tilemap.tileWidth + x) * 4
        if (beforePixels[offset] === afterPixels[offset]
          && beforePixels[offset + 1] === afterPixels[offset + 1]
          && beforePixels[offset + 2] === afterPixels[offset + 2]
          && beforePixels[offset + 3] === afterPixels[offset + 3]) continue
        const source = tilemapSourcePointForCell(x, y, target.tilemap.tileWidth, target.tilemap.tileHeight, cell)
        const sourceOffset = (source.y * target.tilemap.tileWidth + source.x) * 4
        tilePixels[sourceOffset] = afterPixels[offset]
        tilePixels[sourceOffset + 1] = afterPixels[offset + 1]
        tilePixels[sourceOffset + 2] = afterPixels[offset + 2]
        tilePixels[sourceOffset + 3] = afterPixels[offset + 3]
        changedTileIds.add(cell.tileId)
      }
    }
    for (const [tileId, pixels] of editedTiles) writeTilesetTilePixels(afterTileset, tileId, pixels)
  }

  if (tilemapEdit.before.size === 0 && changedTileIds.size === 0) return null
  replaceTilesetContents(tileset, afterTileset)
  markRasterStorageContentChanged(tileset.pixels)
  if (tilemapEdit.after.size > 0) rerenderTilemapCells(document, target, [...tilemapEdit.after.keys()])
  for (const tileId of changedTileIds) rerenderTilesetTileReferences(document, tileset.id, tileId)
  refreshActiveAnimationFrame(document)
  return {
    tilemapEdit,
    tilesetId: tileset.id,
    beforeTileset,
    afterTileset: cloneTileset(afterTileset),
    changedTileIds: [...changedTileIds]
  }
}

export const applyTilemapDocumentEdit = (document: SpriteDocument, edit: TilemapEdit, side: 'before' | 'after'): boolean => {
  const target = tilemapCelTargetAt(document, edit.layerId, edit.frameId)
  if (!target) return false
  const indexes = applyTilemapEdit(target.tilemap, edit, side)
  rerenderTilemapCells(document, target, indexes)
  refreshActiveAnimationFrame(document)
  return indexes.length > 0
}

export const applyTilemapTilesetDocumentEdit = (
  document: SpriteDocument,
  edit: TilemapTilesetEdit,
  side: 'before' | 'after'
): boolean => {
  const snapshot = cloneTileset(side === 'before' ? edit.beforeTileset : edit.afterTileset)
  const tilesetIndex = (document.tilesets ?? []).findIndex((tileset) => tileset.id === edit.tilesetId)
  if (tilesetIndex < 0) return false
  document.tilesets![tilesetIndex] = snapshot
  markRasterStorageContentChanged(snapshot.pixels)
  const target = tilemapCelTargetAt(document, edit.tilemapEdit.layerId, edit.tilemapEdit.frameId)
  const indexes = target ? applyTilemapEdit(target.tilemap, edit.tilemapEdit, side) : []
  if (target && indexes.length > 0) rerenderTilemapCells(document, target, indexes)
  const references = rerenderTilesetReferences(document, edit.tilesetId)
  refreshActiveAnimationFrame(document)
  return indexes.length > 0 || references > 0
}
