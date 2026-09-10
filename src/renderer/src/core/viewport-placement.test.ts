import { describe, expect, it } from 'vitest'
import { canvasClientDeltaForInterfaceScale, canvasViewportSizeForInterfaceScale } from './canvas-interface-scale'
import { documentPointFromViewportPointContinuous, preserveViewOnViewportChange, type ViewportPlacement } from './view-geometry'

const logical = (rect: ViewportPlacement, scale: number): ViewportPlacement => ({
  left: canvasClientDeltaForInterfaceScale(rect.left, scale),
  top: canvasClientDeltaForInterfaceScale(rect.top, scale),
  ...canvasViewportSizeForInterfaceScale(rect.width, rect.height, scale)
})

describe('fixed document position across workspace layout changes', () => {
  for (const position of ['view', 'canvas'] as const) for (const rotation of [0, 37, 90, 215]) {
    for (const mirrored of [false, true]) for (const scale of [1, 1.5]) {
      it(`keeps window pixels fixed: pivot ${position}, rotation ${rotation}, mirror ${mirrored}, UI scale ${scale}`, () => {
        const initial = { zoom: 0.25, panX: 123.5, panY: -72, rotation, mirrored, mirroredVertical: true }
        const start = logical({ left: 240, top: 120, width: 1200, height: 800 }, scale)
        let previous = start
        let view = initial
        const placements = [
          { left: 400, top: 120, width: 1040, height: 800 }, // Left dock pushes the viewport.
          { left: 400, top: 120, width: 850, height: 800 }, // Right dock clips it.
          { left: 400, top: 120, width: 850, height: 520 }, // Bottom dock clips it.
          { left: 400, top: 155, width: 850, height: 485 }, // Tool options wrap.
          { left: 250, top: 155, width: 850, height: 485 }, // Position-only change.
          { left: 240, top: 120, width: 1200, height: 800 }
        ]
        for (const cssPlacement of placements) {
          const next = logical(cssPlacement, scale)
          view = preserveViewOnViewportChange(view, previous, next, position)
          for (const windowPoint of [{ x: 550, y: 300 }, { x: 1000, y: 550 }]) {
            const x = windowPoint.x * scale, y = windowPoint.y * scale
            const before = documentPointFromViewportPointContinuous({ x: x - start.left, y: y - start.top }, start.width, start.height, 4596, 1767, initial, position)
            const after = documentPointFromViewportPointContinuous({ x: x - next.left, y: y - next.top }, next.width, next.height, 4596, 1767, view, position)
            expect(after.x).toBeCloseTo(before.x, 9)
            expect(after.y).toBeCloseTo(before.y, 9)
          }
          expect(view.zoom).toBe(initial.zoom)
          expect(view.rotation).toBe(rotation)
          previous = next
        }
        expect(view.panX).toBeCloseTo(initial.panX, 9)
        expect(view.panY).toBeCloseTo(initial.panY, 9)
      })
    }
  }

  it('preserves manual navigation between resizes and does not clamp an offscreen canvas', () => {
    const rect = { left: 0, top: 0, width: 1000, height: 800 }
    const small = { left: 100, top: 0, width: 600, height: 500 }
    const view = { zoom: 8, panX: 5000, panY: -4000, rotation: 0 }
    const resized = preserveViewOnViewportChange(view, rect, small, 'canvas')
    const manuallyPanned = { ...resized, panX: resized.panX + 75, zoom: 12 }
    const restored = preserveViewOnViewportChange(manuallyPanned, small, rect, 'canvas')
    expect(restored).toEqual({ ...view, panX: 5075, zoom: 12 })
    expect(preserveViewOnViewportChange(restored, rect, rect, 'canvas')).toBe(restored)
  })
})
