import { afterEach, expect, it } from 'vitest'
import type { FreeTileInstance } from '@shared/types-tiles'
import { createDocument, getActiveLayer, readLayerColorAt } from '@/core/document'
import { ensureAnimationDocument, refreshActiveAnimationFrame } from '@/core/animation'
import { createBlankTileset, readTilesetTilePixels, writeTilesetTilePixels } from '@/core/tilemap'
import { activeFreeTileCelTarget, captureFreeTileSourceSnapshot } from '@/core/free-tile-document'
import { freeTileInstanceBounds, freeTileSourceRefs, renderFreeTileSurface } from '@/core/free-tile'
import { handleSelectionShortcuts } from '@/components/app/app-selection-shortcuts'
import { useWorkspace } from './workspace'

afterEach(() => useWorkspace.setState({ sessions: [], activeId: null }))

const setup = (orientation: Partial<FreeTileInstance> = {}, offsetX = 0, offsetY = 0) => {
  const document = createDocument('source flip', 32, 32, 'rgba', false)
  const layer = getActiveLayer(document), cel = ensureAnimationDocument(document).cels[0]
  const tileset = createBlankTileset('set', 'Source', 3, 2, 'tile', 1)
  writeTilesetTilePixels(tileset, 'tile', new Uint8ClampedArray([1, 2, 3, 4, 5, 6].flatMap(r => [r, 0, 0, 255])))
  document.tilesets = [tileset]
  layer.kind = 'free-tile'
  layer.freeTileSources = [{ id: 'source', name: 'Source', tilesetId: 'set', visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX, offsetY }]
  cel.freeTiles = { instances: [{ id: 'a', sourceId: 'source', x: 8, y: 7, ...orientation }, { id: 'b', sourceId: 'source', x: 20, y: 15 }] }
  cel.surface = renderFreeTileSurface(cel.freeTiles, freeTileSourceRefs(layer.freeTileSources, document.tilesets), 'rgba', 32, 32)
  refreshActiveAnimationFrame(document)
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().selectFreeTileInstanceRow('a')
  const target = () => activeFreeTileCelTarget(document)!
  const bounds = () => freeTileInstanceBounds(target().freeTiles.instances[0], target().sources, target().surface.offsetX, target().surface.offsetY)
  const sourcePixels = () => Array.from(readTilesetTilePixels(document.tilesets![0], 'tile')!).filter((_, index) => index % 4 === 0)
  const at = (x: number, y: number) => readLayerColorAt(document, layer, x, y).r
  return { document, layer, target, bounds, sourcePixels, at }
}

const shortcutFlip = (axis: 'horizontal' | 'vertical') => {
  const context = { workspace: useWorkspace.getState(), session: useWorkspace.getState().sessions[0],
    runCommand: () => false,
    matches: (id: string) => id === (axis === 'horizontal' ? 'flipHorizontal' : 'flipVertical'),
    event: { repeat: false, preventDefault() {}, stopPropagation() {} } }
  expect(handleSelectionShortcuts(context as unknown as Parameters<typeof handleSelectionShortcuts>[0])).toBe(true)
}

it.each(['horizontal', 'vertical'] as const)('Shift %s mirrors selected source pixels and shared instances with undo/redo', axis => {
  const { document, layer, target, sourcePixels, at } = setup()
  const instances = structuredClone(target().freeTiles.instances)
  const before = captureFreeTileSourceSnapshot(document, 'source')
  const selection = { x: 8, y: 7, width: 2, height: 2 }
  useWorkspace.getState().setSelection(selection)
  shortcutFlip(axis)
  const expected = axis === 'horizontal' ? [2, 1, 3, 5, 4, 6] : [4, 5, 3, 1, 2, 6]
  expect(sourcePixels()).toEqual(expected)
  expect(target().freeTiles.instances).toEqual(instances)
  for (const instance of instances) for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) {
    expect(at(instance.x + x, instance.y + y)).toBe(expected[y * 3 + x])
  }
  refreshActiveAnimationFrame(document)
  expect(at(8, 7)).toBe(expected[0])
  expect(layer.kind).toBe('free-tile')
  useWorkspace.getState().undo()
  expect(captureFreeTileSourceSnapshot(document, 'source')).toEqual(before)
  expect(at(20, 15)).toBe(1)
  expect(useWorkspace.getState().sessions[0].selection).toEqual(selection)
  useWorkspace.getState().redo()
  expect(sourcePixels()).toEqual(expected)
  expect(at(20, 15)).toBe(expected[0])
  expect(target().freeTiles.instances).toEqual(instances)
})

const orientations: Partial<FreeTileInstance>[] = [
  { rotation: 1 }, { rotation: 2, flipHorizontal: true },
  { rotation: 3, flipVertical: true }, { flipHorizontal: true, flipVertical: true }
]
it.each(orientations.flatMap(orientation => (['horizontal', 'vertical'] as const).map(axis => ({ orientation, axis }))))(
  'mirrors in canvas coordinates for $orientation / $axis with source offsets', ({ orientation, axis }) => {
    const { target, bounds, at, sourcePixels } = setup(orientation, 2, -1)
    const rect = bounds(), instances = structuredClone(target().freeTiles.instances)
    const before = Array.from({ length: rect.height }, (_, y) => Array.from({ length: rect.width }, (_, x) => at(rect.x + x, rect.y + y)))
    useWorkspace.getState().setSelection(rect)
    shortcutFlip(axis)
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
      expect(at(rect.x + x, rect.y + y)).toBe(before[axis === 'vertical' ? rect.height - y - 1 : y][axis === 'horizontal' ? rect.width - x - 1 : x])
    }
    expect(sourcePixels().slice().sort()).toEqual([1, 2, 3, 4, 5, 6])
    expect(target().freeTiles.instances).toEqual(instances)
    useWorkspace.getState().undo()
    expect(sourcePixels()).toEqual([1, 2, 3, 4, 5, 6])
  }
)

it('preserves transparent marquee padding through consecutive flips and restores an asymmetric mask', () => {
  const { document, at } = setup()
  const before = captureFreeTileSourceSnapshot(document, 'source')
  const selection = { x: 8, y: 7, width: 5, height: 2, mask: new Uint8Array([1, 1, 1, 1, 0, 1, 1, 1, 1, 1]) }
  useWorkspace.getState().setSelection(selection)
  shortcutFlip('horizontal')
  expect([0, 1, 2, 3, 4].map(x => at(8 + x, 7))).toEqual([0, 0, 3, 2, 1])
  expect(useWorkspace.getState().sessions[0].selection?.mask).toEqual(new Uint8Array([0, 1, 1, 1, 1, 1, 1, 1, 1, 1]))
  shortcutFlip('horizontal')
  expect(captureFreeTileSourceSnapshot(document, 'source')).toEqual(before)
  expect(useWorkspace.getState().sessions[0].selection).toEqual(selection)
  useWorkspace.getState().undo()
  expect(at(12, 7)).toBe(1)
  useWorkspace.getState().undo()
  expect(captureFreeTileSourceSnapshot(document, 'source')).toEqual(before)
  expect(useWorkspace.getState().sessions[0].selection).toEqual(selection)
})

it.each(['instance-lock', 'source-lock', 'layer-lock', 'no-instance', 'outside'] as const)('does not fall back to editing the composite for %s', mode => {
  const { document, layer, target, at } = setup()
  useWorkspace.getState().setSelection({ x: mode === 'outside' ? 0 : 8, y: 7, width: 3, height: 2 })
  if (mode === 'instance-lock') target().freeTiles.instances[0].locked = true
  if (mode === 'source-lock') layer.freeTileSources![0].locked = true
  if (mode === 'layer-lock') layer.locked = true
  if (mode === 'no-instance') useWorkspace.getState().sessions[0].selectedFreeTileInstanceId = null
  const before = captureFreeTileSourceSnapshot(document, 'source')
  shortcutFlip('horizontal')
  expect(captureFreeTileSourceSnapshot(document, 'source')).toEqual(before)
  expect(at(8, 7)).toBe(1)
  expect(at(20, 15)).toBe(1)
})
