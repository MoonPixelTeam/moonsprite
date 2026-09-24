import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { TileRepeatMode } from '@shared/types-raster'
import {
  ensureLayerCoversCanvas,
  expandLayerToRect,
  getActiveLayer,
  getLayer,
  getLayerStorageOrigin,
  getPaletteEntry,
  isLayerEffectivelyLocked,
  layerIndexAt,
  markLayerContentChanged,
  readLayerPacked,
  writeLayerPacked
} from './document-model'
import { beginPixelEdit, preparePixelEdit, type PixelEdit } from './history'
import { isInBounds, pixelIndex } from './raster'
import { selectionContains } from './selection'
import { wrapDocumentPointForTileRepeat } from './tilemap'
import { compositeSelectionPixelOver } from './tools-pixel-edit'
import { type SelectionTransformSource, type SelectionTranslationPreview } from './tools-selection-transform-types'

const SELECTION_TRANSLATION_POINT_HISTORY_THRESHOLD = 65_536

export function applySelectionTranslationCommit(
  document: SpriteDocument,
  source: SelectionTransformSource,
  target: SelectionRect,
  copy = false,
  targetLayer?: RasterLayer,
  tileRepeatMode: TileRepeatMode = 'off'
): PixelEdit | null {
  const layer = targetLayer ?? getActiveLayer(document)
  const sourceSelection = source.selection
  if (target.width !== sourceSelection.width || target.height !== sourceSelection.height || target.flipHorizontal || target.flipVertical) return null
  if (!copy && target.x === sourceSelection.x && target.y === sourceSelection.y) return null
  if (isLayerEffectivelyLocked(document, layer)) return null
  if (tileRepeatMode !== 'off') {
    const preview = applySelectionTranslationPreview(document, source, target, copy, null, layer, undefined, tileRepeatMode)
    return selectionTranslationPreviewEdit(document, preview)
  }

  const deltaX = target.x - sourceSelection.x
  const deltaY = target.y - sourceSelection.y
  const selectionContainsLayerStorage = !sourceSelection.mask
    && sourceSelection.x <= layer.offsetX
    && sourceSelection.y <= layer.offsetY
    && sourceSelection.x + sourceSelection.width >= layer.offsetX + layer.width
    && sourceSelection.y + sourceSelection.height >= layer.offsetY + layer.height
  if (!copy && selectionContainsLayerStorage) {
    const edit = beginPixelEdit(layer.id)
    preparePixelEdit(document, edit)
    edit.layerOffset = {
      beforeX: layer.offsetX,
      beforeY: layer.offsetY,
      afterX: layer.offsetX + deltaX,
      afterY: layer.offsetY + deltaY
    }
    const left = Math.min(edit.layerOffset.beforeX, edit.layerOffset.afterX)
    const top = Math.min(edit.layerOffset.beforeY, edit.layerOffset.afterY)
    const right = Math.max(edit.layerOffset.beforeX + layer.width, edit.layerOffset.afterX + layer.width)
    const bottom = Math.max(edit.layerOffset.beforeY + layer.height, edit.layerOffset.afterY + layer.height)
    edit.dirtyRect = { x: left, y: top, width: right - left, height: bottom - top }
    layer.offsetX = edit.layerOffset.afterX
    layer.offsetY = edit.layerOffset.afterY
    return edit
  }
  let sourceRect: SelectionRect
  let targetRect: SelectionRect
  if (source.origin === 'clipboard') {
    const targetLeft = Math.max(0, target.x)
    const targetTop = Math.max(0, target.y)
    const targetRight = Math.min(document.width, target.x + target.width)
    const targetBottom = Math.min(document.height, target.y + target.height)
    if (targetRight <= targetLeft || targetBottom <= targetTop) return null
    targetRect = { x: targetLeft, y: targetTop, width: targetRight - targetLeft, height: targetBottom - targetTop }
    sourceRect = targetRect
  } else {
    const sourceLeft = Math.max(sourceSelection.x, layer.offsetX)
    const sourceTop = Math.max(sourceSelection.y, layer.offsetY)
    const sourceRight = Math.min(sourceSelection.x + sourceSelection.width, layer.offsetX + layer.width)
    const sourceBottom = Math.min(sourceSelection.y + sourceSelection.height, layer.offsetY + layer.height)
    if (sourceRight <= sourceLeft || sourceBottom <= sourceTop) return null
    sourceRect = { x: sourceLeft, y: sourceTop, width: sourceRight - sourceLeft, height: sourceBottom - sourceTop }
    targetRect = { x: sourceLeft + deltaX, y: sourceTop + deltaY, width: sourceRect.width, height: sourceRect.height }
  }
  if (!expandLayerToRect(layer, targetRect.x, targetRect.y, targetRect.x + targetRect.width, targetRect.y + targetRect.height)) return null
  const overlaps = sourceRect.x < targetRect.x + targetRect.width
    && targetRect.x < sourceRect.x + sourceRect.width
    && sourceRect.y < targetRect.y + targetRect.height
    && targetRect.y < sourceRect.y + sourceRect.height
  const regions = copy
    ? [targetRect]
    : overlaps
      ? [{
          x: Math.min(sourceRect.x, targetRect.x),
          y: Math.min(sourceRect.y, targetRect.y),
          width: Math.max(sourceRect.x + sourceRect.width, targetRect.x + targetRect.width) - Math.min(sourceRect.x, targetRect.x),
          height: Math.max(sourceRect.y + sourceRect.height, targetRect.y + targetRect.height) - Math.min(sourceRect.y, targetRect.y)
        }]
      : [sourceRect, targetRect]

  const mask = sourceSelection.mask
  const opaquePaletteIds = layer.format === 'indexed'
    ? new Set(document.palette.filter((entry) => entry.id !== 0 && entry.color.a !== 0).map((entry) => entry.id))
    : null
  const isOpaque = (value: number): boolean => layer.format === 'rgba' ? (value >>> 24) !== 0 : opaquePaletteIds!.has(value)
  const packedPixels = layer.format === 'rgba' && layer.pixels.byteOffset % 4 === 0
    ? new Uint32Array(layer.pixels.buffer as ArrayBuffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4)
    : null
  const readPacked = (index: number): number => layer.format === 'indexed' ? layer.pixels[index] : packedPixels ? packedPixels[index] : readLayerPacked(document, layer, index)
  const writePacked = (index: number, value: number): void => {
    if (layer.format === 'indexed') layer.pixels[index] = value
    else if (packedPixels) packedPixels[index] = value
    else writeLayerPacked(document, layer, index, value)
  }
  const nextValueAt = (x: number, y: number, before: number): number => {
    let next = before
    if (!copy) {
      const localX = x - sourceSelection.x
      const localY = y - sourceSelection.y
      if (localX >= 0 && localY >= 0 && localX < sourceSelection.width && localY < sourceSelection.height) {
        const offset = localY * sourceSelection.width + localX
        if (!mask || mask[offset] === 1) next = 0
      }
    }
    const targetX = x - target.x
    const targetY = y - target.y
    if (targetX >= 0 && targetY >= 0 && targetX < target.width && targetY < target.height) {
      const offset = targetY * sourceSelection.width + targetX
      if ((!mask || mask[offset] === 1) && isOpaque(source.values[offset])) {
        // Clear the moved source first, then blend over the remaining destination.
        next = compositeSelectionPixelOver(document, layer, next, source.values[offset])
      }
    }
    return next
  }

  let changedCount = 0
  let dirtyLeft = Number.POSITIVE_INFINITY
  let dirtyTop = Number.POSITIVE_INFINITY
  let dirtyRight = Number.NEGATIVE_INFINITY
  let dirtyBottom = Number.NEGATIVE_INFINITY
  for (const region of regions) {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      let index = (y - layer.offsetY) * layer.width + region.x - layer.offsetX
      for (let x = region.x; x < region.x + region.width; x += 1, index += 1) {
        const before = readPacked(index)
        if (nextValueAt(x, y, before) === before) continue
        changedCount += 1
        dirtyLeft = Math.min(dirtyLeft, x)
        dirtyTop = Math.min(dirtyTop, y)
        dirtyRight = Math.max(dirtyRight, x + 1)
        dirtyBottom = Math.max(dirtyBottom, y + 1)
      }
    }
  }
  if (changedCount === 0) return null

  const edit = beginPixelEdit(layer.id)
  preparePixelEdit(document, edit)
  edit.dirtyRect = { x: dirtyLeft, y: dirtyTop, width: dirtyRight - dirtyLeft, height: dirtyBottom - dirtyTop }
  const area = regions.reduce((sum, region) => sum + region.width * region.height, 0)
  const useDenseRegion = regions.length === 1 && changedCount > area / 4
  markLayerContentChanged(layer)
  if (useDenseRegion) {
    const region = regions[0]
    const beforeValues = new Uint32Array(area)
    const afterValues = new Uint32Array(area)
    const changed = new Uint8Array(area)
    let offset = 0
    for (let y = region.y; y < region.y + region.height; y += 1) {
      let index = (y - layer.offsetY) * layer.width + region.x - layer.offsetX
      for (let x = region.x; x < region.x + region.width; x += 1, index += 1, offset += 1) {
        const before = readPacked(index)
        const after = nextValueAt(x, y, before)
        beforeValues[offset] = before
        afterValues[offset] = after
        if (after === before) continue
        changed[offset] = 1
        writePacked(index, after)
      }
    }
    const storageOrigin = getLayerStorageOrigin(layer)
    edit.denseRegion = {
      x: region.x - layer.offsetX + storageOrigin.x,
      y: region.y - layer.offsetY + storageOrigin.y,
      width: region.width,
      height: region.height,
      before: beforeValues,
      after: afterValues,
      changed,
      count: changedCount
    }
    return edit
  }

  const indices = new Uint32Array(changedCount)
  const beforeValues = new Uint32Array(changedCount)
  const afterValues = new Uint32Array(changedCount)
  let changedOffset = 0
  for (const region of regions) {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      let index = (y - layer.offsetY) * layer.width + region.x - layer.offsetX
      for (let x = region.x; x < region.x + region.width; x += 1, index += 1) {
        const before = readPacked(index)
        const after = nextValueAt(x, y, before)
        if (after === before) continue
        indices[changedOffset] = index
        beforeValues[changedOffset] = before
        afterValues[changedOffset] = after
        writePacked(index, after)
        changedOffset += 1
      }
    }
  }
  edit.points = { indices, before: beforeValues, after: afterValues, count: changedCount }
  return edit
}

export function restoreSelectionTranslationPreview(document: SpriteDocument, preview: SelectionTranslationPreview): void {
  if (preview.count === 0) return
  const layer = getLayer(document, preview.layerId)
  if (preview.count > 0) markLayerContentChanged(layer)
  for (let offset = 0; offset < preview.count; offset += 1) writeLayerPacked(document, layer, preview.indices[offset], preview.before[offset])
}

export function applySelectionTranslationPreview(
  document: SpriteDocument,
  source: SelectionTransformSource,
  target: SelectionRect,
  copy = false,
  reusable?: SelectionTranslationPreview | null,
  targetLayer?: RasterLayer,
  clipRect?: SelectionRect,
  tileRepeatMode: TileRepeatMode = 'off'
): SelectionTranslationPreview {
  const layer = targetLayer ?? getActiveLayer(document)
  if (reusable) restoreSelectionTranslationPreview(document, reusable)
  else if (layer.kind === 'tilemap') markLayerContentChanged(layer)
  ensureLayerCoversCanvas(document, layer)
  const visibleLeft = Math.max(0, target.x)
  const visibleTop = Math.max(0, target.y)
  const visibleRight = Math.min(document.width, target.x + target.width)
  const visibleBottom = Math.min(document.height, target.y + target.height)
  const visiblePixels = Math.max(0, visibleRight - visibleLeft) * Math.max(0, visibleBottom - visibleTop)
  const repeatCandidateCount = source.opaqueOffsets.length > 0 ? source.opaqueOffsets.length : source.values.length
  const required = tileRepeatMode !== 'off'
    ? Math.max(1, Math.min(document.width * document.height, repeatCandidateCount * (copy || source.origin === 'clipboard' ? 1 : 2)))
    : source.origin === 'clipboard'
      ? Math.max(1, visiblePixels)
      : Math.max(1, source.opaqueOffsets.length > 0 ? source.opaqueOffsets.length * 2 : source.values.length * 2)
  const preview: SelectionTranslationPreview = reusable && reusable.layerId === layer.id && reusable.marks.length === document.width * document.height
    ? reusable
    : {
        layerId: layer.id,
        marks: new Uint8Array(document.width * document.height),
        canvasIndices: new Uint32Array(required),
        indices: new Uint32Array(required),
        before: new Uint32Array(required),
        count: 0
      }
  // Snapshot each destination before this pass writes it. A translated
  // selection may overlap its source; using the live layer after clearing the
  // source would blend translucent pixels against a partially written value.
  const previewBeforeByCanvas = new Map<number, number>()
  for (let offset = 0; offset < preview.count; offset += 1) preview.marks[preview.canvasIndices[offset]] = 0
  preview.count = 0
  if (preview.indices.length < required) {
    preview.canvasIndices = new Uint32Array(required)
    preview.indices = new Uint32Array(required)
    preview.before = new Uint32Array(required)
  }
  const finishPreview = (): SelectionTranslationPreview => {
    if (preview.count > 0) markLayerContentChanged(layer)
    return preview
  }
  const insideClip = (x: number, y: number): boolean => !clipRect
    || (x >= clipRect.x && y >= clipRect.y && x < clipRect.x + clipRect.width && y < clipRect.y + clipRect.height)
  const capture = (canvasIndex: number): void => {
    if (preview.marks[canvasIndex] === 1) return
    const x = canvasIndex % document.width
    const y = Math.floor(canvasIndex / document.width)
    if (!insideClip(x, y)) return
    const index = layerIndexAt(layer, x, y)
    if (index === null) return
    preview.marks[canvasIndex] = 1
    preview.canvasIndices[preview.count] = canvasIndex
    preview.indices[preview.count] = index
    const before = readLayerPacked(document, layer, index)
    preview.before[preview.count] = before
    previewBeforeByCanvas.set(canvasIndex, before)
    preview.count += 1
  }
  const writeCanvasPacked = (canvasIndex: number, value: number, composite = false): void => {
    const x = canvasIndex % document.width
    const y = Math.floor(canvasIndex / document.width)
    if (!insideClip(x, y)) return
    const index = layerIndexAt(layer, x, y)
    if (index !== null) {
      const destination = previewBeforeByCanvas.get(canvasIndex)
      writeLayerPacked(document, layer, index, composite
        ? compositeSelectionPixelOver(document, layer, !copy && source.origin !== 'clipboard' && selectionContains(source.selection, x, y) ? 0 : destination ?? readLayerPacked(document, layer, index), value)
        : value)
    }
  }
  const sourceSelection = source.selection
  if (tileRepeatMode !== 'off') {
    const isTransparent = (value: number): boolean => layer.format === 'rgba'
      ? (value >>> 24) === 0
      : value === 0 || getPaletteEntry(document, value).color.a === 0
    const forEachOpaqueSource = (visit: (localOffset: number, value: number) => void): void => {
      if (source.opaqueOffsets.length > 0) {
        for (let offset = 0; offset < source.opaqueOffsets.length; offset += 1) {
          visit(source.opaqueOffsets[offset], source.opaqueValues[offset])
        }
        return
      }
      for (let localOffset = 0; localOffset < source.values.length; localOffset += 1) {
        if (sourceSelection.mask && sourceSelection.mask[localOffset] !== 1) continue
        const value = source.values[localOffset]
        if (!isTransparent(value)) visit(localOffset, value)
      }
    }
    const sourceCanvasIndex = (localOffset: number): number | null => {
      const x = sourceSelection.x + localOffset % sourceSelection.width
      const y = sourceSelection.y + Math.floor(localOffset / sourceSelection.width)
      return isInBounds(document.width, document.height, x, y) ? pixelIndex(document.width, x, y) : null
    }
    const targetCanvasIndex = (localOffset: number): number | null => {
      const point = wrapDocumentPointForTileRepeat({
        x: target.x + localOffset % sourceSelection.width,
        y: target.y + Math.floor(localOffset / sourceSelection.width)
      }, document.width, document.height, tileRepeatMode)
      return isInBounds(document.width, document.height, point.x, point.y)
        ? pixelIndex(document.width, point.x, point.y)
        : null
    }

    forEachOpaqueSource((localOffset) => {
      if (!copy && source.origin !== 'clipboard') {
        const sourceIndex = sourceCanvasIndex(localOffset)
        if (sourceIndex !== null) capture(sourceIndex)
      }
      const targetIndex = targetCanvasIndex(localOffset)
      if (targetIndex !== null) capture(targetIndex)
    })
    if (!copy && source.origin !== 'clipboard') forEachOpaqueSource((localOffset) => {
      const sourceIndex = sourceCanvasIndex(localOffset)
      if (sourceIndex !== null) writeCanvasPacked(sourceIndex, 0)
    })
    forEachOpaqueSource((localOffset, value) => {
      const targetIndex = targetCanvasIndex(localOffset)
      if (targetIndex !== null) {
        writeCanvasPacked(targetIndex, value, true)
      }
    })
    return finishPreview()
  }
  // Floating pastes are copies. Walk the visible destination rectangle instead
  // of every source pixel so a large pasted image stays responsive on a small
  // canvas, while still retaining its off-canvas pixels for later movement.
  if (copy && source.origin === 'clipboard') {
    for (let y = visibleTop; y < visibleBottom; y += 1) {
      const localY = y - target.y
      for (let x = visibleLeft; x < visibleRight; x += 1) {
        const localX = x - target.x
        const sourceX = sourceSelection.x + localX
        const sourceY = sourceSelection.y + localY
        if (!selectionContains(sourceSelection, sourceX, sourceY)) continue
        const value = source.values[localY * sourceSelection.width + localX]
        const transparent = layer.format === 'rgba'
          ? (value >>> 24) === 0
          : value === 0 || getPaletteEntry(document, value).color.a === 0
        if (transparent) continue
        const index = pixelIndex(document.width, x, y)
        capture(index)
        writeCanvasPacked(index, value, true)
      }
    }
    return finishPreview()
  }
  // Clipboard sources intentionally omit index arrays for large off-canvas
  // pastes. Their previous preview has already been reverted before this
  // path runs, so the stable document contains no source pixels to clear.
  // Only capture and redraw the destination; clearing sourceSelection here
  // writes transparent pixels into the next preview baseline.
  if (source.origin === 'clipboard') {
    const isTransparent = (value: number): boolean => layer.format === 'rgba'
      ? (value >>> 24) === 0
      : value === 0 || getPaletteEntry(document, value).color.a === 0
    for (let localY = 0; localY < sourceSelection.height; localY += 1) for (let localX = 0; localX < sourceSelection.width; localX += 1) {
      const sourceOffset = localY * sourceSelection.width + localX
      const sourceX = sourceSelection.x + localX
      const sourceY = sourceSelection.y + localY
      if (!selectionContains(sourceSelection, sourceX, sourceY) || isTransparent(source.values[sourceOffset])) continue
      const targetX = target.x + localX
      const targetY = target.y + localY
      if (isInBounds(document.width, document.height, targetX, targetY)) capture(pixelIndex(document.width, targetX, targetY))
    }
    for (let localY = 0; localY < sourceSelection.height; localY += 1) for (let localX = 0; localX < sourceSelection.width; localX += 1) {
      const sourceOffset = localY * sourceSelection.width + localX
      const sourceX = sourceSelection.x + localX
      const sourceY = sourceSelection.y + localY
      if (!selectionContains(sourceSelection, sourceX, sourceY) || isTransparent(source.values[sourceOffset])) continue
      const targetX = target.x + localX
      const targetY = target.y + localY
      if (isInBounds(document.width, document.height, targetX, targetY)) writeCanvasPacked(pixelIndex(document.width, targetX, targetY), source.values[sourceOffset], true)
    }
    return finishPreview()
  }
  for (let offset = 0; offset < source.opaqueIndices.length; offset += 1) {
    const sourceIndex = source.opaqueIndices[offset]
    if (!copy) capture(sourceIndex)
    const localOffset = source.opaqueOffsets[offset]
    const x = target.x + localOffset % sourceSelection.width
    const y = target.y + Math.floor(localOffset / sourceSelection.width)
    if (isInBounds(document.width, document.height, x, y)) capture(pixelIndex(document.width, x, y))
  }
  if (!copy) {
    for (let offset = 0; offset < source.opaqueIndices.length; offset += 1) writeCanvasPacked(source.opaqueIndices[offset], 0)
  }
  for (let offset = 0; offset < source.opaqueIndices.length; offset += 1) {
    const localOffset = source.opaqueOffsets[offset]
    const x = target.x + localOffset % sourceSelection.width
    const y = target.y + Math.floor(localOffset / sourceSelection.width)
    if (isInBounds(document.width, document.height, x, y)) {
      const targetIndex = pixelIndex(document.width, x, y)
      writeCanvasPacked(targetIndex, source.opaqueValues[offset], true)
    }
  }
  return finishPreview()
}

export function selectionTranslationPreviewEdit(document: SpriteDocument, preview: SelectionTranslationPreview): PixelEdit | null {
  if (preview.count === 0) return null
  const layer = getLayer(document, preview.layerId)
  const edit = beginPixelEdit(layer.id)
  preparePixelEdit(document, edit)
  const compact = preview.count >= SELECTION_TRANSLATION_POINT_HISTORY_THRESHOLD
  const pointIndices = compact ? new Uint32Array(preview.count) : null
  const pointBefore = compact ? new Uint32Array(preview.count) : null
  const pointAfter = compact ? new Uint32Array(preview.count) : null
  const storageOrigin = getLayerStorageOrigin(layer)
  let changed = 0
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  for (let offset = 0; offset < preview.count; offset += 1) {
    const index = preview.indices[offset]
    const before = preview.before[offset]
    const after = readLayerPacked(document, layer, index)
    if (before === after) continue
    if (compact) {
      pointIndices![changed] = index
      pointBefore![changed] = before
      pointAfter![changed] = after
    } else {
      edit.before.set(index, before)
      edit.after.set(index, after)
    }
    const x = index % layer.width + storageOrigin.x
    const y = Math.floor(index / layer.width) + storageOrigin.y
    left = Math.min(left, x)
    top = Math.min(top, y)
    right = Math.max(right, x + 1)
    bottom = Math.max(bottom, y + 1)
    changed += 1
  }
  if (changed === 0) return null
  edit.dirtyRect = { x: left, y: top, width: right - left, height: bottom - top }
  if (compact) edit.points = {
    indices: changed === pointIndices!.length ? pointIndices! : pointIndices!.slice(0, changed),
    before: changed === pointBefore!.length ? pointBefore! : pointBefore!.slice(0, changed),
    after: changed === pointAfter!.length ? pointAfter! : pointAfter!.slice(0, changed),
    count: changed
  }
  return edit
}
