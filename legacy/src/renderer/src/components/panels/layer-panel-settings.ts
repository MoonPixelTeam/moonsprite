import { type OnionSkinPreferences } from '@/core/file-preferences'
import { type PixelUtilityIconKind } from '@/components/PixelUtilityIcon'
import { type LayerDisplayDensity, type LayerQuickAction, type LayerQuickActionId } from '@/core/layer-panel-preferences'
import type { TranslationKey } from '@/core/localization'

export interface LayerSettingsState { density: LayerDisplayDensity; onionSkin: OnionSkinPreferences; timelineHidden: boolean; sideDockAutoHide: boolean; skipDisabledFrames: boolean; quickActions: LayerQuickAction[] }

export const layerQuickActionMetadata = {
  newLayer: { icon: 'plus', label: 'layers.new' },
  newTilemapLayer: { icon: 'tilemap', label: 'layers.newTilemap' },
  newFreeTileLayer: { icon: 'freeTile', label: 'layers.newFreeTile' },
  newBackgroundLayer: { icon: 'image', label: 'layers.newBackground' },
  createLayerGroup: { icon: 'newFolder', label: 'layers.newGroup' },
  duplicateLayer: { icon: 'copy', label: 'layers.duplicate' },
  deleteLayer: { icon: 'delete', label: 'layers.deleteSelected' },
  createLinkedLayer: { icon: 'linkedLayer', label: 'layers.createLinkedLayer' },
  mergeLayerDown: { icon: 'mergeDown', label: 'app.menu.layer.mergeDown' },
  mergeSelectedLayers: { icon: 'mergeDown', label: 'app.menu.layer.mergeSelected' },
  mergeLayerGroup: { icon: 'mergeDown', label: 'app.menu.layer.mergeGroup' },
  mergeVisibleLayers: { icon: 'mergeVisible', label: 'app.menu.layer.mergeVisible' },
  ungroupLayers: { icon: 'ungroupFolder', label: 'app.menu.layer.ungroup' },
  toggleClippingMask: { icon: 'clippingMask', label: 'layers.clippingMask' },
  toggleLayerMask: { icon: 'layerMask', label: 'layers.createLayerMask' },
  toggleGroupMask: { icon: 'layerMask', label: 'layers.createLayerGroupMask' },
  openLayerProperties: { icon: 'properties', label: 'layers.layerProperties' },
  openLayerStyles: { icon: 'layerStyle', label: 'layers.openLayerStyle' },
  toggleLayerStyles: { icon: 'layerStyle', label: 'layers.layerStyle' },
  copyLayerStyles: { icon: 'copy', label: 'layers.copyLayerStyle' },
  pasteLayerStyles: { icon: 'paste', label: 'layers.pasteLayerStyle' },
  clearLayerStyles: { icon: 'delete', label: 'layers.clearLayerStyle' },
  convertLayerToBackground: { icon: 'image', label: 'layers.convertToBackground' },
  convertLayerToTilemap: { icon: 'tilemap', label: 'layers.convertToTilemap' },
  convertLayerToRaster: { icon: 'image', label: 'layers.convertToRaster' }
} satisfies Record<LayerQuickActionId, { icon: PixelUtilityIconKind; label: TranslationKey }>
