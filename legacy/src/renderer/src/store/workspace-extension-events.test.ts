import { useWorkspace } from './workspace'
import { describe, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { sessionFromDocument } from './workspace-session'
import { editorEventSnapshot, changedEditorEvents } from './workspace-extension-events'
import { publishEditorEvent } from '@/core/extension-editor-events'
import { registerExtensionRuntime } from '@/core/extension-runtime'

describe('generic extension editor events', () => {
 it('observes mutable session changes without retaining mutable scalar state', () => {
  const session = sessionFromDocument(createDocument('test', 2, 2, 'rgba'))
  const before = editorEventSnapshot([session], session.document.id)
  session.tool = 'eraser'; session.animationPlaying = true; session.contentRevision++
  session.selection = {x:0,y:0,width:1,height:1}
  const events = changedEditorEvents(before, editorEventSnapshot([session], session.document.id))
  expect(events.map(event => event.type === 'editor-event' && event.name)).toEqual(expect.arrayContaining(['tool.changed','animation.started','document.changed','selection.created']))
  expect(events.find(event => event.type === 'editor-event' && event.name === 'tool.changed')).toMatchObject({detail:{tool:'eraser'}})
  expect(JSON.stringify(events)).not.toContain('pixels')
  expect(changedEditorEvents(editorEventSnapshot([session],session.document.id),editorEventSnapshot([session],session.document.id))).toEqual([])
 })
 it('distinguishes lifecycle events and excludes projects already open at subscription time', () => {
  const session = sessionFromDocument(createDocument('test', 2, 2, 'rgba'))
  const empty = editorEventSnapshot([],null)
  expect(changedEditorEvents(empty,editorEventSnapshot([session],session.document.id))).toEqual(expect.arrayContaining([expect.objectContaining({name:'project.created'})]))
  session.document.filePath = 'private/path.moonsprite'
  const events = changedEditorEvents(empty,editorEventSnapshot([session],session.document.id))
  expect(events).toEqual(expect.arrayContaining([expect.objectContaining({name:'project.opened'})]))
  expect(JSON.stringify(events)).not.toContain('private')
  expect(changedEditorEvents(editorEventSnapshot([session],session.document.id),empty)).toEqual([expect.objectContaining({name:'project.closed'})])
 })
 it('publishes successful operation metadata through the existing runtime registry', () => {
  const receive = vi.fn(), remove = registerExtensionRuntime('events-test',receive)
  publishEditorEvent('history.undo','project')
  expect(receive).toHaveBeenCalledWith(expect.objectContaining({type:'editor-event',name:'history.undo',projectId:'project'}))
  remove(); receive.mockClear(); publishEditorEvent('history.redo','project'); expect(receive).not.toHaveBeenCalled()
 })
})


it('reports real foreground fill, undo and redo, but not empty history actions', () => {
 localStorage.clear()
 useWorkspace.setState({sessions:[],activeId:null})
 const receive = vi.fn(),remove=registerExtensionRuntime('operation-test',receive)
 try {
  const state=useWorkspace.getState()
  state.addSession(createDocument('events',2,2,'rgba'))
  state.undo();state.redo()
  expect(receive).not.toHaveBeenCalled()
  state.fillForeground()
  expect(receive).toHaveBeenCalledWith(expect.objectContaining({name:'fill.completed'}))
  state.undo();state.redo()
  expect(receive).toHaveBeenCalledWith(expect.objectContaining({name:'history.undo'}))
  expect(receive).toHaveBeenCalledWith(expect.objectContaining({name:'history.redo'}))
 } finally {remove();useWorkspace.setState({sessions:[],activeId:null})}
})
