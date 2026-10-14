import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CanvasInputState } from '@/core/canvas-input'
import { createDocument } from '@/core/document-model'
import { sessionFromDocument } from '@/store/workspace-session'
import { useWorkspace } from '@/store/workspace'
import { canvasToolCursor } from '@/core/canvas-visuals'
import { useCanvasCursor } from './useCanvasCursor'

afterEach(() => { cleanup(); useWorkspace.setState({ sessions: [], activeId: null }) })

it('skips document sampling during size adjustment and resumes it after release', () => {
  const session = sessionFromDocument(createDocument('large cursor', 4596, 1767, 'rgba'))
  useWorkspace.setState({ sessions: [session], activeId: session.document.id })
  const input = new CanvasInputState()
  input.modifierBrushSize = { x: 100, y: 100, size: 1 }
  const canvas = document.createElement('canvas')
  const sampleReached = new Error('normal cursor sampling resumed')
  const sample = vi.fn(() => { throw sampleReached })
  const ports = {
    session, inputRef: { current: input }, canvasRef: { current: canvas },
    symmetryCenter: { x: 0, y: 0 }, symmetryAxisPreferences: { locked: false, thickness: 1 },
    canvasResizePreviewRef: { current: null }, quickToolActive: () => false,
    symmetryAxisHitAt: () => null, temporaryMoveActive: () => false,
    localPointAt: () => ({ x: 100, y: 100 }), cursorCompositePointSamplerFor: sample
  } as unknown as Parameters<typeof useCanvasCursor>[0]
  const { result } = renderHook(() => useCanvasCursor(ports))
  for (let x = 100; x < 200; x++) result.current.updateCursorAt(x, 100, true, true)
  expect(sample).not.toHaveBeenCalled()
  expect(input.sampling).toBe(false)
  expect(canvas.style.cursor).toBe(canvasToolCursor('pencil', session.primaryColor))
  input.modifierBrushSize = null
  expect(() => result.current.updateCursorAt(200, 100, false, false)).toThrow(sampleReached)
  expect(sample).toHaveBeenCalledOnce()
})
