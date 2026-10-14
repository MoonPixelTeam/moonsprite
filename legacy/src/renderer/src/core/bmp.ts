const BMP_FILE_HEADER_SIZE = 14
const BMP_V4_HEADER_SIZE = 108
const BMP_PIXEL_OFFSET = BMP_FILE_HEADER_SIZE + BMP_V4_HEADER_SIZE

export function encodeBmp(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4) {
    throw new RangeError('Invalid BMP image data')
  }
  const pixelBytes = width * height * 4
  const fileSize = BMP_PIXEL_OFFSET + pixelBytes
  if (!Number.isSafeInteger(fileSize) || fileSize > 0xffffffff) throw new RangeError('BMP image is too large')

  const output = new Uint8Array(fileSize)
  const view = new DataView(output.buffer)
  view.setUint16(0, 0x4d42, true)
  view.setUint32(2, fileSize, true)
  view.setUint32(10, BMP_PIXEL_OFFSET, true)

  view.setUint32(14, BMP_V4_HEADER_SIZE, true)
  view.setInt32(18, width, true)
  view.setInt32(22, height, true)
  view.setUint16(26, 1, true)
  view.setUint16(28, 32, true)
  view.setUint32(30, 3, true)
  view.setUint32(34, pixelBytes, true)
  view.setInt32(38, 2835, true)
  view.setInt32(42, 2835, true)
  view.setUint32(54, 0x00ff0000, true)
  view.setUint32(58, 0x0000ff00, true)
  view.setUint32(62, 0x000000ff, true)
  view.setUint32(66, 0xff000000, true)
  view.setUint32(70, 0x73524742, true)

  for (let destinationY = 0; destinationY < height; destinationY += 1) {
    const sourceY = height - destinationY - 1
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (sourceY * width + x) * 4
      const destinationOffset = BMP_PIXEL_OFFSET + (destinationY * width + x) * 4
      output[destinationOffset] = rgba[sourceOffset + 2]
      output[destinationOffset + 1] = rgba[sourceOffset + 1]
      output[destinationOffset + 2] = rgba[sourceOffset]
      output[destinationOffset + 3] = rgba[sourceOffset + 3]
    }
  }
  return output
}
