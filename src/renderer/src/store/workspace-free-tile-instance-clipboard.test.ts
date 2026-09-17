import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer } from '@/core/document'
import { ensureAnimationDocument, refreshActiveAnimationFrame } from '@/core/animation'
import { createBlankTileset, writeTilesetTilePixels } from '@/core/tilemap'
import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import { freeTileSourceRefs, renderFreeTileSurface } from '@/core/free-tile'
import { handleDocumentShortcuts } from '@/components/app/app-document-shortcuts'
import { handleSelectionShortcuts } from '@/components/app/app-selection-shortcuts'
import { clipboardService } from './clipboard-service'
import { useWorkspace } from './workspace'

afterEach(() => {
  useWorkspace.setState({ sessions: [], activeId: null })
  clipboardService.clearLayer(); clipboardService.clearSelection(); clipboardService.clearAnimation()
  vi.unstubAllGlobals()
})

const setup = () => {
  vi.stubGlobal('moonSprite', { ...window.moonSprite, readClipboardImage: vi.fn(async () => null) })
  const document = createDocument('instance copy', 32, 32, 'rgba', false)
  const layer = getActiveLayer(document), cel = ensureAnimationDocument(document).cels[0]
  const tileset = createBlankTileset('set', 'Source', 2, 2, 'tile', 1)
  writeTilesetTilePixels(tileset, 'tile', new Uint8ClampedArray(16).fill(255))
  document.tilesets = [tileset]
  layer.kind = 'free-tile'
  layer.freeTileSources = [{ id: 'source', name: 'Source', tilesetId: 'set', visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
  cel.freeTiles = { instances: [{ id: 'a', sourceId: 'source', x: 8, y: 7, rotation: 1, flipHorizontal: true, opacity: 0.5, blendMode: 'multiply' },
    { id: 'b', sourceId: 'source', x: 16, y: 17 }] }
  cel.surface = renderFreeTileSurface(cel.freeTiles, freeTileSourceRefs(layer.freeTileSources, document.tilesets), 'rgba', 32, 32)
  refreshActiveAnimationFrame(document)
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().selectFreeTileInstanceRow('a')
  return { document, layer, tileset, instances: () => activeFreeTileCelTarget(document)!.freeTiles.instances }
}

it('routes instance-list Ctrl+C ahead of pixel selections and pastes new IDs referencing the same source', async () => {
  const { document, layer, tileset, instances } = setup()
  const original = { ...instances()[0] }, pixels = tileset.pixels.slice()
  useWorkspace.getState().setSelection({ x: 0, y: 0, width: 20, height: 20 })
  // Row selection owns Ctrl+C even while an unrelated marquee exists.
  useWorkspace.getState().selectFreeTileInstanceRow('a')
  const session = useWorkspace.getState().sessions[0], selection = session.selection
  const context = { workspace: useWorkspace.getState(), session, commandScope: () => 'layers', selectionOverride: () => true,
    runCommand: (id: string, run: () => void) => { if (id !== 'copy') return false; run(); return true },
    matches: () => false, event: { preventDefault: vi.fn(), stopPropagation: vi.fn() }, uiCommands: {} }
  expect(handleSelectionShortcuts(context as unknown as Parameters<typeof handleSelectionShortcuts>[0])).toBe(false)
  expect(handleDocumentShortcuts(context as unknown as Parameters<typeof handleDocumentShortcuts>[0])).toBe(true)
  expect(session.selectedFreeTileInstanceId).toBe('a')
  expect(session.selection).toBe(selection)
  expect(clipboardService.getSelection()).toBeNull()
  expect(clipboardService.getLayers()!.layers).toHaveLength(0)
  await useWorkspace.getState().pasteClipboard()
  expect(instances()).toHaveLength(3)
  const pasted = instances()[2]
  expect(pasted).toEqual({ ...original, id: pasted.id })
  expect(pasted.id).not.toBe('a')
  expect(session.selectedFreeTileInstanceId).toBe(pasted.id)
  expect(document.layers).toHaveLength(1)
  expect(layer.freeTileSources).toHaveLength(1)
  expect(document.tilesets).toHaveLength(1)
  expect(tileset.pixels).toEqual(pixels)
  await useWorkspace.getState().pasteClipboard()
  expect(new Set(instances().map(instance => instance.id)).size).toBe(4)
  useWorkspace.getState().undo()
  expect(instances()).toHaveLength(3)
  useWorkspace.getState().undo()
  expect(instances()).toHaveLength(2)
  expect(instances()[0]).toEqual(original)
  useWorkspace.getState().redo()
  expect(instances()[2].id).toBe(pasted.id)
  expect(instances()[2].sourceId).toBe(original.sourceId)
})

it('copies all selected rows in stacking order and restores the selection on undo', async () => {
  const { instances } = setup()
  useWorkspace.getState().selectFreeTileInstanceRow('b', 'toggle')
  const originals = instances().map(instance => ({ ...instance }))
  expect(useWorkspace.getState().copyFreeTileInstances()).toBe(true)
  await useWorkspace.getState().pasteClipboard()
  expect(instances()).toHaveLength(4)
  expect(instances().slice(2).map(({ id: _id, ...data }) => data)).toEqual(originals.map(({ id: _id, ...data }) => data))
  expect(useWorkspace.getState().sessions[0].selectedFreeTileInstanceIds).toEqual(instances().slice(2).map(instance => instance.id))
  useWorkspace.getState().undo()
  expect(useWorkspace.getState().sessions[0].selectedFreeTileInstanceIds).toEqual(['a', 'b'])
})

it('imports source data when the destination belongs to another project', async () => {
  const source = setup()
  useWorkspace.getState().copyFreeTileInstances()
  const target = setup()
  await useWorkspace.getState().pasteClipboard()
  expect(source.instances()).toHaveLength(2)
  expect(target.instances()).toHaveLength(3)
  expect(target.instances()[2].sourceId).not.toBe('source')
  expect(target.layer.freeTileSources).toHaveLength(2)
  useWorkspace.getState().undo()
  expect(target.instances()).toHaveLength(2)
  expect(target.layer.freeTileSources).toHaveLength(1)
  useWorkspace.getState().redo()
  expect(target.instances()).toHaveLength(3)
})
