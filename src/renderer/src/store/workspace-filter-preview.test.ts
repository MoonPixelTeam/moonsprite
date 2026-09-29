import { beforeEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { beginAdjustmentPreviewEdit, endAdjustmentPreviewEdit } from '@/core/adjustment-preview-lifecycle'
import { useWorkspace } from './workspace'

beforeEach(() => {
  Object.defineProperty(window, 'moonSprite', { configurable: true, value: {
    getResourceInfo: vi.fn(async () => ({ totalBytes: 8e9, freeBytes: 4e9 }))
  } })
  useWorkspace.setState({ sessions: [], activeId: null, message: null })
})

it('switches previews without stacking layers or history, then cancels to the original', async () => {
  const document = createDocument('preview', 4, 4, 'rgba')
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions[0]
  const originalIds = document.layers.map(layer => layer.id), dirty = document.dirty
  const handle = useWorkspace.getState().beginFilterPreview()
  await handle.update({ id: 'vignette', opacity: 0.3 })
  expect(document.layers).toHaveLength(originalIds.length + 1)
  expect(document.layers.at(-1)?.opacity).toBe(0.3)
  await handle.update({ id: 'crt-scanlines-medium' })
  expect(document.layers).toHaveLength(originalIds.length + 1)
  expect(session.history.canUndo).toBe(false)
  expect(document.dirty).toBe(dirty)
  handle.cancel()
  expect(document.layers.map(layer => layer.id)).toEqual(originalIds)
  expect(session.selectedLayerIds).toEqual([document.activeLayerId])
})

it('restores LCD source visibility on switching and applies only one undoable result', async () => {
  const document = createDocument('LCD', 4, 4, 'indexed')
  useWorkspace.getState().addSession(document)
  const source = document.layers[0], paletteSize = document.palette.length
  const handle = useWorkspace.getState().beginFilterPreview()
  await handle.update({ id: 'lcd', lcd: { width: 2, height: 1 } })
  expect(source.visible).toBe(false)
  expect(document.groups).toHaveLength(1)
  await handle.update({ id: 'vignette' })
  expect(source.visible).toBe(true)
  expect(document.groups).toHaveLength(0)
  await handle.update(null)
  expect(document.palette).toHaveLength(paletteSize)
  await handle.apply({ id: 'crt-scanlines-subtle', opacity: 0.4 })
  expect(document.layers).toHaveLength(2)
  expect(document.layers[1].opacity).toBe(0.4)
  useWorkspace.getState().undo()
  expect(document.layers).toHaveLength(1)
  expect(useWorkspace.getState().sessions[0].history.canUndo).toBe(false)
  useWorkspace.getState().redo()
  expect(document.layers).toHaveLength(2)
})

it('discards pending requests after cancel and suspends previews for document IO', async () => {
  const document = createDocument('race', 4, 4, 'rgba')
  useWorkspace.getState().addSession(document)
  const handle = useWorkspace.getState().beginFilterPreview()
  const first = handle.update({ id: 'vignette' })
  const second = handle.update({ id: 'phosphor-glow' })
  await Promise.all([first, second])
  expect(document.layers).toHaveLength(2)
  expect(document.layers[1].name).toContain('荧光')
  beginAdjustmentPreviewEdit(document.id)
  expect(document.layers).toHaveLength(1)
  endAdjustmentPreviewEdit(document.id)
  handle.cancel()
  await Promise.resolve()
  expect(document.layers).toHaveLength(1)
})
