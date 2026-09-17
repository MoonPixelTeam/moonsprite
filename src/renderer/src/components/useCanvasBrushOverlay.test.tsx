import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { CanvasInputState } from '@/core/canvas-input'
import { sessionFromDocument } from '@/store/workspace-session'
import { useCanvasBrushOverlay } from './useCanvasBrushOverlay'

const contrast = vi.hoisted(() => ({ pattern: { kind: 'per-pixel-pattern' }, create: vi.fn() }))
vi.mock('./canvas-adaptive-contrast', () => ({ canvasAdaptiveContrast: contrast.create }))
vi.mock('./canvas-display-size', () => ({ syncCanvasDisplaySize: () => ({ x: 1, y: 1 }), clearCanvasBacking: vi.fn() }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); contrast.create.mockReset() })

it.each([['liquify', false], ['liquify', true], ['pencil', false]] as const)('bounds the %s overlay backdrop while dragging=%s', (tool, dragging) => {
  const session = sessionFromDocument(createDocument('liquify contrast', 32, 32, 'rgba'))
  session.tool = tool
  session.brushSize = 4
  session.view.zoom = 2
  session.liquifyRadius = 4
  const input = new CanvasInputState()
  input.pointer.visible = true
  input.pointer.point = { x: 16, y: 16 }
  if (dragging) input.drag = { kind: 'liquify', start: input.pointer.point, last: input.pointer.point }
  const backdrop = document.createElement('canvas')
  const overlay = document.createElement('canvas')
  const context = { setTransform: vi.fn(), save: vi.fn(), restore: vi.fn(), rect: vi.fn(), fill: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), lineWidth: 1, strokeStyle: '' }
  vi.spyOn(overlay, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  contrast.create.mockReturnValue(contrast.pattern)
  const sampleHotspot = vi.fn(() => { throw new Error('must not sample only the hotspot') })
  const { result } = renderHook(() => useCanvasBrushOverlay({
    canvasRef: { current: backdrop }, inputRef: { current: input }, session,
    brushPreviewMode: 'full-edge', drawingBrushPreviewEnabled: true,
    liveViewRef: { current: session.view }, stageSize: () => ({ width: 128, height: 128 }),
    stageDisplaySize: () => ({ width: 128, height: 128 }), interfaceScale: 1,
    repeatedDocumentPointsAt: () => null, rotationIndicatorPosition: 'view', applyViewRotation: vi.fn(),
    optimizedRotationEnabled: false, snapBrushPointToGrid: point => point,
    cursorCompositePointSamplerFor: sampleHotspot,
    activeTheme: {} as Parameters<typeof useCanvasBrushOverlay>[0]['activeTheme'],
    scheduleDraw: vi.fn(), activeToolBrushSize: 4
  }))
  result.current.brushPreviewCanvasRef.current = overlay
  act(() => result.current.brushPreviewDrawRef.current())
  expect(contrast.create).toHaveBeenCalledWith(context, expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }), backdrop)
  const bounds = contrast.create.mock.lastCall?.[1]
  expect(bounds.width * bounds.height).toBeLessThan(30 * 30)
  expect(context.strokeStyle).toBe(contrast.pattern)
  expect(context.stroke).toHaveBeenCalledOnce()
  expect(sampleHotspot).not.toHaveBeenCalled()
})
