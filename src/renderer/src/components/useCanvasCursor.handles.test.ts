import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CanvasInputState } from '@/core/canvas-input'
import { createDocument } from '@/core/document-model'
import { canvasCursors, resizeCursors } from '@/core/canvas-visuals'
import { sessionFromDocument } from '@/store/workspace-session'
import { useWorkspace } from '@/store/workspace'
import { useCanvasCursor } from './useCanvasCursor'

afterEach(() => { cleanup(); useWorkspace.setState({ sessions: [], activeId: null }) })
function fixture() {
  const session = sessionFromDocument(createDocument('handles', 128, 128, 'rgba'))
  session.tool = 'selection'
  const canvas = document.createElement('canvas')
  const ports = {
    session, canvasRef: { current: canvas }, inputRef: { current: new CanvasInputState() },
    liveViewRef: { current: { ...session.view, rotation: 0, mirrored: false, mirroredVertical: false } },
    displayedSelectionPoint: (point: { x: number; y: number }) => point,
    freeTransformQuadForSession: () => session.freeTransformQuad ?? null,
    symmetryCenter: { x: 0, y: 0 }, symmetryAxisPreferences: { locked: false, thickness: 1 },
    scheduleDraw: vi.fn()
  } as unknown as Parameters<typeof useCanvasCursor>[0]
  useWorkspace.setState({ sessions: [session], activeId: session.document.id })
  return { session, ports }
}
it.each([[100, 5], [5, 100]])('keeps all corner directions after a %sx%s selection becomes floating', (width, height) => {
  const { session, ports } = fixture()
  session.selection = { x: 10, y: 10, width, height }
  const { result } = renderHook(() => useCanvasCursor(ports))
  for (const handle of ['nw', 'ne', 'sw', 'se'] as const) expect(result.current.resizeCursorForHit(handle)).toBe(resizeCursors[handle])
  session.pendingPaste = { transformTarget: { ...session.selection }, transformAngle: 0 } as NonNullable<typeof session.pendingPaste>
  for (const handle of ['nw', 'ne', 'sw', 'se'] as const) expect(result.current.resizeCursorForHit(handle)).toBe(resizeCursors[handle])
  session.pendingPaste.transformAngle = 90
  expect(result.current.resizeCursorForHit('nw')).toBe(canvasCursors.neswResize)
  expect(result.current.resizeCursorForHit('ne')).toBe(canvasCursors.nwseResize)
})
it('uses actual free-transform corners instead of the old rectangle', () => {
  const { session, ports } = fixture()
  session.selection = { x: 10, y: 10, width: 40, height: 40 }
  session.freeTransformActive = true
  session.freeTransformQuad = { nw: { x: 50, y: 10 }, ne: { x: 50, y: 50 }, se: { x: 10, y: 50 }, sw: { x: 10, y: 10 } }
  const { result } = renderHook(() => useCanvasCursor(ports))
  expect(result.current.resizeCursorForHit('nw')).toBe(canvasCursors.neswResize)
  expect(result.current.resizeCursorForHit('ne')).toBe(canvasCursors.nwseResize)
})
