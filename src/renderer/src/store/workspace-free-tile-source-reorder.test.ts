import { beforeEach, expect, it } from 'vitest'
import { createDocument, getActiveLayer } from '@/core/document'
import { useWorkspace } from './workspace'
beforeEach(() => { localStorage.clear(); useWorkspace.setState({ sessions: [], activeId: null }) })
it('reorders free tile sources with one undoable change without changing their identities', async () => {
  const document = createDocument('sources', 8, 8, 'rgba')
  const store = useWorkspace.getState()
  store.addSession(document)
  const layer = getActiveLayer(document)
  layer.kind = 'free-tile'
  layer.freeTileSetId = 'source-set'
  layer.freeTileSources = ['a', 'b', 'c'].map(id => ({ id, name: id, tilesetId: `tileset-${id}`, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }))
  const ids = layer.freeTileSources!.map(source => source.id)
  expect(store.reorderFreeTileSource(ids[0], ids[2])).toBe(true)
  expect(layer.freeTileSources!.map(source => source.id)).toEqual([ids[1], ids[2], ids[0]])
  store.undo()
  expect(layer.freeTileSources!.map(source => source.id)).toEqual(ids)
  store.redo()
  expect(layer.freeTileSources!.map(source => source.id)).toEqual([ids[1], ids[2], ids[0]])
})
