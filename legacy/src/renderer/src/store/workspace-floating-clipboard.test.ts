import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer, readLayerColorAt, writeLayerColor } from '@/core/document'
import { applySelectionTransform, captureSelectionTransform } from '@/core/tools'
import { packColor } from '@/core/raster'
import { clipboardService } from './clipboard-service'
import { useWorkspace } from './workspace'

const red = { r: 255, g: 0, b: 0, a: 128 }
const blue = { r: 0, g: 80, b: 255, a: 255 }
const clear = { r: 0, g: 0, b: 0, a: 0 }
beforeEach(() => {
  vi.stubGlobal('moonSprite', { writeClipboardImage: vi.fn().mockResolvedValue(undefined) })
  useWorkspace.setState({ sessions: [], activeId: null, message: null })
  clipboardService.clearSelection()
})
afterEach(() => vi.unstubAllGlobals())

function beginFloating(copy: boolean, deferred: boolean, flip = false) {
  const document = createDocument('floating cut', 8, 2, 'rgba')
  const layer = getActiveLayer(document)
  writeLayerColor(document, layer, 0, red)
  for (let x = 3; x < 8; x++) writeLayerColor(document, layer, x, blue)
  useWorkspace.getState().addSession(document)
  const selection = { x: 0, y: 0, width: 2, height: 1 }
  useWorkspace.getState().setSelection(selection)
  const source = captureSelectionTransform(document, selection, layer)!
  if (copy) source.origin = 'clipboard'
  const target = { x: 3, y: 0, width: 2, height: 1, flipHorizontal: flip }
  const edit = deferred ? null : applySelectionTransform(document, source, target, 0, copy, undefined, undefined, undefined, layer)
  useWorkspace.getState().beginFloatingSelectionTransform(source, edit, selection, target, copy, 'move', null, target, 0, undefined, deferred)
  return { document, layer, source }
}

it.each([false, true])('copies a floating payload without background, alpha blending or committing (deferred=%s)', (deferred) => {
  const { document, layer } = beginFloating(true, deferred)
  const before = layer.pixels.slice()
  const history = useWorkspace.getState().sessions[0].history.position
  useWorkspace.getState().copySelection()
  expect(clipboardService.getSelection()?.pixels).toEqual(new Uint32Array([packColor(red), 0]))
  expect(clipboardService.getSelection()?.mask).toEqual(new Uint8Array([1, 0]))
  expect(layer.pixels).toEqual(before)
  expect(useWorkspace.getState().sessions[0].pendingPaste).not.toBeNull()
  expect(useWorkspace.getState().sessions[0].history.position).toBe(history)
  expect(readLayerColorAt(document, layer, 4, 0)).toEqual(blue)
})

it.each([false, true])('cuts a moved selection without erasing its destination background and supports undo/redo (deferred=%s)', (deferred) => {
  const { document, layer } = beginFloating(false, deferred)
  useWorkspace.getState().cutSelection()
  expect(clipboardService.getSelection()?.pixels).toEqual(new Uint32Array([packColor(red), 0]))
  expect(useWorkspace.getState().sessions[0].pendingPaste).toBeNull()
  expect(useWorkspace.getState().sessions[0].selection).toBeNull()
  expect(readLayerColorAt(document, layer, 0, 0)).toEqual(clear)
  for (const x of [3, 4]) expect(readLayerColorAt(document, layer, x, 0)).toEqual(blue)
  useWorkspace.getState().undo()
  expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
  for (const x of [3, 4]) expect(readLayerColorAt(document, layer, x, 0)).toEqual(blue)
  useWorkspace.getState().redo()
  expect(useWorkspace.getState().sessions[0].selection).toBeNull()
  expect(readLayerColorAt(document, layer, 0, 0)).toEqual(clear)
  for (const x of [3, 4]) expect(readLayerColorAt(document, layer, x, 0)).toEqual(blue)
})

it.each([false, true])('cuts a flipped paste without changing existing pixels (deferred=%s)', (deferred) => {
  const { document, layer } = beginFloating(true, deferred, true)
  useWorkspace.getState().cutSelection()
  expect(clipboardService.getSelection()?.pixels).toEqual(new Uint32Array([0, packColor(red)]))
  expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
  for (const x of [3, 4]) expect(readLayerColorAt(document, layer, x, 0)).toEqual(blue)
  expect(useWorkspace.getState().sessions[0].pendingPaste).toBeNull()
  expect(useWorkspace.getState().sessions[0].selection).toBeNull()
})

it('preserves the full scaled payload outside the canvas', () => {
  beginFloating(true, true)
  useWorkspace.getState().updateFloatingPastePreview(null, { x: -2, y: 0, width: 4, height: 1 }, null, { x: -2, y: 0, width: 4, height: 1 }, 0, undefined, true)
  useWorkspace.getState().copySelection()
  expect(clipboardService.getSelection()).toMatchObject({ originX: -2, width: 4 })
  expect(clipboardService.getSelection()?.pixels).toEqual(new Uint32Array([packColor(red), packColor(red), 0, 0]))
})

it('copies a rotated free-transform quad from the floating source', () => {
  beginFloating(true, true)
  const target = { x: 4, y: 0, width: 1, height: 2 }
  const quad = { nw: { x: 5, y: 0 }, ne: { x: 5, y: 2 }, se: { x: 4, y: 2 }, sw: { x: 4, y: 0 } }
  useWorkspace.getState().updateFloatingPastePreview(null, target, null, target, 0, undefined, true, undefined, quad)
  useWorkspace.getState().mutateActive((session) => {
    session.freeTransformActive = true
    session.freeTransformQuad = quad
    session.selectionPivot = { x: 4.5, y: 1 }
    session.selectionPropertiesActive = true
    session.selectionAngle = 90
  }, false)
  useWorkspace.getState().cutSelection()
  expect(useWorkspace.getState().sessions[0]).toMatchObject({
    selection: null, pendingPaste: null, freeTransformActive: false,
    freeTransformQuad: null, selectionPivot: null,
    selectionPropertiesActive: false, selectionAngle: 0
  })
  expect(clipboardService.getSelection()).toMatchObject({ originX: 4, width: 1, height: 2 })
  expect(clipboardService.getSelection()?.pixels).toEqual(new Uint32Array([packColor(red), 0]))
})

it('still cuts an ordinary selection and can undo it', () => {
  const { document, layer } = beginFloating(false, true)
  useWorkspace.getState().cancelFloatingPaste()
  useWorkspace.getState().cutSelection()
  expect(useWorkspace.getState().sessions[0].selection).toBeNull()
  expect(clipboardService.getSelection()?.pixels).toEqual(new Uint32Array([packColor(red), 0]))
  expect(readLayerColorAt(document, layer, 0, 0)).toEqual(clear)
  useWorkspace.getState().undo()
  expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
})
