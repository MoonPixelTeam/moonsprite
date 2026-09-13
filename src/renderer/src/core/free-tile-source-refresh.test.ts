import { expect, it } from 'vitest'
import { createDocument, getActiveLayer, paletteColorIdForCanvas } from './document'
import { ensureAnimationDocument, refreshActiveAnimationFrame } from './animation'
import { applyFreeTileSourceSnapshot, captureFreeTileSourceSnapshot } from './free-tile-document'
import { createFreeTileSourceEditRaster } from './free-tile-edit'
import { createBlankTileset, writeTilesetTilePixels } from './tilemap'
import { freeTileSourceRefs, renderFreeTileSurface } from './free-tile'
import { decodeProject, encodeProject } from './project-format'

export const sourceFixture = (mode: 'rgba' | 'indexed' = 'rgba', width = 80, height = 70) => {
  const document = createDocument('source refresh', width, height, mode, false)
  const layer = getActiveLayer(document), timeline = ensureAnimationDocument(document)
  const tileset = createBlankTileset('set', 'source', 2, 2, 'tile', 1)
  writeTilesetTilePixels(tileset, 'tile', new Uint8ClampedArray([90, 50, 10, 255, 50, 30, 10, 128, 0, 0, 0, 0, 90, 50, 10, 255]))
  document.tilesets = [tileset]
  layer.kind = 'free-tile'
  layer.freeTileSources = [{ id: 'source', name: 'Source', tilesetId: 'set', visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
  const cel = timeline.cels[0]
  cel.freeTiles = { instances: [{ id: 'a', sourceId: 'source', x: 6, y: 6 }, { id: 'b', sourceId: 'source', x: 9, y: 8, rotation: 1, flipHorizontal: true, opacity: 0.6, blendMode: 'multiply' }] }
  cel.surface = renderFreeTileSurface(cel.freeTiles, freeTileSourceRefs(layer.freeTileSources, document.tilesets ?? []), mode, width, height, 0, 0, color => paletteColorIdForCanvas(document, color))
  refreshActiveAnimationFrame(document)
  return { document, layer, cel, tileset }
}

it.each(['rgba', 'indexed'] as const)('patches growth, shrink and erasure exactly like full rendering (%s)', mode => {
  const { document, layer, cel } = sourceFixture(mode)
  const originalBuffer = cel.surface!.pixels
  for (const [width, height, offsetX, offsetY, alpha] of [[5, 3, -2, -1, 128], [1, 1, 1, 1, 255], [1, 1, 0, 0, 0]]) {
    const pixels = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < pixels.length; i += 4) pixels.set([40, 100, 180, alpha], i)
    expect(applyFreeTileSourceSnapshot(document, { sourceId: 'source', tilesetId: 'set', width, height, pixels, offsetX, offsetY }, rect => {
      expect(rect!.width * rect!.height).toBeLessThan(200)
    })).toBe(true)
    const full = renderFreeTileSurface(cel.freeTiles!, freeTileSourceRefs(layer.freeTileSources, document.tilesets ?? []), mode, 80, 70, 0, 0, color => paletteColorIdForCanvas(document, color))
    expect(cel.surface!.pixels.length === full.pixels.length && cel.surface!.pixels.every((value, i) => value === full.pixels[i])).toBe(true)
    expect(cel.surface!.pixels).toBe(originalBuffer)
  }
})

it('keeps private brush allocation independent of the project canvas size', () => {
  const { document, layer } = sourceFixture('rgba', 3200, 1800)
  const sources = freeTileSourceRefs(layer.freeTileSources, document.tilesets ?? [])
  const edit = createFreeTileSourceEditRaster(document, sources[0], { x: 6, y: 6, width: 2, height: 2 }, { x: 7, y: 7 }, undefined, true)!
  expect(edit.layer.width * edit.layer.height).toBeLessThan(300 * 300)
  expect(edit.sourceOffset.x + edit.origin.x).toBe(6)
  expect(edit.sourceOffset.y + edit.origin.y).toBe(6)
})

it('accepts sources larger than 256px and preserves them across saving and reopening', () => {
  const { document } = sourceFixture('rgba', 640, 480)
  const width = 400, height = 300, pixels = new Uint8ClampedArray(width * height * 4)
  pixels.set([255, 0, 0, 255], ((height - 1) * width + width - 1) * 4)
  const snapshot = { sourceId: 'source', tilesetId: 'set', width, height, pixels, offsetX: -20, offsetY: -10 }
  expect(applyFreeTileSourceSnapshot(document, snapshot, () => {})).toBe(true)
  const reopened = decodeProject(encodeProject(document))
  const actual = captureFreeTileSourceSnapshot(reopened, 'source')!
  expect(actual.width).toBe(width)
  expect(actual.height).toBe(height)
  expect(actual.offsetX).toBe(-20)
  expect(actual.offsetY).toBe(-10)
  expect(actual.pixels.length === pixels.length && actual.pixels.every((value, i) => value === pixels[i])).toBe(true)
})
