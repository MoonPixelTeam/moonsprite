import type { AnimationCel } from '@shared/types-animation'
import type { RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import { paletteColorIdForCanvas } from '@/core/document-model'
import { cloneAnimationCel } from '@/core/animation'
import { applyRelativeLuminance } from '@/core/raster'

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

export function animationCelForTarget(document: SpriteDocument, layer: RasterLayer, source: AnimationCel): AnimationCel {
  const cel = cloneAnimationCel(source)
  cel.linkedCelId = null
  if (cel.surface?.format === 'rgba' && layer.format === 'rgba' && document.colorMode === 'grayscale') {
    cel.surface = {
      ...cel.surface,
      pixels: applyRelativeLuminance(cel.surface.pixels.slice()),
      runtimeRaster: undefined
    }
  }
  if (cel.surface?.format === 'rgba' && layer.format === 'indexed') {
    const pixels = Uint32Array.from({ length: cel.surface.width * cel.surface.height }, (_, index) => {
      const offset = index * 4
      return paletteColorIdForCanvas(document, {
        r: cel.surface?.format === 'rgba' ? cel.surface.pixels[offset] : 0,
        g: cel.surface?.format === 'rgba' ? cel.surface.pixels[offset + 1] : 0,
        b: cel.surface?.format === 'rgba' ? cel.surface.pixels[offset + 2] : 0,
        a: cel.surface?.format === 'rgba' ? cel.surface.pixels[offset + 3] : 0
      })
    })
    cel.surface = {
      ...cel.surface,
      format: 'indexed',
      pixels,
      runtimeRaster: undefined
    }
  }
  // A cross-file paste may target a different layer kind. Keep the rendered
  // surface as the portable representation, but do not leave special payload
  // metadata attached to an incompatible destination cel.
  if (layer.kind !== 'text') delete cel.text
  if (layer.kind !== 'tilemap') delete cel.tilemap
  if (layer.kind !== 'free-tile') delete cel.freeTiles
  return cel
}
