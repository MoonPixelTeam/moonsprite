import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { deflateSync } from 'node:zlib'

const root = process.cwd()
const sourcePath = join(root, 'src-tauri', 'resources', 'moonsprite-file-icon.svg')
const outputPath = join(root, 'src-tauri', 'resources', 'moonsprite-file.ico')
const svg = await readFile(sourcePath, 'utf8')
const pixels = new Map()
for (const match of svg.matchAll(/<path d="M(\d+) (\d+)h(\d+)v1H\d+z" fill="(#[0-9a-fA-F]{6})"\/>/g)) {
  const [, xText, yText, widthText, color] = match
  const x = Number(xText)
  const y = Number(yText)
  const width = Number(widthText)
  for (let offset = 0; offset < width; offset += 1) pixels.set(`${x + offset},${y}`, color)
}

const width = 10
const height = 12
const colorBytes = (color) => [Number.parseInt(color.slice(1, 3), 16), Number.parseInt(color.slice(3, 5), 16), Number.parseInt(color.slice(5, 7), 16)]
const crc32 = (bytes) => {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
const pngChunk = (type, data) => {
  const typeBytes = Buffer.from(type)
  const result = Buffer.alloc(12 + data.length)
  result.writeUInt32BE(data.length, 0)
  typeBytes.copy(result, 4)
  data.copy(result, 8)
  result.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), data.length + 8)
  return result
}
const encodePng = (size) => {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const scale = Math.max(1, Math.floor(size / Math.max(width, height)))
  const drawnWidth = width * scale
  const drawnHeight = height * scale
  const offsetX = Math.floor((size - drawnWidth) / 2)
  const offsetY = Math.floor((size - drawnHeight) / 2)
  for (let y = 0; y < size; y += 1) {
    raw[(size * 4 + 1) * y] = 0
    for (let x = 0; x < size; x += 1) {
      const offset = (size * 4 + 1) * y + 1 + x * 4
      if (x < offsetX || x >= offsetX + drawnWidth || y < offsetY || y >= offsetY + drawnHeight) {
        raw[offset + 3] = 0
        continue
      }
      const sourceX = Math.floor((x - offsetX) / scale)
      const sourceY = Math.floor((y - offsetY) / scale)
      const color = pixels.get(`${sourceX},${sourceY}`) ?? '#00000000'
      if (color.length === 9) {
        raw[offset + 3] = 0
      } else {
        const [red, green, blue] = colorBytes(color)
        raw[offset] = red
        raw[offset + 1] = green
        raw[offset + 2] = blue
        raw[offset + 3] = 255
      }
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

const sizes = [16, 32, 48, 256]
const images = sizes.map((size) => encodePng(size))
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)
const entries = []
let offset = 6 + images.length * 16
for (let index = 0; index < images.length; index += 1) {
  const size = sizes[index]
  const entry = Buffer.alloc(16)
  entry[0] = size === 256 ? 0 : size
  entry[1] = size === 256 ? 0 : size
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(images[index].length, 8)
  entry.writeUInt32LE(offset, 12)
  entries.push(entry)
  offset += images[index].length
}
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, Buffer.concat([header, ...entries, ...images]))
