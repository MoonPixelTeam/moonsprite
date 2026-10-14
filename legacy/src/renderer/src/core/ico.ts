import { encodePng } from './png-encode'

const ICO_MAX_SIZE = 256

function scaleToIcoBounds(pixels: Uint8ClampedArray, sourceWidth: number, sourceHeight: number): { pixels: Uint8ClampedArray; width: number; height: number } {
  const largestSide = Math.max(sourceWidth, sourceHeight)
  if (largestSide <= ICO_MAX_SIZE) return { pixels, width: sourceWidth, height: sourceHeight }
  const ratio = ICO_MAX_SIZE / largestSide
  const width = Math.max(1, Math.round(sourceWidth * ratio))
  const height = Math.max(1, Math.round(sourceHeight * ratio))
  const scaled = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / height))
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / width))
      const sourceOffset = (sourceY * sourceWidth + sourceX) * 4
      scaled.set(pixels.subarray(sourceOffset, sourceOffset + 4), (y * width + x) * 4)
    }
  }
  return { pixels: scaled, width, height }
}

/** Encodes one transparent RGBA image as a modern PNG-backed ICO file. */
export function encodeIco(pixels: Uint8ClampedArray, sourceWidth: number, sourceHeight: number): { bytes: Uint8Array; width: number; height: number } {
  const image = scaleToIcoBounds(pixels, sourceWidth, sourceHeight)
  const png = encodePng(image.pixels, image.width, image.height, true).bytes
  const bytes = new Uint8Array(22 + png.length)
  const view = new DataView(bytes.buffer)
  view.setUint16(0, 0, true)
  view.setUint16(2, 1, true)
  view.setUint16(4, 1, true)
  bytes[6] = image.width === ICO_MAX_SIZE ? 0 : image.width
  bytes[7] = image.height === ICO_MAX_SIZE ? 0 : image.height
  bytes[8] = 0
  bytes[9] = 0
  view.setUint16(10, 1, true)
  view.setUint16(12, 32, true)
  view.setUint32(14, png.length, true)
  view.setUint32(18, 22, true)
  bytes.set(png, 22)
  return { bytes, width: image.width, height: image.height }
}
