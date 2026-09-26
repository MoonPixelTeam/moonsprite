import type { SpriteDocument } from '@shared/types-document'
import type { SelectionRect } from '@shared/types-selection'
import type { RgbaColor } from '@shared/types-color'
import type { StyledLayerBlockCache } from './document-composite-style-types'
import { TRANSPARENT, unpackColor, writeRgbaPixel } from './raster'
import { readSurfacePackedLocal } from './runtime-raster'
import { applyLayerStylesAt, applySimpleLayerStylesPacked, layerStyleBinaryStrokeMetric } from './layer-styles'
import { layerStyleCoverageTile } from './layer-style-coverage'
import { intersectRect, localBinaryStyleFields, hasCompleteBinaryStyleCoverage, distanceFieldAt } from './document-composite-style-geometry'

/** Evaluate one dirty style block using only canvas-visible source pixels. */
export function renderStyledLayerBlock(document: SpriteDocument, cache: StyledLayerBlockCache, block: SelectionRect): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(block.width * block.height * 4)
  const sourceLayer = cache.sourceLayer
  const styles = cache.resolvedStyles
  const sourceBounds = { x: 0, y: 0, width: sourceLayer.width, height: sourceLayer.height }
  const rendersOutsideSource = styles.shadow.enabled
    || (styles.stroke.enabled && styles.stroke.position !== 'inside')
  if (!rendersOutsideSource && !intersectRect(block, sourceBounds)) return pixels

  const readSourcePacked = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= sourceLayer.width || y >= sourceLayer.height) return 0
    if (x + sourceLayer.offsetX < 0 || y + sourceLayer.offsetY < 0
      || x + sourceLayer.offsetX >= document.width || y + sourceLayer.offsetY >= document.height) return 0
    const packed = readSurfacePackedLocal(sourceLayer, x, y)
    return sourceLayer.format === 'rgba' ? packed : (cache.palettePacked!.get(packed) ?? 0)
  }
  const readSource = (x: number, y: number): RgbaColor => {
    return unpackColor(readSourcePacked(x, y))
  }
  const binaryStrokeMetric = styles.stroke.enabled ? layerStyleBinaryStrokeMetric(styles.stroke) : null
  const localFields = localBinaryStyleFields(document, sourceLayer, block, styles, binaryStrokeMetric)
  const alphaCoverage = localFields ? undefined : layerStyleCoverageTile(block, styles, (x, y) => readSourcePacked(x, y) >>> 24)
  const completeCoverage = localFields ? hasCompleteBinaryStyleCoverage(styles, localFields)
    : Boolean(alphaCoverage && (!styles.stroke.enabled || ((styles.stroke.position === 'inside' || alphaCoverage.outsideStroke) && (styles.stroke.position === 'outside' || alphaCoverage.insideStroke))))
  const canUsePackedStyle = completeCoverage
    && !styles.stroke.enabled
    && !styles.stroke.smartHue
    && !styles.colorOverlay.enabled
    && !styles.gradientOverlay.enabled
    && !styles.gradientMap?.enabled
    && (styles.shadow.enabled || styles.innerGlow.enabled || styles.stroke.enabled)

  const geometry = { x: 0, y: 0, width: sourceLayer.width, height: sourceLayer.height }

  for (let y = 0; y < block.height; y += 1) for (let x = 0; x < block.width; x += 1) {
    const sourceX = block.x + x
    const sourceY = block.y + y
    if (sourceX + sourceLayer.offsetX < 0 || sourceY + sourceLayer.offsetY < 0
      || sourceX + sourceLayer.offsetX >= document.width || sourceY + sourceLayer.offsetY >= document.height) {
      const raw = sourceX < 0 || sourceY < 0 || sourceX >= sourceLayer.width || sourceY >= sourceLayer.height
        ? 0 : readSurfacePackedLocal(sourceLayer, sourceX, sourceY)
      writeRgbaPixel(pixels, y * block.width + x, sourceLayer.format === 'rgba' ? unpackColor(raw) : cache.palette!.get(raw) ?? TRANSPARENT)
      continue
    }
    const sourcePacked = readSourcePacked(sourceX, sourceY)
    const sourceColor = unpackColor(sourcePacked)
    if (!rendersOutsideSource && sourceColor.a === 0) continue
    const shadowDistanceAtPixel = localFields?.shadow
      ? distanceFieldAt(localFields.shadow, sourceX - styles.shadow.offsetX, sourceY - styles.shadow.offsetY)
      : 0
    const innerGlowDistanceAtPixel = localFields?.innerGlow
      ? distanceFieldAt(localFields.innerGlow, sourceX, sourceY)
      : 0
    const shadowCoverage = localFields?.shadow
      ? shadowDistanceAtPixel <= styles.shadow.blur ? 1 - shadowDistanceAtPixel / (styles.shadow.blur + 1) : 0
      : alphaCoverage?.shadow?.[y * block.width + x]
    const innerGlowCoverage = localFields?.innerGlow
      ? innerGlowDistanceAtPixel <= styles.innerGlow.size
        ? (styles.innerGlow.size - innerGlowDistanceAtPixel + 1) / styles.innerGlow.size
        : 0
      : alphaCoverage?.innerGlow?.[y * block.width + x]
    const outsideStrokeCoverage = localFields?.strokeOutside
      ? distanceFieldAt(localFields.strokeOutside, sourceX, sourceY) <= styles.stroke.size ? 1 : 0
      : alphaCoverage?.outsideStroke?.[y * block.width + x]
    const insideStrokeCoverage = localFields?.strokeInside
      ? distanceFieldAt(localFields.strokeInside, sourceX, sourceY) <= styles.stroke.size ? 1 : 0
      : alphaCoverage?.insideStroke?.[y * block.width + x]
    if (canUsePackedStyle) {
      const packed = applySimpleLayerStylesPacked(
        styles,
        sourceX,
        sourceY,
        sourcePacked,
        readSource,
        shadowCoverage,
        innerGlowCoverage,
        outsideStrokeCoverage,
        insideStrokeCoverage
      )
      if (packed !== null) {
        writeRgbaPixel(pixels, y * block.width + x, unpackColor(packed))
        continue
      }
    }
    writeRgbaPixel(pixels, y * block.width + x, applyLayerStylesAt(
      geometry,
      styles,
      sourceX,
      sourceY,
      sourceColor,
      readSource,
      cache.resolveStyleColor,
      {
        shadow: shadowCoverage,
        innerGlow: innerGlowCoverage,
        // The directed stroke sampler owns both geometry and the optional
        // follow-opacity alpha. Coverage tiles cannot represent that
        // source choice without changing the result at diagonal corners.
        outsideStroke: styles.stroke.enabled ? undefined : outsideStrokeCoverage,
        insideStroke: styles.stroke.enabled ? undefined : insideStrokeCoverage
      },
      { x: sourceLayer.offsetX, y: sourceLayer.offsetY }
    ))
  }
  return pixels
}
