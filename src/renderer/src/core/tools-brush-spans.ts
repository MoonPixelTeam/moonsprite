import { brushStampDimensions } from './tools-pixel-edit'

export const integerEllipseRowSpans = (size: number): Array<{ left: number; right: number }> => {
  let x0 = 0, y0 = 0, x1 = size - 1, y1 = size - 1
  let width = Math.abs(x1 - x0)
  const height = Math.abs(y1 - y0)
  let oddHeight = height & 1
  let deltaX = 4 * (1 - width) * height * height
  let deltaY = 4 * (oddHeight + 1) * width * width
  let error = deltaX + deltaY + oddHeight * width * width
  const spans = Array.from({ length: size }, () => ({ left: size, right: -1 }))
  const record = (x: number, y: number): void => {
    if (y < 0 || y >= size || x < 0 || x >= size) return
    spans[y].left = Math.min(spans[y].left, x)
    spans[y].right = Math.max(spans[y].right, x)
  }
  if (x0 > x1) { x0 = x1; x1 += width }
  if (y0 > y1) y0 = y1
  y0 += Math.floor((height + 1) / 2)
  y1 = y0 - oddHeight
  width *= 8 * width
  oddHeight = 8 * height * height
  do {
    record(x1, y0); record(x0, y0); record(x0, y1); record(x1, y1)
    const doubledError = 2 * error
    if (doubledError <= deltaY) { y0 += 1; y1 -= 1; deltaY += width; error += deltaY }
    if (doubledError >= deltaX || 2 * error > deltaY) { x0 += 1; x1 -= 1; deltaX += oddHeight; error += deltaX }
  } while (x0 <= x1)
  while (y0 - y1 < height) {
    record(x0 - 1, y0); record(x1 + 1, y0); y0 += 1
    record(x0 - 1, y1); record(x1 + 1, y1); y1 -= 1
  }
  return spans
}

/** Exact inverse nearest-neighbor square footprint, without per-pixel objects.
 * Keep empty rows indexed by y for overlap subtraction. Each row is the
 * intersection of two linear source-coordinate intervals, hence contiguous.
 * Retain the original arithmetic/rounding at pixel boundaries.
 */
export const rotatedSquareRowSpans = (size: number, angle: number): Array<{ y: number; left: number; right: number }> => {
  const stamp = brushStampDimensions(size, null, angle, 'square')
  const radians = angle * Math.PI / 180, cosine = Math.cos(radians), sine = Math.sin(radians)
  const centerX = (stamp.width - 1) / 2, centerY = (stamp.height - 1) / 2, sourceCenter = (size - 1) / 2
  return Array.from({ length: stamp.height }, (_, y) => {
    let left = stamp.width, right = -1
    for (let x = 0; x < stamp.width; x++) {
      const outputX = x - centerX, outputY = y - centerY
      const sourceX = Math.round(cosine * outputX + sine * outputY + sourceCenter)
      const sourceY = Math.round(-sine * outputX + cosine * outputY + sourceCenter)
      if (sourceX >= 0 && sourceX < size && sourceY >= 0 && sourceY < size) { left = Math.min(left, x); right = x }
    }
    return { y, left, right }
  })
}
