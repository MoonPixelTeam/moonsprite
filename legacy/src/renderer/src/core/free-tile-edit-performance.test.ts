import { describe, expect, it } from 'vitest'
import { createDocument, readLayerColor, writeLayerColor } from './document'
import { createBlankTileset, writeTilesetTilePixels } from './tilemap'
import { createFreeTileSourceEditRaster, freeTileSourceSnapshotFromEditRaster } from './free-tile-edit'
import { freeTileInstanceInverseTransformPoint, type FreeTileInstanceTransform } from './free-tile'
import { beginPixelEdit, recordPixel } from './history'

const transforms: FreeTileInstanceTransform[] = [0, 1, 2, 3].flatMap(rotation => [false, true].flatMap(flipHorizontal =>
  [false, true].map(flipVertical => ({ rotation: rotation as 0 | 1 | 2 | 3, flipHorizontal, flipVertical }))))

const setup = (mode: 'rgba' | 'indexed', transform: FreeTileInstanceTransform) => {
  const document = createDocument('source bounds', 512, 512, mode, false)
  const tileset = createBlankTileset('set', 'source', 3, 2, 'tile', 1)
  const pixels = new Uint8ClampedArray(24)
  pixels.set([100, 50, 25, 255], 0)
  pixels.set([30, 90, 60, 128], 20)
  writeTilesetTilePixels(tileset, 'tile', pixels)
  const source = { id: 'source', tileset, offsetX: -2, offsetY: 3, visible: true, opacity: 1, blendMode: 'normal' as const }
  const raster = createFreeTileSourceEditRaster(document, source, { x: 200, y: 220, width: 3, height: 2 }, undefined, transform)!
  return { document, raster }
}

describe('bounded source snapshots', () => {
  it.each(['rgba', 'indexed'] as const)('matches full capture after growth and erasure for every orientation (%s)', (mode) => {
    for (const transform of transforms) {
      const { raster } = setup(mode, transform)
      const edit = beginPixelEdit(raster.layer.id)
      const x = raster.sourceOffset.x - 4, y = raster.sourceOffset.y - 2
      const index = y * raster.layer.width + x
      writeLayerColor(raster.document, raster.layer, index, { r: 70, g: 100, b: 200, a: 255 })
      // Include the entire stroke, not only its final dab.
      const dirty = { x, y, width: raster.transformedSourceBounds.width + 6, height: raster.transformedSourceBounds.height + 4 }
      const bounded = freeTileSourceSnapshotFromEditRaster(raster, dirty)
      expect(bounded).toEqual(freeTileSourceSnapshotFromEditRaster(raster))
      const canonical = freeTileInstanceInverseTransformPoint(transform,
        raster.transformedSourceBounds.x - 4, raster.transformedSourceBounds.y - 2)
      const offset = ((canonical.y - bounded.offsetY) * bounded.width + canonical.x - bounded.offsetX) * 4
      const expected = readLayerColor(raster.document, raster.layer, index)
      expect(bounded.pixels.slice(offset, offset + 4)).toEqual(new Uint8ClampedArray([expected.r, expected.g, expected.b, expected.a]))
      recordPixel(raster.document, raster.layer, edit, index, 0)
      expect(freeTileSourceSnapshotFromEditRaster(raster, dirty)).toEqual(freeTileSourceSnapshotFromEditRaster(raster))
      // Returned snapshots must remain independent of the live brush buffer.
      const stable = bounded.pixels.slice()
      writeLayerColor(raster.document, raster.layer, index, { r: 1, g: 2, b: 3, a: 255 })
      expect(bounded.pixels).toEqual(stable)
    }
  })

  it('returns the same empty source after erasing the complete original bounds', () => {
    const { raster } = setup('rgba', {})
    raster.layer.pixels.fill(0)
    const dirty = { x: raster.sourceOffset.x, y: raster.sourceOffset.y, width: 3, height: 2 }
    expect(freeTileSourceSnapshotFromEditRaster(raster, dirty)).toEqual(freeTileSourceSnapshotFromEditRaster(raster))
    expect(freeTileSourceSnapshotFromEditRaster(raster, dirty)).toMatchObject({ width: 1, height: 1, offsetX: 0, offsetY: 0 })
  })
})
