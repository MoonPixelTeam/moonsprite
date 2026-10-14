import type { AnimationCel, AnimationCelSurface } from '@shared/types-animation'
import type { RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import type { TextCelData } from '@shared/types-text'
import { cloneTextCelData, rasterizeText, translateTextCelData } from '@/core/text-raster'

export const applyTextSurface = (document: SpriteDocument, layer: RasterLayer, source: AnimationCel, cel: AnimationCel, text: TextCelData, surface: AnimationCelSurface): void => {
  source.text = cloneTextCelData(text)
  source.surface = surface
  source.opacity = layer.opacity
  if (cel !== source) {
    cel.text = source.text
    cel.surface = source.surface
    cel.opacity = source.opacity
  }
}

export const renderTextAtCurrentSurface = (document: SpriteDocument, raw: TextCelData, targetX: number, targetY: number): ReturnType<typeof rasterizeText> => {
  let rendered = rasterizeText(raw, targetX, targetY)
  const deltaX = Math.trunc(targetX - rendered.rgba.offsetX)
  const deltaY = Math.trunc(targetY - rendered.rgba.offsetY)
  if (deltaX !== 0 || deltaY !== 0) rendered = rasterizeText(translateTextCelData(rendered.data, deltaX, deltaY), targetX, targetY)
  return rendered
}
