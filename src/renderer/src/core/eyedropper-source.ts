import type { SpriteDocument } from '@shared/types-document'
import type { RgbaColor } from '@shared/types-color'
import { getActiveLayer, readLayerColorAt } from './document-model'
import { TRANSPARENT } from './raster'
import { readStoredString, writeStoredString } from './storage'

export type EyedropperSource = 'composite' | 'current-layer'
const PREFERENCE_KEY = 'moonsprite.preference.eyedropper-source'
export const loadEyedropperSource = (): EyedropperSource => readStoredString(PREFERENCE_KEY) === 'current-layer' ? 'current-layer' : 'composite'
export const saveEyedropperSource = (source: EyedropperSource): void => {
  writeStoredString(PREFERENCE_KEY, source)
  window.dispatchEvent(new Event('moonsprite:preferences-changed'))
}

export const sampleEyedropperColor = (document: SpriteDocument, x: number, y: number, composite: (x: number, y: number) => RgbaColor, source = loadEyedropperSource()): RgbaColor => {
  if (x < 0 || y < 0 || x >= document.width || y >= document.height) return { ...TRANSPARENT }
  return source === 'current-layer' ? readLayerColorAt(document, getActiveLayer(document), x, y) : composite(x, y)
}

/** Raw current-layer pixels for the lens, without layer opacity, masks or styles. */
export const renderEyedropperLayerRegion = (document: SpriteDocument, x: number, y: number, width: number, height: number): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(width * height * 4)
  const layer = getActiveLayer(document)
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const px = x + col, py = y + row
    if (px < 0 || py < 0 || px >= document.width || py >= document.height) continue
    const color = readLayerColorAt(document, layer, px, py)
    pixels.set([color.r, color.g, color.b, color.a], (row * width + col) * 4)
  }
  return pixels
}
