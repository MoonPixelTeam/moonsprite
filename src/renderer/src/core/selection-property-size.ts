import type { SelectionRect } from '@shared/types-selection'
import type { SelectionHandle } from './canvas-input-contracts'
import { resizeTransformedSelectionBounds } from './canvas-input-resize'

/** Signed dimensions follow the same moving edge as a canvas handle drag. */
export function resizeSelectionPropertyTarget(start: SelectionRect, patch: Partial<SelectionRect>, angle: number,
  pivot = { x: start.x + start.width / 2, y: start.y + start.height / 2 }): SelectionRect {
  const hasWidth = Number.isFinite(patch.width), hasHeight = Number.isFinite(patch.height)
  const signed = (value: number) => (value < 0 ? -1 : 1) * Math.max(1, Math.round(Math.abs(value)))
  const scaleX = hasWidth ? signed(patch.width!) / (start.width * (start.flipHorizontal ? -1 : 1)) : 1
  const scaleY = hasHeight ? signed(patch.height!) / (start.height * (start.flipVertical ? -1 : 1)) : 1
  let target = { ...start }
  if (scaleX !== 1 || scaleY !== 1) {
    const radians = angle * Math.PI / 180, cosine = Math.cos(radians), sine = Math.sin(radians)
    const offsetX = pivot.x - start.x - start.width / 2, offsetY = pivot.y - start.y - start.height / 2
    const localPivotX = start.width / 2 + offsetX * cosine + offsetY * sine
    const localPivotY = start.height / 2 - offsetX * sine + offsetY * cosine
    // Choose the more distant edge so an edge/corner pivot never gives a zero lever arm.
    const west = localPivotX > start.width / 2, north = localPivotY > start.height / 2
    const handle = `${hasHeight ? north ? 'n' : 's' : ''}${hasWidth ? west ? 'w' : 'e' : ''}` as SelectionHandle
    const dx = hasWidth ? (scaleX - 1) * ((west ? 0 : start.width) - localPivotX) : 0
    const dy = hasHeight ? (scaleY - 1) * ((north ? 0 : start.height) - localPivotY) : 0
    target = resizeTransformedSelectionBounds(start, { x: dx * cosine - dy * sine, y: dx * sine + dy * cosine },
      angle, handle, false, false, true, pivot)
    // Keep the existing raster orientation while changing only magnitude.
    // The drag helper canonicalizes a previous central flip into an edge flip.
    if (scaleX > 0 && start.flipHorizontal && Number.isFinite(start.flipOriginX))
      target.flipOriginX = target.x + (start.flipOriginX! - start.x) / start.width * target.width
    if (scaleY > 0 && start.flipVertical && Number.isFinite(start.flipOriginY))
      target.flipOriginY = target.y + (start.flipOriginY! - start.y) / start.height * target.height
  }
  const x = Number.isFinite(patch.x) ? Math.round(patch.x!) : target.x
  const y = Number.isFinite(patch.y) ? Math.round(patch.y!) : target.y
  return { ...target, x, y,
    ...(Number.isFinite(target.flipOriginX) ? { flipOriginX: target.flipOriginX! + x - target.x } : {}),
    ...(Number.isFinite(target.flipOriginY) ? { flipOriginY: target.flipOriginY! + y - target.y } : {}) }
}
