import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer, readLayerColorAt } from '@/core/document'
import { ensureAnimationDocument, refreshActiveAnimationFrame } from '@/core/animation'
import { createBlankTileset, writeTilesetTilePixels } from '@/core/tilemap'
import { freeTileSourceRefs, renderFreeTileSurface } from '@/core/free-tile'
import { captureFreeTileSourceSnapshot } from '@/core/free-tile-document'
import { useWorkspace } from './workspace'

afterEach(() => { useWorkspace.setState({ sessions: [], activeId: null }); vi.restoreAllMocks() })

it('does not publish unchanged previews, while changed sources update siblings and remain undoable', () => {
  const document = createDocument('preview', 12, 4, 'rgba', false)
  const layer = getActiveLayer(document)
  const timeline = ensureAnimationDocument(document)
  const tileset = createBlankTileset('set', 'source', 1, 1, 'tile', 1)
  const pixels = new Uint8ClampedArray([50, 20, 10, 255])
  writeTilesetTilePixels(tileset, 'tile', pixels)
  document.tilesets = [tileset]
  layer.kind = 'free-tile'
  layer.freeTileSources = [{ id: 'source', name: 'source', tilesetId: tileset.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
  const cel = timeline.cels[0]
  cel.freeTiles = { instances: [{ id: 'a', sourceId: 'source', x: 1, y: 1 }, { id: 'b', sourceId: 'source', x: 6, y: 1 }] }
  cel.surface = renderFreeTileSurface(cel.freeTiles, freeTileSourceRefs(layer.freeTileSources, document.tilesets), 'rgba', 12, 4)
  refreshActiveAnimationFrame(document)
  useWorkspace.getState().addSession(document)
  const before = captureFreeTileSourceSnapshot(document, 'source')!
  const published = vi.fn()
  const unsubscribe = useWorkspace.subscribe(published)
  try {
    expect(useWorkspace.getState().previewFreeTileSource('source', 1, 1, pixels, 0, 0)).toBe(false)
    expect(published).not.toHaveBeenCalled()
    const next = new Uint8ClampedArray(300 * 4)
    next.set([90, 40, 10, 255])
    const buffer = cel.surface!.pixels
    expect(useWorkspace.getState().previewFreeTileSource('source', 300, 1, next, 0, 0)).toBe(true)
    expect(published).toHaveBeenCalledTimes(1)
    expect(readLayerColorAt(document, layer, 1, 1).r).toBe(90)
    expect(readLayerColorAt(document, layer, 6, 1).r).toBe(90)
    const after = captureFreeTileSourceSnapshot(document, 'source')!
    useWorkspace.getState().commitFreeTileSourceEdit('source', before, after, 'source drawing')
    expect(cel.surface!.pixels).toBe(buffer)
    expect(useWorkspace.getState().sessions[0].contentInvalidation?.kind).toBe('region')
    useWorkspace.getState().undo()
    expect(tileset.tileWidth).toBe(1)
    expect(readLayerColorAt(document, layer, 6, 1).r).toBe(50)
    useWorkspace.getState().redo()
    expect(tileset.tileWidth).toBe(300)
    expect(readLayerColorAt(document, layer, 6, 1).r).toBe(90)
  } finally { unsubscribe() }
})
