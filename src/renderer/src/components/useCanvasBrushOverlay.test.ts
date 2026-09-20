import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CanvasInputState } from '@/core/canvas-input'
import { createDocument } from '@/core/document-model'
import { sessionFromDocument } from '@/store/workspace-session'
import { useWorkspace } from '@/store/workspace'
import { useCanvasBrushOverlay } from './useCanvasBrushOverlay'
import { flushCanvasBrushSize, queueCanvasBrushSize } from './canvas-brush-size-update'

afterEach(() => { cleanup(); window.dispatchEvent(new Event('blur')); vi.restoreAllMocks(); useWorkspace.setState({ sessions: [], activeId: null }); document.querySelectorAll('canvas').forEach(canvas => canvas.remove()) })

it.each(['pencil', 'eraser'] as const)('keeps solid %s hover and drawing on the overlay and clears the entire old outline', tool => {
  const session = sessionFromDocument(createDocument('cursor', 256, 256, 'rgba'))
  Object.assign(session, { tool, brushSize: 8, inkMode: 'simple', brushTexture: 'solid' })
  session.view = { ...session.view, zoom: 4.5, panX: 0.25, panY: 0.25 }
  useWorkspace.setState({ sessions: [session], activeId: session.document.id })
  const input = new CanvasInputState()
  Object.assign(input.pointer, { visible: true, point: { x: 128, y: 128 }, clientX: 600, clientY: 400 })
  const context = { save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), rect: vi.fn(),
    fill: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), lineWidth: 1, fillStyle: '', strokeStyle: '' }
  const canvas = document.createElement('canvas')
  document.body.append(canvas)
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const ports = { session, canvasRef: { current: canvas }, inputRef: { current: input }, liveViewRef: { current: session.view },
    brushPreviewMode: 'full-edge', brushEdgeColor: { r: 20, g: 20, b: 20, a: 255 }, drawingBrushPreviewEnabled: true,
    stageSize: () => ({ width: 1200, height: 800 }), stageDisplaySize: () => ({ width: 1200, height: 800 }), interfaceScale: 1,
    repeatedDocumentPointsAt: () => ({ local: input.pointer.point, repeated: input.pointer.point, offset: { x: 0, y: 0 } }),
    rotationIndicatorPosition: 'view', optimizedRotationEnabled: false, snapBrushPointToGrid: (p: unknown) => p,
    scheduleDraw: vi.fn(), activeToolBrushSize: 8
  } as unknown as Parameters<typeof useCanvasBrushOverlay>[0]
  const { result } = renderHook(() => useCanvasBrushOverlay(ports))
  result.current.brushPreviewCanvasRef.current = canvas
  expect(result.current.brushPreviewOverlaySupported(session)).toBe(true)
  act(() => result.current.brushPreviewDrawRef.current())
  expect(context.stroke).toHaveBeenCalledOnce()
  expect(context.fill).toHaveBeenCalledTimes(tool === 'eraser' ? 0 : 1)
  const oldOutline = [...context.moveTo.mock.calls, ...context.lineTo.mock.calls]
  context.clearRect.mockClear()
  input.pointer.point = { x: 140, y: 140 }
  act(() => result.current.brushPreviewDrawRef.current())
  const [x, y, width, height] = context.clearRect.mock.lastCall!
  expect(width * height).toBeLessThan(80 * 80)
  for (const [px, py] of oldOutline) { expect(px).toBeGreaterThan(x); expect(px).toBeLessThan(x + width); expect(py).toBeGreaterThan(y); expect(py).toBeLessThan(y + height) }
  const oldWidth = Math.max(...context.rect.mock.calls.map(call => call[2]))
  context.rect.mockClear()
  input.modifierBrushSize = { x: 0, y: 0, size: 8 }
  queueCanvasBrushSize(input, session, 12, canvas, true)
  act(() => result.current.brushPreviewDrawRef.current())
  expect(Math.max(...context.rect.mock.calls.map(call => call[2]))).toBeGreaterThan(oldWidth)
  expect(session.brushSize).toBe(8)
  act(() => flushCanvasBrushSize(input))
  input.modifierBrushSize = null
  input.drag = { kind: 'draw', start: { x: 140, y: 140 }, last: { x: 140, y: 140 }, lastBrushSize: 4 }
  expect(result.current.brushPreviewOverlaySupported(session)).toBe(true)
  context.fill.mockClear()
  act(() => result.current.brushPreviewDrawRef.current())
  expect(context.fill).not.toHaveBeenCalled()
  input.pointer.visible = false
  context.stroke.mockClear()
  act(() => result.current.brushPreviewDrawRef.current())
  expect(context.stroke).not.toHaveBeenCalled()
})
