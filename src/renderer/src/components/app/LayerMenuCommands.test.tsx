import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer } from '@/core/document'
import { useWorkspace } from '@/store/workspace'
import { DEFAULT_SHORTCUTS } from '@/core/shortcuts'
import { LayerMenuCommands } from './LayerMenuCommands'

vi.mock('@/components/I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null, layerStyleClipboard: null })
})
afterEach(cleanup)

const openMenu = () => {
  const closeMenu = vi.fn(), onPanelCommand = vi.fn()
  return { ...render(<LayerMenuCommands shortcutFor={id => DEFAULT_SHORTCUTS[id]} closeMenu={closeMenu} onPanelCommand={onPanelCommand} />), closeMenu, onPanelCommand }
}

it('disables document commands without a project', () => {
  const view = openMenu()
  for (const button of view.getAllByRole('button')) expect(button).toBeDisabled()
})

it('uses the existing panel dialog route and reflects selection changes while open', () => {
  useWorkspace.getState().addSession(createDocument('Layer menu', 2, 2, 'rgba'))
  const view = openMenu()
  fireEvent.click(view.getByText('layers.newTilemap'))
  expect(view.onPanelCommand).toHaveBeenCalledWith('newTilemapLayer')
  fireEvent.click(view.getByText('layers.properties'))
  expect(view.onPanelCommand).toHaveBeenLastCalledWith('openLayerProperties')
  expect(view.closeMenu).toHaveBeenCalledTimes(2)
  expect(view.getByText('layers.pasteLayerStyle').closest('button')).toBeDisabled()
  expect(view.getByText('layers.convertToRaster').closest('button')).toBeDisabled()
  expect(view.getByText('app.menu.layer.mergeDown').closest('button')).toBeDisabled()
  act(() => useWorkspace.getState().createLayerGroup())
  expect(view.getByText('layers.convertToBackground').closest('button')).toBeDisabled()
  expect(view.getByText('app.menu.layer.ungroup').closest('button')).toBeEnabled()
  expect(view.getByText('layers.duplicate').closest('button')).toBeEnabled()
})

it('duplicates the selected group and deletes only that duplicate through store commands', () => {
  const document = createDocument('Group menu', 2, 2, 'rgba')
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().createLayerGroup()
  const original = useWorkspace.getState().sessions[0].document.groups[0].id
  const view = openMenu()
  fireEvent.click(view.getByText('layers.duplicate'))
  expect(useWorkspace.getState().sessions[0].document.groups).toHaveLength(2)
  fireEvent.click(view.getByText('common.delete'))
  expect(useWorkspace.getState().sessions[0].document.groups.map(group => group.id)).toEqual([original])
  act(() => useWorkspace.getState().undo())
  expect(useWorkspace.getState().sessions[0].document.groups).toHaveLength(2)
})

it('keeps multi-selection operations enabled but disables single-layer conversions', () => {
  const document = createDocument('Multi menu', 2, 2, 'rgba')
  const second = createLayer('Second', 2, 2, 'rgba')
  document.layers.push(second)
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().selectLayer(second.id, true)
  const view = openMenu()
  expect(view.getByText('app.menu.layer.mergeSelected').closest('button')).toBeEnabled()
  expect(view.getByText('layers.duplicate').closest('button')).toBeEnabled()
  expect(view.getByText('layers.createLinkedLayer').closest('button')).toBeDisabled()
  expect(view.getByText('layers.convertToBackground').closest('button')).toBeDisabled()
})

it('does not offer merge down across group boundaries', () => {
  const document = createDocument('Group boundary', 2, 2, 'rgba')
  const second = createLayer('Grouped', 2, 2, 'rgba')
  document.layers.push(second)
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().selectLayer(second.id)
  useWorkspace.getState().createLayerGroup()
  useWorkspace.getState().selectLayer(second.id)
  const view = openMenu()
  expect(view.getByText('app.menu.layer.mergeDown').closest('button')).toBeDisabled()
})
