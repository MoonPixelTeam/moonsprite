import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CanvasInputState, type CanvasDragState } from '@/core/canvas-input'
import { createDocument, readLayerColorAt, writeLayerColor } from '@/core/document-model'
import { pendingGradientFor, setPendingGradient } from '@/core/canvas-gradient-confirmation'
import { rectSelection, selectionContains } from '@/core/selection'
import { gradientRegionSelection } from '@/core/gradient'
import { useWorkspace } from '@/store/workspace'
import { activePaintLayer, sessionFromDocument } from '@/store/workspace-session'
import { createFillCanvasInput } from './canvas-input-fill'
import { useCanvasGradientConfirmation } from './useCanvasGradientConfirmation'

afterEach(() => { cleanup(); for (const s of useWorkspace.getState().sessions) setPendingGradient(s.document.id, null); useWorkspace.setState({ sessions: [], activeId: null }); vi.restoreAllMocks() })
function setup() {
  const initial = sessionFromDocument(createDocument('pending gradient', 4, 2, 'rgba'))
  initial.tool = 'fill'; initial.fillKind = 'gradient'; initial.gradientTolerance = 0
  initial.primaryColor = { r: 255, g: 0, b: 0, a: 255 }; initial.secondaryColor = { r: 0, g: 0, b: 255, a: 255 }
  useWorkspace.setState({ sessions: [initial], activeId: initial.document.id })
  const canvas = document.createElement('canvas')
  canvas.hasPointerCapture = vi.fn(() => false); canvas.releasePointerCapture = vi.fn(); canvas.setPointerCapture = vi.fn()
  const inputRef = { current: new CanvasInputState() }
  const gradientEditRef = { current: null } as Parameters<typeof useCanvasGradientConfirmation>[0]['gradientEditRef']
  const draw = vi.fn()
  const hook = renderHook(() => {
    const sessions = useWorkspace(state => state.sessions)
    const session = sessions.find(s => s.document.id === initial.document.id) ?? initial
    const fillInput = createFillCanvasInput({
      gradientPreviewCoverageCacheRef: { current: null }, freeTileSourceEditForDrag: () => null,
      gradientDither: 'none', gradientType: session.gradientType, gradientGeometryOptionsForDrag: () => undefined,
      paintSelectionForDrag: () => session.selection, draw, t: (key: string) => key
    } as unknown as Parameters<typeof createFillCanvasInput>[0])
    return useCanvasGradientConfirmation({ session, canvasRef: { current: canvas }, inputRef, gradientEditRef,
      fillInput, mode: 'confirm', scheduleDraw: draw, localPoint: e => ({ x: e.clientX, y: e.clientY }),
      localContinuousPointAt: (x, y) => ({ x, y }), updateCursor: vi.fn(), syncPenCursor: vi.fn(),
      updateGradientDragGeometry: (drag, point) => { drag.last = point }, gradientStopsForButton: () => undefined,
      paintSelectionForDrag: () => session.selection })
  })
  const begin = (last = { x: 3, y: 0 }) => {
    const session = useWorkspace.getState().sessions[0]
    const drag = { kind: 'gradient', start: { x: 0, y: 0 }, last, color: session.primaryColor,
      gradientEndColor: session.secondaryColor, gradientPaintRegion: gradientRegionSelection(session.document, activePaintLayer(session), { x: 0, y: 0 }, session.gradientTolerance, true)
    } as CanvasDragState
    act(() => { expect(hook.result.current.defer(drag, session)).toBe(true) })
    return drag
  }
  return { ...hook, begin, initial, canvas, draw }
}
it('keeps pixels unchanged until apply, then commits one undoable gradient', () => {
  const h = setup(); const layer = activePaintLayer(h.initial)
  h.begin()
  expect(h.initial.history.canUndo).toBe(false)
  expect(readLayerColorAt(h.initial.document, layer, 0, 0).a).toBe(0)
  act(() => { expect(pendingGradientFor(h.initial.document.id)!.apply()).toBe(true) })
  expect(pendingGradientFor(h.initial.document.id)).toBeNull()
  expect(readLayerColorAt(h.initial.document, layer, 0, 0)).toEqual(h.initial.primaryColor)
  expect(readLayerColorAt(h.initial.document, layer, 3, 0)).toEqual(h.initial.secondaryColor)
  act(() => useWorkspace.getState().undo())
  expect(readLayerColorAt(h.initial.document, layer, 0, 0).a).toBe(0)
  expect(h.initial.history.canUndo).toBe(false)
})
it('Undo cancels the preview without undoing earlier document history', () => {
  const h = setup(); const undo = vi.spyOn(h.initial.history, 'undo')
  h.begin()
  act(() => useWorkspace.getState().undo())
  expect(pendingGradientFor(h.initial.document.id)).toBeNull()
  expect(undo).not.toHaveBeenCalled()
})
it.each(['selection', 'content', 'frame', 'lock'] as const)('invalidates a pending gradient when %s changes', change => {
  const h = setup(); h.begin()
  const pending = pendingGradientFor(h.initial.document.id)!
  act(() => useWorkspace.getState().mutateActive(session => {
    if (change === 'selection') session.selection = rectSelection(0, 0, 1, 1)
    if (change === 'content') session.contentRevision++
    if (change === 'frame') session.document.animation = { ...(session.document.animation ?? {}), activeFrameId: 'other' } as NonNullable<typeof session.document.animation>
    if (change === 'lock') activePaintLayer(session).locked = true
  }, false))
  expect(pendingGradientFor(h.initial.document.id)).toBeNull()
  expect(pending.apply()).toBe(false)
  expect(h.initial.history.canUndo).toBe(false)
})
it('recomputes tolerance from the original seed after moving the gradient start', () => {
  const h = setup(); const layer = activePaintLayer(h.initial)
  writeLayerColor(h.initial.document, layer, 0, { r: 100, g: 0, b: 0, a: 255 })
  writeLayerColor(h.initial.document, layer, 1, { r: 110, g: 0, b: 0, a: 255 })
  const drag = h.begin()
  expect(selectionContains(drag.gradientPaintRegion!, 1, 0)).toBe(false)
  drag.start = { x: 3, y: 1 }
  act(() => useWorkspace.getState().setGradientTolerance(255))
  expect(selectionContains(drag.gradientPaintRegion!, 1, 0)).toBe(true)
  act(() => useWorkspace.getState().setGradientTolerance(0))
  expect(selectionContains(drag.gradientPaintRegion!, 0, 0)).toBe(true)
  expect(selectionContains(drag.gradientPaintRegion!, 1, 0)).toBe(false)
})
it('does not enter confirmation for a click without a gradient extent', () => {
  const h = setup(); h.begin({ x: 0, y: 0 })
  expect(pendingGradientFor(h.initial.document.id)).toBeNull()
})
it('restores geometry when a handle drag loses pointer capture', () => {
  const h = setup(); const drag = h.begin({ x: 30, y: 0 })
  const event = (x: number) => ({ currentTarget: h.canvas, clientX: x, clientY: 0, button: 0, pointerId: 1, preventDefault: vi.fn() }) as unknown as React.PointerEvent<HTMLCanvasElement>
  act(() => { expect(h.result.current.beginPendingGradientEdit(event(30))).toBe(true); h.result.current.movePendingGradientEdit(event(50)) })
  expect(drag.last.x).toBe(50)
  act(() => h.result.current.cancelPendingGradientEdit(event(50)))
  expect(drag.last.x).toBe(30)
  expect(pendingGradientFor(h.initial.document.id)).not.toBeNull()
})
