import { beforeEach, expect, it } from 'vitest'
import { createDocument, getActiveLayer } from '@/core/document-model'
import { blendOver, packColor, unpackColor } from '@/core/raster'
import type { SelectionTransformSource } from '@/core/tools-selection-transform-types'
import { useWorkspace } from './workspace'

beforeEach(() => useWorkspace.setState({ sessions: [], activeId: null, message: null }))

it.each([false, true])('commits a large deferred paste and restores pixels and selection through undo/redo (mask=%s)', (masked) => {
  const document = createDocument('deferred paste', 320, 240, 'rgba')
  const layer = getActiveLayer(document)
  const pixels = new Uint32Array(layer.pixels.buffer, layer.pixels.byteOffset, 320 * 240)
  const background = 0xff906020
  pixels.fill(background)
  const selection = { x: -2, y: -1, width: 320, height: 240 }
  const values = new Uint32Array(320 * 240)
  const mask = masked ? new Uint8Array(values.length) : undefined
  const colors = [0xff2288ee, 0x803377cc, 0x00335577]
  for (let index = 0; index < values.length; index++) {
    values[index] = colors[index % colors.length]
    if (mask) mask[index] = index % 5 === 0 ? 0 : 1
  }
  const source: SelectionTransformSource = {
    selection: { ...selection, mask }, values,
    selectedOffsets: new Uint32Array(0), opaqueOffsets: new Uint32Array(0),
    opaqueIndices: new Uint32Array(0), opaqueValues: new Uint32Array(0), origin: 'clipboard'
  }
  const expected = new Uint32Array(pixels)
  for (let y = 0; y < 239; y++) for (let x = 0; x < 318; x++) {
    const offset = (y + 1) * 320 + x + 2
    const top = unpackColor(values[offset])
    if ((!mask || mask[offset] === 1) && top.a) expected[y * 320 + x] = packColor(blendOver(unpackColor(background), top))
  }
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().beginFloatingSelectionTransform(source, null, selection, selection, true, 'paste', null, selection, 0, undefined, true)
  const beforeRevision = useWorkspace.getState().sessions[0].contentRevision
  useWorkspace.getState().commitFloatingPaste('deselect')
  let session = useWorkspace.getState().sessions[0]
  expect(session.pendingPaste).toBeNull()
  expect(session.selection).toBeNull()
  expect(session.contentRevision).toBeGreaterThan(beforeRevision)
  expect(pixels).toEqual(expected)
  useWorkspace.getState().undo()
  expect(useWorkspace.getState().sessions[0].selection).toMatchObject(selection)
  expect(pixels).toEqual(expected)
  useWorkspace.getState().undo()
  expect(pixels).toEqual(new Uint32Array(pixels.length).fill(background))
  useWorkspace.getState().redo()
  expect(pixels).toEqual(expected)
  useWorkspace.getState().redo()
  session = useWorkspace.getState().sessions[0]
  expect(session.selection).toBeNull()
  expect(pixels).toEqual(expected)
})
