import type { GradientMapSettings } from './types-gradient-map'
import type { RgbaColor } from './types-color'
import type { OutlinePosition, OutlineKernel, OutlineDirections } from './types-selection'
import type { GradientDither } from './types-brush'

export interface LayerStyleStroke {
  enabled: boolean
  color: RgbaColor
  size: number
  position: OutlinePosition
  kernel: OutlineKernel
  directions: OutlineDirections
  smartHue: boolean
  smartHueDarkness: number
  followOpacity?: boolean
}

export interface LayerStyleShadow {
  enabled: boolean
  color: RgbaColor
  offsetX: number
  offsetY: number
  blur: number
  smartShadow: boolean
  smartShadowDarkness: number
}

export interface LayerStyleInnerGlow {
  enabled: boolean
  color: RgbaColor
  size: number
}

export interface LayerStyleColorOverlay {
  enabled: boolean
  color: RgbaColor
}

export interface LayerStyleGradientOverlay {
  enabled: boolean
  from: RgbaColor
  to: RgbaColor
  angle: number
  dither: GradientDither
}

export interface LayerStyleGradientMap extends GradientMapSettings {
  enabled: boolean
  /** Below-stack scope identifies a non-destructive adjustment layer. */
  scope: 'layer' | 'below'
}

export interface LayerStyles {
  /** Global visibility switch that preserves every configured effect. */
  enabled: boolean
  stroke: LayerStyleStroke
  shadow: LayerStyleShadow
  innerGlow: LayerStyleInnerGlow
  colorOverlay: LayerStyleColorOverlay
  gradientMap?: LayerStyleGradientMap
  gradientOverlay: LayerStyleGradientOverlay
}
