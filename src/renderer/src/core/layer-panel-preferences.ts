import { readStoredJson, readStoredString, writeStoredJson, writeStoredString } from './storage'

export type LayerDisplayDensity = 'compact' | 'normal' | 'detailed' | 'expanded' | 'large' | 'huge'
export type FreeTileInstancePanelLayout = 'separate' | 'integrated'

export const LAYER_QUICK_ACTION_IDS = [
  'newLayer',
  'newTilemapLayer',
  'newFreeTileLayer',
  'newBackgroundLayer',
  'createLayerGroup',
  'duplicateLayer',
  'deleteLayer',
  'createLinkedLayer',
  'mergeLayerDown',
  'mergeSelectedLayers',
  'mergeLayerGroup',
  'mergeVisibleLayers',
  'ungroupLayers',
  'toggleClippingMask',
  'toggleLayerMask',
  'toggleGroupMask',
  'openLayerProperties',
  'openLayerStyles',
  'toggleLayerStyles',
  'copyLayerStyles',
  'pasteLayerStyles',
  'clearLayerStyles',
  'convertLayerToBackground',
  'convertLayerToTilemap',
  'convertLayerToRaster'
] as const

export type LayerQuickActionId = (typeof LAYER_QUICK_ACTION_IDS)[number]
export interface LayerQuickAction { id: LayerQuickActionId; enabled: boolean }

export const LAYER_DENSITY_STORAGE_KEY = 'moonsprite.layers.display-density'
export const LAYER_SIDE_DOCK_AUTO_HIDE_STORAGE_KEY = 'moonsprite.layers.side-dock-auto-hide'
export const FREE_TILE_INSTANCE_PANEL_LAYOUT_STORAGE_KEY = 'moonsprite.layers.free-tile-instance-layout'
export const LAYER_QUICK_ACTIONS_STORAGE_KEY = 'moonsprite.layers.quick-actions'

export const LAYER_DENSITY_ORDER: LayerDisplayDensity[] = ['compact', 'normal', 'detailed', 'expanded', 'large', 'huge']
export const DEFAULT_LAYER_DENSITY: LayerDisplayDensity = 'compact'
export const DEFAULT_FREE_TILE_INSTANCE_PANEL_LAYOUT: FreeTileInstancePanelLayout = 'separate'
export const LAYER_QUICK_ACTION_LIMIT = 5
export const DEFAULT_LAYER_QUICK_ACTIONS: readonly LayerQuickAction[] = LAYER_QUICK_ACTION_IDS.map((id, index) => ({
  id,
  enabled: index < LAYER_QUICK_ACTION_LIMIT
}))

const isLayerQuickActionId = (value: unknown): value is LayerQuickActionId =>
  typeof value === 'string' && LAYER_QUICK_ACTION_IDS.includes(value as LayerQuickActionId)

export function normalizeLayerQuickActions(value: unknown): LayerQuickAction[] {
  const pending = Array.isArray(value) ? value : []
  const actions: LayerQuickAction[] = []
  const known = new Set<LayerQuickActionId>()
  for (const candidate of pending) {
    if (!candidate || typeof candidate !== 'object') continue
    const { id, enabled } = candidate as Partial<LayerQuickAction>
    if (!isLayerQuickActionId(id) || known.has(id)) continue
    known.add(id)
    actions.push({ id, enabled: enabled === true })
  }
  for (const defaultAction of DEFAULT_LAYER_QUICK_ACTIONS) {
    if (!known.has(defaultAction.id)) actions.push({ ...defaultAction })
  }
  return actions
}

export function loadLayerQuickActions(storage?: Storage): LayerQuickAction[] {
  return normalizeLayerQuickActions(readStoredJson<unknown>(LAYER_QUICK_ACTIONS_STORAGE_KEY, null, storage))
}

export function saveLayerQuickActions(value: readonly LayerQuickAction[], storage?: Storage): void {
  writeStoredJson(LAYER_QUICK_ACTIONS_STORAGE_KEY, normalizeLayerQuickActions(value), storage)
}

export function loadLayerDensity(storage?: Storage): LayerDisplayDensity {
  const value = readStoredString(LAYER_DENSITY_STORAGE_KEY, storage)
  return LAYER_DENSITY_ORDER.includes(value as LayerDisplayDensity) ? value as LayerDisplayDensity : DEFAULT_LAYER_DENSITY
}

export function saveLayerDensity(value: LayerDisplayDensity, storage?: Storage): void {
  writeStoredString(LAYER_DENSITY_STORAGE_KEY, value, storage)
}

export function loadLayerSideDockAutoHide(storage?: Storage): boolean {
  return readStoredString(LAYER_SIDE_DOCK_AUTO_HIDE_STORAGE_KEY, storage) !== 'false'
}

export function saveLayerSideDockAutoHide(value: boolean, storage?: Storage): void {
  writeStoredString(LAYER_SIDE_DOCK_AUTO_HIDE_STORAGE_KEY, String(value), storage)
}

export function loadFreeTileInstancePanelLayout(storage?: Storage): FreeTileInstancePanelLayout {
  const value = readStoredString(FREE_TILE_INSTANCE_PANEL_LAYOUT_STORAGE_KEY, storage)
  return value === 'integrated' || value === 'separate' ? value : DEFAULT_FREE_TILE_INSTANCE_PANEL_LAYOUT
}

export function saveFreeTileInstancePanelLayout(value: FreeTileInstancePanelLayout, storage?: Storage): void {
  writeStoredString(FREE_TILE_INSTANCE_PANEL_LAYOUT_STORAGE_KEY, value, storage)
}
