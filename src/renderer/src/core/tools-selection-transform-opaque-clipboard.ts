import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { getLayerStorageOrigin, readLayerPacked, writeLayerPacked, markLayerContentChanged } from './document-model'
import { beginPixelEdit, preparePixelEdit, type PixelEdit } from './history'
import type { SelectionTransformSource } from './tools-selection-transform-types'

/** Direct dense commit for the exact opaque clipboard case. */
export function applyOpaqueClipboardTranslationCommit(
  document: SpriteDocument,
  source: SelectionTransformSource,
  target: SelectionRect,
  targetRect: SelectionRect,
  layer: RasterLayer,
  copy: boolean
): PixelEdit | null | undefined {
  const sourceSelection = source.selection
  if (
    !copy || source.origin !== 'clipboard' || layer.format !== 'rgba' || layer.opacity !== 1
    || layer.blendMode !== 'normal' || sourceSelection.mask
    || source.values.length !== sourceSelection.width * sourceSelection.height
    || !source.values.every(value => (value >>> 24) === 255)
  ) return undefined

  const area = targetRect.width * targetRect.height
  const before = new Uint32Array(area)
  const after = new Uint32Array(area)
  const changed = new Uint8Array(area)
  const packedPixels = layer.pixels.byteOffset % 4 === 0
    ? new Uint32Array(layer.pixels.buffer as ArrayBuffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4)
    : null
  const readPacked = (index: number): number => packedPixels ? packedPixels[index] : readLayerPacked(document, layer, index)
  const writePacked = (index: number, value: number): void => {
    if (packedPixels) packedPixels[index] = value
    else writeLayerPacked(document, layer, index, value)
  }
  let changedCount = 0
  let dirtyLeft = Number.POSITIVE_INFINITY
  let dirtyTop = Number.POSITIVE_INFINITY
  let dirtyRight = Number.NEGATIVE_INFINITY
  let dirtyBottom = Number.NEGATIVE_INFINITY
  let offset = 0
  for (let y = targetRect.y; y < targetRect.y + targetRect.height; y += 1) {
    let index = (y - layer.offsetY) * layer.width + targetRect.x - layer.offsetX
    const sourceRow = (y - target.y) * sourceSelection.width
    for (let x = targetRect.x; x < targetRect.x + targetRect.width; x += 1, index += 1, offset += 1) {
      const beforeValue = readPacked(index)
      const afterValue = source.values[sourceRow + x - target.x]
      before[offset] = beforeValue
      after[offset] = afterValue
      if (beforeValue === afterValue) continue
      changed[offset] = 1
      writePacked(index, afterValue)
      changedCount += 1
      dirtyLeft = Math.min(dirtyLeft, x)
      dirtyTop = Math.min(dirtyTop, y)
      dirtyRight = Math.max(dirtyRight, x + 1)
      dirtyBottom = Math.max(dirtyBottom, y + 1)
    }
  }
  if (changedCount === 0) return null
  const edit = beginPixelEdit(layer.id)
  preparePixelEdit(document, edit)
  edit.dirtyRect = { x: dirtyLeft, y: dirtyTop, width: dirtyRight - dirtyLeft, height: dirtyBottom - dirtyTop }
  markLayerContentChanged(layer)
  const storageOrigin = getLayerStorageOrigin(layer)
  edit.denseRegion = {
    x: targetRect.x - layer.offsetX + storageOrigin.x,
    y: targetRect.y - layer.offsetY + storageOrigin.y,
    width: targetRect.width,
    height: targetRect.height,
    before,
    after,
    changed,
    count: changedCount
  }
  return edit
}
