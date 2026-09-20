import { beforeEach, expect, it } from 'vitest'
import { createDocument, createLayer, readLayerColorAt, writeLayerColor } from '@/core/document'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})

it('keeps full-canvas selection nudges as translations across A, B and C layers', () => {
  const document = createDocument('three layer nudges', 16, 16, 'rgba')
  document.layers = ['A', 'B', 'C'].map(name => createLayer(name, 16, 16, 'rgba'))
  document.activeLayerId = document.layers[0].id
  const color = { r: 255, g: 30, b: 10, a: 255 }
  for (const layer of document.layers) {
    writeLayerColor(document, layer, 6 * 16 + 3, color)
    writeLayerColor(document, layer, 7 * 16 + 3, color)
  }
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().setSelection({ x: 0, y: 0, width: 16, height: 16 })
  for (const [index, layer] of document.layers.entries()) {
    useWorkspace.getState().selectLayer(layer.id)
    for (let step = 0; step < 2; step++) {
      useWorkspace.getState().moveActiveSelectionWithSelectionHistory(0, 1, true)
      const session = useWorkspace.getState().sessions[0]
      expect(session.pendingPaste?.source.selection, `source size on layer ${index}, step ${step}`).toMatchObject({ width: 16, height: 16 })
      expect(session.selection).toEqual({ x: 0, y: index * 2 + step + 1, width: 16, height: 16 })
      expect(readLayerColorAt(document, layer, 3, 6 + step + 1)).toEqual(color)
      expect(readLayerColorAt(document, layer, 3, 7 + step + 1)).toEqual(color)
    }
  }
  useWorkspace.getState().commitFloatingPaste()
  const lastLayer = document.layers[2]
  useWorkspace.getState().undo()
  expect(readLayerColorAt(document, lastLayer, 3, 6)).toEqual(color)
  expect(readLayerColorAt(document, lastLayer, 3, 7)).toEqual(color)
  expect(useWorkspace.getState().sessions[0].selection).toEqual({ x: 0, y: 4, width: 16, height: 16 })
  useWorkspace.getState().redo()
  expect(readLayerColorAt(document, lastLayer, 3, 8)).toEqual(color)
  expect(readLayerColorAt(document, lastLayer, 3, 9)).toEqual(color)
  for (const layer of document.layers) {
    let opaqueCount = 0
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (readLayerColorAt(document, layer, x, y).a) opaqueCount++
    }
    expect(opaqueCount).toBe(2)
  }
})
