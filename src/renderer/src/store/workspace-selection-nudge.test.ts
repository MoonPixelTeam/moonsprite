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

it('defers pixel materialization for large single-layer nudges until commit', () => {
  const document = createDocument('deferred large nudge', 320, 320, 'rgba')
  const layer = document.layers[0]
  const color = { r: 80, g: 140, b: 220, a: 255 }
  writeLayerColor(document, layer, 10 * 320 + 10, color)
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().setSelection({ x: 0, y: 0, width: 257, height: 257 })

  useWorkspace.getState().moveActiveSelectionWithSelectionHistory(1, 0, true)

  const pending = useWorkspace.getState().sessions[0].pendingPaste
  expect(pending?.previewDeferred).toBe(true)
  expect(readLayerColorAt(document, layer, 10, 10)).toEqual(color)
  expect(readLayerColorAt(document, layer, 11, 10).a).toBe(0)

  useWorkspace.getState().commitFloatingPaste()

  expect(readLayerColorAt(document, layer, 10, 10).a).toBe(0)
  expect(readLayerColorAt(document, layer, 11, 10)).toEqual(color)
})

it('keeps small marquee repeats on a large layered canvas out of content invalidation and history until commit', () => {
  const document = createDocument('large layered nudge', 4096, 1024, 'rgba')
  const layer = document.layers[0]
  for (let i = 0; i < 80; i++) document.layers.push(createLayer(`background ${i}`, 1, 1, 'rgba'))
  const color = { r: 80, g: 140, b: 220, a: 128 }
  const background = { r: 200, g: 30, b: 50, a: 255 }
  writeLayerColor(document, layer, 10 * document.width + 10, color)
  writeLayerColor(document, layer, 10 * document.width + 15, background)
  const commands = useWorkspace.getState()
  commands.addSession(document)
  const selection = { x: 10, y: 10, width: 2, height: 2 }
  commands.setSelection(selection)
  commands.setSelectionPivot({ x: 12, y: 13 })
  const session = useWorkspace.getState().sessions[0]
  const revision = session.contentRevision
  const invalidation = session.contentInvalidation
  const history = session.history.position
  const pixels = layer.pixels
  // Cross an occupied background pixel, then return. It must not become part
  // of the captured source or leave a trail after confirmation.
  for (let i = 0; i < 8; i++) commands.moveActiveSelectionWithSelectionHistory(1, 0, true)
  for (let i = 0; i < 5; i++) commands.moveActiveSelectionWithSelectionHistory(-1, 0, true)
  expect(session.pendingPaste?.previewDeferred).toBe(true)
  expect(session.pendingPaste?.translationPreview).toBeNull()
  expect(session.contentRevision).toBe(revision)
  expect(session.contentInvalidation).toBe(invalidation)
  expect(session.history.position).toBe(history)
  expect(layer.pixels).toBe(pixels)
  expect(readLayerColorAt(document, layer, 10, 10)).toEqual(color)
  expect(readLayerColorAt(document, layer, 15, 10)).toEqual(background)
  expect(session.selection).toMatchObject({ ...selection, x: 13 })
  expect(session.selectionPivot).toEqual({ x: 15, y: 13 })

  commands.commitFloatingPaste()
  expect(session.history.position).toBe(history + 1)
  expect(readLayerColorAt(document, layer, 10, 10).a).toBe(0)
  expect(readLayerColorAt(document, layer, 13, 10)).toEqual(color)
  expect(readLayerColorAt(document, layer, 15, 10)).toEqual(background)
  commands.undo()
  expect(readLayerColorAt(document, layer, 10, 10)).toEqual(color)
  expect(readLayerColorAt(document, layer, 13, 10).a).toBe(0)
  expect(session.selection).toEqual(selection)
  expect(session.selectionPivot).toBeNull()
  commands.redo()
  expect(readLayerColorAt(document, layer, 13, 10)).toEqual(color)
  expect(readLayerColorAt(document, layer, 15, 10)).toEqual(background)
})

it('reuses a large irregular mask and skips opaque index caches while nudging outside the canvas', () => {
  const document = createDocument('masked nudge', 768, 768, 'rgba')
  const layer = document.layers[0]
  const color = { r: 80, g: 140, b: 220, a: 255 }
  writeLayerColor(document, layer, 10 * document.width + 10, color)
  const mask = new Uint8Array(600 * 600).fill(1)
  mask[20 * 600 + 20] = 0
  const selection = { x: 0, y: 0, width: 600, height: 600, mask }
  const commands = useWorkspace.getState()
  commands.addSession(document)
  commands.setSelection(selection)
  const session = useWorkspace.getState().sessions[0]
  const revision = session.contentRevision
  commands.moveActiveSelectionWithSelectionHistory(-1, 0, true)
  const source = session.pendingPaste!.source
  const previewMask = session.pendingPaste!.target.mask
  expect(source.opaqueOffsets.length).toBe(0)
  expect(source.opaqueIndices.length).toBe(0)
  for (let i = 0; i < 12; i++) commands.moveActiveSelectionWithSelectionHistory(0, -1, true)
  expect(session.pendingPaste!.source).toBe(source)
  expect(session.selection?.mask).toBe(previewMask)
  expect(session.selection).toMatchObject({ x: -1, y: -12, width: 600, height: 600 })
  expect(session.selection!.mask![20 * 600 + 20]).toBe(0)
  expect(session.contentRevision).toBe(revision)
  commands.cancelFloatingPaste()
  expect(session.pendingPaste).toBeNull()
  expect(session.selection).toEqual(selection)
  expect(readLayerColorAt(document, layer, 10, 10)).toEqual(color)
  expect(session.contentRevision).toBe(revision)
})

it.each(['relative luminance', 'unsupported composite', 'tile repeat'] as const)('materializes previews when %s prevents the cached overlay', (mode) => {
  const document = createDocument('fallback nudge', 320, 320, 'rgba')
  const layer = document.layers[0]
  const color = { r: 80, g: 140, b: 220, a: 255 }
  writeLayerColor(document, layer, 10 * document.width + 10, color)
  if (mode === 'unsupported composite') layer.blendMode = 'multiply'
  const commands = useWorkspace.getState()
  commands.addSession(document)
  commands.setSelection({ x: 0, y: 0, width: 257, height: 257 })
  if (mode === 'relative luminance') commands.setView({ relativeLuminance: true })
  if (mode === 'tile repeat') commands.setTileRepeatMode('both')
  commands.moveActiveSelectionWithSelectionHistory(1, 0, true)
  expect(useWorkspace.getState().sessions[0].pendingPaste?.previewDeferred).toBe(false)
  expect(readLayerColorAt(document, layer, 10, 10).a).toBe(0)
  expect(readLayerColorAt(document, layer, 11, 10)).toEqual(color)
})
