import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CanvasInputState, temporaryMoveToolAllowed, temporaryMoveForCanvasInteractionAllowed } from '@/core/canvas-input'
import { canvasCursors } from '@/core/canvas-visuals'
import { createDocument, getActiveLayer } from '@/core/document-model'
import { rectSelection } from '@/core/selection'
import { sessionFromDocument } from '@/store/workspace-session'
import { useWorkspace } from '@/store/workspace'
import { useCanvasCursor } from './useCanvasCursor'
import { useCanvasKeyboardInput } from './useCanvasKeyboardInput'
import { createNavigationCanvasInput } from './canvas-input-navigation'

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
    scheduleDraw: vi.fn(),
    hasSelectedMovableLayer: true, modifierActive: () => false, wheelBrushSizePreviewRef: { current: false },
    selectionPivotHitAt: () => false, topEditableLayerAt: () => getActiveLayer(session.document)
  } as unknown as Parameters<typeof useCanvasCursor>[0]
  const { result } = renderHook(() => useCanvasCursor(ports))
  input.pointer.visible = true
  result.current.updateCursorAt(32, 32, false, false)
  const hadCorners = canvas.style.cursor === 'none'
  vi.mocked(ports.scheduleDraw).mockClear()
  result.current.updateCursorAt(32, 32, true, false)
  expect(ports.scheduleDraw).toHaveBeenCalledTimes(hadCorners ? 1 : 0)
  expect(canvas.style.cursor).toBe(canvasCursors.move)
  expect(input.sampling).toBe(false)
  expect(temporaryMoveForCanvasInteractionAllowed('selection', 'move', selected ? 'inside' : 'outside', false, 'magic')).toBe(true)
  vi.mocked(ports.scheduleDraw).mockClear()
  result.current.updateCursorAt(32, 32, false, false)
  expect(ports.scheduleDraw).toHaveBeenCalledTimes(hadCorners ? 1 : 0)
  vi.mocked(ports.scheduleDraw).mockClear()
  result.current.updateCursorAt(32, 32, false, false)
  expect(ports.scheduleDraw).not.toHaveBeenCalled()
  if (!selected) expect(canvas.style.cursor).not.toBe(canvasCursors.move)
})

it('keeps the other selection tools in their existing interaction mode', () => {
  for (const kind of ['rectangle', 'ellipse', 'lasso', 'polygon-lasso', 'brush'] as const) {
    expect(temporaryMoveToolAllowed('selection', 'move', kind)).toBe(false)
    expect(temporaryMoveForCanvasInteractionAllowed('selection', 'move', 'outside', false, kind)).toBe(false)
  }
})

it.each(['rectangle', 'ellipse', 'lasso', 'polygon-lasso', 'magic'] as const)('restores %s on Space release and hides its corners on middle press without movement', selectionKind => {
  const session = sessionFromDocument(createDocument('navigation cursor', 32, 32, 'rgba'))
  Object.assign(session, { tool: 'selection', selectionKind })
  useWorkspace.setState({ sessions: [session], activeId: session.document.id })
  const input = new CanvasInputState(), canvas = document.createElement('canvas')
  canvas.setPointerCapture = vi.fn()
  const scheduleDraw = vi.fn(), overlay = vi.fn()
  const ports = {
    session, inputRef: { current: input }, canvasRef: { current: canvas }, liveViewRef: { current: session.view },
    symmetryCenter: session.symmetryCenter, symmetryAxisPreferences: { locked: false, thickness: 1 },
    canvasResizePreviewRef: { current: null }, canvasResizeHitAt: () => null,
    quickToolActive: () => false, symmetryAxisHitAt: () => null, temporaryMoveActive: () => false,
    localPointAt: () => ({ x: 10, y: 10 }), cursorCompositePointSamplerFor: () => () => ({ r: 0, g: 0, b: 0, a: 255 }),
    activeLayer: getActiveLayer(session.document), activeLayerEditable: true, selectionLayersEditable: true,
    selectionInteractionEditable: true, scheduleDraw, hasSelectedMovableLayer: true, modifierActive: () => false,
    wheelBrushSizePreviewRef: { current: false }, selectionPivotHitAt: () => false
  } as unknown as Parameters<typeof useCanvasCursor>[0]
  const { result } = renderHook(() => useCanvasCursor(ports))
  Object.assign(input.pointer, { visible: true, clientX: 10, clientY: 10, point: { x: 10, y: 10 } })
  input.spaceHeld = true
  result.current.updateCursorAt(10, 10, false, false)
  expect(canvas.style.cursor).toBe(canvasCursors.grab)
  renderHook(() => useCanvasKeyboardInput({
    ...ports, updateCursorAt: result.current.updateCursorAt, shortcuts: { 'tool.hand.quick': ['Space'] },
    canvasResizeFrameRef: { current: null }, scheduleBrushPreviewOverlay: overlay,
    quickEyedropperActiveRef: { current: false }, quickEyedropperOriginalColorRef: { current: null }
  } as unknown as Parameters<typeof useCanvasKeyboardInput>[0]))
  act(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true })))
  expect(input.spaceHeld).toBe(false)
  expect(canvas.style.cursor).toBe('none')
  scheduleDraw.mockClear()
  const navigation = createNavigationCanvasInput({ ...ports, beginPanPreview: vi.fn(), scheduleBrushPreviewOverlay: overlay } as unknown as Parameters<typeof createNavigationCanvasInput>[0])
  navigation.beginPan({ event: { button: 1, pointerId: 7, clientX: 10, clientY: 10, currentTarget: canvas, preventDefault: vi.fn() } as unknown as React.PointerEvent<HTMLCanvasElement>, playbackNavigationTool: null })
  expect(canvas.style.cursor).toBe(canvasCursors.grabbing)
  expect(input.drag?.kind).toBe('pan')
  expect(scheduleDraw).toHaveBeenCalledOnce()
  result.current.updateCursorAt(10, 10, false, false)
  expect(canvas.style.cursor).toBe(canvasCursors.grabbing)
  // Space release during a held middle button must retain pan ownership.
  input.spaceHeld = true
  act(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true })))
  expect(canvas.style.cursor).toBe(canvasCursors.grabbing)
  input.finish()
  result.current.updateCursorAt(10, 10, false, false)
  expect(canvas.style.cursor).toBe('none')
})
