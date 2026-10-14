import { bench, describe } from 'vitest'
import { createDocument } from './document'
import { createBlankTileset, writeTilesetTilePixels } from './tilemap'
import { createFreeTileSourceEditRaster, freeTileSourceSnapshotFromEditRaster } from './free-tile-edit'

// Isolate snapshot work on the same edit; exclude document creation and rendering.
const document = createDocument('source snapshot benchmark', 2048, 2048, 'rgba', false)
const tileset = createBlankTileset('set', 'source', 32, 32, 'tile', 1)
const pixels = new Uint8ClampedArray(32 * 32 * 4)
for (let offset = 0; offset < pixels.length; offset += 4) { pixels[offset] = 80; pixels[offset + 3] = 255 }
writeTilesetTilePixels(tileset, 'tile', pixels)
const edit = createFreeTileSourceEditRaster(document,
  { id: 'source', tileset, offsetX: 0, offsetY: 0, visible: true, opacity: 1, blendMode: 'normal' },
  { x: 1000, y: 1000, width: 32, height: 32 })!
const dirtyRect = { x: edit.sourceOffset.x, y: edit.sourceOffset.y, width: 32, height: 32 }

describe('32px source in a 2048px document', () => {
  bench('full temporary canvas scan', () => { freeTileSourceSnapshotFromEditRaster(edit) }, { time: 300, warmupTime: 100 })
  bench('bounded stroke scan', () => { freeTileSourceSnapshotFromEditRaster(edit, dirtyRect) }, { time: 300, warmupTime: 100 })
})
