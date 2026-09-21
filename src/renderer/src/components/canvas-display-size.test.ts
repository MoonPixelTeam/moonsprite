import { expect, it } from 'vitest'
import { canvasBackingCapacity, canvasDisplayDeviceScale, resizeOffscreenCanvas, syncCanvasDisplaySize } from './canvas-display-size'

function trackedCanvas() {
  const canvas = document.createElement('canvas')
  let width = 300, height = 150, resets = 0
  Object.defineProperties(canvas, {
    width: { get: () => width, set: (value: number) => { width = value; resets++ } },
    height: { get: () => height, set: (value: number) => { height = value; resets++ } }
  })
  return { canvas, resets: () => resets }
}

it('reuses the backing store across shrinking and growing dock frames, then restores exact dimensions', () => {
  const exact = trackedCanvas(), reserved = trackedCanvas()
  for (let step = 0; step < 60; step++) {
    const width = 1000 - Math.abs(30 - step), height = 700 + step
    syncCanvasDisplaySize(exact.canvas, width, height, 1)
    syncCanvasDisplaySize(reserved.canvas, width, height, 1, width, height, true)
    expect(reserved.canvas.width).toBeGreaterThanOrEqual(width)
    expect(reserved.canvas.height).toBeGreaterThanOrEqual(height)
    expect(reserved.canvas.width).toBeLessThan(1000 + 128)
    expect(reserved.canvas.height).toBeLessThan(759 + 128)
  }
  expect(exact.resets()).toBe(120)
  expect(reserved.resets()).toBe(2)
  syncCanvasDisplaySize(reserved.canvas, 971, 759, 1)
  expect(reserved.canvas.width).toBe(971)
  expect(reserved.canvas.height).toBe(759)
  expect(reserved.canvas.style.width).toBe('971px')
  expect(reserved.resets()).toBe(4)
})

it.each([1, 1.25, 1.5, 2])('keeps physical pixel scale and hit testing consistent at DPR %s', (dpr) => {
  const { canvas } = trackedCanvas()
  const interfaceScale = 1.5
  for (const cssWidth of [600.25, 590.5, 550, 620.75]) {
    const width = cssWidth * interfaceScale, height = 400 * interfaceScale
    const scale = syncCanvasDisplaySize(canvas, width, height, dpr / interfaceScale, cssWidth, 400, true)
    expect(canvas.width / parseFloat(canvas.style.width)).toBeCloseTo(dpr, 10)
    expect(canvas.height / parseFloat(canvas.style.height)).toBeCloseTo(dpr, 10)
    expect(scale.x).toBe(dpr / interfaceScale)
    expect(canvasDisplayDeviceScale(canvas, 1)).toEqual(scale)
  }
  const final = syncCanvasDisplaySize(canvas, 620.75 * interfaceScale, 600, dpr / interfaceScale, 620.75, 400)
  expect(final.x).toBe(canvas.width / (620.75 * interfaceScale))
  expect(canvasDisplayDeviceScale(canvas, 1)).toEqual(final)
})

it('grows rotated backing capacity only when required and shrinks on commit', () => {
  expect(canvasBackingCapacity(901, 1024, true)).toBe(1024)
  expect(canvasBackingCapacity(1025, 1024, true)).toBe(1152)
  expect(canvasBackingCapacity(901, 1152, false)).toBe(901)
  const tracked = trackedCanvas()
  const scene = tracked.canvas as unknown as OffscreenCanvas
  for (const size of [901, 905, 1015, 940, 900]) {
    expect(resizeOffscreenCanvas(scene, size, size, true)).toBe(scene)
    expect(scene.width).toBeGreaterThanOrEqual(size)
  }
  expect(tracked.resets()).toBe(2)
  expect(resizeOffscreenCanvas(scene, 900, 900)).toBe(scene)
  expect(scene.width).toBe(900)
  expect(scene.height).toBe(900)
  expect(tracked.resets()).toBe(4)
})
