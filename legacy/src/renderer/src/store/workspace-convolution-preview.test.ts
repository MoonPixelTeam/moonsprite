import { beforeEach, expect, it } from 'vitest'
import { createDocument, readLayerColorAt, writeLayerColor } from '@/core/document-model'
import { beginAdjustmentPreviewEdit, endAdjustmentPreviewEdit } from '@/core/adjustment-preview-lifecycle'
import { useWorkspace } from './workspace'
import type { ConvolutionOptions } from '@/core/convolution-matrix'

const negative: ConvolutionOptions = { presetId: 'negative', channels: { r: true, g: true, b: true, a: false }, tiled: false }
const brightness: ConvolutionOptions = { ...negative, presetId: 'brightness' }
beforeEach(() => { useWorkspace.setState({ sessions: [], activeId: null, message: null }) })
const setup = (format: 'rgba' | 'indexed' = 'rgba') => {
  const document = createDocument('preview', 4, 4, format)
  if (format === 'indexed') {
    document.palette.push(
      { ...document.palette[0], id: 500, color: { r: 60, g: 90, b: 120, a: 255 } },
      { ...document.palette[0], id: 501, color: { r: 195, g: 165, b: 135, a: 255 } }
    )
    document.paletteOrder.push(500, 501)
    document.nextColorId = 502
  }
  const layer = document.layers[0]
  writeLayerColor(document, layer, 0, { r: 60, g: 90, b: 120, a: 255 })
  useWorkspace.getState().addSession(document)
  return { document, layer, session: useWorkspace.getState().sessions[0] }
}

it('previews from the baseline, restores on cancel, and never dirties history', async () => {
  const { document, layer, session } = setup()
  const dirty = document.dirty
  const handle = useWorkspace.getState().beginConvolutionPreview()
  await handle.update(negative)
  expect(readLayerColorAt(document, layer, 0, 0).r).toBe(195)
  await handle.update(brightness)
  expect(readLayerColorAt(document, layer, 0, 0).r).toBe(68)
  expect(document.dirty).toBe(dirty)
  expect(session.history.canUndo).toBe(false)
  handle.cancel()
  expect(readLayerColorAt(document, layer, 0, 0).r).toBe(60)
})

it('applies one undoable indexed result and keeps applied pixels when the dialog cancels', async () => {
  const { document, layer } = setup('indexed')
  const palette = structuredClone(document.palette)
  const handle = useWorkspace.getState().beginConvolutionPreview()
  await handle.update(negative)
  await handle.apply(negative)
  handle.cancel()
  expect(readLayerColorAt(document, layer, 0, 0).r).toBe(195)
  useWorkspace.getState().undo()
  expect(readLayerColorAt(document, layer, 0, 0).r).toBe(60)
  expect(document.palette).toEqual(palette)
  expect(useWorkspace.getState().sessions[0].history.canUndo).toBe(false)
  useWorkspace.getState().redo()
  expect(readLayerColorAt(document, layer, 0, 0).r).toBe(195)
})

it('discards stale computations and suspends temporary pixels for document IO', async () => {
  const { document, layer } = setup()
  const handle = useWorkspace.getState().beginConvolutionPreview()
  await Promise.all([handle.update(negative), handle.update(brightness)])
  expect(readLayerColorAt(document, layer, 0, 0).r).toBe(68)
  beginAdjustmentPreviewEdit(document.id)
  expect(readLayerColorAt(document, layer, 0, 0).r).toBe(60)
  endAdjustmentPreviewEdit(document.id)
  handle.cancel()
  await Promise.resolve()
  expect(readLayerColorAt(document, layer, 0, 0).r).toBe(60)
})

it('keeps linked layers coherent across preview cancellation and history', async () => {
  const { document, layer, session } = setup()
  layer.linkedContentId = 'linked'
  const sibling = { ...layer, id: `${layer.id}-linked`, offsetX: 2 }
  document.layers.push(sibling)
  session.selectedLayerIds = [layer.id, sibling.id]
  const handle = useWorkspace.getState().beginConvolutionPreview()
  await handle.update(brightness)
  expect(readLayerColorAt(document, sibling, 2, 0).r).toBe(68)
  await handle.apply(negative)
  handle.cancel()
  expect(sibling.pixels).toBe(layer.pixels)
  useWorkspace.getState().undo()
  expect(readLayerColorAt(document, sibling, 2, 0).r).toBe(60)
  expect(sibling.pixels).toBe(layer.pixels)
})
