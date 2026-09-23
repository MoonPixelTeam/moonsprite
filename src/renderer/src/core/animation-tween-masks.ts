import type { LayerMask } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import { maskCoverageFromColor } from './document-model'
import { readSurfacePackedLocal } from './runtime-raster'
import { unpackColor } from './raster'
import { translateCurrent as tr } from './localization'

/** Missing/disabled masks are neutral. Sample both masks in their owner's moving space. */
export function betweenTweenMask(start: LayerMask | undefined, end: LayerMask | undefined, from: SelectionRect, to: SelectionRect, t: number, maxPixels: number): Pick<LayerMask, 'width' | 'height' | 'offsetX' | 'offsetY' | 'pixels' | 'visible' | 'opacity'> {
  const lerp = (a: number, b: number) => a + (b - a) * t
  const target = { x: Math.round(lerp(from.x, to.x)), y: Math.round(lerp(from.y, to.y)), width: Math.max(1, Math.round(lerp(from.width, to.width))), height: Math.max(1, Math.round(lerp(from.height, to.height))) }
  const rect = (mask: LayerMask | undefined, owner: SelectionRect): SelectionRect | null => !mask ? null : mask.moveWithOwner === false
    ? { x: mask.offsetX, y: mask.offsetY, width: mask.width, height: mask.height }
    : { x: target.x + (mask.offsetX - owner.x) * target.width / owner.width, y: target.y + (mask.offsetY - owner.y) * target.height / owner.height,
      width: mask.width * target.width / owner.width, height: mask.height * target.height / owner.height }
  const rects = [rect(start, from), rect(end, to)].filter((value): value is SelectionRect => value !== null)
  const offsetX = Math.floor(Math.min(...rects.map((value) => value.x))), offsetY = Math.floor(Math.min(...rects.map((value) => value.y)))
  const width = Math.max(1, Math.ceil(Math.max(...rects.map((value) => value.x + value.width))) - offsetX)
  const height = Math.max(1, Math.ceil(Math.max(...rects.map((value) => value.y + value.height))) - offsetY)
  if (width > 16384 || height > 16384 || width * height > Math.min(maxPixels, 16 * 1024 * 1024)) throw new Error(tr('timeline.tween.tooLarge'))
  const coverage = (mask: LayerMask | undefined, owner: SelectionRect, x: number, y: number): number => {
    if (!mask || !mask.visible) return 255
    const sx = Math.floor((mask.moveWithOwner === false ? x : owner.x + (x - target.x) * owner.width / target.width) - mask.offsetX)
    const sy = Math.floor((mask.moveWithOwner === false ? y : owner.y + (y - target.y) * owner.height / target.height) - mask.offsetY)
    if (sx < 0 || sy < 0 || sx >= mask.width || sy >= mask.height) return 255
    return maskCoverageFromColor(unpackColor(readSurfacePackedLocal(mask, sx, sy)))
  }
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = Math.round(lerp(coverage(start, from, offsetX + x + 0.5, offsetY + y + 0.5), coverage(end, to, offsetX + x + 0.5, offsetY + y + 0.5)))
    pixels.set([value, value, value, 255], (y * width + x) * 4)
  }
  return { width, height, offsetX, offsetY, pixels, visible: true, opacity: 1 }
}
