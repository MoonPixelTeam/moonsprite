import { describe, expect, it, vi } from 'vitest'
import { installCanvasResumeRedraw } from './canvas-render-resume'

describe('canvas render resume', () => {
  it('invalidates and requests two visible frames, then removes listeners', () => {
    const invalidate = vi.fn()
    const request = vi.fn()
    const frames: FrameRequestCallback[] = []
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const cleanup = installCanvasResumeRedraw(invalidate, request)

    window.dispatchEvent(new Event('focus'))
    expect(invalidate).toHaveBeenCalledOnce()
    expect(frames).toHaveLength(1)
    frames.shift()?.(0)
    expect(request).toHaveBeenCalledOnce()
    frames.shift()?.(0)
    expect(request).toHaveBeenCalledTimes(2)

    cleanup()
    window.dispatchEvent(new Event('focus'))
    expect(invalidate).toHaveBeenCalledOnce()
    expect(cancelFrame).not.toHaveBeenCalled()
    requestFrame.mockRestore()
    cancelFrame.mockRestore()
  })
})
