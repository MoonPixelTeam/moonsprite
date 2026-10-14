import { afterEach, expect, it } from 'vitest'
import { createDocument, getActiveLayer, readLayerColorAt } from '@/core/document'
import { commitPixelEdit } from '@/core/history'
import { floodFill } from '@/core/tools-fill'
import { packColor } from '@/core/raster'
import { useWorkspace } from './workspace'

afterEach(() => { useWorkspace.setState({ sessions: [], activeId: null }); localStorage.clear() })

it('fills with the complete library selection, supports undo/redo, and clears multi-selection on single selection', () => {
  const doc = createDocument('multi pattern', 5, 1, 'rgba')
  const store = useWorkspace.getState()
  store.addSession(doc)
  store.setTool('fill')
  const colors = [{ r: 240, g: 20, b: 10, a: 255 }, { r: 10, g: 20, b: 240, a: 255 }]
  const brushes = colors.map((color, index) => ({ id: String(index), name: String(index), width: 1, height: 1, coverage: new Uint8Array([255]), colors: new Uint32Array([packColor(color)]), intrinsicSize: true }))
  store.setBrushImage(brushes[1], [brushes[0], brushes[1], brushes[0]])
  const session = useWorkspace.getState().sessions[0]
  expect(session.fillPatternBrushes?.map(brush => brush.id)).toEqual(['0', '1'])
  expect(session.history.position).toBe(0)
  const layer = getActiveLayer(doc)
  const edit = floodFill(doc, layer, 0, 0, colors[0], null, true, session.brushImage, 1, undefined, 'solid', 1, 0, 'pattern-source', 0, 0, undefined, { patternBrushes: session.fillPatternBrushes }, 'regular', session.fillPatternSettings)
  expect(edit).not.toBeNull()
  const result = () => [0, 1, 2, 3, 4].map(x => readLayerColorAt(doc, layer, x, 0))
  expect(result()).toEqual([colors[0], colors[1], colors[0], colors[1], colors[0]])
  const entry = commitPixelEdit(doc, edit!, 'multi fill')!
  entry.undo()
  expect(result().every(color => color.a === 0)).toBe(true)
  entry.redo()
  expect(result()).toEqual([colors[0], colors[1], colors[0], colors[1], colors[0]])
  store.setBrushImage(brushes[0])
  expect(useWorkspace.getState().sessions[0].fillPatternBrushes).toBeUndefined()
  store.setBrushImage(brushes[1], brushes)
  store.exitPatternBrush()
  expect(useWorkspace.getState().sessions[0].fillPatternBrushes).toBeUndefined()
})
