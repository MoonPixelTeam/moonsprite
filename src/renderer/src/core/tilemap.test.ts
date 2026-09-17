import { describe, expect, it } from 'vitest'
import type { TilemapCell } from '@shared/types-tiles'
import {
  applyTilemapEdit,
  appendBlankTilesetTile,
  beginTilemapEdit,
  createBlankTileset,
  createSolidTileset,
  createTilemapCelData,
  createTilesetFromRgba,
  deleteTilesetTile,
  deleteTilesetTiles,
  documentPointForTileRepeatCopies,
  expandSelectionToTilemapCells,
  normalizeSelectionForTileRepeatPreview,
  normalizeTilemapCelData,
  readTilesetTilePixels,
  recordTilemapCell,
  reorderTilesetTiles,
  repositionTilesetTileSlots,
  renderTilemapSurface,
  resizeTilemapCelDataToCanvas,
  setTilesetTileSlots,
  sliceRasterSurfaceToTilemap,
  tileRepeatDocumentOffsets,
  tileRepeatContinuousPreviewPlacements,
  tileRepeatFitZoom,
  tileRepeatLineSegments,
  tileRepeatMappedPointForCopies,
  tileRepeatOffsetsForViewport,
  tileRepeatPreviewPlacements,
  tilemapCellLineIndices,
  tilemapCellIndexAtPoint,
  tilemapCellTranslationForSelection,
  tilemapEditableSelectionAtPoint,
  tilesetHasOnlyTransparentTile,
  wrapDocumentPointForTileRepeat,
  wrapSelectionMaskForTileRepeat
} from './tilemap'
import { selectionContains } from './selection'

describe('tile repeat geometry', () => {
  it('wraps only enabled axes, including negative points', () => {
    expect(wrapDocumentPointForTileRepeat({ x: -1, y: 17 }, 16, 12, 'x')).toEqual({ x: 15, y: 17 })
    expect(wrapDocumentPointForTileRepeat({ x: 33.5, y: -0.5 }, 16, 12, 'both')).toEqual({ x: 1.5, y: 11.5 })
  })

  it('keeps an active repeated drag mapped after it passes the outer preview copy', () => {
    expect(tileRepeatMappedPointForCopies({ x: -33, y: 3 }, 16, 12, 'x', true)).toEqual({
      local: { x: 15, y: 3 },
      offset: { x: -3, y: 0 }
    })
    expect(tileRepeatMappedPointForCopies({ x: -33, y: 12 }, 16, 12, 'x', true)).toBeNull()
  })

  it('keeps an overflowing brush preview continuous across repeated copies', () => {
    const copies = tileRepeatOffsetsForViewport({ left: -4, top: 0, right: 8, bottom: 4 }, 0, 0, 4, 4, 'x')
    const placements = tileRepeatContinuousPreviewPlacements({ x: -1, y: 2 }, 4, 4, 'x', copies)

    expect(placements.map(({ point }) => point)).toEqual([{ x: -1, y: 2 }, { x: 3, y: 2 }])
    expect(placements.every(({ samplePoint }) => samplePoint.x === 3 && samplePoint.y === 2)).toBe(true)
  })

  it('splits repeated raster lines at seams instead of connecting opposite edges', () => {
    expect(tileRepeatLineSegments({ x: 14, y: 2 }, { x: 17, y: 2 }, 16, 8, 'x')).toEqual([
      { from: { x: 14, y: 2 }, to: { x: 15, y: 2 }, fromProgress: 0, toProgress: 1 / 3 },
      { from: { x: 0, y: 2 }, to: { x: 1, y: 2 }, fromProgress: 2 / 3, toProgress: 1 }
    ])
  })

  it('folds repeated marquee selections back into the original canvas', () => {
    expect(wrapSelectionMaskForTileRepeat({ x: 18, y: 2, width: 3, height: 2 }, 16, 8, 'x')).toEqual({
      x: 2, y: 2, width: 3, height: 2, mask: undefined
    })

    const wrapped = wrapSelectionMaskForTileRepeat({ x: 14, y: 2, width: 4, height: 1 }, 16, 8, 'x')
    expect(wrapped).toMatchObject({ x: 0, y: 2, width: 16, height: 1 })
    expect(selectionContains(wrapped, 0, 2)).toBe(true)
    expect(selectionContains(wrapped, 1, 2)).toBe(true)
    expect(selectionContains(wrapped, 2, 2)).toBe(false)
    expect(selectionContains(wrapped, 14, 2)).toBe(true)
    expect(selectionContains(wrapped, 15, 2)).toBe(true)
  })



describe('tilemap model', () => {
  it('arms original editing before the pointer enters an existing tile', () => {
    const tilemap = createTilemapCelData(4, 2, 2, 2)
    tilemap.cells[0] = { tilesetId: 'tileset-1', tileId: 'tile-1' }
    const bounds = { x: 0, y: 0, width: 4, height: 2 }

    expect(tilemapEditableSelectionAtPoint(tilemap, 0, 0, { x: 3, y: 0 }, bounds, null)).toBeNull()
    expect(tilemapEditableSelectionAtPoint(tilemap, 0, 0, { x: 3, y: 0 }, bounds, null, true)).toEqual({ x: 0, y: 0, width: 2, height: 2 })
    expect(tilemapEditableSelectionAtPoint(tilemap, 0, 0, { x: -1, y: 0 }, bounds, null, true)).toEqual({ x: 0, y: 0, width: 2, height: 2 })

    const emptyTilemap = createTilemapCelData(4, 2, 2, 2)
    expect(tilemapEditableSelectionAtPoint(emptyTilemap, 0, 0, { x: 3, y: 0 }, bounds, null, true, true)).toEqual({ x: 0, y: 0, width: 4, height: 2 })
  })

  it('recognizes only the single transparent placeholder tile', () => {
    const blank = createBlankTileset('tileset-1', 'Blank', 2, 2, 'tile-1')
    expect(tilesetHasOnlyTransparentTile(blank)).toBe(true)

    blank.pixels[3] = 255
    expect(tilesetHasOnlyTransparentTile(blank)).toBe(false)

    const multiple = appendBlankTilesetTile(createBlankTileset('tileset-2', 'Multiple', 2, 2, 'tile-1'), 'tile-2')
    expect(tilesetHasOnlyTransparentTile(multiple)).toBe(false)
  })

  it('recognizes only complete-cell selection translations', () => {
    const tilemap = createTilemapCelData(8, 4, 2, 2)
    expect(tilemapCellTranslationForSelection(tilemap, 0, 0, { x: 0, y: 0, width: 4, height: 2 }, { x: 2, y: 2, width: 4, height: 2 })).toEqual({ columns: 1, rows: 1 })
    expect(tilemapCellTranslationForSelection(tilemap, 0, 0, { x: 1, y: 0, width: 2, height: 2 }, { x: 3, y: 0, width: 2, height: 2 })).toBeNull()
    expect(tilemapCellTranslationForSelection(tilemap, 0, 0, { x: 0, y: 0, width: 2, height: 2 }, { x: 1, y: 0, width: 2, height: 2 })).toBeNull()
  })



  it('slices raster content into deduplicated tiles and pads partial edge cells', () => {
    const red = [220, 30, 40, 255]
    const blue = [20, 60, 220, 255]
    const yellow = [240, 200, 20, 255]
    const surface = {
      format: 'rgba' as const,
      width: 5,
      height: 2,
      offsetX: 0,
      offsetY: 0,
      pixels: new Uint8ClampedArray([
        ...red, ...blue, ...red, ...blue, ...yellow,
        ...blue, ...red, ...blue, ...red, 0, 0, 0, 0
      ])
    }
    let nextTile = 0
    const sliced = sliceRasterSurfaceToTilemap(
      surface,
      [],
      5,
      2,
      createBlankTileset('tileset-sliced', 'Sliced', 2, 2, 'tile-transparent'),
      () => `tile-${nextTile++}`
    )

    expect(sliced.tilemap).toMatchObject({ columns: 3, rows: 1 })
    expect(sliced.tileset.tileIds).toHaveLength(3)
    expect(sliced.tilemap.cells[0]?.tileId).toBe(sliced.tilemap.cells[1]?.tileId)
    expect(sliced.tilemap.cells[2]?.tileId).not.toBe(sliced.tilemap.cells[0]?.tileId)
    expect(Array.from(readTilesetTilePixels(sliced.tileset, sliced.tilemap.cells[2]!.tileId)!)).toEqual([
      ...yellow, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0
    ])
  })

  it('records one reversible edit per changed grid cell', () => {
    const tilemap = createTilemapCelData(8, 8, 4, 4)
    const edit = beginTilemapEdit('layer-1', 'frame-1')
    const cell: TilemapCell = { tilesetId: 'tileset-1', tileId: 'tile-1' }
    const index = tilemapCellIndexAtPoint(tilemap, 0, 0, 5, 1)
    expect(index).toBe(1)
    expect(recordTilemapCell(tilemap, edit, index!, cell, 0, 0)).toBe(true)
    expect(recordTilemapCell(tilemap, edit, index!, cell, 0, 0)).toBe(false)
    expect(edit.before.size).toBe(1)
    applyTilemapEdit(tilemap, edit, 'before')
    expect(tilemap.cells[1]).toBeNull()
    applyTilemapEdit(tilemap, edit, 'after')
    expect(tilemap.cells[1]).toEqual(cell)
  })

  it('extends complete grid cells across newly exposed canvas areas', () => {
    const tilemap = createTilemapCelData(4, 1, 2, 1)
    const first: TilemapCell = { tilesetId: 'tileset-1', tileId: 'tile-1' }
    const second: TilemapCell = { tilesetId: 'tileset-1', tileId: 'tile-2' }
    tilemap.cells[0] = first
    tilemap.cells[1] = second

    const resized = resizeTilemapCelDataToCanvas(tilemap, 2, 0, 8, 1)

    expect(resized).toMatchObject({ offsetX: 0, offsetY: 0 })
    expect(resized.tilemap).toMatchObject({ columns: 4, rows: 1 })
    expect(resized.tilemap.cells).toEqual([null, first, second, null])
    expect(tilemapCellIndexAtPoint(resized.tilemap, resized.offsetX, resized.offsetY, 0, 0)).toBe(0)
    expect(tilemapCellIndexAtPoint(resized.tilemap, resized.offsetX, resized.offsetY, 7, 0)).toBe(3)
  })



  it('fills every crossed grid cell during a fast diagonal drag', () => {
    const tilemap = createTilemapCelData(16, 12, 4, 4)
    expect(tilemapCellLineIndices(tilemap, 0, 11)).toEqual([0, 5, 6, 11])
  })







  it('rejects malformed non-empty cells during strict project decoding', () => {
    expect(normalizeTilemapCelData({
      tileWidth: 1,
      tileHeight: 1,
      columns: 2,
      rows: 1,
      cells: [null, { tilesetId: 'missing', tileId: 'missing' }]
    }, new Map(), true)).toBeNull()
  })







  it('repositions one or several tiles into occupied or empty layout slots', () => {
    const slots = ['tile-0', 'tile-1', null, null, null, null, null, null]

    expect(repositionTilesetTileSlots(slots, ['tile-0'], 5, 'tile-0', 4)).toEqual([
      null, 'tile-1', null, null, null, 'tile-0', null, null
    ])
    expect(repositionTilesetTileSlots(slots, ['tile-0', 'tile-1'], 6, 'tile-0', 4)).toEqual([
      null, null, null, null, null, null, 'tile-0', 'tile-1'
    ])
    expect(repositionTilesetTileSlots(['tile-0', 'tile-1', 'tile-2', null], ['tile-0'], 2, 'tile-0', 4)).toEqual([
      'tile-2', 'tile-1', 'tile-0', null
    ])
    expect(repositionTilesetTileSlots(slots, ['missing'], 5, 'missing', 4)).toEqual(slots)
  })

})
})
