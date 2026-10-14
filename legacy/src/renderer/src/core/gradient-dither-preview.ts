import type { GradientDither, GradientStop } from '@shared/types-brush'
import type { RgbaColor } from '@shared/types-color'
import { ditherStageAt, ditherStageCount, gradientColorForAmount, normalizeGradientStops } from './gradient-color'
import { packColor } from './raster'

export interface GradientPreviewBlock { fromX: number; fromY: number; toX: number; toY: number }
type PreviewColumn = Readonly<Pick<GradientPreviewBlock, 'fromX' | 'toX'>> | null
export interface LinearDitherPreviewSampler {
  (block: GradientPreviewBlock): RgbaColor
  writeRow(fromY: number, toY: number, columns: readonly PreviewColumn[], target: Uint32Array, targetOffset: number): void
  writeSourceRow(y: number, target: Uint32Array, targetOffset: number): void
}

/** Exact box averages for linear ordered dithering. Build strip prefixes from
 * monotone color runs, instead of sampling and allocating a color per pixel.
 * Only the rows of the current display-pixel strip are retained. */
export const createLinearDitherPreviewSampler = (
  startColor: RgbaColor, endColor: RgbaColor,
  start: { x: number; y: number }, end: { x: number; y: number },
  dither: Exclude<GradientDither, 'none'>, fromX: number, toX: number,
  gradientStops?: readonly GradientStop[]
): LinearDitherPreviewSampler => {
  const stops = gradientStops && gradientStops.length >= 2
    ? normalizeGradientStops(gradientStops, startColor, endColor)
    : [{ position: 0, color: gradientColorForAmount(startColor, endColor, 0, 0, 0) },
       { position: 1, color: gradientColorForAmount(startColor, endColor, 1, 0, 0) }]
  const colors = stops.map(stop => packColor(stop.color))
  const dx = end.x - start.x, dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const period = dither === 'bayer-8' ? 8 : dither === 'bayer-4' ? 4
    : dither === 'bayer-2' || dither === 'checker' ? 2 : 6
  const width = toX - fromX
  type Row = { y: number; runs: number[] }
  const rows = new Map<number, Row>()
  const pool: Row[] = []
  let stripFrom = -Infinity, stripTo = -Infinity
  const strip = new Float64Array((width + 1) * 4)
  const phaseSums = new Float64Array(period * 4)
  const amountAt = (x: number, y: number): number => lengthSquared === 0 ? 0
    : Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / lengthSquared))
  const buildRow = (y: number): Row => {
    const row = pool.pop() ?? { y, runs: [] }
    row.y = y
    row.runs.length = 0
    const appendRun = (first: number, step: number, from: number, to: number, color: number): void => {
      if (to <= from) return
      const a = first + from * step, b = first + (to - 1) * step
      row.runs.push(Math.min(a, b), Math.max(a, b) + period, color)
    }
    for (let phase = 0; phase < Math.min(period, width); phase++) {
      const count = Math.floor((width - 1 - phase) / period) + 1
      const step = dx < 0 ? -period : period
      const first = dx < 0 ? phase + (count - 1) * period : phase
      const threshold = (ditherStageAt(dither, fromX + phase, y) + 0.5) / ditherStageCount(dither)
      let cursor = 0
      for (let index = 0; index < stops.length - 1; index++) {
        const left = stops[index].position, right = stops[index + 1].position
        const beyondAt = (position: number): boolean => {
          const amount = amountAt(fromX + first + position * step, y)
          return amount <= stops[0].position ? false
            : amount >= stops[stops.length - 1].position ? true
              : amount > left && (amount >= right || (amount - left) / (right - left) >= threshold)
        }
        const crossingAmount = left + (right - left) * threshold
        const crossingX = start.x + (crossingAmount * lengthSquared - (y - start.y) * dy) / dx
        let low = dx === 0 ? (beyondAt(0) ? cursor : count)
          : Math.max(cursor, Math.min(count, Math.ceil((crossingX - fromX - first) / step)))
        if (!Number.isFinite(low)) low = cursor
        // The algebraic crossing is only a hint: preserve the exact original
        // floating-point threshold comparison, including duplicate stops.
        while (low > cursor && beyondAt(low - 1)) low--
        while (low < count && !beyondAt(low)) low++
        appendRun(first, step, cursor, low, colors[index])
        cursor = low
      }
      appendRun(first, step, cursor, count, colors[colors.length - 1])
    }
    rows.set(y, row)
    return row
  }
  const prepareStrip = (fromY: number, toY: number): void => {
    if (fromY !== stripFrom || toY !== stripTo) {
      const firstRow = Math.floor(fromY), lastRow = Math.ceil(toY)
      for (const [y, row] of rows) if (y < firstRow || y >= lastRow) { rows.delete(y); pool.push(row) }
      stripFrom = fromY; stripTo = toY
      strip.fill(0)
      for (let y = firstRow; y < lastRow; y++) {
        const weight = Math.min(y + 1, toY) - Math.max(y, fromY)
        const runs = (rows.get(y) ?? buildRow(y)).runs
        for (let run = 0; run < runs.length; run += 3) {
          const from = (runs[run] + 1) * 4, to = (runs[run + 1] + 1) * 4
          const color = runs[run + 2], a = (color >>> 24) * weight
          const r = (color & 255) * a, g = ((color >>> 8) & 255) * a, b = ((color >>> 16) & 255) * a
          strip[from] += a; strip[from + 1] += r; strip[from + 2] += g; strip[from + 3] += b
          if (to < strip.length) {
            strip[to] -= a; strip[to + 1] -= r; strip[to + 2] -= g; strip[to + 3] -= b
          }
        }
      }
      // A run occupies one residue class of the ordered-dither period.
      // Integrate its differences along that class, then across all columns.
      // No source-pixel scan is needed, even when zoomed far out.
      // Fuse the two integrations. Residue totals stay in a tiny array,
      // instead of making two scalar passes over the full-width strip.
      phaseSums.fill(0)
      let alpha = 0, red = 0, green = 0, blue = 0, phase = 0
      for (let offset = 4; offset < strip.length; offset += 4) {
        phaseSums[phase] += strip[offset]
        phaseSums[phase + 1] += strip[offset + 1]
        phaseSums[phase + 2] += strip[offset + 2]
        phaseSums[phase + 3] += strip[offset + 3]
        alpha += phaseSums[phase]; red += phaseSums[phase + 1]
        green += phaseSums[phase + 2]; blue += phaseSums[phase + 3]
        strip[offset] = alpha; strip[offset + 1] = red
        strip[offset + 2] = green; strip[offset + 3] = blue
        phase += 4
        if (phase === phaseSums.length) phase = 0
      }
    }
  }
  // The integral is linear within a source pixel. Using its fractional
  // boundary prevents an almost-zero overlap counting as a whole extra pixel.
  const prefixAt = (x: number, channel: number): number => {
    const local = x - fromX, index = Math.floor(local), fraction = local - index
    const offset = index * 4 + channel
    return fraction === 0 ? strip[offset] : strip[offset] + (strip[offset + 4] - strip[offset]) * fraction
  }
  const sample = (block: GradientPreviewBlock): RgbaColor => {
    prepareStrip(block.fromY, block.toY)
    const alpha = prefixAt(block.toX, 0) - prefixAt(block.fromX, 0), red = prefixAt(block.toX, 1) - prefixAt(block.fromX, 1)
    const green = prefixAt(block.toX, 2) - prefixAt(block.fromX, 2), blue = prefixAt(block.toX, 3) - prefixAt(block.fromX, 3)
    const count = (block.toX - block.fromX) * (block.toY - block.fromY)
    return { r: alpha ? Math.round(red / alpha) : 0, g: alpha ? Math.round(green / alpha) : 0,
      b: alpha ? Math.round(blue / alpha) : 0, a: Math.round(alpha / count) }
  }
  let cachedColumns: readonly PreviewColumn[] | undefined
  let columnCoordinates = new Float64Array(0)
  const writeRow = (fromY: number, toY: number, columns: readonly PreviewColumn[], target: Uint32Array, targetOffset: number): void => {
    prepareStrip(fromY, toY)
    if (columns !== cachedColumns) {
      cachedColumns = columns
      columnCoordinates = new Float64Array(columns.length * 5)
      columns.forEach((column, x) => {
        const offset = x * 5
        if (!column) { columnCoordinates[offset] = -1; return }
        const left = column.fromX - fromX, right = column.toX - fromX
        columnCoordinates[offset] = Math.floor(left) * 4
        columnCoordinates[offset + 1] = Math.floor(right) * 4
        columnCoordinates[offset + 2] = left - Math.floor(left)
        columnCoordinates[offset + 3] = right - Math.floor(right)
        columnCoordinates[offset + 4] = column.toX - column.fromX
      })
    }
    const height = toY - fromY
    // Keep the million-pixel loop inside the numeric kernel: no temporary
    // color objects, per-pixel coordinate conversion, or sampler callbacks.
    for (let x = 0; x < columns.length; x++) {
      const offset = x * 5, left = columnCoordinates[offset]
      if (left < 0) continue
      const right = columnCoordinates[offset + 1], leftFraction = columnCoordinates[offset + 2], rightFraction = columnCoordinates[offset + 3]
      let alpha = strip[right] - strip[left], red = strip[right + 1] - strip[left + 1]
      let green = strip[right + 2] - strip[left + 2], blue = strip[right + 3] - strip[left + 3]
      if (leftFraction !== 0) {
        alpha -= (strip[left + 4] - strip[left]) * leftFraction
        red -= (strip[left + 5] - strip[left + 1]) * leftFraction
        green -= (strip[left + 6] - strip[left + 2]) * leftFraction
        blue -= (strip[left + 7] - strip[left + 3]) * leftFraction
      }
      if (rightFraction !== 0) {
        alpha += (strip[right + 4] - strip[right]) * rightFraction
        red += (strip[right + 5] - strip[right + 1]) * rightFraction
        green += (strip[right + 6] - strip[right + 2]) * rightFraction
        blue += (strip[right + 7] - strip[right + 3]) * rightFraction
      }
      const r = alpha ? Math.round(red / alpha) : 0, g = alpha ? Math.round(green / alpha) : 0, b = alpha ? Math.round(blue / alpha) : 0
      const a = Math.round(alpha / (columnCoordinates[offset + 4] * height))
      target[targetOffset + x] = (a << 24) | (b << 16) | (g << 8) | r
    }
  }
  const writeSourceRow = (y: number, target: Uint32Array, targetOffset: number): void => {
    const row = rows.get(y) ?? buildRow(y)
    // Commit original document pixels directly from the same color runs.
    // No display averaging, color allocation, or per-pixel stop search.
    for (let run = 0; run < row.runs.length; run += 3) {
      const end = Math.min(width, row.runs[run + 1]), color = row.runs[run + 2]
      for (let x = row.runs[run]; x < end; x += period) target[targetOffset + x] = color
    }
    rows.delete(y)
    pool.push(row)
  }
  return Object.assign(sample, { writeRow, writeSourceRow })
}
