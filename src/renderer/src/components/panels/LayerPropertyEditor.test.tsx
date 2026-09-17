import { createRef } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/I18nProvider'
import { createDocument } from '@/core/document-model'
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

it('owns preview rollback on unmount without creating undo history', () => {
  const {ref, view, target, session, layer} = setup()
  const name = layer.name, history = session.history.revision
  act(() => ref.current!.open([target]))
  fireEvent.change(view.baseElement.querySelector<HTMLInputElement>('.layer-properties-body input[type="text"]')!, { target: {value: 'preview name'} })
  expect(layer.name).toBe('preview name')
  view.unmount()
  expect(layer.name).toBe(name)
  expect(session.history.revision).toBe(history)
})

it('cancels an old preview before reopening and commits the final edit once', () => {
  const {ref, view, target, session, layer} = setup()
  const name = layer.name, history = session.history.revision
  act(() => ref.current!.open([target]))
  const input = () => view.baseElement.querySelector<HTMLInputElement>('.layer-properties-body input[type="text"]')!
  fireEvent.change(input(), { target: {value: 'discarded'} })
  act(() => ref.current!.open([target]))
  expect(layer.name).toBe(name)
  fireEvent.change(input(), { target: {value: 'committed'} })
  act(() => ref.current!.close())
  expect(layer.name).toBe('committed')
  expect(session.history.revision).toBe(history + 1)
  act(() => useWorkspace.getState().undo())
  expect(layer.name).toBe(name)
})
