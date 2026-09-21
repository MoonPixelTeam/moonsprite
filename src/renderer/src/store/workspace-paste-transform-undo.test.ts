import { beforeEach, expect, it } from 'vitest'
import { createDocument, getActiveLayer } from '@/core/document-model'
import { selectionQuadFromRect } from '@/core/selection'
import type { SelectionTransformSource } from '@/core/tools-selection-transform-types'
import { useWorkspace } from './workspace'

beforeEach(() => { localStorage.clear(); useWorkspace.setState({ sessions: [], activeId: null }) })

it('restores clipboard geometry as well as selection bounds before the next move', () => {
  const document = createDocument('paste transform undo', 20, 20, 'rgba', false)
  const origin = { x: 2, y: 2, width: 2, height: 2 }
  const stretched = { x: 5, y: 4, width: 8, height: 4 }
  const source: SelectionTransformSource = {
    selection: origin, values: new Uint32Array([0xff0000ff, 0xff00ff00, 0xffff0000, 0xffffffff]),
    selectedOffsets: new Uint32Array(0), opaqueOffsets: new Uint32Array(0),
    opaqueIndices: new Uint32Array(0), opaqueValues: new Uint32Array(0), origin: 'clipboard'
  }
  const state = useWorkspace.getState()
  state.addSession(document)
  state.beginFloatingSelectionTransform(source, null, origin, stretched, true, 'paste', null, stretched, 0, undefined, true, undefined, undefined, selectionQuadFromRect(stretched))
  const session = useWorkspace.getState().sessions[0]
  session.freeTransformActive = true
  session.freeTransformQuad = selectionQuadFromRect(stretched)
  state.undo()
  expect(session.selection).toMatchObject(origin)
  const pending = session.pendingPaste!
  const nextMoveQuad = pending.transformQuad ?? session.freeTransformQuad ?? selectionQuadFromRect(pending.transformTarget!)
  expect(nextMoveQuad).toEqual(selectionQuadFromRect(origin))
  state.moveActiveSelectionWithSelectionHistory(1, 0, true)
  expect(session.selection).toMatchObject({ ...origin, x: 3 })
  state.commitFloatingPaste()
  expect(Array.from(new Uint32Array(getActiveLayer(document).pixels.buffer)).filter(value => value !== 0)).toHaveLength(4)
})
