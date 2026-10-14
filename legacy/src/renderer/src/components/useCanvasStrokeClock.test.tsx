import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer, readLayerColor } from '@/core/document'
import { beginPixelEdit, commitPixelEdit } from '@/core/history'
import { CanvasInputState, type CanvasDragState } from '@/core/canvas-input'
import { sessionFromDocument } from '@/store/workspace-session'
import { useCanvasStrokeClock } from './useCanvasStrokeClock'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('stationary airbrush work', () => {
  it.each([255, 128])('skips unchanged batches and preserves pixels and undo for alpha %i', (alpha) => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const document = createDocument('airbrush hold', 64, 64, 'rgba', false)
    const session = sessionFromDocument(document)
    Object.assign(session, { tool: 'airbrush', airbrushParticleRadius: 1, airbrushDensity: 128, airbrushScatterRadius: 64 })
    const layer = getActiveLayer(document)
    const edit = beginPixelEdit(layer.id)
    const drag = { kind: 'airbrush', start: { x: 20, y: 20 }, last: { x: 20, y: 20 }, edit, color: { r: 90, g: 40, b: 20, a: alpha } } as CanvasDragState
    const inputRef = { current: new CanvasInputState() }
    inputRef.current.drag = drag
    const scheduleDraw = vi.fn(), invalidateCompositeRect = vi.fn(), selection = vi.fn(() => null)
    const ports = {
      session, inputRef, scheduleDraw, invalidateCompositeRect,
      paintSelectionForDrag: selection, symmetryCenter: { x: 32, y: 32 },
      liveInputSession: () => session, requestDrawRef: { current: vi.fn() },
      compositeCacheRef: { current: { invalidateAll: vi.fn() } }
    } as unknown as Parameters<typeof useCanvasStrokeClock>[0]
    const { result } = renderHook(() => useCanvasStrokeClock(ports))
    act(() => { for (let batch = 0; batch < 100; batch++) result.current.sprayAirbrushRef.current(drag) })
    expect(scheduleDraw).toHaveBeenCalledTimes(1)
    expect(invalidateCompositeRect).toHaveBeenCalledTimes(1)
    expect(selection).toHaveBeenCalledTimes(100)
    expect(readLayerColor(document, layer, 20 * 64 + 20)).toEqual(drag.color)
    // Moving into new pixels must resume rendering even within the same edit.
    drag.last = { x: 22, y: 20 }
    act(() => { result.current.sprayAirbrushRef.current(drag) })
    expect(scheduleDraw).toHaveBeenCalledTimes(2)
    const entry = commitPixelEdit(document, edit, 'airbrush')!
    expect(entry).not.toBeNull()
    entry.undo()
    expect(readLayerColor(document, layer, 20 * 64 + 20).a).toBe(0)
    entry.redo()
    expect(readLayerColor(document, layer, 20 * 64 + 22)).toEqual(drag.color)
  })
})
