import type { AnimationCel } from '@shared/types-animation'
import type { RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import { paletteColorIdForCanvas } from '@/core/document-model'
import { cloneAnimationCel } from '@/core/animation'
import { applyRelativeLuminance } from '@/core/raster'

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
  if (layer.kind !== 'text') delete cel.text
  if (layer.kind !== 'tilemap') delete cel.tilemap
  if (layer.kind !== 'free-tile') delete cel.freeTiles
  return cel
}
