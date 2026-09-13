import type { InkMode, RgbaColor } from '@shared/types'
import { blendOver } from './raster'

const clampChannel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)))

/**
 * Resolves the source pixel produced by one brush-mask sample.
 *
 * Copy Alpha+Color deliberately ignores stroke opacity: like Aseprite's copy
 * ink, it copies the source RGBA instead of blending it with the destination.
 * Brush-mask coverage is still part of the source pixel (e.g. soft/procedural
 * brushes), so preview and committed painting must both resolve it here.
 */
export function resolveInkStampColor(
  mode: InkMode,
  source: RgbaColor,
  brushCoverage = 255,
  opacityScale = 1
): RgbaColor {
  const coverage = Math.max(0, Math.min(255, Math.round(brushCoverage)))
  const opacity = Math.max(0, Math.min(1, Number.isFinite(opacityScale) ? opacityScale : 1))
  const effectiveCoverage = mode === 'copy-alpha-color'
    ? coverage
    : Math.round(coverage * opacity)
  if (effectiveCoverage === 255) return { ...source }
  return { ...source, a: clampChannel(source.a * effectiveCoverage / 255) }
}

/** Resolves one ink-mode write. `null` means the source is intentionally a no-op. */
export function applyInkColor(mode: InkMode, destination: RgbaColor, source: RgbaColor): RgbaColor | null {
  if (mode === 'simple') {
    if (source.a === 0 || source.a === 255) return { ...source }
    return blendOver(destination, source)
  }
  if (mode === 'copy-alpha-color') return { ...source }
  if (source.a === 0 || destination.a === 0) return null
  const blended = blendOver(destination, source)
  return {
    r: blended.r,
    g: blended.g,
    b: blended.b,
    a: destination.a
  }
}
