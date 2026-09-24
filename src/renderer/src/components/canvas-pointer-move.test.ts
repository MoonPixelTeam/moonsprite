import { expect, it, vi } from 'vitest'
import { CanvasInputState } from '@/core/canvas-input'
import { createCanvasPointerMove } from './canvas-pointer-move'

it('updates a pen marquee from the latest position without replaying pressure samples', () => {
  const input = new CanvasInputState()
  input.drag = { kind: 'marquee', start: { x: 0, y: 0 }, last: { x: 0, y: 0 } }
  const point = { x: 120, y: 80 }
  const session = { document: { id: 'marquee-test' }, tool: 'selection', selectionKind: 'rectangle', selectedGroupIds: [] }
  const moveMarquee = vi.fn(() => true)
  const adapt = vi.fn()
  const getCoalescedEvents = vi.fn(() => { throw new Error('Marquee must not request historical pen samples') })
  const ports = {
    inputRef: { current: input }, liveInputSession: () => session,
    canvasRef: { current: null }, liveViewRef: { current: { rotation: 0 } },
    pressureAdapterRef: { current: { adapt } }, tabletPreferences: {},
    activeLayer: { kind: 'raster' }, modifierActive: () => false,
    moveSymmetry: () => false, autoPanSelection: vi.fn(), updateCursor: vi.fn(),
    lineConnectionPreviewActive: () => false, localPoint: () => point,
    moveQuickSampling: () => false, selectionInput: { moveMarquee }
  } as unknown as Parameters<typeof createCanvasPointerMove>[0]
  const event = {
    nativeEvent: { getCoalescedEvents }, currentTarget: { style: {} },
    pointerType: 'pen', pointerId: 7, buttons: 1, clientX: 120, clientY: 80
  } as unknown as Parameters<ReturnType<typeof createCanvasPointerMove>>[0]
  createCanvasPointerMove(ports)(event)
  expect(moveMarquee).toHaveBeenCalledWith(expect.objectContaining({ drag: input.drag, point, event }))
  expect(input.drag.last).toEqual(point)
  expect(getCoalescedEvents).not.toHaveBeenCalled()
  expect(adapt).not.toHaveBeenCalled()
})
