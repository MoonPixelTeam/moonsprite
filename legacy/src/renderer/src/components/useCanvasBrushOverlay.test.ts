import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CanvasInputState, PointerPressureAdapter } from '@/core/canvas-input'
import { createDocument, createLayer } from '@/core/document-model'
import { sessionFromDocument } from '@/store/workspace-session'
import { useWorkspace } from '@/store/workspace'
import { useCanvasBrushOverlay } from './useCanvasBrushOverlay'
import { flushCanvasBrushSize, queueCanvasBrushSize } from './canvas-brush-size-update'
import { createCanvasPointerMove } from './canvas-pointer-move'
import type { MoonSpriteApi } from '@shared/types-platform'

afterEach(() => { cleanup(); window.dispatchEvent(new Event('blur')); vi.restoreAllMocks(); vi.unstubAllGlobals(); useWorkspace.setState({ sessions: [], activeId: null }); document.querySelectorAll('canvas').forEach(canvas => canvas.remove()) })

it.each([
  ['tilemap', 'pencil'], ['tilemap', 'eraser'],
  ['free-tile', 'pencil'], ['free-tile', 'eraser']
] as const)('refreshes the actual %s tile preview on each %s pointer move', async (kind, tool) => {
  localStorage.clear()
  vi.stubGlobal('moonSprite', {
    getResourceInfo: vi.fn(async () => ({ totalBytes: 8_000_000_000, freeBytes: 4_000_000_000 }))
  } as unknown as MoonSpriteApi)
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(createDocument('tile preview', 16, 16, 'rgba'))
  if (kind === 'tilemap') await useWorkspace.getState().createTilemapLayer({ name: 'Terrain', tileWidth: 2, tileHeight: 2 })
  else await useWorkspace.getState().createFreeTileLayer({ name: 'Props' })
  const session = useWorkspace.getState().sessions[0]
  const layer = session.document.layers.find(item => item.id === session.document.activeLayerId)!
  expect(layer.kind).toBe(kind)
  Object.assign(session, { tool, inkMode: 'simple', brushTexture: 'solid', tilemapMode: 'paint', freeTileMode: 'paint' })
  const input = new CanvasInputState()
  Object.assign(input.pointer, { visible: true, point: { x: 1, y: 1 }, clientX: 1, clientY: 1 })
  const canvas = document.createElement('canvas')
  const scheduleDraw = vi.fn(), scheduleOverlay = vi.fn()
  const ports = { session, inputRef: { current: input }, liveViewRef: { current: session.view },
    brushPreviewMode: 'full-edge', drawingBrushPreviewEnabled: true, scheduleDraw
  } as unknown as Parameters<typeof useCanvasBrushOverlay>[0]
  const { result } = renderHook(() => useCanvasBrushOverlay(ports))
  scheduleDraw.mockClear()
  const move = createCanvasPointerMove({
    inputRef: { current: input }, liveInputSession: () => session, canvasRef: { current: canvas },
    liveViewRef: { current: session.view }, pressureAdapterRef: { current: new PointerPressureAdapter() },
    moveSymmetry: () => false, autoPanSelection: vi.fn(), updateCursor: vi.fn(),
    lineConnectionPreviewActive: () => false,
    localPoint: (event: { clientX: number; clientY: number }) => ({ x: event.clientX, y: event.clientY }),
    localContinuousPointAt: (x: number, y: number) => ({ x, y }),
    activeLayer: layer, interfaceScale: 1, modifierActive: () => false,
    brushPreviewOverlaySupported: result.current.brushPreviewOverlaySupported,
    scheduleBrushPreviewOverlay: scheduleOverlay, scheduleDraw, moveQuickSampling: () => false
  } as unknown as Parameters<typeof createCanvasPointerMove>[0])
  for (const brushPreviewMode of ['full', 'edge', 'full-edge'] as const) {
    Object.assign(ports, { brushPreviewMode })
    expect(result.current.brushPreviewOverlaySupported(session)).toBe(false)
    for (const x of [2, 6, 10]) {
      const event = { clientX: x, clientY: 8, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, buttons: 0, pointerId: 1, pointerType: 'mouse', pressure: 0 }
      move({ ...event, nativeEvent: event, currentTarget: canvas } as unknown as Parameters<typeof move>[0])
      expect(input.pointer.point).toEqual({ x, y: 8 })
    }
  }
  expect(scheduleDraw).toHaveBeenCalledTimes(9)
  expect(scheduleOverlay).not.toHaveBeenCalled()
  if (kind === 'tilemap') session.tilemapMode = 'edit'
  else session.freeTileMode = 'edit'
  expect(result.current.brushPreviewOverlaySupported(session)).toBe(true)
})

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
  input.shiftLinePreview = true
  expect(result.current.brushPreviewOverlaySupported(session)).toBe(false)
  input.shiftLinePreview = false
  expect(result.current.brushPreviewOverlaySupported(session)).toBe(true)
  const scheduleOverlay = vi.fn()
  const scheduleDraw = vi.mocked(ports.scheduleDraw)
  scheduleDraw.mockClear()
  const move = createCanvasPointerMove({
    inputRef: { current: input }, liveInputSession: () => session, canvasRef: { current: canvas },
    liveViewRef: { current: session.view }, pressureAdapterRef: { current: new PointerPressureAdapter() },
    moveSymmetry: () => false, autoPanSelection: vi.fn(), updateCursor: vi.fn(),
    lineConnectionPreviewActive: (event: { shiftKey: boolean }) => event.shiftKey,
    localPoint: (event: { clientX: number; clientY: number }) => event.clientX < 0 ? null : { x: event.clientX, y: event.clientY },
    localContinuousPointAt: (clientX: number, clientY: number) => ({ x: clientX, y: clientY }),
    activeLayer: session.document.layers[0], interfaceScale: 1, modifierActive: () => false,
    brushPreviewOverlaySupported: result.current.brushPreviewOverlaySupported,
    scheduleBrushPreviewOverlay: scheduleOverlay, scheduleDraw, moveQuickSampling: () => false,
    strokeInput: { moveRaster: vi.fn(() => true) }
  } as unknown as Parameters<typeof createCanvasPointerMove>[0])
  // A → B → C must each schedule the line canvas, not just the cursor.
  for (const clientX of [100, 120, 140]) {
    const event = { clientX, clientY: 128, ctrlKey: false, altKey: false, metaKey: false, shiftKey: true, buttons: 0, pointerId: 1, pointerType: 'mouse', pressure: 0 }
    move({ ...event, nativeEvent: event, currentTarget: canvas } as unknown as Parameters<typeof move>[0])
    expect(input.pointer.point.x).toBe(clientX)
  }
  expect(scheduleDraw).toHaveBeenCalledTimes(3)
  expect(scheduleOverlay).not.toHaveBeenCalled()
  input.shiftLinePreview = false
  const outside = { clientX: -5, clientY: 128, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, buttons: 1, pointerId: 1, pointerType: 'mouse', pressure: 0 }
  move({ ...outside, nativeEvent: outside, currentTarget: canvas } as unknown as Parameters<typeof move>[0])
  expect(input.pointer.point.x).toBe(-5)
  expect(scheduleOverlay).toHaveBeenCalledOnce()
  expect(scheduleDraw).toHaveBeenCalledTimes(3)
  scheduleOverlay.mockClear()
  input.pointer.point = { x: 128, y: 128 }
  if (tool === 'pencil') {
    const upper = createLayer('upper', 256, 256, 'rgba')
    session.document.layers.push(upper)
    expect(result.current.brushPreviewOverlaySupported(session)).toBe(true)
    upper.visible = false
    expect(result.current.brushPreviewOverlaySupported(session)).toBe(true)
    session.document.layers.pop()
    session.document.layers[0].blendMode = 'multiply'
    expect(result.current.brushPreviewOverlaySupported(session)).toBe(true)
    session.document.layers[0].blendMode = 'normal'
    expect(result.current.brushPreviewOverlaySupported(session)).toBe(true)
  }

  act(() => result.current.brushPreviewDrawRef.current())
  expect(context.stroke).toHaveBeenCalledOnce()
  expect(context.fill).toHaveBeenCalledTimes(tool === 'eraser' ? 0 : 1)
  context.rect.mockClear()
  context.moveTo.mockClear()
  context.lineTo.mockClear()
  input.pointer.point = { x: 258, y: 128 }
  act(() => result.current.brushPreviewDrawRef.current())
  const fillRight = Math.max(...context.rect.mock.calls.map(([x, , width]) => x + width))
  const outlineRight = Math.max(...[...context.moveTo.mock.calls, ...context.lineTo.mock.calls].map(([x]) => x))
  expect(outlineRight).toBeGreaterThan(fillRight)
  context.rect.mockClear()
  context.stroke.mockClear()
  input.pointer.point = { x: 260, y: 128 }
  act(() => result.current.brushPreviewDrawRef.current())
  expect(context.rect).not.toHaveBeenCalled()
  expect(context.stroke).toHaveBeenCalledOnce()
  input.pointer.point = { x: 128, y: 128 }
  context.moveTo.mockClear()
  context.lineTo.mockClear()
  act(() => result.current.brushPreviewDrawRef.current())
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
  const snapSize = vi.spyOn(ports, 'snapBrushPointToGrid').mockImplementation(point => point)
  session.brushDynamics.effects.size = { ...session.brushDynamics.effects.size, sensor: 'pressure', outputMin: 25 }
  act(() => result.current.brushPreviewDrawRef.current())
  expect(snapSize.mock.lastCall?.[1]).toBe(Math.max(1, Math.round(session.brushSize * 0.25)))
  input.drag = { kind: 'draw', start: { x: 140, y: 140 }, last: { x: 140, y: 140 }, lastBrushSize: 4, edit: {} } as CanvasInputState['drag']
  expect(result.current.brushPreviewOverlaySupported(session)).toBe(true)
  input.pointer.point = { x: 140, y: 128 }
  context.moveTo.mockClear()
  act(() => result.current.brushPreviewDrawRef.current())
  const initialOutlineX = Math.max(...context.moveTo.mock.calls.map(([x]) => x))
  expect(snapSize.mock.lastCall?.[1]).toBe(4)
  context.moveTo.mockClear()
  const heldMove = { clientX: 258, clientY: 128, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, buttons: 1, pointerId: 1, pointerType: 'mouse', pressure: 0 }
  move({ ...heldMove, nativeEvent: heldMove, currentTarget: canvas } as unknown as Parameters<typeof move>[0])
  expect(scheduleOverlay).toHaveBeenCalledOnce()
  act(() => result.current.brushPreviewDrawRef.current())
  expect(Math.max(...context.moveTo.mock.calls.map(([x]) => x))).toBeGreaterThan(initialOutlineX)
  scheduleOverlay.mockClear()
  input.pointer.point = { x: 128, y: 128 }
  if (tool === 'pencil') {
    session.document.layers[0].blendMode = 'multiply'
    expect(result.current.brushPreviewOverlaySupported(session)).toBe(true)
    scheduleDraw.mockClear()
    const outsideDraw = { clientX: -12, clientY: 128, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, buttons: 1, pointerId: 1, pointerType: 'mouse', pressure: 0 }
    move({ ...outsideDraw, nativeEvent: outsideDraw, currentTarget: canvas } as unknown as Parameters<typeof move>[0])
    expect(input.pointer.point.x).toBe(-12)
    expect(scheduleDraw).not.toHaveBeenCalled()
    expect(scheduleOverlay).toHaveBeenCalledOnce()
    session.document.layers[0].blendMode = 'normal'
    input.pointer.point = { x: 128, y: 128 }
  }
  context.fill.mockClear()
  act(() => result.current.brushPreviewDrawRef.current())
  expect(context.fill).not.toHaveBeenCalled()
  input.pointer.visible = false
  context.stroke.mockClear()
  act(() => result.current.brushPreviewDrawRef.current())
  expect(context.stroke).not.toHaveBeenCalled()
  const other = sessionFromDocument(createDocument('other canvas', 256, 256, 'rgba'))
  Object.assign(other, { tool, brushSize: 24, inkMode: 'simple', brushTexture: 'solid' })
  act(() => useWorkspace.setState({ sessions: [session, other], activeId: other.document.id }))
  input.pointer.visible = true
  input.drag = null
  context.rect.mockClear()
  act(() => result.current.brushPreviewDrawRef.current())
  expect(Math.max(...context.rect.mock.calls.map(call => call[2]))).toBeGreaterThan(oldWidth * 2)
  expect(useWorkspace.getState().activeId).toBe(other.document.id)
})
