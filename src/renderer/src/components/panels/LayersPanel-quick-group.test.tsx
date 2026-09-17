import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createDocument, createLayer, getActiveLayer } from '@/core/document'
import { useWorkspace } from '@/store/workspace'
import { LayersPanel } from './LayersPanel'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})
afterEach(cleanup)

function ConnectedPanel() {
  const session = useWorkspace(state => state.sessions[0] ?? null)
  return session ? <LayersPanel session={session} docked /> : null
}

it('groups every selected row from the quick action and restores the group with undo/redo', () => {
  const document = createDocument('Quick group', 2, 2, 'rgba')
  const first = getActiveLayer(document)
  const middle = createLayer('Not selected', 2, 2, 'rgba')
  const last = createLayer('Last', 2, 2, 'rgba')
  document.layers.push(middle, last)
  useWorkspace.getState().addSession(document)
  const { container } = render(<ConnectedPanel />)
  const select = (id: string, ctrlKey = false) => {
    const row = container.querySelector(`[data-layer-id="${id}"]`)!
    fireEvent.pointerDown(row, { button: 0, ctrlKey, clientX: 10, clientY: 20 })
    fireEvent.pointerUp(window, { clientX: 10, clientY: 20 })
  }
  select(first.id)
  select(last.id, true)
  expect(useWorkspace.getState().sessions[0].selectedLayerIds).toEqual([first.id, last.id])
  const groupButton = screen.getByRole('button', { name: '新建图层组' })
  // Include capture-phase pointerdown; click alone misses selection clearing.
  fireEvent.pointerDown(groupButton, { button: 0 })
  expect(useWorkspace.getState().sessions[0].selectedLayerIds).toEqual([first.id, last.id])
  fireEvent.pointerUp(groupButton, { button: 0 })
  fireEvent.click(groupButton)
  const current = () => useWorkspace.getState().sessions[0].document
  expect(current().groups).toHaveLength(1)
  const groupId = current().groups[0].id
  const groupOf = (id: string) => current().layers.find(layer => layer.id === id)?.groupId ?? null
  expect(groupOf(first.id)).toBe(groupId)
  expect(groupOf(last.id)).toBe(groupId)
  expect(groupOf(middle.id)).toBeNull()
  act(() => useWorkspace.getState().undo())
  expect(current().groups).toHaveLength(0)
  expect(groupOf(first.id)).toBeNull()
  expect(groupOf(last.id)).toBeNull()
  expect(current().layers.map(layer => layer.id)).toEqual([first.id, middle.id, last.id])
  act(() => useWorkspace.getState().redo())
  expect(groupOf(first.id)).toBe(groupId)
  expect(groupOf(last.id)).toBe(groupId)
  expect(groupOf(middle.id)).toBeNull()
})
