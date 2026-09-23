import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { CanvasInputState } from '@/core/canvas-input'
import { useWorkspace } from '@/store/workspace'
import { canvasBrushSizePreview, canvasBrushSizePreviewSession, flushCanvasBrushSize, queueCanvasBrushSize } from './canvas-brush-size-update'
import { createCanvasKeyboardRouter } from './canvas-keyboard-router'

beforeEach(() => {
  vi.useFakeTimers()
  useWorkspace.setState({ sessions: [], activeId: null })
})
afterEach(() => {
  window.dispatchEvent(new Event('blur'))
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.querySelectorAll('canvas').forEach(canvas => canvas.remove())
})

function fixture() {
  useWorkspace.getState().addSession(createDocument('size gesture', 16, 16, 'rgba'))
  const session = useWorkspace.getState().sessions[0]
  const input = new CanvasInputState()
  input.modifierBrushSize = { x: 0, y: 0, size: session.brushSize }
  const canvas = document.createElement('canvas')
  document.body.append(canvas)
  return { session, input, canvas, queue: (size: number) => queueCanvasBrushSize(input, session, size, canvas) }
}

it('coalesces a burst into one store update with the latest size', () => {
  const { session, queue } = fixture()
  const notified = vi.fn(), unsubscribe = useWorkspace.subscribe(notified)
  const contentRevision = session.contentRevision
  const dirty = session.document.dirty
  for (let size = 2; size <= 120; size++) queue(size)
  expect(notified).not.toHaveBeenCalled()
  vi.advanceTimersToNextFrame()
  expect(notified).toHaveBeenCalledOnce()
  expect(session.brushSize).toBe(120)
  expect(session.contentRevision).toBe(contentRevision)
  expect(session.document.dirty).toBe(dirty)
  unsubscribe()
})

it('keeps 120 sizing frames local and commits once before the next stroke', () => {
  const { session, input, canvas } = fixture()
  const initial = session.brushSize, revision = session.uiRevision
  const notified = vi.fn(), unsubscribe = useWorkspace.subscribe(notified)
  for (let size = 2; size <= 121; size++) {
    queueCanvasBrushSize(input, session, size, canvas, true)
    vi.advanceTimersToNextFrame()
    expect(canvasBrushSizePreviewSession(input, session).brushSize).toBe(size)
    expect(canvasBrushSizePreview(session.document.id, session.tool)).toBe(size)
    expect(session.brushSize).toBe(initial)
  }
  expect(notified).not.toHaveBeenCalled()
  expect(session.uiRevision).toBe(revision)
  window.dispatchEvent(new Event('pointerdown'))
  expect(session.brushSize).toBe(121)
  expect(notified).toHaveBeenCalledOnce()
  expect(canvasBrushSizePreviewSession(input, session)).toBe(session)
  expect(canvasBrushSizePreview(session.document.id, session.tool)).toBeNull()
  unsubscribe()
})

it.each(['switched', 'tool-changed', 'closed'])('discards a local preview when its target is %s', reason => {
  const { session, input, canvas } = fixture()
  queueCanvasBrushSize(input, session, 37, canvas, true)
  vi.advanceTimersToNextFrame()
  if (reason === 'switched') useWorkspace.getState().addSession(createDocument('other', 16, 16, 'rgba'))
  else if (reason === 'tool-changed') useWorkspace.getState().setTool('eraser')
  else canvas.remove()
  flushCanvasBrushSize(input)
  expect(canvasBrushSizePreview(session.document.id, 'pencil')).toBeNull()
  expect(session.brushSize).not.toBe(37)
})

it.each(['pointerleave', 'pointercancel'])('commits the local preview on canvas %s', event => {
  const { session, input, canvas } = fixture()
  queueCanvasBrushSize(input, session, 48, canvas, true)
  vi.advanceTimersToNextFrame()
  canvas.dispatchEvent(new Event(event))
  expect(session.brushSize).toBe(48)
  expect(canvasBrushSizePreview(session.document.id, session.tool)).toBeNull()
})

it.each(['keyup', 'blur'])('commits the local preview on %s even after its animation frame completed', event => {
  const { session, input, canvas } = fixture()
  queueCanvasBrushSize(input, session, 53, canvas, true)
  vi.advanceTimersToNextFrame()
  window.dispatchEvent(new Event(event))
  expect(session.brushSize).toBe(53)
  expect(canvasBrushSizePreview(session.document.id, session.tool)).toBeNull()
})

it.each(['keyup', 'pointerdown', 'pointerup', 'blur'])('flushes the final size before %s handlers', event => {
  const { session, queue } = fixture()
  const observed = vi.fn(() => session.brushSize)
  window.addEventListener(event, observed, { once: true })
  queue(35)
  window.dispatchEvent(new Event(event))
  expect(observed).toHaveReturnedWith(35)
  vi.advanceTimersToNextFrame()
  expect(session.brushSize).toBe(35)
})

it('preserves the final size when the earlier keyboard router releases the gesture', () => {
  const { session, input, queue } = fixture()
  const unregister = createCanvasKeyboardRouter(window).register({ isActive: () => true, keyUp: () => {
    flushCanvasBrushSize(input)
    input.modifierBrushSize = null
  } })
  queue(47)
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' }))
  expect(session.brushSize).toBe(47)
  expect(input.modifierBrushSize).toBeNull()
  unregister()
})

it.each(['closed', 'switched', 'tool-changed'])('does not apply stale updates after the target is %s', reason => {
  const { session, canvas, queue } = fixture()
  const initialSize = session.brushSize
  queue(50)
  if (reason === 'closed') canvas.remove()
  if (reason === 'switched') useWorkspace.getState().addSession(createDocument('other', 16, 16, 'rgba'))
  if (reason === 'tool-changed') useWorkspace.getState().setTool('eraser')
  vi.advanceTimersToNextFrame()
  if (reason !== 'tool-changed') expect(session.brushSize).toBe(initialSize)
  expect(useWorkspace.getState().sessions.at(-1)!.brushSize).not.toBe(50)
})

it.each([
  ['pencil', 'setBrushSize', 'brushSize', 128],
  ['airbrush', 'setAirbrushScatterRadius', 'airbrushScatterRadius', 64],
  ['liquify', 'setLiquifyRadius', 'liquifyRadius', 128]
] as const)('does not publish unchanged/clamped %s sizes', (tool, command, property, maximum) => {
  const { session, queue } = fixture()
  useWorkspace.getState().setTool(tool)
  useWorkspace.getState()[command](maximum)
  const notified = vi.fn(), unsubscribe = useWorkspace.subscribe(notified)
  for (const size of [maximum, maximum + 1, maximum + 100, NaN]) useWorkspace.getState()[command](size)
  expect(notified).not.toHaveBeenCalled()
  queue(25)
  vi.advanceTimersToNextFrame()
  expect(session[property]).toBe(25)
  expect(notified).toHaveBeenCalledOnce()
  unsubscribe()
})
