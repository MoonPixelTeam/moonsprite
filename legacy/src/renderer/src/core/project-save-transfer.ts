import type { SpriteDocument } from '@shared/types-document'
import { prepareRuntimeRasterDocumentForTransfer, shareRasterSurface } from './runtime-raster'
import type { RuntimeRasterTiles } from '@shared/types-raster'

type RasterPixels = Uint8ClampedArray | Uint32Array

/** Copy surface wrappers only; postMessage takes the sole pixel snapshot.
 * Preparing the live document would remove its lazy accessors. Preparing these
 * wrappers keeps sparse storage sparse, and drops stale tiles for dense edits.
 */
export const projectDocumentForWorkerTransfer = (document: SpriteDocument): SpriteDocument => {
  const transfer: SpriteDocument = {
    ...document,
    layers: document.layers.map(layer => shareRasterSurface(layer)),
    ...(document.animation ? {
      animation: {
        ...document.animation,
        cels: document.animation.cels.map(cel => ({
          ...cel,
          ...(cel.surface ? { surface: shareRasterSurface(cel.surface) } : {})
        })),
        ...(document.animation.layerMasks ? { layerMasks: document.animation.layerMasks.map(entry => ({ ...entry, mask: shareRasterSurface(entry.mask) })) } : {}),
        ...(document.animation.groupMasks ? { groupMasks: document.animation.groupMasks.map(entry => ({ ...entry, mask: shareRasterSurface(entry.mask) })) } : {})
      }
    } : {})
  }
  prepareRuntimeRasterDocumentForTransfer(transfer)
  return transfer
}

/**
 * Make the already detached save snapshot safe to transfer. The live document
 * and its cel links remain untouched; only the wrapper's pixel buffers are
 * copied, then ownership of those copies moves to the encode worker.
 */
export const projectDocumentTransferables = (document: SpriteDocument): Transferable[] => {
  const bufferCopies = new Map<ArrayBuffer, ArrayBuffer>()
  const pixelCopies = new Map<object, RasterPixels>()
  const runtimeCopies = new Map<RuntimeRasterTiles, RuntimeRasterTiles>()
  const transferables: ArrayBuffer[] = []
  const transferred = new Set<ArrayBuffer>()
  const copyBuffer = (buffer: ArrayBuffer): ArrayBuffer => {
    const existing = bufferCopies.get(buffer)
    if (existing) return existing
    const copy = buffer.slice(0)
    bufferCopies.set(buffer, copy)
    if (!transferred.has(copy)) {
      transferred.add(copy)
      transferables.push(copy)
    }
    return copy
  }
  const copyPixels = (pixels: RasterPixels): RasterPixels => {
    const existing = pixelCopies.get(pixels)
    if (existing) return existing
    const buffer = copyBuffer(pixels.buffer as ArrayBuffer)
    const copy = pixels instanceof Uint8ClampedArray
      ? new Uint8ClampedArray(buffer, pixels.byteOffset, pixels.length)
      : new Uint32Array(buffer, pixels.byteOffset, pixels.length)
    pixelCopies.set(pixels, copy)
    return copy
  }
  const copyRuntime = (runtime: RuntimeRasterTiles): RuntimeRasterTiles => {
    const existing = runtimeCopies.get(runtime)
    if (existing) return existing
    const copy: RuntimeRasterTiles = {
      ...runtime,
      data: new Uint8Array(copyBuffer(runtime.data.buffer as ArrayBuffer), runtime.data.byteOffset, runtime.data.length),
      tileOffsets: new Int32Array(copyBuffer(runtime.tileOffsets.buffer as ArrayBuffer), runtime.tileOffsets.byteOffset, runtime.tileOffsets.length)
    }
    runtimeCopies.set(runtime, copy)
    return copy
  }
  const copySurface = (surface: { pixels: RasterPixels; runtimeRaster?: RuntimeRasterTiles }): void => {
    if (surface.runtimeRaster) surface.runtimeRaster = copyRuntime(surface.runtimeRaster)
    surface.pixels = copyPixels(surface.pixels)
  }
  for (const layer of document.layers) copySurface(layer)
  for (const cel of document.animation?.cels ?? []) if (cel.surface) copySurface(cel.surface)
  for (const entry of document.animation?.layerMasks ?? []) copySurface(entry.mask)
  for (const entry of document.animation?.groupMasks ?? []) copySurface(entry.mask)
  return transferables
}
