import { afterEach, expect, it } from 'vitest'
import { createDocument, createLayer } from '@/core/document'
import { buildLayerPanelTree } from '@/core/layer-panel-layout'
import { useWorkspace } from './workspace'
afterEach(() => useWorkspace.setState({ sessions: [], activeId: null }))
it('restores exact nested group rows on merge undo and redo', () => {
  const doc = createDocument('group merge undo', 1, 1, 'rgba')
  doc.groups = ['parent', 'upper', 'middle', 'lower'].map((id, index) => ({ id, name: id, parentGroupId: index ? 'parent' : null, panelOrder: 4 - index, visible: true, locked: false, opacity: 1, blendMode: 'normal' }))
  doc.layers = ['upper', 'middle', 'lower'].map(id => { const layer = createLayer(id, 1, 1, 'rgba'); layer.groupId = id; return layer })
  doc.activeLayerId = doc.layers[0].id
  const store = useWorkspace.getState(); store.addSession(doc); store.selectGroup('middle')
  const before = buildLayerPanelTree(doc)
  store.mergeSelectedGroup()
  const after = buildLayerPanelTree(doc)
  expect(after.filter(row => row.depth === 1).map(row => row.kind === 'layer' ? 'merged' : row.id)).toEqual(['upper', 'merged', 'lower'])
  store.undo(); expect(buildLayerPanelTree(doc)).toEqual(before)
  store.redo(); expect(buildLayerPanelTree(doc)).toEqual(after)
})
