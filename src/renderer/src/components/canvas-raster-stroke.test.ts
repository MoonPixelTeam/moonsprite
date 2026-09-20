import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, readLayerColorAt, writeLayerColor } from '@/core/document-model'
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


it('keeps a coalesced eraser turn rather than erasing a shortcut through untouched pixels', () => {
  const document = createDocument('eraser turn', 12, 12, 'rgba')
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions[0], layer = document.layers[0]
  const opaque = { r: 120, g: 30, b: 60, a: 255 }
  for (let i = 0; i < 144; i++) writeLayerColor(document, layer, i, opaque)
  session.brushSize = 1; session.tool = 'eraser'
  const edit = beginPixelEdit(layer.id)
  const invalidation = { strokeSegment: vi.fn(), rect: vi.fn(), all: vi.fn(), requestDraw: vi.fn() }
  processRasterStrokeMove({ session, drag: { kind: 'draw', start: { x: 2, y: 2 }, last: { x: 2, y: 2 }, edit, color: { ...opaque, a: 0 } },
    previousPoint: { x: 2, y: 2 }, pointerType: 'mouse', preferences: loadEditorPreferences(),
    pointerSamples: [{ clientX: 2, clientY: 8 }, { clientX: 8, clientY: 8 }]
  }, { documentPointsAt: (x, y) => ({ local: { x, y }, repeated: { x, y }, offset: { x: 0, y: 0 } }) }, invalidation)
  expect(readLayerColorAt(document, layer, 2, 6).a).toBe(0)
  expect(readLayerColorAt(document, layer, 6, 8).a).toBe(0)
  expect(readLayerColorAt(document, layer, 5, 5)).toEqual(opaque)
  expect(invalidation.requestDraw).toHaveBeenCalledOnce()
  useWorkspace.getState().commitPixelEdit(edit, 'erase')
  useWorkspace.getState().undo()
  expect(readLayerColorAt(document, document.layers[0], 2, 6)).toEqual(opaque)
})
