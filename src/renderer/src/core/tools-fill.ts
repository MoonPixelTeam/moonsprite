import type { BrushPaintMode, BrushTexture, ImageBrush, ImageBrushSettings } from '@shared/types-brush'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { cachedLayerContentBounds, ensureLayerCoversCanvas, getActiveLayer, getLayerStorageOrigin, getPaletteEntry, isLayerEffectivelyLocked, layerContentBounds, layerIndexAt, markLayerContentChanged, normalizeLayerPackedValue, paletteColorIdForCanvas, rasterLayerPackedValueIsUniform, readLayerPacked, writeLayerPacked, writeLayerPackedRun } from './document-model'
import { beginPixelEdit, preparePixelEdit, recordPixel, recordPixelKnownCurrent, type PixelEdit } from './history'
import { isInBounds, packColor, pixelIndex } from './raster'
import { packedColorMatchesTolerance, selectionContains } from './selection'
import { proceduralBrushCoverageAt } from './brushes'
import { symmetryPoints, type SymmetryAxes, type SymmetryCenter } from './symmetry'
import { readSurfacePackedRegion } from './runtime-raster'
import { contiguousMatchingRegion, contiguousMatchingRegionInBounds, type BinaryRegionBounds } from './contiguous-region'
import { clampSelection, insideSelection, paintLayerValue, brushTextureContains, imageBrushCoverage, wrappedIndex, imageBrushCoverageAt, ensureLayerCoversEditRect, EDIT_EXPANSION_PADDING } from './tools-pixel-edit'

const COMPACT_FILL_MIN_PIXELS = 512 * 512

const DENSE_SELECTION_FILL_MIN_PIXELS = 512 * 512

const smartClosureBoundsForLayer = (document: SpriteDocument, layer: RasterLayer): BinaryRegionBounds | undefined => {
  const left = Math.max(0, layer.offsetX)
  const top = Math.max(0, layer.offsetY)
  const right = Math.min(document.width, layer.offsetX + layer.width)
  const bottom = Math.min(document.height, layer.offsetY + layer.height)
  if (left === 0 && top === 0 && right === document.width && bottom === document.height) return undefined
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

const smartClosureCandidateBoundsForLayer = (
  document: SpriteDocument,
  layer: RasterLayer,
  startX: number,
  startY: number,
  gapClosingThreshold: number
): BinaryRegionBounds | undefined => {
  const layerBounds = smartClosureBoundsForLayer(document, layer)
  if (!layerBounds) return undefined
  const cachedContent = cachedLayerContentBounds(document, layer)
  const content = cachedContent === undefined ? layerContentBounds(document, layer) : cachedContent
  const padding = Math.max(2, Math.trunc(gapClosingThreshold) + 2)
  const contentLeft = content ? Math.floor(content.x) : startX
  const contentTop = content ? Math.floor(content.y) : startY
  const contentRight = content ? Math.ceil(content.x + content.width) : startX + 1
  const contentBottom = content ? Math.ceil(content.y + content.height) : startY + 1
  const left = Math.max(layerBounds.x, Math.min(startX, contentLeft) - padding)
  const top = Math.max(layerBounds.y, Math.min(startY, contentTop) - padding)
  const right = Math.min(layerBounds.x + layerBounds.width, Math.max(startX + 1, contentRight) + padding)
  const bottom = Math.min(layerBounds.y + layerBounds.height, Math.max(startY + 1, contentBottom) + padding)
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

const regionTouchesBoundsBoundary = (region: Uint8Array, width: number, height: number): boolean => {
  if (width < 1 || height < 1 || region.length < width * height) return false
  for (let y = 0; y < height; y += 1) {
    if (region[y * width] === 1 || region[y * width + width - 1] === 1) return true
  }
  for (let x = 0; x < width; x += 1) {
    if (region[x] === 1 || region[(height - 1) * width + x] === 1) return true
  }
  return false
}

export interface PixelOperationProfiler {
  record(stage: string, duration: number, detail?: Record<string, number | string | boolean>): void
}

const floodFillUniformSolidRuns = (document: SpriteDocument, layer: RasterLayer, target: number, next: number): PixelEdit => {
  const edit = beginPixelEdit(layer.id)
  preparePixelEdit(document, edit)
  const runs = [] as NonNullable<PixelEdit['runs']>
  markLayerContentChanged(layer)
  for (let y = 0; y < document.height; y += 1) {
    const index = layerIndexAt(layer, 0, y)
    if (index === null) continue
    writeLayerPackedRun(document, layer, index, document.width, next)
    runs.push({ index, length: document.width, before: target, after: next })
  }
  edit.runs = runs
  edit.dirtyRect = { x: 0, y: 0, width: document.width, height: document.height }
  return edit
}

const floodFillBinaryRegionSolidRuns = (document: SpriteDocument, layer: RasterLayer, region: Uint8Array, target: number, next: number): PixelEdit | null => {
  const edit = beginPixelEdit(layer.id)
  preparePixelEdit(document, edit)
  const runs = [] as NonNullable<PixelEdit['runs']>
  const fromX = Math.max(0, layer.offsetX)
  const toX = Math.min(document.width, layer.offsetX + layer.width)
  const fromY = Math.max(0, layer.offsetY)
  const toY = Math.min(document.height, layer.offsetY + layer.height)
  let dirtyLeft = document.width
  let dirtyTop = document.height
  let dirtyRight = 0
  let dirtyBottom = 0
  for (let y = fromY; y < toY; y += 1) {
    const regionRow = y * document.width
    let x = fromX
    while (x < toX) {
      while (x < toX && region[regionRow + x] !== 1) x += 1
      if (x >= toX) break
      const left = x
      while (x < toX && region[regionRow + x] === 1) x += 1
      const length = x - left
      const index = (y - layer.offsetY) * layer.width + left - layer.offsetX
      if (runs.length === 0) markLayerContentChanged(layer)
      writeLayerPackedRun(document, layer, index, length, next)
      runs.push({ index, length, before: target, after: next })
      dirtyLeft = Math.min(dirtyLeft, left)
      dirtyTop = Math.min(dirtyTop, y)
      dirtyRight = Math.max(dirtyRight, x)
      dirtyBottom = Math.max(dirtyBottom, y + 1)
    }
  }
  if (runs.length === 0) return null
  edit.runs = runs
  edit.dirtyRect = { x: dirtyLeft, y: dirtyTop, width: dirtyRight - dirtyLeft, height: dirtyBottom - dirtyTop }
  return edit
}

const floodFillLocalBinaryRegionSolidRuns = (
  document: SpriteDocument,
  layer: RasterLayer,
  region: Uint8Array,
  regionBounds: BinaryRegionBounds,
  target: number,
  next: number
): PixelEdit | null => {
  const width = Math.max(0, Math.trunc(regionBounds.width))
  const height = Math.max(0, Math.trunc(regionBounds.height))
  if (width < 1 || height < 1 || region.length < width * height) return null
  const edit = beginPixelEdit(layer.id)
  preparePixelEdit(document, edit)
  const runs = [] as NonNullable<PixelEdit['runs']>
  let dirtyLeft = document.width
  let dirtyTop = document.height
  let dirtyRight = 0
  let dirtyBottom = 0
  const fromX = Math.max(0, Math.ceil(regionBounds.x), layer.offsetX)
  const toX = Math.min(document.width, Math.ceil(regionBounds.x) + width, layer.offsetX + layer.width)
  const fromY = Math.max(0, Math.ceil(regionBounds.y), layer.offsetY)
  const toY = Math.min(document.height, Math.ceil(regionBounds.y) + height, layer.offsetY + layer.height)
  for (let y = fromY; y < toY; y += 1) {
    const regionRow = (y - Math.ceil(regionBounds.y)) * width
    let x = fromX
    while (x < toX) {
      while (x < toX && region[regionRow + x - Math.ceil(regionBounds.x)] !== 1) x += 1
      if (x >= toX) break
      const left = x
      while (x < toX && region[regionRow + x - Math.ceil(regionBounds.x)] === 1) x += 1
      const length = x - left
      const index = (y - layer.offsetY) * layer.width + left - layer.offsetX
      if (runs.length === 0) markLayerContentChanged(layer)
      writeLayerPackedRun(document, layer, index, length, next)
      runs.push({ index, length, before: target, after: next })
      dirtyLeft = Math.min(dirtyLeft, left)
      dirtyTop = Math.min(dirtyTop, y)
      dirtyRight = Math.max(dirtyRight, x)
      dirtyBottom = Math.max(dirtyBottom, y + 1)
    }
  }
  if (runs.length === 0) return null
  edit.runs = runs
  edit.dirtyRect = { x: dirtyLeft, y: dirtyTop, width: dirtyRight - dirtyLeft, height: dirtyBottom - dirtyTop }
  return edit
}

const packedCanvasPixels = (document: SpriteDocument, layer: RasterLayer): Uint32Array | null => {
  if (layer.offsetX !== 0 || layer.offsetY !== 0 || layer.width !== document.width || layer.height !== document.height) return null
  if (layer.format === 'indexed') return layer.pixels
  return layer.pixels.byteOffset % 4 === 0
    ? new Uint32Array(layer.pixels.buffer as ArrayBuffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4)
    : null
}

// Exact-color, unmasked fills can mark visited spans with their final value.
// Produce the existing compact history runs while traversing, avoiding both a
// canvas-sized visited mask and the second full-canvas mask-to-runs scan.
const floodFillPackedSolidRuns = (document: SpriteDocument, layer: RasterLayer, pixels: Uint32Array, startX: number, startY: number, target: number, next: number): PixelEdit | null => {
  next = normalizeLayerPackedValue(document, layer, next)
  if (next === target) return null
  const width = document.width
  const edit = beginPixelEdit(layer.id)
  preparePixelEdit(document, edit)
  const runs: NonNullable<PixelEdit['runs']> = []
  let stack = new Int32Array(1024)
  let count = 0
  const push = (index: number): void => {
    if (count === stack.length) {
      const expanded = new Int32Array(stack.length * 2)
      expanded.set(stack)
      stack = expanded
    }
    stack[count++] = index
  }
  const scanNeighbor = (left: number, right: number): void => {
    if (left < 0 || right > pixels.length) return
    let index = left
    while (index < right) {
      while (index < right && pixels[index] !== target) index += 1
      if (index === right) break
      push(index++)
      while (index < right && pixels[index] === target) index += 1
    }
  }
  let minX = width
  let minY = document.height
  let maxX = 0
  let maxY = 0
  push(startY * width + startX)
  while (count) {
    const seed = stack[--count]
    if (pixels[seed] !== target) continue
    const rowStart = seed - seed % width
    const rowEnd = rowStart + width
    let left = seed
    let right = seed + 1
    while (left > rowStart && pixels[left - 1] === target) left -= 1
    while (right < rowEnd && pixels[right] === target) right += 1
    if (runs.length === 0) markLayerContentChanged(layer)
    pixels.fill(next, left, right)
    runs.push({ index: left, length: right - left, before: target, after: next })
    const y = rowStart / width
    minX = Math.min(minX, left - rowStart)
    maxX = Math.max(maxX, right - rowStart)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y + 1)
    scanNeighbor(left - width, right - width)
    scanNeighbor(left + width, right + width)
  }
  if (!runs.length) return null
  edit.runs = runs
  edit.dirtyRect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  return edit
}

const floodFillSolidRuns = (document: SpriteDocument, layer: RasterLayer, startX: number, startY: number, target: number, next: number, selection: SelectionMask | null | undefined, contiguous: boolean): PixelEdit | null => {
  const edit = beginPixelEdit(layer.id)
  preparePixelEdit(document, edit)
  const runs = [] as NonNullable<PixelEdit['runs']>
  const rgbaWords = layer.format === 'rgba' && layer.pixels.byteOffset % 4 === 0
    ? new Uint32Array(layer.pixels.buffer as ArrayBuffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4)
    : null
  const visibleLeft = Math.max(0, layer.offsetX)
  const visibleTop = Math.max(0, layer.offsetY)
  const visibleRight = Math.min(document.width, layer.offsetX + layer.width)
  const visibleBottom = Math.min(document.height, layer.offsetY + layer.height)
  const localLeft = visibleLeft - layer.offsetX
  const localTop = visibleTop - layer.offsetY
  const localRight = visibleRight - layer.offsetX
  const localBottom = visibleBottom - layer.offsetY
  const selected = (x: number, y: number): boolean => {
    if (!selection) return true
    if (x < selection.x || y < selection.y || x >= selection.x + selection.width || y >= selection.y + selection.height) return false
    return !selection.mask || selection.mask[(y - selection.y) * selection.width + x - selection.x] === 1
  }
  const readLocal = (index: number): number => layer.format === 'indexed'
    ? layer.pixels[index]
    : rgbaWords ? rgbaWords[index] : readLayerPacked(document, layer, index)
  const matchesLocal = (x: number, y: number): boolean => {
    if (x < localLeft || y < localTop || x >= localRight || y >= localBottom) return false
    const canvasX = x + layer.offsetX
    const canvasY = y + layer.offsetY
    return selected(canvasX, canvasY) && readLocal(y * layer.width + x) === target
  }
  let dirtyLeft = document.width
  let dirtyTop = document.height
  let dirtyRight = 0
  let dirtyBottom = 0
  const normalizedNext = normalizeLayerPackedValue(document, layer, next)
  const writeRun = (index: number, length: number): void => {
    if (layer.format === 'indexed') layer.pixels.fill(normalizedNext, index, index + length)
    else if (rgbaWords) rgbaWords.fill(normalizedNext, index, index + length)
    else writeLayerPackedRun(document, layer, index, length, normalizedNext)
  }
  const fillSpan = (left: number, right: number, y: number): void => {
    if (left < localLeft || right >= localRight || y < localTop || y >= localBottom) return
    const length = right - left + 1
    if (runs.length === 0) markLayerContentChanged(layer)
    const index = y * layer.width + left
    writeRun(index, length)
    runs.push({ index, length, before: target, after: normalizedNext })
    const canvasLeft = left + layer.offsetX
    const canvasTop = y + layer.offsetY
    dirtyLeft = Math.min(dirtyLeft, canvasLeft)
    dirtyTop = Math.min(dirtyTop, canvasTop)
    dirtyRight = Math.max(dirtyRight, canvasLeft + length)
    dirtyBottom = Math.max(dirtyBottom, canvasTop + 1)
  }

  if (!contiguous) {
    const bounds = selection ? clampSelection(document, selection) : { x: 0, y: 0, width: document.width, height: document.height }
    if (!bounds) return null
    const fromX = Math.max(bounds.x, visibleLeft)
    const toX = Math.min(bounds.x + bounds.width, visibleRight)
    const fromY = Math.max(bounds.y, visibleTop)
    const toY = Math.min(bounds.y + bounds.height, visibleBottom)
    for (let canvasY = fromY; canvasY < toY; canvasY += 1) {
      const y = canvasY - layer.offsetY
      let x = fromX - layer.offsetX
      const endX = toX - layer.offsetX
      while (x < endX) {
        while (x < endX && !matchesLocal(x, y)) x += 1
        if (x >= endX) break
        const left = x
        while (x + 1 < endX && matchesLocal(x + 1, y)) x += 1
        fillSpan(left, x, y)
        x += 1
      }
    }
  } else {
    let stack = new Int32Array(1024)
    let stackLength = 0
    const push = (x: number, y: number): void => {
      if (!matchesLocal(x, y)) return
      if (stackLength === stack.length) {
        const expanded = new Int32Array(stack.length * 2)
        expanded.set(stack)
        stack = expanded
      }
      stack[stackLength++] = y * layer.width + x
    }
    const scanNeighbor = (left: number, right: number, y: number): void => {
      if (y < localTop || y >= localBottom) return
      let x = left
      while (x <= right) {
        while (x <= right && !matchesLocal(x, y)) x += 1
        if (x > right) break
        push(x, y)
        x += 1
        while (x <= right && matchesLocal(x, y)) x += 1
      }
    }
    push(startX - layer.offsetX, startY - layer.offsetY)
    while (stackLength > 0) {
      const seed = stack[--stackLength]
      const x = seed % layer.width
      const y = Math.floor(seed / layer.width)
      if (!matchesLocal(x, y)) continue
      let left = x
      let right = x
      while (matchesLocal(left - 1, y)) left -= 1
      while (matchesLocal(right + 1, y)) right += 1
      fillSpan(left, right, y)
      scanNeighbor(left, right, y - 1)
      scanNeighbor(left, right, y + 1)
    }
  }
  if (runs.length === 0) return null
  edit.runs = runs
  edit.dirtyRect = { x: dirtyLeft, y: dirtyTop, width: dirtyRight - dirtyLeft, height: dirtyBottom - dirtyTop }
  return edit
}

export interface FloodFillRegionOptions {
  sourceColorAt?: (x: number, y: number) => RgbaColor
  connectivity?: 4 | 8
}

export function floodFill(document: SpriteDocument, layer: RasterLayer, startX: number, startY: number, color: RgbaColor, selection?: SelectionMask | null, contiguous = true, imageBrush: ImageBrush | null = null, brushSize = 1, imageBrushSettings?: ImageBrushSettings, brushTexture: BrushTexture = 'solid', brushTextureScale = 1, proceduralAntialiasStrength = 0, brushPaintMode: BrushPaintMode = 'paint', tolerance = 0, gapClosingThreshold = 0, profiler?: PixelOperationProfiler, options?: FloodFillRegionOptions): PixelEdit | null {
  if (!isInBounds(document.width, document.height, startX, startY) || isLayerEffectivelyLocked(document, layer) || (selection && !insideSelection(selection, startX, startY))) return null
  const startWasOutsideLayer = layerIndexAt(layer, startX, startY) === null
  if (startWasOutsideLayer && !ensureLayerCoversCanvas(document, layer)) return null
  const startLayerIndex = layerIndexAt(layer, startX, startY)
  if (startLayerIndex === null) return null
  const target = readLayerPacked(document, layer, startLayerIndex)
  const normalizedTolerance = Math.max(0, Math.min(255, Math.round(tolerance) || 0))
  const effectiveGapClosingThreshold = contiguous ? gapClosingThreshold : 0
  const paletteColors = layer.format === 'indexed'
    ? new Map(document.palette.map((entry) => [entry.id, packColor(getPaletteEntry(document, entry.id).color)]))
    : null
  const sourceColorAt = options?.sourceColorAt
  const connectivity = options?.connectivity ?? 4
  const targetColor = sourceColorAt ? packColor(sourceColorAt(startX, startY)) : layer.format === 'rgba' ? target : paletteColors!.get(target) ?? 0
  const matchesValue = (value: number): boolean => normalizedTolerance === 0
    ? value === target
    : packedColorMatchesTolerance(layer.format === 'rgba' ? value : paletteColors!.get(value) ?? 0, targetColor, normalizedTolerance)
  const matchesCanvas = (x: number, y: number, value: number): boolean => sourceColorAt
    ? packedColorMatchesTolerance(packColor(sourceColorAt(x, y)), targetColor, normalizedTolerance)
    : matchesValue(value)
  const compactSolidFill = document.width * document.height >= COMPACT_FILL_MIN_PIXELS && !imageBrush && brushTexture === 'solid' && !sourceColorAt && connectivity === 4
  type LocalSmartClosure = { bounds: BinaryRegionBounds; result: ReturnType<typeof contiguousMatchingRegionInBounds> }
  let cachedLocalSmartClosure: LocalSmartClosure | null | undefined
  const resolveLocalSmartClosure = (): LocalSmartClosure | null => {
    if (cachedLocalSmartClosure !== undefined) return cachedLocalSmartClosure
    if (effectiveGapClosingThreshold <= 0 || selection || !compactSolidFill) {
      cachedLocalSmartClosure = null
      return cachedLocalSmartClosure
    }
    const bounds = smartClosureCandidateBoundsForLayer(document, layer, startX, startY, effectiveGapClosingThreshold)
    if (!bounds) {
      cachedLocalSmartClosure = null
      return cachedLocalSmartClosure
    }
    const boundsX = Math.trunc(bounds.x)
    const boundsY = Math.trunc(bounds.y)
    const boundsWidth = Math.trunc(bounds.width)
    const boundsHeight = Math.trunc(bounds.height)
    const packedRegion = readSurfacePackedRegion(
      layer,
      boundsX - layer.offsetX,
      boundsY - layer.offsetY,
      boundsWidth,
      boundsHeight
    )
    const result = contiguousMatchingRegionInBounds(
      boundsWidth,
      boundsHeight,
      startX - boundsX,
      startY - boundsY,
      (index) => packedRegion[index] === target,
      effectiveGapClosingThreshold,
      { x: 0, y: 0, width: boundsWidth, height: boundsHeight },
      profiler ? (stage, duration) => profiler.record(stage, duration) : undefined
    )
    cachedLocalSmartClosure = { bounds, result }
    return cachedLocalSmartClosure
  }
  if (!sourceColorAt && !startWasOutsideLayer && matchesValue(0)) {
    const bounds = selection ? clampSelection(document, selection) : { x: 0, y: 0, width: document.width, height: document.height }
    const layerLeft = layer.offsetX
    const layerTop = layer.offsetY
    const layerRight = layer.offsetX + layer.width
    const layerBottom = layer.offsetY + layer.height
    const boundsExtendOutsideLayer = Boolean(bounds && (bounds.x < layerLeft || bounds.y < layerTop || bounds.x + bounds.width > layerRight || bounds.y + bounds.height > layerBottom))
    const contiguousRegionCanEscapeLayer = (): boolean => {
      if (!contiguous || !boundsExtendOutsideLayer) return boundsExtendOutsideLayer
      const startLocalX = startX - layerLeft
      const startLocalY = startY - layerTop
      const visited = new Uint8Array(layer.width * layer.height)
      let stack = new Int32Array(Math.min(layer.width * layer.height, 1024))
      let stackLength = 0
      const matchesLocal = (localX: number, localY: number): boolean => {
        if (localX < 0 || localY < 0 || localX >= layer.width || localY >= layer.height) return false
        const index = localY * layer.width + localX
        if (visited[index]) return false
        const canvasX = layerLeft + localX
        const canvasY = layerTop + localY
        return (!selection || insideSelection(selection, canvasX, canvasY)) && matchesValue(readLayerPacked(document, layer, index))
      }
      const push = (localX: number, localY: number): void => {
        if (!matchesLocal(localX, localY)) return
        const index = localY * layer.width + localX
        visited[index] = 1
        if (stackLength === stack.length) {
          const expanded = new Int32Array(Math.min(layer.width * layer.height, Math.max(stack.length * 2, 1024)))
          expanded.set(stack)
          stack = expanded
        }
        stack[stackLength++] = index
      }
      const outsideSelected = (canvasX: number, canvasY: number): boolean => canvasX >= 0 && canvasY >= 0 && canvasX < document.width && canvasY < document.height && (!selection || insideSelection(selection, canvasX, canvasY))
      const scanNeighbor = (left: number, right: number, localY: number): void => {
        if (localY < 0 || localY >= layer.height) return
        let localX = left
        while (localX <= right) {
          while (localX <= right && !matchesLocal(localX, localY)) localX += 1
          if (localX > right) break
          push(localX, localY)
          localX += 1
          while (localX <= right && matchesLocal(localX, localY)) localX += 1
        }
      }
      push(startLocalX, startLocalY)
      while (stackLength > 0) {
        const index = stack[--stackLength]
        const localX = index % layer.width
        const localY = Math.floor(index / layer.width)
        let left = localX
        let right = localX
        while (matchesLocal(left - 1, localY)) left -= 1
        while (matchesLocal(right + 1, localY)) right += 1
        visited.fill(1, localY * layer.width + left, localY * layer.width + right + 1)
        const canvasY = layerTop + localY
        if ((left === 0 && outsideSelected(layerLeft - 1, canvasY))
          || (right === layer.width - 1 && outsideSelected(layerRight, canvasY))) return true
        if (localY === 0 || localY === layer.height - 1) {
          const outsideY = localY === 0 ? layerTop - 1 : layerBottom
          for (let x = left; x <= right; x += 1) if (outsideSelected(layerLeft + x, outsideY)) return true
        }
        scanNeighbor(left, right, localY - 1)
        scanNeighbor(left, right, localY + 1)
      }
      return false
    }
    const localSmartClosure = resolveLocalSmartClosure()
    const mayReachOutsideLayer = localSmartClosure
      ? Boolean(localSmartClosure.result && regionTouchesBoundsBoundary(localSmartClosure.result.region, Math.trunc(localSmartClosure.result.bounds.width), Math.trunc(localSmartClosure.result.bounds.height)))
      : contiguousRegionCanEscapeLayer()
    if (mayReachOutsideLayer && !ensureLayerCoversCanvas(document, layer)) return null
  }
  const edit = beginPixelEdit(layer.id)
  preparePixelEdit(document, edit)
  const next = paintLayerValue(document, layer, edit, startLayerIndex, color)
  if (!sourceColorAt && target === next) return null
  if (compactSolidFill) {
    const layerCoversCanvas = layer.offsetX <= 0
      && layer.offsetY <= 0
      && layer.offsetX + layer.width >= document.width
      && layer.offsetY + layer.height >= document.height
    if (!selection && layerCoversCanvas && rasterLayerPackedValueIsUniform(layer, target)) {
      return floodFillUniformSolidRuns(document, layer, target, next)
    }
    const packedPixels = normalizedTolerance === 0 && contiguous && !selection
      ? packedCanvasPixels(document, layer)
      : null
    if (packedPixels) {
      if (effectiveGapClosingThreshold <= 0) return floodFillPackedSolidRuns(document, layer, packedPixels, startX, startY, target, next)
      const region = contiguousMatchingRegion(
        document.width,
        document.height,
        startX,
        startY,
        (index) => packedPixels[index] === target,
        effectiveGapClosingThreshold,
        undefined,
        profiler ? (stage, duration) => profiler.record(stage, duration) : undefined
      )
      return region ? floodFillBinaryRegionSolidRuns(document, layer, region, target, next) : null
    }
    if (effectiveGapClosingThreshold > 0 && !selection) {
      const localSmartClosure = resolveLocalSmartClosure()
      if (localSmartClosure) {
        if (!localSmartClosure.result) return null
        if (!regionTouchesBoundsBoundary(localSmartClosure.result.region, Math.trunc(localSmartClosure.result.bounds.width), Math.trunc(localSmartClosure.result.bounds.height))) {
          return floodFillLocalBinaryRegionSolidRuns(document, layer, localSmartClosure.result.region, localSmartClosure.result.bounds, target, next)
        }
      } else {
        const smartClosureBounds = smartClosureBoundsForLayer(document, layer)
        if (smartClosureBounds) return null
      }
    }
    if (effectiveGapClosingThreshold <= 0 && normalizedTolerance === 0) {
      return floodFillSolidRuns(document, layer, startX, startY, target, next, selection, contiguous)
    }
  }
  const textureCoverage = (x: number, y: number): number => {
    if (!imageBrush) return brushTextureContains(brushTexture, x, y, brushTextureScale) ? 255 : 0
    const originX = brushPaintMode === 'pattern-source' ? imageBrush.sourceX ?? 0 : brushPaintMode === 'pattern-target' ? startX : 0
    const originY = brushPaintMode === 'pattern-source' ? imageBrush.sourceY ?? 0 : brushPaintMode === 'pattern-target' ? startY : 0
    const sampleX = x - originX
    const sampleY = y - originY
    const sampleSize = imageBrush.id.startsWith('procedural:') || brushPaintMode !== 'paint'
      ? Math.max(imageBrush.width, imageBrush.height)
      : brushSize
    if (imageBrush.id.startsWith('procedural:')) return imageBrushCoverage(proceduralBrushCoverageAt(imageBrush.id, sampleX, sampleY, sampleSize, imageBrush.proceduralSettings), sampleX, sampleY, imageBrushSettings, proceduralAntialiasStrength)
    return imageBrush.intrinsicSize ? imageBrush.coverage[wrappedIndex(sampleY, imageBrush.height) * imageBrush.width + wrappedIndex(sampleX, imageBrush.width)] ?? 0 : imageBrushCoverageAt(imageBrush, sampleX, sampleY, sampleSize, imageBrushSettings)
  }
  const constantFillValue = color.a === 0
    ? layer.format === 'rgba' ? packColor(color) : 0
    : color.a === 255
      ? layer.format === 'rgba' ? packColor(color) : paletteColorIdForCanvas(document, color)
      : null
  const layerIndexAtCanvas = (x: number, y: number): number | null => {
    const localX = x - layer.offsetX
    const localY = y - layer.offsetY
    return localX < 0 || localY < 0 || localX >= layer.width || localY >= layer.height
      ? null
      : localY * layer.width + localX
  }
  const paintAtCoverage = (layerIndex: number, coverage: number, current: number): void => {
    if (coverage <= 0) return
    const nextValue = coverage === 255 && constantFillValue !== null
      ? constantFillValue
      : paintLayerValue(document, layer, edit, layerIndex, coverage === 255 ? color : { ...color, a: Math.round(color.a * coverage / 255) })
    recordPixelKnownCurrent(document, layer, edit, layerIndex, current, nextValue)
  }
  if (!contiguous) {
    const bounds = selection ? clampSelection(document, selection) : { x: 0, y: 0, width: document.width, height: document.height }
    if (!bounds) return null
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        if (selection && !selectionContains(selection, x, y)) continue
        const layerIndex = layerIndexAtCanvas(x, y)
        if (layerIndex === null) continue
        const current = readLayerPacked(document, layer, layerIndex)
        if (!matchesCanvas(x, y, current)) continue
        paintAtCoverage(layerIndex, textureCoverage(x, y), current)
      }
    }
    return edit.before.size > 0 ? edit : null
  }
  const maxPixels = document.width * document.height
  if (effectiveGapClosingThreshold > 0) {
    const smartClosureBounds = sourceColorAt ? undefined : smartClosureBoundsForLayer(document, layer)
    const region = contiguousMatchingRegion(document.width, document.height, startX, startY, (index) => {
      const x = index % document.width
      const y = Math.floor(index / document.width)
      if (selection && !insideSelection(selection, x, y)) return false
      const layerIndex = layerIndexAtCanvas(x, y)
      return layerIndex !== null && matchesCanvas(x, y, readLayerPacked(document, layer, layerIndex))
      }, effectiveGapClosingThreshold, smartClosureBounds, profiler ? (stage, duration) => profiler.record(stage, duration) : undefined, connectivity)
    if (!region) return null
    if (!sourceColorAt && connectivity === 4 && !imageBrush && brushTexture === 'solid' && normalizedTolerance === 0) {
      return floodFillLocalBinaryRegionSolidRuns(document, layer, region, { x: 0, y: 0, width: document.width, height: document.height }, target, next)
    }
    for (let index = 0; index < maxPixels; index += 1) {
      if (region[index] !== 1) continue
      const x = index % document.width
      const y = Math.floor(index / document.width)
      const layerIndex = layerIndexAtCanvas(x, y)
      if (layerIndex !== null) paintAtCoverage(layerIndex, textureCoverage(x, y), readLayerPacked(document, layer, layerIndex))
    }
    return edit.before.size > 0 ? edit : null
  }
  const visited = new Uint8Array(maxPixels)
  let stack = new Int32Array(Math.min(maxPixels, 1024))
  let stackLength = 0
  const enqueueIfMatching = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= document.width || y >= document.height) return
    const index = pixelIndex(document.width, x, y)
    if (visited[index] || (selection && !insideSelection(selection, x, y))) return
    const layerIndex = layerIndexAtCanvas(x, y)
    if (layerIndex === null || !matchesCanvas(x, y, readLayerPacked(document, layer, layerIndex))) return
    visited[index] = 1
    if (stackLength === stack.length) {
      const expanded = new Int32Array(Math.min(maxPixels, Math.max(stack.length * 2, 1024)))
      expanded.set(stack)
      stack = expanded
    }
    stack[stackLength++] = index
  }
  enqueueIfMatching(startX, startY)
  while (stackLength > 0) {
    const index = stack[--stackLength]
    const x = index % document.width
    const y = Math.floor(index / document.width)
    const layerIndex = layerIndexAtCanvas(x, y)
    if (layerIndex === null) continue
    paintAtCoverage(layerIndex, textureCoverage(x, y), readLayerPacked(document, layer, layerIndex))
    enqueueIfMatching(x - 1, y)
    enqueueIfMatching(x + 1, y)
    enqueueIfMatching(x, y - 1)
    enqueueIfMatching(x, y + 1)
    if (connectivity === 8) {
      enqueueIfMatching(x - 1, y - 1)
      enqueueIfMatching(x + 1, y - 1)
      enqueueIfMatching(x - 1, y + 1)
      enqueueIfMatching(x + 1, y + 1)
    }
  }
  return edit.before.size > 0 ? edit : null
}

export function floodFillSymmetric(document: SpriteDocument, layer: RasterLayer, startX: number, startY: number, color: RgbaColor, selection: SelectionMask | null | undefined, contiguous: boolean, imageBrush: ImageBrush | null, brushSize: number, imageBrushSettings: ImageBrushSettings | undefined, brushTexture: BrushTexture, brushTextureScale: number, proceduralAntialiasStrength: number, brushPaintMode: BrushPaintMode, symmetryAxes?: SymmetryAxes, symmetryCenter?: SymmetryCenter, tolerance = 0, gapClosingThreshold = 0, profiler?: PixelOperationProfiler, options?: FloodFillRegionOptions): PixelEdit | null {
  const merged = beginPixelEdit(layer.id)
  for (const seed of symmetryPoints({ x: startX, y: startY }, document.width, document.height, symmetryAxes, symmetryCenter)) {
    const fillStartedAt = profiler ? performance.now() : 0
    const edit = floodFill(document, layer, seed.x, seed.y, color, selection, contiguous, imageBrush, brushSize, imageBrushSettings, brushTexture, brushTextureScale, proceduralAntialiasStrength, brushPaintMode, tolerance, gapClosingThreshold, profiler, options)
    profiler?.record('bucket.flood-fill', performance.now() - fillStartedAt, {
      points: edit?.before.size ?? 0,
      runs: edit?.runs?.length ?? 0,
      dirtyPixels: edit?.dirtyRect ? edit.dirtyRect.width * edit.dirtyRect.height : 0
    })
    if (!edit) continue
    const mergeStartedAt = profiler ? performance.now() : 0
    merged.frameId ??= edit.frameId
    if (edit.runs?.length) (merged.runs ??= []).push(...edit.runs)
    for (const [index, value] of edit.before) if (!merged.before.has(index)) merged.before.set(index, value)
    for (const [index, value] of edit.after) merged.after.set(index, value)
    if (edit.dirtyRect) {
      if (!merged.dirtyRect) merged.dirtyRect = { ...edit.dirtyRect }
      else {
        const left = Math.min(merged.dirtyRect.x, edit.dirtyRect.x)
        const top = Math.min(merged.dirtyRect.y, edit.dirtyRect.y)
        const right = Math.max(merged.dirtyRect.x + merged.dirtyRect.width, edit.dirtyRect.x + edit.dirtyRect.width)
        const bottom = Math.max(merged.dirtyRect.y + merged.dirtyRect.height, edit.dirtyRect.y + edit.dirtyRect.height)
        merged.dirtyRect = { x: left, y: top, width: right - left, height: bottom - top }
      }
    }
    profiler?.record('bucket.pixel-edit-merge', performance.now() - mergeStartedAt, {
      points: merged.before.size,
      runs: merged.runs?.length ?? 0
    })
  }
  return merged.before.size > 0 || merged.runs?.length ? merged : null
}

export function clearSelection(document: SpriteDocument, selection: SelectionMask, targetLayer?: RasterLayer): PixelEdit | null {
  const layer = targetLayer ?? getActiveLayer(document)
  if (isLayerEffectivelyLocked(document, layer)) return null
  const clamped = clampSelection(document, selection)
  const content = layerContentBounds(document, layer)
  if (!clamped || !content) return null
  const left = Math.max(clamped.x, content.x)
  const top = Math.max(clamped.y, content.y)
  const right = Math.min(clamped.x + clamped.width, content.x + content.width)
  const bottom = Math.min(clamped.y + clamped.height, content.y + content.height)
  if (right <= left || bottom <= top) return null
  const edit = beginPixelEdit(layer.id)
  if (!selection.mask) {
    const width = right - left
    const height = bottom - top
    const localLeft = left - layer.offsetX
    const localTop = top - layer.offsetY
    const values = readSurfacePackedRegion(layer, localLeft, localTop, width, height)
    for (let localY = 0; localY < height; localY += 1) {
      let layerIndex = (localTop + localY) * layer.width + localLeft
      let valueOffset = localY * width
      for (let localX = 0; localX < width; localX += 1, layerIndex += 1, valueOffset += 1) {
        const current = values[valueOffset]
        if (current !== 0) recordPixelKnownCurrent(document, layer, edit, layerIndex, current, 0)
      }
    }
    return edit.before.size > 0 ? edit : null
  }
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (!selectionContains(selection, x, y)) continue
      const index = layerIndexAt(layer, x, y)
      if (index !== null) recordPixel(document, layer, edit, index, 0)
    }
  }
  return edit
}

export function fillSelectionOrCanvas(document: SpriteDocument, layer: RasterLayer, color: RgbaColor, selection: SelectionMask | null = null): PixelEdit | null {
  if (isLayerEffectivelyLocked(document, layer)) return null
  const bounds = selection ? clampSelection(document, selection) : { x: 0, y: 0, width: document.width, height: document.height }
  if (!bounds) return null
  const edit = beginPixelEdit(layer.id)
  if (!ensureLayerCoversEditRect(document, layer, edit, bounds, selection ? EDIT_EXPANSION_PADDING : 0)) return null
  const value = normalizeLayerPackedValue(document, layer, layer.format === 'rgba' ? packColor(color) : paletteColorIdForCanvas(document, color))
  const denseArea = bounds.width * bounds.height
  let useDenseEdit = denseArea >= DENSE_SELECTION_FILL_MIN_PIXELS
  if (useDenseEdit && selection?.mask) {
    let selectedCount = 0
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        if (selectionContains(selection, x, y)) selectedCount += 1
      }
    }
    useDenseEdit = selectedCount * 3 >= denseArea
  }
  if (useDenseEdit) {
    const before = new Uint32Array(bounds.width * bounds.height)
    const after = new Uint32Array(bounds.width * bounds.height)
    const changed = new Uint8Array(bounds.width * bounds.height)
    const storageOrigin = getLayerStorageOrigin(layer)
    const rgbaWords = layer.format === 'rgba' && layer.pixels.byteOffset % 4 === 0
      ? new Uint32Array(layer.pixels.buffer as ArrayBuffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4)
      : null
    let count = 0
    let dirtyLeft = bounds.x + bounds.width
    let dirtyTop = bounds.y + bounds.height
    let dirtyRight = bounds.x
    let dirtyBottom = bounds.y
    preparePixelEdit(document, edit)
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        const denseOffset = (y - bounds.y) * bounds.width + x - bounds.x
        const index = layerIndexAt(layer, x, y)
        if (index === null) continue
        const current = rgbaWords ? rgbaWords[index] : readLayerPacked(document, layer, index)
        before[denseOffset] = current
        after[denseOffset] = current
        if (selection && !selectionContains(selection, x, y)) continue
        if (current === value) continue
        if (count === 0) markLayerContentChanged(layer)
        after[denseOffset] = value
        changed[denseOffset] = 1
        count += 1
        dirtyLeft = Math.min(dirtyLeft, x)
        dirtyTop = Math.min(dirtyTop, y)
        dirtyRight = Math.max(dirtyRight, x + 1)
        dirtyBottom = Math.max(dirtyBottom, y + 1)
        if (rgbaWords) rgbaWords[index] = value
        else writeLayerPacked(document, layer, index, value)
      }
    }
    if (count === 0) return null
    edit.denseRegion = {
      x: bounds.x - layer.offsetX + storageOrigin.x,
      y: bounds.y - layer.offsetY + storageOrigin.y,
      width: bounds.width,
      height: bounds.height,
      before,
      after,
      changed,
      count
    }
    edit.dirtyRect = { x: dirtyLeft, y: dirtyTop, width: dirtyRight - dirtyLeft, height: dirtyBottom - dirtyTop }
    return edit
  }
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      if (selection && !selectionContains(selection, x, y)) continue
      const index = layerIndexAt(layer, x, y)
      if (index === null) continue
      recordPixel(document, layer, edit, index, value)
    }
  }
  return edit.before.size > 0 ? edit : null
}

export function replaceLayerColor(document: SpriteDocument, layer: RasterLayer, source: RgbaColor, replacement: RgbaColor, selection: SelectionMask | null = null): PixelEdit | null {
  const sourceValue = packColor(source)
  if (sourceValue === packColor(replacement)) return null
  const indexedSourceIds = layer.format === 'indexed'
    ? new Set(document.palette.filter((entry) => packColor(entry.color) === sourceValue).map((entry) => entry.id))
    : null
  if (indexedSourceIds?.size === 0) return null
  const edit = beginPixelEdit(layer.id)
  let replacementValue: number | null = layer.format === 'rgba' ? packColor(replacement) : null
  const replaceIndex = (index: number): void => {
    const current = readLayerPacked(document, layer, index)
    if (layer.format === 'rgba' ? current !== sourceValue : !indexedSourceIds!.has(current)) return
    replacementValue ??= paletteColorIdForCanvas(document, replacement)
    recordPixelKnownCurrent(document, layer, edit, index, current, replacementValue)
  }
  if (selection) {
    const bounds = clampSelection(document, selection)
    if (!bounds) return null
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        if (!selectionContains(selection, x, y)) continue
        const index = layerIndexAt(layer, x, y)
        if (index !== null) replaceIndex(index)
      }
    }
  } else {
    for (let index = 0; index < layer.width * layer.height; index += 1) replaceIndex(index)
  }
  return edit.before.size > 0 ? edit : null
}
