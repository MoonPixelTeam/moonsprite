import { prepareMagicWandOperation, type MagicWandOperation } from '../core/magic-wand-operation'
import { computeMagicWandSelection } from '../core/magic-wand-selection-engine'
import { selectionBoundarySegments, selectionBoundarySegmentsForExterior, selectionPreviewRectangles, selectionPreviewRectanglesForExterior } from '../core/selection-boundary'

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<any>) => void) | null
  postMessage: (value: any, transfer?: Transferable[]) => void
}

let rgbaSource = new Uint8ClampedArray(0)
let indexedSource = new Uint32Array(0)
let sourceWidth = 0
let sourceHeight = 0
let sourceOffsetX = 0
let sourceOffsetY = 0
let sourceFormat: 'rgba' | 'indexed' = 'rgba'
let sourcePalette = new Map<number, number>()
let runtimeData = new Uint8Array(0)
let runtimeTileOffsets = new Int32Array(0)
let runtimeTileSize = 0
let sourceContentBounds: { x: number; y: number; width: number; height: number } | null | undefined

const palettePackedColor = (id: number): number => sourcePalette.get(id) ?? 0

const readPacked = (x: number, y: number): number => {
  const localX = x - sourceOffsetX
  const localY = y - sourceOffsetY
  if (localX < 0 || localY < 0 || localX >= sourceWidth || localY >= sourceHeight) return 0
  if (runtimeData.length > 0 && runtimeTileSize > 0) {
    const tileColumns = Math.ceil(sourceWidth / runtimeTileSize)
    const tileX = Math.floor(localX / runtimeTileSize)
    const tileY = Math.floor(localY / runtimeTileSize)
    const encodedOffset = runtimeTileOffsets[tileY * tileColumns + tileX]
    if (encodedOffset === 0) return 0
    const tileWidth = Math.min(runtimeTileSize, sourceWidth - tileX * runtimeTileSize)
    const offset = encodedOffset - 1 + ((localY % runtimeTileSize) * tileWidth + localX % runtimeTileSize) * 4
    const packed = (runtimeData[offset]
      | (runtimeData[offset + 1] << 8)
      | (runtimeData[offset + 2] << 16)
      | (runtimeData[offset + 3] << 24)) >>> 0
    return sourceFormat === 'indexed' ? palettePackedColor(packed) : packed
  }
  const index = localY * sourceWidth + localX
  if (sourceFormat === 'indexed') return palettePackedColor(indexedSource[index])
  const offset = index * 4
  return (rgbaSource[offset]
    | (rgbaSource[offset + 1] << 8)
    | (rgbaSource[offset + 2] << 16)
    | (rgbaSource[offset + 3] << 24)) >>> 0
}

const discoverContentBounds = (): { x: number; y: number; width: number; height: number } | null => {
  let minX = sourceWidth
  let minY = sourceHeight
  let maxX = -1
  let maxY = -1
  const include = (x: number, y: number, lastX: number) => {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, lastX)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  if (sourceFormat === 'rgba') {
    const scanRows = (data: Uint8Array | Uint8ClampedArray, offset: number, width: number, height: number, originX: number, originY: number) => {
      for (let y = 0; y < height; y++) {
        const row = offset + y * width * 4
        let left = 0
        while (left < width && data[row + left * 4 + 3] === 0) left++
        if (left === width) continue
        let right = width - 1
        while (right > left && data[row + right * 4 + 3] === 0) right--
        include(originX + left, originY + y, originX + right)
      }
    }
    if (runtimeTileSize > 0) {
      // Missing sparse tiles are transparent by definition. Never visit their
      // individual pixels just to discover the source's occupied rectangle.
      const columns = Math.ceil(sourceWidth / runtimeTileSize)
      for (let tile = 0; tile < runtimeTileOffsets.length; tile++) {
        const offset = runtimeTileOffsets[tile]
        if (!offset) continue
        const x = (tile % columns) * runtimeTileSize
        const y = Math.floor(tile / columns) * runtimeTileSize
        scanRows(runtimeData, offset - 1, Math.min(runtimeTileSize, sourceWidth - x), Math.min(runtimeTileSize, sourceHeight - y), x, y)
      }
    } else scanRows(rgbaSource, 0, sourceWidth, sourceHeight, 0, 0)
  } else {
    for (let y = 0; y < sourceHeight; y++) {
      let left = 0
      while (left < sourceWidth && (readPacked(sourceOffsetX + left, sourceOffsetY + y) >>> 24) === 0) left++
      if (left === sourceWidth) continue
      let right = sourceWidth - 1
      while (right > left && (readPacked(sourceOffsetX + right, sourceOffsetY + y) >>> 24) === 0) right--
      include(left, y, right)
    }
  }
  return maxX < minX || maxY < minY ? null : {
    x: sourceOffsetX + minX,
    y: sourceOffsetY + minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  }
}

let operation: MagicWandOperation = {}
let applyOperation = prepareMagicWandOperation(operation)
const handleMessage = (event: MessageEvent<any>) => {
  if (event.data.type === 'operation') {
    operation = event.data.operation
    applyOperation = prepareMagicWandOperation(operation)
    return
  }
  if (event.data.type === 'initialize') {
    sourceWidth = event.data.width
    sourceHeight = event.data.height
    sourceOffsetX = event.data.offsetX
    sourceOffsetY = event.data.offsetY
    sourceFormat = event.data.format
    rgbaSource = sourceFormat === 'rgba'
      ? event.data.pixels instanceof Uint8ClampedArray ? event.data.pixels : new Uint8ClampedArray(event.data.pixels)
      : new Uint8ClampedArray(0)
    indexedSource = sourceFormat === 'indexed'
      ? event.data.pixels instanceof Uint32Array ? event.data.pixels : new Uint32Array(event.data.pixels)
      : new Uint32Array(0)
    sourcePalette = new Map((event.data.palette ?? []).map((entry: any) => [
      entry.id,
      (entry.color.r | (entry.color.g << 8) | (entry.color.b << 16) | (entry.color.a << 24)) >>> 0
    ]))
    runtimeData = event.data.runtime?.data
      ? event.data.runtime.data instanceof Uint8Array ? event.data.runtime.data : new Uint8Array(event.data.runtime.data)
      : new Uint8Array(0)
    runtimeTileOffsets = event.data.runtime?.tileOffsets
      ? event.data.runtime.tileOffsets instanceof Int32Array ? event.data.runtime.tileOffsets : new Int32Array(event.data.runtime.tileOffsets)
      : new Int32Array(0)
    runtimeTileSize = event.data.runtime?.tileSize ?? 0
    sourceContentBounds = event.data.contentBounds === undefined
      ? undefined
      : event.data.contentBounds === null
        ? null
        : {
            x: sourceOffsetX + event.data.contentBounds.x,
            y: sourceOffsetY + event.data.contentBounds.y,
            width: event.data.contentBounds.width,
            height: event.data.contentBounds.height
          }
    return
  }

  const {
    id,
    width,
    height,
    x,
    y,
    tolerance = 0,
    contiguous = true,
    gapClosingThreshold = 0
  } = event.data as {
    id: number
    width: number
    height: number
    x: number
    y: number
    tolerance?: number
    contiguous?: boolean
    gapClosingThreshold?: number
  }
  const computeStartedAt = performance.now()
  const target = readPacked(x, y)
  if (!operation.freeTile && sourceContentBounds === undefined) sourceContentBounds = discoverContentBounds()
  const rawSelection = operation.freeTile ? null : computeMagicWandSelection({
    width,
    height,
    x,
    y,
    tolerance,
    contiguous,
    gapClosingThreshold,
    layerBounds: { x: sourceOffsetX, y: sourceOffsetY, width: sourceWidth, height: sourceHeight },
    contentBounds: sourceContentBounds
  }, readPacked)
  const selection = applyOperation(rawSelection, width, height, x, y, tolerance, contiguous, gapClosingThreshold)
  const computeMs = performance.now() - computeStartedAt
  const boundaryStartedAt = performance.now()
  const exteriorHole = selection && selection === rawSelection && target === 0 && sourceContentBounds
    && selection.x === 0 && selection.y === 0 && selection.width === width && selection.height === height ? sourceContentBounds : null
  const boundarySegments = selection
    ? exteriorHole ? selectionBoundarySegmentsForExterior(selection, exteriorHole) : selectionBoundarySegments(selection)
    : null
  const boundaryMs = performance.now() - boundaryStartedAt
  const previewStartedAt = performance.now()
  let previewRectangles = selection ? exteriorHole ? selectionPreviewRectanglesForExterior(selection, exteriorHole) : selectionPreviewRectangles(selection, 2048) : null
  let previewBitmap: ImageBitmap | null = null
  if (selection && previewRectangles?.length === 0) {
    // Complex/noisy masks must not turn into millions of main-thread path calls.
    const canvas = new OffscreenCanvas(selection.width, selection.height)
    const context = canvas.getContext('2d')!
    const data = context.createImageData(selection.width, selection.height)
    const packed = new Uint32Array(data.data.buffer)
    for (let i = 0; i < packed.length; i++) if (!selection.mask || selection.mask[i]) packed[i] = 0xffffffff
    context.putImageData(data, 0, 0)
    context.globalCompositeOperation = 'source-in'
    context.fillStyle = operation.previewColor ?? '#ffffff'
    context.fillRect(0, 0, selection.width, selection.height)
    previewBitmap = canvas.transferToImageBitmap()
    previewRectangles = null
  }
  const previewMs = performance.now() - previewStartedAt
  const transfer: Transferable[] = []
  if (selection?.mask) transfer.push(selection.mask.buffer)
  if (boundarySegments) transfer.push(boundarySegments.buffer)
  if (previewRectangles) transfer.push(previewRectangles.buffer)
  if (previewBitmap) transfer.push(previewBitmap)
  scope.postMessage({ id, result: { selection, boundarySegments, previewRectangles, previewBitmap, computeMs, boundaryMs, previewMs } }, transfer)
}

scope.onmessage = (event) => {
  try { handleMessage(event) }
  catch (error) { scope.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) }) }
}
