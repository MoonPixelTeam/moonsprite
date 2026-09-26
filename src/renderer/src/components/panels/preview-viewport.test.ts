import { afterEach, expect, it, vi } from 'vitest'
import { measurePreviewViewport } from './preview-viewport'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('measures the clipped frame and includes interface scaling in the backing ratio', () => {
  vi.stubGlobal('devicePixelRatio', 1.25)
  const frame = document.createElement('div')
  const canvas = document.createElement('canvas')
  frame.append(canvas)
  Object.defineProperties(frame, {
    clientWidth: { value: 200 }, clientHeight: { value: 100 },
    offsetWidth: { value: 202 }, clientLeft: { value: 1 }, clientTop: { value: 1 }
  })
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 303, 153))
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(11.5, 21.5, 768, 768))
  expect(measurePreviewViewport(canvas)).toEqual({
    width: 200, height: 100, left: 11.5, top: 21.5, screenScale: 1.5, dpr: 1.875
  })
})
