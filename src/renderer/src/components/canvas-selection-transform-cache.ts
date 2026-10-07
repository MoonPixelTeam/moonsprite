import type { RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import type { SelectionTransformCompositePreview, SelectionTransformRasterSurface } from './canvas-composite-cache-surfaces'
import { hasEnabledLayerStyles } from '@/core/layer-styles'
import { selectionTransformPreviewRasterPacked } from '@/core/tools-selection-transform-raster'
import { selectionOptimizedRotationEnabled, imageData } from './canvas-composite-cache-surfaces'
import { selectionPreviewRasterKey } from './canvas-composite-cache-geometry'

export type OpaqueSelectionCanvas = { source: SelectionTransformCompositePreview['source']; width: number; height: number; canvas: OffscreenCanvas }
const sharedTransformRasters = new WeakMap<SelectionTransformRasterSurface['source'], SelectionTransformRasterSurface>()

export function selectionTransformRasterFor(document: SpriteDocument, contentRevision: number, selection: SelectionTransformCompositePreview, activeLayer: RasterLayer, cached: SelectionTransformRasterSurface | null): SelectionTransformRasterSurface {
  const key = `${document.id}:${document.animation?.activeFrameId ?? 'static'}:${contentRevision}:${selection.layerId}:${selectionPreviewRasterKey(selection, activeLayer.format)}`
  if (cached && cached.source === selection.source && cached.key === key) return cached
  const shared = sharedTransformRasters.get(selection.source)
  if (shared?.key === key) return shared
  const raster = selectionTransformPreviewRasterPacked(document, selection.source, selection.target, selection.angle, selection.shear, activeLayer, selection.quad, selectionOptimizedRotationEnabled(selection))
  const next = { source: selection.source, key, ...raster }
  sharedTransformRasters.set(selection.source, next)
  return next
}

export function opaqueScaleCanvasFor(selection: SelectionTransformCompositePreview, activeLayer: RasterLayer, cached: OpaqueSelectionCanvas | null): { canvas: OffscreenCanvas; entry: OpaqueSelectionCanvas } | null {
  const source = selection.source
  const sourceSelection = source.selection
  const target = selection.target
  if (source.origin !== 'selection' || sourceSelection.mask || activeLayer.format !== 'rgba' || activeLayer.opacity !== 1 || activeLayer.blendMode !== 'normal' || hasEnabledLayerStyles(activeLayer.layerStyles) || selection.angle % 360 !== 0 || selection.shear || selection.quad || target.flipHorizontal || target.flipVertical || (target.width === sourceSelection.width && target.height === sourceSelection.height) || !Number.isInteger(target.x) || !Number.isInteger(target.y) || !Number.isInteger(target.width) || !Number.isInteger(target.height) || target.width <= 0 || target.height <= 0 || source.values.length !== sourceSelection.width * sourceSelection.height) return null
  if (cached?.source === source && cached.width === sourceSelection.width && cached.height === sourceSelection.height) return { canvas: cached.canvas, entry: cached }
  for (const value of source.values) if ((value >>> 24) !== 0 && (value >>> 24) !== 255) return null
  const canvas = new OffscreenCanvas(sourceSelection.width, sourceSelection.height)
  const pixels = new Uint8ClampedArray(source.values.buffer as ArrayBuffer, source.values.byteOffset, source.values.byteLength)
  canvas.getContext('2d')?.putImageData(imageData(pixels, sourceSelection.width, sourceSelection.height), 0, 0)
  const entry = { source, width: sourceSelection.width, height: sourceSelection.height, canvas }
  return { canvas, entry }
}
