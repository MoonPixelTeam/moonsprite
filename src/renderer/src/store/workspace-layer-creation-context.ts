import type { RgbaColor } from '@shared/types-color'
import type { SpriteDocument } from '@shared/types-document'
import { colorEquals } from '@/core/raster'
import { DEFAULT_LAYER_DISPLAY_COLOR_PRESETS, loadEditorPreferences } from '@/core/file-preferences'


export const nextAvailableLayerDisplayColor = (document: SpriteDocument): RgbaColor => {
  const presets = loadEditorPreferences().layerDisplayColorPresets
  const available = presets.length > 0 ? presets : DEFAULT_LAYER_DISPLAY_COLOR_PRESETS
  const used = [...document.layers, ...document.groups].flatMap((owner) => owner.displayColor ? [owner.displayColor] : [])
  const usage = available.map((preset) => used.filter((color) => colorEquals(color, preset)).length)
  const leastUsed = Math.min(...usage)
  return { ...available[Math.max(0, usage.indexOf(leastUsed))] }
}
