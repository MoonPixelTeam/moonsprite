import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_CHECKERBOARD_PREFERENCES } from '@/core/file-preferences'
import { deviceAlignedCanvasRect } from '@/core/canvas-render-plan'
import { drawAnimationTweenPreview, drawTweenCheckerboard, drawTweenPixelPath, publishAnimationTweenPreview, subscribeAnimationTweenPreview, tweenPreviewCanvas } from './animation-tween-preview'

afterEach(() => { publishAnimationTweenPreview('preview-test', null); vi.restoreAllMocks() })

it('scales preference checker units with content and anchors them to the document origin', () => {
  const fillRect = vi.fn()
  const context = { fillRect } as unknown as CanvasRenderingContext2D
  const checker = { ...DEFAULT_CHECKERBOARD_PREFERENCES, size: 16 as const }
  drawTweenCheckerboard(context, 128, 96, checker, 2, 10, 6)
  // A 16-document-pixel square becomes 32 preview pixels; odd parity starts one cell right.
  expect(fillRect).toHaveBeenCalledWith(42, 6, 32, 32)
  expect(fillRect).toHaveBeenCalledWith(10, 38, 32, 32)
  expect(fillRect).not.toHaveBeenCalledWith(10, 6, 32, 32)
  fillRect.mockClear()
  drawTweenCheckerboard(context, 128, 96, checker, 1, -5, -3)
  expect(fillRect).toHaveBeenCalledWith(11, 0, 16, 13)
  expect(fillRect).toHaveBeenCalledWith(0, 13, 11, 16)
  fillRect.mockClear()
  drawTweenCheckerboard(context, 128, 96, checker, 0.01, 0, 0)
  expect(fillRect).toHaveBeenCalledTimes(1)
})

it.each(['rgba', 'indexed'] as const)('preserves original %s endpoint colors, alpha and source pixels', (format) => {
  const putImageData = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }), putImageData
  } as unknown as CanvasRenderingContext2D)
  const source = format === 'rgba'
    ? { format, width: 2, height: 1, offsetX: 8, offsetY: 5, pixels: new Uint8ClampedArray([200, 30, 0, 128, 0, 0, 0, 0]) }
    : { format, width: 2, height: 1, offsetX: 8, offsetY: 5, pixels: new Uint32Array([1, 0]) }
  const before = source.pixels.slice()
  const canvas = tweenPreviewCanvas(source, [{ id: 1, name: 'Source', color: { r: 200, g: 30, b: 0, a: 128 } }])
  expect(canvas.width).toBe(2)
  const output = putImageData.mock.calls[0][0].data as Uint8ClampedArray
  expect(Array.from(output.slice(0, 4))).toEqual([200, 30, 0, 128])
  expect(output[7]).toBe(0)
  expect(source.pixels).toEqual(before)
})

it('routes transient previews to their document and uses device-aligned canvas coordinates', () => {
  const redraw = vi.fn(), unrelated = vi.fn()
  const unsubscribe = subscribeAnimationTweenPreview('preview-test', redraw)
  const unsubscribeOther = subscribeAnimationTweenPreview('other', unrelated)
  const canvas = document.createElement('canvas')
  canvas.width = 3
  canvas.height = 2
  publishAnimationTweenPreview('preview-test', { canvas, offsetX: 8, offsetY: -2 })
  expect(redraw).toHaveBeenCalledOnce()
  expect(unrelated).not.toHaveBeenCalled()
  const drawImage = vi.fn()
  const context = { save: vi.fn(), restore: vi.fn(), drawImage, globalAlpha: 1 } as unknown as CanvasRenderingContext2D
  const deviceScale = { x: 1.5, y: 1.5 }
  drawAnimationTweenPreview(context, 'preview-test', 10.3, 20.2, 2.5, deviceScale)
  const rect = deviceAlignedCanvasRect(30.3, 15.2, 7.5, 5, deviceScale)
  expect(drawImage).toHaveBeenCalledWith(canvas, rect.left, rect.top, rect.width, rect.height)
  expect(context.globalAlpha).toBe(0.4)
  drawImage.mockClear()
  drawAnimationTweenPreview(context, 'other', 0, 0, 1, deviceScale)
  publishAnimationTweenPreview('preview-test', null)
  drawAnimationTweenPreview(context, 'preview-test', 0, 0, 1, deviceScale)
  expect(drawImage).not.toHaveBeenCalled()
  unsubscribe()
  unsubscribeOther()
  publishAnimationTweenPreview('preview-test', null)
  expect(redraw).toHaveBeenCalledTimes(2)
})

it('draws one document pixel per line cell using the artwork zoom and origin', () => {
  const fillRect = vi.fn()
  const context = { fillRect, fillStyle: '' }
  drawTweenPixelPath(context, [{ x: 2, y: 3 }, { x: 4, y: 3 }], 100, 80, { zoom: 8, originX: 4, originY: 2 })
  expect(fillRect.mock.calls.slice(0, 3)).toEqual([[20, 26, 8, 8], [28, 26, 8, 8], [36, 26, 8, 8]])
  expect(fillRect.mock.calls.every(([, , width, height]) => width === 8 && height === 8)).toBe(true)
  expect(context.fillStyle).toBe('#FFB300')
  fillRect.mockClear()
  drawTweenPixelPath(context, [{ x: 2, y: 3 }, { x: 4, y: 3 }], 100, 80, { zoom: 2, originX: 4, originY: 2 })
  expect(fillRect.mock.calls.slice(0, 3)).toEqual([[8, 8, 2, 2], [10, 8, 2, 2], [12, 8, 2, 2]])
})
it('clips far-offscreen document paths before generating pixel cells', () => {
  const fillRect = vi.fn()
  drawTweenPixelPath({ fillRect, fillStyle: '' }, [{ x: -1e9, y: 3 }, { x: 1e9, y: 3 }], 100, 80, { zoom: 2, originX: 0, originY: 0 })
  expect(fillRect.mock.calls.length).toBeLessThanOrEqual(51)
  expect(fillRect.mock.calls[0]).toEqual([0, 6, 2, 2])
})
