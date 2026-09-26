import type { GradientDither, GradientStop } from './types-brush'

export interface GradientMapSettings {
  stops: GradientStop[]
  mode: 'continuous' | 'steps'
  dither: GradientDither
  reverse: boolean
}
