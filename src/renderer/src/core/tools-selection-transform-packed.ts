import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { transformedSelectionDestinationPoint, transformedSelectionSourcePoint, type SelectionShearTransform } from './selection'
import { forEachSelectedSourceOffset } from './tools-selection-transform-source'
import type { SelectionTransformSource } from './tools-selection-transform-types'

export function rasterizeSimpleSelectionTransformPacked(document: SpriteDocument, source: SelectionTransformSource, target: SelectionRect, startX: number, startY: number, width: number, height: number, output: Uint32Array): void {
  const right = Math.min(document.width, startX + width, Math.ceil(target.x + target.width))
  const bottom = Math.min(document.height, startY + height, Math.ceil(target.y + target.height))
  const left = Math.max(0, startX, Math.floor(target.x))
  const top = Math.max(0, startY, Math.floor(target.y))
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const point = transformedSelectionSourcePoint(source.selection, target, x, y)
    if (!point) continue
    const offset = (point.y - source.selection.y) * source.selection.width + point.x - source.selection.x
    output[(y - startY) * width + x - startX] = source.values[offset]
  }
}

/** RGBA rasterization without a Map and object for every destination pixel. */
export function rasterizeSelectionTransformPacked(
  source: SelectionTransformSource, target: SelectionRect,
  bounds: SelectionRect, output: Uint32Array, angle: number, shear?: SelectionShearTransform
): void {
  const selection = source.selection
  const { x: left, y: top, width, height } = bounds
  const right = left + width
  const bottom = top + height
  const preservingRotation = angle % 360 !== 0 && !shear && !target.flipHorizontal && !target.flipVertical
    && target.width === selection.width && target.height === selection.height
  if (!preservingRotation) {
    for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
      const point = transformedSelectionSourcePoint(selection, target, x, y, angle, shear)
      if (!point) continue
      const sourceX = Math.floor(point.x)
      const sourceY = Math.floor(point.y)
      if (sourceX < selection.x || sourceY < selection.y || sourceX >= selection.x + selection.width || sourceY >= selection.y + selection.height) continue
      output[(y - top) * width + x - left] = source.values[(sourceY - selection.y) * selection.width + sourceX - selection.x]
    }
    return
  }

  const addForward = (offset: number): void => {
    const value = source.values[offset]
    if ((value >>> 24) === 0) return
    const point = transformedSelectionDestinationPoint(selection, target, selection.x + offset % selection.width, selection.y + Math.floor(offset / selection.width), angle)
    const x = Math.floor(point.x)
    const y = Math.floor(point.y)
    if (x < left || y < top || x >= right || y >= bottom) return
    const index = (y - top) * width + x - left
    if ((output[index] >>> 24) === 0) output[index] = value
  }
  if (source.opaqueOffsets.length > 0) for (const offset of source.opaqueOffsets) addForward(offset)
  else forEachSelectedSourceOffset(source, addForward)

  const candidates = new Uint32Array(width * height)
  const additions = new Uint32Array(width * height)
  let count = 0
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const index = (y - top) * width + x - left
    if ((output[index] >>> 24) !== 0) continue
    const point = transformedSelectionSourcePoint(selection, target, x, y, angle)
    if (!point) continue
    const value = source.values[(point.y - selection.y) * selection.width + point.x - selection.x]
    if ((value >>> 24) === 0) continue
    candidates[index] = value
    count += 1
  }
  // Match the legacy simultaneous hole-filling rounds: a pixel added this
  // round must not influence another candidate until the next round.
  while (count > 0) {
    let added = 0
    for (let row = 0; row < height; row += 1) for (let col = 0; col < width; col += 1) {
      const index = row * width + col
      if ((candidates[index] >>> 24) === 0) continue
      let neighbors = 0
      if (col > 0 && (output[index - 1] >>> 24) !== 0) neighbors += 1
      if (col + 1 < width && (output[index + 1] >>> 24) !== 0) neighbors += 1
      if (row > 0 && (output[index - width] >>> 24) !== 0) neighbors += 1
      if (row + 1 < height && (output[index + width] >>> 24) !== 0) neighbors += 1
      if (neighbors >= 2) additions[added++] = index
    }
    if (added === 0) break
    for (let offset = 0; offset < added; offset += 1) {
      const index = additions[offset]
      output[index] = candidates[index]
      candidates[index] = 0
    }
    count -= added
  }
}
