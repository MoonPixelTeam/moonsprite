import { describe, expect, it, vi } from 'vitest'
import { deviceAlignedCoordinate } from '@/core/canvas-render-plan'
import { CanvasCompositeBlitter } from './canvas-composite-cache-blitter'


describe('stable navigation sampling', () => {
  it('covers a fractional-zoom crop with touching integer device edges', () => {
    const blitter = new CanvasCompositeBlitter()
    blitter.currentDevicePixelRatio = { x: 1.25, y: 1.5 }
    const drawImage = vi.fn()
    blitter.drawAlignedPixelRegion({ drawImage } as unknown as CanvasRenderingContext2D, {} as CanvasImageSource, 0, 0, 4.125, 0, 0, 0, 0, 9, 7)
    let area = 0
    for (const [, , , , , x, y, width, height] of drawImage.mock.calls) {
      for (const edge of [x * 1.25, (x + width) * 1.25, y * 1.5, (y + height) * 1.5]) expect(edge).toBeCloseTo(Math.round(edge), 8)
      area += width * 1.25 * height * 1.5
    }
    expect(area).toBeCloseTo(Math.round(deviceAlignedCoordinate(9 * 4.125, 1.25) * 1.25) * Math.round(deviceAlignedCoordinate(7 * 4.125, 1.5) * 1.5), 8)
  })
  it.each([4.125, 16, 64.013])('keeps interior pixel edges independent of the visible crop at zoom %s', (zoom) => {
    const blitter = new CanvasCompositeBlitter()
    const drawImage = vi.fn()
    const context = { drawImage } as unknown as CanvasRenderingContext2D
    const source = {} as CanvasImageSource
    for (const dpr of [1, 1.25, 1.501]) for (const pan of [-120.37, 0.2, 12.9]) {
      const origin = deviceAlignedCoordinate(pan, dpr)
      blitter.currentDevicePixelRatio = dpr
      for (const [start, count] of [[0, 64], [3, 35], [11, 17]]) {
        drawImage.mockClear()
        blitter.drawAlignedPixelRegion(context, source, origin, origin, zoom, start, start, start, start, count, count)
        expect(drawImage).toHaveBeenCalled()
        for (const call of drawImage.mock.calls) {
        const [, sx, , sw, , dx, , dw] = call as unknown as [unknown, number, number, number, number, number, number, number, number]
        // Canvas samples source pixels at physical destination pixel centres.
        // Check both sides of every interior edge against the preview grid.
        for (let pixel = sx + 1; pixel < sx + sw; pixel++) {
          const edge = Math.round(deviceAlignedCoordinate(origin + pixel * zoom, dpr) * dpr)
          const sample = (screen: number) => Math.floor(sx + ((screen + 0.5) / dpr - dx) * sw / dw + 1e-10)
          // Test off the exact half-pixel tie, whose numerical precision is
          // browser-specific, using the centres immediately beside the edge.
          if (Math.abs((origin + pixel * zoom) * dpr % 1 - 0.5) < 1e-8) continue
          expect(sample(edge - 1)).toBe(pixel - 1)
          expect(sample(edge)).toBe(pixel)
        }
        }
      }
    }
  })
})
