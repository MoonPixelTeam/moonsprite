import { zlibSync } from 'fflate'

export interface PngExport {
  bytes: Uint8Array
  indexed: boolean
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const chunk = (type: string, payload: Uint8Array): Uint8Array => {
  const output = new Uint8Array(payload.length + 12)
  const view = new DataView(output.buffer)
  view.setUint32(0, payload.length)
  for (let index = 0; index < 4; index += 1) output[4 + index] = type.charCodeAt(index)
  output.set(payload, 8)
  const checksumBytes = output.subarray(4, payload.length + 8)
  view.setUint32(payload.length + 8, crc32(checksumBytes))
  return output
}

const writeUint32 = (view: DataView, offset: number, value: number): void => view.setUint32(offset, value >>> 0)

export function encodePng(rgba: Uint8ClampedArray, width: number, height: number, forceRgba = false): PngExport {
  const colors: number[] = []
  const colorIds = new Map<number, number>()
  if (!forceRgba) {
    for (let offset = 0; offset < rgba.length; offset += 4) {
      const color = (rgba[offset] | (rgba[offset + 1] << 8) | (rgba[offset + 2] << 16) | (rgba[offset + 3] << 24)) >>> 0
      if (!colorIds.has(color)) {
        colorIds.set(color, colors.length)
        colors.push(color)
        if (colors.length > 256) break
      }
    }
  }
  const indexed = !forceRgba && colors.length <= 256
  const bitDepth = colors.length <= 2 ? 1 : colors.length <= 4 ? 2 : colors.length <= 16 ? 4 : 8
  const header = new Uint8Array(13)
  const headerView = new DataView(header.buffer)
  writeUint32(headerView, 0, width)
  writeUint32(headerView, 4, height)
  header[8] = indexed ? bitDepth : 8
  header[9] = indexed ? 3 : 6
  const rows = indexed ? Math.ceil(width * bitDepth / 8) : width * 4
  const raw = new Uint8Array((rows + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (rows + 1)
    raw[rowStart] = 0
    if (indexed) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        const color = (rgba[offset] | (rgba[offset + 1] << 8) | (rgba[offset + 2] << 16) | (rgba[offset + 3] << 24)) >>> 0
        const id = colorIds.get(color) ?? 0
        const bitOffset = x * bitDepth
        raw[rowStart + 1 + Math.floor(bitOffset / 8)] |= id << (8 - bitDepth - (bitOffset % 8))
      }
    } else raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1)
  }
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const chunks = [chunk('IHDR', header)]
  if (indexed) {
    const palette = new Uint8Array(colors.length * 3)
    const alpha = new Uint8Array(colors.length)
    for (let index = 0; index < colors.length; index += 1) {
      const color = colors[index]
      palette[index * 3] = color & 0xff
      palette[index * 3 + 1] = (color >>> 8) & 0xff
      palette[index * 3 + 2] = (color >>> 16) & 0xff
      alpha[index] = (color >>> 24) & 0xff
    }
    chunks.push(chunk('PLTE', palette), chunk('tRNS', alpha))
  }
  chunks.push(chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array()))
  const output = new Uint8Array(signature.length + chunks.reduce((sum, item) => sum + item.length, 0))
  output.set(signature)
  let offset = signature.length
  for (const item of chunks) { output.set(item, offset); offset += item.length }
  return { bytes: output, indexed }
}
