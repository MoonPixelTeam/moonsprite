import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useCanvasBrushOverlay } from './useCanvasBrushOverlay'
import { CanvasInputState } from '@/core/canvas-input'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('invalidates and clears the liquify overlay when a group is selected without changing the tool or active layer', () => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(createDocument('preview', 8, 8, 'rgba'))
  const session = useWorkspace.getState().sessions[0]
  session.tool = 'liquify'
  const input = new CanvasInputState()
  input.pointer.visible = true
  const request = vi.fn(() => 1)
  vi.stubGlobal('requestAnimationFrame', request)
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const { result } = renderHook(() => useCanvasBrushOverlay({ session, inputRef: { current: input }, brushPreviewMode: 'full-edge', drawingBrushPreviewEnabled: true, scheduleDraw: vi.fn() } as unknown as Parameters<typeof useCanvasBrushOverlay>[0]))
  expect(result.current.brushPreviewOverlaySupported(session)).toBe(true)
  // Flush the initial scheduled draw, whose canvas is not mounted in this hook test.
  act(() => { (request.mock.calls[0] as unknown as [FrameRequestCallback])[0](0) })
  request.mockClear()
  act(() => {
    session.selectedGroupIds = ['group']
    useWorkspace.setState({ sessions: [session] })
  })
  expect(result.current.brushPreviewOverlaySupported(session)).toBe(false)
  expect(request).toHaveBeenCalledTimes(1)
  expect(session.tool).toBe('liquify')
})

it('suppresses the brush overlay while Ctrl temporarily activates the move tool', () => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(createDocument('preview', 8, 8, 'rgba'))
  const session = useWorkspace.getState().sessions[0]
  session.tool = 'pencil'
  const input = new CanvasInputState()
  input.pointer.visible = true
  input.ctrlHeld = true
  const { result } = renderHook(() =>
    useCanvasBrushOverlay({
      session,
      inputRef: { current: input },
      liveViewRef: { current: session.view },
      brushPreviewMode: 'full-edge',
      drawingBrushPreviewEnabled: true,
      scheduleDraw: vi.fn(),
      temporaryMoveActive: () => true
    } as unknown as Parameters<typeof useCanvasBrushOverlay>[0])
  )
  expect(result.current.brushPreviewOverlaySupported(session)).toBe(false)
  input.modifierBrushSize = { x: 0, y: 0, size: 1 }
  expect(result.current.brushPreviewOverlaySupported(session)).toBe(true)
  input.modifierBrushSize = null
  expect(result.current.brushPreviewOverlaySupported(session)).toBe(false)
})
