import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import type { SelectionPivot } from './workspace-types'

export const mergeSelectionRects = (first: SelectionRect, second: SelectionRect): SelectionRect => {
  const left = Math.min(first.x, second.x)
  const top = Math.min(first.y, second.y)
  const right = Math.max(first.x + first.width, second.x + second.width)
  const bottom = Math.max(first.y + first.height, second.y + second.height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export const intersectSelectionRects = (first: SelectionRect, second: SelectionRect): SelectionRect | null => {
  const x = Math.max(first.x, second.x)
  const y = Math.max(first.y, second.y)
  const right = Math.min(first.x + first.width, second.x + second.width)
  const bottom = Math.min(first.y + first.height, second.y + second.height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

export const selectionMasksEqual = (left: SelectionMask | null, right: SelectionMask | null): boolean => {
  if (left === right) return true
  if (!left || !right) return false
  if (left.x !== right.x || left.y !== right.y || left.width !== right.width || left.height !== right.height) return false
  if (left.mask === right.mask) return true
  return left.mask?.length === right.mask?.length && Boolean(left.mask?.every((value, index) => value === right.mask?.[index]))
}

export const rectangularSelection = (selection: SelectionRect): SelectionMask => ({
  x: selection.x,
  y: selection.y,
  width: selection.width,
  height: selection.height
})

export const cloneSelectionPivot = (pivot: SelectionPivot | null | undefined): SelectionPivot | null => pivot ? { ...pivot } : null

export const unionRects = (left: SelectionRect, right: SelectionRect): SelectionRect => {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  const toX = Math.max(left.x + left.width, right.x + right.width)
  const toY = Math.max(left.y + left.height, right.y + right.height)
  return { x, y, width: toX - x, height: toY - y }
}
