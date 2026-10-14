import { expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document'
import { createBlankTileset, writeTilesetTilePixels } from '@/core/tilemap'
import { createFreeTileSourceEditRaster, freeTileSourceSnapshotFromEditRaster } from '@/core/free-tile-edit'
import { growFreeTileStrokeRaster } from '@/core/free-tile-stroke-raster'
import { beginPixelEdit, revertPixelEdit } from '@/core/history'
import { paintLine } from '@/core/tools-brush'
import type { FreeTileInstanceTransform } from '@/core/free-tile'
import type { CanvasDragState } from '@/core/canvas-input-contracts'
import { sessionFromDocument } from '@/store/workspace-session'
import { createFreeTileEditCanvasInput } from './canvas-input-free-tile-edit'

const setup = (mode: 'rgba' | 'indexed', transform: FreeTileInstanceTransform = {}) => {
  const document = createDocument('long source stroke', 16, 16, mode, false)
  const tileset = createBlankTileset('set', 'source', 2, 3, 'tile', 1)
  const pixels = new Uint8ClampedArray(24)
  pixels.set([255, 0, 0, 255])
  writeTilesetTilePixels(tileset, 'tile', pixels)
  const source = { id: 'source', tileset, offsetX: 0, offsetY: 0, visible: true, opacity: 1, blendMode: 'normal' as const }
  const raster = createFreeTileSourceEditRaster(document, source, { x: 4, y: 4, width: 2, height: 3 }, undefined, transform)!
  const drag: CanvasDragState = {
    kind: 'free-tile-edit', start: { x: 8, y: 8 }, last: { x: 8, y: 8 },
    edit: beginPixelEdit(raster.layer.id), freeTileSourceId: 'source', freeTileSourceBefore: raster.before,
    freeTileEditDocument: raster.document, freeTileEditLayer: raster.layer,
    freeTileEditOrigin: raster.origin, freeTileEditSourceOffset: raster.sourceOffset,
    freeTileEditInstanceTransform: raster.instanceTransform, freeTileEditTransformedSourceBounds: raster.transformedSourceBounds
  }
  return { document, raster, drag }
}

const path = [{ x: 8, y: 8 }, { x: 170, y: 8 }, { x: 170, y: 170 }, { x: -180, y: 170 }, { x: -180, y: -180 }, { x: 8, y: 8 }]
const paint = (state: ReturnType<typeof setup>, size: number, alpha: number, grow: boolean) => {
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1], to = path[i]
    if (grow) growFreeTileStrokeRaster(state.drag, from, to, size)
    const { raster, drag } = state
    paintLine(raster.document, raster.layer, drag.edit!, from.x - raster.origin.x, from.y - raster.origin.y,
      to.x - raster.origin.x, to.y - raster.origin.y, size, { r: 30, g: 90, b: 150, a: alpha })
  }
}

const cases = (['rgba', 'indexed'] as const).flatMap(mode => ([0, 1, 2, 3] as const).flatMap(rotation =>
  [false, true].flatMap(flipHorizontal => [false, true].map(flipVertical => ({ mode, rotation, flipHorizontal, flipVertical })))))
const expectSnapshot = (actual: ReturnType<typeof freeTileSourceSnapshotFromEditRaster>, expected: typeof actual): void => {
  const { pixels: actualPixels, ...actualInfo } = actual
  const { pixels: expectedPixels, ...expectedInfo } = expected
  expect(actualInfo).toEqual(expectedInfo)
  expect(actualPixels.length === expectedPixels.length && actualPixels.every((value, i) => value === expectedPixels[i])).toBe(true)
}

it.each(cases)('preserves long strokes and revert: $mode rotation=$rotation flipH=$flipHorizontal flipV=$flipVertical', ({ mode, ...transform }) => {
  const actual = setup(mode, transform), reference = setup(mode, transform)
  const before = freeTileSourceSnapshotFromEditRaster(actual.raster)
  growFreeTileStrokeRaster(reference.drag, { x: -220, y: -220 }, { x: 220, y: 220 }, 1)
  paint(actual, 1, 128, true)
  paint(reference, 1, 128, false)
  const snapshot = freeTileSourceSnapshotFromEditRaster(actual.raster, actual.drag.edit!.dirtyRect)
  expectSnapshot(snapshot, freeTileSourceSnapshotFromEditRaster(reference.raster))
  expect(snapshot.width).toBeGreaterThan(340)
  expect(snapshot.height).toBeGreaterThan(340)
  revertPixelEdit(actual.raster.document, actual.drag.edit)
  expectSnapshot(freeTileSourceSnapshotFromEditRaster(actual.raster), before)
})

it('remaps compact large-brush records without losing earlier pixels or revert', () => {
  const actual = setup('rgba'), reference = setup('rgba')
  const before = freeTileSourceSnapshotFromEditRaster(actual.raster)
  growFreeTileStrokeRaster(reference.drag, { x: -300, y: -300 }, { x: 300, y: 300 }, 64)
  paint(actual, 64, 255, true)
  paint(reference, 64, 255, false)
  expect(actual.drag.edit!.points!.count).toBeGreaterThan(0)
  expect(freeTileSourceSnapshotFromEditRaster(actual.raster, actual.drag.edit!.dirtyRect)).toEqual(freeTileSourceSnapshotFromEditRaster(reference.raster))
  revertPixelEdit(actual.raster.document, actual.drag.edit)
  expect(freeTileSourceSnapshotFromEditRaster(actual.raster)).toEqual(before)
})

it('continues one pointer stroke through repeated left/up and right/down expansions', () => {
  const actual = setup('rgba'), reference = setup('rgba')
  const session = sessionFromDocument(actual.document)
  session.brushSize = 1
  const input = createFreeTileEditCanvasInput({
    localPointAt: (x: number, y: number) => ({ x, y }), compositeCacheRef: { current: { invalidateAll: vi.fn() } }, scheduleDraw: vi.fn()
  } as unknown as Parameters<typeof createFreeTileEditCanvasInput>[0])
  const previewFreeTileSource = vi.fn(() => true)
  for (let i = 1; i < path.length; i++) {
    const point = path[i]
    input.moveFreeTileEdit({
      drag: actual.drag, session, previousPoint: path[i - 1],
      pointerSamples: [{ clientX: point.x, clientY: point.y, timeStamp: i * 16, pointerType: 'mouse' }],
      event: { pointerType: 'mouse' }, brushDynamicsAt: () => ({ size: 1, opacityScale: 1, angle: 0, gradientAmount: null }),
      activeColor: () => ({ r: 30, g: 90, b: 150, a: 128 }), activeBrushTexture: 'solid', activeBrushImage: null,
      proceduralAntialiasStrength: 0, activeBrushPaintMode: 'paint', state: { previewFreeTileSource }
    } as unknown as Parameters<typeof input.moveFreeTileEdit>[0])
  }
  growFreeTileStrokeRaster(reference.drag, { x: -220, y: -220 }, { x: 220, y: 220 }, 1)
  paint(reference, 1, 128, false)
  expect(previewFreeTileSource).toHaveBeenCalledTimes(path.length - 1)
  expect(freeTileSourceSnapshotFromEditRaster(actual.raster, actual.drag.edit!.dirtyRect)).toEqual(freeTileSourceSnapshotFromEditRaster(reference.raster))
})

it('keeps selection and pattern anchored and reuses capacity inside the expanded area', () => {
  const { drag, raster } = setup('rgba')
  drag.freeTileEditSelection = { x: 24, y: 24, width: 1, height: 1, mask: new Uint8Array([1]) }
  drag.patternOrigin = { x: 24, y: 24 }
  drag.freeTileLastLocal = { x: 24, y: 24 }
  growFreeTileStrokeRaster(drag, { x: 8, y: 8 }, { x: -200, y: -200 }, 1)
  for (const point of [drag.freeTileEditSelection, drag.patternOrigin, drag.freeTileLastLocal]) {
    expect({ x: point.x + raster.origin.x, y: point.y + raster.origin.y }).toEqual({ x: 8, y: 8 })
  }
  const pixels = raster.layer.pixels
  growFreeTileStrokeRaster(drag, { x: -200, y: -200 }, { x: -210, y: -210 }, 1)
  expect(raster.layer.pixels).toBe(pixels)
})
