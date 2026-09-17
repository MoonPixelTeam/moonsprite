import type { ColorMode } from '@shared/types-raster'
import type { PaletteEntry } from '@shared/types-color'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import type { AppLocale } from './localization'
import type { ColorAdjustment } from './adjustments'

export interface AdjustmentPreviewSourceLayer {
  layerId: string
  width: number
  height: number
  offsetX: number
  offsetY: number
  format: 'rgba' | 'indexed'
  isMask: boolean
  localContentBounds: SelectionRect | null
  pixels: Uint8ClampedArray | Uint32Array
}

export interface AdjustmentPreviewBaseline {
  documentWidth: number
  documentHeight: number
  colorMode: ColorMode
  palette: PaletteEntry[]
  paletteOrder: number[]
  nextColorId: number
  selection: SelectionMask | null
  locale: AppLocale
  layers: AdjustmentPreviewSourceLayer[]
}

export interface AdjustmentPreviewResultLayer {
  layerId: string
  x: number
  y: number
  width: number
  height: number
  format: 'rgba' | 'indexed'
  localContentBounds: SelectionRect | null
  pixels: Uint8ClampedArray | Uint32Array
}

export interface AdjustmentPreviewResult {
  id: number
  region: SelectionRect
  palette: PaletteEntry[]
  nextColorId: number
  layers: AdjustmentPreviewResultLayer[]
}

export type AdjustmentPreviewWorkerRequest =
  | { type: 'initialize'; baseline: AdjustmentPreviewBaseline }
  | { type: 'adjust'; id: number; adjustment: ColorAdjustment; region: SelectionRect }
  | { type: 'cancel' }

export type AdjustmentPreviewWorkerResponse = AdjustmentPreviewResult | { id: number; error: string }
