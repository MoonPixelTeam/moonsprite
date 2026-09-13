import type { RgbaColor, BlendMode } from './types-color'
import type { FreeTileSourceLayer } from './types-tiles'
import type { LayerStyles } from './types-layer-style'
import type { RuntimeRasterTiles } from './types-raster'

export type BackgroundPatternId = 'solid' | 'grid' | 'stripes' | 'diamond' | 'diamond-nested' | 'circles'

export interface BackgroundLayerSettings {
  mode: 'preset' | 'canvas'
  pattern?: BackgroundPatternId
}

export interface RgbaLayer {
  id: string
  name: string
  /** Stable group whose ordinary raster layers share editable pixel content. */
  linkedContentId?: string
  /** Automatically inherit the previous frame cel's link when creating animation frames. */
  autoLinkAnimationCels?: boolean
  /** Optional visual marker shown in the layer panel. */
  displayColor?: RgbaColor
  /** Optional user-facing note shown when hovering the layer row. */
  description?: string
  /** Editable text layers retain raster surfaces for the existing compositor. */
  kind?: 'text' | 'tilemap' | 'free-tile'
  /** Project Tileset owned by this Tilemap layer. */
  tilemapTilesetId?: string
  /** Legacy v14 Free Tile ownership, retained only while decoding and migrating older projects. */
  freeTileTilesetId?: string
  /** Stable source-library identity shared by compatible Free Tile layers. */
  freeTileSetId?: string
  /** Reusable source layers shared by every Free Tile layer with the same set identity. */
  freeTileSources?: FreeTileSourceLayer[]
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: BlendMode
  /** Restricts this layer to the visible alpha of its immediate lower sibling. */
  clippingMask?: boolean
  /** Non-destructive effects evaluated from the active cel surface during compositing. */
  layerStyles?: LayerStyles
  /** Treats this layer as editable canvas wallpaper with resize-time tiling. */
  background?: BackgroundLayerSettings
  groupId?: string | null
  /** Local bitmap dimensions. They may differ from the visible canvas after moving/resizing. */
  width: number
  height: number
  /** Canvas-space location of the layer bitmap's local (0, 0). */
  offsetX: number
  offsetY: number
  format: 'rgba'
  pixels: Uint8ClampedArray
  runtimeRaster?: RuntimeRasterTiles
}

export interface IndexedLayer {
  id: string
  name: string
  /** Stable group whose ordinary raster layers share editable pixel content. */
  linkedContentId?: string
  /** Automatically inherit the previous frame cel's link when creating animation frames. */
  autoLinkAnimationCels?: boolean
  /** Optional visual marker shown in the layer panel. */
  displayColor?: RgbaColor
  /** Optional user-facing note shown when hovering the layer row. */
  description?: string
  /** Editable text layers retain raster surfaces for the existing compositor. */
  kind?: 'text' | 'tilemap' | 'free-tile'
  /** Project Tileset owned by this Tilemap layer. */
  tilemapTilesetId?: string
  /** Legacy v14 Free Tile ownership, retained only while decoding and migrating older projects. */
  freeTileTilesetId?: string
  /** Stable source-library identity shared by compatible Free Tile layers. */
  freeTileSetId?: string
  /** Reusable source layers shared by every Free Tile layer with the same set identity. */
  freeTileSources?: FreeTileSourceLayer[]
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: BlendMode
  /** Restricts this layer to the visible alpha of its immediate lower sibling. */
  clippingMask?: boolean
  /** Non-destructive effects evaluated from the active cel surface during compositing. */
  layerStyles?: LayerStyles
  /** Treats this layer as editable canvas wallpaper with resize-time tiling. */
  background?: BackgroundLayerSettings
  groupId?: string | null
  width: number
  height: number
  offsetX: number
  offsetY: number
  format: 'indexed'
  pixels: Uint32Array
  runtimeRaster?: RuntimeRasterTiles
}

export type RasterLayer = RgbaLayer | IndexedLayer

export interface LayerMask extends RgbaLayer {
  ownerKind: 'cel' | 'group'
  ownerId: string
  /** Optional independent link to another mask surface. */
  linkedMaskId?: string | null
  /** Whether this mask keeps its offset synchronized with its owner. */
  moveWithOwner?: boolean
}

export interface AnimationGroupMask {
  groupId: string
  frameId: string
  mask: LayerMask
}

/** Frame-specific layer mask stored independently from the layer's cel content. */
export interface AnimationLayerMask {
  layerId: string
  frameId: string
  mask: LayerMask
}

export interface LayerGroup {
  id: string
  name: string
  /** 空组没有子图层可定位时，保存它在统一图层堆栈中的顺序锚点。 */
  panelOrder?: number
  /** Optional visual marker shown in the layer panel. */
  displayColor?: RgbaColor
  /** Optional user-facing note shown when hovering the group row. */
  description?: string
  parentGroupId?: string | null
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: BlendMode
  /** Restricts this group to the visible alpha of its immediate lower sibling. */
  clippingMask?: boolean
  /** Non-destructive effects evaluated from the composited group contents. */
  layerStyles?: LayerStyles
  /** Re-applies the group blend mode after its children have composited against the external backdrop. */
  cumulativeBlend?: boolean
}
