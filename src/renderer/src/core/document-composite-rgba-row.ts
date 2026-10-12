/** Copies opaque spans in one operation while preserving transparent and translucent pixels. */
export const compositeRgbaRowWithOpaqueSpans = (
  output: Uint8ClampedArray<ArrayBufferLike>,
  source: Uint8Array<ArrayBufferLike> | Uint8ClampedArray<ArrayBufferLike>,
  sourceOffset: number,
  outputOffset: number,
  pixelCount: number
): void => {
  let pixel = 0
  while (pixel < pixelCount) {
    const sourcePixelOffset = sourceOffset + pixel * 4
    const sourceAlpha = source[sourcePixelOffset + 3]
    if (sourceAlpha === 0) {
      pixel += 1
      continue
    }
    if (sourceAlpha === 255) {
      const spanStart = pixel
      pixel += 1
      while (pixel < pixelCount && source[sourceOffset + pixel * 4 + 3] === 255) pixel += 1
      output.set(
        source.subarray(sourceOffset + spanStart * 4, sourceOffset + pixel * 4),
        outputOffset + spanStart * 4
      )
      continue
    }

    const targetPixelOffset = outputOffset + pixel * 4
    const bottomAlpha = output[targetPixelOffset + 3]
    if (bottomAlpha === 0) {
      output[targetPixelOffset] = source[sourcePixelOffset]
      output[targetPixelOffset + 1] = source[sourcePixelOffset + 1]
      output[targetPixelOffset + 2] = source[sourcePixelOffset + 2]
      output[targetPixelOffset + 3] = sourceAlpha
      pixel += 1
      continue
    }
    const topAlpha = sourceAlpha / 255
    if (bottomAlpha === 255) {
      const inverseAlpha = 1 - topAlpha
      output[targetPixelOffset] = Math.round(source[sourcePixelOffset] * topAlpha + output[targetPixelOffset] * inverseAlpha)
      output[targetPixelOffset + 1] = Math.round(source[sourcePixelOffset + 1] * topAlpha + output[targetPixelOffset + 1] * inverseAlpha)
      output[targetPixelOffset + 2] = Math.round(source[sourcePixelOffset + 2] * topAlpha + output[targetPixelOffset + 2] * inverseAlpha)
      // Source-over on an opaque destination remains opaque.
      pixel += 1
      continue
    }
    const bottomAlphaNormalized = bottomAlpha / 255
    const outputAlpha = topAlpha + bottomAlphaNormalized * (1 - topAlpha)
    if (outputAlpha > 0) {
      output[targetPixelOffset] = Math.round((source[sourcePixelOffset] * topAlpha + output[targetPixelOffset] * bottomAlphaNormalized * (1 - topAlpha)) / outputAlpha)
      output[targetPixelOffset + 1] = Math.round((source[sourcePixelOffset + 1] * topAlpha + output[targetPixelOffset + 1] * bottomAlphaNormalized * (1 - topAlpha)) / outputAlpha)
      output[targetPixelOffset + 2] = Math.round((source[sourcePixelOffset + 2] * topAlpha + output[targetPixelOffset + 2] * bottomAlphaNormalized * (1 - topAlpha)) / outputAlpha)
      output[targetPixelOffset + 3] = Math.round(outputAlpha * 255)
    }
    pixel += 1
  }
}
