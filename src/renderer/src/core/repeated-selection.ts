import type { SpriteDocument } from '@shared/types-document'
import type { TileRepeatMode } from '@shared/types-raster'
import type { SelectionMask } from '@shared/types-selection'
import { combineSelection, lassoSelection } from './selection'
import { tileRepeatIncludesX, tileRepeatIncludesY } from './tilemap'

/** Clip each intersected copy separately so mask allocation stays document-sized. */
export function repeatedLassoSelection(document: SpriteDocument, path: readonly { x: number; y: number }[], mode: TileRepeatMode): SelectionMask | null {
  if (mode === 'off' || path.length === 0) return lassoSelection(document, path)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const point of path) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y)
  }
  const left = tileRepeatIncludesX(mode) ? Math.floor(minX / document.width) : 0
  const right = tileRepeatIncludesX(mode) ? Math.floor(maxX / document.width) : 0
  const top = tileRepeatIncludesY(mode) ? Math.floor(minY / document.height) : 0
  const bottom = tileRepeatIncludesY(mode) ? Math.floor(maxY / document.height) : 0
  let result: SelectionMask | null = null
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const localPath = path.map(point => ({ x: point.x - x * document.width, y: point.y - y * document.height }))
    result = combineSelection(result, lassoSelection(document, localPath), 'add')
  }
  return result
}
