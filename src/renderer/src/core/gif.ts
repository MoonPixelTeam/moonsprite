import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { ensureAnimationDocument, syncActiveAnimationFrame } from './animation'
import { animationLoopFrameIdsForExport } from './animation-loop-sections'
import { compositeAnimationFrame } from './onion-skin'

export type GifDirection = 'forward' | 'reverse' | 'forward-ping-pong' | 'reverse-ping-pong'

export interface GifExportOptions {
  scalePercent: number
  frameStart?: number
  frameEnd?: number
  loopSectionId?: string
  direction: GifDirection
  crop?: SelectionRect
  /** Optional layer to isolate while compositing every animation frame. */
  layerId?: string
}

interface GifFramePixels { pixels: Uint8ClampedArray; duration: number }

export const gifFrameSequence = <T>(frames: readonly T[], direction: GifDirection): T[] => {
  const forward = [...frames]
  const reverse = [...frames].reverse()
  if (direction === 'forward') return forward
  if (direction === 'reverse') return reverse
  if (frames.length <= 1) return forward
  if (direction === 'forward-ping-pong') return [...forward, ...reverse.slice(1, -1)]
  return [...reverse, ...forward.slice(1, -1)]
}

const scalePixels = (source: Uint8ClampedArray, sourceWidth: number, sourceHeight: number, scalePercent: number): { pixels: Uint8ClampedArray; width: number; height: number } => {
  const ratio = Math.max(0.01, Math.min(64, scalePercent / 100))
  const width = Math.max(1, Math.round(sourceWidth * ratio))
  const height = Math.max(1, Math.round(sourceHeight * ratio))
  if (width === sourceWidth && height === sourceHeight) return { pixels: source, width, height }
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sourceX = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / width))
    const sourceY = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / height))
    const sourceOffset = (sourceY * sourceWidth + sourceX) * 4
    pixels.set(source.subarray(sourceOffset, sourceOffset + 4), (y * width + x) * 4)
  }
  return { pixels, width, height }
}

const cropPixels = (source: Uint8ClampedArray, sourceWidth: number, bounds: SelectionRect): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(bounds.width * bounds.height * 4)
  for (let y = 0; y < bounds.height; y += 1) {
    const sourceOffset = ((bounds.y + y) * sourceWidth + bounds.x) * 4
    pixels.set(source.subarray(sourceOffset, sourceOffset + bounds.width * 4), y * bounds.width * 4)
  }
  return pixels
}

const normalizeCrop = (document: SpriteDocument, crop: SelectionRect | undefined): SelectionRect => {
  if (!crop) return { x: 0, y: 0, width: document.width, height: document.height }
  const x = Math.max(0, Math.min(document.width - 1, Math.round(crop.x)))
  const y = Math.max(0, Math.min(document.height - 1, Math.round(crop.y)))
  return {
    x,
    y,
    width: Math.max(1, Math.min(document.width - x, Math.round(crop.width))),
    height: Math.max(1, Math.min(document.height - y, Math.round(crop.height)))
  }
}

const pushU16 = (target: number[], value: number): void => { target.push(value & 0xff, value >>> 8 & 0xff) }
const pushAscii = (target: number[], value: string): void => { for (const character of value) target.push(character.charCodeAt(0)) }

const buildPalette = (frames: readonly GifFramePixels[]): { palette: Uint8Array; indices: Uint8Array[] } => {
  const exact = new Map<number, number>()
  let overflow = false
  for (const frame of frames) for (let offset = 0; offset < frame.pixels.length; offset += 4) {
    if (frame.pixels[offset + 3] < 128) continue
    const key = frame.pixels[offset] << 16 | frame.pixels[offset + 1] << 8 | frame.pixels[offset + 2]
    if (!exact.has(key)) {
      if (exact.size === 255) { overflow = true; break }
      exact.set(key, exact.size + 1)
    }
  }
  const palette = new Uint8Array(256 * 3)
  if (overflow) {
    let index = 1
    for (let r = 0; r < 6; r += 1) for (let g = 0; g < 6; g += 1) for (let b = 0; b < 6; b += 1) {
      palette[index * 3] = r * 51
      palette[index * 3 + 1] = g * 51
      palette[index * 3 + 2] = b * 51
      index += 1
    }
  } else {
    for (const [key, index] of exact) {
      palette[index * 3] = key >>> 16 & 0xff
      palette[index * 3 + 1] = key >>> 8 & 0xff
      palette[index * 3 + 2] = key & 0xff
    }
  }
  const indices = frames.map((frame) => {
    const output = new Uint8Array(frame.pixels.length / 4)
    for (let pixel = 0; pixel < output.length; pixel += 1) {
      const offset = pixel * 4
      if (frame.pixels[offset + 3] < 128) continue
      if (overflow) {
        const r = Math.min(5, Math.round(frame.pixels[offset] / 51))
        const g = Math.min(5, Math.round(frame.pixels[offset + 1] / 51))
        const b = Math.min(5, Math.round(frame.pixels[offset + 2] / 51))
        output[pixel] = 1 + r * 36 + g * 6 + b
      } else {
        const key = frame.pixels[offset] << 16 | frame.pixels[offset + 1] << 8 | frame.pixels[offset + 2]
        output[pixel] = exact.get(key) ?? 0
      }
    }
    return output
  })
  return { palette, indices }
}

const lzwEncode = (indices: Uint8Array): Uint8Array => {
  const clearCode = 256
  const endCode = 257
  let codeSize = 9
  let nextCode = 258
  let dictionary = new Map<string, number>()
  const bytes: number[] = []
  let bitBuffer = 0
  let bitCount = 0
  const writeCode = (code: number): void => {
    bitBuffer |= code << bitCount
    bitCount += codeSize
    while (bitCount >= 8) { bytes.push(bitBuffer & 0xff); bitBuffer >>>= 8; bitCount -= 8 }
  }
  const reset = (): void => { dictionary = new Map(); codeSize = 9; nextCode = 258 }
  writeCode(clearCode)
  if (indices.length === 0) {
    writeCode(endCode)
  } else {
    let prefix = indices[0]
    for (let index = 1; index < indices.length; index += 1) {
      const suffix = indices[index]
      const key = `${prefix},${suffix}`
      const found = dictionary.get(key)
      if (found !== undefined) { prefix = found; continue }
      writeCode(prefix)
      if (nextCode < 4096) {
        dictionary.set(key, nextCode++)
        // The decoder creates this dictionary entry after it reads the next
        // code, so the encoder must cross the bit-width boundary one entry
        // later. Advancing at exactly 512 corrupts every stream long enough
        // to move from 9-bit to 10-bit codes.
        if (nextCode > 1 << codeSize && codeSize < 12) codeSize += 1
      } else {
        writeCode(clearCode)
        reset()
      }
      prefix = suffix
    }
    writeCode(prefix)
    writeCode(endCode)
  }
  if (bitCount > 0) bytes.push(bitBuffer & 0xff)
  return new Uint8Array(bytes)
}

const encodeGif = (frames: readonly GifFramePixels[], width: number, height: number, loop: boolean): Uint8Array => {
  const { palette, indices } = buildPalette(frames)
  const output: number[] = []
  pushAscii(output, 'GIF89a')
  pushU16(output, width); pushU16(output, height)
  output.push(0xf7, 0, 0)
  output.push(...palette)
  if (loop) output.push(0x21, 0xff, 0x0b, ...new TextEncoder().encode('NETSCAPE2.0'), 0x03, 0x01, 0x00, 0x00, 0x00)
  frames.forEach((frame, frameIndex) => {
    const delay = Math.max(1, Math.min(65535, Math.round(frame.duration / 10)))
    output.push(0x21, 0xf9, 0x04, 0x09)
    pushU16(output, delay)
    output.push(0, 0)
    output.push(0x2c); pushU16(output, 0); pushU16(output, 0); pushU16(output, width); pushU16(output, height); output.push(0)
    output.push(8)
    const compressed = lzwEncode(indices[frameIndex])
    for (let offset = 0; offset < compressed.length; offset += 255) {
      const block = compressed.subarray(offset, offset + 255)
      output.push(block.length, ...block)
    }
    output.push(0)
  })
  output.push(0x3b)
  return new Uint8Array(output)
}

export const exportAnimationGif = (document: SpriteDocument, options: GifExportOptions): { bytes: Uint8Array; width: number; height: number; frameCount: number } => {
  syncActiveAnimationFrame(document)
  const timeline = ensureAnimationDocument(document)
  const crop = normalizeCrop(document, options.crop)
  const loopSection = options.loopSectionId ? (timeline.loopSections ?? []).find((section) => section.id === options.loopSectionId) : undefined
  const loopStart = loopSection ? timeline.frames.findIndex((frame) => frame.id === loopSection.startFrameId) : -1
  const loopEnd = loopSection ? timeline.frames.findIndex((frame) => frame.id === loopSection.endFrameId) : -1
  const hasValidLoopSection = loopStart >= 0 && loopEnd >= 0
  const start = hasValidLoopSection
    ? Math.min(loopStart, loopEnd)
    : Math.max(0, Math.min(timeline.frames.length - 1, Math.round(options.frameStart ?? 1) - 1))
  const end = hasValidLoopSection
    ? Math.max(loopStart, loopEnd)
    : Math.max(start, Math.min(timeline.frames.length - 1, Math.round(options.frameEnd ?? timeline.frames.length) - 1))
  const selectedFrameIds = animationLoopFrameIdsForExport(timeline, start, end, hasValidLoopSection ? loopSection?.id : undefined)
  const selected = selectedFrameIds.map((frameId) => {
    const frame = timeline.frames.find((candidate) => candidate.id === frameId)
    if (!frame) return null
    const composite = compositeAnimationFrame(document, frame.id, options.layerId)
    const pixels = crop.x === 0 && crop.y === 0 && crop.width === document.width && crop.height === document.height
      ? composite
      : cropPixels(composite, document.width, crop)
    return { frame, pixels }
  }).filter((frame): frame is { frame: typeof timeline.frames[number]; pixels: Uint8ClampedArray } => frame !== null)
  const ordered = gifFrameSequence(selected, options.direction)
  const scaled = ordered.map(({ frame, pixels }) => ({ ...scalePixels(pixels, crop.width, crop.height, options.scalePercent), duration: frame.duration }))
  const width = scaled[0]?.width ?? Math.max(1, crop.width)
  const height = scaled[0]?.height ?? Math.max(1, crop.height)
  const frames = scaled.map(({ pixels, duration }) => ({ pixels, duration }))
  const loop = hasValidLoopSection ? loopSection?.repeatCount === null : timeline.loop
  return { bytes: encodeGif(frames, width, height, loop), width, height, frameCount: frames.length }
}
