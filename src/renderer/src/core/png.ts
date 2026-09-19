import { decode, toRGBA8 } from 'upng-js'
import type { DocumentSlice, SpriteDocument } from '@shared/types-document'
import type { PaletteEntry } from '@shared/types-color'
import type { SelectionMask } from '@shared/types-selection'
import { encodeAseprite } from './aseprite'
import { createDocument } from './document-model'
import { compositeDocument } from './document-composite'
import { TRANSPARENT } from './raster'
import { translateCurrent as tr } from './localization'
import { applyImportedRgbaPalette, normalizeImportedIndexedPalette } from './imported-palette'
import { encodePng, type PngExport } from './png-encode'
import { encodeIco } from './ico'
import { encodeBmp } from './bmp'
import { encodePsd } from './psd'
import { selectionContains } from './selection'

export { encodePng, type PngExport } from './png-encode'

export type ImageExportKind = 'png-auto' | 'png-rgba' | 'jpeg' | 'webp' | 'svg' | 'gif' | 'bmp' | 'ico' | 'psd' | 'ase' | 'aseprite'
export type SaveImageKind = Exclude<ImageExportKind, 'gif'>
export interface ImageExport {
  bytes: Uint8Array
  extension: 'png' | 'jpg' | 'webp' | 'svg' | 'bmp' | 'ico' | 'psd' | 'ase' | 'aseprite'
  indexed: boolean
  width: number
  height: number
}

const unpackIndexedSamples = (bytes: Uint8Array, depth: number, count: number): Uint8Array => {
  if (depth === 8) return bytes.slice(0, count)
  const output = new Uint8Array(count)
  const mask = (1 << depth) - 1
  for (let index = 0; index < count; index += 1) {
    const byte = bytes[Math.floor((index * depth) / 8)]
    const shift = 8 - depth - ((index * depth) % 8)
    output[index] = (byte >>> shift) & mask
  }
  return output
}

export function decodePng(input: Uint8Array, fallbackName = tr('core.document.importedImage')): SpriteDocument {
  let image
  try {
    image = decode(new Uint8Array(input).buffer)
  } catch {
    throw new Error(tr('core.png.readFailed'))
  }
  if (!image.width || !image.height) throw new Error(tr('core.png.invalidSize'))
  if (image.ctype === 3 && image.tabs.PLTE) {
    const document = createDocument(fallbackName, image.width, image.height, 'indexed')
    const layer = document.layers[0]
    if (layer.format !== 'indexed') throw new Error(tr('core.png.createIndexed'))
    const paletteValues = image.tabs.PLTE
    const transparencyValues = image.tabs.tRNS
    const transparency = Array.isArray(transparencyValues) ? new Uint8Array(transparencyValues) : new Uint8Array()
    const palette: PaletteEntry[] = [{ id: 0, name: tr('core.document.transparentColor'), color: TRANSPARENT }]
    const paletteLookup: number[] = []
    for (let offset = 0, colorIndex = 0; offset < paletteValues.length; offset += 3, colorIndex += 1) {
      const alpha = Number(transparency[colorIndex] ?? 255)
      if (alpha === 0) {
        paletteLookup[colorIndex] = 0
      } else {
        const id = palette.length
        paletteLookup[colorIndex] = id
        palette.push({ id, name: tr('core.document.colorName', { id }), color: { r: paletteValues[offset], g: paletteValues[offset + 1], b: paletteValues[offset + 2], a: alpha } })
      }
    }
    const samples = unpackIndexedSamples(new Uint8Array(image.data), image.depth, image.width * image.height)
    for (let index = 0; index < layer.pixels.length; index += 1) layer.pixels[index] = paletteLookup[samples[index]] ?? 0
    document.palette = palette
    normalizeImportedIndexedPalette(document)
    return document
  }
  const rgba = new Uint8ClampedArray(toRGBA8(image)[0])
  const document = createDocument(fallbackName, image.width, image.height, 'rgba')
  const layer = document.layers[0]
  if (layer.format !== 'rgba') throw new Error(tr('core.png.createRgba'))
  layer.pixels.set(rgba)
  applyImportedRgbaPalette(document)
  return document
}

export function exportDocumentPng(document: SpriteDocument, scale = 1, forceRgba = false): PngExport {
  const source = compositeDocument(document)
  if (scale === 1) return encodePng(source, document.width, document.height, forceRgba)
  const width = document.width * scale
  const height = document.height * scale
  const output = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.floor(y / scale)
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (sourceY * document.width + Math.floor(x / scale)) * 4
      output.set(source.subarray(sourceOffset, sourceOffset + 4), (y * width + x) * 4)
    }
  }
  return encodePng(output, width, height, forceRgba)
}

function scaleDocumentPixels(document: SpriteDocument, scalePercent: number): { pixels: Uint8ClampedArray; width: number; height: number } {
  const source = compositeDocument(document)
  const ratio = Math.max(0.01, Math.min(64, scalePercent / 100))
  const width = Math.max(1, Math.round(document.width * ratio))
  const height = Math.max(1, Math.round(document.height * ratio))
  if (width === document.width && height === document.height) return { pixels: source, width, height }
  const output = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(document.height - 1, Math.floor(y * document.height / height))
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(document.width - 1, Math.floor(x * document.width / width))
      const sourceOffset = (sourceY * document.width + sourceX) * 4
      output.set(source.subarray(sourceOffset, sourceOffset + 4), (y * width + x) * 4)
    }
  }
  return { pixels: output, width, height }
}

function scalePixels(source: Uint8ClampedArray, sourceWidth: number, sourceHeight: number, scalePercent: number): { pixels: Uint8ClampedArray; width: number; height: number } {
  const ratio = Math.max(0.01, Math.min(64, scalePercent / 100))
  const width = Math.max(1, Math.round(sourceWidth * ratio))
  const height = Math.max(1, Math.round(sourceHeight * ratio))
  if (width === sourceWidth && height === sourceHeight) return { pixels: source, width, height }
  const output = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / height))
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / width))
      const offset = (sourceY * sourceWidth + sourceX) * 4
      output.set(source.subarray(offset, offset + 4), (y * width + x) * 4)
    }
  }
  return { pixels: output, width, height }
}

async function encodeScaledPixels(scaled: { pixels: Uint8ClampedArray; width: number; height: number }, format: Exclude<SaveImageKind, 'ase' | 'aseprite' | 'psd'>): Promise<ImageExport> {
  if (format === 'svg') return { bytes: encodeSvg(scaled.pixels, scaled.width, scaled.height), extension: 'svg', indexed: false, width: scaled.width, height: scaled.height }
  if (format === 'ico') {
    const ico = encodeIco(scaled.pixels, scaled.width, scaled.height)
    return { bytes: ico.bytes, extension: 'ico', indexed: false, width: ico.width, height: ico.height }
  }
  if (format === 'bmp') return { bytes: encodeBmp(scaled.pixels, scaled.width, scaled.height), extension: 'bmp', indexed: false, width: scaled.width, height: scaled.height }
  if (format === 'png-auto' || format === 'png-rgba') {
    const png = encodePng(scaled.pixels, scaled.width, scaled.height, format === 'png-rgba')
    return { ...png, extension: 'png', width: scaled.width, height: scaled.height }
  }
  const canvas = new OffscreenCanvas(scaled.width, scaled.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error(tr('core.png.encoderCanvas'))
  if (format === 'jpeg') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, scaled.width, scaled.height) }
  context.putImageData(new ImageData(new Uint8ClampedArray(scaled.pixels), scaled.width, scaled.height), 0, 0)
  const blob = await canvas.convertToBlob({ type: format === 'jpeg' ? 'image/jpeg' : 'image/webp', quality: 0.92 })
  return { bytes: new Uint8Array(await blob.arrayBuffer()), extension: format === 'jpeg' ? 'jpg' : 'webp', indexed: false, width: scaled.width, height: scaled.height }
}

function encodeSvg(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`
  ]
  for (let y = 0; y < height; y += 1) {
    let x = 0
    while (x < width) {
      const offset = (y * width + x) * 4
      const alpha = rgba[offset + 3]
      if (alpha === 0) {
        x += 1
        continue
      }
      const red = rgba[offset]
      const green = rgba[offset + 1]
      const blue = rgba[offset + 2]
      let runWidth = 1
      while (x + runWidth < width) {
        const runOffset = (y * width + x + runWidth) * 4
        if (rgba[runOffset] !== red || rgba[runOffset + 1] !== green || rgba[runOffset + 2] !== blue || rgba[runOffset + 3] !== alpha) break
        runWidth += 1
      }
      const color = `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`
      const opacity = alpha < 255 ? ` fill-opacity="${(alpha / 255).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}"` : ''
      parts.push(`<path d="M${x} ${y}h${runWidth}v1H${x}z" fill="${color}"${opacity}/>`)
      x += runWidth
    }
  }
  parts.push('</svg>')
  return new TextEncoder().encode(parts.join(''))
}

export async function exportDocumentImage(document: SpriteDocument, scalePercent: number, format: SaveImageKind): Promise<ImageExport> {
  if (format === 'psd') {
    return { bytes: encodePsd(document, scalePercent), extension: 'psd', indexed: false, width: Math.max(1, Math.round(document.width * scalePercent / 100)), height: Math.max(1, Math.round(document.height * scalePercent / 100)) }
  }
  if (format === 'ase' || format === 'aseprite') {
    return { bytes: encodeAseprite(document, scalePercent), extension: format, indexed: false, width: Math.max(1, Math.round(document.width * scalePercent / 100)), height: Math.max(1, Math.round(document.height * scalePercent / 100)) }
  }
  return encodeScaledPixels(scaleDocumentPixels(document, scalePercent), format)
}

export async function exportDocumentSliceImage(document: SpriteDocument, slice: DocumentSlice, scalePercent: number, format: Exclude<SaveImageKind, 'ase' | 'aseprite' | 'psd'>): Promise<ImageExport> {
  const composite = compositeDocument(document)
  const pixels = new Uint8ClampedArray(slice.width * slice.height * 4)
  for (let y = 0; y < slice.height; y += 1) {
    const sourceOffset = ((slice.y + y) * document.width + slice.x) * 4
    pixels.set(composite.subarray(sourceOffset, sourceOffset + slice.width * 4), y * slice.width * 4)
  }
  return encodeScaledPixels(scalePixels(pixels, slice.width, slice.height, scalePercent), format)
}

export async function exportDocumentSelectionImage(document: SpriteDocument, selection: SelectionMask, scalePercent: number, format: Exclude<SaveImageKind, 'ase' | 'aseprite' | 'psd' | 'gif'>): Promise<ImageExport> {
  const composite = compositeDocument(document)
  const pixels = new Uint8ClampedArray(selection.width * selection.height * 4)
  for (let y = 0; y < selection.height; y += 1) for (let x = 0; x < selection.width; x += 1) {
    const target = (y * selection.width + x) * 4
    if (!selectionContains(selection, selection.x + x, selection.y + y)) continue
    const source = ((selection.y + y) * document.width + selection.x + x) * 4
    pixels.set(composite.subarray(source, source + 4), target)
  }
  return encodeScaledPixels(scalePixels(pixels, selection.width, selection.height, scalePercent), format)
}
