import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer, writeLayerColor } from '@/core/document'
import { createSelectionBrush } from '@/core/brushes'
import { useWorkspace } from './workspace'

afterEach(() => vi.unstubAllGlobals())
beforeEach(() => {
  vi.stubGlobal('moonSprite', { saveBrush: vi.fn() })
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
  const doc = createDocument('temporary brush', 4, 4, 'rgba', false)
  writeLayerColor(doc, getActiveLayer(doc), 0, { r: 255, g: 0, b: 0, a: 255 })
  useWorkspace.getState().addSession(doc)
  useWorkspace.getState().setTool('pencil')
  useWorkspace.getState().setBrushSize(7)
})

it('captures a temporary brush without saving or changing document history and restores pencil settings', () => {
  const state = useWorkspace.getState()
  const save = vi.spyOn(window.moonSprite, 'saveBrush')
  const before = state.sessions[0]
  const historyPosition = before.history.position
  const contentRevision = before.contentRevision
  state.beginTemporaryBrushCapture()
  expect(useWorkspace.getState().sessions[0]).toMatchObject({ tool: 'selection', selectionKind: 'rectangle', selectionMode: 'replace' })
  state.finishTemporaryBrushCapture({ x: 0, y: 0, width: 2, height: 2 })
  const captured = useWorkspace.getState().sessions[0]
  expect(captured).toMatchObject({ tool: 'pencil', brushImageTemporary: true, selection: null, contentRevision })
  expect(captured.brushImage).toMatchObject({ width: 2, height: 2, intrinsicSize: true })
  expect(captured.history.position).toBe(historyPosition)
  expect(save).not.toHaveBeenCalled()
  state.exitPatternBrush()
  expect(useWorkspace.getState().sessions[0]).toMatchObject({ tool: 'pencil', brushImage: null, brushSize: 7, brushImageTemporary: false })
  save.mockRestore()
})

it('cancels capture and restores the previous selection options', () => {
  const state = useWorkspace.getState()
  state.setSelectionKind('ellipse')
  state.beginTemporaryBrushCapture()
  state.exitPatternBrush()
  expect(useWorkspace.getState().sessions[0]).toMatchObject({ tool: 'pencil', selectionKind: 'ellipse', brushSize: 7, brushImage: null })
  expect(useWorkspace.getState().sessions[0].temporaryBrushCapture).toBeUndefined()
})

it('restores the original pencil after switching between saved pattern brushes', () => {
  const state = useWorkspace.getState()
  const doc = state.sessions[0].document
  const brush = createSelectionBrush(doc, { x: 0, y: 0, width: 2, height: 2 }, 'saved-pattern', 'Pattern')!
  state.setBrushImage(brush)
  state.setBrushImage({ ...brush, id: 'other-pattern' })
  state.exitPatternBrush()
  expect(useWorkspace.getState().sessions[0]).toMatchObject({ brushImage: null, brushSize: 7, tool: 'pencil' })
})
