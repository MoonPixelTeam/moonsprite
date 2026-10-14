import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CanvasInputState } from '@/core/canvas-input'
import { createDocument } from '@/core/document-model'
import { DEFAULT_TABLET_PREFERENCES } from '@/core/file-preferences'
import { sessionFromDocument } from '@/store/workspace-session'
import { useWorkspace } from '@/store/workspace'
import { useCanvasDeviceRouter } from './useCanvasDeviceRouter'
import { useCanvasToolSession } from './useCanvasToolSession'
import { canvasBrushSizePreviewSession, flushCanvasBrushSize, queueCanvasBrushSize } from './canvas-brush-size-update'

afterEach(() => { cleanup(); useWorkspace.setState({ sessions: [], activeId: null }); document.querySelectorAll('canvas').forEach(canvas => canvas.remove()) })

it('resizes over an inactive pane repeatedly using shared size without activating that pane', () => {
  const a = sessionFromDocument(createDocument('a', 16, 16, 'rgba'))
  const b = sessionFromDocument(createDocument('b', 16, 16, 'rgba'))
  Object.assign(a, { tool: 'pencil', brushSize: 12 })
  Object.assign(b, { tool: 'pencil', brushSize: 1 })
  useWorkspace.setState({ sessions: [a, b], activeId: a.document.id })
  const inputRef = { current: new CanvasInputState() }
  const tools = renderHook(() => useCanvasToolSession({ storedSession: b, inputRef, radialGradientCenterModifierActive: () => false, canvasResizePreviewRef: { current: null }, lineAnchor: null }))
  const canvas = document.createElement('canvas')
  document.body.append(canvas)
  const ports = {
    session: b, inputRef, canvasRef: { current: canvas }, liveInputSession: () => tools.result.current.liveInputSession(),
    activeLayer: b.document.layers[0], canvasResizePreviewRef: { current: null }, activeBrushImage: null,
    stageBounds: () => ({ left: 0, top: 0, right: 100, bottom: 100 }), modifierActive: () => true,
    keyDisplayWheelRef: { current: false }, updateCursorAt: vi.fn(), scheduleDraw: vi.fn(),
    liveViewRef: { current: b.view }, tabletPreferences: DEFAULT_TABLET_PREFERENCES
  } as unknown as Parameters<typeof useCanvasDeviceRouter>[0]
  renderHook(() => useCanvasDeviceRouter(ports))
  for (let i = 0; i < 3; i++) act(() => { canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: 20, clientY: 20 })) })
  expect(a.brushSize).toBe(15)
  expect(tools.result.current.activeToolBrushSize).toBe(15)
  expect(tools.result.current.session.brushSize).toBe(15)
  expect(tools.result.current.liveInputSession().brushSize).toBe(15)
  expect(useWorkspace.getState().activeId).toBe(a.document.id)
  inputRef.current.modifierBrushSize = { x: 0, y: 0, size: 15 }
  act(() => queueCanvasBrushSize(inputRef.current, tools.result.current.liveInputSession(), 19, canvas, true))
  expect(canvasBrushSizePreviewSession(inputRef.current, tools.result.current.liveInputSession()).brushSize).toBe(19)
  act(() => flushCanvasBrushSize(inputRef.current))
  expect(a.brushSize).toBe(19)
  expect(tools.result.current.session.brushSize).toBe(19)
  expect(useWorkspace.getState().activeId).toBe(a.document.id)
})
