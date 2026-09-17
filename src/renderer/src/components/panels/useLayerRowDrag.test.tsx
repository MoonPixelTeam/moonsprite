import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { I18nProvider } from '@/components/I18nProvider'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { useLayerRowDrag } from './useLayerRowDrag'

beforeEach(() => {localStorage.clear(); useWorkspace.setState({sessions: [], activeId: null})})
afterEach(() => {cleanup(); vi.restoreAllMocks(); useWorkspace.setState({sessions: [], activeId: null})})
const setup = () => {
  const doc=createDocument('row drag',4,4,'rgba')
  useWorkspace.getState().addSession(doc)
  const layer=doc.layers[0], list=document.createElement('div'), row=document.createElement('button')
  row.dataset.layerId=layer.id; list.append(row)
  list.getBoundingClientRect=() => new DOMRect(0,0,200,200)
  row.getBoundingClientRect=() => new DOMRect(0,30,200,30)
  const frames=new Map<number,FrameRequestCallback>(); let sequence=0
  vi.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{frames.set(++sequence,callback);return sequence})
  vi.spyOn(window,'cancelAnimationFrame').mockImplementation(id=>{frames.delete(id)})
  const hook=renderHook(()=>useLayerRowDrag({documentId:doc.id,listRef:{current:list},readRows:()=>[{kind:'layer',id:layer.id,depth:0,layer}],onClickSelectedRow:vi.fn()}),{wrapper:I18nProvider})
  const begin=()=>act(()=>hook.result.current.begin({clientX:20,clientY:40,ctrlKey:false,shiftKey:false,altKey:true,preventDefault:vi.fn()} as unknown as ReactPointerEvent<HTMLButtonElement>,{kind:'layer',id:layer.id}))
  const move=(y:number)=>act(()=>hook.result.current.pointerMove({clientX:20,clientY:y,altKey:true} as PointerEvent))
  return {...hook,doc,frames,begin,move}
}
it('pointer cancellation clears queued work without copying or reordering', () => {
  const {result,doc,frames,begin,move}=setup()
  const history=useWorkspace.getState().sessions[0].history.revision
  begin(); move(110); move(130)
  expect(frames.size).toBeGreaterThan(0)
  act(()=>result.current.finish({type:'pointercancel',clientX:20,clientY:130} as PointerEvent))
  expect(doc.layers).toHaveLength(1)
  expect(useWorkspace.getState().sessions[0].history.revision).toBe(history)
  expect(result.current.ghost).toBeNull()
  expect(frames.size).toBe(0)
})
it('copy then move stays one undoable transaction, even with a final queued move', () => {
  const {result,doc,frames,begin,move}=setup()
  const history=useWorkspace.getState().sessions[0].history.revision
  begin(); move(100); move(150)
  act(()=>result.current.finish({type:'pointerup',clientX:20,clientY:150} as PointerEvent))
  expect(doc.layers).toHaveLength(2)
  expect(useWorkspace.getState().sessions[0].history.revision).toBe(history+1)
  expect(frames.size).toBe(0)
  act(()=>useWorkspace.getState().undo())
  expect(doc.layers).toHaveLength(1)
})

it('does not apply a pending drag to a different active document', () => {
  const {result, doc, frames, begin, move} = setup()
  begin(); move(100); move(150)
  const next = createDocument('next document', 4, 4, 'rgba')
  act(() => useWorkspace.getState().addSession(next))
  act(() => result.current.finish({type: 'pointerup', clientX: 20, clientY: 150} as PointerEvent))
  expect(doc.layers).toHaveLength(1)
  expect(next.layers).toHaveLength(1)
  expect(frames.size).toBe(0)
  expect(result.current.ghost).toBeNull()
})
