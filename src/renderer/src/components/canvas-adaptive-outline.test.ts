import { expect, it, vi } from 'vitest'
import { alignCanvasStrokePath } from './canvas-adaptive-outline'

const context = (lineWidth: number) => ({
  lineWidth,
  getTransform: () => ({ a: 1, b: 0, c: 0, d: 1 }),
  translate: vi.fn()
}) as unknown as CanvasRenderingContext2D

it('moves odd-width brush outlines onto physical pixel centres before their path is generated', () => {
  const target = context(1)
  alignCanvasStrokePath(target)
  expect(target.translate).toHaveBeenCalledWith(0.5, 0.5)
})

it('keeps even-width brush outlines on physical pixel boundaries', () => {
  const target = context(2)
  alignCanvasStrokePath(target)
  expect(target.translate).not.toHaveBeenCalled()
})
