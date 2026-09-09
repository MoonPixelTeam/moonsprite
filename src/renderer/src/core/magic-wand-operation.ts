import type { FreeTileInstance, SelectionMask, SelectionMode, SelectionRect, SpriteDocument, TilemapCelData } from '@shared/types'
import type { FreeTileSourceRef } from './free-tile'
import { createFreeTileSourceEditRaster, freeTileSelectionFromEditRaster } from './free-tile-edit'
import { combineSelection, magicWandSelection } from './selection'
import { hasSymmetry, symmetrySelection, type SymmetryAxes } from './symmetry'
import { expandSelectionToTilemapCells } from './tilemap'

/** Immutable inputs shared by all pointer samples in one gesture. Prepared once
 * in the worker; never transfer the document's/history's own pixel buffers. */
export interface MagicWandOperation {
  before?: SelectionMask | null
  mode?: SelectionMode
  axes?: SymmetryAxes
  center?: { x: number; y: number }
  previewColor?: string
  tilemap?: { grid: TilemapCelData; offsetX: number; offsetY: number }
  freeTile?: {
    source: FreeTileSourceRef
    bounds: SelectionRect
    instance: Pick<FreeTileInstance, 'rotation' | 'flipHorizontal' | 'flipVertical'>
    document: Pick<SpriteDocument, 'width' | 'height' | 'colorMode' | 'palette'>
  }
}

export const prepareMagicWandOperation = (options: MagicWandOperation) => {
  const free = options.freeTile
  const edit = free ? createFreeTileSourceEditRaster(free.document as SpriteDocument, free.source, free.bounds, undefined, free.instance) : null
  return (incoming: SelectionMask | null, width: number, height: number, x: number, y: number, tolerance: number, contiguous: boolean, gap: number): SelectionMask | null => {
    if (free) {
      const b = free.bounds
      incoming = edit && x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height
        ? freeTileSelectionFromEditRaster(edit, magicWandSelection(edit.document, edit.layer, x - edit.origin.x, y - edit.origin.y, tolerance, contiguous, gap), width, height)
        : null
    }
    if (hasSymmetry(options.axes)) incoming = symmetrySelection(incoming, width, height, options.axes, options.center)
    if (options.tilemap) {
      const { grid, offsetX, offsetY } = options.tilemap
      incoming = expandSelectionToTilemapCells(incoming, grid, offsetX, offsetY, { x: 0, y: 0, width, height })
    }
    return !options.mode || options.mode === 'replace' ? incoming : combineSelection(options.before ?? null, incoming, options.mode)
  }
}
