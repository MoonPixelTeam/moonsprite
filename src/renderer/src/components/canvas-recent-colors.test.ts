import { beforeEach, expect, it } from 'vitest'
import type { CanvasDragState } from '@/core/canvas-input'
import { beginPixelEdit } from '@/core/history'
import { loadRecentColors } from '@/core/recent-colors'
import { rememberPaintedDrag } from './canvas-recent-colors'
const red = { r: 255, g: 0, b: 0, a: 255 }
const blue = { r: 0, g: 0, b: 255, a: 255 }
const drag = (): CanvasDragState => ({ kind: 'draw', start: { x: 0, y: 0 }, last: { x: 0, y: 0 }, color: red, edit: beginPixelEdit('layer') })
beforeEach(() => localStorage.clear())
it('waits for the first pixel modification and only records once per stroke', () => {
  const stroke = drag()
  rememberPaintedDrag(stroke, 'pencil')
  expect(loadRecentColors()).toEqual([])
  stroke.edit!.before.set(0, 0)
  rememberPaintedDrag(stroke, 'pencil')
  expect(loadRecentColors()).toEqual([red])
  stroke.color = blue
  rememberPaintedDrag(stroke, 'pencil')
  expect(loadRecentColors()).toEqual([red])
  const next = drag(); next.color = blue; next.edit!.before.set(0, 0)
  rememberPaintedDrag(next, 'pencil')
  expect(loadRecentColors()).toEqual([blue, red])
})
it('ignores navigation, erasing and transparent painting', () => {
  const stroke = drag(); stroke.edit!.before.set(0, 0)
  rememberPaintedDrag(stroke, 'eraser')
  stroke.color = { ...red, a: 0 }; rememberPaintedDrag(stroke, 'pencil')
  expect(loadRecentColors()).toEqual([])
})
