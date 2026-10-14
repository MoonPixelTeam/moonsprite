import { createRef } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/I18nProvider'
import { createDocument, createLayer } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { LayerPropertyEditor, type LayerPropertyEditorHandle } from './LayerPropertyEditor'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, dialog: null })
})
afterEach(() => { cleanup(); vi.useRealTimers(); useWorkspace.setState({ sessions: [], activeId: null }) })

const setup = () => {
  const document = createDocument('properties lifecycle', 4, 4, 'rgba')
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions[0]!
  const ref = createRef<LayerPropertyEditorHandle>()
  const view = render(<I18nProvider><LayerPropertyEditor ref={ref} documentId={document.id} layerDisplayColorPresets={[]} /></I18nProvider>)
  const target = { kind: 'layer' as const, id: document.activeLayerId }
  return { ref, view, target, session, layer: document.layers.find(layer => layer.id === target.id)! }
}

it('commits edited properties on unmount', () => {
  const {ref, view, target, session, layer} = setup()
  const history = session.history.revision
  act(() => ref.current!.open([target]))
  fireEvent.change(view.baseElement.querySelector<HTMLInputElement>('.layer-properties-body input[type="text"]')!, { target: {value: 'preview name'} })
  expect(layer.name).toBe('preview name')
  view.unmount()
  expect(layer.name).toBe('preview name')
  expect(session.history.revision).toBe(history + 1)
})

it('commits the old target before reopening', () => {
  const {ref, view, target, session, layer} = setup()
  const history = session.history.revision
  act(() => ref.current!.open([target]))
  const input = () => view.baseElement.querySelector<HTMLInputElement>('.layer-properties-body input[type="text"]')!
  fireEvent.change(input(), { target: {value: 'discarded'} })
  act(() => ref.current!.open([target]))
  expect(layer.name).toBe('discarded')
  fireEvent.change(input(), { target: {value: 'committed'} })
  act(() => ref.current!.close())
  expect(layer.name).toBe('committed')
  expect(session.history.revision).toBe(history + 2)
  act(() => useWorkspace.getState().undo())
  expect(layer.name).toBe('discarded')
})

it('preserves edits on both layers when selection changes before closing', () => {
  const { ref, view, target, session, layer } = setup()
  const second = createLayer('Second', 4, 4, 'rgba')
  session.document.layers.push(second)
  act(() => ref.current!.open([target]))
  const input = () => view.baseElement.querySelector<HTMLInputElement>('.layer-properties-body input[type="text"]')!
  fireEvent.change(input(), { target: { value: 'First edited' } })
  act(() => useWorkspace.getState().selectLayer(second.id))
  expect(layer.name).toBe('First edited')
  expect(input()).toHaveValue('Second')
  fireEvent.change(input(), { target: { value: 'Second edited' } })
  act(() => useWorkspace.getState().selectLayer(layer.id))
  act(() => ref.current!.close())
  expect(layer.name).toBe('First edited')
  expect(second.name).toBe('Second edited')
  act(() => useWorkspace.getState().undo())
  expect(second.name).toBe('Second')
  expect(layer.name).toBe('First edited')
  act(() => useWorkspace.getState().undo())
  expect(layer.name).not.toBe('First edited')
})
