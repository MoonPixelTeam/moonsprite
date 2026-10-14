import { afterEach, expect, it, vi } from 'vitest'
import { referenceImageDisplayCanvas } from './reference-image-display'
import { useReferenceImages } from './reference-image-state'

afterEach(() => { vi.restoreAllMocks(); useReferenceImages.setState({ relativeLuminance: false }) })

it('shows perceptual brightness with original alpha, caches it, and restores the untouched original', () => {
  const source = document.createElement('canvas')
  source.width = 3
  source.height = 1
  const pixels = new Uint8ClampedArray([255, 0, 0, 128, 0, 255, 0, 255, 0, 0, 255, 0])
  const getImageData = vi.fn(() => ({ data: pixels.slice(), width: 3, height: 1 }))
  const putImageData = vi.fn()
  vi.spyOn(source, 'getContext').mockReturnValue({ getImageData } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ putImageData } as unknown as CanvasRenderingContext2D)
  expect(referenceImageDisplayCanvas(source, false)).toBe(source)
  expect(getImageData).not.toHaveBeenCalled()
  const gray = referenceImageDisplayCanvas(source, true)
  expect(gray).not.toBe(source)
  expect([gray.width, gray.height]).toEqual([3, 1])
  expect(Array.from(putImageData.mock.calls[0][0].data)).toEqual([127, 127, 127, 128, 220, 220, 220, 255, 76, 76, 76, 0])
  expect(referenceImageDisplayCanvas(source, true)).toBe(gray)
  expect(getImageData).toHaveBeenCalledTimes(1)
  expect(referenceImageDisplayCanvas(source, false)).toBe(source)
  expect(Array.from(pixels)).toEqual([255, 0, 0, 128, 0, 255, 0, 255, 0, 0, 255, 0])
})

it('toggles the reference display without changing pictures or their view positions', () => {
  const state = useReferenceImages.getState()
  state.toggleRelativeLuminance()
  expect(useReferenceImages.getState().relativeLuminance).toBe(true)
  expect(useReferenceImages.getState().images).toBe(state.images)
  state.toggleRelativeLuminance()
  expect(useReferenceImages.getState().relativeLuminance).toBe(false)
})
