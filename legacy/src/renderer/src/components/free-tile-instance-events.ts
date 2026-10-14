export const FREE_TILE_INSTANCE_FLASH_EVENT = 'moonsprite:free-tile-instance-flash'

export interface FreeTileInstanceFlashDetail {
  documentId: string
  instanceId: string
}

export const publishFreeTileInstanceFlash = (detail: FreeTileInstanceFlashDetail): void => {
  window.dispatchEvent(new CustomEvent<FreeTileInstanceFlashDetail>(FREE_TILE_INSTANCE_FLASH_EVENT, { detail }))
}
