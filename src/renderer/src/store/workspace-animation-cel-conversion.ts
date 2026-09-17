import type { AnimationCel } from '@shared/types-animation'
import type { SpriteDocument } from '@shared/types-document'
import { cloneAnimationCel } from '@/core/animation'
import type { SelectionMask } from '@shared/types-selection'
import { selectionContains } from '@/core/selection'
import { readSurfacePackedLocal } from '@/core/runtime-raster'
export { animationCelForTarget } from './workspace-animation-cel-target'

/** Clip portable cel pixels in document coordinates without editing the source. */
export function clipAnimationCelToSelection(cel: AnimationCel, selection: SelectionMask): AnimationCel {
  const result = { ...cel, linkedCelId: null, text: undefined, tilemap: undefined, freeTiles: undefined }
  const surface = cel.surface
  if (!surface) return result
  const left = Math.max(selection.x, surface.offsetX)
  const top = Math.max(selection.y, surface.offsetY)
  const right = Math.min(selection.x + selection.width, surface.offsetX + surface.width)
  const bottom = Math.min(selection.y + selection.height, surface.offsetY + surface.height)
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)
  const pixels = surface.format === 'rgba' ? new Uint8ClampedArray(width * height * 4) : new Uint32Array(width * height)
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    if (!selectionContains(selection, x, y)) continue
    const value = readSurfacePackedLocal(surface, x - surface.offsetX, y - surface.offsetY)
    const index = (y - top) * width + x - left
    if (surface.format === 'indexed') pixels[index] = value
    else {
      pixels[index * 4] = value & 255
      pixels[index * 4 + 1] = (value >>> 8) & 255
      pixels[index * 4 + 2] = (value >>> 16) & 255
      pixels[index * 4 + 3] = value >>> 24
    }
  }
  result.surface = { format: surface.format, width, height, offsetX: left, offsetY: top, pixels } as typeof surface
  return result
}

/** Convert an animation cel to a document-independent RGBA snapshot. Indexed palette
 * ids are meaningful only in the source document, so cross-document payloads never
 * retain them. */
export function animationCelClipboardSnapshot(document: SpriteDocument, cel: AnimationCel): AnimationCel {
  const snapshot = cloneAnimationCel(cel)
  if (snapshot.surface?.format === 'indexed') {
    const paletteById = new Map(document.palette.map((entry) => [entry.id, entry.color]))
    const pixels = new Uint8ClampedArray(snapshot.surface.pixels.length * 4)
    for (let index = 0; index < snapshot.surface.pixels.length; index += 1) {
      const color = paletteById.get(snapshot.surface.pixels[index]) ?? {
        r: 0,
        g: 0,
        b: 0,
        a: 0
      }
      const offset = index * 4
      pixels[offset] = color.r
      pixels[offset + 1] = color.g
      pixels[offset + 2] = color.b
      pixels[offset + 3] = color.a
    }
    snapshot.surface = {
      ...snapshot.surface,
      format: 'rgba',
      pixels,
      runtimeRaster: undefined
    }
  }
  return snapshot
}
