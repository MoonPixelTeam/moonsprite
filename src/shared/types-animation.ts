import type { RuntimeRasterTiles } from './types-raster'
import type { TextCelData } from './types-text'
import type { TilemapCelData, FreeTileCelData } from './types-tiles'
import type { LayerMask, AnimationLayerMask, AnimationGroupMask } from './types-layer'

/** 动画时间轴中的一帧。持续时间以毫秒保存，便于后续导入 Aseprite 帧时保持原始节奏。 */
export interface AnimationFrame {
  id: string
  duration: number
  /** Disabled frames remain editable in the timeline but are skipped during playback. */
  disabled?: boolean
}

/** cel 与图层、帧的稳定关联。像素存储会在实际动画编辑器落地时加入独立数据文件。 */
export type AnimationCelSurface =
  | {
      format: 'rgba'
      width: number
      height: number
      offsetX: number
      offsetY: number
      storageOriginX?: number
      storageOriginY?: number
      pixels: Uint8ClampedArray
      runtimeRaster?: RuntimeRasterTiles
    }
  | {
      format: 'indexed'
      width: number
      height: number
      offsetX: number
      offsetY: number
      storageOriginX?: number
      storageOriginY?: number
      pixels: Uint32Array
      runtimeRaster?: RuntimeRasterTiles
    }

export interface AnimationCel {
  id: string
  layerId: string
  frameId: string
  linkedCelId?: string | null
  /** Cel visual stacking offset; equal values retain layer order. */
  zIndex?: number
  /** Cel 独立的不透明度，未设置时沿用图层不透明度。 */
  opacity?: number
  surface?: AnimationCelSurface
  /** Editable source data for text cels. The surface remains the rendered cache. */
  text?: TextCelData
  /** Editable tile references for Tilemap cels. The surface remains the rendered cache. */
  tilemap?: TilemapCelData
  /** Arbitrarily positioned reusable tile instances. The surface remains the rendered cache. */
  freeTiles?: FreeTileCelData
  /** @deprecated Legacy project input only. Runtime masks live in AnimationTimeline.layerMasks. */
  mask?: LayerMask
}

export type AnimationLoopDirection = 'forward' | 'reverse' | 'ping-pong' | 'ping-pong-reverse'

export interface AnimationLoopSection {
  id: string
  name: string
  startFrameId: string
  endFrameId: string
  direction: AnimationLoopDirection
  /** Total playback passes. Null means repeat indefinitely. */
  repeatCount: number | null
}

export interface AnimationTimeline {
  frames: AnimationFrame[]
  cels: AnimationCel[]
  /** Frame-specific masks for ordinary layers, independent from cel content. */
  layerMasks?: AnimationLayerMask[]
  /** Frame-specific masks attached to layer groups. */
  groupMasks?: AnimationGroupMask[]
  /** Named frame ranges that can be played independently. */
  loopSections?: AnimationLoopSection[]
  activeFrameId: string
  loop: boolean
}
