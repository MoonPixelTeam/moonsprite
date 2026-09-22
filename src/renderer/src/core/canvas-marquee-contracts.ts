import type { SelectionRect } from '@shared/types-selection'
export type MarqueeModifierMode = 'rotate' | 'resize'

export interface MarqueeTemporaryCenterRestore {
  bounds: SelectionRect
  direction?: { x: -1 | 1; y: -1 | 1 }
  fromCenter: boolean
}
