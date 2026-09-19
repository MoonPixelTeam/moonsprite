import type { AnimationCelSurface } from '@shared/types-animation'
import type { LayerMask } from '@shared/types-layer'
import type { PaletteEntry } from '@shared/types-color'
import { rasterContentBounds } from './document-model'
import { readSurfacePackedLocal } from './runtime-raster'

export interface AnimationThumbnailRect { x: number; y: number; width: number; height: number }

export interface AnimationCelThumbnailLayout {
  canvas: AnimationThumbnailRect
  surface: AnimationThumbnailRect
  content: AnimationThumbnailRect
}

const thumbnailBackground = { r: 201, g: 206, b: 214 }
const thumbnailChecker = { r: 143, g: 150, b: 161 }

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value))

const fillThumbnailBackground = (pixels: Uint8ClampedArray, size: number): void => {
  const checkerSize = Math.max(2, Math.round(size / 8))
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const checker = Math.floor(x / checkerSize) + Math.floor(y / checkerSize)
    const color = checker % 2 === 0 ? thumbnailChecker : thumbnailBackground
    const index = (y * size + x) * 4
    pixels[index] = color.r
    pixels[index + 1] = color.g
    pixels[index + 2] = color.b
    pixels[index + 3] = 255
  }
}

const blendThumbnailPixel = (pixels: Uint8ClampedArray, index: number, r: number, g: number, b: number, alpha: number): void => {
  const sourceAlpha = clampUnit(alpha)
  if (sourceAlpha <= 0) return
  if (sourceAlpha >= 1) {
    pixels[index] = r
    pixels[index + 1] = g
    pixels[index + 2] = b
    pixels[index + 3] = 255
    return
  }
  const inverse = 1 - sourceAlpha
  pixels[index] = Math.round(r * sourceAlpha + pixels[index] * inverse)
  pixels[index + 1] = Math.round(g * sourceAlpha + pixels[index + 1] * inverse)
  pixels[index + 2] = Math.round(b * sourceAlpha + pixels[index + 2] * inverse)
  pixels[index + 3] = 255
}

/** Quantize pixel-art preview scale so every source pixel gets the same size. */
export const pixelPerfectThumbnailScale = (scale: number): number => {
  if (!Number.isFinite(scale) || scale <= 0) return 1
  return scale >= 1 ? Math.max(1, Math.floor(scale)) : 1 / Math.ceil(1 / scale)
}

export const animationCelContentBounds = (
  surface: AnimationCelSurface,
  palette: readonly PaletteEntry[] = []
): AnimationThumbnailRect | null => rasterContentBounds(surface, palette)

/** Fits document-space cel geometry into a square thumbnail without cropping to painted pixels. */
export const animationCelThumbnailLayout = (
  documentWidth: number,
  documentHeight: number,
  thumbnailSize: number,
  surface: AnimationCelSurface,
  contentBounds: AnimationThumbnailRect | null = null
): AnimationCelThumbnailLayout => {
  const safeWidth = Math.max(1, documentWidth)
  const safeHeight = Math.max(1, documentHeight)
  const safeSize = Math.max(1, thumbnailSize)
  const fitScale = Math.min(safeSize / safeWidth, safeSize / safeHeight)
  const contentPadding = Math.min(6, Math.max(2, safeSize / 10))
  const contentScale = contentBounds
    ? Math.min((safeSize - contentPadding * 2) / Math.max(1, contentBounds.width), (safeSize - contentPadding * 2) / Math.max(1, contentBounds.height))
    : fitScale
  const scale = pixelPerfectThumbnailScale(Math.max(fitScale, contentScale))
  const centerX = contentBounds ? surface.offsetX + contentBounds.x + contentBounds.width / 2 : safeWidth / 2
  const centerY = contentBounds ? surface.offsetY + contentBounds.y + contentBounds.height / 2 : safeHeight / 2
  const canvas = {
    x: safeSize / 2 - centerX * scale,
    y: safeSize / 2 - centerY * scale,
    width: safeWidth * scale,
    height: safeHeight * scale
  }
  const surfaceRect = {
    x: canvas.x + surface.offsetX * scale,
    y: canvas.y + surface.offsetY * scale,
    width: surface.width * scale,
    height: surface.height * scale
  }
  const content = contentBounds ? {
    x: surfaceRect.x + contentBounds.x * scale,
    y: surfaceRect.y + contentBounds.y * scale,
    width: contentBounds.width * scale,
    height: contentBounds.height * scale
  } : { ...canvas }
  return {
    canvas,
    surface: surfaceRect,
    content
  }
}

/**
 * Render a cel into a fixed-size thumbnail without allocating a source canvas.
 * Sampling the final pixels keeps enlarged layer views reliable for large and
 * offset cels, where an intermediate browser canvas can fail or be clipped.
 */
export const renderAnimationCelThumbnailPixels = (
  documentWidth: number,
  documentHeight: number,
  thumbnailSize: number,
  surface: AnimationCelSurface,
  palette: readonly PaletteEntry[] = [],
  opacity = 1,
  transparentBackground = false
): Uint8ClampedArray => {
  const size = Math.max(1, Math.trunc(thumbnailSize))
  const output = new Uint8ClampedArray(size * size * 4)
  if (!transparentBackground) fillThumbnailBackground(output, size)

  const width = Math.trunc(surface.width)
  const height = Math.trunc(surface.height)
  const expectedPixels = surface.format === 'rgba' ? width * height * 4 : width * height
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || !Number.isSafeInteger(expectedPixels)) return output

  const contentBounds = animationCelContentBounds(surface, palette)
  const layout = animationCelThumbnailLayout(documentWidth, documentHeight, size, surface, contentBounds)
  const scale = layout.canvas.width / Math.max(1, documentWidth)
  if (!Number.isFinite(scale) || scale <= 0) return output
  const paletteById = new Map(palette.map((entry) => [entry.id, entry.color]))
  const celOpacity = clampUnit(Number.isFinite(opacity) ? opacity : 1)
  const offsetX = Math.trunc(surface.offsetX)
  const offsetY = Math.trunc(surface.offsetY)
  const canvasWidth = Math.max(1, Math.trunc(documentWidth))
  const canvasHeight = Math.max(1, Math.trunc(documentHeight))

  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const canvasX = (x + 0.5 - layout.canvas.x) / scale
    const canvasY = (y + 0.5 - layout.canvas.y) / scale
    if (canvasX < 0 || canvasY < 0 || canvasX >= canvasWidth || canvasY >= canvasHeight) continue
    const sourceX = Math.floor(canvasX - offsetX)
    const sourceY = Math.floor(canvasY - offsetY)
    if (sourceX < 0 || sourceY < 0 || sourceX >= width || sourceY >= height) continue

    let r = 0
    let g = 0
    let b = 0
    let alpha = 0
    const packed = readSurfacePackedLocal(surface, sourceX, sourceY)
    if (surface.format === 'rgba') {
      r = packed & 0xff
      g = (packed >>> 8) & 0xff
      b = (packed >>> 16) & 0xff
      alpha = (packed >>> 24) / 255
    } else {
      const color = paletteById.get(packed)
      if (color) {
        r = color.r
        g = color.g
        b = color.b
        alpha = color.a / 255
      }
    }
    const targetIndex = (y * size + x) * 4
    if (transparentBackground) {
      output[targetIndex] = r
      output[targetIndex + 1] = g
      output[targetIndex + 2] = b
      output[targetIndex + 3] = Math.round(alpha * celOpacity * 255)
    } else blendThumbnailPixel(output, targetIndex, r, g, b, alpha * celOpacity)
  }
  return output
}

/** Render the complete cel mask into a white-backed grayscale thumbnail. */
export const renderLayerMaskThumbnailPixels = (
  documentWidth: number,
  documentHeight: number,
  thumbnailWidth: number,
  thumbnailHeight: number,
  mask: LayerMask
): Uint8ClampedArray => {
  const outputWidth = Math.max(1, Math.trunc(thumbnailWidth))
  const outputHeight = Math.max(1, Math.trunc(thumbnailHeight))
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4)
  for (let index = 0; index < output.length; index += 4) {
    output[index] = 255
    output[index + 1] = 255
    output[index + 2] = 255
    output[index + 3] = 255
  }

  const canvasWidth = Math.max(1, Math.trunc(documentWidth))
  const canvasHeight = Math.max(1, Math.trunc(documentHeight))
  const maskWidth = Math.max(1, Math.trunc(mask.width))
  const maskHeight = Math.max(1, Math.trunc(mask.height))
  if (mask.pixels.length < maskWidth * maskHeight * 4) return output

  const scale = Math.min(outputWidth / canvasWidth, outputHeight / canvasHeight)
  if (!Number.isFinite(scale) || scale <= 0) return output
  const renderedWidth = canvasWidth * scale
  const renderedHeight = canvasHeight * scale
  const originX = (outputWidth - renderedWidth) / 2
  const originY = (outputHeight - renderedHeight) / 2
  const maskOffsetX = Math.trunc(mask.offsetX)
  const maskOffsetY = Math.trunc(mask.offsetY)

  for (let y = 0; y < outputHeight; y += 1) for (let x = 0; x < outputWidth; x += 1) {
    const canvasX = (x + 0.5 - originX) / scale
    const canvasY = (y + 0.5 - originY) / scale
    if (canvasX < 0 || canvasY < 0 || canvasX >= canvasWidth || canvasY >= canvasHeight) continue
    const sourceX = Math.floor(canvasX - maskOffsetX)
    const sourceY = Math.floor(canvasY - maskOffsetY)
    if (sourceX < 0 || sourceY < 0 || sourceX >= maskWidth || sourceY >= maskHeight) continue
    const sourceIndex = (sourceY * maskWidth + sourceX) * 4
    const alpha = mask.pixels[sourceIndex + 3] / 255
    if (alpha <= 0) continue
    const gray = Math.round((mask.pixels[sourceIndex] + mask.pixels[sourceIndex + 1] + mask.pixels[sourceIndex + 2]) / 3)
    const value = Math.round(gray * alpha + 255 * (1 - alpha))
    const targetIndex = (y * outputWidth + x) * 4
    output[targetIndex] = value
    output[targetIndex + 1] = value
    output[targetIndex + 2] = value
  }
  return output
}
