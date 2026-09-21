import type { SpriteDocument } from '@shared/types-document'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionQuad, SelectionRect } from '@shared/types-selection'
import { getLayerStorageOrigin, isLayerMask, markLayerContentChanged } from './document-model'
import { beginPixelEdit, preparePixelEdit, type PixelEdit } from './history'
import { selectionContains, selectionQuadBounds, transformedSelectionBounds, type SelectionShearTransform } from './selection'
import { compositeSelectionPixelOver } from './tools-pixel-edit'
import { selectionTransformPreviewPacked } from './tools-selection-transform-raster'
import type { SelectionTransformSource } from './tools-selection-transform-types'
import { cachedSelectionTransformRaster } from './selection-transform-raster-cache'

/** undefined requests the legacy path; null is a successfully evaluated no-op. */
export function applyPackedSelectionTransform(
  document: SpriteDocument, layer: RasterLayer, source: SelectionTransformSource,
  target: SelectionRect, angle: number, copy: boolean, shear?: SelectionShearTransform,
  quad?: SelectionQuad, optimizedRotation = false
): PixelEdit | null | undefined {
  if (layer.format !== 'rgba' || isLayerMask(layer) || document.colorMode !== 'rgba'
    || (document.pixelFormat && document.pixelFormat !== 'rgba32') || layer.pixels.byteOffset % 4 !== 0) return undefined
  const bounds = quad ? selectionQuadBounds(quad) : transformedSelectionBounds(target, angle, shear)
  const left = Math.max(0, Math.floor(bounds.x))
  const top = Math.max(0, Math.floor(bounds.y))
  const right = Math.min(document.width, Math.ceil(bounds.x + bounds.width))
  const bottom = Math.min(document.height, Math.ceil(bounds.y + bounds.height))
  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)
  const selection = source.selection
  const sourceLeft = Math.max(layer.offsetX, selection.x)
  const sourceTop = Math.max(layer.offsetY, selection.y)
  const sourceRight = Math.min(layer.offsetX + layer.width, selection.x + selection.width)
  const sourceBottom = Math.min(layer.offsetY + layer.height, selection.y + selection.height)
  const hasSource = !copy && sourceRight > sourceLeft && sourceBottom > sourceTop
  const hasTarget = width > 0 && height > 0
  if (!hasSource && !hasTarget) return null
  const x = hasSource ? hasTarget ? Math.min(sourceLeft, left) : sourceLeft : left
  const y = hasSource ? hasTarget ? Math.min(sourceTop, top) : sourceTop : top
  const regionWidth = (hasSource ? hasTarget ? Math.max(sourceRight, right) : sourceRight : right) - x
  const regionHeight = (hasSource ? hasTarget ? Math.max(sourceBottom, bottom) : sourceBottom : bottom) - y
  const area = regionWidth * regionHeight
  // Bound temporary memory, including when source and destination are far apart.
  if (area > 16_777_216 || area > 4 * (width * height + (hasSource ? (sourceRight - sourceLeft) * (sourceBottom - sourceTop) : 0))) return undefined
  const raster = cachedSelectionTransformRaster(source, target, { x: left, y: top, width, height }, angle, shear, quad, optimizedRotation,
    () => selectionTransformPreviewPacked(document, source, target, left, top, width, height, angle, shear, layer, undefined, quad, optimizedRotation))
  const pixels = new Uint32Array(layer.pixels.buffer as ArrayBuffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4)
  const before = new Uint32Array(area)
  const after = new Uint32Array(area)
  const changed = new Uint8Array(area)
  let count = 0
  let dirtyLeft = Infinity, dirtyTop = Infinity, dirtyRight = -Infinity, dirtyBottom = -Infinity
  for (let row = 0; row < regionHeight; row += 1) for (let col = 0; col < regionWidth; col += 1) {
    const canvasX = x + col, canvasY = y + row
    const offset = row * regionWidth + col
    const index = (canvasY - layer.offsetY) * layer.width + canvasX - layer.offsetX
    const original = pixels[index]
    let next = hasSource && selectionContains(selection, canvasX, canvasY) ? 0 : original
    if (canvasX >= left && canvasY >= top && canvasX < right && canvasY < bottom) {
      const value = raster[(canvasY - top) * width + canvasX - left]
      // Preserve the original pre-clear backdrop for overlapping transforms.
      if ((value >>> 24) !== 0) next = compositeSelectionPixelOver(document, layer, original, value)
    }
    before[offset] = original
    after[offset] = next
    if (original === next) continue
    changed[offset] = 1
    count += 1
    dirtyLeft = Math.min(dirtyLeft, canvasX); dirtyTop = Math.min(dirtyTop, canvasY)
    dirtyRight = Math.max(dirtyRight, canvasX + 1); dirtyBottom = Math.max(dirtyBottom, canvasY + 1)
  }
  if (count === 0) return null
  const edit = beginPixelEdit(layer.id)
  preparePixelEdit(document, edit)
  const origin = getLayerStorageOrigin(layer)
  edit.denseRegion = { x: x - layer.offsetX + origin.x, y: y - layer.offsetY + origin.y, width: regionWidth, height: regionHeight, before, after, changed, count }
  edit.dirtyRect = { x: dirtyLeft, y: dirtyTop, width: dirtyRight - dirtyLeft, height: dirtyBottom - dirtyTop }
  markLayerContentChanged(layer)
  for (let row = 0; row < regionHeight; row += 1) {
    pixels.set(after.subarray(row * regionWidth, (row + 1) * regionWidth), (y + row - layer.offsetY) * layer.width + x - layer.offsetX)
  }
  return edit
}
