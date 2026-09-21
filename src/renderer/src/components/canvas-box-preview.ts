import type { SelectionRect } from '@shared/types-selection'

export const sameBoxPreview = (left: SelectionRect | null | undefined, right: SelectionRect): boolean =>
  !!left && left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height
