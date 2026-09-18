import { act, cleanup, renderHook } from '@testing-library/react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { CanvasInputState, PointerPressureAdapter } from '@/core/canvas-input'
import { useWorkspace } from '@/store/workspace'
import { sessionFromDocument } from '@/store/workspace-session'
import { createCanvasPointerMove } from './canvas-pointer-move'
import { useCanvasDeviceRouter } from './useCanvasDeviceRouter'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it.each(['line', 'curve'] as const)('adjusts %s brush size with modifier movement without starting a stroke', lineKind => {
  const session = sessionFromDocument(createDocument('size', 32, 32, 'rgba'))
  Object.assign(session, { tool: 'line', lineKind, brushSize: 4 })
  const input = new CanvasInputState()
  const canvas = document.createElement('canvas')
  const setSize = vi.spyOn(useWorkspace.getState(), 'setBrushSize').mockImplementation(size => { session.brushSize = size })
  const scheduleOverlay = vi.fn()
  const scheduleDraw = vi.fn()
  const move = createCanvasPointerMove({
    inputRef: { current: input }, liveInputSession: () => session,
    canvasRef: { current: canvas }, liveViewRef: { current: session.view },
    pressureAdapterRef: { current: new PointerPressureAdapter() },
    moveSymmetry: () => false, autoPanSelection: vi.fn(), updateCursor: vi.fn(),
    lineConnectionPreviewActive: () => false, localPoint: () => ({ x: 16, y: 16 }),
    activeLayer: session.document.layers[0], interfaceScale: 1,
    modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'altKey'>) => event.ctrlKey && event.altKey,
    brushPreviewOverlaySupported: () => true,
    scheduleBrushPreviewOverlay: scheduleOverlay, scheduleDraw, moveQuickSampling: () => false
  } as unknown as Parameters<typeof createCanvasPointerMove>[0])
  const moveAt = (clientX: number, sizing = true) => {
    const event = { clientX, clientY: 16, ctrlKey: sizing, altKey: sizing, metaKey: false, shiftKey: false, buttons: 0, pointerId: 1, pointerType: 'mouse', pressure: 0 }
    move({ ...event, nativeEvent: event, currentTarget: canvas } as unknown as ReactPointerEvent<HTMLCanvasElement>)
  }
  moveAt(16)
  moveAt(32)
  expect(setSize).toHaveBeenLastCalledWith(8)
  expect(input.drag).toBeNull()
  expect(scheduleOverlay).toHaveBeenCalledTimes(2)
  expect(scheduleDraw).not.toHaveBeenCalled()
  moveAt(32, false)
  expect(input.modifierBrushSize).toBeNull()
  expect(setSize).toHaveBeenCalledOnce()
})

it.each(['line', 'curve'] as const)('adjusts %s brush size with Ctrl+wheel without zooming', lineKind => {
  const session = sessionFromDocument(createDocument('wheel size', 32, 32, 'rgba'))
  Object.assign(session, { tool: 'line', lineKind, brushSize: 4 })
  const canvas = document.createElement('canvas')
  document.body.append(canvas)
  const setSize = vi.spyOn(useWorkspace.getState(), 'setBrushSize').mockImplementation(size => { session.brushSize = size })
  const scheduleDraw = vi.fn()
  const scheduleZoomPreview = vi.fn()
  const { result, unmount } = renderHook(() => useCanvasDeviceRouter({
    inputRef: { current: new CanvasInputState() }, session, canvasRef: { current: canvas },
    stageBounds: () => ({ left: 0, top: 0, right: 32, bottom: 32 }),
    activeLayer: session.document.layers[0], canvasResizePreviewRef: { current: null },
    modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey'>, id: string) => id === 'brushSizeWheelAdjust' && event.ctrlKey,
    activeBrushImage: null, updateCursorAt: vi.fn(), scheduleDraw, scheduleZoomPreview,
    wheelZoomEnabled: true, liveViewRef: { current: session.view }
  } as unknown as Parameters<typeof useCanvasDeviceRouter>[0]))
  try {
    for (const [deltaY, size] of [[-100, 5], [100, 4]]) {
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, clientX: 16, clientY: 16, deltaY })
      act(() => { canvas.dispatchEvent(event) })
      expect(event.defaultPrevented).toBe(true)
      expect(setSize).toHaveBeenLastCalledWith(size)
    }
    expect(result.current.wheelBrushSizePreviewRef.current).toBe(true)
    expect(scheduleDraw).toHaveBeenCalledTimes(2)
    expect(scheduleZoomPreview).not.toHaveBeenCalled()
  } finally {
    unmount()
    canvas.remove()
  }
})
