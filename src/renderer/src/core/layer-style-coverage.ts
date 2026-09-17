import type { LayerStyles } from '@shared/types-layer-style'
import type { SelectionRect } from '@shared/types-selection'
import { layerStyleBinaryStrokeMetric, type LayerStyleCoverageOverrides } from './layer-styles'

export interface LayerStyleCoverageTile {
  shadow?: Float64Array
  innerGlow?: Float64Array
  outsideStroke?: Float64Array
  insideStroke?: Float64Array
}

/** Exact alpha coverage, including fractional alpha. Grow row/column extrema
 * in O(radius * dependency area), then read square rings in constant time.
 * Inner glow uses the FIRST nonopaque ring; shadow uses a weighted maximum,
 * not an averaging blur. Those distinctions are part of the saved effect.
 */
export function layerStyleCoverageTile(rect: SelectionRect, styles: LayerStyles, alphaAt: (x: number, y: number) => number): LayerStyleCoverageTile {
  const metric = styles.stroke.enabled ? layerStyleBinaryStrokeMetric(styles.stroke) : null
  const shadowRadius = styles.shadow.enabled ? styles.shadow.blur : 0
  const glowRadius = styles.innerGlow.enabled ? styles.innerGlow.size : 0
  const strokeRadius = metric ? styles.stroke.size : 0
  const radius = Math.max(shadowRadius, glowRadius, strokeRadius)
  const output: LayerStyleCoverageTile = {}
  if (styles.shadow.enabled) output.shadow = new Float64Array(rect.width * rect.height)
  if (styles.innerGlow.enabled) output.innerGlow = new Float64Array(rect.width * rect.height)
  if (metric && styles.stroke.position !== 'inside') output.outsideStroke = new Float64Array(rect.width * rect.height)
  if (metric && styles.stroke.position !== 'outside') output.insideStroke = new Float64Array(rect.width * rect.height)
  if (!Object.keys(output).length) return output
  const offsetX = styles.shadow.enabled ? styles.shadow.offsetX : 0
  const offsetY = styles.shadow.enabled ? styles.shadow.offsetY : 0
  const left = rect.x - radius - Math.max(0, offsetX)
  const top = rect.y - radius - Math.max(0, offsetY)
  const width = rect.width + radius * 2 + Math.abs(offsetX)
  const height = rect.height + radius * 2 + Math.abs(offsetY)
  const alpha = new Float64Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) alpha[y * width + x] = alphaAt(left + x, top + y)
  const rowMax = alpha.slice(), rowMin = alpha.slice(), colMax = alpha.slice(), colMin = alpha.slice()
  const indexAt = (x: number, y: number): number => (y - top) * width + x - left
  if (output.shadow) for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
    output.shadow[y * rect.width + x] = alpha[indexAt(rect.x + x - offsetX, rect.y + y - offsetY)] / 255
  }
  for (let distance = 1; distance <= radius; distance++) {
    if (distance <= shadowRadius || distance <= glowRadius || (metric === 'square' && distance <= strokeRadius)) {
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = y * width + x
        const west = x >= distance ? alpha[i - distance] : 0
        const east = x + distance < width ? alpha[i + distance] : 0
        const north = y >= distance ? alpha[i - distance * width] : 0
        const south = y + distance < height ? alpha[i + distance * width] : 0
        rowMax[i] = Math.max(rowMax[i], west, east); rowMin[i] = Math.min(rowMin[i], west, east)
        colMax[i] = Math.max(colMax[i], north, south); colMin[i] = Math.min(colMin[i], north, south)
      }
    }
    const ringMax = (i: number): number => Math.max(rowMax[i - distance * width], rowMax[i + distance * width], colMax[i - distance], colMax[i + distance])
    const ringMin = (i: number): number => Math.min(rowMin[i - distance * width], rowMin[i + distance * width], colMin[i - distance], colMin[i + distance])
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
      const out = y * rect.width + x, i = indexAt(rect.x + x, rect.y + y)
      if (output.shadow && distance <= shadowRadius) {
        const coverage = ringMax(i - offsetY * width - offsetX) / 255 * (1 - distance / (shadowRadius + 1))
        output.shadow[out] = Math.max(output.shadow[out], coverage)
      }
      if (output.innerGlow && distance <= glowRadius && output.innerGlow[out] === 0) {
        const coverage = 1 - ringMin(i) / 255
        if (coverage > 0) output.innerGlow[out] = coverage * ((glowRadius - distance + 1) / glowRadius)
      }
      if (metric && distance <= strokeRadius) {
        let maximum = 0, minimum = 255
        if (metric === 'square') { maximum = ringMax(i); minimum = ringMin(i) }
        else {
          if (metric !== 'vertical') { maximum = Math.max(maximum, alpha[i - distance], alpha[i + distance]); minimum = Math.min(minimum, alpha[i - distance], alpha[i + distance]) }
          if (metric !== 'horizontal') { maximum = Math.max(maximum, alpha[i - distance * width], alpha[i + distance * width]); minimum = Math.min(minimum, alpha[i - distance * width], alpha[i + distance * width]) }
        }
        // Outside strokes use the configured stroke alpha by default. Source
        // alpha only controls the result through the explicit
        // follow-opacity mode, which bypasses this binary fast path.
        if (output.outsideStroke) output.outsideStroke[out] = Math.max(output.outsideStroke[out], maximum > 0 ? 1 : 0)
        // Keep anti-aliased source pixels inside the shape.  A fractional
        // inner-stroke coverage would layer a second stroke over the
        // anti-aliased edge; the outline tool's boundary test is binary.
        if (output.insideStroke) output.insideStroke[out] = Math.max(output.insideStroke[out], minimum === 0 ? 1 : 0)
      }
    }
  }
  return output
}

export function layerStyleCoverageAt(tile: LayerStyleCoverageTile, index: number): LayerStyleCoverageOverrides {
  return { shadow: tile.shadow?.[index], innerGlow: tile.innerGlow?.[index], outsideStroke: tile.outsideStroke?.[index], insideStroke: tile.insideStroke?.[index] }
}
