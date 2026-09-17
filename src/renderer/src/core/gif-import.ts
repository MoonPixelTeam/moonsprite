import type { SpriteDocument } from '@shared/types-document'
import { decompressFrames, parseGIF, type ParsedFrame, type ParsedGif } from 'gifuct-js'
import { DEFAULT_FRAME_DURATION, MAX_ANIMATION_FRAME_DURATION } from './animation'
import { createDocument, createId } from './document-model'
import { applyImportedRgbaPalette } from './imported-palette'
import { translateCurrent as tr } from './localization'

export interface GifPatchFrame {
  dims: {
    left: number
    top: number
    width: number
    height: number
  }
  patch: Uint8ClampedArray
  delay?: number
  disposalType?: number
}

export interface DecodedGifFrame {
  pixels: Uint8ClampedArray
  duration: number
}

const validDimension = (value: number): boolean => Number.isSafeInteger(value) && value > 0

const normalizedFrameDuration = (delay: number | undefined): number => {
  if (!Number.isFinite(delay)) return DEFAULT_FRAME_DURATION
  return Math.max(1, Math.min(MAX_ANIMATION_FRAME_DURATION, Math.trunc(Number(delay))))
}

const clippedPatchBounds = (width: number, height: number, frame: GifPatchFrame): { left: number; top: number; right: number; bottom: number } => ({
  left: Math.max(0, frame.dims.left),
  top: Math.max(0, frame.dims.top),
  right: Math.min(width, frame.dims.left + frame.dims.width),
  bottom: Math.min(height, frame.dims.top + frame.dims.height)
})

const validatePatchFrame = (frame: GifPatchFrame): void => {
  const { left, top, width, height } = frame.dims
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(top) || !validDimension(width) || !validDimension(height) || frame.patch.length !== width * height * 4) {
    throw new Error(tr('core.raster.invalidData'))
  }
}

const drawPatch = (canvas: Uint8ClampedArray, canvasWidth: number, canvasHeight: number, frame: GifPatchFrame): void => {
  const bounds = clippedPatchBounds(canvasWidth, canvasHeight, frame)
  for (let y = bounds.top; y < bounds.bottom; y += 1) for (let x = bounds.left; x < bounds.right; x += 1) {
    const sourceX = x - frame.dims.left
    const sourceY = y - frame.dims.top
    const sourceOffset = (sourceY * frame.dims.width + sourceX) * 4
    if (frame.patch[sourceOffset + 3] === 0) continue
    canvas.set(frame.patch.subarray(sourceOffset, sourceOffset + 4), (y * canvasWidth + x) * 4)
  }
}

const clearPatch = (canvas: Uint8ClampedArray, canvasWidth: number, canvasHeight: number, frame: GifPatchFrame): void => {
  const bounds = clippedPatchBounds(canvasWidth, canvasHeight, frame)
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    canvas.fill(0, (y * canvasWidth + bounds.left) * 4, (y * canvasWidth + bounds.right) * 4)
  }
}

export function compositeGifFrames(width: number, height: number, frames: readonly GifPatchFrame[]): DecodedGifFrame[] {
  if (!validDimension(width) || !validDimension(height) || frames.length === 0) throw new Error(tr('core.raster.invalidData'))
  let canvas = new Uint8ClampedArray(width * height * 4)
  const result: DecodedGifFrame[] = []
  for (const frame of frames) {
    validatePatchFrame(frame)
    const restorePrevious = frame.disposalType === 3 ? new Uint8ClampedArray(canvas) : null
    drawPatch(canvas, width, height, frame)
    result.push({ pixels: new Uint8ClampedArray(canvas), duration: normalizedFrameDuration(frame.delay) })
    if (frame.disposalType === 2) clearPatch(canvas, width, height, frame)
    else if (restorePrevious) canvas = restorePrevious
  }
  return result
}

const parsedGifLoops = (gif: ParsedGif): boolean => gif.frames.some((frame) => {
  if (!('application' in frame)) return false
  const id = frame.application.id.toUpperCase()
  return id === 'NETSCAPE2.0' || id === 'ANIMEXTS1.0'
})

export function documentFromGifFrames(name: string, width: number, height: number, frames: readonly DecodedGifFrame[], loop: boolean): SpriteDocument {
  if (!validDimension(width) || !validDimension(height) || frames.length === 0 || frames.some((frame) => frame.pixels.length !== width * height * 4)) {
    throw new Error(tr('core.raster.invalidData'))
  }
  const document = createDocument(name, width, height, 'rgba')
  const layer = document.layers[0]
  if (layer.format !== 'rgba') throw new Error(tr('core.raster.createRgba'))
  const animationFrames = frames.map((frame, index) => ({ id: `frame-${index + 1}`, duration: normalizedFrameDuration(frame.duration) }))
  const cels = frames.map((frame, index) => ({
    id: createId('cel'),
    layerId: layer.id,
    frameId: animationFrames[index].id,
    opacity: layer.opacity,
    surface: {
      format: 'rgba' as const,
      width,
      height,
      offsetX: 0,
      offsetY: 0,
      pixels: frame.pixels
    }
  }))
  document.animation = {
    frames: animationFrames,
    cels,
    groupMasks: [],
    loopSections: [],
    activeFrameId: animationFrames[0].id,
    loop
  }
  layer.pixels = frames[0].pixels
  applyImportedRgbaPalette(document)
  return document
}

export function decodeGifAnimation(input: Uint8Array, name: string): SpriteDocument {
  let parsed: ParsedGif
  try {
    parsed = parseGIF(input.slice().buffer)
  } catch {
    throw new Error(tr('core.raster.readFailed'))
  }
  const { width, height } = parsed.lsd
  if (!validDimension(width) || !validDimension(height)) throw new Error(tr('core.raster.invalidImageSize'))
  let patches: ParsedFrame[]
  try {
    patches = decompressFrames(parsed, true)
  } catch {
    throw new Error(tr('core.raster.readFailed'))
  }
  return documentFromGifFrames(name, width, height, compositeGifFrames(width, height, patches), parsedGifLoops(parsed))
}
