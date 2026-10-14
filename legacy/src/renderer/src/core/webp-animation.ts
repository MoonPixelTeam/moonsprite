import type { SpriteDocument } from '@shared/types-document'
import { exportAnimationGif, prepareAnimationExport, type GifExportOptions } from './gif'

const tag = (bytes: Uint8Array, offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
const uint24 = (bytes: Uint8Array, offset: number, value: number) => {
  bytes[offset] = value & 255
  bytes[offset + 1] = value >>> 8 & 255
  bytes[offset + 2] = value >>> 16 & 255
}
const join = (parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.length }
  return result
}
const chunk = (name: string, payload: Uint8Array) => {
  const bytes = new Uint8Array(8 + payload.length + (payload.length & 1))
  bytes.set(new TextEncoder().encode(name))
  new DataView(bytes.buffer).setUint32(4, payload.length, true)
  bytes.set(payload, 8)
  return bytes
}

/** Extract only image chunks; per-frame VP8X/metadata do not belong inside ANMF. */
function frameChunks(bytes: Uint8Array): Uint8Array {
  if (tag(bytes, 0) !== 'RIFF' || tag(bytes, 8) !== 'WEBP') throw new Error('WebP encoder returned an unsupported image format.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(4, true) + 8 !== bytes.length) throw new Error('Invalid WebP size.')
  const parts: Uint8Array[] = []
  let images = 0
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const name = tag(bytes, offset)
    const size = view.getUint32(offset + 4, true)
    const end = offset + 8 + size + (size & 1)
    if (end > bytes.length) throw new Error('Truncated WebP frame.')
    if (name === 'VP8 ' || name === 'VP8L') images++
    if (name === 'VP8 ' || name === 'VP8L' || name === 'ALPH') parts.push(bytes.slice(offset, end))
    offset = end
  }
  if (images !== 1 || offset !== bytes.length) throw new Error('Invalid WebP frame chunks.')
  return join(parts)
}

export function encodeAnimatedWebp(frames: Array<{ bytes: Uint8Array; duration: number }>, width: number, height: number, loop: boolean): Uint8Array {
  if (!frames.length || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 16383 || height > 16383) throw new Error('Invalid WebP animation dimensions or frame count.')
  const header = new Uint8Array(10)
  header[0] = 0x12 // Animation and alpha; full-frame replacement preserves transparent pixels.
  uint24(header, 4, width - 1)
  uint24(header, 7, height - 1)
  const animation = new Uint8Array(6)
  new DataView(animation.buffer).setUint16(4, loop ? 0 : 1, true)
  const parts = [chunk('VP8X', header), chunk('ANIM', animation)]
  for (const frame of frames) {
    if (!Number.isFinite(frame.duration) || frame.duration < 1 || frame.duration > 0xffffff) throw new Error('WebP frame duration is out of range.')
    const frameHeader = new Uint8Array(16)
    uint24(frameHeader, 6, width - 1)
    uint24(frameHeader, 9, height - 1)
    uint24(frameHeader, 12, Math.round(frame.duration))
    frameHeader[15] = 2 // No blending: each full frame replaces the previous frame.
    parts.push(chunk('ANMF', join([frameHeader, frameChunks(frame.bytes)])))
  }
  const body = join([new TextEncoder().encode('WEBP'), ...parts])
  if (body.length > 0xffffffff) throw new Error('WebP animation is too large.')
  return chunk('RIFF', body)
}

export async function exportAnimatedImage(document: SpriteDocument, options: GifExportOptions, format: 'gif' | 'webp') {
  if (format === 'gif') return { ...exportAnimationGif(document, options), extension: format, indexed: false }
  const { frames, width, height, loop } = prepareAnimationExport(document, options)
  if (width > 16383 || height > 16383) throw new Error('WebP supports dimensions up to 16383 pixels.')
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Cannot create WebP encoding canvas.')
  const encoded: Array<{ bytes: Uint8Array; duration: number }> = []
  for (const frame of frames) {
    context.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), width, height), 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.92 })
    encoded.push({ bytes: new Uint8Array(await blob.arrayBuffer()), duration: frame.duration })
  }
  const bytes = encodeAnimatedWebp(encoded, width, height, loop)
  return { bytes, width, height, frameCount: frames.length, extension: format, indexed: false }
}
