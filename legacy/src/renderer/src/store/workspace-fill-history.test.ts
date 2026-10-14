import { beforeEach, expect, it } from 'vitest'
import { createDocument, getActiveLayer, writeLayerColor, compositeRegion } from '@/core/document'
import { floodFillSymmetric } from '@/core/tools-fill'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})

it('restores cropped smart fills through store history after creating another layer', async () => {
  const document = createDocument('smart fill history', 500, 767, 'rgba')
  const layer = getActiveLayer(document)
  layer.width = 297
  layer.height = 241
  layer.offsetX = 20
  layer.offsetY = 30
  layer.pixels = new Uint8ClampedArray(297 * 241 * 4)
  for (let y = 40; y < 100; y++) for (let x = 40; x < 110; x++) writeLayerColor(document, layer, y * 297 + x, { r: 172, g: 49, b: 49, a: 255 })
  useWorkspace.getState().addSession(document)
  const before = compositeRegion(document, 0, 0, 500, 767)
  const edit = floodFillSymmetric(document, layer, 80, 90, { r: 240, g: 210, b: 210, a: 255 }, null, true, null, 1, undefined, 'solid', 1, 0, 'paint', undefined, undefined, 0, 2)!
  expect(useWorkspace.getState().commitPixelEdit(edit, 'fill')).not.toBeNull()
  const after = compositeRegion(document, 0, 0, 500, 767)
  expect(after.some((value, index) => value !== before[index])).toBe(true)
  await useWorkspace.getState().addLayer()
  for (let cycle = 0; cycle < 3; cycle++) {
    useWorkspace.getState().undo()
    useWorkspace.getState().undo()
    expect(compositeRegion(document, 0, 0, 500, 767).every((value, index) => value === before[index])).toBe(true)
    useWorkspace.getState().redo()
    useWorkspace.getState().redo()
    expect(compositeRegion(document, 0, 0, 500, 767).every((value, index) => value === after[index])).toBe(true)
  }
})
