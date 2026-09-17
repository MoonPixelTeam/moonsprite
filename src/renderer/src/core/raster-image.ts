import type { SpriteDocument } from '@shared/types-document'
import { createDocument } from './document-model'
import { applyImportedRgbaPalette } from './imported-palette'
import { translateCurrent as tr } from './localization'

export const browserRasterImageExtensions = ['jpg', 'jpeg', 'webp', 'bmp', 'gif'] as const
export const browserThumbnailImageExtensions = ['png', ...browserRasterImageExtensions] as const

export interface RasterImagePreview {
  preview: Uint8Array
  width: number
  height: number
}

export function rasterImageMimeType(filePath: string): string | null {
  const extension = filePath.match(/\.([^./\\]+)$/)?.[1]?.toLowerCase()
  if (!extension || !browserThumbnailImageExtensions.includes(extension as (typeof browserThumbnailImageExtensions)[number])) return null
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  return `image/${extension}`
}

async function canvasPngBlob(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' })
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(tr('core.raster.decoderCanvas'))), 'image/png'))
}

export async function createRasterImagePreview(input: Uint8Array, mimeType: string, maxDimension = 512): Promise<RasterImagePreview> {
  if (typeof createImageBitmap !== 'function') throw new Error(tr('core.raster.unsupportedFormat'))
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(new Blob([new Uint8Array(input)], { type: mimeType }))
  } catch {
    throw new Error(tr('core.raster.readFailed'))
  }
  try {
    if (!bitmap.width || !bitmap.height) throw new Error(tr('core.raster.invalidImageSize'))
    const scale = Math.min(1, Math.max(1, maxDimension) / Math.max(bitmap.width, bitmap.height))
    const previewWidth = Math.max(1, Math.round(bitmap.width * scale))
    const previewHeight = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(previewWidth, previewHeight)
      : Object.assign(document.createElement('canvas'), { width: previewWidth, height: previewHeight })
    const context = canvas.getContext('2d')
    if (!context) throw new Error(tr('core.raster.decoderCanvas'))
    context.imageSmoothingEnabled = false
    context.drawImage(bitmap, 0, 0, previewWidth, previewHeight)
    const blob = await canvasPngBlob(canvas)
    return { preview: new Uint8Array(await blob.arrayBuffer()), width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap?.close()
  }
}

export function documentFromRgbaImage(name: string, width: number, height: number, pixels: Uint8ClampedArray): SpriteDocument {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || pixels.length !== width * height * 4) {
    throw new Error(tr('core.raster.invalidData'))
  }
  const document = createDocument(name, width, height, 'rgba')
  const layer = document.layers[0]
  if (layer.format !== 'rgba') throw new Error(tr('core.raster.createRgba'))
  layer.pixels.set(pixels)
  applyImportedRgbaPalette(document)
  return document
}

export async function decodeBrowserRasterImage(input: Uint8Array, name: string, mimeType: string): Promise<SpriteDocument> {
  if (typeof createImageBitmap !== 'function') throw new Error(tr('core.raster.unsupportedFormat'))
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(new Blob([new Uint8Array(input)], { type: mimeType }))
  } catch {
    throw new Error(tr('core.raster.readFailed'))
  }
  try {
    if (!bitmap.width || !bitmap.height) throw new Error(tr('core.raster.invalidImageSize'))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error(tr('core.raster.decoderCanvas'))
    context.drawImage(bitmap, 0, 0)
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height)
    return documentFromRgbaImage(name, bitmap.width, bitmap.height, image.data)
  } finally {
    bitmap?.close()
  }
}
