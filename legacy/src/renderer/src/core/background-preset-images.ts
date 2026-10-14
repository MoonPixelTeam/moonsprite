import type { BackgroundPatternId } from '@shared/types-layer'
import type { SelectionMask } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { StoredBackgroundPreset } from '@shared/types-library'
import { compositeDocument, compositeRegion } from './document-composite'
import { translateCurrent as tr } from './localization'
import { decodePng } from './png'
import { encodePng } from './png-encode'
import { decodeBrowserRasterImage } from './raster-image'
import { selectionContains } from './selection'
import type { BackgroundPatternTile } from './background-patterns'

export const MAX_BACKGROUND_PRESET_DIMENSION = 4096
export const MAX_BACKGROUND_PRESET_PIXELS = 16_777_216

const builtInPatternByFileName: Record<string, Exclude<BackgroundPatternId, 'solid'>> = {
  'grid.png': 'grid',
  'stripes.png': 'stripes',
  'diamond.png': 'diamond',
  'diamond-nested.png': 'diamond-nested',
  'circles.png': 'circles'
}

const browserMimeTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
  gif: 'image/gif'
}

export function encodeSelectionBackgroundPreset(document: SpriteDocument, selection: SelectionMask): Uint8Array | null {
  const x = Math.max(0, Math.min(document.width, Math.floor(selection.x)))
  const y = Math.max(0, Math.min(document.height, Math.floor(selection.y)))
  const right = Math.max(x, Math.min(document.width, Math.ceil(selection.x + selection.width)))
  const bottom = Math.max(y, Math.min(document.height, Math.ceil(selection.y + selection.height)))
  const width = right - x
  const height = bottom - y
  if (width < 1 || height < 1) return null
  if (width > MAX_BACKGROUND_PRESET_DIMENSION || height > MAX_BACKGROUND_PRESET_DIMENSION || width * height > MAX_BACKGROUND_PRESET_PIXELS) {
    throw new Error(tr('core.backgroundPreset.dimensionLimit', { limit: MAX_BACKGROUND_PRESET_DIMENSION }))
  }

  const pixels = compositeRegion(document, x, y, width, height)
  let visiblePixels = 0
  for (let localY = 0; localY < height; localY += 1) for (let localX = 0; localX < width; localX += 1) {
    const offset = (localY * width + localX) * 4
    if (!selectionContains(selection, x + localX, y + localY)) {
      pixels.fill(0, offset, offset + 4)
      continue
    }
    if ((pixels[offset + 3] ?? 0) > 0) visiblePixels += 1
  }
  return visiblePixels > 0 ? encodePng(pixels, width, height, true).bytes : null
}

export async function decodeBackgroundPresetTile(preset: StoredBackgroundPreset, input: Uint8Array): Promise<BackgroundPatternTile> {
  const extension = preset.id.split('.').at(-1)?.toLocaleLowerCase() ?? ''
  const document = extension === 'png'
    ? decodePng(input, preset.name)
    : await decodeBrowserRasterImage(input, preset.name, browserMimeTypes[extension] ?? 'application/octet-stream')
  if (document.width > MAX_BACKGROUND_PRESET_DIMENSION || document.height > MAX_BACKGROUND_PRESET_DIMENSION || document.width * document.height > MAX_BACKGROUND_PRESET_PIXELS) {
    throw new Error('Background preset image is too large.')
  }
  return {
    id: preset.id,
    name: preset.name,
    width: document.width,
    height: document.height,
    pixels: compositeDocument(document),
    pattern: builtInPatternByFileName[preset.id.toLocaleLowerCase()]
  }
}
