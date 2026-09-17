import type { RgbaColor } from './types-color'

export interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
  flipHorizontal?: boolean
  flipVertical?: boolean
  /** 在跨越对侧边界时，记录被拖动轴线的连续像素坐标。 */
  flipOriginX?: number
  flipOriginY?: number
}

/** Four-corner transform frame used by the selection free-transform mode. */
export interface SelectionQuad {
  nw: { x: number; y: number }
  ne: { x: number; y: number }
  se: { x: number; y: number }
  sw: { x: number; y: number }
}

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect'

export type SelectionKind = 'rectangle' | 'ellipse' | 'magic' | 'lasso' | 'polygon-lasso'

export type OutlinePosition = 'inside' | 'outside' | 'both'

export type OutlineKernel = 'round' | 'square' | 'horizontal' | 'vertical'

export type OutlineDirection = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'

export type OutlineDirections = Record<OutlineDirection, boolean>

export interface OutlineSettings {
  color: RgbaColor
  backgroundColor: RgbaColor
  thickness: number
  position: OutlinePosition
  kernel: OutlineKernel
  directions: OutlineDirections
  smartHue: boolean
  smartHueDarkness: number
  followOpacity: boolean
  previewEnabled: boolean
}

export type CanvasAnchor = 'nw' | 'n' | 'ne' | 'w' | 'center' | 'e' | 'sw' | 's' | 'se'

/** A cropped pixel mask. A missing mask retains legacy rectangular selection semantics. */
export interface SelectionMask extends SelectionRect {
  mask?: Uint8Array
}
