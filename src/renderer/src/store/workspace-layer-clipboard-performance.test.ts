import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document'
import * as model from '@/core/document-model'
import { clipboardService } from './clipboard-service'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  clipboardService.clearLayer()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
  Object.defineProperty(window, 'moonSprite', { configurable: true, value: {
    readClipboardImage: vi.fn(async () => null), readClipboardImageSize: vi.fn(async () => null)
  } })
})
afterEach(() => vi.restoreAllMocks())

it('copies RGBA storage in bulk and clones the layer clipboard only once per paste', async () => {
  const document = createDocument('large clipboard', 1024, 1024, 'rgba')
  const original = document.layers[0]
  for (let i = 0; i < original.pixels.length; i++) original.pixels[i] = (i * 17) % 256
  const expected = original.pixels.slice()
  useWorkspace.getState().addSession(document)
  const reads = vi.spyOn(model, 'readLayerColorAt')
  expect(useWorkspace.getState().copySelectedLayersToClipboard()).toBe(true)
  expect(reads).not.toHaveBeenCalled()
  const clones = vi.spyOn(clipboardService, 'getLayers')
  for (let i = 0; i < 10; i++) expect(clipboardService.hasLayers()).toBe(true)
  expect(clones).not.toHaveBeenCalled()
  await useWorkspace.getState().pasteClipboard()
  expect(clones).toHaveBeenCalledTimes(1)
  expect(document.layers).toHaveLength(2)
  const pasted = document.layers.find(layer => layer.id !== original.id)!
  expect(pasted.pixels.every((value, index) => value === expected[index])).toBe(true)
  expect(pasted.pixels.buffer).not.toBe(original.pixels.buffer)
  useWorkspace.getState().undo()
  expect(document.layers).toHaveLength(1)
  useWorkspace.getState().redo()
  expect(document.layers).toHaveLength(2)
  expect(document.layers.find(layer => layer.id === pasted.id)!.pixels.every((value, index) => value === expected[index])).toBe(true)
  document.layers.find(layer => layer.id === pasted.id)!.pixels[0] = 255
  expect(useWorkspace.getState().pasteLayersFromClipboard()).toBe(true)
  const repeated = document.layers.find(layer => layer.id !== original.id && layer.id !== pasted.id)!
  expect(repeated.pixels.every((value, index) => value === expected[index])).toBe(true)
})
