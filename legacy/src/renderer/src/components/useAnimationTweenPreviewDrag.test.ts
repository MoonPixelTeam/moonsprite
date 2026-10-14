import { afterEach, expect, it, vi } from 'vitest'
import { documentPointFromViewportPointContinuous, viewportPointFromDocumentPointContinuous } from '@/core/view-geometry'
import { publishAnimationTweenPreview } from './animation-tween-preview'
import { createAnimationTweenPreviewDrag } from './useAnimationTweenPreviewDrag'

afterEach(() => publishAnimationTweenPreview('drag-test', null))

function fixture(rotation = 0, mirrored = false) {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 3
  canvas.setPointerCapture = vi.fn()
  canvas.hasPointerCapture = vi.fn(() => true)
  canvas.releasePointerCapture = vi.fn()
  const owner = {}
  const onChange = vi.fn((x: number, y: number) => publishAnimationTweenPreview('drag-test', {
    canvas, offsetX: x, offsetY: y, move: { owner, x, y, onChange }
  }))
  onChange(10, 5)
  onChange.mockClear()
  const view = { zoom: 2.5, panX: 17, panY: -8, rotation, mirrored }
  let moveTool = true
  const controller = createAnimationTweenPreviewDrag({
    documentId: () => 'drag-test', moveToolActive: () => moveTool,
    pointAt: (x, y) => {
      const point = documentPointFromViewportPointContinuous({ x, y }, 400, 300, 64, 64, view, 'view')
      return { local: point, repeated: point }
    }
  })
  const event = (x: number, y: number, button = 0) => {
    const point = viewportPointFromDocumentPointContinuous({ x, y }, 400, 300, 64, 64, view, 'view')
    return { clientX: point.x, clientY: point.y, button, pointerId: 1, currentTarget: canvas, preventDefault: vi.fn() }
  }
  return { controller, event, onChange, canvas, setMoveTool: (value: boolean) => { moveTool = value } }
}

it.each([[0, false], [90, false], [33, true]] as const)('drags in document pixels under rotation %s and mirroring %s', (rotation, mirrored) => {
  const { controller, event, onChange, canvas } = fixture(rotation, mirrored)
  expect(controller.pointerDown(event(11, 6))).toBe(true)
  expect(canvas.setPointerCapture).toHaveBeenCalledWith(1)
  expect(controller.pointerMove(event(18.2, 2.9))).toBe(true)
  expect(onChange).toHaveBeenLastCalledWith(17, 2)
  expect(controller.pointerUp(event(19, 3))).toBe(true)
  expect(onChange).toHaveBeenLastCalledWith(18, 2)
  expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1)
  expect(controller.pointerMove(event(30, 40))).toBe(false)
})

it('keeps navigation and other tools available and consumes misses without moving underlying artwork', () => {
  const { controller, event, onChange, setMoveTool } = fixture()
  expect(controller.pointerDown(event(11, 6, 1))).toBe(false)
  setMoveTool(false)
  expect(controller.pointerDown(event(11, 6))).toBe(false)
  setMoveTool(true)
  expect(controller.pointerDown(event(2, 2))).toBe(true)
  expect(controller.pointerMove(event(30, 40))).toBe(true)
  expect(controller.pointerUp(event(30, 40))).toBe(true)
  expect(onChange).not.toHaveBeenCalled()
})

it('restores the starting displacement on cancellation and ignores a disabled preview', () => {
  const { controller, event, onChange } = fixture()
  controller.pointerDown(event(11, 6))
  controller.pointerMove(event(18, 8))
  expect(controller.pointerCancel(event(18, 8))).toBe(true)
  expect(onChange).toHaveBeenLastCalledWith(10, 5)
  controller.pointerDown(event(11, 6))
  publishAnimationTweenPreview('drag-test', null)
  onChange.mockClear()
  expect(controller.pointerMove(event(20, 20))).toBe(true)
  expect(controller.pointerUp(event(20, 20))).toBe(true)
  expect(onChange).not.toHaveBeenCalled()
  expect(controller.pointerDown(event(11, 6))).toBe(false)
})

it('clamps displacement to the same limits as the dialog', () => {
  const { controller, event, onChange } = fixture()
  controller.pointerDown(event(11, 6))
  controller.pointerUp(event(20000, -20000))
  expect(onChange).toHaveBeenLastCalledWith(16384, -16384)
})
