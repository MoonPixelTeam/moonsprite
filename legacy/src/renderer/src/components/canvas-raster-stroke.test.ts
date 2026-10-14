import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, readLayerColorAt, writeLayerColor } from '@/core/document-model'
import { beginPixelEdit } from '@/core/history'
import { loadEditorPreferences } from '@/core/file-preferences'
import { patchBrushDynamicsMapping } from '@/core/pressure'
import { beginBrushSpeedTracking, type CanvasDragState } from '@/core/canvas-input'
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

it('applies pressure size mapping to a raster stroke sample', () => {
  const document = createDocument('pressure size', 32, 32, 'rgba')
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions[0], layer = document.layers[0]
  session.brushSize = 8
  session.tool = 'pencil'
  session.brushDynamics = patchBrushDynamicsMapping(session.brushDynamics, 'size', {
    sensor: 'pressure', outputMin: 25, outputMax: 100, inputMin: 0, inputMax: 100, curve: 'linear'
  })
  const edit = beginPixelEdit(layer.id)
  const invalidation = { strokeSegment: vi.fn(), rect: vi.fn(), all: vi.fn(), requestDraw: vi.fn() }
  processRasterStrokeMove({
    session, drag: { kind: 'draw', start: { x: 8, y: 8 }, last: { x: 8, y: 8 }, edit, color: { r: 255, g: 0, b: 0, a: 255 }, lastBrushSize: 2 },
    previousPoint: { x: 8, y: 8 }, pointerType: 'pen', preferences: loadEditorPreferences(),
    pointerSamples: [{ clientX: 16, clientY: 8, pointerType: 'pen', pressure: 1, pressureAvailable: true, previousPressure: 0 }]
  }, { documentPointsAt: (x, y) => ({ local: { x, y }, repeated: { x, y }, offset: { x: 0, y: 0 } }) }, invalidation)
  expect(readLayerColorAt(document, layer, 16, 11).a).toBe(255)
})

it.each(['pencil', 'eraser'] as const)('lets a moving %s grow from 1–2 pixels and shrink again with pressure', tool => {
  const document = createDocument('moving pressure', 96, 32, 'rgba')
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions[0], layer = document.layers[0]
  const color = { r: 255, g: 0, b: 0, a: 255 }
  if (tool === 'eraser') for (let i = 0; i < 96 * 32; i++) writeLayerColor(document, layer, i, color)
  Object.assign(session, { tool, brushSize: 8, brushShape: 'square', perfectPixels: false, brushImage: null })
  session.brushDynamics = patchBrushDynamicsMapping(session.brushDynamics, 'size', {
    sensor: 'pressure', outputMin: 0, outputMax: 100, inputMin: 0, inputMax: 100, curve: 'linear'
  })
  const drag: CanvasDragState = {
    kind: 'draw', start: { x: 8, y: 16 }, last: { x: 8, y: 16 },
    edit: beginPixelEdit(layer.id), color: tool === 'eraser' ? { ...color, a: 0 } : color,
    lastBrushSize: 1,
    brushSpeed: beginBrushSpeedTracking({ clientX: 8, clientY: 16, timeStamp: 0 })
  }
  const move = (x: number, pressure: number) => processRasterStrokeMove({
    session, drag, previousPoint: drag.last, pointerType: 'pen', preferences: loadEditorPreferences(),
    pointerSamples: [{ clientX: x, clientY: 16, timeStamp: x * 2, pointerType: 'pen', pressure, pressureAvailable: true }]
  }, { documentPointsAt: (x, y) => ({ local: { x, y }, repeated: { x, y }, offset: { x: 0, y: 0 } }) },
  { strokeSegment: vi.fn(), rect: vi.fn(), all: vi.fn(), requestDraw: vi.fn() })
  move(10, 1)
  expect(drag.lastBrushSize).toBeGreaterThan(1)
  for (let x = 12; x <= 40; x += 2) move(x, 1)
  expect(drag.lastBrushSize).toBe(8)
  expect(readLayerColorAt(document, layer, 40, 19).a).toBe(tool === 'eraser' ? 0 : 255)
  for (let x = 42; x <= 80; x += 2) move(x, 0)
  expect(drag.lastBrushSize).toBe(1)
  expect(readLayerColorAt(document, layer, 80, 19).a).toBe(tool === 'eraser' ? 255 : 0)
})

it('applies a pressure size change immediately during fast pointer motion', () => {
  const document = createDocument('fast pressure', 32, 32, 'rgba')
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions[0], layer = document.layers[0]
  Object.assign(session, { tool: 'pencil', brushSize: 16, brushShape: 'square', perfectPixels: false, brushImage: null })
  session.brushDynamics = patchBrushDynamicsMapping(session.brushDynamics, 'size', {
    sensor: 'pressure', outputMin: 0, outputMax: 100, inputMin: 0, inputMax: 100, curve: 'linear'
  })
  const drag: CanvasDragState = {
    kind: 'draw', start: { x: 8, y: 16 }, last: { x: 8, y: 16 },
    edit: beginPixelEdit(layer.id), color: { r: 255, g: 0, b: 0, a: 255 }, lastBrushSize: 16,
    brushSpeed: beginBrushSpeedTracking({ clientX: 8, clientY: 16, timeStamp: 0 })
  }
  processRasterStrokeMove({
    session, drag, previousPoint: drag.last, pointerType: 'pen', preferences: loadEditorPreferences(),
    pointerSamples: [{ clientX: 9, clientY: 16, timeStamp: 1, pointerType: 'pen', pressure: 0, pressureAvailable: true }]
  }, { documentPointsAt: (x, y) => ({ local: { x, y }, repeated: { x, y }, offset: { x: 0, y: 0 } }) },
  { strokeSegment: vi.fn(), rect: vi.fn(), all: vi.fn(), requestDraw: vi.fn() })
  expect(drag.lastBrushSize).toBe(1)
})
