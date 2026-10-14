import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { compileSelectionTransformPoints, transformedSelectionSourcePoint, type SelectionShearTransform } from './selection'
import { forEachSelectedSourceOffset } from './tools-selection-transform-source'
import type { SelectionTransformSource } from './tools-selection-transform-types'
import { fillSelectionRotationHoles } from './selection-rotation-hole-fill'

/** Integer translations need row copies, not an inverse transform per pixel. */
const copyTranslatedSelection = (source: SelectionTransformSource, target: SelectionRect, bounds: SelectionRect, output: Uint32Array, clearTransparent: boolean): boolean => {
  const selection = source.selection
  if (!Number.isInteger(target.x) || !Number.isInteger(target.y) || target.width !== selection.width || target.height !== selection.height
    || target.flipHorizontal || target.flipVertical) return false
  const left = Math.max(bounds.x, target.x), top = Math.max(bounds.y, target.y)
  const right = Math.min(bounds.x + bounds.width, target.x + target.width)
  const bottom = Math.min(bounds.y + bounds.height, target.y + target.height)
  if (right <= left || bottom <= top) return true
  for (let y = top; y < bottom; y++) {
    const from = (y - target.y) * selection.width + left - target.x
    const to = (y - bounds.y) * bounds.width + left - bounds.x
    const count = right - left
    if (!selection.mask) output.set(source.values.subarray(from, from + count), to)
    if (!selection.mask && !clearTransparent) continue
    for (let x = 0; x < count; x++) {
      const value = source.values[from + x]
      if (selection.mask) output[to + x] = selection.mask[from + x] === 1 ? value : 0
      if (clearTransparent && (value >>> 24) === 0) output[to + x] = 0
    }
  }
  return true
}

export function rasterizeSimpleSelectionTransformPacked(document: SpriteDocument, source: SelectionTransformSource, target: SelectionRect, startX: number, startY: number, width: number, height: number, output: Uint32Array): void {
  const right = Math.min(document.width, startX + width, Math.ceil(target.x + target.width))
  const bottom = Math.min(document.height, startY + height, Math.ceil(target.y + target.height))
  const left = Math.max(0, startX, Math.floor(target.x))
  const top = Math.max(0, startY, Math.floor(target.y))
  if (left === startX && top === startY && right === startX + width && bottom === startY + height
    && copyTranslatedSelection(source, target, { x: startX, y: startY, width, height }, output, false)) return
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
  if (angle % 360 === 0 && !shear && copyTranslatedSelection(source, target, bounds, output, true)) return
  const preservingRotation = angle % 360 !== 0 && !shear && !target.flipHorizontal && !target.flipVertical
    && target.width === selection.width && target.height === selection.height
  const points = compileSelectionTransformPoints(selection, target, angle, shear)
  if (!preservingRotation) {
    for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
      const point = points.sourcePoint(x, y)
      if (!point) continue
      const sourceX = Math.floor(point.x)
      const sourceY = Math.floor(point.y)
      if (sourceX < selection.x || sourceY < selection.y || sourceX >= selection.x + selection.width || sourceY >= selection.y + selection.height) continue
      output[(y - top) * width + x - left] = source.values[(sourceY - selection.y) * selection.width + sourceX - selection.x]
    }
    // Inverse sampling can skip an isolated source pixel when a sparse
    // selection shrinks. Preserve such pixels at their forward-mapped cell.
    if (angle === 0 && !shear && !target.flipHorizontal && !target.flipVertical
      && (target.width < selection.width || target.height < selection.height)) {
      const addMissingPixel = (offset: number): void => {
        const value = source.values[offset]
        if ((value >>> 24) === 0) return
        const point = points.destinationPoint(selection.x + offset % selection.width, selection.y + Math.floor(offset / selection.width))
        const x = Math.floor(point.x), y = Math.floor(point.y)
        if (x < left || y < top || x >= right || y >= bottom) return
        const index = (y - top) * width + x - left
        if ((output[index] >>> 24) === 0) output[index] = value
      }
      if (source.opaqueOffsets.length > 0) for (const offset of source.opaqueOffsets) addMissingPixel(offset)
      else forEachSelectedSourceOffset(source, addMissingPixel)
    }
    return
  }

  const addForward = (offset: number): void => {
    const value = source.values[offset]
    if ((value >>> 24) === 0) return
    const point = points.destinationPoint(selection.x + offset % selection.width, selection.y + Math.floor(offset / selection.width))
    const x = Math.floor(point.x)
    const y = Math.floor(point.y)
    if (x < left || y < top || x >= right || y >= bottom) return
    const index = (y - top) * width + x - left
    if ((output[index] >>> 24) === 0) output[index] = value
  }
  if (source.opaqueOffsets.length > 0) for (const offset of source.opaqueOffsets) addForward(offset)
  else forEachSelectedSourceOffset(source, addForward)

  const candidateIndices = new Uint32Array(width * height)
  const candidateValues = new Uint32Array(width * height)
  let count = 0
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const index = (y - top) * width + x - left
    if ((output[index] >>> 24) !== 0) continue
    const point = points.sourcePoint(x, y)
    if (!point) continue
    const value = source.values[(point.y - selection.y) * selection.width + point.x - selection.x]
    if ((value >>> 24) === 0) continue
    candidateIndices[count] = index
    candidateValues[count] = value
    count += 1
  }
  fillSelectionRotationHoles(output, width, candidateIndices, candidateValues, count)
}
