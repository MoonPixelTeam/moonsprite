import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, createLayerMask, getActiveLayer } from '@/core/document'
import { ensureAnimationDocument } from '@/core/animation'
import { useWorkspace } from '@/store/workspace'
import { LayersPanel } from './LayersPanel'
import { FreeTileInstanceLayers } from './FreeTileInstanceLayers'
import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import { createRef } from 'react'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('moonSprite', { getResourceInfo: vi.fn().mockResolvedValue({ totalBytes: 8e9, freeBytes: 4e9 }) })
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('inherits free-tile instance colors and restrictions while preserving source overrides', async () => {
  const document = createDocument('instance inheritance', 8, 8, 'rgba')
  useWorkspace.getState().addSession(document)
  await useWorkspace.getState().createFreeTileLayer({ name: 'Instances' })
  const target = activeFreeTileCelTarget(document)!
  const source = target.layer.freeTileSources![0]
  const placement = useWorkspace.getState().beginFreeTilePlacement()!
  placement.after.instances = [{ id: 'instance', sourceId: source.id, x: 0, y: 0 }]
  useWorkspace.getState().previewFreeTilePlacement(placement)
  useWorkspace.getState().commitFreeTilePlacement(placement, 'Place')
  const group = { id: 'instance-group', name: 'Group', visible: false, locked: true, opacity: 1, blendMode: 'normal' as const, displayColor: { r: 41, g: 121, b: 255, a: 255 } }
  document.groups.push(group)
  target.layer.groupId = group.id
  delete source.displayColor
  delete target.layer.displayColor
  const listRef = createRef<HTMLDivElement>()
  const view = render(<FreeTileInstanceLayers session={useWorkspace.getState().sessions[0]} layer={target.layer} listRef={listRef} />)
  const row = () => view.container.querySelector('[data-free-tile-instance-id="instance"]')!
  expect(row().querySelector('.layer-color-stripe')).toHaveStyle({ backgroundColor: 'rgb(41, 121, 255)' })
  expect(row().querySelector('.layer-visibility')).toHaveClass('group-visibility-inherited-hidden')
  expect(row().querySelector('.layer-lock-toggle')).toHaveClass('group-lock-inherited')
  group.visible = true
  group.locked = false
  source.displayColor = { r: 255, g: 0, b: 0, a: 255 }
  view.rerender(<FreeTileInstanceLayers session={useWorkspace.getState().sessions[0]} layer={target.layer} listRef={listRef} />)
  expect(row().querySelector('.layer-color-stripe')).toHaveStyle({ backgroundColor: 'rgb(255, 0, 0)' })
  expect(row().querySelector('.layer-visibility')).not.toHaveClass('group-visibility-inherited-hidden')
  expect(row().querySelector('.layer-lock-toggle')).not.toHaveClass('group-lock-inherited')
})

it.each(['ancestor', 'owner'] as const)('inherits mask stripes and restricted control states from its %s without changing mask settings', (restriction) => {
  const document = createDocument('nested mask colors', 2, 2, 'rgba')
  const layer = getActiveLayer(document)
  const root = { id: 'root', name: 'Root', visible: true, locked: false, opacity: 1, blendMode: 'normal' as const, displayColor: { r: 41, g: 121, b: 255, a: 255 } }
  const inner = { ...root, id: 'inner', name: 'Inner', parentGroupId: root.id, displayColor: { r: 0, g: 255, b: 0, a: 255 } }
  layer.groupId = inner.id
  layer.displayColor = { r: 255, g: 0, b: 0, a: 255 }
  document.groups.push(root, inner)
  const timeline = ensureAnimationDocument(document)
  const layerMask = createLayerMask(layer.id, 2, 2)
  const groupMask = createLayerMask(inner.id, 2, 2)
  timeline.layerMasks = [{ layerId: layer.id, frameId: timeline.activeFrameId, mask: layerMask }]
  timeline.groupMasks = [{ groupId: inner.id, frameId: timeline.activeFrameId, mask: groupMask }]
  useWorkspace.getState().addSession(document)
  const view = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  const maskRow = (id: string) => view.container.querySelector(`[data-layer-mask-row-owner="${id}"]`)!
  const stripes = (row: Element) => Array.from(row.querySelectorAll<HTMLElement>('.layer-color-stripe')).map(stripe => stripe.getAttribute('style'))
  expect(stripes(maskRow(layer.id))).toEqual(stripes(view.container.querySelector(`[data-layer-id="${layer.id}"]`)!))
  expect(stripes(maskRow(inner.id))).toEqual(stripes(view.container.querySelector(`[data-group-id="${inner.id}"]`)!))
  expect(stripes(maskRow(layer.id))).toHaveLength(3)
  expect(stripes(maskRow(inner.id))).toHaveLength(2)
  const restricted = restriction === 'ancestor' ? root : inner
  restricted.visible = false
  restricted.locked = true
  view.rerender(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  for (const id of [layer.id, inner.id]) {
    expect(maskRow(id).querySelector('.layer-visibility')).toHaveClass('group-visibility-inherited-hidden')
    expect(maskRow(id).querySelector('.layer-lock-toggle')).toHaveClass('group-lock-inherited')
    expect(maskRow(id).querySelector('.layer-visibility')).toHaveAttribute('aria-pressed', 'true')
    expect(maskRow(id).querySelector('.layer-lock-toggle')).toHaveAttribute('aria-pressed', 'false')
  }
  restricted.visible = true
  restricted.locked = false
  delete layer.displayColor
  inner.displayColor = root.displayColor
  view.rerender(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  for (const id of [layer.id, inner.id]) {
    expect(maskRow(id).querySelector('.layer-visibility')).not.toHaveClass('group-visibility-inherited-hidden')
    expect(maskRow(id).querySelector('.layer-lock-toggle')).not.toHaveClass('group-lock-inherited')
  }
  expect(stripes(maskRow(layer.id))).toEqual(stripes(view.container.querySelector(`[data-layer-id="${layer.id}"]`)!))
  expect(layerMask.visible).toBe(true)
  expect(layerMask.locked).not.toBe(true)
})
