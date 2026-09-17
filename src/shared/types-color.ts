export type BlendMode =
  | 'normal'
  | 'darken'
  | 'multiply'
  | 'color-burn'
  | 'linear-burn'
  | 'lighten'
  | 'screen'
  | 'color-dodge'
  | 'linear-dodge'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'vivid-light'
  | 'linear-light'
  | 'pin-light'
  | 'hard-mix'
  | 'difference'
  | 'exclusion'
  | 'subtract'
  | 'divide'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export const BLEND_MODES: readonly BlendMode[] = [
  'normal', 'darken', 'multiply', 'color-burn', 'linear-burn', 'lighten', 'screen', 'color-dodge', 'linear-dodge',
  'overlay', 'soft-light', 'hard-light', 'vivid-light', 'linear-light', 'pin-light', 'hard-mix', 'difference',
  'exclusion', 'subtract', 'divide', 'hue', 'saturation', 'color', 'luminosity'
]

export type ImageExportFormat = 'png' | 'jpeg' | 'webp' | 'svg' | 'gif' | 'psd' | 'mp4' | 'webm' | 'aseprite'

export type SaveDialogFormat = 'moonsprite' | 'png' | 'jpeg' | 'webp' | 'psd' | 'ase' | 'aseprite'

export interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

export interface PaletteEntry {
  id: number
  name: string
  color: RgbaColor
}
