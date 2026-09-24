import { createRef } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { LayerPropertyEditor, type LayerPropertyEditorHandle } from './LayerPropertyEditor'

afterEach(() => { cleanup(); vi.restoreAllMocks(); useWorkspace.setState({ sessions: [], activeId: null }) })

it.each(['close', 'unmount'] as const)('coalesces dialog slider previews and preserves the final value on %s', finish => {
  const document = createDocument('property slider', 8, 8, 'rgba')
  useWorkspace.getState().addSession(document)
  const layer = document.layers[0], callbacks = new Map<number, FrameRequestCallback>()
  let frameId = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.set(++frameId, callback); return frameId })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id) })
  const ref = createRef<LayerPropertyEditorHandle>()
  const view = render(<LayerPropertyEditor ref={ref} documentId={document.id} layerDisplayColorPresets={[]} />)
  act(() => ref.current!.open([{ id: layer.id, kind: 'layer' }]))
  const slider = view.getByRole('slider')
  const session = () => useWorkspace.getState().sessions[0]
  const revision = session().contentRevision, history = session().history.position
  fireEvent.pointerDown(slider, { button: 0, pointerId: 1 })
  for (const value of ['90', '70', '50']) fireEvent.change(slider, { target: { value } })
  expect(slider).toHaveValue('50')
  expect(session().contentRevision).toBe(revision)
  act(() => { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(16)) })
  expect(layer.opacity).toBe(0.5)
  expect(session().contentRevision).toBe(revision + 1)
  fireEvent.change(slider, { target: { value: '40' } })
  fireEvent.pointerUp(window, { pointerId: 1 })
  expect(layer.opacity).toBe(0.4)
  expect(session().history.position).toBe(history)
  fireEvent.pointerDown(slider, { button: 0, pointerId: 2 })
  fireEvent.change(slider, { target: { value: '20' } })
  if (finish === 'close') {
    act(() => ref.current!.close())
    expect(layer.opacity).toBe(0.2)
    expect(session().history.position).toBe(history + 1)
    act(() => useWorkspace.getState().undo())
    expect(layer.opacity).toBe(1)
  } else {
    view.unmount()
    expect(layer.opacity).toBe(0.2)
    expect(session().history.position).toBe(history + 1)
  }
  expect(callbacks.size).toBe(0)
})
