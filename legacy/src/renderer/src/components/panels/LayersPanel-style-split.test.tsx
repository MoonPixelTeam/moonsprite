import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createDocument, getActiveLayer } from '@/core/document'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import { useWorkspace } from '@/store/workspace'
import { LayersPanel } from './LayersPanel'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, layerStyleClipboard: null, message: null, dialog: null })
})
afterEach(cleanup)

it('splits a styled layer into editable effect layers from its context menu', () => {
  const document = createDocument('split style menu', 2, 2, 'rgba')
  const source = getActiveLayer(document)
  source.name = '角色'
  source.layerStyles = createDefaultLayerStyles()
  source.layerStyles.shadow.enabled = true
  useWorkspace.getState().addSession(document)
  const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  fireEvent.contextMenu(container.querySelector(`[data-layer-id="${source.id}"]`)!, { clientX: 20, clientY: 20 })
  fireEvent.click(screen.getByRole('menuitem', { name: '拆分图层样式' }))
  expect(document.layers.map((layer) => layer.name)).toContain('角色-投影')
  expect(source.layerStyles).toBeUndefined()
  expect(screen.queryByRole('menuitem', { name: '拆分图层样式' })).toBeNull()
})

it('disables splitting when the layer has no enabled styles', () => {
  const document = createDocument('no effects', 2, 2, 'rgba')
  useWorkspace.getState().addSession(document)
  const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  fireEvent.contextMenu(container.querySelector(`[data-layer-id="${document.activeLayerId}"]`)!, { clientX: 20, clientY: 20 })
  expect(screen.getByRole('menuitem', { name: '拆分图层样式' })).toBeDisabled()
})
