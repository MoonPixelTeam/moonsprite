import type { RgbaColor } from './types-color'

export type ToolId = 'pencil' | 'airbrush' | 'eraser' | 'fill' | 'eyedropper' | 'selection' | 'shape' | 'line' | 'text' | 'move' | 'hand' | 'zoom' | 'rotate' | 'liquify' | 'smooth'

export type LiquifyMode = 'push' | 'inflate' | 'deflate' | 'twist-clockwise' | 'twist-counter-clockwise'

export type MoveKind = 'move' | 'slice'

export type BrushShape = 'round' | 'square' | 'line'

export type BrushTexture = 'solid' | 'cracks' | 'wood' | 'grain'

export type BrushPaintMode = 'paint' | 'pattern-source' | 'pattern-target'

export type InkMode = 'simple' | 'copy-alpha-color' | 'lock-alpha'

export type ProceduralBrushId = 'procedural:noise' | 'procedural:clouds' | 'procedural:cells' | 'procedural:fibers'

export interface ProceduralBrushSettings {
  seed: number
  scale: number
  detail: number
  variation: number
  angle: number
}

/** A bitmap brush stamp. Coverage is 0-255; colors preserve source RGBA pixels when present. */
export interface ImageBrush {
  id: string
  name: string
  width: number
  height: number
  coverage: Uint8Array
  /** Optional source colors for imported and selection-created brushes. Packed RGBA, one per pixel. */
  colors?: Uint32Array
  /** Temporary foreground/background remap for selection-created brushes; never serialized. */
  paintColors?: Uint32Array
  proceduralSettings?: ProceduralBrushSettings
  /** Imported and selection-created brushes keep their source dimensions instead of scaling to brushSize. */
  intrinsicSize?: boolean
  /** Canvas-space origin used by source-aligned pattern painting. */
  sourceX?: number
  sourceY?: number
}

/** A selection-created brush embedded in its owning MoonSprite project. */
export interface ProjectBrush {
  id: string
  name: string
  width: number
  height: number
  coverage: Uint8Array
  /** Optional source colors for selection-created brushes. Packed RGBA, one per pixel. */
  colors?: Uint32Array
  sourceX?: number
  sourceY?: number
}

/** Legacy grayscale output settings kept only for persisted tool-setting compatibility. */
export type GrayscaleBrushMode = 'dither' | 'threshold'

export interface ImageBrushSettings {
  mode: GrayscaleBrushMode
  threshold: number
  blackPoint: number
  whitePoint: number
  invert: boolean
}

export type ShapeKind = 'rectangle' | 'ellipse' | 'rectangle-outline' | 'ellipse-outline' | 'freeform' | 'polygon'

export type LineKind = 'line' | 'curve'

export interface ShapeRatio { width: number; height: number }

export type FillMode = 'contiguous' | 'global'

export type FillKind = 'bucket' | 'gradient'

export type FillReference = 'current-layer' | 'visible-layers'

export type FillConnectivity = 4 | 8

export type GradientType = 'linear' | 'radial'

export type GradientDither = 'none' | 'checker' | 'diagonal' | 'diagonal-reverse' | 'horizontal' | 'vertical' | 'bayer-2' | 'bayer-4' | 'bayer-8'

export type BrushDitherTemplate = Exclude<GradientDither, 'none'>

export interface GradientStop {
  position: number
  color: RgbaColor
}

export interface BrushDitherSettings {
  enabled: boolean
  template: BrushDitherTemplate
  stage: number
}

export type AntiAliasColorSource = 'automatic' | 'canvas' | 'palette'
