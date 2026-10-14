import { describe, expect, it } from 'vitest'
import type { ViewState } from '@shared/types-view'
import { createCanvasRenderPlan, deviceAlignedCanvasRect, deviceAlignedCoordinate, deviceAlignedDocumentPointAtViewport, deviceAlignedDocumentRect, deviceAlignedPixelRect, deviceAlignedPixelRuns, repeatedDeviceAlignedCanvasRect } from './canvas-render-plan'

const view = (overrides: Partial<ViewState> = {}): ViewState => ({
  zoom: 4,
  panX: 0,
  panY: 0,
  rotation: 0,
  mirrored: false,
  mirroredVertical: false,
  showGrid: false,
  relativeLuminance: false,
  ...overrides
})

describe('createCanvasRenderPlan', () => {
  it.each([{ rotation: 37 }, { mirrored: true }, { mirroredVertical: true }])('keeps repeated edges on the intermediate scene grid: %j', transform => {
    for (const scale of [{ x: 1.25, y: 1.5 }, { x: 1.248, y: 1.252 }]) {
      const plan = createCanvasRenderPlan(321, 243, { width: 31, height: 27 }, view(transform), 'view', scale)
      const boundary = deviceAlignedCanvasRect(plan.originX, plan.originY, plan.canvasWidth, plan.canvasHeight, scale)
      for (let offset = -2; offset <= 2; offset++) {
        const copy = repeatedDeviceAlignedCanvasRect(boundary, offset, offset)
        for (const edge of [(copy.left - plan.sceneLeft) * scale.x, (copy.right - plan.sceneLeft) * scale.x,
          (copy.top - plan.sceneTop) * scale.y, (copy.bottom - plan.sceneTop) * scale.y]) {
          expect(edge).toBeCloseTo(Math.round(edge), 8)
        }
      }
    }
  })
  it.each([0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4.125, 6, 8, 16, 24, 32, 64.013])('fills every repeated boundary at zoom %s', zoom => {
    for (const scale of [{ x: 1, y: 1 }, { x: 1.25, y: 1.5 }, { x: 2, y: 2 }, { x: 1.248, y: 1.252 }]) {
      for (const width of [8, 31, 180, 333]) for (const pan of [-9.24, -120.37, 0.2]) {
        const height = width + 3
        const base = deviceAlignedCanvasRect(deviceAlignedCoordinate(pan, scale.x), deviceAlignedCoordinate(pan, scale.y), width * zoom, height * zoom, scale)
        for (let offset = -2; offset <= 2; offset++) {
          const copy = repeatedDeviceAlignedCanvasRect(base, offset, offset)
          const content = deviceAlignedDocumentRect(copy.left, copy.top, zoom, 0, 0, width, height, scale)
          expect(content.left).toBeCloseTo(copy.left, 8)
          expect(content.top).toBeCloseTo(copy.top, 8)
          expect(content.right).toBeCloseTo(copy.right, 8)
          expect(content.bottom).toBeCloseTo(copy.bottom, 8)
        }
      }
    }
  })




  it('shares device-pixel boundaries between adjacent preview pixels', () => {
    const first = deviceAlignedPixelRect(10.2, 12.4, 3.13, 0, 0, 1.5)
    const second = deviceAlignedPixelRect(10.2, 12.4, 3.13, 1, 0, 1.5)
    expect(first.x + first.width).toBe(second.x)
    expect(first.x * 1.5).toBe(Math.round(first.x * 1.5))
    expect(second.x * 1.5).toBe(Math.round(second.x * 1.5))

    for (const dpr of [1, 1.5, 2]) {
      const boundary = deviceAlignedCanvasRect(-17.35, 8.2, 123.47, 76.19, dpr)
      expect(boundary.left * dpr).toBeCloseTo(Math.round(boundary.left * dpr), 8)
      expect(boundary.top * dpr).toBeCloseTo(Math.round(boundary.top * dpr), 8)
      expect(boundary.right * dpr).toBeCloseTo(Math.round(boundary.right * dpr), 8)
      expect(boundary.bottom * dpr).toBeCloseTo(Math.round(boundary.bottom * dpr), 8)
      expect(boundary.width).toBe(boundary.right - boundary.left)
      expect(boundary.height).toBe(boundary.bottom - boundary.top)
    }

    const tinyBoundary = deviceAlignedCanvasRect(10.31, -4.2, 0.08, 0.12, 2)
    expect(tinyBoundary.width).toBeGreaterThanOrEqual(0.5)
    expect(tinyBoundary.height).toBeGreaterThanOrEqual(0.5)
  })

  it('keeps horizontal and vertical backing scales independent', () => {
    const deviceScale = { x: 1.248, y: 1.252 }
    const first = deviceAlignedPixelRect(7.35, -2.2, 3.7, 0, 0, deviceScale)
    const nextX = deviceAlignedPixelRect(7.35, -2.2, 3.7, 1, 0, deviceScale)
    const nextY = deviceAlignedPixelRect(7.35, -2.2, 3.7, 0, 1, deviceScale)
    const canvas = deviceAlignedCanvasRect(7.35, -2.2, 37, 29.6, deviceScale)

    expect(first.x + first.width).toBeCloseTo(nextX.x, 12)
    expect(first.y + first.height).toBeCloseTo(nextY.y, 12)
    expect(first.x * deviceScale.x).toBeCloseTo(Math.round(first.x * deviceScale.x), 8)
    expect(first.y * deviceScale.y).toBeCloseTo(Math.round(first.y * deviceScale.y), 8)
    expect(canvas.left * deviceScale.x).toBeCloseTo(Math.round(canvas.left * deviceScale.x), 8)
    expect(canvas.top * deviceScale.y).toBeCloseTo(Math.round(canvas.top * deviceScale.y), 8)
    expect(canvas.right * deviceScale.x).toBeCloseTo(Math.round(canvas.right * deviceScale.x), 8)
    expect(canvas.bottom * deviceScale.y).toBeCloseTo(Math.round(canvas.bottom * deviceScale.y), 8)
  })

  it('keeps high-zoom grouped draws on the same edges as pixel previews', () => {
    const originX = -1600.125
    const originY = -987.375
    const zoom = 32
    const deviceScale = { x: 1.25, y: 1.25 }
    const startX = 37
    const startY = 19
    const width = 41
    const height = 23
    const grouped = deviceAlignedDocumentRect(originX, originY, zoom, startX, startY, width, height, deviceScale)
    const first = deviceAlignedPixelRect(originX, originY, zoom, startX, startY, deviceScale)
    const last = deviceAlignedPixelRect(originX, originY, zoom, startX + width - 1, startY + height - 1, deviceScale)

    expect(grouped.left).toBe(first.x)
    expect(grouped.top).toBe(first.y)
    expect(grouped.right).toBe(last.x + last.width)
    expect(grouped.bottom).toBe(last.y + last.height)
  })

  it('partitions fractional high-zoom scales at the same pixel edges as previews', () => {
    const origin = -9.24
    const zoom = 16
    const devicePixelRatio = 1.1
    const runs = deviceAlignedPixelRuns(origin, zoom, 0, 8, devicePixelRatio)
    expect(runs.length).toBeGreaterThan(1)
    expect(runs.reduce((sum, run) => sum + run.count, 0)).toBe(8)
    expect(runs[0]?.left).toBe(deviceAlignedCoordinate(origin, devicePixelRatio))
    expect(runs.at(-1)?.right).toBe(deviceAlignedCoordinate(origin + 8 * zoom, devicePixelRatio))
    for (let index = 1; index < runs.length; index += 1) expect(runs[index - 1]?.right).toBe(runs[index]?.left)
    for (const run of runs) {
      expect(run.count).toBeGreaterThan(0)
      expect(run.right).toBeGreaterThan(run.left)
    }
  })

  it('keeps grid and guide ties on the same edges at every high zoom level', () => {
    const deviceScale = { x: 1.25, y: 1.25 }
    const origin = { x: 10.5, y: -6.5 }
    for (const zoom of [16, 20, 32, 64]) {
      const preview = deviceAlignedPixelRect(origin.x, origin.y, zoom, 3, 4, deviceScale)
      expect(deviceAlignedCoordinate(origin.x + 3 * zoom, deviceScale.x)).toBe(preview.x)
      expect(deviceAlignedCoordinate(origin.y + 4 * zoom, deviceScale.y)).toBe(preview.y)
    }
  })

  it('maps high-zoom pointer positions using rendered pixel boundaries', () => {
    const originX = -1600.375
    const originY = -987.125
    const zoom = 32
    const deviceScale = { x: 1.25, y: 1.25 }
    const pixel = 43
    const canvas = deviceAlignedCanvasRect(originX, originY, 128 * zoom, 128 * zoom, deviceScale)
    const next = deviceAlignedPixelRect(canvas.left, canvas.top, zoom, pixel, 0, deviceScale)
    const point = deviceAlignedDocumentPointAtViewport(
      next.x + next.width * 0.75,
      next.y + next.height * 0.75,
      canvas.left,
      canvas.top,
      zoom,
      deviceScale
    )

    expect(point).toEqual({ x: pixel, y: 0 })
  })

  it('shares exact boundaries between repeated canvas copies', () => {
    const base = deviceAlignedCanvasRect(10.2, -4.7, 123.47, 76.19, { x: 1.25, y: 1.3 })
    const left = repeatedDeviceAlignedCanvasRect(base, -1, 0)
    const right = repeatedDeviceAlignedCanvasRect(base, 1, 0)
    const above = repeatedDeviceAlignedCanvasRect(base, 0, -1)
    const below = repeatedDeviceAlignedCanvasRect(base, 0, 1)

    expect(left.right).toBe(base.left)
    expect(right.left).toBe(base.right)
    expect(above.bottom).toBe(base.top)
    expect(below.top).toBe(base.bottom)
    expect(left.width).toBeCloseTo(base.width, 12)
    expect(right.width).toBeCloseTo(base.width, 12)
    expect(above.height).toBeCloseTo(base.height, 12)
    expect(below.height).toBeCloseTo(base.height, 12)
  })



  it('computes the visible document rectangle for an unrotated view', () => {
    const plan = createCanvasRenderPlan(320, 240, { width: 128, height: 128 }, view(), 'view')
    expect(plan.rotated).toBe(false)
    expect(plan.originX).toBe(-96)
    expect(plan.originY).toBe(-136)
    expect({ x: plan.fromX, y: plan.fromY, right: plan.toX, bottom: plan.toY }).toEqual({ x: 24, y: 34, right: 104, bottom: 94 })
  })

  it('expands the scene for a rotated view while keeping visible pixels clamped', () => {
    const plan = createCanvasRenderPlan(320, 240, { width: 128, height: 128 }, view({ rotation: 45 }), 'view')
    expect(plan.rotated).toBe(true)
    expect(plan.sceneWidth).toBeGreaterThan(320)
    expect(plan.sceneHeight).toBeGreaterThan(240)
    expect(plan.fromX).toBeGreaterThanOrEqual(0)
    expect(plan.fromY).toBeGreaterThanOrEqual(0)
    expect(plan.toX).toBeLessThanOrEqual(128)
    expect(plan.toY).toBeLessThanOrEqual(128)
  })


})
