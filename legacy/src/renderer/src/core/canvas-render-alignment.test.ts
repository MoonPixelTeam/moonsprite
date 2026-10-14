import { expect, it } from 'vitest'
import { createCanvasRenderPlan, deviceAlignedCanvasPlacement, deviceAlignedPixelRect, deviceAlignedRepeatedPointAtViewport, repeatedDeviceAlignedCanvasRect } from './canvas-render-plan'
import type { ViewState } from '@shared/types-view'

it('shares the main canvas origin with brush and selection plans at fractional pan', () => {
  const view: ViewState = { zoom: 4.5, panX: -43, panY: -43, rotation: 0, mirrored: false, mirroredVertical: false, showGrid: false, relativeLuminance: false }
  const plan = createCanvasRenderPlan(100, 100, { width: 3, height: 3 }, view, 'view', 1)
  expect(plan.originX).toBe(0)
  expect(plan.canvasBoundary.left).toBe(plan.originX)
  expect(deviceAlignedPixelRect(plan.originX, plan.originY, view.zoom, 1, 0, 1)).toEqual({ x: 4, y: 0, width: 5, height: 4 })
})

it('hits the displayed pixel in every repeated copy, including odd dimensions and negative pan', () => {
  for (const zoom of [1.25, 1.5, 3.13, 4.5, 64.013]) for (const scale of [1, { x: 1.25, y: 1.501 }]) for (const pan of [-120.37, 0.25]) {
    const base = deviceAlignedCanvasPlacement(pan, pan, 7 * zoom, 5 * zoom, scale)
    for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) {
      const copy = repeatedDeviceAlignedCanvasRect(base, cx, cy)
      for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) {
        const pixel = deviceAlignedPixelRect(copy.left, copy.top, zoom, x, y, scale)
        const point = { x: pixel.x + pixel.width / 2, y: pixel.y + pixel.height / 2 }
        expect(deviceAlignedRepeatedPointAtViewport(point, base, 7, 5, zoom, scale, 'both')).toEqual({ x: x + cx * 7, y: y + cy * 5 })
        const continuous = deviceAlignedRepeatedPointAtViewport(point, base, 7, 5, zoom, scale, 'both', true)
        expect(continuous.x).toBeCloseTo(x + cx * 7 + 0.5, 8)
        expect(continuous.y).toBeCloseTo(y + cy * 5 + 0.5, 8)
      }
    }
  }
})

it('does not wrap a disabled repeat axis or move exact shared boundaries to the previous copy', () => {
  const base = deviceAlignedCanvasPlacement(0, 0, 13.5, 13.5, 1)
  expect(deviceAlignedRepeatedPointAtViewport({ x: 17.5, y: 1 }, base, 3, 3, 4.5, 1, 'x')).toEqual({ x: 4, y: 0 })
  expect(deviceAlignedRepeatedPointAtViewport({ x: 13, y: 1 }, base, 3, 3, 4.5, 1, 'x')).toEqual({ x: 3, y: 0 })
  expect(deviceAlignedRepeatedPointAtViewport({ x: 17.5, y: 1 }, base, 3, 3, 4.5, 1, 'off')).toEqual({ x: 3, y: 0 })
})
