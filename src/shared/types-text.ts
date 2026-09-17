import type { RgbaColor } from './types-color'
import type { SelectionRect } from './types-selection'

export type TextAntialiasMode = 'pixel' | 'smooth'

export type TextSpacingMode = 'font' | 'actual'

export interface TextStyleRun {
  start: number
  end: number
  fontSize?: number
  lineSpacing?: number
  letterSpacing?: number
  color?: RgbaColor
}

export interface TextCelTransform {
  source: SelectionRect
  target: SelectionRect
  angle: number
  shear?: {
    axis: 'x' | 'y'
    edge: 'n' | 'e' | 's' | 'w'
    amount: number
  }
}

export interface TextCelData {
  text: string
  fontFamily: string
  fontSize: number
  lineSpacing: number
  letterSpacing: number
  spacingMode: TextSpacingMode
  antialias: TextAntialiasMode
  color: RgbaColor
  /** Free text sizes to its content; box text wraps and aligns inside its rectangle. */
  layoutMode?: 'free' | 'box'
  textAlign?: 'left' | 'center' | 'right'
  styleRuns?: TextStyleRun[]
  /** Original insertion point used when editable text is rasterized again. */
  originX?: number
  originY?: number
  /** Optional fixed canvas area for wrapped paragraph text. */
  boxWidth?: number
  boxHeight?: number
  /** Ordered transforms keep Ctrl+T edits reproducible after changing the text. */
  transforms?: TextCelTransform[]
}
