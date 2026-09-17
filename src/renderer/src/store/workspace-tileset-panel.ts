import type { SpriteDocument } from '@shared/types-document'

export const requestTilesetPanelVisibility = (visible: boolean): void => {
  window.dispatchEvent(new CustomEvent(`moonsprite:${visible ? 'show' : 'hide'}-workspace-panel`, { detail: { id: 'tileset' } }))
}

export const documentUsesTilesetPanel = (document: SpriteDocument | null | undefined): boolean =>
  Boolean(document?.layers.some((layer) => layer.kind === 'tilemap' || layer.kind === 'free-tile'))

export const requestTilesetPanelForLayer = (document: SpriteDocument, layerId: string): void => {
  if (document.layers.some((layer) => layer.id === layerId && layer.kind === 'tilemap')) requestTilesetPanelVisibility(true)
}
