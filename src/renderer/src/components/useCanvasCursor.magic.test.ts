import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CanvasInputState, temporaryMoveToolAllowed, temporaryMoveForCanvasInteractionAllowed } from '@/core/canvas-input'
import { canvasCursors } from '@/core/canvas-visuals'
import { createDocument, getActiveLayer } from '@/core/document-model'
import { rectSelection } from '@/core/selection'
import { sessionFromDocument } from '@/store/workspace-session'
import { useWorkspace } from '@/store/workspace'
import { useCanvasCursor } from './useCanvasCursor'

afterEach(() => { cleanup(); useWorkspace.setState({ sessions: [], activeId: null }) })

it.each([false, true])('shows the move cursor with Ctrl, including inside an existing selection: %s', selected => {
  const session = sessionFromDocument(createDocument('magic cursor', 64, 64, 'rgba'))
  session.tool = 'selection'
  session.selectionKind = 'magic'
  if (selected) session.selection = rectSelection(0, 0, 64, 64)
  useWorkspace.setState({ sessions: [session], activeId: session.document.id })
  const input = new CanvasInputState()
  const canvas = document.createElement('canvas')
  const ports = {
    session, inputRef: { current: input }, canvasRef: { current: canvas },
    liveViewRef: { current: { ...session.view, zoom: 1, panX: 0, panY: 0 } },
    stageSize: () => ({ width: 64, height: 64 }), stagePoint: (x: number, y: number) => ({ x, y }),
    symmetryCenter: { x: 0, y: 0 }, symmetryAxisPreferences: { locked: false, thickness: 1 },
    canvasResizePreviewRef: { current: null }, canvasResizeHitAt: () => null,
    quickToolActive: () => false, symmetryAxisHitAt: () => null,
    temporaryMoveActive: (event: { ctrlKey: boolean }) => event.ctrlKey && temporaryMoveToolAllowed(session.tool, session.moveKind, session.selectionKind),
    localPointAt: () => ({ x: 32, y: 32 }), cursorCompositePointSamplerFor: () => () => ({ r: 0, g: 0, b: 0, a: 255 }),
    activeLayer: getActiveLayer(session.document), activeLayerEditable: true, selectionLayersEditable: true,
    hasSelectedMovableLayer: true, modifierActive: () => false, wheelBrushSizePreviewRef: { current: false },
    selectionPivotHitAt: () => false, topEditableLayerAt: () => getActiveLayer(session.document)
  } as unknown as Parameters<typeof useCanvasCursor>[0]
  const { result } = renderHook(() => useCanvasCursor(ports))
  result.current.updateCursorAt(32, 32, true, false)
  expect(canvas.style.cursor).toBe(canvasCursors.move)
  expect(input.sampling).toBe(false)
  expect(temporaryMoveForCanvasInteractionAllowed('selection', 'move', selected ? 'inside' : 'outside', false, 'magic')).toBe(true)
  result.current.updateCursorAt(32, 32, false, false)
  if (!selected) expect(canvas.style.cursor).not.toBe(canvasCursors.move)
})

it('keeps the other selection tools in their existing interaction mode', () => {
  for (const kind of ['rectangle', 'ellipse', 'lasso', 'polygon-lasso', 'brush'] as const) {
    expect(temporaryMoveToolAllowed('selection', 'move', kind)).toBe(false)
    expect(temporaryMoveForCanvasInteractionAllowed('selection', 'move', 'outside', false, kind)).toBe(false)
  }
})
