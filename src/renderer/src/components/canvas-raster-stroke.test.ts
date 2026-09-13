import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, readLayerColorAt } from '@/core/document-model'
import { beginPixelEdit } from '@/core/history'
import { loadEditorPreferences } from '@/core/file-preferences'
import { useWorkspace } from '@/store/workspace'
import { processRasterStrokeMove } from './canvas-raster-stroke'

afterEach(() => useWorkspace.setState({sessions: [], activeId: null}))

it('paints the final coalesced sample, invalidates local regions and preserves one undo edit', () => {
  useWorkspace.setState({sessions: [], activeId: null})
  const document = createDocument('stroke pipeline', 8, 8, 'rgba')
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions[0], layer = document.layers[0]
  session.brushSize = 1
  session.tool = 'pencil'
  const color = {r: 250, g: 30, b: 60, a: 255}, edit = beginPixelEdit(layer.id)
  const invalidation = {strokeSegment: vi.fn(), rect: vi.fn(), all: vi.fn(), requestDraw: vi.fn()}
  processRasterStrokeMove({
    session, drag: {kind: 'draw', start: {x: 1, y: 1}, last: {x: 1, y: 1}, edit, color},
    previousPoint: {x: 1, y: 1}, pointerType: 'mouse', preferences: loadEditorPreferences(),
    pointerSamples: [{clientX: 2, clientY: 1}, {clientX: 5, clientY: 1}]
  }, {documentPointsAt: (x, y) => ({local: {x, y}, repeated: {x, y}, offset: {x: 0, y: 0}})}, invalidation)
  expect(readLayerColorAt(document, layer, 5, 1)).toEqual(color)
  expect(invalidation.all).not.toHaveBeenCalled()
  expect(invalidation.rect).toHaveBeenCalled()
  useWorkspace.getState().commitPixelEdit(edit, 'stroke')
  useWorkspace.getState().undo()
  expect(readLayerColorAt(document, document.layers[0], 5, 1).a).toBe(0)
})
