import { beforeEach, expect, it } from 'vitest'
import { createDocument } from '@/core/document'
import { useWorkspace } from './workspace'
import { useCanvasReferences } from './canvas-references'

beforeEach(() => {
  useWorkspace.setState({ sessions: [], activeId: null })
  useCanvasReferences.setState({ images: [], pending: null })
  const doc = createDocument('References', 10, 10, 'rgba')
  doc.id = 'reference-doc'
  useWorkspace.getState().addSession(doc)
})
const image = { id: 'ref', name: 'ref.png', src: 'data:image/png;base64,pixels', x: -20, y: 10, width: 30, height: 20, angle: 0, flipX: false, flipY: false, locked: false }

it('records add, a complete gesture, mirror, lock, reset and delete in the normal timeline', () => {
  const refs = useCanvasReferences.getState()
  const workspace = useWorkspace.getState()
  const session = workspace.sessions[0]
  const revision = session.revision
  const dirty = session.document.dirty
  refs.add(image)
  refs.begin('ref')
  refs.update('ref', { x: 12, angle: 30 })
  refs.update('ref', { x: 15, angle: 90, width: 50 })
  expect(session.history.length).toBe(1)
  refs.finish()
  expect(session.history.length).toBe(2)
  workspace.undo()
  expect(useCanvasReferences.getState().images[0]).toMatchObject(image)
  workspace.redo()
  expect(useCanvasReferences.getState().images[0]).toMatchObject({ x: 15, angle: 90, width: 50 })
  refs.update('ref', { flipX: true })
  refs.update('ref', { locked: true })
  const length = session.history.length
  refs.reset('ref'); refs.remove('ref'); refs.update('ref', { x: 900 })
  expect(session.history.length).toBe(length)
  workspace.undo()
  expect(useCanvasReferences.getState().images[0].locked).toBe(false)
  refs.reset('ref')
  expect(session.history.canRedo).toBe(false)
  expect(useCanvasReferences.getState().images[0]).toMatchObject({ ...image, x: 15 })
  workspace.undo()
  expect(useCanvasReferences.getState().images[0]).toMatchObject({ x: 15, angle: 90, width: 50, flipX: true })
  refs.remove('ref')
  expect(useCanvasReferences.getState().images).toHaveLength(0)
  workspace.undo()
  expect(useCanvasReferences.getState().images).toHaveLength(1)
  workspace.setHistoryPosition(0)
  expect(useCanvasReferences.getState().images).toHaveLength(0)
  expect(session.document.dirty).toBe(dirty)
  expect(session.revision).toBe(revision)
})

it('cancels a drag without history and assigns asynchronous additions to their originating document', () => {
  const refs = useCanvasReferences.getState()
  refs.add(image)
  const first = useWorkspace.getState().sessions[0]
  refs.begin('ref'); refs.update('ref', { y: 99 }); refs.finish(true)
  expect(useCanvasReferences.getState().images[0]).toMatchObject(image)
  expect(first.history.length).toBe(1)
  useWorkspace.getState().addSession(createDocument('Other', 2, 2, 'rgba'))
  refs.add({ ...image, id: 'second', documentId: first.document.id })
  const other = useWorkspace.getState().sessions[1]
  expect(other.history.length).toBe(0)
  expect(first.history.length).toBe(2)
  refs.add({ ...image, id: 'closed', documentId: 'closed-document' })
  expect(useCanvasReferences.getState().images).toHaveLength(2)
})
