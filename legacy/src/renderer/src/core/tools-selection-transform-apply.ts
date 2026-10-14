import type { RasterLayer } from '@shared/types-layer'
import type { SelectionMask, SelectionQuad, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import {
  ensureLayerCoversCanvas,
  getActiveLayer,
  getPaletteEntry,
  invalidateRasterContentBounds,
  isLayerEffectivelyLocked,
  layerIndexAt,
  readLayerPacked
} from './document-model'
import { beginPixelEdit, recordPixel, type PixelEdit } from './history'
import { isInBounds, unpackColor } from './raster'
import { selectionContains, selectionQuadBounds, type SelectionShearTransform } from './selection'
import { hasSymmetry, symmetryPoints, symmetrySelectionDragRegion, type SymmetryAxes, type SymmetryCenter, type SymmetryPoint } from './symmetry'
import { compositeSelectionPixelForEdit } from './tools-pixel-edit'
import { captureSelectionTransform, forEachSelectedSourceOffset } from './tools-selection-transform-source'
import { selectionTransformCells } from './tools-selection-transform-raster'
import { applyPackedSelectionTransform } from './tools-selection-transform-commit'
import { type SelectionTransformSource } from './tools-selection-transform-types'

const isSymmetryRepresentative = (point: { x: number; y: number }, selection: SelectionMask, document: SpriteDocument, axes?: SymmetryAxes, center?: SymmetryCenter): boolean => {
  if (!hasSymmetry(axes)) return true
  const candidates = symmetryPoints(point, document.width, document.height, axes, center).filter((candidate) => selectionContains(selection, candidate.x, candidate.y))
  const currentKey = point.y * document.width + point.x
  return candidates.every((candidate) => currentKey <= candidate.y * document.width + candidate.x)
}

export function selectionTransformPreview(document: SpriteDocument, selection: SelectionMask, target: SelectionRect, angle = 0, shear?: SelectionShearTransform, symmetryAxes?: SymmetryAxes, symmetryCenter?: SymmetryCenter, targetLayer?: RasterLayer, quad?: SelectionQuad, optimizedRotation = false): Uint8ClampedArray {
  const outputBounds = quad ? selectionQuadBounds(quad) : target
  const output = new Uint8ClampedArray(outputBounds.width * outputBounds.height * 4)
  const layer = targetLayer ?? getActiveLayer(document)
  const source = captureSelectionTransform(document, selection, layer)
  if (!source) return output
  for (const cell of selectionTransformCells(document, source, target, angle, shear, layer, quad, false, optimizedRotation)) {
    const sourcePoint = { x: cell.sourceIndex % document.width, y: Math.floor(cell.sourceIndex / document.width) }
    if (!isSymmetryRepresentative(sourcePoint, source.selection, document, symmetryAxes, symmetryCenter)) continue
    const color = layer.format === 'indexed' ? getPaletteEntry(document, cell.value).color : unpackColor(cell.value)
    for (const destination of symmetryPoints({ x: cell.x, y: cell.y }, document.width, document.height, symmetryAxes, symmetryCenter)) {
      const localX = destination.x - outputBounds.x
      const localY = destination.y - outputBounds.y
      if (localX < 0 || localY < 0 || localX >= outputBounds.width || localY >= outputBounds.height) continue
      const offset = (localY * outputBounds.width + localX) * 4
      output[offset] = color.r
      output[offset + 1] = color.g
      output[offset + 2] = color.b
      output[offset + 3] = color.a
    }
  }
  return output
}

export function transformSelectionCopy(document: SpriteDocument, selection: SelectionMask, target: SelectionRect, angle = 0, shear?: SelectionShearTransform, symmetryAxes?: SymmetryAxes, symmetryCenter?: SymmetryCenter, targetLayer?: RasterLayer, quad?: SelectionQuad, optimizedRotation = false): PixelEdit | null {
  const layer = targetLayer ?? getActiveLayer(document)
  const source = captureSelectionTransform(document, selection, layer)
  return source ? applySelectionTransform(document, source, target, angle, true, shear, symmetryAxes, symmetryCenter, layer, undefined, quad, false, optimizedRotation) : null
}

export function applySelectionTransform(document: SpriteDocument, source: SelectionTransformSource, target: SelectionRect, angle = 0, copy = false, shear?: SelectionShearTransform, symmetryAxes?: SymmetryAxes, symmetryCenter?: SymmetryCenter, targetLayer?: RasterLayer, symmetryStartPoint?: SymmetryPoint, quad?: SelectionQuad, pixelCenteredSampling = false, optimizedRotation = false): PixelEdit | null {
  const layer = targetLayer ?? getActiveLayer(document)
  if (isLayerEffectivelyLocked(document, layer)) return null
  if (!ensureLayerCoversCanvas(document, layer)) return null
  const edit = beginPixelEdit(layer.id)
  const sourceSelection = source.selection
  const compositeAt = (x: number, y: number, index: number, value: number): number =>
    !copy && selectionContains(sourceSelection, x, y) ? value : compositeSelectionPixelForEdit(document, layer, edit, index, value)
  const normalizedAngle = ((angle % 360) + 360) % 360
  const recordCanvasPixel = (x: number, y: number, value: number): void => {
    const index = layerIndexAt(layer, x, y)
    if (index !== null) recordPixel(document, layer, edit, index, value)
  }
  const symmetryRegion = symmetryStartPoint
    && normalizedAngle === 0
    && !shear
    && !quad
    && !target.flipHorizontal
    && !target.flipVertical
    && target.width === sourceSelection.width
    && target.height === sourceSelection.height
    && Number.isInteger(target.x)
    && Number.isInteger(target.y)
    ? symmetrySelectionDragRegion(sourceSelection, symmetryStartPoint, document.width, document.height, symmetryAxes, symmetryCenter)
    : null
  if (symmetryRegion) {
    if (!copy) forEachSelectedSourceOffset(source, (offset) => {
      const localX = offset % sourceSelection.width
      const localY = Math.floor(offset / sourceSelection.width)
      recordCanvasPixel(sourceSelection.x + localX, sourceSelection.y + localY, 0)
    })
    const written = new Set<number>()
    const deltaX = target.x - sourceSelection.x
    const deltaY = target.y - sourceSelection.y
    for (let y = symmetryRegion.y; y < symmetryRegion.y + symmetryRegion.height; y += 1) {
      for (let x = symmetryRegion.x; x < symmetryRegion.x + symmetryRegion.width; x += 1) {
        if (!selectionContains(symmetryRegion, x, y)) continue
        const sourceOffset = (y - sourceSelection.y) * sourceSelection.width + x - sourceSelection.x
        const value = source.values[sourceOffset]
        const transparent = layer.format === 'rgba'
          ? unpackColor(value).a === 0
          : value === 0 || getPaletteEntry(document, value).color.a === 0
        if (transparent) continue
        for (const destination of symmetryPoints({ x: x + deltaX, y: y + deltaY }, document.width, document.height, symmetryAxes, symmetryCenter)) {
          if (!isInBounds(document.width, document.height, destination.x, destination.y)) continue
          const index = layerIndexAt(layer, destination.x, destination.y)
          if (index === null || written.has(index)) continue
          written.add(index)
          recordCanvasPixel(destination.x, destination.y, compositeAt(destination.x, destination.y, index, value))
        }
      }
    }
    return edit.before.size > 0 ? edit : null
  }

  // Moving an unscaled selection is the common interactive path. Iterate its
  // captured offsets directly instead of allocating a TransformCell per pixel.
  if (!hasSymmetry(symmetryAxes) && normalizedAngle === 0 && !shear && !quad && Number.isInteger(target.x) && Number.isInteger(target.y) && target.width === sourceSelection.width && target.height === sourceSelection.height && !target.flipHorizontal && !target.flipVertical) {
    if (!copy) {
      forEachSelectedSourceOffset(source, (offset) => {
        const localX = offset % sourceSelection.width
        const localY = Math.floor(offset / sourceSelection.width)
        recordCanvasPixel(sourceSelection.x + localX, sourceSelection.y + localY, 0)
      })
    }
    if (copy) {
      const left = Math.max(0, target.x)
      const top = Math.max(0, target.y)
      const right = Math.min(document.width, target.x + target.width)
      const bottom = Math.min(document.height, target.y + target.height)
      for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
        const localX = x - target.x
        const localY = y - target.y
        const sourceX = sourceSelection.x + localX
        const sourceY = sourceSelection.y + localY
        if (!selectionContains(sourceSelection, sourceX, sourceY)) continue
        const value = source.values[localY * sourceSelection.width + localX]
        const transparent = layer.format === 'rgba'
          ? (value >>> 24) === 0
          : value === 0 || getPaletteEntry(document, value).color.a === 0
        if (!transparent) {
          const destinationIndex = layerIndexAt(layer, x, y)
          if (destinationIndex !== null) recordCanvasPixel(x, y, compositeAt(x, y, destinationIndex, value))
        }
      }
    } else forEachSelectedSourceOffset(source, (offset) => {
      const localX = offset % sourceSelection.width
      const localY = Math.floor(offset / sourceSelection.width)
      const x = target.x + localX
      const y = target.y + localY
      if (!isInBounds(document.width, document.height, x, y)) return
      const value = source.values[offset]
      const transparent = layer.format === 'rgba'
        ? unpackColor(value).a === 0
        : value === 0 || getPaletteEntry(document, value).color.a === 0
      if (!transparent) {
        const destinationIndex = layerIndexAt(layer, x, y)
        if (destinationIndex !== null) recordCanvasPixel(x, y, compositeAt(x, y, destinationIndex, value))
      }
    })
    return edit.before.size > 0 ? edit : null
  }
  if (!hasSymmetry(symmetryAxes) && !pixelCenteredSampling) {
    const packed = applyPackedSelectionTransform(document, layer, source, target, angle, copy, shear, quad, optimizedRotation)
    if (packed !== undefined) return packed
  }
  if (!copy) {
    const selection = sourceSelection
    for (let y = selection.y; y < selection.y + selection.height; y += 1) {
      for (let x = selection.x; x < selection.x + selection.width; x += 1) {
        if (!selectionContains(selection, x, y)) continue
        recordCanvasPixel(x, y, 0)
      }
    }
  }
  for (const cell of selectionTransformCells(document, source, target, angle, shear, layer, quad, pixelCenteredSampling, optimizedRotation)) {
    const sourcePoint = { x: cell.sourceIndex % document.width, y: Math.floor(cell.sourceIndex / document.width) }
    if (!isSymmetryRepresentative(sourcePoint, sourceSelection, document, symmetryAxes, symmetryCenter)) continue
    const transparent = layer.format === 'rgba'
      ? unpackColor(cell.value).a === 0
      : cell.value === 0 || getPaletteEntry(document, cell.value).color.a === 0
    if (transparent) continue
    for (const destination of symmetryPoints({ x: cell.x, y: cell.y }, document.width, document.height, symmetryAxes, symmetryCenter)) {
      const destinationIndex = layerIndexAt(layer, destination.x, destination.y)
      if (destinationIndex !== null) recordCanvasPixel(destination.x, destination.y, compositeAt(destination.x, destination.y, destinationIndex, cell.value))
    }
  }
  return edit.before.size > 0 ? edit : null
}

export function moveSelection(document: SpriteDocument, selection: SelectionMask, deltaX: number, deltaY: number, copy = false, targetLayer?: RasterLayer): PixelEdit | null {
  if (deltaX === 0 && deltaY === 0) return null
  const layer = targetLayer ?? getActiveLayer(document)
  const source = captureSelectionTransform(document, selection, layer)
  return source ? applySelectionTransform(document, source, { ...selection, x: selection.x + deltaX, y: selection.y + deltaY }, 0, copy, undefined, undefined, undefined, layer) : null
}

export function flipSelection(document: SpriteDocument, selection: SelectionMask, axis: 'horizontal' | 'vertical', targetLayer?: RasterLayer): PixelEdit | null {
  const layer = targetLayer ?? getActiveLayer(document)
  if (isLayerEffectivelyLocked(document, layer) || !ensureLayerCoversCanvas(document, layer)) return null
  const source = captureSelectionTransform(document, selection, layer)
  if (!source) return null
  const edit = beginPixelEdit(layer.id)
  const recordCanvasPacked = (x: number, y: number, value: number): void => {
    if (!isInBounds(document.width, document.height, x, y)) return
    const index = layerIndexAt(layer, x, y)
    if (index !== null) recordPixel(document, layer, edit, index, value)
  }

  forEachSelectedSourceOffset(source, (offset) => {
    const localX = offset % source.selection.width
    const localY = Math.floor(offset / source.selection.width)
    recordCanvasPacked(source.selection.x + localX, source.selection.y + localY, 0)
  })
  forEachSelectedSourceOffset(source, (offset) => {
    const localX = offset % source.selection.width
    const localY = Math.floor(offset / source.selection.width)
    const targetX = axis === 'horizontal' ? source.selection.width - 1 - localX : localX
    const targetY = axis === 'vertical' ? source.selection.height - 1 - localY : localY
    recordCanvasPacked(source.selection.x + targetX, source.selection.y + targetY, source.values[offset])
  })
  return edit.before.size > 0 ? edit : null
}

export function flipLayer(document: SpriteDocument, axis: 'horizontal' | 'vertical', targetLayer?: RasterLayer): PixelEdit | null {
  const layer = targetLayer ?? getActiveLayer(document)
  if (isLayerEffectivelyLocked(document, layer) || layer.width < 1 || layer.height < 1) return null
  const edit = beginPixelEdit(layer.id)
  const swap = (first: number, second: number): void => {
    const firstValue = readLayerPacked(document, layer, first)
    const secondValue = readLayerPacked(document, layer, second)
    recordPixel(document, layer, edit, first, secondValue)
    recordPixel(document, layer, edit, second, firstValue)
  }
  if (axis === 'horizontal') {
    for (let y = 0; y < layer.height; y += 1) for (let x = 0; x < Math.floor(layer.width / 2); x += 1) {
      swap(y * layer.width + x, y * layer.width + layer.width - 1 - x)
    }
  } else {
    for (let y = 0; y < Math.floor(layer.height / 2); y += 1) for (let x = 0; x < layer.width; x += 1) {
      swap(y * layer.width + x, (layer.height - 1 - y) * layer.width + x)
    }
  }
  // The previous visible-bounds cache is invalid after relocating every
  // pixel. Keeping it makes layer styles compute their expanded output from
  // the pre-flip bounds and visibly clips the mirrored result.
  invalidateRasterContentBounds(layer)
  return edit.before.size > 0 ? edit : null
}
