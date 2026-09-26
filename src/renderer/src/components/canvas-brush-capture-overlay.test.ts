import { expect, it, vi } from 'vitest'
import { drawBrushCaptureSurround } from './canvas-brush-capture-overlay'

it('clips the dimming to the viewport outside the transformed document', () => {
  const context = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), fillRect: vi.fn(), fillStyle: '' }
  const applyView = vi.fn()
  drawBrushCaptureSurround(context as unknown as CanvasRenderingContext2D, { width: 800, height: 600 }, { left: 120, top: 80, width: 256, height: 192 }, applyView)
  expect(context.rect.mock.calls).toEqual([[0, 0, 800, 600], [120, 80, 256, 192]])
  expect(applyView.mock.invocationCallOrder[0]).toBeGreaterThan(context.rect.mock.invocationCallOrder[0])
  expect(applyView.mock.invocationCallOrder[0]).toBeLessThan(context.rect.mock.invocationCallOrder[1])
  expect(context.clip).toHaveBeenCalledWith('evenodd')
  expect(context.fillStyle).toBe('rgba(0, 0, 0, 0.5)')
  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 800, 600)
  expect(context.save).toHaveBeenCalledTimes(2)
  expect(context.restore).toHaveBeenCalledTimes(2)
})
