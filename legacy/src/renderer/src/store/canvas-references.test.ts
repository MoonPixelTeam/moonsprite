import { beforeEach, expect, it } from 'vitest'
import { createDocument } from '@/core/document'
import { useWorkspace } from './workspace'
import { useCanvasReferences } from './canvas-references'
import { decodeProject, encodeProject, encodeProjectAsync } from '@/core/project-format'

beforeEach(() => {
  useWorkspace.setState({ sessions: [], activeId: null })
  useCanvasReferences.setState({ images: [], pending: null })
  const doc = createDocument('References', 10, 10, 'rgba')
  doc.id = 'reference-doc'
  useWorkspace.getState().addSession(doc)
})
const image = { id: 'ref', name: 'ref.png', src: 'data:image/png;base64,pixels', x: -20, y: 10, width: 30, height: 20, angle: 0, flipX: false, flipY: false, locked: false }

it('releases references and a pending gesture only when their owning session closes', () => {
  const refs = useCanvasReferences.getState()
  refs.add(image)
  refs.begin(image.id)
  useWorkspace.getState().addSession(createDocument('Other', 2, 2, 'rgba'))
  const other = useWorkspace.getState().sessions[1]
  refs.add({ ...image, id: 'other-ref', documentId: other.document.id })
  expect(useCanvasReferences.getState().images).toHaveLength(2)
  useWorkspace.setState({ sessions: [other], activeId: other.document.id })
  expect(useCanvasReferences.getState().images.map(item => item.id)).toEqual(['other-ref'])
  expect(useCanvasReferences.getState().pending).toBeNull()
  refs.finish(true)
  expect(useCanvasReferences.getState().images.map(item => item.id)).toEqual(['other-ref'])
  useWorkspace.setState({ sessions: [], activeId: null })
  expect(useCanvasReferences.getState().images).toEqual([])
})

it('records add, a complete gesture, mirror, lock, reset and delete in the normal timeline', () => {
  const refs = useCanvasReferences.getState()
  const workspace = useWorkspace.getState()
  const session = workspace.sessions[0]
  const revision = session.revision
  const pixels = session.document.layers[0].pixels.slice()
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
  expect(session.document.dirty).toBe(true)
  expect(session.document.layers[0].pixels).toEqual(pixels)
  expect(session.document.canvasReferences).toEqual([])
  expect(session.revision).toBe(revision)
  expect(session.layersPanelRevision).toBeGreaterThan(0)
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

const embeddedSource = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='

it.each([
  { floating: false, asynchronous: false }, { floating: true, asynchronous: false },
  { floating: false, asynchronous: true }, { floating: true, asynchronous: true }
])('restores placement, source and controls after reopening (floating=$floating, async=$asynchronous)', async ({ floating, asynchronous }) => {
  const refs = useCanvasReferences.getState()
  const project = useWorkspace.getState().sessions[0].document
  refs.add({ ...image, src: embeddedSource, floating })
  refs.update('ref', { x: -42.5, y: 73, angle: 37, width: 60, flipY: true, opacity: 0.4 })
  refs.update('ref', { locked: true })
  const saved = project.canvasReferences
  expect(saved![0]).not.toHaveProperty('documentId')
  const archive = asynchronous ? await encodeProjectAsync(project, { includePreview: false }) : encodeProject(project, { includePreview: false })
  useWorkspace.setState({ sessions: [], activeId: null })
  expect(useCanvasReferences.getState().images).toEqual([])
  const reopened = decodeProject(archive)
  useWorkspace.getState().addSession(reopened)
  expect(reopened.dirty).toBe(false)
  expect(reopened.canvasReferences).toEqual(saved)
  expect(useCanvasReferences.getState().images).toEqual(saved!.map(item => ({ ...item, documentId: reopened.id })))
})

it('persists committed gestures, undo, redo, order and deletion without saving a cancelled preview', () => {
  const refs = useCanvasReferences.getState()
  const project = useWorkspace.getState().sessions[0].document
  refs.add({ ...image, src: embeddedSource })
  refs.add({ ...image, id: 'second', src: embeddedSource })
  const saved = project.canvasReferences
  refs.begin('ref'); refs.update('ref', { x: 123 }); refs.finish(true)
  expect(project.canvasReferences).toBe(saved)
  refs.bringToFront('ref')
  expect(decodeProject(encodeProject(project, { includePreview: false })).canvasReferences!.map(item => item.id)).toEqual(['second', 'ref'])
  refs.remove('ref')
  expect(project.canvasReferences!.map(item => item.id)).toEqual(['second'])
  useWorkspace.getState().undo()
  expect(project.canvasReferences!.map(item => item.id)).toEqual(['second', 'ref'])
  useWorkspace.getState().redo()
  expect(decodeProject(encodeProject(project, { includePreview: false })).canvasReferences!.map(item => item.id)).toEqual(['second'])
})
