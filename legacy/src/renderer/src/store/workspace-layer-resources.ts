import type { FreeTileSourceLayer, Tileset } from '@shared/types-tiles'
import type { RgbaColor } from '@shared/types-color'
import type { SpriteDocument } from '@shared/types-document'
import { DEFAULT_LAYER_DISPLAY_COLOR_PRESETS, loadEditorPreferences } from '@/core/file-preferences'
import { linkedLayerDefaultNameSequence } from '@/core/linked-layers'
import { tr } from './workspace-translation'

export const defaultFreeTileSourceDisplayColor = (index: number): RgbaColor => {
  const presets = loadEditorPreferences().layerDisplayColorPresets
  const available = presets.length > 0 ? presets : DEFAULT_LAYER_DISPLAY_COLOR_PRESETS
  return { ...available[index % available.length] }
}

export const createLinkedLayerNameAllocator = (document: SpriteDocument): ((linkedContentId: string, fallbackName: string) => string) => {
  const sequences = new Map<string, ReturnType<typeof linkedLayerDefaultNameSequence>>()
  return (linkedContentId, fallbackName) => {
    const sequence = sequences.get(linkedContentId)
      ?? linkedLayerDefaultNameSequence(document, linkedContentId, tr('layers.linkedCopySuffix'), fallbackName)
    sequences.set(linkedContentId, sequence)
    const name = tr('layers.linkedDefaultName', { name: sequence.baseName, index: sequence.nextIndex })
    sequence.nextIndex += 1
    return name
  }
}

export const cloneFreeTileSourceLayer = (source: FreeTileSourceLayer): FreeTileSourceLayer => ({
  ...source,
  displayColor: source.displayColor ? { ...source.displayColor } : undefined
})

export const tilemapTilesetBytes = (tileset: Tileset): number => tileset.pixels.byteLength + tileset.tileIds.length * 32 + (tileset.tileSlots?.length ?? tileset.tileIds.length) * 8
