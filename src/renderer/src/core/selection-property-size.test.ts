import { expect, it } from 'vitest'
import { resizeSelectionPropertyTarget } from './selection-property-size'
import { resizeTransformedSelectionBounds } from './canvas-input-resize'
it.each([0, 37, 90])('matches pivot-based dragging at %s degrees and returns across zero without drifting', angle => {
  const start = { x: 10, y: 12, width: 4, height: 3 }, pivot = { x: 12, y: 13.5 }
  const radians = angle * Math.PI / 180
  const dragged = resizeTransformedSelectionBounds(start, { x: -5 * Math.cos(radians), y: -5 * Math.sin(radians) }, angle, 'e', false, false, true, pivot)
  const negative = resizeSelectionPropertyTarget(start, { width: -6 }, angle, pivot)
  expect(negative).toEqual(dragged)
  const restored = resizeSelectionPropertyTarget(negative, { width: 4 }, angle, pivot)
  expect(restored.x).toBeCloseTo(start.x); expect(restored.y).toBeCloseTo(start.y)
  expect(restored.width).toBe(4); expect(Boolean(restored.flipHorizontal)).toBe(false)
})
it.each([
  { pivot: { x: 10, y: 10 }, x: 6, y: 7 },
  { pivot: { x: 14, y: 13 }, x: 14, y: 13 },
  { pivot: { x: 12, y: 11.5 }, x: 10, y: 10 },
  { pivot: { x: 8, y: 8 }, x: 2, y: 3 }
])('reflects around the chosen corner, center or external pivot $pivot', ({ pivot, x, y }) => {
  const start = { x: 10, y: 10, width: 4, height: 3 }
  const target = resizeSelectionPropertyTarget(start, { width: -4, height: -3 }, 0, pivot)
  expect(target).toMatchObject({ x, y, width: 4, height: 3, flipHorizontal: true, flipVertical: true })
  const restored = resizeSelectionPropertyTarget(target, { width: 4, height: 3 }, 0, pivot)
  expect(restored).toMatchObject(start)
})
