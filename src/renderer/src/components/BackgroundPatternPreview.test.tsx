import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BackgroundPatternPreview } from './BackgroundPatternPreview'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('reveals additional repeats at larger card sizes without stretching or idle redraws', () => {
  let width = 80, height = 70, resize!: () => void
  const disconnect = vi.fn(), putImageData = vi.fn()
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => height)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData
  } as unknown as CanvasRenderingContext2D)
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback } observe() {}; disconnect = disconnect })
  const tile = { id: 'grid.png', name: 'Grid', width: 3, height: 2,
    pixels: new Uint8ClampedArray([10, 20, 30, 40, 50, 60].flatMap(r => [r, 0, 0, 255])) }
  const { container, unmount } = render(<div><BackgroundPatternPreview source={tile} /></div>)
  const assertPixels = () => {
    const canvas = container.querySelector('canvas')!
    expect([canvas.width, canvas.height]).toEqual([width, height])
    const data = putImageData.mock.lastCall![0].data as Uint8ClampedArray
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      expect(data[(y * width + x) * 4]).toBe([10, 20, 30, 40, 50, 60][(y % 2) * 3 + x % 3])
    }
  }
  assertPixels()
  resize()
  expect(putImageData).toHaveBeenCalledTimes(1)
  width = 105; height = 93; resize()
  assertPixels()
  expect(putImageData).toHaveBeenCalledTimes(2)
  unmount()
  expect(disconnect).toHaveBeenCalledOnce()
})
