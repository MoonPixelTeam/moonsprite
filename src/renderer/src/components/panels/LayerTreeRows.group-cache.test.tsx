import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer } from '@/core/document-model'
import { ensureAnimationDocument } from '@/core/animation'
import { layersPanelRenderKey } from '@/core/panel-render-keys'
import { useWorkspace } from '@/store/workspace'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import { LayersPanel } from './LayersPanel'
import * as singleRow from './LayerTreeRow'

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); useWorkspace.setState({sessions: [], activeId: null}) })

function fixture(styled = false) {
  localStorage.clear()
  const document = createDocument('group playback', 1, 1, 'rgba')
  document.layers.push(...Array.from({length: 41}, (_, i) => createLayer(`L${i}`, 1, 1, 'rgba')))
  document.groups = Array.from({length: 13}, (_, i) => ({id: `g${i}`, name: `G${i}`, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const}))
  if (styled) {
    document.groups[0].layerStyles = createDefaultLayerStyles()
    document.groups[0].layerStyles.stroke.enabled = true
  }
  document.layers.forEach((layer, i) => {layer.groupId = `g${i % 13}`})
  document.animation!.frames = Array.from({length: 297}, (_, i) => ({id: `f${i}`, duration: 100}))
  document.animation!.activeFrameId = 'f0'
  ensureAnimationDocument(document)
  useWorkspace.getState().addSession(document)
  function Panel() {
    useWorkspace(state => layersPanelRenderKey(state.sessions[0]))
    return <LayersPanel session={useWorkspace.getState().sessions[0]} docked />
  }
  return {document, Panel}
}

it('advances twelve frames in a 42-layer, 297-frame project without rendering unchanged group controls', () => {
  const {document, Panel} = fixture()
  useWorkspace.getState().setAnimationPlaying(true)
  const row = vi.spyOn(singleRow, 'LayerTreeRow')
  const view = render(<Panel />)
  expect(view.container.querySelectorAll('[data-group-id]')).toHaveLength(13)
  const history = useWorkspace.getState().sessions[0].history.position
  row.mockClear()
  for (let i = 0; i < 12; i++) act(() => useWorkspace.getState().advanceAnimationFrame())
  const groupRenders = row.mock.calls.filter(([{read}]) => {const {displayRow} = read(); return displayRow.kind === 'node' && displayRow.node.kind === 'group'})
  process.stdout.write(`13 group controls / 12 playback updates: ${groupRenders.length} renders\n`)
  expect(groupRenders).toHaveLength(0)
  expect(document.animation!.activeFrameId).toBe('f12')
  expect(useWorkspace.getState().sessions[0].history.position).toBe(history)
})

it('keeps opacity previews and cancellation live when a group element is reused', () => {
  const {document, Panel} = fixture()
  const view = render(<Panel />), group = document.groups[0]
  const store = useWorkspace.getState()
  const id = store.beginLayerPropertiesTransaction([{id: group.id, kind: 'group'}])!
  const values = {name: group.name, opacity: 0.4, blendMode: group.blendMode, cumulativeBlend: false, locked: false, displayColor: null, description: ''}
  act(() => store.previewLayerPropertiesTransaction(id, values, ['opacity']))
  expect(view.container.querySelector('[data-group-id="g0"]')).toHaveTextContent('40%')
  act(() => store.cancelLayerPropertiesTransaction(id))
  expect(view.container.querySelector('[data-group-id="g0"]')).toHaveTextContent('100%')
  expect(group.opacity).toBe(1)
})

it('retains the complete styled group rendering path during playback', () => {
  const {Panel} = fixture(true)
  useWorkspace.getState().setAnimationPlaying(true)
  const row = vi.spyOn(singleRow, 'LayerTreeRow')
  const view = render(<Panel />)
  row.mockClear()
  for (let i = 0; i < 4; i++) act(() => useWorkspace.getState().advanceAnimationFrame())
  const groupIds = row.mock.calls.flatMap(([{read}]) => {const {displayRow} = read(); return displayRow.kind === 'node' && displayRow.node.kind === 'group' ? [displayRow.node.group.id] : []})
  expect(groupIds).toEqual(['g0', 'g0', 'g0', 'g0'])
  expect(view.container.querySelector('[data-group-id="g0"] .layer-style-indicator')).not.toBeNull()
})

it('keeps cached group selection and collapse actions live after a different row becomes active', () => {
  const {document, Panel} = fixture()
  const view = render(<Panel />)
  const row = view.container.querySelector<HTMLElement>('[data-group-id="g0"]')!
  act(() => useWorkspace.getState().activateLayerForCanvas(document.layers[12].id))
  fireEvent.pointerDown(row, {button: 0, clientX: 10, clientY: 10})
  fireEvent.pointerUp(window, {clientX: 10, clientY: 10})
  expect(useWorkspace.getState().sessions[0].selectedGroupId).toBe('g0')
  const toggle = row.querySelector<HTMLElement>('.group-folder')!
  fireEvent.pointerDown(toggle, {button: 0})
  fireEvent.pointerUp(toggle, {button: 0})
  fireEvent.click(toggle)
  expect(useWorkspace.getState().sessions[0].collapsedGroupIds).toContain('g0')
  expect(view.container.querySelectorAll('[data-group-id="g0"]')).toHaveLength(1)
})
