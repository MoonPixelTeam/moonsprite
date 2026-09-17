import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'
import { useCanvasEyedropperMagnifier } from './useCanvasEyedropperMagnifier'

beforeEach(() => { localStorage.clear(); useWorkspace.setState({sessions: [], activeId: null}) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); useWorkspace.setState({sessions: [], activeId: null}) })
const setup = () => {
  const doc = createDocument('lens lifecycle', 4, 4, 'rgba')
  useWorkspace.getState().addSession(doc)
  saveEditorPreferences({...loadEditorPreferences(), eyedropperMagnifierEnabled: false})
  const frames = new Map<number, FrameRequestCallback>(); let sequence = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {frames.set(++sequence, callback); return sequence})
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {frames.delete(id)})
  const hook = renderHook(() => useCanvasEyedropperMagnifier({documentId: doc.id, stageBounds: () => new DOMRect(0, 0, 100, 100), localContinuousPointAt: () => ({x: 1, y: 1}), readView: () => ({zoom: 1, rotation: 0, mirrored: false, mirroredVertical: false}), checkerboard: loadEditorPreferences().checkerboard}))
  return {...hook, frames, flush: () => act(() => {const callbacks=[...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0))})}
}
it('coalesces pointer samples and commits the latest color even when the lens is disabled', () => {
  const {result, frames, flush} = setup()
  const first={r: 12,g: 34,b: 56,a: 255}, last={r: 78,g: 90,b: 12,a: 255}
  act(() => { result.current.queueColor(first,false); result.current.preview(1,1,first); result.current.queueColor(last,false); result.current.preview(2,2,last) })
  expect(frames.size).toBe(1)
  flush()
  expect(useWorkspace.getState().sessions[0].primaryColor).toEqual(last)
})
it('flushes the final color before release hides the lens', () => {
  const {result, frames} = setup(), color={r: 17,g: 18,b: 19,a: 255}
  act(() => {result.current.queueColor(color,false); result.current.preview(1,1,color); result.current.flushColor(); result.current.hide()})
  expect(frames.size).toBe(0)
  expect(useWorkspace.getState().sessions[0].primaryColor).toEqual(color)
})
it('cancel and unmount discard pending color and scheduled drawing', () => {
  const {result, frames, unmount} = setup(), color={r: 21,g: 22,b: 23,a: 255}
  const original={...useWorkspace.getState().sessions[0].primaryColor}
  act(() => {result.current.queueColor(color,false); result.current.preview(1,1,color); result.current.cancelPendingColor(); result.current.hide()})
  expect(useWorkspace.getState().sessions[0].primaryColor).toEqual(original)
  act(() => {result.current.queueColor(color,false); result.current.preview(1,1,color)})
  unmount()
  expect(frames.size).toBe(0)
  expect(useWorkspace.getState().sessions[0].primaryColor).toEqual(original)
})
