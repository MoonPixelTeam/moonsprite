import { beforeEach, expect, it } from 'vitest'
import { createColorizeAdjustment } from '@/core/adjustments'
import { createDocument, getActiveLayer, readLayerColor } from '@/core/document'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})

it('applies colorizing immediately within the selection and supports undo/redo', () => {
  const document = createDocument('colorize selection', 2, 1, 'rgba')
  const layer = getActiveLayer(document)
  layer.pixels.set([80, 80, 80, 128, 40, 180, 90, 255])
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().setSelection({ x: 0, y: 0, width: 1, height: 1 })
  const colorAt = (index: number) => {
    const current = useWorkspace.getState().sessions[0].document
    return readLayerColor(current, getActiveLayer(current), index)
  }
  useWorkspace.getState().applyActiveLayerAdjustment(createColorizeAdjustment({ r: 0, g: 0, b: 255, a: 255 }))
  const tinted = colorAt(0)
  expect(tinted.b).toBeGreaterThan(tinted.r)
  expect(tinted.a).toBe(128)
  expect(colorAt(1)).toEqual({ r: 40, g: 180, b: 90, a: 255 })
  useWorkspace.getState().undo()
  expect(colorAt(0)).toEqual({ r: 80, g: 80, b: 80, a: 128 })
  useWorkspace.getState().redo()
  expect(colorAt(0)).toEqual(tinted)
})

it('does not change a locked layer', () => {
  const document = createDocument('locked colorize', 1, 1, 'rgba')
  const layer = getActiveLayer(document)
  layer.pixels.set([80, 80, 80, 255])
  layer.locked = true
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().applyActiveLayerAdjustment(createColorizeAdjustment({ r: 255, g: 0, b: 0, a: 255 }))
  expect(Array.from(getActiveLayer(useWorkspace.getState().sessions[0].document).pixels)).toEqual([80, 80, 80, 255])
  expect(useWorkspace.getState().sessions[0].history.canUndo).toBe(false)
})
