import { inflateSync } from 'node:zlib'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import UPNG from 'upng-js'

const [inputPath, outputDirectory, sourceTileSizeArgument, outputTileSizeArgument] = process.argv.slice(2)
if (!inputPath || !outputDirectory) {
  throw new Error('Usage: node scripts/extract-aseprite-icons.mjs <input.aseprite> <output-directory>')
}

const bytes = await readFile(inputPath)
let offset = 0
const u8 = () => bytes.readUInt8(offset++)
const u16 = () => { const value = bytes.readUInt16LE(offset); offset += 2; return value }
const i16 = () => { const value = bytes.readInt16LE(offset); offset += 2; return value }
const u32 = () => { const value = bytes.readUInt32LE(offset); offset += 4; return value }
const i32 = () => { const value = bytes.readInt32LE(offset); offset += 4; return value }
const skip = (length) => { offset += length }
const text = () => { const length = u16(); const value = bytes.toString('utf8', offset, offset + length); offset += length; return value }

const fileSize = u32()
if (u16() !== 0xa5e0) throw new Error('Not an Aseprite file.')
const frameCount = u16()
const width = u16()
const height = u16()
const depth = u16()
if (depth !== 32) throw new Error(`Only RGBA Aseprite files are supported; received ${depth}-bit.`)
skip(128 - offset)

const layers = []
const slices = []
const framePixels = new Uint8Array(width * height * 4)

for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
  const frameStart = offset
  const frameBytes = u32()
  if (u16() !== 0xf1fa) throw new Error(`Invalid frame ${frameIndex}.`)
  const oldChunkCount = u16()
  skip(4)
  const newChunkCount = u32()
  const chunkCount = oldChunkCount === 0xffff ? newChunkCount : oldChunkCount

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const chunkStart = offset
    const chunkSize = u32()
    const chunkType = u16()
    const chunkEnd = chunkStart + chunkSize

    if (chunkType === 0x2004) {
      const flags = u16()
      const type = u16()
      const childLevel = u16()
      skip(4)
      const blendMode = u16()
      const opacity = u8()
      skip(3)
      layers.push({ name: text(), flags, type, childLevel, blendMode, opacity })
    } else if (chunkType === 0x2022) {
      const keyCount = u32()
      const flags = u32()
      skip(4)
      const name = text()
      for (let keyIndex = 0; keyIndex < keyCount; keyIndex += 1) {
        const key = { frame: u32(), x: i32(), y: i32(), width: u32(), height: u32() }
        if (flags & 1) skip(16)
        if (flags & 2) skip(8)
        if (key.frame === frameIndex) slices.push({ name, ...key })
      }
    } else if (chunkType === 0x2005) {
      const layerIndex = u16()
      const x = i16()
      const y = i16()
      const opacity = u8()
      const celType = u16()
      skip(7)
      if (celType === 0 || celType === 2) {
        const celWidth = u16()
        const celHeight = u16()
        const expectedLength = celWidth * celHeight * 4
        const pixels = celType === 0
          ? bytes.subarray(offset, offset + expectedLength)
          : inflateSync(bytes.subarray(offset, chunkEnd))
        if (pixels.length !== expectedLength) throw new Error(`Cel ${chunkIndex} has invalid pixel data.`)
        const layer = layers[layerIndex]
        const combinedOpacity = ((opacity * (layer?.opacity ?? 255)) / 255) | 0
        for (let sourceY = 0; sourceY < celHeight; sourceY += 1) {
          for (let sourceX = 0; sourceX < celWidth; sourceX += 1) {
            const targetX = x + sourceX
            const targetY = y + sourceY
            if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) continue
            const sourceOffset = (sourceY * celWidth + sourceX) * 4
            const targetOffset = (targetY * width + targetX) * 4
            const sourceAlpha = pixels[sourceOffset + 3] * combinedOpacity / (255 * 255)
            const targetAlpha = framePixels[targetOffset + 3] / 255
            const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha)
            if (outputAlpha <= 0) continue
            for (let channel = 0; channel < 3; channel += 1) {
              framePixels[targetOffset + channel] = Math.round((pixels[sourceOffset + channel] * sourceAlpha + framePixels[targetOffset + channel] * targetAlpha * (1 - sourceAlpha)) / outputAlpha)
            }
            framePixels[targetOffset + 3] = Math.round(outputAlpha * 255)
          }
        }
      }
    }
    offset = chunkEnd
  }
  offset = frameStart + frameBytes
}

const encodePng = (pixels, imageWidth, imageHeight) => Buffer.from(UPNG.encode([pixels.buffer.slice(pixels.byteOffset, pixels.byteOffset + pixels.byteLength)], imageWidth, imageHeight, 0))
const scaleNearest = (pixels, sourceWidth, sourceHeight, scale) => {
  if (scale === 1) return pixels
  const targetWidth = sourceWidth * scale
  const targetHeight = sourceHeight * scale
  const output = new Uint8Array(targetWidth * targetHeight * 4)
  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceOffset = ((Math.floor(y / scale) * sourceWidth) + Math.floor(x / scale)) * 4
      output.set(pixels.subarray(sourceOffset, sourceOffset + 4), (y * targetWidth + x) * 4)
    }
  }
  return output
}
const safeName = (value, index) => value.trim().replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '-') || `icon-${index + 1}`

await mkdir(outputDirectory, { recursive: true })
await writeFile(join(outputDirectory, 'sheet.png'), encodePng(framePixels, width, height))
const sliceSizeCounts = new Map()
for (const slice of slices) {
  if (slice.width !== slice.height || width % slice.width !== 0 || height % slice.height !== 0) continue
  sliceSizeCounts.set(slice.width, (sliceSizeCounts.get(slice.width) ?? 0) + 1)
}
const requestedSourceTileSize = Number.parseInt(sourceTileSizeArgument ?? '', 10)
const sourceTileSize = Number.isFinite(requestedSourceTileSize) && requestedSourceTileSize > 0
  ? requestedSourceTileSize
  : [...sliceSizeCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 32
const requestedOutputTileSize = Number.parseInt(outputTileSizeArgument ?? '', 10)
const outputTileSize = Number.isFinite(requestedOutputTileSize) && requestedOutputTileSize > 0 ? requestedOutputTileSize : 32
const outputScale = Math.max(1, Math.round(outputTileSize / sourceTileSize))
const columns = Math.floor(width / sourceTileSize)
const rows = Math.floor(height / sourceTileSize)
const gridSlices = Array.from({ length: columns * rows }, (_, index) => {
  const x = (index % columns) * sourceTileSize
  const y = Math.floor(index / columns) * sourceTileSize
  return slices.find((slice) => slice.x === x && slice.y === y && slice.width === sourceTileSize && slice.height === sourceTileSize)
    ?? { name: `Icon ${index + 1}`, frame: 0, x, y, width: sourceTileSize, height: sourceTileSize }
})
const manifest = { source: basename(inputPath), width, height, frameCount, sourceTileSize, tileSize: outputTileSize, layers, icons: [] }
for (const [index, slice] of gridSlices.entries()) {
  const pixels = new Uint8Array(slice.width * slice.height * 4)
  for (let y = 0; y < slice.height; y += 1) {
    const sourceStart = ((slice.y + y) * width + slice.x) * 4
    pixels.set(framePixels.subarray(sourceStart, sourceStart + slice.width * 4), y * slice.width * 4)
  }
  const fileName = `${String(index + 1).padStart(2, '0')}-${safeName(slice.name, index)}.png`
  const scaledPixels = scaleNearest(pixels, slice.width, slice.height, outputScale)
  await writeFile(join(outputDirectory, fileName), encodePng(scaledPixels, slice.width * outputScale, slice.height * outputScale))
  manifest.icons.push({ ...slice, outputWidth: slice.width * outputScale, outputHeight: slice.height * outputScale, file: fileName })
}
await writeFile(join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Extracted ${manifest.icons.length} icons from ${width}x${height} Aseprite sheet.`)
