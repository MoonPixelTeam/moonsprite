import { expect, it } from 'vitest'
import { createDocument, createLayer } from './document'
import { installRuntimeRaster, surfacePixelsMaterialized, runtimeRasterResidentBytes } from './runtime-raster'
import { createPreviewProjectedRenderer } from './preview-projected-renderer'

it('keeps visible and hidden sparse layers lazy while drawing a blended preview', () => {
  const doc = createDocument('sparse preview', 1024, 1024, 'rgba', false)
  const layer = doc.layers[0]
  layer.blendMode = 'multiply'
  layer.opacity = 0.5
  const hidden = createLayer('hidden', 1024, 1024, 'rgba')
  hidden.visible = false
  doc.layers.push(hidden)
  for (const surface of doc.layers) {
    const data = new Uint8Array(64 * 64 * 4)
    data.set([180, 80, 40, 200])
    const tileOffsets = new Int32Array(16 * 16)
    tileOffsets[0] = 1
    installRuntimeRaster(surface, { kind: 'sparse-tiles-v1', format: 'rgba', width: 1024, height: 1024, tileSize: 64, data, tileOffsets })
  }
  const before = runtimeRasterResidentBytes(doc)
  const render = createPreviewProjectedRenderer(doc)
  const output = new Uint8ClampedArray(8)
  render(new Int32Array([0, 900]), new Int32Array([0]), output)
  expect(Array.from(output)).toEqual([180, 80, 40, 100, 0, 0, 0, 0])
  expect(doc.layers.map(surfacePixelsMaterialized)).toEqual([false, false])
  expect(runtimeRasterResidentBytes(doc)).toBe(before)
  // Live edits must remain visible through the original storage identity.
  layer.runtimeRaster!.data[0] = 60
  render(new Int32Array([0, 900]), new Int32Array([0]), output)
  expect(output[0]).toBe(60)
})
