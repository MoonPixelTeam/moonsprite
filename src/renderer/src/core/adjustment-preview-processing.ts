import type { RasterLayer } from '@shared/types-layer'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { applyColorAdjustmentDirect, isColorAdjustmentIdentity, type ColorAdjustment } from './adjustments'
import { setRuntimeAppLocale } from './localization'
import type { AdjustmentPreviewBaseline, AdjustmentPreviewResult, AdjustmentPreviewResultLayer } from './adjustment-preview-protocol'

const TARGET_CHUNK_PIXELS = 1024 * 1024

const intersectRect = (left: SelectionRect, right: SelectionRect): SelectionRect | null => {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const rightEdge = Math.min(left.x + left.width, right.x + right.width)
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height)
  return rightEdge > x && bottomEdge > y ? { x, y, width: rightEdge - x, height: bottomEdge - y } : null
}

const previewLayerRect = (layer: AdjustmentPreviewBaseline['layers'][number], region: SelectionRect, selection: SelectionMask | null): SelectionRect | null => {
  if (!layer.localContentBounds) return null
  let rect = intersectRect(region, { x: layer.offsetX, y: layer.offsetY, width: layer.width, height: layer.height })
  if (rect) rect = intersectRect(rect, {
    x: layer.offsetX + layer.localContentBounds.x,
    y: layer.offsetY + layer.localContentBounds.y,
    width: layer.localContentBounds.width,
    height: layer.localContentBounds.height
  })
  if (rect && selection) rect = intersectRect(rect, selection)
  if (!rect) return null
  const x = Math.floor(rect.x)
  const y = Math.floor(rect.y)
  const right = Math.ceil(rect.x + rect.width)
  const bottom = Math.ceil(rect.y + rect.height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

const clonePalette = (baseline: AdjustmentPreviewBaseline): SpriteDocument['palette'] => baseline.palette.map((entry) => ({ ...entry, color: { ...entry.color } }))

const createWorkerDocument = (baseline: AdjustmentPreviewBaseline): SpriteDocument => ({
  width: baseline.documentWidth,
  height: baseline.documentHeight,
  colorMode: baseline.colorMode,
  palette: clonePalette(baseline),
  paletteOrder: [...baseline.paletteOrder],
  nextColorId: baseline.nextColorId
} as SpriteDocument)

const copySourceRows = (
  source: Uint8ClampedArray | Uint32Array,
  sourceWidth: number,
  localX: number,
  localY: number,
  width: number,
  height: number,
  target: Uint8ClampedArray | Uint32Array
): void => {
  const components = source instanceof Uint8ClampedArray ? 4 : 1
  for (let row = 0; row < height; row += 1) {
    const sourceOffset = ((localY + row) * sourceWidth + localX) * components
    const targetOffset = row * width * components
    target.set(source.subarray(sourceOffset, sourceOffset + width * components), targetOffset)
  }
}

const processLayer = async (
  document: SpriteDocument,
  baseline: AdjustmentPreviewBaseline,
  sourceLayer: AdjustmentPreviewBaseline['layers'][number],
  adjustment: ColorAdjustment,
  region: SelectionRect,
  shouldContinue: () => boolean,
  yieldControl: () => Promise<void>
): Promise<AdjustmentPreviewResultLayer | null> => {
  const rect = previewLayerRect(sourceLayer, region, baseline.selection)
  if (!rect) return null
  const output = sourceLayer.format === 'rgba'
    ? new Uint8ClampedArray(rect.width * rect.height * 4)
    : new Uint32Array(rect.width * rect.height)
  const localX = rect.x - sourceLayer.offsetX
  const localY = rect.y - sourceLayer.offsetY
  const rowsPerChunk = Math.max(1, Math.floor(TARGET_CHUNK_PIXELS / Math.max(1, rect.width)))
  const identity = isColorAdjustmentIdentity(adjustment)

  for (let row = 0; row < rect.height; row += rowsPerChunk) {
    if (!shouldContinue()) return null
    const height = Math.min(rowsPerChunk, rect.height - row)
    const components = sourceLayer.format === 'rgba' ? 4 : 1
    const outputOffset = row * rect.width * components
    const chunk = output.subarray(outputOffset, outputOffset + rect.width * height * components)
    copySourceRows(sourceLayer.pixels, sourceLayer.width, localX, localY + row, rect.width, height, chunk)
    if (!identity) {
      const layer = {
        id: sourceLayer.layerId,
        name: sourceLayer.layerId,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width: rect.width,
        height,
        offsetX: rect.x,
        offsetY: rect.y + row,
        format: sourceLayer.format,
        pixels: chunk,
        ...(sourceLayer.isMask ? { ownerKind: 'layer' as const, ownerId: sourceLayer.layerId } : {})
      } as RasterLayer
      applyColorAdjustmentDirect(document, layer, adjustment, baseline.selection)
    }
    if (row + height < rect.height) await yieldControl()
  }
  return { layerId: sourceLayer.layerId, ...rect, format: sourceLayer.format, localContentBounds: sourceLayer.localContentBounds, pixels: output }
}

export async function processAdjustmentPreview(
  baseline: AdjustmentPreviewBaseline,
  id: number,
  adjustment: ColorAdjustment,
  region: SelectionRect,
  shouldContinue: () => boolean = () => true,
  yieldControl: () => Promise<void> = () => Promise.resolve()
): Promise<AdjustmentPreviewResult | null> {
  setRuntimeAppLocale(baseline.locale)
  const document = createWorkerDocument(baseline)
  const clippedRegion = intersectRect(region, { x: 0, y: 0, width: baseline.documentWidth, height: baseline.documentHeight })
  if (!clippedRegion || !shouldContinue()) return null
  const layers: AdjustmentPreviewResultLayer[] = []
  for (const layer of baseline.layers) {
    const result = await processLayer(document, baseline, layer, adjustment, clippedRegion, shouldContinue, yieldControl)
    if (!shouldContinue()) return null
    if (result) layers.push(result)
  }
  return {
    id,
    region: clippedRegion,
    palette: document.palette.map((entry) => ({ ...entry, color: { ...entry.color } })),
    nextColorId: document.nextColorId,
    layers
  }
}
